import type { HistoryRecord } from '../../domain/types';
import { isLiteratureCandidateReference } from './catalog/catalogReference';
import {
  evaluateReceiverResponse,
  isTrustedReceiverResponseBinding,
} from './receiverResponseEvaluator';
import type {
  CompatiblePortPair,
  ConcentrationInputBinding,
  DetectionRecordReference,
  LegacyReference,
  ModelConnectionIssue,
  ModelConnectionRequest,
  ModelEdge,
  ModelInputDirection,
  ModelInputPort,
  ModelNode,
  ModelNodeKind,
  ModelNodeParameters,
  ModelOutputPort,
  ModelParameterProvenance,
  ModelParameterStatus,
  ModelPortCapabilities,
  ModelTemplateId,
  NetworkModel,
  OutputBand,
  ReceiverResponseWorkingRange,
  SimulationResult,
  TemplateLabels,
} from './types';

export const MODELING_ENGINE_VERSION = 'BIONET-SIM-STEADY-STATE-2' as const;
export const MODELING_SIMULATION_DEFAULTS = Object.freeze({ maxIterations: 128, tolerance: 1e-6 });
export const MODELING_DISCLAIMER =
  'Illustrative normalized steady-state network simulation. Parameters and outputs are not experimentally validated.';

const MODEL_PORTS: Record<ModelNodeKind, ModelPortCapabilities> = {
  input: { input: false, output: true },
  processing: { input: true, output: true },
  output: { input: true, output: false },
};
const DEFAULT_PARAMETERS: ModelNodeParameters = {
  baseline: 0,
  gain: 1,
  parameterStatus: 'normalized-demo',
  provenance: 'development-fixture',
};
const DEMO_META = {
  parameterStatus: 'normalized-demo' as const,
  provenance: 'development-fixture' as const,
};

function createId(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}
function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
function nonNegative(value: number, fallback = 0): number {
  return Math.max(0, finite(value, fallback));
}
function parameters(
  baseline = 0,
  gain = 1,
  provenance: ModelParameterProvenance = 'development-fixture',
  parameterStatus: ModelParameterStatus = 'normalized-demo',
): ModelNodeParameters {
  return { baseline: clamp(baseline), gain: nonNegative(gain), parameterStatus, provenance };
}
function inputPort(
  id: string,
  signalId: string,
  sensitivity = 1,
  direction: ModelInputDirection = 'activation',
  metadata: Pick<ModelInputPort, 'parameterStatus' | 'provenance'> = DEMO_META,
): ModelInputPort {
  return { id, signalId, sensitivity: nonNegative(sensitivity), direction, ...metadata };
}
function outputPort(
  id: string,
  signalId: string,
  strength = 1,
  metadata: Pick<ModelOutputPort, 'parameterStatus' | 'provenance'> = DEMO_META,
): ModelOutputPort {
  return { id, signalId, strength: nonNegative(strength), ...metadata };
}
function node(
  id: string,
  name: string,
  kind: ModelNodeKind,
  x: number,
  y: number,
  options: {
    parameters?: ModelNodeParameters;
    inputPorts?: ModelInputPort[];
    outputPorts?: ModelOutputPort[];
  } = {},
): ModelNode {
  return {
    id,
    name,
    kind,
    x,
    y,
    parameters: options.parameters ?? { ...DEFAULT_PARAMETERS },
    inputPorts: options.inputPorts ?? [],
    outputPorts: options.outputPorts ?? [],
  };
}
function edge(
  id: string,
  source: string,
  sourcePortId: string,
  target: string,
  targetPortId: string,
  signalId: string,
  enabled = true,
): ModelEdge {
  return { id, source, sourcePortId, target, targetPortId, signalId, enabled };
}
function emptyModel(
  templateId: ModelTemplateId,
  labels: TemplateLabels,
  nodes: ModelNode[],
  edges: ModelEdge[],
  now: string,
): NetworkModel {
  return {
    schemaVersion: 2,
    id: createId('model'),
    templateId,
    name: labels.modelName,
    description: labels.description,
    nodes,
    edges,
    outputNodeId: 'reporter',
    thresholds: [0.35, 0.68],
    recordReference: null,
    legacyReference: null,
    updatedAt: now,
    isDemo: true,
  };
}

