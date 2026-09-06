import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import type {
  BfnDynamicModel,
  BfnFunctionalModule,
  BfnProject,
  BfnStaticModel,
  BfnUnit,
} from '../types';
import { bfnComplexMultiply } from './complexMath';
import { calculateBfnDynamicGain } from './dynamicGain';
import type {
  BfnDynamicGainRequestV1,
  BfnDynamicGainResultV1,
  BfnDynamicGainValueV1,
} from './dynamicGainTypes';

function activeStaticModel(module: BfnFunctionalModule): BfnStaticModel {
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.mode === 'static' && candidate.id === module.activeModelIds.static,
  );
  if (!model) throw new Error('Expected an active static model.');
  return model;
}

function activeDynamicModel(module: BfnFunctionalModule): BfnDynamicModel {
  const model = module.modelVariants.find(
    (candidate): candidate is BfnDynamicModel =>
      candidate.mode === 'dynamic' &&
      candidate.family === 'first_order' &&
      candidate.id === module.activeModelIds.dynamic,
  );
  if (!model) throw new Error('Expected an active first-order model.');
  return model;
}

function requestFor(
  project: BfnProject,
  periodHours = 2,
  values: Readonly<Record<string, number>> = {},
): BfnDynamicGainRequestV1 {
  return {
    contractVersion: '1.0',
    scope: 'network_dynamic_periodic_gain',
    outputMonitorId: project.network.outputMonitors[0]?.id ?? 'missing-monitor',
    operatingPoint: project.network.inputSources.map((source) => ({
      inputSourceId: source.id,
      value: values[source.id] ?? 0.25,
      unit: source.outputPort.unit,
    })),
    perturbation: { periodHours },
  };
}

function successfulResult(
  project: BfnProject,
  request = requestFor(project),
): BfnDynamicGainResultV1 {
  const calculation = calculateBfnDynamicGain(project, request);
  if (!calculation.ok) throw new Error(`Expected dynamic result: ${JSON.stringify(calculation)}`);
  return calculation.result;
}

function availableGain(
  gain: BfnDynamicGainValueV1,
): Extract<BfnDynamicGainValueV1, { readonly availability: 'available' }> {
  if (gain.availability !== 'available') throw new Error(`Expected gain: ${gain.reason}`);
  return gain;
}

