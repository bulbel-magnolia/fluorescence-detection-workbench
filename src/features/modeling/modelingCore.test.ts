import { describe, expect, it } from 'vitest';
import {
  connectModelNodes,
  createTemplate,
  findUniqueCompatiblePortPair,
  getModelConnectionIssue,
  linkDetectionRecord,
  migrateNetworkModelV1ToV2,
  simulateNetwork,
  validateNetworkModel,
} from './modelingCore';
import { buildReceiverResponseBinding } from './receiverResponseEvaluator';
import { loadAhlHslCatalogRelease } from './catalog/v2/catalogReleaseLoader';
import type { HistoryRecord } from '../../domain/types';
import type { ModelNode, ModelNodeKind, NetworkModel, TemplateLabels } from './types';

const labels: TemplateLabels = {
  modelName: 'Test model',
  description: 'Normalized development fixture',
  nodes: {
    sensorA: 'Sensor A',
    sensorB: 'Sensor B',
    sensorC: 'Sensor C',
    integration: 'Integration',
    gate: 'Gate',
    memory: 'Memory',
    response: 'Response',
    reporter: 'Reporter',
  },
};

function boundResponseModel(): NetworkModel {
  const binding = buildReceiverResponseBinding(
    loadAhlHslCatalogRelease().catalog,
    'resp.kylilis2018.rhl.c4',
  );
  const source = {
    id: 'molecule-source',
    name: 'Molecule source',
    kind: 'input' as const,
    x: 0,
    y: 0,
    parameters: {
      baseline: binding.originalParameters.ec50,
      gain: 1,
      parameterStatus: 'normalized-demo' as const,
      provenance: 'development-fixture' as const,
    },
    inputPorts: [],
    outputPorts: [
      {
        id: 'molecule-source-out',
        signalId: binding.inputSignalId,
        strength: 1,
        parameterStatus: 'normalized-demo' as const,
        provenance: 'development-fixture' as const,
      },
    ],
    concentrationInputBinding: {
      targetNodeId: 'literature-receiver',
      receiverResponseId: binding.receiverResponseId,
      parameterContextId: binding.parameterContextId,
      inputSignalId: binding.inputSignalId,
      inputUnit: binding.inputUnit,
      workingRange: binding.workingRange,
    },
  };
  const receiver = {
    id: 'literature-receiver',
    name: 'Literature receiver',
    kind: 'processing' as const,
    x: 1,
    y: 0,
    parameters: {
      baseline: 0,
      gain: 1,
      parameterStatus: 'normalized-demo' as const,
      provenance: 'catalog-reference' as const,
    },
    inputPorts: [
      {
        id: 'literature-receiver-in',
        signalId: binding.inputSignalId,
        sensitivity: 1,
        direction: binding.direction,
        parameterStatus: 'normalized-demo' as const,
        provenance: 'catalog-reference' as const,
      },
    ],
    outputPorts: [
      {
        id: 'literature-receiver-out',
        signalId: binding.outputSignalId,
        strength: 1,
        parameterStatus: 'normalized-demo' as const,
        provenance: 'catalog-reference' as const,
      },
    ],
    receiverResponseBinding: binding,
  };
  const reporter = {
    id: 'reporter',
    name: 'Reporter',
    kind: 'output' as const,
    x: 2,
    y: 0,
    parameters: {
      baseline: 0,
      gain: 1,
      parameterStatus: 'normalized-demo' as const,
      provenance: 'development-fixture' as const,
    },
    inputPorts: [
      {
        id: 'reporter-in',
        signalId: binding.outputSignalId,
        sensitivity: 1,
        direction: 'activation' as const,
        parameterStatus: 'normalized-demo' as const,
        provenance: 'development-fixture' as const,
      },
    ],
    outputPorts: [],
  };
  return {
    schemaVersion: 2,
    id: 'bound-response-model',
    templateId: 'signal-gate',
    name: 'Bound response model',
    description: 'Bound response fixture',
    nodes: [source, receiver, reporter],
    edges: [
      {
        id: 'source-receiver',
        source: source.id,
        sourcePortId: source.outputPorts[0]!.id,
        target: receiver.id,
        targetPortId: receiver.inputPorts[0]!.id,
        signalId: binding.inputSignalId,
        enabled: true,
      },
      {
        id: 'receiver-reporter',
        source: receiver.id,
        sourcePortId: receiver.outputPorts[0]!.id,
        target: reporter.id,
        targetPortId: reporter.inputPorts[0]!.id,
        signalId: binding.outputSignalId,
        enabled: true,
      },
    ],
    outputNodeId: reporter.id,
    thresholds: [0.35, 0.68],
    recordReference: null,
    legacyReference: null,
    updatedAt: '2026-08-04T00:00:00.000Z',
    isDemo: true,
  };
}

