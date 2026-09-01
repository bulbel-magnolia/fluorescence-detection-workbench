import { describe, expect, it } from 'vitest';
import { BfnAccumulatorRateError } from './accumulatorRuntimeContract';
import { runBfnSimulation } from './simulation';
import {
  ACCUMULATOR_INPUT_PORT_ID,
  ACCUMULATOR_MODULE_ID,
  createAccumulatorBfnProject,
  getAccumulatorModule,
} from './testing/accumulatorFixtures';
import type { BfnProject, BfnStaticModel } from './types';

function configureAccumulator(
  project: BfnProject,
  initialState: number,
  rate: number,
  durationHours: number,
  timeStepHours: number,
): void {
  const module = getAccumulatorModule(project);
  const model = module.modelVariants[0];
  if (model?.mode !== 'dynamic' || model.family !== 'accumulator') {
    throw new Error('Expected accumulator fixture.');
  }
  model.initialState = initialState;
  const source = project.network.inputSources[0]!;
  source.dynamicSpecification = { type: 'constant', value: rate, unit: source.outputPort.unit };
  project.analysis.durationHours = durationHours;
  project.analysis.timeStepHours = timeStepHours;
}

function setAccumulatorUnitPair(project: BfnProject, rateUnit: 'nM/h' | 'uM/h'): void {
  const concentrationUnit = rateUnit === 'nM/h' ? 'nM' : 'uM';
  const source = project.network.inputSources[0]!;
  const module = getAccumulatorModule(project);
  const monitor = project.network.outputMonitors[0]!;
  source.outputPort.unit = rateUnit;
  source.staticSpecification.unit = rateUnit;
  source.dynamicSpecification.unit = rateUnit;
  module.inputPorts[0]!.unit = rateUnit;
  module.outputPorts[0]!.unit = concentrationUnit;
  monitor.inputPort.unit = concentrationUnit;
  project.registry.validityDomains[0]!.inputRanges[0]!.unit = rateUnit;
}

function attachInvalidRateProducer(project: BfnProject, scale: number, inputValue: number): void {
  const source = project.network.inputSources[0]!;
  source.outputPort = {
    ...source.outputPort,
    entity: 'entity.accumulator.rate-control',
    quantityType: 'concentration',
    unit: 'nM',
  };
  source.staticSpecification = { type: 'fixed_value', value: inputValue, unit: 'nM' };
  source.dynamicSpecification = { type: 'constant', value: inputValue, unit: 'nM' };
  const validityDomainId = 'domain-invalid-rate-producer';
  const inputPortId = 'port-invalid-rate-producer-in';
  const outputPortId = 'port-invalid-rate-producer-out';
  const model: BfnStaticModel = {
    id: 'model-invalid-rate-producer',
    version: 'test.1',
    mode: 'static',
    family: 'linear_transfer',
    response: {
      family: 'linear_transfer',
      inputPortId,
      scale: { value: scale, unit: 'dimensionless' },
      intercept: { value: 0, unit: 'nM/h' },
    },
    contextId: null,
    validityDomainId,
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'none',
    isDemo: true,
  };
  project.network.modules.push({
    kind: 'functional_module',
    id: 'module-invalid-rate-producer',
    labelKey: 'bfn.testing.invalidRateProducer',
    descriptionKey: 'bfn.testing.invalidRateProducerDescription',
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
    labelKey: 'bfn.testing.invalidRateProducerDomain',
    inputRanges: [{ portId: inputPortId, minimum: 0, maximum: 10, unit: 'nM' }],
    contextId: null,
  });
  project.network.edges = project.network.edges.filter(
    (edge) => edge.id !== 'edge-accumulator-rate',
  );
  project.network.edges.push(
    {
      id: 'edge-control-invalid-rate-producer',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: 'module-invalid-rate-producer', portId: inputPortId },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-invalid-rate-producer-accumulator',
      source: { nodeId: 'module-invalid-rate-producer', portId: outputPortId },
      target: { nodeId: ACCUMULATOR_MODULE_ID, portId: ACCUMULATOR_INPUT_PORT_ID },
      mapping: 'identity',
      enabled: true,
    },
  );
}