export function createTemplate(
  templateId: ModelTemplateId,
  labels: TemplateLabels,
  now = new Date().toISOString(),
): NetworkModel {
  const sensor = (id: string, name: string, x: number, y: number, value: number): ModelNode =>
    node(id, name, 'input', x, y, {
      parameters: parameters(value),
      outputPorts: [outputPort(`${id}-out`, `signal.${id}`)],
    });
  const reporter = node('reporter', labels.nodes.reporter, 'output', 760, 245, {
    inputPorts: [
      inputPort('reporter-in', templateId === 'signal-gate' ? 'signal.gate' : 'signal.response'),
    ],
  });
  if (templateId === 'signal-gate') {
    const a = sensor('sensor-a', labels.nodes.sensorA, 110, 145, 0.66);
    const b = sensor('sensor-b', labels.nodes.sensorB, 110, 335, 0.58);
    const gate = node('gate', labels.nodes.gate, 'processing', 355, 240, {
      parameters: parameters(0, 1.15),
      inputPorts: [
        inputPort('gate-in-a', 'signal.sensor-a', 0.9),
        inputPort('gate-in-b', 'signal.sensor-b', 0.9),
      ],
      outputPorts: [outputPort('gate-out', 'signal.gate')],
    });
    return emptyModel(
      templateId,
      labels,
      [a, b, gate, reporter],
      [
        edge(
          'edge-sensor-a-gate',
          'sensor-a',
          'sensor-a-out',
          'gate',
          'gate-in-a',
          'signal.sensor-a',
        ),
        edge(
          'edge-sensor-b-gate',
          'sensor-b',
          'sensor-b-out',
          'gate',
          'gate-in-b',
          'signal.sensor-b',
        ),
        edge('edge-gate-reporter', 'gate', 'gate-out', 'reporter', 'reporter-in', 'signal.gate'),
      ],
      now,
    );
  }
  if (templateId === 'feedback-loop') {
    const a = sensor('sensor-a', labels.nodes.sensorA, 100, 240, 0.7);
    const integration = node('integration', labels.nodes.integration, 'processing', 310, 240, {
      parameters: parameters(0, 1.05),
      inputPorts: [
        inputPort('integration-in-sensor', 'signal.sensor-a'),
        inputPort('integration-in-memory', 'signal.memory', 0.36),
      ],
      outputPorts: [
        outputPort('integration-out-memory', 'signal.integration-memory'),
        outputPort('integration-out-response', 'signal.integration-response'),
      ],
    });
    const memory = node('memory', labels.nodes.memory, 'processing', 500, 150, {
      parameters: parameters(0, 0.88),
      inputPorts: [inputPort('memory-in', 'signal.integration-memory', 0.8)],
      outputPorts: [outputPort('memory-out', 'signal.memory')],
    });
    const response = node('response', labels.nodes.response, 'processing', 520, 330, {
      parameters: parameters(0, 1.1),
      inputPorts: [inputPort('response-in', 'signal.integration-response')],
      outputPorts: [outputPort('response-out', 'signal.response')],
    });
    return emptyModel(
      templateId,
      labels,
      [a, integration, memory, response, reporter],
      [
        edge(
          'edge-sensor-integration',
          'sensor-a',
          'sensor-a-out',
          'integration',
          'integration-in-sensor',
          'signal.sensor-a',
        ),
        edge(
          'edge-integration-memory',
          'integration',
          'integration-out-memory',
          'memory',
          'memory-in',
          'signal.integration-memory',
        ),
        edge(
          'edge-memory-integration',
          'memory',
          'memory-out',
          'integration',
          'integration-in-memory',
          'signal.memory',
        ),
        edge(
          'edge-integration-response',
          'integration',
          'integration-out-response',
          'response',
          'response-in',
          'signal.integration-response',
        ),
        edge(
          'edge-response-reporter',
          'response',
          'response-out',
          'reporter',
          'reporter-in',
          'signal.response',
        ),
      ],
      now,
    );
  }
  const a = sensor('sensor-a', labels.nodes.sensorA, 90, 105, 0.72);
  const b = sensor('sensor-b', labels.nodes.sensorB, 90, 245, 0.58);
  const c = sensor('sensor-c', labels.nodes.sensorC, 90, 385, 0.44);
  const integration = node('integration', labels.nodes.integration, 'processing', 340, 245, {
    parameters: parameters(0, 1),
    inputPorts: [
      inputPort('integration-in-a', 'signal.sensor-a', 0.48),
      inputPort('integration-in-b', 'signal.sensor-b', 0.34),
      inputPort('integration-in-c', 'signal.sensor-c', 0.18),
    ],
    outputPorts: [outputPort('integration-out', 'signal.integration')],
  });
  const response = node('response', labels.nodes.response, 'processing', 560, 245, {
    parameters: parameters(0, 1.1),
    inputPorts: [inputPort('response-in', 'signal.integration')],
    outputPorts: [outputPort('response-out', 'signal.response')],
  });
  return emptyModel(
    templateId,
    labels,
    [a, b, c, integration, response, reporter],
    [
      edge(
        'edge-sensor-a-integration',
        'sensor-a',
        'sensor-a-out',
        'integration',
        'integration-in-a',
        'signal.sensor-a',
      ),
      edge(
        'edge-sensor-b-integration',
        'sensor-b',
        'sensor-b-out',
        'integration',
        'integration-in-b',
        'signal.sensor-b',
      ),
      edge(
        'edge-sensor-c-integration',
        'sensor-c',
        'sensor-c-out',
        'integration',
        'integration-in-c',
        'signal.sensor-c',
      ),
      edge(
        'edge-integration-response',
        'integration',
        'integration-out',
        'response',
        'response-in',
        'signal.integration',
      ),
      edge(
        'edge-response-reporter',
        'response',
        'response-out',
        'reporter',
        'reporter-in',
        'signal.response',
      ),
    ],
    now,
  );
}
export function createModelNode(kind: ModelNodeKind, name: string, index: number): ModelNode {
  const id = createId('node');
  const x = 140 + (index % 4) * 190;
  const y = 120 + (Math.floor(index / 4) % 3) * 150;
  if (kind === 'input') {
    return node(id, name, kind, x, y, {
      parameters: parameters(0.5),
      outputPorts: [outputPort(`${id}-out`, `signal.${id}.out`)],
    });
  }
  if (kind === 'output') {
    return node(id, name, kind, x, y, {
      inputPorts: [inputPort(`${id}-in`, `signal.${id}.in`)],
    });
  }
  return node(id, name, kind, x, y, {
    inputPorts: [inputPort(`${id}-in`, `signal.${id}.in`)],
    outputPorts: [outputPort(`${id}-out`, `signal.${id}.out`)],
  });
}

export function getModelPortCapabilities(kind: ModelNodeKind): ModelPortCapabilities {
  return MODEL_PORTS[kind];
}
function findNode(model: NetworkModel, id: string): ModelNode | undefined {
  return model.nodes.find((candidate) => candidate.id === id);
}
function inputPortById(modelNode: ModelNode, id: string): ModelInputPort | undefined {
  return modelNode.inputPorts.find((port) => port.id === id);
}
function outputPortById(modelNode: ModelNode, id: string): ModelOutputPort | undefined {
  return modelNode.outputPorts.find((port) => port.id === id);
}

export function getCompatiblePortPairs(
  model: NetworkModel,
  sourceNodeId: string,
  targetNodeId: string,
): CompatiblePortPair[] {
  const source = findNode(model, sourceNodeId);
  const target = findNode(model, targetNodeId);
  if (!source || !target || sourceNodeId === targetNodeId) return [];
  return source.outputPorts.flatMap((sourcePort) =>
    target.inputPorts
      .filter((targetPort) => targetPort.signalId === sourcePort.signalId)
      .map((targetPort) => ({
        sourcePortId: sourcePort.id,
        targetPortId: targetPort.id,
        signalId: sourcePort.signalId,
      })),
  );
}
export function findUniqueCompatiblePortPair(
  model: NetworkModel,
  sourceNodeId: string,
  targetNodeId: string,
): CompatiblePortPair | null {
  const pairs = getCompatiblePortPairs(model, sourceNodeId, targetNodeId);
  return pairs.length === 1 ? (pairs[0] ?? null) : null;
}
export const findUniqueCompatiblePorts = findUniqueCompatiblePortPair;
export const resolveUniqueCompatiblePorts = findUniqueCompatiblePortPair;

/** A freshly-created input port is intentionally allowed to adopt its first source molecule. */
function canAdoptSourceSignal(
  target: ModelNode,
  targetPort: ModelInputPort,
  model: NetworkModel,
): boolean {
  const signalId = targetPort.signalId.trim();
  if (
    signalId !== '' &&
    signalId !== `signal.${target.id}.in` &&
    signalId !== `signal.${target.id}`
  )
    return false;
  return !model.edges.some(
    (candidate) => candidate.enabled && candidate.target === target.id && candidate.targetPortId === targetPort.id,
  );
}

