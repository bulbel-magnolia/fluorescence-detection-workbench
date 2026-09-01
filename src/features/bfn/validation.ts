import type {
  BfnFunctionalModule,
  BfnIdealEdge,
  BfnIdealEdgeEndpoint,
  BfnModelVariant,
  BfnPort,
  BfnProject,
  BfnValidationIssue,
} from './types';
import { BfnCatalogContractError, bfnCatalogReferencePresence } from './catalog/catalogBfnTypes';
import { assessBfnAccumulatorRuntimeContract } from './accumulatorRuntimeContract';
import { verifyBfnCatalogModel } from './catalog/catalogBfnVerification';
import { assessBfnConnectionContextApplicability } from './compatibility/contextIntegration';
import {
  createBfnContextApplicabilityIssues,
  createBfnPortCompatibilityIssues,
} from './compatibility/validationIntegration';
import { resolveEffectiveBfnModel } from './modelResolution';
import { findBfnOutputReachableModuleIds } from './outputReachability';
import { assessBfnModelUncertainty } from './simulationUncertainty';
import { resolveBfnModuleTemporalCapability } from './temporal/temporalCapability';
import { convertUnit } from './unitSystem';

export { activeModelForModule } from './modelResolution';

export interface BfnResolvedPort {
  nodeId: string;
  nodeKind: 'input_source' | 'functional_module' | 'output_monitor';
  port: BfnPort;
}

export interface BfnProjectValidationOptions {
  readonly targetMonitorId?: string;
}

export function resolveBfnPort(
  project: BfnProject,
  endpoint: BfnIdealEdgeEndpoint,
): BfnResolvedPort | null {
  const source = project.network.inputSources.find((node) => node.id === endpoint.nodeId);
  if (source?.outputPort.id === endpoint.portId) {
    return { nodeId: source.id, nodeKind: source.kind, port: source.outputPort };
  }
  const module = project.network.modules.find((node) => node.id === endpoint.nodeId);
  if (module) {
    const port = [...module.inputPorts, ...module.outputPorts].find(
      (candidate) => candidate.id === endpoint.portId,
    );
    if (port) return { nodeId: module.id, nodeKind: module.kind, port };
  }
  const monitor = project.network.outputMonitors.find((node) => node.id === endpoint.nodeId);
  if (monitor?.inputPort.id === endpoint.portId) {
    return { nodeId: monitor.id, nodeKind: monitor.kind, port: monitor.inputPort };
  }
  return null;
}

function nodeExists(project: BfnProject, nodeId: string): boolean {
  return (
    project.network.inputSources.some((node) => node.id === nodeId) ||
    project.network.modules.some((node) => node.id === nodeId) ||
    project.network.outputMonitors.some((node) => node.id === nodeId)
  );
}

function hasDirectedCycle(edges: readonly BfnIdealEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges.filter((candidate) => candidate.enabled)) {
    const targets = adjacency.get(edge.source.nodeId) ?? [];
    targets.push(edge.target.nodeId);
    adjacency.set(edge.source.nodeId, targets);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return [...adjacency.keys()].some(visit);
}

