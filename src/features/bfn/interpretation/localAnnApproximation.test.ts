import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import { createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import type {
  BfnFunctionalModule,
  BfnInputSource,
  BfnProject,
  BfnStaticModel,
  BfnUnit,
} from '../types';
import { calculateBfnNetworkInfluence } from './networkInfluence';
import { calculateBfnLocalAnnApproximation } from './localAnnApproximation';
import type {
  BfnLocalAnnApproximationCalculationV1,
  BfnLocalAnnApproximationRequestV1,
  BfnLocalAnnApproximationResultV1,
} from './localAnnApproximationTypes';

function requestFor(
  project: BfnProject,
  operatingPoint: BfnLocalAnnApproximationRequestV1['operatingPoint'] = [
    { inputSourceId: 'source-ahl', value: 10, unit: 'nM' },
  ],
): BfnLocalAnnApproximationRequestV1 {
  return {
    contractVersion: '1.0',
    scope: 'network_local_ann_approximation',
    outputMonitorId: project.network.outputMonitors[0]!.id,
    operatingPoint,
  };
}

function successfulResult(
  calculation: BfnLocalAnnApproximationCalculationV1,
): BfnLocalAnnApproximationResultV1 {
  if (!calculation.ok) throw new Error('Expected a local ANN approximation.');
  return calculation.result;
}

function activeStaticModel(module: BfnFunctionalModule): BfnStaticModel {
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.mode === 'static' && candidate.id === module.activeModelIds.static,
  );
  if (!model) throw new Error('Expected an active static model.');
  return model;
}

function sourceFor(
  id: string,
  port: BfnInputSource['outputPort'],
  unit: BfnUnit = port.unit,
): BfnInputSource {
  return {
    kind: 'input_source',
    id,
    labelKey: `bfn.testing.${id}`,
    outputPort: { ...port, id: `${id}-out`, unit, direction: 'output' },
    staticSpecification: { type: 'working_range', minimum: 0, maximum: 100, points: 11, unit },
    dynamicSpecification: { type: 'step', before: 0, after: 1, atHours: 1, unit },
    position: { x: 0, y: 0 },
  };
}

function rebuild(
  weights: readonly {
    readonly operatingValue: number;
    readonly weight: { readonly value: number };
  }[],
  bias: number,
): number {
  return weights.reduce((sum, input) => sum + input.operatingValue * input.weight.value, bias);
}

function dualInputProject(oneBranchedSource = false): BfnProject {
  const project = createDemoBfnProject();
  const module = createCatalogModule('dual-input-gate', 'local-ann');
  const model = activeStaticModel(module);
  if (model.response.family !== 'independent_inputs') throw new Error('Expected dual response.');
  model.response.terms[1]!.direction = 'repression';
  const contextId = project.registry.contexts[0]?.id ?? null;
  model.contextId = contextId;
  model.validityDomainId = 'domain-local-ann-dual';
  project.registry.validityDomains = [
    {
      id: model.validityDomainId,
      labelKey: 'bfn.testing.localAnnDualDomain',
      inputRanges: module.inputPorts.map((port) => ({
        portId: port.id,
        minimum: 0,
        maximum: 100,
        unit: port.unit,
      })),
      contextId,
    },
  ];
  const sources = oneBranchedSource
    ? [sourceFor('source-shared', module.inputPorts[0]!)]
    : [sourceFor('source-b', module.inputPorts[1]!), sourceFor('source-a', module.inputPorts[0]!)];
  if (oneBranchedSource) {
    module.inputPorts[1]!.entity = module.inputPorts[0]!.entity;
    module.inputPorts[1]!.quantityType = module.inputPorts[0]!.quantityType;
    module.inputPorts[1]!.unit = module.inputPorts[0]!.unit;
    model.response.terms[1]!.k.unit = module.inputPorts[0]!.unit;
  }
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort = { ...module.outputPorts[0]!, id: 'monitor-local-ann-in', direction: 'input' };
  project.network.inputSources = sources;
  project.network.modules = [module];
  project.network.edges = module.inputPorts.map((port, index) => ({
    id: `edge-local-ann-${index}`,
    source: oneBranchedSource
      ? { nodeId: sources[0]!.id, portId: sources[0]!.outputPort.id }
      : {
          nodeId: index === 0 ? 'source-a' : 'source-b',
          portId: index === 0 ? 'source-a-out' : 'source-b-out',
        },
    target: { nodeId: module.id, portId: port.id },
    mapping: 'identity',
    enabled: true,
  }));
  project.network.edges.push({
    id: 'edge-local-ann-monitor',
    source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
    target: { nodeId: monitor.id, portId: monitor.inputPort.id },
    mapping: 'identity',
    enabled: true,
  });
  return project;
}