function modelWithAdoptedTargetSignal(
  model: NetworkModel,
  targetNodeId: string,
  targetPortId: string,
  signalId: string,
): NetworkModel {
  return {
    ...model,
    nodes: model.nodes.map((node) =>
      node.id !== targetNodeId
        ? node
        : {
            ...node,
            inputPorts: node.inputPorts.map((port) =>
              port.id === targetPortId ? { ...port, signalId } : port,
            ),
          },
    ),
  };
}

function resolveArguments(
  model: NetworkModel,
  sourceNodeId: string,
  sourcePortOrIgnored: string | undefined,
  targetPortId: string | undefined,
  ignoredEdgeId: string | undefined,
): {
  sourcePortId?: string | undefined;
  targetPortId?: string | undefined;
  ignoredEdgeId?: string | undefined;
} {
  if (targetPortId !== undefined) {
    return { sourcePortId: sourcePortOrIgnored, targetPortId, ignoredEdgeId };
  }
  if (sourcePortOrIgnored === undefined) return { ignoredEdgeId };
  const source = findNode(model, sourceNodeId);
  if (source?.outputPorts.some((port) => port.id === sourcePortOrIgnored)) {
    return { sourcePortId: sourcePortOrIgnored, ignoredEdgeId };
  }
  return { ignoredEdgeId: sourcePortOrIgnored };
}

export function getModelConnectionIssue(
  model: NetworkModel,
  sourceNodeId: string,
  targetNodeId: string,
  sourcePortIdOrIgnored?: string,
  targetPortId?: string,
  ignoredEdgeId?: string,
): ModelConnectionIssue | null {
  const source = findNode(model, sourceNodeId);
  const target = findNode(model, targetNodeId);
  if (!source) return 'missing-source';
  if (!target) return 'missing-target';
  if (sourceNodeId === targetNodeId) return 'self-connection';
  if (!MODEL_PORTS[source.kind].output) return 'source-has-no-output';
  if (!MODEL_PORTS[target.kind].input) return 'target-has-no-input';
  const resolved = resolveArguments(
    model,
    sourceNodeId,
    sourcePortIdOrIgnored,
    targetPortId,
    ignoredEdgeId,
  );
  let sourcePort: ModelOutputPort | undefined;
  let targetPort: ModelInputPort | undefined;
  if (resolved.sourcePortId === undefined && resolved.targetPortId === undefined) {
    const pairs = getCompatiblePortPairs(model, sourceNodeId, targetNodeId);
    if (pairs.length === 0) return 'no-compatible-port';
    if (pairs.length > 1) return 'ambiguous-compatible-port';
    sourcePort = outputPortById(source, pairs[0]?.sourcePortId ?? '');
    targetPort = inputPortById(target, pairs[0]?.targetPortId ?? '');
  } else {
    if (resolved.sourcePortId === undefined) return 'missing-source-port';
    if (resolved.targetPortId === undefined) return 'missing-target-port';
    sourcePort = outputPortById(source, resolved.sourcePortId);
    targetPort = inputPortById(target, resolved.targetPortId);
    if (!sourcePort) {
      return source.inputPorts.some((port) => port.id === resolved.sourcePortId)
        ? 'source-port-direction'
        : 'missing-source-port';
    }
    if (!targetPort) {
      return target.outputPorts.some((port) => port.id === resolved.targetPortId)
        ? 'target-port-direction'
        : 'missing-target-port';
    }
  }
  if (!sourcePort || !targetPort) return 'signal-mismatch';
  const targetSignalCanBeAdopted = canAdoptSourceSignal(target, targetPort, model);
  if (sourcePort.signalId !== targetPort.signalId && !targetSignalCanBeAdopted)
    return 'signal-mismatch';
  if (target.receiverResponseBinding && source.kind !== 'input') {
    return 'bound-response-requires-concentration-input';
  }
  const replacedEdge = resolved.ignoredEdgeId
    ? model.edges.find((candidate) => candidate.id === resolved.ignoredEdgeId)
    : undefined;
  const candidateEnabled = replacedEdge?.enabled ?? true;
  if (
    target.receiverResponseBinding &&
    candidateEnabled &&
    model.edges.some(
      (candidate) =>
        candidate.id !== resolved.ignoredEdgeId &&
        candidate.enabled &&
        candidate.target === targetNodeId,
    )
  ) {
    return 'bound-response-input-occupied';
  }
  const duplicate = model.edges.some(
    (candidate) =>
      candidate.id !== resolved.ignoredEdgeId &&
      candidate.source === sourceNodeId &&
      candidate.target === targetNodeId &&
      candidate.sourcePortId === sourcePort.id &&
      candidate.targetPortId === targetPort.id,
  );
  if (duplicate) return 'duplicate-connection';
  const connectionModel =
    sourcePort.signalId !== targetPort.signalId && targetSignalCanBeAdopted
      ? modelWithAdoptedTargetSignal(model, target.id, targetPort.id, sourcePort.signalId)
      : model;
  const hypotheticalModel: NetworkModel = {
    ...connectionModel,
    edges: [
      ...connectionModel.edges.filter((candidate) => candidate.id !== resolved.ignoredEdgeId),
      {
        id: resolved.ignoredEdgeId ?? 'connection-preview',
        source: sourceNodeId,
        sourcePortId: sourcePort.id,
        target: targetNodeId,
        targetPortId: targetPort.id,
        signalId: sourcePort.signalId,
        enabled: candidateEnabled,
      },
    ],
  };
  return modelParameterContextIssue(hypotheticalModel) === null
    ? null
    : 'parameter-context-conflict';
}