export function checkIdealConnection(
  project: BfnProject,
  source: BfnIdealEdgeEndpoint,
  target: BfnIdealEdgeEndpoint,
  edgeId = 'draft-edge',
): BfnValidationIssue[] {
  const issues: BfnValidationIssue[] = [];
  if (!nodeExists(project, source.nodeId)) {
    issues.push({ code: 'missing_source_node', severity: 'error', subjectId: source.nodeId });
  }
  if (!nodeExists(project, target.nodeId)) {
    issues.push({ code: 'missing_target_node', severity: 'error', subjectId: target.nodeId });
  }
  if (source.nodeId === target.nodeId) {
    issues.push({ code: 'self_connection', severity: 'error', subjectId: source.nodeId });
  }
  const sourcePort = resolveBfnPort(project, source);
  const targetPort = resolveBfnPort(project, target);
  if (!sourcePort) {
    issues.push({ code: 'missing_source_port', severity: 'error', subjectId: source.portId });
  }
  if (!targetPort) {
    issues.push({ code: 'missing_target_port', severity: 'error', subjectId: target.portId });
  }
  if (!sourcePort || !targetPort) return issues;
  issues.push(...createBfnPortCompatibilityIssues(sourcePort.port, targetPort.port, edgeId));
  if (
    project.network.edges.some(
      (edge) =>
        edge.enabled &&
        edge.target.nodeId === target.nodeId &&
        edge.target.portId === target.portId,
    )
  ) {
    issues.push({ code: 'target_already_connected', severity: 'error', subjectId: target.portId });
  }
  if (
    project.network.edges.some(
      (edge) =>
        edge.source.nodeId === source.nodeId &&
        edge.source.portId === source.portId &&
        edge.target.nodeId === target.nodeId &&
        edge.target.portId === target.portId,
    )
  ) {
    issues.push({ code: 'duplicate_edge', severity: 'error', subjectId: edgeId });
  }
  const draft: BfnIdealEdge = { id: edgeId, source, target, mapping: 'identity', enabled: true };
  if (project.network.mode === 'static' && hasDirectedCycle([...project.network.edges, draft])) {
    issues.push({ code: 'static_cycle', severity: 'error', subjectId: edgeId });
  }
  issues.push(
    ...createBfnContextApplicabilityIssues(
      assessBfnConnectionContextApplicability(project, source, target),
      edgeId,
    ),
  );
  return issues;
}

export function addIdealConnection(
  project: BfnProject,
  source: BfnIdealEdgeEndpoint,
  target: BfnIdealEdgeEndpoint,
  edgeId: string,
): BfnProject {
  const issues = checkIdealConnection(project, source, target, edgeId);
  if (issues.some((issue) => issue.severity === 'error')) {
    throw new Error(`BFN_CONNECTION_REJECTED:${issues.map((issue) => issue.code).join(',')}`);
  }
  return {
    ...project,
    network: {
      ...project.network,
      edges: [
        ...project.network.edges,
        { id: edgeId, source, target, mapping: 'identity', enabled: true },
      ],
    },
  };
}

export function topologicalModuleOrder(project: BfnProject): BfnFunctionalModule[] {
  const modules = project.network.modules;
  const moduleIds = new Set(modules.map((module) => module.id));
  const indegree = new Map(modules.map((module) => [module.id, 0]));
  const adjacency = new Map<string, string[]>();
  for (const edge of project.network.edges.filter((candidate) => candidate.enabled)) {
    if (!moduleIds.has(edge.target.nodeId)) continue;
    if (moduleIds.has(edge.source.nodeId)) {
      indegree.set(edge.target.nodeId, (indegree.get(edge.target.nodeId) ?? 0) + 1);
    }
    const targets = adjacency.get(edge.source.nodeId) ?? [];
    targets.push(edge.target.nodeId);
    adjacency.set(edge.source.nodeId, targets);
  }
  const queue = modules.filter((module) => (indegree.get(module.id) ?? 0) === 0);
  const ordered: BfnFunctionalModule[] = [];
  while (queue.length) {
    const next = queue.shift();
    if (!next) break;
    ordered.push(next);
    for (const targetId of adjacency.get(next.id) ?? []) {
      const remaining = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, remaining);
      if (remaining === 0) {
        const target = modules.find((module) => module.id === targetId);
        if (target) queue.push(target);
      }
    }
  }
  if (ordered.length !== modules.length) throw new Error('BFN_STATIC_CYCLE');
  return ordered;
}

