import type { BfnFunctionalModule, BfnIdealEdge, BfnProject } from '../types';
import { areUnitsCompatible, isBfnUnit } from '../unitSystem';
import { resolveBfnPort, topologicalModuleOrder } from '../validation';
import type { BfnLocalInfluenceRequestV1 } from './interpretationTypes';
import { assessBfnLocalInfluenceRequest } from './interpretationValidation';
import type {
  BfnNetworkInfluenceAdmissionV1,
  BfnNetworkInfluenceIssueCodeV1,
  BfnNetworkInfluenceIssueV1,
  BfnNetworkInfluenceRequestV1,
  BfnResolvedNetworkInfluenceTargetV1,
} from './networkInfluenceTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function addIssue(
  issues: BfnNetworkInfluenceIssueV1[],
  code: BfnNetworkInfluenceIssueCodeV1,
  subjectId: string,
  details?: Record<string, string | number>,
): void {
  issues.push(
    Object.freeze({
      code,
      severity: 'error' as const,
      subjectId,
      ...(details ? { details: Object.freeze({ ...details }) } : {}),
    }),
  );
}

function finishAdmission(
  issues: readonly BfnNetworkInfluenceIssueV1[],
  target: BfnResolvedNetworkInfluenceTargetV1 | null,
): BfnNetworkInfluenceAdmissionV1 {
  return Object.freeze({
    status: issues.some((issue) => issue.severity === 'error') ? 'unsupported' : 'supported',
    issues: Object.freeze([...issues]),
    target,
  });
}

function activeAccumulator(module: BfnFunctionalModule): boolean {
  const dynamicId = module.activeModelIds.dynamic;
  return (
    typeof dynamicId === 'string' &&
    module.modelVariants.some(
      (model) =>
        model.id === dynamicId && model.mode === 'dynamic' && model.family === 'accumulator',
    )
  );
}

interface StructuralResolution {
  readonly target: BfnResolvedNetworkInfluenceTargetV1 | null;
  readonly issues: readonly BfnNetworkInfluenceIssueV1[];
}

