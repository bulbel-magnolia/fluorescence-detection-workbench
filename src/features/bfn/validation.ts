import type {
  BfnFunctionalModule,
  BfnIdealEdge,
  BfnIdealEdgeEndpoint,
  BfnPort,
  BfnProject,
  BfnValidationIssue,
} from './types';
import { BfnCatalogContractError, bfnCatalogReferencePresence } from './catalog/catalogBfnTypes';
import { verifyBfnCatalogModel } from './catalog/catalogBfnVerification';
import { resolveEffectiveBfnModel } from './modelResolution';
import { areUnitsCompatible, convertUnit } from './unitSystem';

export { activeModelForModule } from './modelResolution';

export interface BfnResolvedPort {
  nodeId: string;
  nodeKind: 'input_source' | 'functional_module' | 'output_monitor';
  port: BfnPort;
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

function contextForEndpoint(project: BfnProject, endpoint: BfnIdealEdgeEndpoint): string | null {
  const module = project.network.modules.find((candidate) => candidate.id === endpoint.nodeId);
  if (!module) return null;
  return resolveEffectiveBfnModel(project, module)?.contextId ?? null;
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
  if (sourcePort.port.direction !== 'output') {
    issues.push({ code: 'source_port_direction', severity: 'error', subjectId: source.portId });
  }
  if (targetPort.port.direction !== 'input') {
    issues.push({ code: 'target_port_direction', severity: 'error', subjectId: target.portId });
  }
  if (sourcePort.port.entity !== targetPort.port.entity) {
    issues.push({
      code: 'entity_mismatch',
      severity: 'error',
      subjectId: edgeId,
      details: { source: sourcePort.port.entity, target: targetPort.port.entity },
    });
  }
  if (sourcePort.port.quantityType !== targetPort.port.quantityType) {
    issues.push({
      code: 'quantity_mismatch',
      severity: 'error',
      subjectId: edgeId,
      details: { source: sourcePort.port.quantityType, target: targetPort.port.quantityType },
    });
  }
  if (!areUnitsCompatible(sourcePort.port.unit, targetPort.port.unit)) {
    issues.push({
      code: 'unit_dimension_mismatch',
      severity: 'error',
      subjectId: edgeId,
      details: { source: sourcePort.port.unit, target: targetPort.port.unit },
    });
  }
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
  const sourceContext = contextForEndpoint(project, source);
  const targetContext = contextForEndpoint(project, target);
  if (sourceContext && targetContext && sourceContext !== targetContext) {
    issues.push({
      code: 'context_mismatch',
      severity: 'warning',
      subjectId: edgeId,
      details: { source: sourceContext, target: targetContext },
    });
  }
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

export function validateBfnProject(project: BfnProject): BfnValidationIssue[] {
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
  for (const module of project.network.modules) {
    const model = resolveEffectiveBfnModel(project, module);
    const catalogBacked = model !== null && bfnCatalogReferencePresence(model).present;
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
        issues.push(
          catalogBacked
            ? {
                code: 'catalog_required_input_unconnected',
                severity: 'error',
                subjectId: port.id,
              }
            : {
                code: 'missing_required_input',
                severity: 'warning',
                subjectId: port.id,
              },
        );
      }
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