function validateInputSpecification(project: BfnProject): BfnValidationIssue[] {
  return project.network.inputSources.flatMap((source) => {
    const spec =
      project.network.mode === 'static' ? source.staticSpecification : source.dynamicSpecification;
    const invalid = (() => {
      switch (spec.type) {
        case 'fixed_value':
        case 'constant':
          return !Number.isFinite(spec.value) || spec.value < 0;
        case 'working_range':
          return (
            !Number.isFinite(spec.minimum) ||
            !Number.isFinite(spec.maximum) ||
            spec.minimum < 0 ||
            spec.maximum <= spec.minimum ||
            spec.points < 2 ||
            spec.points > 101
          );
        case 'step':
          return spec.before < 0 || spec.after < 0 || spec.atHours < 0;
        case 'pulse':
          return (
            spec.baseline < 0 ||
            spec.amplitude < 0 ||
            spec.startHours < 0 ||
            spec.durationHours <= 0
          );
        case 'periodic':
          return spec.baseline < 0 || spec.amplitude < 0 || spec.periodHours <= 0;
        case 'custom_time_series':
          return (
            spec.points.length < 2 ||
            spec.points.some(
              (point, index) =>
                point.timeHours < 0 ||
                point.value < 0 ||
                (index > 0 && point.timeHours <= spec.points[index - 1]!.timeHours),
            )
          );
      }
    })();
    return invalid
      ? [{ code: 'invalid_input_specification', severity: 'error', subjectId: source.id }]
      : [];
  });
}

function hasResolvedEnabledIncomingSignal(
  project: BfnProject,
  nodeId: string,
  portId: string,
): boolean {
  return project.network.edges.some((edge) => {
    if (!edge.enabled || edge.target.nodeId !== nodeId || edge.target.portId !== portId) {
      return false;
    }
    return resolveBfnPort(project, edge.source)?.port.direction === 'output';
  });
}

function modeledInputPortIds(model: BfnModelVariant | null): ReadonlySet<string> {
  if (!model) return new Set();
  if (model.mode === 'dynamic' && model.family === 'accumulator') {
    return new Set([model.inputPortId]);
  }
  const response = model.mode === 'dynamic' ? model.steadyStateResponse : model.response;
  return new Set(
    response.family === 'independent_inputs'
      ? response.terms.map((term) => term.inputPortId)
      : [response.inputPortId],
  );
}

type DynamicUserRuntimeContractReason =
  | 'family_invalid'
  | 'tau_missing'
  | 'tau_non_finite'
  | 'tau_non_positive'
  | 'tau_unit_invalid'
  | 'tau_interval_invalid'
  | 'initial_state_invalid'
  | 'paired_static_missing'
  | 'steady_state_response_mismatch'
  | 'time_range_invalid'
  | 'parameter_interval_incomplete';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function structuredValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structuredValuesEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && structuredValuesEqual(left[key], right[key]),
    )
  );
}

function dynamicUserRuntimeContractReason(
  project: BfnProject,
  module: BfnFunctionalModule,
  model: Extract<BfnModelVariant, { mode: 'dynamic' }>,
): DynamicUserRuntimeContractReason | null {
  if (model.family === 'accumulator') return null;
  if (model.family !== 'first_order') return 'family_invalid';

  const tau: unknown = model.tau;
  if (!isRecord(tau)) return 'tau_missing';
  if (typeof tau.value !== 'number' || !Number.isFinite(tau.value)) {
    return 'tau_non_finite';
  }
  if (tau.value <= 0) return 'tau_non_positive';
  if (tau.unit !== 'h') return 'tau_unit_invalid';
  if (tau.interval95 !== undefined) {
    const interval = tau.interval95;
    if (
      !Array.isArray(interval) ||
      interval.length !== 2 ||
      typeof interval[0] !== 'number' ||
      typeof interval[1] !== 'number' ||
      !Number.isFinite(interval[0]) ||
      !Number.isFinite(interval[1]) ||
      interval[0] <= 0 ||
      interval[0] > tau.value ||
      tau.value > interval[1]
    ) {
      return 'tau_interval_invalid';
    }
  }

  if (typeof model.initialState !== 'number' || !Number.isFinite(model.initialState)) {
    return 'initial_state_invalid';
  }

  const staticModelId = isRecord(module.activeModelIds) ? module.activeModelIds.static : undefined;
  const pairedStatic = Array.isArray(module.modelVariants)
    ? module.modelVariants.find(
        (candidate) =>
          isRecord(candidate) &&
          typeof staticModelId === 'string' &&
          candidate.id === staticModelId,
      )
    : undefined;
  if (!isRecord(pairedStatic) || pairedStatic.mode !== 'static') {
    return 'paired_static_missing';
  }
  if (!structuredValuesEqual(pairedStatic.response, model.steadyStateResponse)) {
    return 'steady_state_response_mismatch';
  }

  const validityDomain = project.registry.validityDomains.find(
    (candidate) => isRecord(candidate) && candidate.id === model.validityDomainId,
  );
  const timeRange: unknown = validityDomain?.timeRangeHours;
  if (
    timeRange !== undefined &&
    (!Array.isArray(timeRange) ||
      timeRange.length !== 2 ||
      typeof timeRange[0] !== 'number' ||
      typeof timeRange[1] !== 'number' ||
      !Number.isFinite(timeRange[0]) ||
      !Number.isFinite(timeRange[1]) ||
      timeRange[0] < 0 ||
      timeRange[1] <= timeRange[0])
  ) {
    return 'time_range_invalid';
  }

  if (
    model.uncertaintyMethod === 'parameter_interval_envelope' &&
    assessBfnModelUncertainty(model).reason === 'parameter_interval_incomplete'
  ) {
    return 'parameter_interval_incomplete';
  }
  return null;
}

