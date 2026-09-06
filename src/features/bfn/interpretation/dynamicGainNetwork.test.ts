import { describe, expect, it } from 'vitest';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import { createAccumulatorBfnProject, getAccumulatorModule } from '../testing/accumulatorFixtures';
import type {
  BfnFunctionalModule,
  BfnInputSource,
  BfnProject,
  BfnStaticModel,
  BfnUnit,
} from '../types';
import { bfnComplexAdd } from './complexMath';
import { calculateBfnDynamicGain } from './dynamicGain';
import { calculateBfnNetworkInfluence } from './networkInfluence';
import type {
  BfnDynamicGainRequestV1,
  BfnDynamicGainResultV1,
  BfnDynamicGainValueV1,
} from './dynamicGainTypes';

function requestFor(
  project: BfnProject,
  values: readonly {
    inputSourceId: string;
    value: number;
    unit: BfnUnit;
  }[] = project.network.inputSources.map((source) => ({
    inputSourceId: source.id,
    value: 0.5,
    unit: source.outputPort.unit,
  })),
): BfnDynamicGainRequestV1 {
  return {
    contractVersion: '1.0',
    scope: 'network_dynamic_periodic_gain',
    outputMonitorId: project.network.outputMonitors[0]!.id,
    operatingPoint: values,
    perturbation: { periodHours: 3 },
  };
}

function successfulResult(
  project: BfnProject,
  request = requestFor(project),
): BfnDynamicGainResultV1 {
  const calculation = calculateBfnDynamicGain(project, request);
  if (!calculation.ok)
    throw new Error(`Expected dynamic gain result: ${JSON.stringify(calculation)}`);
  return calculation.result;
}

function availableGain(
  gain: BfnDynamicGainValueV1,
): Extract<BfnDynamicGainValueV1, { readonly availability: 'available' }> {
  if (gain.availability !== 'available') throw new Error(`Expected available gain: ${gain.reason}`);
  return gain;
}

function expectDcMatchesBatch132(
  project: BfnProject,
  request: BfnDynamicGainRequestV1,
  result: BfnDynamicGainResultV1,
): void {
  const baseline = calculateBfnNetworkInfluence(project, {
    ...request,
    scope: 'network_static_output',
  });
  if (!baseline.ok) throw new Error('Expected Batch 13.2 result.');
  expect(result.perSource.map((source) => source.dcGain)).toEqual(
    baseline.result.perSource.map((source) => source.totalDifferentialGain),
  );
}

function activeStaticModel(module: BfnFunctionalModule): BfnStaticModel {
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.mode === 'static' && candidate.id === module.activeModelIds.static,
  );
  if (!model) throw new Error('Expected an active static model.');
  return model;
}

function sourceFor(id: string, port: BfnFunctionalModule['inputPorts'][number]): BfnInputSource {
  return {
    kind: 'input_source',
    id,
    labelKey: `bfn.testing.${id}`,
    outputPort: {
      id: `${id}-out`,
      entity: port.entity,
      quantityType: port.quantityType,
      unit: port.unit,
      direction: 'output',
    },
    staticSpecification: {
      type: 'working_range',
      minimum: 0,
      maximum: 100,
      points: 11,
      unit: port.unit,
    },
    dynamicSpecification: { type: 'constant', value: 0.5, unit: port.unit },
    position: { x: 0, y: 0 },
  };
}

function dualInputProject(
  options: { readonly oneBranchedSource?: boolean; readonly unavailableExponent?: number } = {},
): BfnProject {
  const project = createDemoBfnProject();
  project.network.mode = 'dynamic';
  const module = createCatalogModule('dual-input-gate', 'dynamic-network');
  const model = activeStaticModel(module);
  if (model.response.family !== 'independent_inputs') throw new Error('Expected dual response.');
  if (options.unavailableExponent !== undefined) {
    model.response.terms[0]!.n = { value: options.unavailableExponent, unit: 'dimensionless' };
  }
  const contextId = project.registry.contexts[0]?.id ?? null;
  const domainId = 'domain-dynamic-dual-network';
  model.validityDomainId = domainId;
  model.contextId = contextId;
  project.registry.validityDomains = [
    {
      id: domainId,
      labelKey: 'bfn.testing.dynamicDualDomain',
      inputRanges: module.inputPorts.map((port) => ({
        portId: port.id,
        minimum: 0,
        maximum: 100,
        unit: port.unit,
      })),
      contextId,
    },
  ];
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort.entity = module.outputPorts[0]!.entity;
  monitor.inputPort.quantityType = module.outputPorts[0]!.quantityType;
  monitor.inputPort.unit = module.outputPorts[0]!.unit;
  project.network.modules = [module];
  if (options.oneBranchedSource) {
    module.inputPorts[1]!.entity = module.inputPorts[0]!.entity;
    module.inputPorts[1]!.quantityType = module.inputPorts[0]!.quantityType;
    module.inputPorts[1]!.unit = module.inputPorts[0]!.unit;
    const source = sourceFor('source-shared', module.inputPorts[0]!);
    project.network.inputSources = [source];
    project.network.edges = module.inputPorts.map((port, index) => ({
      id: `edge-shared-dynamic-dual-${index}`,
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: module.id, portId: port.id },
      mapping: 'identity' as const,
      enabled: true,
    }));
  } else {
    project.network.inputSources = [
      sourceFor('source-b', module.inputPorts[1]!),
      sourceFor('source-a', module.inputPorts[0]!),
    ];
    project.network.edges = [
      {
        id: 'edge-source-a-dynamic-dual',
        source: { nodeId: 'source-a', portId: 'source-a-out' },
        target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-source-b-dynamic-dual',
        source: { nodeId: 'source-b', portId: 'source-b-out' },
        target: { nodeId: module.id, portId: module.inputPorts[1]!.id },
        mapping: 'identity',
        enabled: true,
      },
    ];
  }
  project.network.edges.push({
    id: 'edge-dynamic-dual-monitor',
    source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
    target: { nodeId: monitor.id, portId: monitor.inputPort.id },
    mapping: 'identity',
    enabled: true,
  });
  return project;
}