function directProject(sourceUnit: BfnUnit, monitorUnit: BfnUnit): BfnProject {
  const project = createDemoBfnProject();
  const source = project.network.inputSources[0]!;
  const monitor = project.network.outputMonitors[0]!;
  source.outputPort.entity = 'direct-local-ann';
  source.outputPort.quantityType = 'concentration';
  source.outputPort.unit = sourceUnit;
  source.staticSpecification = {
    type: 'working_range',
    minimum: 0,
    maximum: 2000,
    points: 11,
    unit: sourceUnit,
  };
  monitor.inputPort.entity = source.outputPort.entity;
  monitor.inputPort.quantityType = source.outputPort.quantityType;
  monitor.inputPort.unit = monitorUnit;
  project.network.modules = [];
  project.network.edges = [
    {
      id: 'edge-local-ann-direct',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  return project;
}

function identityProject(): BfnProject {
  const project = createDemoBfnProject();
  const module = project.network.modules[1]!;
  const model = activeStaticModel(module);
  module.activeModelIds = { static: model.id };
  module.outputPorts[0]!.entity = module.inputPorts[0]!.entity;
  module.outputPorts[0]!.quantityType = module.inputPorts[0]!.quantityType;
  module.outputPorts[0]!.unit = module.inputPorts[0]!.unit;
  model.family = 'identity';
  model.response = { family: 'identity', inputPortId: module.inputPorts[0]!.id };
  const source = sourceFor('source-identity', module.inputPorts[0]!);
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort = { ...module.outputPorts[0]!, id: 'monitor-identity-in', direction: 'input' };
  project.network.inputSources = [source];
  project.network.modules = [module];
  project.network.edges = [
    {
      id: 'edge-identity-input',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-identity-monitor',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  return project;
}

function mixedUnitModuleProject(): BfnProject {
  const project = createDemoBfnProject();
  const module = project.network.modules[0]!;
  const model = activeStaticModel(module);
  module.activeModelIds = { static: model.id };
  module.inputPorts[0]!.unit = 'uM';
  if (model.response.family !== 'hill_activation') throw new Error('Expected Hill activation.');
  model.response.k.unit = 'uM';
  const domain = project.registry.validityDomains.find(
    (candidate) => candidate.id === model.validityDomainId,
  )!;
  domain.inputRanges[0]!.unit = 'uM';
  domain.inputRanges[0]!.minimum = 0.001;
  domain.inputRanges[0]!.maximum = 1;
  const source = sourceFor('source-mixed-unit', module.inputPorts[0]!, 'nM');
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort = {
    ...module.outputPorts[0]!,
    id: 'monitor-mixed-unit-in',
    direction: 'input',
  };
  project.network.inputSources = [source];
  project.network.modules = [module];
  project.network.edges = [
    {
      id: 'edge-mixed-unit-input',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-mixed-unit-monitor',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  return project;
}

function zeroUpstreamUnavailableProject(n: number): BfnProject {
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
    n: { value: n, unit: 'dimensionless' },
  };
  return project;
}

function feedbackProject(): BfnProject {
  const project = createDemoBfnProject();
  const module = project.network.modules[1]!;
  module.inputPorts[0]!.entity = module.outputPorts[0]!.entity;
  module.inputPorts[0]!.quantityType = module.outputPorts[0]!.quantityType;
  module.inputPorts[0]!.unit = module.outputPorts[0]!.unit;
  const monitor = project.network.outputMonitors[0]!;
  project.network.modules = [module];
  project.network.edges = [
    {
      id: 'edge-local-ann-feedback',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-local-ann-feedback-monitor',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  return project;
}

describe('calculateBfnLocalAnnApproximation', () => {
  it('uses Batch 13.1 module gains and reconstructs every module output with one bias', () => {
    const project = createDemoBfnProject();
    const request = requestFor(project, [{ inputSourceId: 'source-ahl', value: 5, unit: 'nM' }]);
    const network = calculateBfnNetworkInfluence(project, {
      ...request,
      scope: 'network_static_output',
    });
    if (!network.ok) throw new Error('Expected network influence.');
    const result = successfulResult(calculateBfnLocalAnnApproximation(project, request));

    expect(result.moduleApproximations).toHaveLength(2);
    result.moduleApproximations.forEach((approximation, index) => {
      const local = network.result.moduleInterpretations[index]!.localInfluence;
      expect(approximation.inputWeights.map((input) => input.weight)).toEqual(
        local.perInput.map((input) => input.localDifferentialGain),
      );
      expect(approximation.bias.unit).toBe(approximation.outputAtOperatingPoint.unit);
      expect(rebuild(approximation.inputWeights, approximation.bias.value)).toBeCloseTo(
        approximation.outputAtOperatingPoint.value,
        12,
      );
    });
    expect(result.moduleApproximations[0]!.inputWeights[0]!.weight.value).toBeGreaterThan(0);
    expect(result.moduleApproximations[0]!.bias.value).toBeLessThan(0);
    expect(result.moduleApproximations[1]!.inputWeights[0]!.weight.value).toBeCloseTo(0.94, 12);
  });

  it('uses scientific identity weight one and bias zero', () => {
    const project = identityProject();
    const result = successfulResult(
      calculateBfnLocalAnnApproximation(
        project,
        requestFor(project, [
          { inputSourceId: 'source-identity', value: 0.4, unit: 'dimensionless' },
        ]),
      ),
    );
    expect(result.moduleApproximations[0]!.inputWeights[0]!.weight.value).toBe(1);
    expect(result.moduleApproximations[0]!.bias.value).toBe(0);
  });

  it('retains every multi-input weight, input identity, negative sign, and one reconstructing bias', () => {
    const project = dualInputProject();
    const result = successfulResult(
      calculateBfnLocalAnnApproximation(
        project,
        requestFor(project, [
          { inputSourceId: 'source-a', value: 0.4, unit: 'dimensionless' },
          { inputSourceId: 'source-b', value: 0.7, unit: 'dimensionless' },
        ]),
      ),
    );
    const module = result.moduleApproximations[0]!;
    expect(module.inputWeights.map((input) => input.inputPortId)).toEqual(
      project.network.modules[0]!.inputPorts.map((port) => port.id),
    );
    expect(module.inputWeights).toHaveLength(2);
    expect(module.inputWeights[0]!.weight.value).toBeGreaterThan(0);
    expect(module.inputWeights[1]!.weight.value).toBeLessThan(0);
    expect(rebuild(module.inputWeights, module.bias.value)).toBeCloseTo(
      module.outputAtOperatingPoint.value,
      12,
    );
  });

  it('uses Batch 13.2 overall gains and reconstructs the selected network output', () => {
    const project = dualInputProject(true);
    const request = requestFor(project, [
      { inputSourceId: 'source-shared', value: 0.6, unit: 'dimensionless' },
    ]);
    const network = calculateBfnNetworkInfluence(project, {
      ...request,
      scope: 'network_static_output',
    });
    if (!network.ok) throw new Error('Expected network influence.');
    const result = successfulResult(calculateBfnLocalAnnApproximation(project, request));

    expect(result.networkApproximation.sourceWeights.map((source) => source.weight)).toEqual(
      network.result.perSource.map((source) => source.totalDifferentialGain),
    );
    expect(
      rebuild(result.networkApproximation.sourceWeights, result.networkApproximation.bias.value),
    ).toBeCloseTo(result.outputAtOperatingPoint.value, 12);
    expect(result.networkApproximation.bias.unit).toBe(result.outputAtOperatingPoint.unit);
  });

  it('preserves stable source and module order', () => {
    const project = dualInputProject();
    const result = successfulResult(
      calculateBfnLocalAnnApproximation(
        project,
        requestFor(project, [
          { inputSourceId: 'source-a', value: 0.4, unit: 'dimensionless' },
          { inputSourceId: 'source-b', value: 0.7, unit: 'dimensionless' },
        ]),
      ),
    );
    expect(result.networkApproximation.sourceWeights.map((source) => source.inputSourceId)).toEqual(
      ['source-b', 'source-a'],
    );
    expect(result.moduleApproximations.map((module) => module.moduleId)).toEqual([
      project.network.modules[0]!.id,
    ]);
  });

  it('keeps a mixed-unit module weight in its downstream input coordinate', () => {
    const project = mixedUnitModuleProject();
    const result = successfulResult(
      calculateBfnLocalAnnApproximation(
        project,
        requestFor(project, [{ inputSourceId: 'source-mixed-unit', value: 100, unit: 'nM' }]),
      ),
    );
    const moduleWeight = result.moduleApproximations[0]!.inputWeights[0]!.weight;
    const overallWeight = result.networkApproximation.sourceWeights[0]!.weight;
    expect(moduleWeight.unit).toEqual({ outputUnit: 'dimensionless', inputUnit: 'uM' });
    expect(overallWeight.unit).toEqual({ outputUnit: 'dimensionless', inputUnit: 'nM' });
    expect(overallWeight.value).toBeCloseTo(moduleWeight.value * 0.001, 12);
  });

  it('creates a direct overall affine mapping without inventing a module', () => {
    const project = directProject('nM', 'uM');
    const result = successfulResult(
      calculateBfnLocalAnnApproximation(
        project,
        requestFor(project, [{ inputSourceId: 'source-ahl', value: 1000, unit: 'nM' }]),
      ),
    );
    expect(result.moduleApproximations).toEqual([]);
    expect(result.networkApproximation.sourceWeights[0]!.weight.value).toBeCloseTo(0.001, 15);
    expect(result.networkApproximation.bias.value).toBeCloseTo(0, 12);
    expect(result.networkApproximation.bias.unit).toBe('uM');
  });

  it('inherits first-order steady-state basis without exposing tau as a weight or bias', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 10,
      unit: 'nM',
    };
    const result = successfulResult(
      calculateBfnLocalAnnApproximation(project, requestFor(project)),
    );
    expect(
      result.moduleApproximations.every(
        (module) => module.interpretationBasis === 'first_order_steady_state_static_response',
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('tau');
  });

  it('inherits applicability, Context, and component Evidence from Batch 13.2', () => {
    const project = createDemoBfnProject();
    const reporter = project.network.modules[1]!;
    const reporterModel = activeStaticModel(reporter);
    project.registry.validityDomains.find(
      (domain) => domain.id === reporterModel.validityDomainId,
    )!.inputRanges = [];
    const context = {
      ...structuredClone(project.registry.contexts[0]!),
      id: 'context-local-ann-mismatch',
      temperatureCelsius: (project.registry.contexts[0]!.temperatureCelsius ?? 37) + 5,
    };
    project.registry.contexts.push(context);
    reporterModel.contextId = context.id;
    project.registry.validityDomains.find(
      (domain) => domain.id === reporterModel.validityDomainId,
    )!.contextId = context.id;
    const request = requestFor(project);
    const network = calculateBfnNetworkInfluence(project, {
      ...request,
      scope: 'network_static_output',
    });
    if (!network.ok) throw new Error('Expected network influence.');
    const result = successfulResult(calculateBfnLocalAnnApproximation(project, request));

    expect(result.applicability).toBe(network.result.applicability);
    expect(result.contextApplicability).toEqual(network.result.contextApplicability);
    expect(result.contextApplicability.summary).toBe('mismatch_present');
    expect(result.moduleApproximations.map((module) => module.evidence)).toEqual(
      network.result.moduleInterpretations.map(
        (interpretation) => interpretation.localInfluence.target.evidence,
      ),
    );
    expect(result).not.toHaveProperty('networkEvidenceGrade');
    expect(result).not.toHaveProperty('uncertaintyInterval');
  });

  it.each([
    { n: 1, reason: 'derivative_not_unique' },
    { n: 0.5, reason: 'derivative_non_finite' },
  ] as const)(
    'rejects a complete approximation when a local derivative is $reason',
    ({ n, reason }) => {
      const project = dualInputProject();
      const model = activeStaticModel(project.network.modules[0]!);
      if (model.response.family !== 'independent_inputs')
        throw new Error('Expected dual response.');
      model.response.terms[0]!.n.value = n;
      delete model.response.terms[0]!.n.interval95;
      const calculation = calculateBfnLocalAnnApproximation(
        project,
        requestFor(project, [
          { inputSourceId: 'source-a', value: 0, unit: 'dimensionless' },
          { inputSourceId: 'source-b', value: 0.7, unit: 'dimensionless' },
        ]),
      );
      expect(calculation).toMatchObject({
        ok: false,
        issue: { code: 'incomplete_local_linearization', reason },
      });
    },
  );

  it.each([
    { n: 1, reason: 'derivative_not_unique' },
    { n: 0.5, reason: 'derivative_non_finite' },
  ] as const)(
    'rejects an unavailable module weight even when Batch 13.2 contains it behind zero upstream sensitivity ($reason)',
    ({ n, reason }) => {
      const project = zeroUpstreamUnavailableProject(n);
      const request = requestFor(project);
      const network = calculateBfnNetworkInfluence(project, {
        ...request,
        scope: 'network_static_output',
      });
      if (!network.ok) throw new Error('Expected contained network influence.');
      expect(network.result.perSource[0]!.totalDifferentialGain).toMatchObject({
        availability: 'available',
        value: 0,
      });

      expect(calculateBfnLocalAnnApproximation(project, request)).toMatchObject({
        ok: false,
        issue: {
          code: 'incomplete_local_linearization',
          moduleId: 'module-reporter',
          reason,
        },
      });
    },
  );

  it('inherits outside-domain rejection without a normal approximation result', () => {
    const project = createDemoBfnProject();
    const calculation = calculateBfnLocalAnnApproximation(
      project,
      requestFor(project, [{ inputSourceId: 'source-ahl', value: 150, unit: 'nM' }]),
    );
    expect(calculation.ok).toBe(false);
    if (calculation.ok) throw new Error('Expected rejection.');
    expect(calculation.networkInfluence).toMatchObject({
      ok: false,
      calculationIssue: { code: 'outside_recorded_domain' },
    });
    expect(calculation).not.toHaveProperty('result');
  });

  it('inherits Accumulator and feedback rejection without constructing static weights', () => {
    const accumulator = createAccumulatorBfnProject();
    expect(
      calculateBfnLocalAnnApproximation(
        accumulator,
        requestFor(accumulator, [
          { inputSourceId: 'source-accumulator-rate', value: 1, unit: 'nM/h' },
        ]),
      ),
    ).toMatchObject({
      ok: false,
      networkInfluence: {
        admission: {
          issues: [expect.objectContaining({ code: 'upstream_accumulator_unsupported' })],
        },
      },
    });

    const feedback = feedbackProject();
    expect(calculateBfnLocalAnnApproximation(feedback, requestFor(feedback, []))).toMatchObject({
      ok: false,
      networkInfluence: {
        admission: { issues: [expect.objectContaining({ code: 'upstream_feedback_unsupported' })] },
      },
    });
  });

  it('is deterministic, deeply ephemeral, non-mutating, and independent of old fit thresholds', () => {
    const project = createDemoBfnProject();
    const request = requestFor(project);
    const projectBefore = structuredClone(project);
    const requestBefore = structuredClone(request);
    const first = successfulResult(calculateBfnLocalAnnApproximation(project, request));
    project.analysis.annThresholds = { minimumR2: Number.POSITIVE_INFINITY, maximumNrmse: -1 };
    const second = successfulResult(calculateBfnLocalAnnApproximation(project, request));

    expect(second).toEqual(first);
    expect(first.persistence).toBe('ephemeral');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.moduleApproximations)).toBe(true);
    expect(Object.isFrozen(first.networkApproximation)).toBe(true);
    expect(request).toEqual(requestBefore);
    expect({ ...project, analysis: projectBefore.analysis }).toEqual(projectBefore);
    expect(project.network.edges).toEqual(projectBefore.network.edges);
    expect(project.network.modules).toEqual(projectBefore.network.modules);
    expect(project.network.inputSources).toEqual(projectBefore.network.inputSources);
    expect(first).not.toHaveProperty('r2');
    expect(first).not.toHaveProperty('nrmse');
    expect(first).not.toHaveProperty('status');
    expect(first).not.toHaveProperty('accepted');
  });

  it('does not import or call the existing range-fit ANN implementation', () => {
    const source = readFileSync('src/features/bfn/interpretation/localAnnApproximation.ts', 'utf8');
    expect(source).not.toMatch(/buildAnnApproximation|annApproximation\.ts|annThresholds|R²|NRMSE/);
  });
});