describe('BFN-SIM 2.2 accumulator time integration', () => {
  it('emits C0 at t0 and uses left-endpoint sample-and-hold with deferred state commit', () => {
    const project = createAccumulatorBfnProject();
    configureAccumulator(project, 2, 10, 2, 0.5);

    const result = runBfnSimulation(project, '2026-09-01T00:00:00.000Z');

    expect(result.engineVersion).toBe('BFN-SIM-2.2');
    expect(result.points.map((point) => point.timeHours)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(result.points.map((point) => point.output)).toEqual([2, 7, 12, 17, 22]);
    expect(result.points.map((point) => point.moduleOutputs[ACCUMULATOR_MODULE_ID])).toEqual([
      2, 7, 12, 17, 22,
    ]);
    expect(result.dynamicMetrics).toMatchObject({
      terminalValue: 22,
      steadyStateAvailable: false,
      steadyValue: null,
      riseTimeHours: null,
      overshootFraction: null,
      dcGain: null,
      frequencyGain: null,
    });
  });

  it('keeps a zero-rate trajectory at C0', () => {
    const project = createAccumulatorBfnProject();
    configureAccumulator(project, 2, 0, 2, 0.5);

    expect(runBfnSimulation(project).points.map((point) => point.output)).toEqual([2, 2, 2, 2, 2]);
  });

  it('does not integrate a step rate before the interval following its sample', () => {
    const project = createAccumulatorBfnProject();
    configureAccumulator(project, 2, 0, 2, 0.5);
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'step',
      before: 0,
      after: 10,
      atHours: 1,
      unit: 'nM/h',
    };

    expect(runBfnSimulation(project).points.map((point) => point.output)).toEqual([2, 2, 2, 7, 12]);
  });

  it('uses the actual short final integration step', () => {
    const project = createAccumulatorBfnProject();
    configureAccumulator(project, 2, 10, 1.1, 0.5);

    const result = runBfnSimulation(project);

    expect(result.points.map((point) => point.timeHours)).toEqual([0, 0.5, 1, 1.1]);
    expect(result.points.map((point) => point.output)).toEqual([2, 7, 12, 13]);
  });

  it.each(['nM/h', 'uM/h'] as const)('executes the exact %s unit family', (rateUnit) => {
    const project = createAccumulatorBfnProject();
    setAccumulatorUnitPair(project, rateUnit);
    configureAccumulator(project, 2, 10, 0.5, 0.5);

    expect(runBfnSimulation(project).points.map((point) => point.output)).toEqual([2, 7]);
  });

  it('preserves validity-domain warnings for the current sampled rate', () => {
    const project = createAccumulatorBfnProject();
    configureAccumulator(project, 2, 10, 0.5, 0.5);
    project.registry.validityDomains[0]!.inputRanges[0]!.maximum = 5;

    const result = runBfnSimulation(project);

    expect(result.extrapolated).toBe(true);
    expect(result.validationIssues).toContainEqual({
      code: 'outside_validity_domain',
      severity: 'warning',
      subjectId: ACCUMULATOR_MODULE_ID,
    });
  });

  it.each([
    [-1, 1],
    [Number.NaN, 1],
    [Number.MAX_VALUE, 2],
    [-Number.MAX_VALUE, 2],
  ])('rejects an upstream runtime rate derived from scale %s', (scale, inputValue) => {
    const project = createAccumulatorBfnProject();
    configureAccumulator(project, 2, 0, 0.5, 0.5);
    attachInvalidRateProducer(project, scale, inputValue);

    expect(() => runBfnSimulation(project)).toThrow(BfnAccumulatorRateError);
  });
});