function boundResponseBranch(responseId: string, prefix: string) {
  const binding = buildReceiverResponseBinding(loadAhlHslCatalogRelease().catalog, responseId);
  const source: ModelNode = {
    id: `${prefix}-source`,
    name: `${prefix} source`,
    kind: 'input',
    x: 0,
    y: 1,
    parameters: {
      baseline: binding.originalParameters.ec50,
      gain: 1,
      parameterStatus: 'normalized-demo',
      provenance: 'development-fixture',
    },
    inputPorts: [],
    outputPorts: [
      {
        id: `${prefix}-source-out`,
        signalId: binding.inputSignalId,
        strength: 1,
        parameterStatus: 'normalized-demo',
        provenance: 'development-fixture',
      },
    ],
    concentrationInputBinding: {
      targetNodeId: `${prefix}-receiver`,
      receiverResponseId: binding.receiverResponseId,
      parameterContextId: binding.parameterContextId,
      inputSignalId: binding.inputSignalId,
      inputUnit: binding.inputUnit,
      workingRange: binding.workingRange,
    },
  };
  const receiver: ModelNode = {
    id: `${prefix}-receiver`,
    name: `${prefix} receiver`,
    kind: 'processing',
    x: 1,
    y: 1,
    parameters: {
      baseline: 0,
      gain: 1,
      parameterStatus: 'normalized-demo',
      provenance: 'catalog-reference',
    },
    inputPorts: [
      {
        id: `${prefix}-receiver-in`,
        signalId: binding.inputSignalId,
        sensitivity: 1,
        direction: binding.direction,
        parameterStatus: 'normalized-demo',
        provenance: 'catalog-reference',
      },
    ],
    outputPorts: [
      {
        id: `${prefix}-receiver-out`,
        signalId: binding.outputSignalId,
        strength: 1,
        parameterStatus: 'normalized-demo',
        provenance: 'catalog-reference',
      },
    ],
    receiverResponseBinding: binding,
  };
  return {
    binding,
    source,
    receiver,
    sourceEdge: {
      id: `${prefix}-source-receiver`,
      source: source.id,
      sourcePortId: source.outputPorts[0]!.id,
      target: receiver.id,
      targetPortId: receiver.inputPorts[0]!.id,
      signalId: binding.inputSignalId,
      enabled: true,
    } satisfies NetworkModel['edges'][number],
  };
}

function oldModel(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'legacy-model',
    templateId: 'signal-gate',
    name: 'Legacy',
    description: 'Legacy fixture',
    nodes: [
      {
        id: 'sensor-a',
        name: 'A',
        kind: 'sensor',
        x: 0,
        y: 0,
        parameters: {
          input: 0.8,
          km: 0.5,
          hill: 2,
          gain: 1,
          bias: 0,
          responseTime: 1,
          retention: 0.5,
        },
      },
      {
        id: 'gate',
        name: 'Gate',
        kind: 'signal',
        x: 1,
        y: 0,
        parameters: {
          input: 0,
          km: 0.5,
          hill: 2,
          gain: 1,
          bias: 0,
          responseTime: 1,
          retention: 0.5,
        },
      },
      {
        id: 'reporter',
        name: 'Reporter',
        kind: 'reporter',
        x: 2,
        y: 0,
        parameters: {
          input: 0,
          km: 0.5,
          hill: 2,
          gain: 1,
          bias: 0,
          responseTime: 1,
          retention: 0.5,
        },
      },
    ],
    edges: [
      { id: 'legacy-a', source: 'sensor-a', target: 'gate', weight: 0.5, enabled: true },
      { id: 'legacy-g', source: 'gate', target: 'reporter', weight: -1, enabled: true },
    ],
    outputNodeId: 'reporter',
    thresholds: [0.35, 0.68],
    recordReference: { source: 'old-detection', recordId: 'record-x' },
    updatedAt: '2026-08-01T00:00:00.000Z',
    isDemo: true,
  };
}

