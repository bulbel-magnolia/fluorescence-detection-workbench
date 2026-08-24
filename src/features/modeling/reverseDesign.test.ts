import { describe, expect, it } from 'vitest';
import { createTemplate } from './modelingCore';
import { applyReverseDesignCandidate, solveReverseDesign } from './reverseDesign';
import { buildReceiverResponseBinding } from './receiverResponseEvaluator';
import { loadAhlHslCatalogRelease } from './catalog/v2/catalogReleaseLoader';
import type { NetworkModel, TemplateLabels } from './types';

const labels: TemplateLabels = {
  modelName: 'Reverse test',
  description: 'Test',
  nodes: {
    sensorA: 'A',
    sensorB: 'B',
    sensorC: 'C',
    integration: 'Integration',
    gate: 'Gate',
    memory: 'Memory',
    response: 'Response',
    reporter: 'Reporter',
  },
};

function boundInputModel(): NetworkModel {
  const binding = buildReceiverResponseBinding(
    loadAhlHslCatalogRelease().catalog,
    'resp.kylilis2018.rhl.c4',
  );
  const source = {
    id: 'source',
    name: 'Source',
    kind: 'input' as const,
    x: 0,
    y: 0,
    parameters: {
      baseline: 0,
      gain: 1,
      parameterStatus: 'normalized-demo' as const,
      provenance: 'development-fixture' as const,
    },
    inputPorts: [],
    outputPorts: [
      {
        id: 'source-out',
        signalId: binding.inputSignalId,
        strength: 1,
        parameterStatus: 'normalized-demo' as const,
        provenance: 'development-fixture' as const,
      },
    ],
  };
  const receiver = {
    id: 'receiver',
    name: 'Receiver',
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
        id: 'receiver-in',
        signalId: binding.inputSignalId,
        sensitivity: 1,
        direction: binding.direction,
        parameterStatus: 'normalized-demo' as const,
        provenance: 'catalog-reference' as const,
      },
    ],
    outputPorts: [
      {
        id: 'receiver-out',
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
    id: 'bound-reverse-model',
    templateId: 'signal-gate',
    name: 'Bound reverse model',
    description: 'Bound reverse fixture',
    nodes: [source, receiver, reporter],
    edges: [
      {
        id: 'source-receiver',
        source: source.id,
        sourcePortId: 'source-out',
        target: receiver.id,
        targetPortId: 'receiver-in',
        signalId: binding.inputSignalId,
        enabled: true,
      },
      {
        id: 'receiver-reporter',
        source: receiver.id,
        sourcePortId: 'receiver-out',
        target: reporter.id,
        targetPortId: 'reporter-in',
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

function withDisconnectedInput(model: NetworkModel, baseline: number): NetworkModel {
  const source = model.nodes.find((node) => node.kind === 'input');
  if (!source) throw new Error('Expected an input fixture.');
  const disconnected: NetworkModel['nodes'][number] = {
    ...structuredClone(source),
    id: 'disconnected-input',
    name: 'Disconnected input',
    parameters: { ...source.parameters, baseline },
    outputPorts: source.outputPorts.map((port, index) => ({
      ...port,
      id: `disconnected-output-${index + 1}`,
    })),
  };
  return { ...model, nodes: [...model.nodes, disconnected] };
}

describe('reverse design', () => {
  it('returns deterministic ranked illustrative candidates', () => {
    const model = createTemplate('signal-gate', labels);
    const first = solveReverseDesign(model, 0.7);
    const second = solveReverseDesign(model, 0.7);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((item) => item.isDemo)).toBe(true);
    expect(first.map((item) => item.distance)).toEqual(
      [...first.map((item) => item.distance)].sort((left, right) => left - right),
    );
  });

  it('excludes disconnected inputs from candidates and leaves them unchanged when applying', () => {
    const model = withDisconnectedInput(boundInputModel(), 0.91);
    const changedDisconnectedBaseline = structuredClone(model);
    const disconnected = changedDisconnectedBaseline.nodes.find(
      (node) => node.id === 'disconnected-input',
    );
    if (!disconnected) throw new Error('Expected the disconnected input.');
    disconnected.parameters.baseline = 0.13;

    const candidates = solveReverseDesign(model, 0.6, 3);
    expect(candidates).toEqual(solveReverseDesign(changedDisconnectedBaseline, 0.6, 3));
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((item) => Object.keys(item.inputs).join(',') === 'source')).toBe(true);

    const selected = candidates[0];
    if (!selected) throw new Error('Expected a reverse-design candidate.');
    const applied = applyReverseDesignCandidate(model, {
      ...selected,
      inputs: { ...selected.inputs, 'disconnected-input': 0.02 },
    });
    expect(
      applied.nodes.find((node) => node.id === 'disconnected-input')?.parameters.baseline,
    ).toBe(0.91);
  });

  it('treats an input behind a disabled edge as unreachable', () => {
    const model = boundInputModel();
    const disabled = {
      ...model,
      edges: model.edges.map((edge) =>
        edge.id === 'source-receiver' ? { ...edge, enabled: false } : edge,
      ),
    };

    expect(solveReverseDesign(disabled, 0.5)).toEqual([]);
    const applied = applyReverseDesignCandidate(disabled, {
      id: 'irrelevant-disabled-input',
      inputs: { source: 0.8 },
      outputValue: 0,
      outputBand: 'low',
      distance: 0.5,
      isDemo: true,
    });
    expect(applied.nodes.find((node) => node.id === 'source')?.parameters.baseline).toBe(0);
  });

  it('requires every input that can reach the primary output', () => {
    const model = createTemplate('signal-gate', labels);
    const selected = solveReverseDesign(model, 0.4, 1)[0];
    if (!selected) throw new Error('Expected a reverse-design candidate.');
    expect(Object.keys(selected.inputs).sort()).toEqual(['sensor-a', 'sensor-b']);

    const missing = { ...selected.inputs };
    delete missing['sensor-b'];
    expect(() => applyReverseDesignCandidate(model, { ...selected, inputs: missing })).toThrow(
      'REVERSE_DESIGN_INPUT_MISSING',
    );
  });

  it('applies only normalized sensor inputs', () => {
    const model = createTemplate('signal-gate', labels);
    const selected = solveReverseDesign(model, 0.3, 1)[0];
    if (!selected) throw new Error('Expected one reverse-design candidate.');
    const applied = applyReverseDesignCandidate(model, selected);
    expect(applied.id).toBe(model.id);
    expect(applied.edges).toEqual(model.edges);
    expect(
      applied.nodes
        .filter((node) => node.kind === 'input')
        .every((node) => node.parameters.baseline >= 0 && node.parameters.baseline <= 1),
    ).toBe(true);
  });

  it('rejects an out-of-range reverse target instead of clamping it', () => {
    expect(() => solveReverseDesign(createTemplate('signal-gate', labels), 1.01)).toThrow(
      'REVERSE_DESIGN_TARGET_OUT_OF_RANGE',
    );
    expect(() => solveReverseDesign(createTemplate('signal-gate', labels), -0.01)).toThrow(
      'REVERSE_DESIGN_TARGET_OUT_OF_RANGE',
    );
  });

  it('keeps zero as a valid concentration and rejects applied values outside the intersected range', () => {
    const model = boundInputModel();
    const receiver = model.nodes.find((node) => node.id === 'receiver');
    if (!receiver?.receiverResponseBinding) throw new Error('Expected bound receiver.');
    const selected = {
      id: 'candidate-zero',
      inputs: { source: 0 },
      outputValue: 0,
      outputBand: 'low' as const,
      distance: 0,
      isDemo: true as const,
    };
    expect(applyReverseDesignCandidate(model, selected).nodes[0]?.parameters.baseline).toBe(0);
    expect(() =>
      applyReverseDesignCandidate(model, {
        ...selected,
        id: 'candidate-out-of-range',
        inputs: { source: receiver.receiverResponseBinding!.workingRange.max * 2 },
      }),
    ).toThrow('REVERSE_DESIGN_INPUT_OUT_OF_RANGE');
  });
});