export function connectModelNodes(
  model: NetworkModel,
  request: ModelConnectionRequest,
): NetworkModel;
export function connectModelNodes(
  model: NetworkModel,
  sourceNodeId: string,
  targetNodeId: string,
  sourcePortId?: string,
  targetPortId?: string,
  edgeId?: string,
): NetworkModel;
export function connectModelNodes(
  model: NetworkModel,
  requestOrSource: ModelConnectionRequest | string,
  targetNodeId?: string,
  sourcePortId?: string,
  targetPortId?: string,
  edgeId?: string,
): NetworkModel {
  const request: ModelConnectionRequest =
    typeof requestOrSource === 'string'
      ? {
          sourceNodeId: requestOrSource,
          targetNodeId: targetNodeId ?? '',
          sourcePortId,
          targetPortId,
          edgeId,
        }
      : requestOrSource;
  let sourcePort = request.sourcePortId;
  let targetPort = request.targetPortId;
  if (sourcePort === undefined && targetPort === undefined) {
    const pair = findUniqueCompatiblePortPair(model, request.sourceNodeId, request.targetNodeId);
    if (!pair) {
      const count = getCompatiblePortPairs(
        model,
        request.sourceNodeId,
        request.targetNodeId,
      ).length;
      throw new Error(count === 0 ? 'no-compatible-port' : 'ambiguous-compatible-port');
    }
    sourcePort = pair.sourcePortId;
    targetPort = pair.targetPortId;
  }
  const sourceNode = findNode(model, request.sourceNodeId);
  const targetNode = findNode(model, request.targetNodeId);
  if (!sourceNode || !targetNode || !sourcePort || !targetPort)
    throw new Error('invalid-connection');
  const sourceOutput = outputPortById(sourceNode, sourcePort);
  const targetInput = inputPortById(targetNode, targetPort);
  if (!sourceOutput || !targetInput) throw new Error('invalid-connection');
  const connectionModel =
    sourceOutput.signalId !== targetInput.signalId && canAdoptSourceSignal(targetNode, targetInput, model)
      ? modelWithAdoptedTargetSignal(model, targetNode.id, targetInput.id, sourceOutput.signalId)
      : model;
  const issue = getModelConnectionIssue(
    connectionModel,
    request.sourceNodeId,
    request.targetNodeId,
    sourcePort,
    targetPort,
  );
  if (issue) throw new Error(issue);
  return {
    ...connectionModel,
    edges: [
      ...connectionModel.edges,
      {
        id: request.edgeId ?? createId('edge'),
        source: sourceNode.id,
        sourcePortId: sourceOutput.id,
        target: targetNode.id,
        targetPortId: targetPort,
        signalId: sourceOutput.signalId,
        enabled: true,
      },
    ],
  };
}

export function classifyOutput(value: number, thresholds: readonly [number, number]): OutputBand {
  if (value < thresholds[0]) return 'low';
  if (value < thresholds[1]) return 'intermediate';
  return 'high';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function isReceiverResponseWorkingRange(value: unknown): value is ReceiverResponseWorkingRange {
  return (
    isRecord(value) &&
    typeof value.min === 'number' &&
    Number.isFinite(value.min) &&
    value.min >= 0 &&
    typeof value.max === 'number' &&
    Number.isFinite(value.max) &&
    value.max > 0 &&
    value.min <= value.max &&
    value.unit === 'M'
  );
}
function isConcentrationInputBinding(value: unknown): value is ConcentrationInputBinding {
  return (
    isRecord(value) &&
    isNonEmptyString(value.targetNodeId) &&
    isNonEmptyString(value.receiverResponseId) &&
    isNonEmptyString(value.parameterContextId) &&
    isNonEmptyString(value.inputSignalId) &&
    value.inputUnit === 'M' &&
    isReceiverResponseWorkingRange(value.workingRange)
  );
}
function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
function isParameterStatus(value: unknown): value is ModelParameterStatus {
  return [
    'team-calibrated',
    'literature-context',
    'normalized-demo',
    'calibration-required',
    'reference-only',
    'legacy-demo',
    'unvalidated',
    'experimental',
  ].includes(String(value));
}
function isParameterProvenance(value: unknown): value is ModelParameterProvenance {
  return [
    'development-fixture',
    'legacy-demo',
    'catalog-reference',
    'user-specified',
    'unknown',
  ].includes(String(value));
}
function isModelParameters(value: unknown): value is ModelNodeParameters {
  return (
    isRecord(value) &&
    typeof value.baseline === 'number' &&
    Number.isFinite(value.baseline) &&
    value.baseline >= 0 &&
    value.baseline <= 1 &&
    typeof value.gain === 'number' &&
    Number.isFinite(value.gain) &&
    value.gain >= 0 &&
    isParameterStatus(value.parameterStatus) &&
    isParameterProvenance(value.provenance)
  );
}
function isModelInputPort(value: unknown): value is ModelInputPort {
  if (!isRecord(value)) return false;
  const sensitivity = value.sensitivity ?? value.weight;
  return (
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    typeof value.signalId === 'string' &&
    value.signalId.trim().length > 0 &&
    typeof sensitivity === 'number' &&
    Number.isFinite(sensitivity) &&
    sensitivity >= 0 &&
    (value.weight === undefined ||
      (typeof value.weight === 'number' && Number.isFinite(value.weight) && value.weight >= 0)) &&
    ['activation', 'inhibition', 'derepression'].includes(String(value.direction)) &&
    isParameterStatus(value.parameterStatus) &&
    isParameterProvenance(value.provenance)
  );
}
function isModelOutputPort(value: unknown): value is ModelOutputPort {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    typeof value.signalId === 'string' &&
    value.signalId.trim().length > 0 &&
    typeof value.strength === 'number' &&
    Number.isFinite(value.strength) &&
    value.strength >= 0 &&
    isParameterStatus(value.parameterStatus) &&
    isParameterProvenance(value.provenance)
  );
}
function isModelNode(value: unknown): value is ModelNode {
  if (
    !isRecord(value) ||
    !isModelParameters(value.parameters) ||
    !Array.isArray(value.inputPorts) ||
    !Array.isArray(value.outputPorts)
  )
    return false;
  if (
    typeof value.id !== 'string' ||
    value.id.trim().length === 0 ||
    typeof value.name !== 'string' ||
    typeof value.x !== 'number' ||
    !Number.isFinite(value.x) ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.y) ||
    !['input', 'processing', 'output'].includes(String(value.kind)) ||
    !value.inputPorts.every(isModelInputPort) ||
    !value.outputPorts.every(isModelOutputPort)
  )
    return false;
  if (value.kind === 'input' && value.inputPorts.length !== 0) return false;
  if (value.kind === 'output' && value.outputPorts.length !== 0) return false;
  if (
    value.kind === 'processing' &&
    (value.inputPorts.length === 0 || value.outputPorts.length === 0)
  )
    return false;
  const partValid =
    value.part === undefined ||
    (isRecord(value.part) &&
      typeof value.part.id === 'string' &&
      typeof value.part.sourceKey === 'string' &&
      ['documented-pattern', 'illustrative'].includes(String(value.part.evidenceStatus)));
  const concentrationInputBindingValid =
    value.concentrationInputBinding === undefined ||
    (value.kind === 'input' &&
      isConcentrationInputBinding(value.concentrationInputBinding) &&
      value.outputPorts.length === 1 &&
      value.outputPorts[0]?.signalId === value.concentrationInputBinding.inputSignalId &&
      value.outputPorts[0].strength === 1);
  return (
    partValid &&
    concentrationInputBindingValid &&
    (value.catalogReference === undefined || isLiteratureCandidateReference(value.catalogReference)) &&
    (value.receiverResponseBinding === undefined ||
      isTrustedReceiverResponseBinding(value.receiverResponseBinding))
  );
}
function isModelEdge(value: unknown): value is ModelEdge {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.source === 'string' &&
    typeof value.sourcePortId === 'string' &&
    typeof value.target === 'string' &&
    typeof value.targetPortId === 'string' &&
    typeof value.signalId === 'string' &&
    value.signalId.trim().length > 0 &&
    typeof value.enabled === 'boolean' &&
    !('weight' in value)
  );
}
function isDetectionRecordReference(value: unknown): value is DetectionRecordReference {
  if (value === null) return true;
  return (
    isRecord(value) &&
    value.mode === 'reference-only' &&
    typeof value.recordId === 'string' &&
    typeof value.sampleId === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.linkedAt === 'string' &&
    ['demo-live', 'real-live', 'json-import', 'csv-import'].includes(String(value.origin)) &&
    typeof value.isDemo === 'boolean' &&
    ['OK', 'PARTIAL', 'ERROR', 'RAW_ONLY'].includes(String(value.resultStatus))
  );
}
function isLegacyReference(value: unknown): value is LegacyReference {
  return isRecord(value) && isJsonValue(value);
}