/**
 * Finds directed cycles on one selected monitor's executable module path.
 * Effective accumulators and user-authored first-order models are stateful.
 * The current runtime has no feedback solver, so those cycles are rejected at
 * run-time admission while the graph itself remains persistable.
 */
function dynamicFeedbackValidationIssues(
  project: BfnProject,
  monitorId: string,
): BfnValidationIssue[] {
  const reachable = findBfnOutputReachableModuleIds(project, monitorId);
  const modulesById = new Map(
    project.network.modules.map((module) => [module.id, module] as const),
  );
  const executable = new Set(
    project.network.modules
      .filter((module) => reachable.has(module.id) && resolveEffectiveBfnModel(project, module))
      .map((module) => module.id),
  );
  if (executable.size === 0) return [];

  const adjacency = new Map<string, string[]>();
  for (const edge of project.network.edges) {
    if (
      !edge.enabled ||
      !executable.has(edge.source.nodeId) ||
      !executable.has(edge.target.nodeId)
    ) {
      continue;
    }
    const sourceModule = modulesById.get(edge.source.nodeId);
    const targetModule = modulesById.get(edge.target.nodeId);
    const sourcePort = sourceModule?.outputPorts.find((port) => port.id === edge.source.portId);
    const targetPort = targetModule?.inputPorts.find((port) => port.id === edge.target.portId);
    if (!sourcePort || !targetPort) continue;
    const targets = adjacency.get(edge.source.nodeId) ?? [];
    if (!targets.includes(edge.target.nodeId)) targets.push(edge.target.nodeId);
    adjacency.set(edge.source.nodeId, targets);
  }

  // Condense the executable graph into strongly connected components. A
  // back-edge DFS can miss a dynamic node when an SCC has already-visited
  // cross edges (for example A<->B plus A->C->B->A), so every unsupported
  // stateful module in a cyclic SCC is reported explicitly.
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (moduleId: string): void => {
    indices.set(moduleId, nextIndex);
    lowLinks.set(moduleId, nextIndex);
    nextIndex += 1;
    stack.push(moduleId);
    onStack.add(moduleId);

    for (const targetId of [...(adjacency.get(moduleId) ?? [])].sort()) {
      if (!indices.has(targetId)) {
        visit(targetId);
        lowLinks.set(moduleId, Math.min(lowLinks.get(moduleId)!, lowLinks.get(targetId)!));
      } else if (onStack.has(targetId)) {
        lowLinks.set(moduleId, Math.min(lowLinks.get(moduleId)!, indices.get(targetId)!));
      }
    }

    if (lowLinks.get(moduleId) !== indices.get(moduleId)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== moduleId);
    components.push(component.sort());
  };

  for (const moduleId of [...executable].sort()) {
    if (!indices.has(moduleId)) visit(moduleId);
  }

  const issues: BfnValidationIssue[] = [];
  for (const component of components
    .filter(
      (candidate) =>
        candidate.length > 1 || adjacency.get(candidate[0]!)?.includes(candidate[0]!) === true,
    )
    .sort((left, right) => left[0]!.localeCompare(right[0]!))) {
    const unsupportedStatefulModules = component
      .map((moduleId) => modulesById.get(moduleId))
      .filter((module): module is BfnFunctionalModule => module !== undefined)
      .filter((module) => {
        const model = resolveEffectiveBfnModel(project, module);
        return (
          (model?.mode === 'dynamic' && model.family === 'accumulator') ||
          (module.authoring?.origin === 'user_defined' &&
            model?.mode === 'dynamic' &&
            model.family === 'first_order')
        );
      })
      .map((module) => module.id)
      .sort();
    for (const subjectId of unsupportedStatefulModules) {
      issues.push({
        code: 'dynamic_feedback_unsupported',
        severity: 'error',
        subjectId,
        details: {
          monitorId,
          cycle: component.join(','),
        },
      });
    }
  }
  return issues;
}

