import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import type { BfnProject, BfnStaticModel } from './types';
import { addIdealConnection, validateBfnProject } from './validation';
import {
  createInitialSignalPoolAuthoringState,
  type SignalPoolAuthoringState,
} from './user-defined/signal-pool/signalPoolContract';
import { buildSignalPoolDraft } from './user-defined/signal-pool/signalPoolDraft';
import { materializeSignalPool } from './user-defined/signal-pool/signalPoolMaterialization';

function poolState(): SignalPoolAuthoringState {
  return {
    ...createInitialSignalPoolAuthoringState(),
    name: 'Runtime Signal Pool',
    signalMode: 'custom',
    customSignalName: 'Runtime signal',
    concentrationUnit: 'nM',
    initialConcentration: '2',
  };
}

function emptyProject(mode: 'static' | 'dynamic'): BfnProject {
  const project = createDemoBfnProject();
  project.network = {
    ...project.network,
    id: `network-signal-pool-${mode}`,
    mode,
    inputSources: [],
    modules: [],
    outputMonitors: [],
    edges: [],
  };
  project.registry.validityDomains = [];
  return project;
}

function materializePool(project: BfnProject) {
  const built = buildSignalPoolDraft(poolState(), project);
  if (!built.ok) throw new Error('Expected runtime Signal Pool draft.');
  const result = materializeSignalPool(built.draft, project);
  if (!result.ok) throw new Error('Expected runtime Signal Pool materialization.');
  const module = result.nextProject.network.modules.find(({ id }) => id === result.addedModuleId);
  if (!module) throw new Error('Materialized Signal Pool is missing.');
  return { project: result.nextProject, module };
}

function attachRateSourceAndMonitor(project: BfnProject, moduleId: string): BfnProject {
  const module = project.network.modules.find(({ id }) => id === moduleId)!;
  const input = module.inputPorts[0]!;
  const output = module.outputPorts[0]!;
  project.network.inputSources.push({
    kind: 'input_source',
    id: 'source-signal-pool-rate',
    labelKey: 'bfn.testing.accumulatorRate',
    outputPort: {
      id: 'port-signal-pool-rate-source',
      entity: input.entity,
      quantityType: 'production_rate',
      unit: 'nM/h',
      direction: 'output',
    },
    staticSpecification: { type: 'fixed_value', value: 10, unit: 'nM/h' },
    dynamicSpecification: { type: 'constant', value: 10, unit: 'nM/h' },
    position: { x: 20, y: 160 },
  });
  project.network.outputMonitors.push({
    kind: 'output_monitor',
    id: 'monitor-signal-pool-concentration',
    labelKey: 'bfn.testing.accumulatorState',
    inputPort: {
      id: 'port-signal-pool-monitor',
      entity: output.entity,
      quantityType: 'concentration',
      unit: 'nM',
      direction: 'input',
    },
    position: { x: 700, y: 160 },
  });
  let next = addIdealConnection(
    project,
    { nodeId: 'source-signal-pool-rate', portId: 'port-signal-pool-rate-source' },
    { nodeId: module.id, portId: input.id },
    'edge-rate-to-signal-pool',
  );
  next = addIdealConnection(
    next,
    { nodeId: module.id, portId: output.id },
    { nodeId: 'monitor-signal-pool-concentration', portId: 'port-signal-pool-monitor' },
    'edge-signal-pool-to-monitor',
  );
  return next;
}

describe('production Signal Pool runtime integration', () => {
  it('uses BFN-SIM 2.2 deferred accumulator semantics for 10 nM/h, C0 2, and dt 0.5 h', () => {
    const materialized = materializePool(emptyProject('dynamic'));
    const project = attachRateSourceAndMonitor(materialized.project, materialized.module.id);
    project.analysis.durationHours = 1.5;
    project.analysis.timeStepHours = 0.5;
    const result = runBfnSimulation(project, '2026-09-02T01:00:00.000Z');

    expect(result.engineVersion).toBe('BFN-SIM-2.2');
    expect(result.points.map((point) => point.timeHours)).toEqual([0, 0.5, 1, 1.5]);
    expect(result.points.map((point) => point.output)).toEqual([2, 7, 12, 17]);
    expect(
      validateBfnProject(project, { targetMonitorId: 'monitor-signal-pool-concentration' }).filter(
        (issue) => issue.code === 'accumulator_model_contract_invalid',
      ),
    ).toEqual([]);
    expect(
      result.uncertaintySnapshot.modules.find(
        ({ moduleId }) => moduleId === materialized.module.id,
      ),
    ).toMatchObject({
      method: 'none',
      intervalExecutable: true,
      reason: null,
      propagationMode: 'deterministic_transform',
    });
  });

  it('adds successfully in static mode without a fake model and remains temporally blocked on a target path', () => {
    const materialized = materializePool(emptyProject('static'));
    const project = attachRateSourceAndMonitor(materialized.project, materialized.module.id);
    const issues = validateBfnProject(project, {
      targetMonitorId: 'monitor-signal-pool-concentration',
    });

    expect(project.network.mode).toBe('static');
    expect(materialized.module.activeModelIds).toEqual({
      dynamic: materialized.module.modelVariants[0]?.id,
    });
    expect(materialized.module.modelVariants.some((model) => model.mode === 'static')).toBe(false);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'temporal_execution_unsupported',
          subjectId: materialized.module.id,
        }),
      ]),
    );
    expect(() => runBfnSimulation(project)).toThrow(
      /BFN_VALIDATION_FAILED:.*temporal_execution_unsupported/u,
    );
  });

  it('passes a real upstream parameter envelope without becoming an uncertainty source', () => {
    const materialized = materializePool(emptyProject('dynamic'));
    const project = attachEnvelopeRateProducer(materialized.project, materialized.module.id);
    project.analysis.durationHours = 1;
    project.analysis.timeStepHours = 0.5;
    const result = runBfnSimulation(project, '2026-09-02T01:00:00.000Z');

    expect(result.points.map((point) => point.output)).toEqual([2, 7, 12]);
    expect(result.points.map((point) => point.lower)).toEqual([2, 4.5, 7]);
    expect(result.points.map((point) => point.upper)).toEqual([2, 9.5, 17]);
    expect(result.uncertaintySnapshot).toMatchObject({
      status: 'available',
      method: 'parameter_interval_envelope',
    });
    expect(
      result.uncertaintySnapshot.modules.find(
        ({ moduleId }) => moduleId === 'module-signal-pool-rate-producer',
      ),
    ).toMatchObject({ propagationMode: 'parameter_interval' });
    expect(
      result.uncertaintySnapshot.modules.find(
        ({ moduleId }) => moduleId === materialized.module.id,
      ),
    ).toMatchObject({
      method: 'none',
      intervalExecutable: true,
      reason: null,
      propagationMode: 'deterministic_transform',
    });
  });
});

