import { describe, expect, it } from 'vitest';
import { createCatalogModule, createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import {
  assessBfnModelUncertainty,
  createBfnRunUncertaintySnapshot,
} from './simulationUncertainty';
import {
  ACCUMULATOR_INPUT_PORT_ID,
  ACCUMULATOR_MODULE_ID,
  ACCUMULATOR_OUTPUT_PORT_ID,
  createAccumulatorBfnProject,
  getAccumulatorModule,
} from './testing/accumulatorFixtures';
import type { BfnDynamicModel, BfnProject, BfnStaticModel, BfnUncertaintyMethod } from './types';
import { validateBfnProject } from './validation';

function selectedStaticModel(project = createDemoBfnProject()): BfnStaticModel {
  const module = project.network.modules[0]!;
  const model = module.modelVariants.find(
    (candidate) => candidate.id === module.activeModelIds.static,
  );
  if (model?.mode !== 'static') throw new Error('Expected selected static model');
  return model;
}

function selectedDynamicModel(project = createDemoBfnProject()): BfnDynamicModel {
  project.network.mode = 'dynamic';
  const module = project.network.modules[0]!;
  const model = module.modelVariants.find(
    (candidate) => candidate.id === module.activeModelIds.dynamic,
  );
  if (model?.mode !== 'dynamic' || model.family !== 'first_order') {
    throw new Error('Expected selected dynamic model');
  }
  return model;
}

function attachRateProducer(project: BfnProject, uncertaintyMethod: BfnUncertaintyMethod): string {
  const source = project.network.inputSources[0]!;
  source.outputPort = {
    ...source.outputPort,
    entity: 'entity.accumulator.rate-control',
    quantityType: 'concentration',
    unit: 'nM',
  };
  source.staticSpecification = { type: 'fixed_value', value: 10, unit: 'nM' };
  source.dynamicSpecification = { type: 'constant', value: 10, unit: 'nM' };
  const moduleId = 'module-uncertainty-rate-producer';
  const inputPortId = 'port-uncertainty-rate-producer-in';
  const outputPortId = 'port-uncertainty-rate-producer-out';
  const validityDomainId = 'domain-uncertainty-rate-producer';
  const model: BfnStaticModel = {
    id: 'model-uncertainty-rate-producer',
    version: 'test.1',
    mode: 'static',
    family: 'linear_transfer',
    response: {
      family: 'linear_transfer',
      inputPortId,
      scale: { value: 1, unit: 'dimensionless', interval95: [0.5, 1.5] },
      intercept: { value: 0, unit: 'nM/h', interval95: [0, 0] },
    },
    contextId: null,
    validityDomainId,
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod,
    isDemo: true,
  };
  project.network.modules.push({
    kind: 'functional_module',
    id: moduleId,
    labelKey: 'bfn.testing.uncertaintyRateProducer',
    descriptionKey: 'bfn.testing.uncertaintyRateProducerDescription',
    inputPorts: [
      {
        id: inputPortId,
        entity: source.outputPort.entity,
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: outputPortId,
        entity: getAccumulatorModule(project).inputPorts[0]!.entity,
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
    position: { x: 180, y: 160 },
    isDemo: true,
  });
  project.registry.validityDomains.push({
    id: validityDomainId,
    labelKey: 'bfn.testing.uncertaintyRateProducerDomain',
    inputRanges: [{ portId: inputPortId, minimum: 0, maximum: 20, unit: 'nM' }],
    contextId: null,
  });
  project.network.edges = project.network.edges.filter(
    (edge) => edge.id !== 'edge-accumulator-rate',
  );
  project.network.edges.push(
    {
      id: 'edge-control-uncertainty-rate-producer',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: moduleId, portId: inputPortId },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-uncertainty-rate-producer-accumulator',
      source: { nodeId: moduleId, portId: outputPortId },
      target: { nodeId: ACCUMULATOR_MODULE_ID, portId: ACCUMULATOR_INPUT_PORT_ID },
      mapping: 'identity',
      enabled: true,
    },
  );
  return moduleId;
}

function attachStaticReceiver(project: BfnProject): string {
  const accumulator = getAccumulatorModule(project);
  const moduleId = 'module-uncertainty-static-receiver';
  const inputPortId = 'port-uncertainty-static-receiver-in';
  const outputPortId = 'port-uncertainty-static-receiver-out';
  const validityDomainId = 'domain-uncertainty-static-receiver';
  const model: BfnStaticModel = {
    id: 'model-uncertainty-static-receiver',
    version: 'test.1',
    mode: 'static',
    family: 'linear_transfer',
    response: {
      family: 'linear_transfer',
      inputPortId,
      scale: { value: 2, unit: 'dimensionless', interval95: [2, 2] },
      intercept: { value: 0, unit: 'dimensionless', interval95: [0, 0] },
    },
    contextId: null,
    validityDomainId,
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'parameter_interval_envelope',
    isDemo: true,
  };
  project.network.modules.push({
    kind: 'functional_module',
    id: moduleId,
    labelKey: 'bfn.testing.uncertaintyStaticReceiver',
    descriptionKey: 'bfn.testing.uncertaintyStaticReceiverDescription',
    inputPorts: [
      {
        id: inputPortId,
        entity: accumulator.outputPorts[0]!.entity,
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: outputPortId,
        entity: 'entity.accumulator.receiver-output',
        quantityType: 'expression_level',
        unit: 'dimensionless',
        direction: 'output',
      },
    ],
    modelVariants: [model],
    activeModelIds: { static: model.id },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 500, y: 160 },
    isDemo: true,
  });
  project.registry.validityDomains.push({
    id: validityDomainId,
    labelKey: 'bfn.testing.uncertaintyStaticReceiverDomain',
    inputRanges: [{ portId: inputPortId, minimum: 0, maximum: 100, unit: 'nM' }],
    contextId: null,
  });
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort = {
    id: monitor.inputPort.id,
    entity: 'entity.accumulator.receiver-output',
    quantityType: 'expression_level',
    unit: 'dimensionless',
    direction: 'input',
  };
  project.network.edges = project.network.edges.filter(
    (edge) => edge.id !== 'edge-accumulator-state',
  );
  project.network.edges.push(
    {
      id: 'edge-accumulator-uncertainty-static-receiver',
      source: { nodeId: ACCUMULATOR_MODULE_ID, portId: ACCUMULATOR_OUTPUT_PORT_ID },
      target: { nodeId: moduleId, portId: inputPortId },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-uncertainty-static-receiver-monitor',
      source: { nodeId: moduleId, portId: outputPortId },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  );
  return moduleId;
}

function appendBranch(project: BfnProject, branch: BfnProject): void {
  project.network.inputSources.push(...structuredClone(branch.network.inputSources));
  project.network.modules.push(...structuredClone(branch.network.modules));
  project.network.outputMonitors.push(...structuredClone(branch.network.outputMonitors));
  project.network.edges.push(...structuredClone(branch.network.edges));
  project.registry.validityDomains.push(...structuredClone(branch.registry.validityDomains));
  for (const provenance of branch.registry.provenanceRecords) {
    if (!project.registry.provenanceRecords.some(({ id }) => id === provenance.id)) {
      project.registry.provenanceRecords.push(structuredClone(provenance));
    }
  }
}

describe('BFN-SIM 2.2 uncertainty execution contract', () => {
  it('records an executable output-reachable parameter envelope for a new run', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-30T00:00:00.000Z');

    expect(result.engineVersion).toBe('BFN-SIM-2.2');
    expect(result.uncertaintyMethod).toBe('parameter_interval_envelope');
    expect(result.uncertaintySnapshot).toEqual({
      scope: 'output_reachable',
      status: 'available',
      method: 'parameter_interval_envelope',
      modules: project.network.modules.map((module) => ({
        moduleId: module.id,
        selectedModelId: module.activeModelIds.static,
        method: 'parameter_interval_envelope',
        intervalExecutable: true,
        reason: null,
        propagationMode: 'parameter_interval',
      })),
    });
    expect(result.points.every((point) => typeof point.lower === 'number')).toBe(true);
    expect(result.points.every((point) => typeof point.upper === 'number')).toBe(true);
    expect(result.annApproximation?.metrics.predictionIntervalCoverage).not.toBeNull();
  });

  it.each([
    ['none', 'none_declared'],
    ['not_recorded', 'not_recorded'],
    ['posterior_samples', 'method_not_executable'],
    ['bootstrap', 'method_not_executable'],
    ['covariance', 'method_not_executable'],
  ] as const)(
    'keeps point estimates but does not fabricate an interval for %s',
    (method, reason) => {
      const project = createDemoBfnProject();
      selectedStaticModel(project).uncertaintyMethod = method;

      const result = runBfnSimulation(project);

      expect(result.points.every((point) => Number.isFinite(point.output))).toBe(true);
      expect(result.points.every((point) => point.lower === null && point.upper === null)).toBe(
        true,
      );
      expect(result.uncertaintyMethod).toBeNull();
      expect(result.uncertaintySnapshot).toMatchObject({
        scope: 'output_reachable',
        status: 'unavailable',
        method: null,
        modules: [
          expect.objectContaining({
            method,
            intervalExecutable: false,
            reason,
          }),
          expect.objectContaining({ intervalExecutable: true, reason: null }),
        ],
      });
      expect(result.annApproximation?.metrics.predictionIntervalCoverage).toBeNull();
    },
  );

  it('rejects incomplete, nonfinite, reversed, and estimate-excluding parameter intervals', () => {
    const project = createDemoBfnProject();
    const model = selectedStaticModel(project);
    if (model.response.family !== 'hill_activation') throw new Error('Expected Hill response');

    delete model.response.k.interval95;
    expect(assessBfnModelUncertainty(model)).toMatchObject({
      intervalExecutable: false,
      reason: 'parameter_interval_incomplete',
    });

    Object.assign(model.response.k, { interval95: null });
    expect(assessBfnModelUncertainty(model).intervalExecutable).toBe(false);
    model.response.k.interval95 = [Number.NaN, 12];
    expect(assessBfnModelUncertainty(model).intervalExecutable).toBe(false);
    model.response.k.interval95 = [13, 12];
    expect(assessBfnModelUncertainty(model).intervalExecutable).toBe(false);
    model.response.k.interval95 = [11, 12];
    expect(assessBfnModelUncertainty(model).intervalExecutable).toBe(false);

    const result = runBfnSimulation(project);
    expect(result.points.every((point) => point.lower === null && point.upper === null)).toBe(true);
  });

  it('requires every Hill, linear, independent-input, and dynamic parameter interval', () => {
    const project = createDemoBfnProject();
    const hill = selectedStaticModel(project);
    const linearModule = project.network.modules[1]!;
    const linear = linearModule.modelVariants.find(
      (candidate) => candidate.id === linearModule.activeModelIds.static,
    );
    const independent = createCatalogModule('dual-input-gate', 'interval-audit').modelVariants[0];
    const dynamic = selectedDynamicModel();
    if (linear?.mode !== 'static' || independent?.mode !== 'static') {
      throw new Error('Expected static interval fixtures');
    }

    expect(assessBfnModelUncertainty(hill).intervalExecutable).toBe(true);
    expect(assessBfnModelUncertainty(linear).intervalExecutable).toBe(true);
    expect(assessBfnModelUncertainty(independent).intervalExecutable).toBe(true);
    expect(assessBfnModelUncertainty(dynamic).intervalExecutable).toBe(true);

    if (linear.response.family !== 'linear_transfer') throw new Error('Expected linear response');
    delete linear.response.scale.interval95;
    expect(assessBfnModelUncertainty(linear).intervalExecutable).toBe(false);

    if (independent.response.family !== 'independent_inputs') {
      throw new Error('Expected independent-input response');
    }
    delete independent.response.terms[1]!.contribution.interval95;
    expect(assessBfnModelUncertainty(independent).intervalExecutable).toBe(false);

    delete dynamic.tau.interval95;
    expect(assessBfnModelUncertainty(dynamic).intervalExecutable).toBe(false);
  });

  it('does not let an output-unreachable module suppress the final interval', () => {
    const project = createDemoBfnProject();
    const unrelated = createCatalogModule('ahl-sensor', 'unreachable');
    const unrelatedModel = unrelated.modelVariants[0];
    if (unrelatedModel?.mode !== 'static') throw new Error('Expected unrelated static model');
    unrelatedModel.uncertaintyMethod = 'not_recorded';
    project.network.modules.push(unrelated);

    const snapshot = createBfnRunUncertaintySnapshot(
      project,
      project.network.outputMonitors[0]!.id,
    );
    const result = runBfnSimulation(project);

    expect(snapshot.status).toBe('available');
    expect(snapshot.modules.map((module) => module.moduleId)).not.toContain(unrelated.id);
    expect(result.points.every((point) => point.lower !== null && point.upper !== null)).toBe(true);
  });

  it('marks a dynamic result point-only when tau lacks an interval', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    delete selectedDynamicModel(project).tau.interval95;

    const result = runBfnSimulation(project);

    expect(result.engineVersion).toBe('BFN-SIM-2.2');
    expect(result.uncertaintySnapshot.status).toBe('unavailable');
    expect(result.uncertaintySnapshot.modules[0]).toMatchObject({
      intervalExecutable: false,
      reason: 'parameter_interval_incomplete',
    });
    expect(result.points.every((point) => point.lower === null && point.upper === null)).toBe(true);
  });

  it('marks a malformed persisted dynamic response unavailable without fabricating intervals', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const model = selectedDynamicModel(project);
    const malformedModel = model as unknown as { steadyStateResponse?: unknown };
    delete malformedModel.steadyStateResponse;

    expect(() => createBfnRunUncertaintySnapshot(project, 'monitor-reporter')).not.toThrow();
    const snapshot = createBfnRunUncertaintySnapshot(project, 'monitor-reporter');
    expect(snapshot.status).toBe('unavailable');
    expect(snapshot.method).toBeNull();
    expect(snapshot.modules[0]).toMatchObject({
      selectedModelId: model.id,
      intervalExecutable: false,
      reason: 'parameter_interval_incomplete',
    });
  });
});