function resolveNetworkTarget(project: BfnProject, outputMonitorId: string): StructuralResolution {
  const issues: BfnNetworkInfluenceIssueV1[] = [];
  if (
    !isRecord(project) ||
    !isRecord(project.network) ||
    !Array.isArray(project.network.inputSources) ||
    !Array.isArray(project.network.modules) ||
    !Array.isArray(project.network.outputMonitors) ||
    !Array.isArray(project.network.edges)
  ) {
    addIssue(issues, 'response_model_invalid', outputMonitorId, {
      reason: 'project_structure_invalid',
    });
    return { target: null, issues };
  }

  const monitorMatches = project.network.outputMonitors.filter(
    (monitor) => monitor.id === outputMonitorId,
  );
  if (monitorMatches.length === 0) {
    addIssue(issues, 'output_monitor_not_found', outputMonitorId);
    return { target: null, issues };
  }
  if (monitorMatches.length !== 1) {
    addIssue(issues, 'output_monitor_identity_conflict', outputMonitorId);
    return { target: null, issues };
  }
  const monitor = monitorMatches[0]!;
  if (
    !isRecord(monitor.inputPort) ||
    !isNonEmptyString(monitor.inputPort.id) ||
    monitor.inputPort.direction !== 'input' ||
    !isBfnUnit(monitor.inputPort.unit)
  ) {
    addIssue(issues, 'edge_endpoint_invalid', outputMonitorId, {
      reason: 'monitor_input_invalid',
    });
    return { target: null, issues };
  }

  const relevantSources = new Set<string>();
  const relevantModules = new Map<
    string,
    NonNullable<ReturnType<typeof assessBfnLocalInfluenceRequest>['target']>
  >();
  const relevantEdges = new Set<BfnIdealEdge>();
  const visitingModules = new Set<string>();
  const visitedModules = new Set<string>();

  const visitModule = (module: BfnFunctionalModule, outputPortId: string): void => {
    if (visitingModules.has(module.id)) {
      addIssue(issues, 'upstream_feedback_unsupported', module.id);
      return;
    }
    if (visitedModules.has(module.id)) return;

    const localRequest: BfnLocalInfluenceRequestV1 = {
      contractVersion: '1.0',
      scope: 'module_static_response',
      moduleId: module.id,
      outputPortId,
      operatingPoint: [],
    };
    const localAdmission = assessBfnLocalInfluenceRequest(project, localRequest);
    if (!localAdmission.target) {
      if (activeAccumulator(module)) {
        addIssue(issues, 'upstream_accumulator_unsupported', module.id);
      } else if (localAdmission.issues.some((issue) => issue.code === 'module_identity_conflict')) {
        addIssue(issues, 'module_identity_conflict', module.id);
      } else {
        addIssue(issues, 'response_model_invalid', module.id, {
          reason: localAdmission.issues[0]?.code ?? 'local_interpretation_unavailable',
        });
      }
      return;
    }

    visitingModules.add(module.id);
    relevantModules.set(module.id, localAdmission.target);
    for (const input of localAdmission.target.inputPorts) {
      visitRequiredInput(module.id, input.portId);
    }
    visitingModules.delete(module.id);
    visitedModules.add(module.id);
  };

  const visitSourceEndpoint = (edge: BfnIdealEdge): void => {
    if (!isRecord(edge) || edge.mapping !== 'identity') {
      addIssue(issues, 'edge_contract_invalid', edge?.id ?? 'edge', {
        reason: 'mapping_invalid',
      });
      return;
    }
    const sourceNodes = [
      ...project.network.inputSources.filter((source) => source.id === edge.source.nodeId),
      ...project.network.modules.filter((module) => module.id === edge.source.nodeId),
      ...project.network.outputMonitors.filter((candidate) => candidate.id === edge.source.nodeId),
    ];
    if (sourceNodes.length !== 1) {
      const sourceCount = project.network.inputSources.filter(
        (source) => source.id === edge.source.nodeId,
      ).length;
      const moduleCount = project.network.modules.filter(
        (module) => module.id === edge.source.nodeId,
      ).length;
      addIssue(
        issues,
        sourceCount > 1
          ? 'input_source_identity_conflict'
          : moduleCount > 1
            ? 'module_identity_conflict'
            : 'edge_endpoint_invalid',
        edge.source.nodeId,
      );
      return;
    }

    const sourcePort = resolveBfnPort(project, edge.source);
    const targetPort = resolveBfnPort(project, edge.target);
    if (
      !sourcePort ||
      !targetPort ||
      sourcePort.port.direction !== 'output' ||
      targetPort.port.direction !== 'input'
    ) {
      addIssue(issues, 'edge_endpoint_invalid', edge.id);
      return;
    }
    if (
      sourcePort.port.entity !== targetPort.port.entity ||
      sourcePort.port.quantityType !== targetPort.port.quantityType
    ) {
      addIssue(issues, 'edge_scientific_identity_mismatch', edge.id);
      return;
    }
    if (
      !isBfnUnit(sourcePort.port.unit) ||
      !isBfnUnit(targetPort.port.unit) ||
      !areUnitsCompatible(sourcePort.port.unit, targetPort.port.unit)
    ) {
      addIssue(issues, 'edge_unit_incompatible', edge.id);
      return;
    }

    relevantEdges.add(edge);
    if (sourcePort.nodeKind === 'input_source') {
      relevantSources.add(sourcePort.nodeId);
      return;
    }
    if (sourcePort.nodeKind !== 'functional_module') {
      addIssue(issues, 'edge_endpoint_invalid', edge.id, { reason: 'source_kind_invalid' });
      return;
    }
    const moduleMatches = project.network.modules.filter(
      (module) => module.id === sourcePort.nodeId,
    );
    if (moduleMatches.length !== 1) {
      addIssue(issues, 'module_identity_conflict', sourcePort.nodeId);
      return;
    }
    visitModule(moduleMatches[0]!, sourcePort.port.id);
  };

  function visitRequiredInput(nodeId: string, portId: string): void {
    const incoming = project.network.edges.filter(
      (edge) => edge.enabled && edge.target.nodeId === nodeId && edge.target.portId === portId,
    );
    if (incoming.length === 0) {
      addIssue(issues, 'required_input_unconnected', portId, { nodeId });
      return;
    }
    if (incoming.length !== 1) {
      for (const edge of incoming) {
        if (visitingModules.has(edge.source.nodeId)) {
          addIssue(issues, 'upstream_feedback_unsupported', edge.source.nodeId);
        }
      }
      addIssue(issues, 'required_input_ambiguous', portId, {
        nodeId,
        incomingCount: incoming.length,
      });
      return;
    }
    visitSourceEndpoint(incoming[0]!);
  }

  visitRequiredInput(monitor.id, monitor.inputPort.id);
  if (issues.some((issue) => issue.severity === 'error')) return { target: null, issues };

  const scopedModules = project.network.modules.filter((module) => relevantModules.has(module.id));
  const scopedEdges = project.network.edges.filter((edge) => relevantEdges.has(edge));
  let orderedModules: readonly BfnFunctionalModule[];
  try {
    orderedModules = topologicalModuleOrder({
      ...project,
      network: {
        ...project.network,
        inputSources: project.network.inputSources.filter((source) =>
          relevantSources.has(source.id),
        ),
        modules: scopedModules,
        outputMonitors: [monitor],
        edges: scopedEdges,
      },
    });
  } catch {
    addIssue(issues, 'upstream_feedback_unsupported', monitor.id);
    return { target: null, issues };
  }

  const inputSources = project.network.inputSources
    .filter((source) => relevantSources.has(source.id))
    .map((source) =>
      Object.freeze({
        inputSourceId: source.id,
        outputPortId: source.outputPort.id,
        unit: source.outputPort.unit,
      }),
    );
  const moduleTargets = orderedModules.map((module) => relevantModules.get(module.id)!);
  const target: BfnResolvedNetworkInfluenceTargetV1 = Object.freeze({
    contractVersion: '1.0',
    scope: 'network_static_output',
    outputMonitorId: monitor.id,
    outputPortId: monitor.inputPort.id,
    outputUnit: monitor.inputPort.unit,
    inputSources: Object.freeze(inputSources),
    moduleTargets: Object.freeze(moduleTargets),
    relevantEdgeIds: Object.freeze(scopedEdges.map((edge) => edge.id)),
    includesFirstOrderSteadyState: moduleTargets.some(
      (module) => module.interpretationBasis === 'first_order_steady_state_static_response',
    ),
    directTransmission: moduleTargets.length === 0,
  });
  return { target, issues };
}