export function validateNetworkModel(value: unknown): value is NetworkModel {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    typeof value.isDemo !== 'boolean' ||
    !['licorice-quality', 'signal-gate', 'feedback-loop'].includes(String(value.templateId)) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.description !== 'string' ||
    !Array.isArray(value.nodes) ||
    value.nodes.length === 0 ||
    value.nodes.length > 100 ||
    !Array.isArray(value.edges) ||
    value.edges.length > 500 ||
    typeof value.outputNodeId !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    (value.recordReference !== undefined && !isDetectionRecordReference(value.recordReference)) ||
    (value.legacyRecordReference !== undefined &&
      !isDetectionRecordReference(value.legacyRecordReference)) ||
    (value.legacyReference !== undefined &&
      value.legacyReference !== null &&
      !isLegacyReference(value.legacyReference)) ||
    !Array.isArray(value.thresholds) ||
    value.thresholds.length !== 2 ||
    !value.thresholds.every(
      (threshold): threshold is number =>
        typeof threshold === 'number' &&
        Number.isFinite(threshold) &&
        threshold >= 0 &&
        threshold <= 1,
    ) ||
    value.thresholds[0]! > value.thresholds[1]! ||
    !value.nodes.every(isModelNode) ||
    !value.edges.every(isModelEdge)
  )
    return false;
  if (receiverResponseTopologyIssue(value) !== null) return false;
  const nodes = value.nodes;
  const nodeIds = new Set(nodes.map((candidate) => candidate.id));
  const portIds = new Set<string>();
  for (const candidate of nodes) {
    for (const port of [...candidate.inputPorts, ...candidate.outputPorts]) {
      if (portIds.has(port.id)) return false;
      portIds.add(port.id);
    }
  }
  if (
    nodeIds.size !== nodes.length ||
    !nodeIds.has(value.outputNodeId) ||
    nodes.find((candidate) => candidate.id === value.outputNodeId)?.kind !== 'output'
  )
    return false;
  for (const candidate of nodes) {
    const binding = candidate.concentrationInputBinding;
    if (!binding) continue;
    const targetBinding = nodes.find((node) => node.id === binding.targetNodeId)
      ?.receiverResponseBinding;
    if (
      !targetBinding ||
      targetBinding.receiverResponseId !== binding.receiverResponseId ||
      targetBinding.parameterContextId !== binding.parameterContextId ||
      targetBinding.inputSignalId !== binding.inputSignalId ||
      targetBinding.inputUnit !== binding.inputUnit ||
      targetBinding.workingRange.min !== binding.workingRange.min ||
      targetBinding.workingRange.max !== binding.workingRange.max ||
      targetBinding.workingRange.unit !== binding.workingRange.unit
    )
      return false;
  }
  const model = value as unknown as NetworkModel;
  return model.edges.every((candidate) => {
    if (!nodeIds.has(candidate.source) || !nodeIds.has(candidate.target)) return false;
    if (
      getModelConnectionIssue(
        model,
        candidate.source,
        candidate.target,
        candidate.sourcePortId,
        candidate.targetPortId,
        candidate.id,
      ) !== null
    )
      return false;
    const source = findNode(model, candidate.source);
    const target = findNode(model, candidate.target);
    const sourcePort = source ? outputPortById(source, candidate.sourcePortId) : undefined;
    const targetPort = target ? inputPortById(target, candidate.targetPortId) : undefined;
    return (
      sourcePort?.signalId === candidate.signalId && targetPort?.signalId === candidate.signalId
    );
  });
}

export interface ModelValidationDiagnostic {
  code:
    | 'invalid-model'
    | 'invalid-node'
    | 'invalid-edge'
    | 'missing-output'
    | 'connection'
    | 'parameters-not-runnable';
  nodeId?: string;
  edgeId?: string;
  issue?: ModelConnectionIssue;
}

/** Return actionable topology/parameter diagnostics before simulation starts. */
export function diagnoseNetworkModel(value: unknown): ModelValidationDiagnostic[] {
  if (!isRecord(value) || value.schemaVersion !== 2 || !Array.isArray(value.nodes))
    return [{ code: 'invalid-model' }];
  const diagnostics: ModelValidationDiagnostic[] = [];
  const rawNodes = value.nodes;
  for (const candidate of rawNodes) {
    if (isModelNode(candidate)) continue;
    const nodeId = isRecord(candidate) && typeof candidate.id === 'string' ? candidate.id : undefined;
    diagnostics.push({ code: 'invalid-node', ...(nodeId ? { nodeId } : {}) });
  }
  const nodes = rawNodes.filter(isModelNode);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outputNodeId = typeof value.outputNodeId === 'string' ? value.outputNodeId : '';
  if (!nodeIds.has(outputNodeId) || nodes.find((node) => node.id === outputNodeId)?.kind !== 'output')
    diagnostics.push({ code: 'missing-output', ...(outputNodeId ? { nodeId: outputNodeId } : {}) });
  if (receiverResponseTopologyIssue(value) !== null) diagnostics.push({ code: 'connection' });
  const rawEdges = Array.isArray(value.edges) ? value.edges : [];
  const candidateModel = value as unknown as NetworkModel;
  for (const candidate of rawEdges) {
    if (!isModelEdge(candidate)) {
      const edgeId = isRecord(candidate) && typeof candidate.id === 'string' ? candidate.id : undefined;
      diagnostics.push({ code: 'invalid-edge', ...(edgeId ? { edgeId } : {}) });
      continue;
    }
    if (!nodeIds.has(candidate.source) || !nodeIds.has(candidate.target)) {
      diagnostics.push({ code: 'connection', edgeId: candidate.id, issue: 'missing-source' });
      continue;
    }
    const issue = getModelConnectionIssue(
      candidateModel,
      candidate.source,
      candidate.target,
      candidate.sourcePortId,
      candidate.targetPortId,
      candidate.id,
    );
    if (issue) diagnostics.push({ code: 'connection', edgeId: candidate.id, issue });
  }
  if (diagnostics.length > 0) return diagnostics;
  const forbidden = new Set(['calibration-required', 'reference-only', 'unvalidated', 'experimental']);
  const blockedNode = nodes.find(
    (node) =>
      forbidden.has(node.parameters.parameterStatus) ||
      node.inputPorts.some((port) => forbidden.has(port.parameterStatus)) ||
      node.outputPorts.some((port) => forbidden.has(port.parameterStatus)),
  );
  return blockedNode ? [{ code: 'parameters-not-runnable', nodeId: blockedNode.id }] : [];
}