function attachEnvelopeRateProducer(project: BfnProject, poolId: string): BfnProject {
  const pool = project.network.modules.find(({ id }) => id === poolId)!;
  const poolInput = pool.inputPorts[0]!;
  const poolOutput = pool.outputPorts[0]!;
  const producerInputId = 'port-signal-pool-rate-producer-in';
  const producerOutputId = 'port-signal-pool-rate-producer-out';
  const model: BfnStaticModel = {
    id: 'model-signal-pool-rate-producer',
    version: 'test.1',
    mode: 'static',
    family: 'linear_transfer',
    response: {
      family: 'linear_transfer',
      inputPortId: producerInputId,
      scale: { value: 1, unit: 'dimensionless', interval95: [0.5, 1.5] },
      intercept: { value: 0, unit: 'nM/h', interval95: [0, 0] },
    },
    contextId: null,
    validityDomainId: 'domain-signal-pool-rate-producer',
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'parameter_interval_envelope',
    isDemo: true,
  };
  project.network.inputSources.push({
    kind: 'input_source',
    id: 'source-signal-pool-rate-control',
    labelKey: 'bfn.testing.accumulatorRate',
    outputPort: {
      id: 'port-signal-pool-rate-control',
      entity: 'entity.signal-pool-rate-control',
      quantityType: 'concentration',
      unit: 'nM',
      direction: 'output',
    },
    staticSpecification: { type: 'fixed_value', value: 10, unit: 'nM' },
    dynamicSpecification: { type: 'constant', value: 10, unit: 'nM' },
    position: { x: 20, y: 160 },
  });
  project.network.modules.push({
    kind: 'functional_module',
    id: 'module-signal-pool-rate-producer',
    labelKey: 'bfn.testing.uncertaintyRateProducer',
    descriptionKey: 'bfn.testing.uncertaintyRateProducerDescription',
    inputPorts: [
      {
        id: producerInputId,
        entity: 'entity.signal-pool-rate-control',
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: producerOutputId,
        entity: poolInput.entity,
        quantityType: 'production_rate',
        unit: 'nM/h',
        direction: 'output',
      },
    ],
    modelVariants: [model],
    activeModelIds: { static: model.id },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 200, y: 160 },
    isDemo: true,
  });
  project.network.outputMonitors.push({
    kind: 'output_monitor',
    id: 'monitor-signal-pool-envelope',
    labelKey: 'bfn.testing.accumulatorState',
    inputPort: {
      id: 'port-signal-pool-envelope-monitor',
      entity: poolOutput.entity,
      quantityType: 'concentration',
      unit: 'nM',
      direction: 'input',
    },
    position: { x: 700, y: 160 },
  });
  project.registry.validityDomains.push({
    id: model.validityDomainId,
    labelKey: 'bfn.testing.uncertaintyRateProducerDomain',
    inputRanges: [{ portId: producerInputId, minimum: 0, maximum: 20, unit: 'nM' }],
    contextId: null,
  });

  let next = addIdealConnection(
    project,
    { nodeId: 'source-signal-pool-rate-control', portId: 'port-signal-pool-rate-control' },
    { nodeId: 'module-signal-pool-rate-producer', portId: producerInputId },
    'edge-signal-pool-control-to-rate',
  );
  next = addIdealConnection(
    next,
    { nodeId: 'module-signal-pool-rate-producer', portId: producerOutputId },
    { nodeId: pool.id, portId: poolInput.id },
    'edge-signal-pool-rate-to-pool',
  );
  return addIdealConnection(
    next,
    { nodeId: pool.id, portId: poolOutput.id },
    { nodeId: 'monitor-signal-pool-envelope', portId: 'port-signal-pool-envelope-monitor' },
    'edge-signal-pool-envelope-monitor',
  );
}