function mixedDynamicOrderingValidationIssues(
  project: BfnProject,
  monitorId: string,
): BfnValidationIssue[] {
  const reachable = findBfnOutputReachableModuleIds(project, monitorId);
  const modulesById = new Map(
    project.network.modules.map((module) => [module.id, module] as const),
  );
  const adjacency = new Map<string, string[]>();
  for (const edge of project.network.edges) {
    if (!edge.enabled || !reachable.has(edge.source.nodeId) || !reachable.has(edge.target.nodeId)) {
      continue;
    }
    const targets = adjacency.get(edge.source.nodeId) ?? [];
    if (!targets.includes(edge.target.nodeId)) targets.push(edge.target.nodeId);
    adjacency.set(edge.source.nodeId, targets);
  }

  const issues: BfnValidationIssue[] = [];
  const accumulators = [...reachable]
    .map((moduleId) => modulesById.get(moduleId))
    .filter((module): module is BfnFunctionalModule => module !== undefined)
    .filter((module) => {
      const model = resolveEffectiveBfnModel(project, module);
      return model?.mode === 'dynamic' && model.family === 'accumulator';
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const accumulator of accumulators) {
    const visited = new Set<string>([accumulator.id]);
    const queue = [...(adjacency.get(accumulator.id) ?? [])].sort();
    while (queue.length > 0) {
      const moduleId = queue.shift();
      if (moduleId === undefined || visited.has(moduleId)) continue;
      visited.add(moduleId);
      const downstream = modulesById.get(moduleId);
      if (downstream) {
        const model = resolveEffectiveBfnModel(project, downstream);
        if (model?.mode === 'dynamic' && model.family === 'first_order') {
          issues.push({
            code: 'mixed_dynamic_process_ordering_unsupported',
            severity: 'error',
            subjectId: accumulator.id,
            details: { monitorId, downstreamModuleId: downstream.id },
          });
        }
      }
      for (const targetId of [...(adjacency.get(moduleId) ?? [])].sort()) {
        if (!visited.has(targetId)) queue.push(targetId);
      }
    }
  }
  return issues;
}

export function validateBfnProject(
  project: BfnProject,
  options: BfnProjectValidationOptions = {},
): BfnValidationIssue[] {
  const issues: BfnValidationIssue[] = [...validateInputSpecification(project)];
  for (const edge of project.network.edges) {
    if (!edge.enabled) continue;
    const withoutEdge: BfnProject = {
      ...project,
      network: {
        ...project.network,
        edges: project.network.edges.filter((candidate) => candidate.id !== edge.id),
      },
    };
    issues.push(...checkIdealConnection(withoutEdge, edge.source, edge.target, edge.id));
  }
  const outputReachableModuleIds = new Set<string>();
  for (const monitor of project.network.outputMonitors) {
    for (const moduleId of findBfnOutputReachableModuleIds(project, monitor.id)) {
      outputReachableModuleIds.add(moduleId);
    }
  }
  const targetMonitorId = project.network.outputMonitors.find(
    (monitor) => monitor.id === options.targetMonitorId,
  )?.id;
  const monitorIds =
    targetMonitorId === undefined
      ? project.network.outputMonitors.map((monitor) => monitor.id)
      : [targetMonitorId];
  for (const monitorId of [...new Set(monitorIds)]) {
    issues.push(...dynamicFeedbackValidationIssues(project, monitorId));
    issues.push(...mixedDynamicOrderingValidationIssues(project, monitorId));
  }
  const runtimeReachableModuleIds =
    targetMonitorId === undefined
      ? outputReachableModuleIds
      : findBfnOutputReachableModuleIds(project, targetMonitorId);
  for (const module of project.network.modules) {
    const model = resolveEffectiveBfnModel(project, module);
    if (
      runtimeReachableModuleIds.has(module.id) &&
      model?.mode === 'dynamic' &&
      model.family === 'accumulator'
    ) {
      const reason = assessBfnAccumulatorRuntimeContract(module, model);
      if (reason) {
        issues.push({
          code: 'accumulator_model_contract_invalid',
          severity: 'error',
          subjectId: module.id,
          details: { reason },
        });
      }
    }
    if (
      module.authoring?.origin === 'user_defined' &&
      runtimeReachableModuleIds.has(module.id) &&
      model?.mode === 'dynamic'
    ) {
      const reason = dynamicUserRuntimeContractReason(project, module, model);
      if (reason) {
        issues.push({
          code: 'dynamic_model_contract_invalid',
          severity: 'error',
          subjectId: module.id,
          details: { reason },
        });
      }
    }
    const catalogBacked = model !== null && bfnCatalogReferencePresence(model).present;
    const modeledInputs = modeledInputPortIds(model);
    if (!model) {
      issues.push({
        code: 'missing_required_input',
        severity: 'warning',
        subjectId: module.id,
        details: { mode: project.network.mode },
      });
    } else if (catalogBacked) {
      try {
        verifyBfnCatalogModel(project, module, model);
      } catch (error) {
        const code =
          error instanceof BfnCatalogContractError ? error.code : 'catalog_execution_unavailable';
        issues.push({ code, severity: 'error', subjectId: model.id });
      }
    }
    for (const port of module.inputPorts) {
      if (!hasResolvedEnabledIncomingSignal(project, module.id, port.id)) {
        const modeledRuntimeRequired =
          runtimeReachableModuleIds.has(module.id) &&
          modeledInputs.has(port.id) &&
          (module.authoring?.origin === 'user_defined' ||
            (model?.mode === 'dynamic' && model.family === 'accumulator'));
        issues.push(
          catalogBacked
            ? {
                code: 'catalog_required_input_unconnected',
                severity: 'error',
                subjectId: port.id,
              }
            : {
                code: 'missing_required_input',
                severity: modeledRuntimeRequired ? 'error' : 'warning',
                subjectId: port.id,
              },
        );
      }
    }
  }
  for (const module of project.network.modules) {
    if (
      outputReachableModuleIds.has(module.id) &&
      resolveBfnModuleTemporalCapability(project, module).executionMode === 'unsupported'
    ) {
      issues.push({
        code: 'temporal_execution_unsupported',
        severity: 'error',
        subjectId: module.id,
      });
    }
  }
  for (const monitor of project.network.outputMonitors) {
    if (!hasResolvedEnabledIncomingSignal(project, monitor.id, monitor.inputPort.id)) {
      issues.push({
        code: 'missing_required_input',
        severity: 'error',
        subjectId: monitor.inputPort.id,
      });
    }
  }
  return issues;
}

export function valueAcrossEdge(value: number, project: BfnProject, edge: BfnIdealEdge): number {
  const source = resolveBfnPort(project, edge.source);
  const target = resolveBfnPort(project, edge.target);
  if (!source || !target) throw new Error('BFN_EDGE_PORT_NOT_FOUND');
  return convertUnit(value, source.port.unit, target.port.unit);
}