export function sanitizeCatalogReferences(value: unknown): {
  model: NetworkModel | null;
  droppedNodeIds: string[];
} {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return { model: null, droppedNodeIds: [] };
  let candidate: unknown;
  try {
    candidate = structuredClone(value);
  } catch {
    return { model: null, droppedNodeIds: [] };
  }
  if (!isRecord(candidate) || !Array.isArray(candidate.nodes))
    return { model: null, droppedNodeIds: [] };
  const droppedNodeIds: string[] = [];
  for (const candidateNode of candidate.nodes) {
    if (
      isRecord(candidateNode) &&
      candidateNode.catalogReference !== undefined &&
      !isLiteratureCandidateReference(candidateNode.catalogReference)
    ) {
      if (typeof candidateNode.id === 'string') droppedNodeIds.push(candidateNode.id);
      delete candidateNode.catalogReference;
    }
  }
  return { model: validateNetworkModel(candidate) ? candidate : null, droppedNodeIds };
}

function directionSign(direction: ModelInputDirection): number {
  return direction === 'inhibition' ? -1 : 1;
}

function modelParameterContextIssue(model: unknown): string | null {
  if (!isRecord(model) || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) return null;
  const outputNodeId = typeof model.outputNodeId === 'string' ? model.outputNodeId : '';
  const reachable = new Set<string>([outputNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of model.edges) {
      if (!isRecord(edge) || edge.enabled !== true || typeof edge.source !== 'string') continue;
      if (typeof edge.target === 'string' && reachable.has(edge.target) && !reachable.has(edge.source)) {
        reachable.add(edge.source);
        changed = true;
      }
    }
  }
  const contexts = new Set<string>();
  for (const candidate of model.nodes) {
    if (
      isRecord(candidate) &&
      typeof candidate.id === 'string' &&
      reachable.has(candidate.id) &&
      isTrustedReceiverResponseBinding(candidate.receiverResponseBinding)
    ) {
      contexts.add(candidate.receiverResponseBinding.parameterContextId);
    }
  }
  return contexts.size > 1 ? 'MODEL_PARAMETER_CONTEXT_CONFLICT' : null;
}

/**
 * Bound literature response nodes are deliberately stricter than the legacy
 * normalized graph.  Keep this as a pure issue lookup so import, persistence,
 * validation and execution all apply the same boundary. A newly applied
 * receiver is allowed to have no incoming edge yet; once an edge exists it
 * must still be a single molecular input edge.
 */
function receiverResponseTopologyIssue(model: unknown): string | null {
  if (!isRecord(model) || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) return null;
  const boundNodes = model.nodes.filter(
    (candidate): candidate is Record<string, unknown> =>
      isRecord(candidate) && candidate.receiverResponseBinding !== undefined,
  );
  if (boundNodes.length === 0) return null;
  for (const candidate of boundNodes) {
    if (!isTrustedReceiverResponseBinding(candidate.receiverResponseBinding))
      return 'MODEL_RECEIVER_RESPONSE_BINDING_INVALID';
    const binding = candidate.receiverResponseBinding;
    if (
      candidate.kind !== 'processing' ||
      !isRecord(candidate.parameters) ||
      candidate.parameters.baseline !== 0 ||
      candidate.parameters.gain !== 1 ||
      candidate.parameters.parameterStatus !== 'normalized-demo' ||
      candidate.parameters.provenance !== 'catalog-reference' ||
      !Array.isArray(candidate.inputPorts) ||
      !Array.isArray(candidate.outputPorts) ||
      candidate.inputPorts.length !== 1 ||
      candidate.outputPorts.length !== 1
    )
      return 'MODEL_RECEIVER_RESPONSE_TOPOLOGY_INVALID';
    const input: unknown = candidate.inputPorts[0];
    const output: unknown = candidate.outputPorts[0];
    if (
      !isRecord(input) ||
      !isRecord(output) ||
      'weight' in input ||
      input.signalId !== binding.inputSignalId ||
      output.signalId !== binding.outputSignalId ||
      input.direction !== binding.direction ||
      input.sensitivity !== 1 ||
      output.strength !== 1 ||
      input.parameterStatus !== 'normalized-demo' ||
      input.provenance !== 'catalog-reference' ||
      output.parameterStatus !== 'normalized-demo' ||
      output.provenance !== 'catalog-reference'
    )
      return 'MODEL_RECEIVER_RESPONSE_SIGNAL_OR_PARAMETER_INVALID';
    const nodeId = typeof candidate.id === 'string' ? candidate.id : '';
    const incoming = model.edges.filter(
      (edge) => isRecord(edge) && edge.target === nodeId && edge.enabled === true,
    );
    if (incoming.length > 1) return 'MODEL_RECEIVER_RESPONSE_MULTIPLE_INCOMING';
    if (incoming.length === 1) {
      const sourceEdge: unknown = incoming[0];
      const sourceId =
        isRecord(sourceEdge) && typeof sourceEdge.source === 'string'
          ? sourceEdge.source
          : undefined;
      const source: unknown = model.nodes.find(
        (node: unknown) => isRecord(node) && sourceId !== undefined && node.id === sourceId,
      );
      if (!isRecord(source) || source.kind !== 'input') {
        return 'bound-response-requires-concentration-input';
      }
    }
  }
  return modelParameterContextIssue(model);
}

function assertReceiverResponseTopology(model: unknown): void {
  const issue = receiverResponseTopologyIssue(model);
  if (issue) throw new Error(issue);
}