describe('BFN-SIM 2.2 deterministic accumulator uncertainty propagation', () => {
  it('propagates an upstream parameter envelope through the accumulator', () => {
    const project = createAccumulatorBfnProject();
    const producerId = attachRateProducer(project, 'parameter_interval_envelope');
    project.analysis.durationHours = 1;
    project.analysis.timeStepHours = 0.5;
    const model = getAccumulatorModule(project).modelVariants[0];
    if (model?.mode !== 'dynamic' || model.family !== 'accumulator') {
      throw new Error('Expected accumulator fixture.');
    }
    model.initialState = 2;

    const result = runBfnSimulation(project);

    expect(result.uncertaintySnapshot).toMatchObject({
      status: 'available',
      method: 'parameter_interval_envelope',
    });
    expect(
      result.uncertaintySnapshot.modules.find(({ moduleId }) => moduleId === producerId),
    ).toMatchObject({
      moduleId: producerId,
      propagationMode: 'parameter_interval',
    });
    expect(
      result.uncertaintySnapshot.modules.find(({ moduleId }) => moduleId === ACCUMULATOR_MODULE_ID),
    ).toMatchObject({
      moduleId: ACCUMULATOR_MODULE_ID,
      method: 'not_recorded',
      propagationMode: 'deterministic_transform',
      intervalExecutable: true,
      reason: null,
    });
    expect(result.points.map((point) => point.output)).toEqual([2, 7, 12]);
    expect(result.points.map((point) => point.lower)).toEqual([2, 4.5, 7]);
    expect(result.points.map((point) => point.upper)).toEqual([2, 9.5, 17]);
  });

  it('keeps the interval available through a downstream quasi-static receiver', () => {
    const project = createAccumulatorBfnProject();
    attachRateProducer(project, 'parameter_interval_envelope');
    const receiverId = attachStaticReceiver(project);
    project.analysis.durationHours = 1;
    project.analysis.timeStepHours = 0.5;
    const model = getAccumulatorModule(project).modelVariants[0];
    if (model?.mode !== 'dynamic' || model.family !== 'accumulator') {
      throw new Error('Expected accumulator fixture.');
    }
    model.initialState = 2;

    const result = runBfnSimulation(project);

    expect(result.uncertaintySnapshot.status).toBe('available');
    expect(result.uncertaintySnapshot.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ moduleId: receiverId, propagationMode: 'parameter_interval' }),
        expect.objectContaining({
          moduleId: ACCUMULATOR_MODULE_ID,
          propagationMode: 'deterministic_transform',
        }),
      ]),
    );
    expect(result.points.map((point) => point.output)).toEqual([4, 14, 24]);
    expect(result.points.map((point) => point.lower)).toEqual([4, 9, 14]);
    expect(result.points.map((point) => point.upper)).toEqual([4, 19, 34]);
  });

  it('does not fabricate an interval for an accumulator with no parameter source', () => {
    const result = runBfnSimulation(createAccumulatorBfnProject());

    expect(result.uncertaintySnapshot).toMatchObject({
      status: 'unavailable',
      method: null,
      modules: [
        expect.objectContaining({
          moduleId: ACCUMULATOR_MODULE_ID,
          propagationMode: 'deterministic_transform',
          intervalExecutable: true,
          reason: null,
        }),
      ],
    });
    expect(result.points.every((point) => point.lower === null && point.upper === null)).toBe(true);
  });

  it('keeps the interval unavailable when an upstream parameterized model is not recorded', () => {
    const project = createAccumulatorBfnProject();
    const producerId = attachRateProducer(project, 'not_recorded');

    const result = runBfnSimulation(project);

    expect(result.uncertaintySnapshot.status).toBe('unavailable');
    expect(result.uncertaintySnapshot.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: producerId,
          propagationMode: 'unavailable',
          reason: 'not_recorded',
        }),
        expect.objectContaining({
          moduleId: ACCUMULATOR_MODULE_ID,
          propagationMode: 'deterministic_transform',
        }),
      ]),
    );
    expect(result.points.every((point) => point.lower === null && point.upper === null)).toBe(true);
  });

  it('rejects parameter-interval uncertainty declared on the accumulator itself', () => {
    const project = createAccumulatorBfnProject();
    const model = getAccumulatorModule(project).modelVariants[0];
    if (model?.mode !== 'dynamic' || model.family !== 'accumulator') {
      throw new Error('Expected accumulator fixture.');
    }
    model.uncertaintyMethod = 'parameter_interval_envelope';

    expect(validateBfnProject(project)).toContainEqual({
      code: 'accumulator_model_contract_invalid',
      severity: 'error',
      subjectId: ACCUMULATOR_MODULE_ID,
      details: { reason: 'uncertainty_contract_invalid' },
    });
    expect(() => runBfnSimulation(project)).toThrow(
      /BFN_VALIDATION_FAILED:.*accumulator_model_contract_invalid/u,
    );
  });

  it('ignores an off-target uncertainty-poor accumulator branch', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const branch = createAccumulatorBfnProject();
    attachRateProducer(branch, 'not_recorded');
    appendBranch(project, branch);

    const result = runBfnSimulation(project);

    expect(result.uncertaintySnapshot.status).toBe('available');
    expect(result.uncertaintySnapshot.modules.map(({ moduleId }) => moduleId)).not.toContain(
      ACCUMULATOR_MODULE_ID,
    );
    expect(result.points.every((point) => point.lower !== null && point.upper !== null)).toBe(true);
  });
});