function linearProject(options: {
  readonly gain: number;
  readonly tauHours?: number;
  readonly firstOrder?: boolean;
}): BfnProject {
  const project = createDemoBfnProject();
  project.network.mode = 'dynamic';
  const source = project.network.inputSources[0]!;
  const module = project.network.modules[1]!;
  const monitor = project.network.outputMonitors[0]!;
  const staticModel = activeStaticModel(module);
  const dynamicModel = activeDynamicModel(module);
  if (
    staticModel.response.family !== 'linear_transfer' ||
    dynamicModel.steadyStateResponse.family !== 'linear_transfer'
  ) {
    throw new Error('Expected paired linear responses.');
  }
  module.inputPorts[0]!.unit = module.outputPorts[0]!.unit;
  staticModel.response.scale = { value: options.gain, unit: 'dimensionless' };
  staticModel.response.intercept = { value: 0.5, unit: module.outputPorts[0]!.unit };
  staticModel.response.outputMinimum = -100;
  staticModel.response.outputMaximum = 100;
  dynamicModel.steadyStateResponse = structuredClone(staticModel.response);
  dynamicModel.tau.value = options.tauHours ?? 0.5;
  module.activeModelIds = options.firstOrder
    ? { static: staticModel.id, dynamic: dynamicModel.id }
    : { static: staticModel.id };

  source.outputPort.entity = module.inputPorts[0]!.entity;
  source.outputPort.quantityType = module.inputPorts[0]!.quantityType;
  source.outputPort.unit = module.inputPorts[0]!.unit;
  source.staticSpecification = {
    type: 'fixed_value',
    value: 0.25,
    unit: source.outputPort.unit,
  };
  source.dynamicSpecification = {
    type: 'constant',
    value: 0.25,
    unit: source.outputPort.unit,
  };
  project.network.modules = [module];
  project.network.edges = [
    {
      id: 'edge-linear-source',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-linear-monitor',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  project.registry.validityDomains = project.registry.validityDomains.filter(
    (domain) => domain.id === staticModel.validityDomainId,
  );
  project.registry.validityDomains[0]!.inputRanges =
    project.registry.validityDomains[0]!.inputRanges.map((range) => ({
      ...range,
      unit: module.inputPorts[0]!.unit,
    }));
  return project;
}

function directProject(sourceUnit: BfnUnit, monitorUnit: BfnUnit): BfnProject {
  const project = createDemoBfnProject();
  const source = project.network.inputSources[0]!;
  const monitor = project.network.outputMonitors[0]!;
  project.network.mode = 'dynamic';
  source.outputPort.unit = sourceUnit;
  source.dynamicSpecification = { type: 'constant', value: 1, unit: sourceUnit };
  monitor.inputPort.entity = source.outputPort.entity;
  monitor.inputPort.quantityType = source.outputPort.quantityType;
  monitor.inputPort.unit = monitorUnit;
  project.network.modules = [];
  project.network.edges = [
    {
      id: 'edge-direct-dynamic-gain',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  return project;
}

describe('calculateBfnDynamicGain', () => {
  it.each([
    { gain: 2, magnitude: 2, phase: 0 },
    { gain: -2, magnitude: 2, phase: 180 },
  ])(
    'uses quasi-static gain $gain with magnitude and signed phase',
    ({ gain, magnitude, phase }) => {
      const result = successfulResult(linearProject({ gain }));
      const source = result.perSource[0]!;

      expect(availableGain(source.dynamicGain)).toMatchObject({
        complex: { re: gain, im: 0 },
        magnitude,
      });
      expect(source.phase).toEqual({ availability: 'available', degrees: phase });
      expect(result.moduleTransfers[0]).toMatchObject({ dynamicKind: 'quasi_static' });
    },
  );

  it('keeps exact zero gain available and leaves its phase undefined', () => {
    const result = successfulResult(linearProject({ gain: 0 }));

    expect(result.perSource[0]?.dynamicGain).toMatchObject({
      availability: 'available',
      complex: { re: 0, im: 0 },
      magnitude: 0,
    });
    expect(result.perSource[0]?.phase).toEqual({
      availability: 'unavailable',
      reason: 'zero_magnitude',
    });
  });

  it.each([
    { sourceUnit: 'nM' as const, monitorUnit: 'nM' as const, magnitude: 1 },
    { sourceUnit: 'nM' as const, monitorUnit: 'uM' as const, magnitude: 0.001 },
  ])(
    'uses the existing coordinate scale for direct $sourceUnit to $monitorUnit transmission',
    ({ sourceUnit, monitorUnit, magnitude }) => {
      const result = successfulResult(directProject(sourceUnit, monitorUnit));

      expect(result.moduleTransfers).toEqual([]);
      expect(availableGain(result.perSource[0]!.dynamicGain)).toMatchObject({
        complex: { re: magnitude, im: 0 },
        magnitude,
        unit: { outputUnit: monitorUnit, inputUnit: sourceUnit },
      });
      expect(result.perSource[0]?.phase).toEqual({ availability: 'available', degrees: 0 });
    },
  );

  it('uses the analytic first-order transfer and retains exact dynamic Evidence', () => {
    const project = linearProject({ gain: 2, firstOrder: true, tauHours: 0.5 });
    const request = requestFor(project, 4);
    const result = successfulResult(project, request);
    const omega = (2 * Math.PI) / 4;
    const denominator = 1 + (omega * 0.5) ** 2;
    const expectedRe = 2 / denominator;
    const expectedIm = (-2 * omega * 0.5) / denominator;
    const transfer = availableGain(result.moduleTransfers[0]!.inputs[0]!.dynamicGain);

    expect(transfer.complex.re).toBeCloseTo(expectedRe, 12);
    expect(transfer.complex.im).toBeCloseTo(expectedIm, 12);
    expect(transfer.magnitude).toBeCloseTo(Math.hypot(expectedRe, expectedIm), 12);
    const phase = result.moduleTransfers[0]?.inputs[0]?.phase;
    expect(phase?.availability).toBe('available');
    if (phase?.availability !== 'available') throw new Error('Expected available phase.');
    expect(phase.degrees).toBeCloseTo((Math.atan2(expectedIm, expectedRe) * 180) / Math.PI, 12);
    expect(result.moduleTransfers[0]?.dynamicModel).toMatchObject({
      dynamicModelId: 'module-reporter-dynamic-v1',
      dynamicModelVersion: '2.0-demo.1',
      tauHours: 0.5,
      evidence: {
        evidenceGrade: 'mechanistic_model_only',
        uncertaintyMethod: 'parameter_interval_envelope',
        sourceDatasetIds: ['dataset-demo-dose-response'],
      },
      validityDomainId: 'domain-demo-reporter',
    });
    expect(result.baselineOutput).toEqual({ value: 1, unit: 'dimensionless' });
  });

  it('uses a very small positive nominal tau without a 0.001 hour floor', () => {
    const tauHours = 0.0001;
    const project = linearProject({ gain: 1, firstOrder: true, tauHours });
    const periodHours = 0.0002;
    const result = successfulResult(project, requestFor(project, periodHours));
    const omegaTau = ((2 * Math.PI) / periodHours) * tauHours;
    const gain = availableGain(result.perSource[0]!.dynamicGain);

    expect(gain.complex.re).toBeCloseTo(1 / (1 + omegaTau ** 2), 12);
    expect(gain.complex.im).toBeCloseTo(-omegaTau / (1 + omegaTau ** 2), 12);
  });

  it('propagates two first-order modules as a stable ordered complex cascade', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const result = successfulResult(project, requestFor(project, 2, { 'source-ahl': 10 }));
    const local = result.moduleTransfers.map((module) =>
      availableGain(module.inputs[0]!.dynamicGain),
    );
    const expected = bfnComplexMultiply(local[0]!.complex, local[1]!.complex);
    const overall = availableGain(result.perSource[0]!.dynamicGain);

    expect(result.moduleTransfers.map((module) => module.moduleId)).toEqual([
      'module-ahl-sensor',
      'module-reporter',
    ]);
    expect(overall.complex.re).toBeCloseTo(expected.re, 12);
    expect(overall.complex.im).toBeCloseTo(expected.im, 12);
    expect(result.perturbationPeriodHours).toBe(2);
    expect(result.angularFrequencyRadPerHour).toBeCloseTo(Math.PI, 12);
    expect(result.persistence).toBe('ephemeral');
  });
});