describe('modeling domain core v2', () => {
  it('creates only input, processing, and output nodes with explicit molecular ports', () => {
    const model = createTemplate('licorice-quality', labels, '2026-08-03T00:00:00.000Z');
    expect(model.schemaVersion).toBe(2);
    expect(new Set(model.nodes.map((node) => node.kind))).toEqual(
      new Set<ModelNodeKind>(['input', 'processing', 'output']),
    );
    expect(
      model.nodes.every(
        (node) => Array.isArray(node.inputPorts) && Array.isArray(node.outputPorts),
      ),
    ).toBe(true);
    expect(model.edges.every((edge) => !('weight' in edge))).toBe(true);
    expect(validateNetworkModel(model)).toBe(true);
    expect(
      model.nodes
        .flatMap((node) => node.inputPorts)
        .every(
          (port) =>
            port.parameterStatus === 'normalized-demo' && port.provenance === 'development-fixture',
        ),
    ).toBe(true);
  });

  it('requires exact ports and signal IDs, then supports unique auto-selection', () => {
    const model = createTemplate('signal-gate', labels);
    expect(findUniqueCompatiblePortPair(model, 'sensor-a', 'gate')).toEqual({
      sourcePortId: 'sensor-a-out',
      targetPortId: 'gate-in-a',
      signalId: 'signal.sensor-a',
    });
    expect(getModelConnectionIssue(model, 'sensor-a', 'gate', 'sensor-a-out', 'gate-in-b')).toBe(
      'signal-mismatch',
    );
    expect(getModelConnectionIssue(model, 'gate', 'reporter', 'gate-out', 'reporter-in')).toBe(
      'duplicate-connection',
    );
    expect(getModelConnectionIssue(model, 'reporter', 'gate')).toBe('source-has-no-output');
    expect(getModelConnectionIssue(model, 'sensor-a', 'sensor-a')).toBe('self-connection');
    expect(() =>
      connectModelNodes(model, {
        sourceNodeId: 'sensor-a',
        targetNodeId: 'gate',
        sourcePortId: 'sensor-a-out',
        targetPortId: 'gate-in-a',
        edgeId: 'duplicate',
      }),
    ).toThrow('duplicate-connection');
    expect(() =>
      connectModelNodes(model, {
        sourceNodeId: 'sensor-a',
        targetNodeId: 'gate',
        sourcePortId: 'sensor-a-out',
        targetPortId: 'gate-in-b',
      }),
    ).toThrow('signal-mismatch');
  });

  it('aggregates multiple inputs and inhibition in bounded steady state', () => {
    const activation = createTemplate('licorice-quality', labels);
    const activationResult = simulateNetwork(activation, { now: '2026-08-03T00:00:00.000Z' });
    expect(activationResult.simulationMode).toBe('steady-state');
    expect(activationResult.isSteadyState).toBe(true);
    expect(activationResult.convergence.converged).toBe(true);
    expect(activationResult.outputValue).toBeGreaterThan(0);
    expect(activationResult.outputValue).toBeLessThanOrEqual(1);
    expect(activationResult.startedAt).toBe(activationResult.completedAt);
    const inhibited = {
      ...activation,
      nodes: activation.nodes.map((node) =>
        node.id === 'integration'
          ? {
              ...node,
              inputPorts: node.inputPorts.map((port) =>
                port.id === 'integration-in-a'
                  ? { ...port, direction: 'inhibition' as const }
                  : port,
              ),
            }
          : node,
      ),
    };
    expect(validateNetworkModel(inhibited)).toBe(true);
    const inhibitedResult = simulateNetwork(inhibited);
    expect(inhibitedResult.outputValue).toBeLessThan(activationResult.outputValue);
  });

  it('reports bounded iteration for a feedback cycle without time frames', () => {
    const result = simulateNetwork(createTemplate('feedback-loop', labels), { maxIterations: 50 });
    expect(result.convergence.iterations).toBeLessThanOrEqual(50);
    expect(result.finalValues).toHaveProperty('reporter');
    expect('frames' in result).toBe(false);
  });

  it('migrates weighted v1 edges into traceable normalized input ports', () => {
    const migrated = migrateNetworkModelV1ToV2(oldModel(), '2026-08-03T00:00:00.000Z');
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.nodes.map((node) => node.kind)).toEqual(['input', 'processing', 'output']);
    expect(migrated.edges.every((edge) => !('weight' in edge))).toBe(true);
    const migratedInput = migrated.nodes
      .find((node) => node.id === 'gate')
      ?.inputPorts.find((port) => port.id === 'legacy.input.legacy-a.0');
    expect(migratedInput).toMatchObject({
      sensitivity: 0.5,
      direction: 'activation',
      parameterStatus: 'legacy-demo',
      provenance: 'legacy-demo',
      signalId: 'legacy.signal.legacy-a.0',
    });
    const migratedInhibition = migrated.nodes
      .find((node) => node.id === 'reporter')
      ?.inputPorts.find((port) => port.id === 'legacy.input.legacy-g.1');
    expect(migratedInhibition?.direction).toBe('inhibition');
    expect(migrated.legacyReference).toEqual({ source: 'old-detection', recordId: 'record-x' });
    expect(validateNetworkModel(migrated)).toBe(true);
  });

  it('does not run calibration-required or reference-only parameters', () => {
    const model = createTemplate('signal-gate', labels);
    const blocked = {
      ...model,
      nodes: model.nodes.map((node) =>
        node.id === 'gate'
          ? {
              ...node,
              parameters: { ...node.parameters, parameterStatus: 'calibration-required' as const },
            }
          : node,
      ),
    };
    expect(() => simulateNetwork(blocked)).toThrow('MODEL_PARAMETERS_NOT_RUNNABLE');
  });

  it('rejects invalid edge weight, ports, ranges, references, and output node', () => {
    const model = createTemplate('signal-gate', labels);
    expect(validateNetworkModel({ ...model, edges: [{ ...model.edges[0], weight: 1 }] })).toBe(
      false,
    );
    expect(
      validateNetworkModel({
        ...model,
        edges: [{ ...model.edges[0], signalId: 'wrong' }, ...model.edges.slice(1)],
      }),
    ).toBe(false);
    expect(
      validateNetworkModel({
        ...model,
        nodes: model.nodes.map((node) =>
          node.id === 'gate'
            ? {
                ...node,
                inputPorts: [
                  { ...node.inputPorts[0], sensitivity: -1 },
                  ...node.inputPorts.slice(1),
                ],
              }
            : node,
        ),
      }),
    ).toBe(false);
    expect(validateNetworkModel({ ...model, outputNodeId: 'gate' })).toBe(false);
  });

  it('keeps detection linkage reference-only and leaves node parameters unchanged', () => {
    const model = createTemplate('signal-gate', labels);
    const snapshot = model.nodes.map((node) => ({
      id: node.id,
      parameters: node.parameters,
      inputPorts: node.inputPorts,
      outputPorts: node.outputPorts,
    }));
    const record = {
      id: 'record-1',
      sampleId: 'S-1',
      createdAt: '2026-08-03T00:00:00.000Z',
      origin: 'real-live',
      isDemo: false,
      resultStatus: 'RAW_ONLY',
      qualityGrade: null,
      syncState: 'local-only',
      result: {
        schemaVersion: 1,
        sessionId: 'x',
        sampleId: 'S-1',
        resultStatus: 'RAW_ONLY',
        frames: [],
        protocolVersion: 'x',
        algorithmVersion: null,
        calibrationVersion: null,
        isDemo: false,
        disclaimer: 'Raw only',
      },
    } as unknown as HistoryRecord;
    const linked = linkDetectionRecord(model, record, '2026-08-03T01:00:00.000Z');
    expect(linked.recordReference?.recordId).toBe('record-1');
    expect(
      linked.nodes.map((node) => ({
        id: node.id,
        parameters: node.parameters,
        inputPorts: node.inputPorts,
        outputPorts: node.outputPorts,
      })),
    ).toEqual(snapshot);
  });

  it('validates trusted receiver topology, metadata, and disconnected application state', () => {
    const model = boundResponseModel();
    expect(validateNetworkModel(model)).toBe(true);
    const disconnected = {
      ...model,
      edges: model.edges.filter((edge) => edge.target !== 'literature-receiver'),
    };
    expect(validateNetworkModel(disconnected)).toBe(true);
    expect(simulateNetwork(disconnected).outputValue).toBe(0);

    const tampered = {
      ...model,
      nodes: model.nodes.map((node) =>
        node.id === 'literature-receiver'
          ? {
              ...node,
              parameters: { ...node.parameters, parameterStatus: 'team-calibrated' as const },
            }
          : node,
      ),
    };
    expect(validateNetworkModel(tampered)).toBe(false);
    expect(() => simulateNetwork(tampered)).toThrow('MODEL_RECEIVER_RESPONSE_TOPOLOGY_INVALID');

    const withLegacyWeight = {
      ...model,
      nodes: model.nodes.map((node) =>
        node.id === 'literature-receiver'
          ? {
              ...node,
              inputPorts: [{ ...node.inputPorts[0]!, weight: 1 }],
            }
          : node,
      ),
    };
    expect(validateNetworkModel(withLegacyWeight)).toBe(false);

    const normalizedSource = {
      ...model.nodes[0]!,
      id: 'normalized-processing-source',
      kind: 'processing' as const,
      inputPorts: [
        {
          id: 'normalized-processing-source-in',
          signalId: 'normalized.input',
          sensitivity: 1,
          direction: 'activation' as const,
          parameterStatus: 'normalized-demo' as const,
          provenance: 'development-fixture' as const,
        },
      ],
      outputPorts: [
        { ...model.nodes[0]!.outputPorts[0]!, id: 'normalized-processing-source-out' },
      ],
    };
    const disconnectedWithNormalizedSource = {
      ...model,
      nodes: [...model.nodes, normalizedSource],
      edges: model.edges.filter((edge) => edge.target !== 'literature-receiver'),
    };
    expect(
      getModelConnectionIssue(
        disconnectedWithNormalizedSource,
        normalizedSource.id,
        'literature-receiver',
        normalizedSource.outputPorts[0]!.id,
        'literature-receiver-in',
      ),
    ).toBe('bound-response-requires-concentration-input');
    expect(() =>
      connectModelNodes(disconnectedWithNormalizedSource, {
        sourceNodeId: normalizedSource.id,
        targetNodeId: 'literature-receiver',
        sourcePortId: normalizedSource.outputPorts[0]!.id,
        targetPortId: 'literature-receiver-in',
      }),
    ).toThrow('bound-response-requires-concentration-input');

    const withNormalizedIncoming = {
      ...model,
      nodes: model.nodes.map((node) =>
        node.id === 'molecule-source'
          ? {
              ...node,
              kind: 'processing' as const,
              inputPorts: normalizedSource.inputPorts,
            }
          : node,
      ),
    };
    expect(validateNetworkModel(withNormalizedIncoming)).toBe(false);
    expect(() => simulateNetwork(withNormalizedIncoming)).toThrow(
      'bound-response-requires-concentration-input',
    );

    const secondSource = {
      ...model.nodes[0]!,
      id: 'molecule-source-2',
      outputPorts: [{ ...model.nodes[0]!.outputPorts[0]!, id: 'molecule-source-2-out' }],
    };
    const modelWithSecondSource = {
      ...model,
      nodes: [...model.nodes, secondSource],
    };
    expect(
      getModelConnectionIssue(
        modelWithSecondSource,
        secondSource.id,
        'literature-receiver',
        secondSource.outputPorts[0]!.id,
        'literature-receiver-in',
      ),
    ).toBe('bound-response-input-occupied');
    expect(() =>
      connectModelNodes(modelWithSecondSource, {
        sourceNodeId: secondSource.id,
        targetNodeId: 'literature-receiver',
        sourcePortId: secondSource.outputPorts[0]!.id,
        targetPortId: 'literature-receiver-in',
      }),
    ).toThrow('bound-response-input-occupied');
    expect(
      getModelConnectionIssue(
        modelWithSecondSource,
        secondSource.id,
        'literature-receiver',
        secondSource.outputPorts[0]!.id,
        'literature-receiver-in',
        'source-receiver',
      ),
    ).toBeNull();
    const withDisabledOriginalInput = {
      ...modelWithSecondSource,
      edges: model.edges.map((edge) =>
        edge.id === 'source-receiver' ? { ...edge, enabled: false } : edge,
      ),
    };
    expect(
      getModelConnectionIssue(
        withDisabledOriginalInput,
        secondSource.id,
        'literature-receiver',
        secondSource.outputPorts[0]!.id,
        'literature-receiver-in',
      ),
    ).toBeNull();
    const connectedAfterDisabledInput = connectModelNodes(withDisabledOriginalInput, {
      sourceNodeId: secondSource.id,
      targetNodeId: 'literature-receiver',
      sourcePortId: secondSource.outputPorts[0]!.id,
      targetPortId: 'literature-receiver-in',
      edgeId: 'source-2-receiver-enabled',
    });
    expect(validateNetworkModel(connectedAfterDisabledInput)).toBe(true);
    expect(
      connectedAfterDisabledInput.edges.filter(
        (edge) => edge.enabled && edge.target === 'literature-receiver',
      ),
    ).toHaveLength(1);
    const withMultipleIncoming = {
      ...modelWithSecondSource,
      edges: [
        ...model.edges,
        {
          ...model.edges[0]!,
          id: 'source-2-receiver',
          source: secondSource.id,
          sourcePortId: secondSource.outputPorts[0]!.id,
        },
      ],
    };
    expect(validateNetworkModel(withMultipleIncoming)).toBe(false);
    expect(() => simulateNetwork(withMultipleIncoming)).toThrow(
      'MODEL_RECEIVER_RESPONSE_MULTIPLE_INCOMING',
    );
  });

  it('round-trips and validates concentration input binding metadata', () => {
    const model = boundResponseModel();
    const roundTripped: unknown = JSON.parse(JSON.stringify(model));
    expect(validateNetworkModel(roundTripped)).toBe(true);
    if (!validateNetworkModel(roundTripped)) throw new Error('expected valid round trip');
    expect(roundTripped.nodes[0]?.concentrationInputBinding).toEqual(
      model.nodes[0]?.concentrationInputBinding,
    );

    const withMutation = (mutate: (binding: Record<string, unknown>) => void): unknown => {
      const candidate: unknown = structuredClone(model);
      if (!candidate || typeof candidate !== 'object' || !('nodes' in candidate)) return candidate;
      const nodes = candidate.nodes;
      if (!Array.isArray(nodes)) return candidate;
      const source: unknown = nodes.find(
        (node: unknown) =>
          typeof node === 'object' && node !== null && 'id' in node && node.id === 'molecule-source',
      );
      if (
        typeof source === 'object' &&
        source !== null &&
        'concentrationInputBinding' in source &&
        typeof source.concentrationInputBinding === 'object' &&
        source.concentrationInputBinding !== null
      ) {
        mutate(source.concentrationInputBinding as Record<string, unknown>);
      }
      return candidate;
    };

    expect(
      validateNetworkModel(
        withMutation((binding) => {
          binding.targetNodeId = 'missing-receiver';
        }),
      ),
    ).toBe(false);
    expect(
      validateNetworkModel(
        withMutation((binding) => {
          binding.receiverResponseId = 'resp.stale';
        }),
      ),
    ).toBe(false);
    expect(
      validateNetworkModel(
        withMutation((binding) => {
          binding.parameterContextId = 'ctx.stale';
        }),
      ),
    ).toBe(false);
    expect(
      validateNetworkModel(
        withMutation((binding) => {
          binding.inputSignalId = 'ahl.stale';
        }),
      ),
    ).toBe(false);
    expect(
      validateNetworkModel(
        withMutation((binding) => {
          binding.inputUnit = 'mM';
        }),
      ),
    ).toBe(false);
    expect(
      validateNetworkModel(
        withMutation((binding) => {
          binding.workingRange = { min: 0.1, max: 0.01, unit: 'M' };
        }),
      ),
    ).toBe(false);
    expect(
      validateNetworkModel(
        withMutation((binding) => {
          binding.workingRange = {
            ...(binding.workingRange as Record<string, unknown>),
            max: model.nodes[0]!.concentrationInputBinding!.workingRange.max / 2,
          };
        }),
      ),
    ).toBe(false);

    const withScaledConcentration = structuredClone(model);
    withScaledConcentration.nodes = withScaledConcentration.nodes.map((node) =>
      node.id === 'molecule-source'
        ? {
            ...node,
            outputPorts: node.outputPorts.map((port) => ({ ...port, strength: 0.5 })),
          }
        : node,
    );
    expect(validateNetworkModel(withScaledConcentration)).toBe(false);

    const nonInput = structuredClone(model);
    nonInput.nodes = nonInput.nodes.map((node) =>
      node.id === 'molecule-source'
        ? {
            ...node,
            kind: 'processing' as const,
            inputPorts: [
              {
                id: 'molecule-source-in',
                signalId: 'external.concentration',
                sensitivity: 1,
                direction: 'activation' as const,
                parameterStatus: 'normalized-demo' as const,
                provenance: 'development-fixture' as const,
              },
            ],
          }
        : node,
    );
    expect(validateNetworkModel(nonInput)).toBe(false);
  });

  it('prevents parameter-context conflicts only when a branch reaches the main output', () => {
    const model = boundResponseModel();
    const differentContext = boundResponseBranch(
      'resp.shong2013.esar-wt-pesar.3oc6',
      'different-context',
    );
    const reporterInput = {
      id: 'reporter-in-different-context',
      signalId: differentContext.binding.outputSignalId,
      sensitivity: 1,
      direction: 'activation' as const,
      parameterStatus: 'normalized-demo' as const,
      provenance: 'development-fixture' as const,
    };
    const unreachableDifferentContext = {
      ...model,
      nodes: [
        ...model.nodes.map((node) =>
          node.id === 'reporter'
            ? { ...node, inputPorts: [...node.inputPorts, reporterInput] }
            : node,
        ),
        differentContext.source,
        differentContext.receiver,
      ],
      edges: [...model.edges, differentContext.sourceEdge],
    };
    expect(validateNetworkModel(unreachableDifferentContext)).toBe(true);
    expect(
      getModelConnectionIssue(
        unreachableDifferentContext,
        differentContext.receiver.id,
        'reporter',
        differentContext.receiver.outputPorts[0]!.id,
        reporterInput.id,
      ),
    ).toBe('parameter-context-conflict');
    expect(() =>
      connectModelNodes(unreachableDifferentContext, {
        sourceNodeId: differentContext.receiver.id,
        targetNodeId: 'reporter',
        sourcePortId: differentContext.receiver.outputPorts[0]!.id,
        targetPortId: reporterInput.id,
      }),
    ).toThrow('parameter-context-conflict');

    const disabledConnection = {
      id: 'different-context-reporter-disabled',
      source: differentContext.receiver.id,
      sourcePortId: differentContext.receiver.outputPorts[0]!.id,
      target: 'reporter',
      targetPortId: reporterInput.id,
      signalId: differentContext.binding.outputSignalId,
      enabled: false,
    };
    expect(
      validateNetworkModel({
        ...unreachableDifferentContext,
        edges: [...unreachableDifferentContext.edges, disabledConnection],
      }),
    ).toBe(true);

    const sameContext = boundResponseBranch('resp.kylilis2018.rhl.c4', 'same-context');
    const sameContextReporterInput = {
      ...reporterInput,
      id: 'reporter-in-same-context',
      signalId: sameContext.binding.outputSignalId,
    };
    const unreachableSameContext = {
      ...model,
      nodes: [
        ...model.nodes.map((node) =>
          node.id === 'reporter'
            ? { ...node, inputPorts: [...node.inputPorts, sameContextReporterInput] }
            : node,
        ),
        sameContext.source,
        sameContext.receiver,
      ],
      edges: [...model.edges, sameContext.sourceEdge],
    };
    expect(
      getModelConnectionIssue(
        unreachableSameContext,
        sameContext.receiver.id,
        'reporter',
        sameContext.receiver.outputPorts[0]!.id,
        sameContextReporterInput.id,
      ),
    ).toBeNull();
    expect(
      validateNetworkModel(
        connectModelNodes(unreachableSameContext, {
          sourceNodeId: sameContext.receiver.id,
          targetNodeId: 'reporter',
          sourcePortId: sameContext.receiver.outputPorts[0]!.id,
          targetPortId: sameContextReporterInput.id,
        }),
      ),
    ).toBe(true);
  });
});