function validateOperatingPoint(
  project: BfnProject,
  request: BfnNetworkInfluenceRequestV1,
  target: BfnResolvedNetworkInfluenceTargetV1,
  issues: BfnNetworkInfluenceIssueV1[],
): void {
  const requiredById = new Map(
    target.inputSources.map((source) => [source.inputSourceId, source] as const),
  );
  const projectSourceIds = new Set(project.network.inputSources.map((source) => source.id));
  const counts = new Map<string, number>();

  for (const [index, input] of request.operatingPoint.entries()) {
    if (!isRecord(input) || !isNonEmptyString(input.inputSourceId)) {
      addIssue(issues, 'input_source_invalid', `operatingPoint[${index}]`);
      continue;
    }
    const sourceId = input.inputSourceId;
    const count = (counts.get(sourceId) ?? 0) + 1;
    counts.set(sourceId, count);
    if (count > 1) {
      addIssue(issues, 'input_source_value_duplicate', sourceId);
      continue;
    }
    const required = requiredById.get(sourceId);
    if (!required) {
      addIssue(
        issues,
        projectSourceIds.has(sourceId) ? 'unexpected_input_source' : 'input_source_invalid',
        sourceId,
      );
      continue;
    }
    if (!isBfnUnit(input.unit) || input.unit !== required.unit) {
      addIssue(issues, 'unit_mismatch', sourceId, {
        expectedUnit: required.unit,
        actualUnit: typeof input.unit === 'string' ? input.unit : 'invalid',
      });
    }
    if (typeof input.value !== 'number' || !Number.isFinite(input.value)) {
      addIssue(issues, 'value_non_finite', sourceId);
    } else if (input.value < 0) {
      addIssue(issues, 'value_negative', sourceId);
    }
  }

  for (const source of target.inputSources) {
    if ((counts.get(source.inputSourceId) ?? 0) === 0) {
      addIssue(issues, 'input_source_value_missing', source.inputSourceId);
    }
  }
}

function assessNetworkInfluenceRequest(
  project: BfnProject,
  request: BfnNetworkInfluenceRequestV1,
): BfnNetworkInfluenceAdmissionV1 {
  const issues: BfnNetworkInfluenceIssueV1[] = [];
  if (
    !isRecord(request) ||
    request.contractVersion !== '1.0' ||
    request.scope !== 'network_static_output' ||
    !isNonEmptyString(request.outputMonitorId) ||
    !Array.isArray(request.operatingPoint)
  ) {
    addIssue(issues, 'request_contract_invalid', 'request');
    return finishAdmission(issues, null);
  }

  const structural = resolveNetworkTarget(project, request.outputMonitorId);
  issues.push(...structural.issues);
  if (!structural.target) return finishAdmission(issues, null);
  validateOperatingPoint(project, request, structural.target, issues);
  return finishAdmission(issues, structural.target);
}

/** Pure, target-scoped structural and external operating-point admission. */
export function assessBfnNetworkInfluenceRequest(
  project: BfnProject,
  request: BfnNetworkInfluenceRequestV1,
): BfnNetworkInfluenceAdmissionV1 {
  try {
    return assessNetworkInfluenceRequest(project, request);
  } catch {
    const issues: BfnNetworkInfluenceIssueV1[] = [];
    addIssue(issues, 'response_model_invalid', request?.outputMonitorId ?? 'request', {
      reason: 'unexpected_runtime_shape',
    });
    return finishAdmission(issues, null);
  }
}