function portSensitivity(port: ModelInputPort): number {
  return nonNegative(port.sensitivity ?? port.weight ?? 0);
}
function assertRunnableParameters(model: NetworkModel): void {
  const statuses = model.nodes.flatMap((candidate) => [
    candidate.parameters.parameterStatus,
    ...candidate.inputPorts.map((port) => port.parameterStatus),
    ...candidate.outputPorts.map((port) => port.parameterStatus),
  ]);
  const forbidden = statuses.find((status) =>
    ['calibration-required', 'reference-only', 'unvalidated', 'experimental'].includes(status),
  );
  if (forbidden) throw new Error('MODEL_PARAMETERS_NOT_RUNNABLE');
}

function nodeSteadyValue(
  model: NetworkModel,
  modelNode: ModelNode,
  current: Record<string, number>,
): number {
  if (modelNode.kind === 'input') return clamp(modelNode.parameters.baseline);
  const incoming = model.edges.filter(
    (candidate) => candidate.enabled && candidate.target === modelNode.id,
  );
  if (modelNode.receiverResponseBinding) {
    const source = incoming[0] ? findNode(model, incoming[0].source) : undefined;
    const concentration = source ? current[source.id] ?? 0 : 0;
    return evaluateReceiverResponse(modelNode.receiverResponseBinding, concentration, 'M');
  }
  if (incoming.length === 0) return clamp(modelNode.parameters.baseline);
  const aggregate = incoming.reduce((sum, candidate) => {
    const source = findNode(model, candidate.source);
    const sourcePort = source ? outputPortById(source, candidate.sourcePortId) : undefined;
    const targetPort = inputPortById(modelNode, candidate.targetPortId);
    if (!source || !sourcePort || !targetPort || sourcePort.signalId !== targetPort.signalId)
      return sum;
    return (
      sum +
      clamp(current[source.id] ?? 0) *
        nonNegative(sourcePort.strength) *
        portSensitivity(targetPort) *
        directionSign(targetPort.direction)
    );
  }, 0);
  return clamp(modelNode.parameters.baseline + modelNode.parameters.gain * aggregate);
}

export function simulateNetwork(
  model: NetworkModel,
  options: { maxIterations?: number; tolerance?: number; now?: string } = {},
): SimulationResult {
  assertReceiverResponseTopology(model);
  if (!validateNetworkModel(model)) throw new Error('INVALID_NETWORK_MODEL');
  assertRunnableParameters(model);
  const maxIterations = Math.max(
    1,
    Math.min(2000, Math.round(options.maxIterations ?? MODELING_SIMULATION_DEFAULTS.maxIterations)),
  );
  const tolerance = Math.max(
    Number.EPSILON,
    Math.min(0.1, finite(options.tolerance ?? MODELING_SIMULATION_DEFAULTS.tolerance, 1e-6)),
  );
  let current: Record<string, number> = Object.fromEntries(
    model.nodes.map((candidate) => [candidate.id, clamp(candidate.parameters.baseline)]),
  );
  let iterations = 0;
  let maxDelta = Number.POSITIVE_INFINITY;
  let converged = false;
  while (iterations < maxIterations) {
    const next: Record<string, number> = {};
    maxDelta = 0;
    for (const modelNode of model.nodes) {
      const value = nodeSteadyValue(model, modelNode, current);
      next[modelNode.id] = value;
      maxDelta = Math.max(maxDelta, Math.abs(value - (current[modelNode.id] ?? 0)));
    }
    current = next;
    iterations += 1;
    if (maxDelta <= tolerance) {
      converged = true;
      break;
    }
  }
  const provenanceValues = model.nodes.flatMap((candidate) => [
    candidate.parameters.provenance,
    ...candidate.inputPorts.map((port) => port.provenance),
    ...candidate.outputPorts.map((port) => port.provenance),
  ]);
  const parameterProvenance = provenanceValues.every((value) => value === 'development-fixture')
    ? 'development-fixture'
    : provenanceValues.every((value) => value === 'legacy-demo')
      ? 'legacy-demo'
      : 'mixed';
  const statusValues = model.nodes.flatMap((candidate) => [
    candidate.parameters.parameterStatus,
    ...candidate.inputPorts.map((port) => port.parameterStatus),
    ...candidate.outputPorts.map((port) => port.parameterStatus),
  ]);
  const parameterStatus = statusValues.every((value) => value === statusValues[0])
    ? (statusValues[0] ?? 'unvalidated')
    : 'mixed';
  const isDemo =
    statusValues.some((value) => value === 'normalized-demo' || value === 'legacy-demo') ||
    provenanceValues.some((value) => value === 'development-fixture' || value === 'legacy-demo');
  const timestamp = options.now ?? new Date().toISOString();
  const outputValue = clamp(current[model.outputNodeId] ?? 0);
  return {
    engineVersion: MODELING_ENGINE_VERSION,
    simulationMode: 'steady-state',
    isSteadyState: true,
    parameterStatus,
    parameterProvenance,
    convergence: { converged, iterations, maxIterations, tolerance, maxDelta },
    startedAt: timestamp,
    completedAt: timestamp,
    finalValues: current,
    outputNodeId: model.outputNodeId,
    outputValue,
    outputBand: classifyOutput(outputValue, model.thresholds),
    isDemo,
    experimentalValidity: 'not-validated',
    disclaimer: MODELING_DISCLAIMER,
  };
}
interface LegacyNodeRecord {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  parameters: Record<string, unknown>;
  part?: unknown;
  catalogReference?: unknown;
}
interface LegacyEdgeRecord {
  id: string;
  source: string;
  target: string;
  weight: number;
  enabled: boolean;
}
function asLegacyNode(value: unknown): LegacyNodeRecord | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.x !== 'number' ||
    !Number.isFinite(value.x) ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.y) ||
    !isRecord(value.parameters)
  )
    return null;
  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    x: value.x,
    y: value.y,
    parameters: value.parameters,
    part: value.part,
    catalogReference: value.catalogReference,
  };
}
function asLegacyEdge(value: unknown): LegacyEdgeRecord | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.target !== 'string' ||
    typeof value.weight !== 'number' ||
    !Number.isFinite(value.weight) ||
    typeof value.enabled !== 'boolean'
  )
    return null;
  return {
    id: value.id,
    source: value.source,
    target: value.target,
    weight: value.weight,
    enabled: value.enabled,
  };
}
function legacyNodeKind(kind: string): ModelNodeKind {
  if (kind === 'sensor') return 'input';
  if (kind === 'reporter') return 'output';
  if (kind === 'signal' || kind === 'response' || kind === 'memory') return 'processing';
  throw new Error('INVALID_LEGACY_NODE_KIND');
}
function legacyBaseline(record: LegacyNodeRecord, kind: ModelNodeKind): number {
  const value = record.parameters.input;
  return kind === 'input' && typeof value === 'number' && Number.isFinite(value) ? clamp(value) : 0;
}
function legacyGain(record: LegacyNodeRecord): number {
  const value = record.parameters.gain;
  return typeof value === 'number' && Number.isFinite(value) ? nonNegative(Math.abs(value), 1) : 1;
}