function zeroUpstreamUnavailableProject(exponent: number): BfnProject {
  const project = createDemoBfnProject();
  const upstream = project.network.modules[0]!;
  const upstreamModel = activeStaticModel(upstream);
  upstream.activeModelIds = { static: upstreamModel.id };
  if (upstreamModel.response.family !== 'hill_activation') throw new Error('Expected Hill.');
  upstreamModel.response.ymin.value = 0;
  upstreamModel.response.ymax.value = 0;
  delete upstreamModel.response.ymin.interval95;
  delete upstreamModel.response.ymax.interval95;

  const downstream = project.network.modules[1]!;
  const downstreamModel = activeStaticModel(downstream);
  downstream.activeModelIds = { static: downstreamModel.id };
  downstreamModel.family = 'hill_activation';
  downstreamModel.response = {
    family: 'hill_activation',
    inputPortId: downstream.inputPorts[0]!.id,
    ymin: { value: 0.1, unit: downstream.outputPorts[0]!.unit },
    ymax: { value: 1, unit: downstream.outputPorts[0]!.unit },
    k: { value: 0.5, unit: downstream.inputPorts[0]!.unit },
    n: { value: exponent, unit: 'dimensionless' },
  };
  return project;
}

describe('calculateBfnDynamicGain network semantics', () => {
  it('preserves project source order and quasi-static multi-input signs', () => {
    const project = dualInputProject();
    const result = successfulResult(
      project,
      requestFor(project, [
        { inputSourceId: 'source-a', value: 0.4, unit: 'dimensionless' },
        { inputSourceId: 'source-b', value: 0.7, unit: 'dimensionless' },
      ]),
    );

    expect(result.perSource.map((source) => source.inputSourceId)).toEqual([
      'source-b',
      'source-a',
    ]);
    expect(result.moduleTransfers).toHaveLength(1);
    expect(result.moduleTransfers[0]!.dynamicKind).toBe('quasi_static');
    expect(availableGain(result.perSource[0]!.dynamicGain).complex.im).toBe(0);
    expectDcMatchesBatch132(
      project,
      requestFor(project, [
        { inputSourceId: 'source-a', value: 0.4, unit: 'dimensionless' },
        { inputSourceId: 'source-b', value: 0.7, unit: 'dimensionless' },
      ]),
      result,
    );
  });

  it('sums converging branch complex sensitivities for one external source', () => {
    const project = dualInputProject({ oneBranchedSource: true });
    const result = successfulResult(
      project,
      requestFor(project, [{ inputSourceId: 'source-shared', value: 0.6, unit: 'dimensionless' }]),
    );
    const expected = result.moduleTransfers[0]!.inputs.reduce(
      (sum, input) => bfnComplexAdd(sum, availableGain(input.dynamicGain).complex),
      { re: 0, im: 0 },
    );
    const overall = availableGain(result.perSource[0]!.dynamicGain);

    expect(overall.complex.re).toBeCloseTo(expected.re, 12);
    expect(overall.complex.im).toBeCloseTo(expected.im, 12);
    expectDcMatchesBatch132(
      project,
      requestFor(project, [{ inputSourceId: 'source-shared', value: 0.6, unit: 'dimensionless' }]),
      result,
    );
  });

  it.each([
    { exponent: 1, reason: 'derivative_not_unique' },
    { exponent: 0.5, reason: 'derivative_non_finite' },
  ] as const)('rejects complete dynamic interpretation for $reason', ({ exponent, reason }) => {
    const project = dualInputProject({ unavailableExponent: exponent });
    const calculation = calculateBfnDynamicGain(
      project,
      requestFor(project, [
        { inputSourceId: 'source-a', value: 0, unit: 'dimensionless' },
        { inputSourceId: 'source-b', value: 0.7, unit: 'dimensionless' },
      ]),
    );
    expect(calculation).toMatchObject({
      ok: false,
      calculationIssue: {
        code: 'incomplete_local_dynamic_linearization',
        moduleId: 'module-dual-input-dynamic-network',
        reason,
      },
    });
  });

  it.each([
    { exponent: 1, reason: 'derivative_not_unique' },
    { exponent: 0.5, reason: 'derivative_non_finite' },
  ] as const)(
    'rejects $reason behind exact-zero upstream sensitivity while Batch 13.2 contains it',
    ({ exponent, reason }) => {
      const project = zeroUpstreamUnavailableProject(exponent);
      const request = requestFor(project, [{ inputSourceId: 'source-ahl', value: 5, unit: 'nM' }]);
      const baseline = calculateBfnNetworkInfluence(project, {
        ...request,
        scope: 'network_static_output',
      });
      if (!baseline.ok) throw new Error('Expected contained Batch 13.2 result.');
      expect(baseline.result.perSource[0]!.totalDifferentialGain).toMatchObject({
        availability: 'available',
        value: 0,
      });

      expect(calculateBfnDynamicGain(project, request)).toMatchObject({
        ok: false,
        calculationIssue: {
          code: 'incomplete_local_dynamic_linearization',
          moduleId: 'module-reporter',
          reason,
        },
      });
    },
  );

  it('blocks formal output when the reused baseline calculation is outside domain', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const calculation = calculateBfnDynamicGain(
      project,
      requestFor(project, [{ inputSourceId: 'source-ahl', value: 150, unit: 'nM' }]),
    );

    expect(calculation.ok).toBe(false);
    if (calculation.ok) throw new Error('Expected outside-domain failure.');
    expect(calculation.admission.status).toBe('supported');
    expect(calculation.networkInfluence?.ok).toBe(false);
    if (!calculation.networkInfluence || calculation.networkInfluence.ok) {
      throw new Error('Expected the reused baseline network calculation to fail.');
    }
    expect(calculation.networkInfluence.calculationIssue).toMatchObject({
      code: 'outside_recorded_domain',
      moduleId: 'module-ahl-sensor',
    });
  });

  it('rejects target accumulators and feedback while ignoring off-target accumulators', () => {
    const accumulator = createAccumulatorBfnProject();
    const accumulatorResult = calculateBfnDynamicGain(accumulator, requestFor(accumulator));
    expect(accumulatorResult.ok).toBe(false);
    expect(accumulatorResult.admission.issues.map((issue) => issue.code)).toContain(
      'integrator_reference_state_unavailable',
    );

    const feedback = createDemoBfnProject();
    feedback.network.mode = 'dynamic';
    feedback.network.edges.push({
      id: 'edge-dynamic-feedback-test',
      source: { nodeId: 'module-reporter', portId: 'module-reporter-out' },
      target: { nodeId: 'module-ahl-sensor', portId: 'module-ahl-sensor-in' },
      mapping: 'identity',
      enabled: true,
    });
    const feedbackResult = calculateBfnDynamicGain(
      feedback,
      requestFor(feedback, [{ inputSourceId: 'source-ahl', value: 10, unit: 'nM' }]),
    );
    expect(feedbackResult.ok).toBe(false);
    expect(feedbackResult.admission.issues.map((issue) => issue.code)).toContain('feedback');

    const offTarget = createDemoBfnProject();
    offTarget.network.mode = 'dynamic';
    offTarget.network.modules.push(
      structuredClone(getAccumulatorModule(createAccumulatorBfnProject())),
    );
    expect(
      calculateBfnDynamicGain(
        offTarget,
        requestFor(offTarget, [{ inputSourceId: 'source-ahl', value: 10, unit: 'nM' }]),
      ).ok,
    ).toBe(true);
  });

  it('is pure, frozen, ephemeral, and isolated from simulation settings', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const request = requestFor(project, [{ inputSourceId: 'source-ahl', value: 10, unit: 'nM' }]);
    const projectBefore = structuredClone(project);
    const requestBefore = structuredClone(request);
    const first = successfulResult(project, request);
    project.analysis.durationHours = 99;
    project.analysis.timeStepHours = 0.001;
    project.analysis.annThresholds = { minimumR2: 0.01, maximumNrmse: 99 };
    const second = successfulResult(project, request);

    expect(first.perSource).toEqual(second.perSource);
    expect(first.persistence).toBe('ephemeral');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.perSource)).toBe(true);
    expect(Object.isFrozen(first.moduleTransfers)).toBe(true);
    expect(first).not.toHaveProperty('dynamicMetrics');
    expect(first).not.toHaveProperty('durationHours');
    expect(first).not.toHaveProperty('timeStepHours');
    expect(request).toEqual(requestBefore);
    expect({ ...project, analysis: projectBefore.analysis }).toEqual(projectBefore);
  });
});