/** Pure migration from the old five-kind/weighted-edge representation. */
export function migrateNetworkModelV1ToV2(
  value: unknown,
  now = new Date().toISOString(),
): NetworkModel {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.isDemo !== true ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.description !== 'string' ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    typeof value.outputNodeId !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !Array.isArray(value.thresholds) ||
    value.thresholds.length !== 2 ||
    !value.thresholds.every(
      (n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1,
    ) ||
    value.thresholds[0]! > value.thresholds[1]!
  ) {
    throw new Error('INVALID_LEGACY_NETWORK_MODEL');
  }
  const oldNodes = value.nodes.map(asLegacyNode);
  const oldEdges = value.edges.map(asLegacyEdge);
  if (
    oldNodes.some((candidate) => candidate === null) ||
    oldEdges.some((candidate) => candidate === null)
  )
    throw new Error('INVALID_LEGACY_NETWORK_MODEL');
  const nodes = oldNodes.filter((candidate): candidate is LegacyNodeRecord => candidate !== null);
  const edges = oldEdges.filter((candidate): candidate is LegacyEdgeRecord => candidate !== null);
  const nodeIds = new Set(nodes.map((candidate) => candidate.id));
  const edgeIds = new Set(edges.map((candidate) => candidate.id));
  if (
    nodeIds.size !== nodes.length ||
    edgeIds.size !== edges.length ||
    !nodeIds.has(value.outputNodeId) ||
    edges.some((candidate) => !nodeIds.has(candidate.source) || !nodeIds.has(candidate.target))
  )
    throw new Error('INVALID_LEGACY_NETWORK_MODEL');
  const mappedNodes = nodes.map((legacy) => {
    const kind = legacyNodeKind(legacy.kind);
    const mapped = node(legacy.id, legacy.name, kind, legacy.x, legacy.y, {
      parameters: parameters(
        legacyBaseline(legacy, kind),
        legacyGain(legacy),
        'legacy-demo',
        'legacy-demo',
      ),
    });
    if (isLiteratureCandidateReference(legacy.catalogReference)) {
      mapped.catalogReference = legacy.catalogReference;
    }
    return mapped;
  });
  const byId = new Map(mappedNodes.map((candidate) => [candidate.id, candidate]));
  const scale = Math.max(1, ...edges.map((candidate) => Math.abs(candidate.weight)));
  const migratedEdges: ModelEdge[] = [];
  edges.forEach((legacy, index) => {
    const source = byId.get(legacy.source);
    const target = byId.get(legacy.target);
    if (!source || !target) throw new Error('INVALID_LEGACY_NETWORK_MODEL');
    const signalId = `legacy.signal.${legacy.id}.${index}`;
    const sourcePortId = `legacy.output.${legacy.id}.${index}`;
    const targetPortId = `legacy.input.${legacy.id}.${index}`;
    const meta = { parameterStatus: 'legacy-demo' as const, provenance: 'legacy-demo' as const };
    source.outputPorts.push(outputPort(sourcePortId, signalId, 1, meta));
    target.inputPorts.push(
      inputPort(
        targetPortId,
        signalId,
        Math.abs(legacy.weight) / scale,
        legacy.weight < 0 ? 'inhibition' : 'activation',
        meta,
      ),
    );
    migratedEdges.push({
      id: legacy.id,
      source: source.id,
      sourcePortId,
      target: target.id,
      targetPortId,
      signalId,
      enabled: legacy.enabled,
    });
  });
  for (const modelNode of mappedNodes) {
    const meta = { parameterStatus: 'legacy-demo' as const, provenance: 'legacy-demo' as const };
    if (modelNode.kind !== 'input' && modelNode.inputPorts.length === 0)
      modelNode.inputPorts.push(
        inputPort(
          `legacy.input.${modelNode.id}`,
          `legacy.signal.${modelNode.id}.input`,
          0,
          'activation',
          meta,
        ),
      );
    if (modelNode.kind !== 'output' && modelNode.outputPorts.length === 0)
      modelNode.outputPorts.push(
        outputPort(
          `legacy.output.${modelNode.id}`,
          `legacy.signal.${modelNode.id}.output`,
          1,
          meta,
        ),
      );
  }
  const oldReference = value.recordReference;
  const recordReference = isDetectionRecordReference(oldReference) ? oldReference : null;
  const legacyReference =
    !isDetectionRecordReference(oldReference) && isLegacyReference(oldReference)
      ? oldReference
      : isLegacyReference(value.legacyReference)
        ? value.legacyReference
        : null;
  const migrated: NetworkModel = {
    schemaVersion: 2,
    id: value.id,
    templateId: ['licorice-quality', 'signal-gate', 'feedback-loop'].includes(
      String(value.templateId),
    )
      ? (value.templateId as ModelTemplateId)
      : 'licorice-quality',
    name: value.name,
    description: value.description,
    nodes: mappedNodes,
    edges: migratedEdges,
    outputNodeId: value.outputNodeId,
    thresholds: [value.thresholds[0]!, value.thresholds[1]!],
    recordReference,
    legacyReference,
    updatedAt: now || value.updatedAt,
    isDemo: true,
  };
  if (!validateNetworkModel(migrated)) throw new Error('INVALID_MIGRATED_NETWORK_MODEL');
  return migrated;
}
export const migrateNetworkModelV1 = migrateNetworkModelV1ToV2;
export function migrateNetworkModel(value: unknown, now?: string): NetworkModel {
  if (isRecord(value) && value.schemaVersion === 2) {
    if (!validateNetworkModel(value)) throw new Error('INVALID_NETWORK_MODEL');
    return value;
  }
  return migrateNetworkModelV1ToV2(value, now);
}

export function linkDetectionRecord(
  model: NetworkModel,
  record: HistoryRecord,
  linkedAt = new Date().toISOString(),
): NetworkModel {
  const reference: DetectionRecordReference = {
    mode: 'reference-only',
    recordId: record.id,
    sampleId: record.sampleId,
    createdAt: record.createdAt,
    linkedAt,
    origin: record.origin,
    isDemo: record.isDemo,
    resultStatus: record.resultStatus,
  };
  return { ...model, recordReference: reference, updatedAt: linkedAt };
}
export function unlinkDetectionRecord(
  model: NetworkModel,
  updatedAt = new Date().toISOString(),
): NetworkModel {
  return { ...model, recordReference: null, updatedAt };
}
