import { describe, expect, it } from 'vitest';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import type {
  BfnFunctionalModule,
  BfnInputSource,
  BfnProject,
  BfnStaticModel,
  BfnUnit,
} from '../types';
import { assessBfnConnectionContextApplicability } from '../compatibility/contextIntegration';
import { calculateBfnNetworkInfluence } from './networkInfluence';
import type {
  BfnNetworkInfluenceCalculationV1,
  BfnNetworkInfluenceRequestV1,
  BfnNetworkInfluenceResultV1,
} from './networkInfluenceTypes';

function requestFor(
  project: BfnProject,
  values: readonly { inputSourceId: string; value: number; unit: BfnUnit }[] = [
    { inputSourceId: 'source-ahl', value: 10, unit: 'nM' },
  ],
): BfnNetworkInfluenceRequestV1 {
  return {
    contractVersion: '1.0',
    scope: 'network_static_output',
    outputMonitorId: project.network.outputMonitors[0]!.id,
    operatingPoint: values,
  };
}

function successfulResult(
  calculation: BfnNetworkInfluenceCalculationV1,
): BfnNetworkInfluenceResultV1 {
  if (!calculation.ok) throw new Error('Expected network influence calculation to succeed.');
  return calculation.result;
}

function availableGain(result: BfnNetworkInfluenceResultV1, sourceIndex = 0): number {
  const gain = result.perSource[sourceIndex]?.totalDifferentialGain;
  if (!gain || gain.availability !== 'available') throw new Error('Expected an available gain.');
  return gain.value;
}

function activeStaticModel(module: BfnFunctionalModule): BfnStaticModel {
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.mode === 'static' && candidate.id === module.activeModelIds.static,
  );
  if (!model) throw new Error('Expected an active static model.');
  return model;
}

function setStaticModuleContext(project: BfnProject, moduleIndex: number, contextId: string): void {
  const model = activeStaticModel(project.network.modules[moduleIndex]!);
  model.contextId = contextId;
  const domain = project.registry.validityDomains.find(
    (candidate) => candidate.id === model.validityDomainId,
  );
  if (!domain) throw new Error('Expected a validity domain.');
  domain.contextId = contextId;
}

function addComparedContext(
  project: BfnProject,
  changes: Partial<(typeof project.registry.contexts)[number]>,
): string {
  const context = {
    ...structuredClone(project.registry.contexts[0]!),
    ...changes,
    id: 'context-network-compared',
  };
  project.registry.contexts.push(context);
  return context.id;
}

function sourceFor(
  id: string,
  entity: string,
  unit: BfnUnit,
  quantityType: BfnInputSource['outputPort']['quantityType'] = 'activity',
): BfnInputSource {
  return {
    kind: 'input_source',
    id,
    labelKey: `bfn.testing.${id}`,
    outputPort: {
      id: `${id}-out`,
      entity,
      quantityType,
      unit,
      direction: 'output',
    },
    staticSpecification: { type: 'working_range', minimum: 0, maximum: 100, points: 11, unit },
    dynamicSpecification: { type: 'step', before: 0, after: 1, atHours: 1, unit },
    position: { x: 0, y: 0 },
  };
}

function dualInputProject(
  options: {
    readonly oneBranchedSource?: boolean;
    readonly repressionSecond?: boolean;
    readonly saturated?: boolean;
  } = {},
): BfnProject {
  const project = createDemoBfnProject();
  const module = createCatalogModule('dual-input-gate', 'network');
  const model = activeStaticModel(module);
  if (model.response.family !== 'independent_inputs') throw new Error('Expected dual response.');
  if (options.repressionSecond) model.response.terms[1]!.direction = 'repression';
  if (options.saturated) {
    model.response.outputMaximum = { value: 0.5, unit: 'dimensionless' };
  }
  const domainId = 'domain-dual-network';
  model.validityDomainId = domainId;
  const contextId = project.registry.contexts[0]?.id ?? null;
  model.contextId = contextId;
  project.registry.validityDomains = [
    {
      id: domainId,
      labelKey: 'bfn.testing.dualNetworkDomain',
      inputRanges: module.inputPorts.map((port) => ({
        portId: port.id,
        minimum: 0,
        maximum: 100,
        unit: port.unit,
      })),
      contextId,
    },
  ];

  let sources: BfnInputSource[];
  if (options.oneBranchedSource) {
    module.inputPorts[1]!.entity = module.inputPorts[0]!.entity;
    module.inputPorts[1]!.quantityType = module.inputPorts[0]!.quantityType;
    module.inputPorts[1]!.unit = module.inputPorts[0]!.unit;
    sources = [
      sourceFor('source-shared', module.inputPorts[0]!.entity, module.inputPorts[0]!.unit),
    ];
  } else {
    sources = [
      sourceFor('source-b', module.inputPorts[1]!.entity, module.inputPorts[1]!.unit),
      sourceFor('source-a', module.inputPorts[0]!.entity, module.inputPorts[0]!.unit),
    ];
  }
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort.entity = module.outputPorts[0]!.entity;
  monitor.inputPort.quantityType = module.outputPorts[0]!.quantityType;
  monitor.inputPort.unit = module.outputPorts[0]!.unit;
  project.network.modules = [module];
  project.network.inputSources = sources;
  project.network.edges = options.oneBranchedSource
    ? module.inputPorts.map((port, index) => ({
        id: `edge-shared-dual-${index}`,
        source: { nodeId: sources[0]!.id, portId: sources[0]!.outputPort.id },
        target: { nodeId: module.id, portId: port.id },
        mapping: 'identity' as const,
        enabled: true,
      }))
    : [
        {
          id: 'edge-source-a-dual',
          source: { nodeId: 'source-a', portId: 'source-a-out' },
          target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
          mapping: 'identity',
          enabled: true,
        },
        {
          id: 'edge-source-b-dual',
          source: { nodeId: 'source-b', portId: 'source-b-out' },
          target: { nodeId: module.id, portId: module.inputPorts[1]!.id },
          mapping: 'identity',
          enabled: true,
        },
      ];
  project.network.edges.push({
    id: 'edge-dual-monitor',
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
  source.outputPort.entity = 'direct-concentration';
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
      id: 'edge-direct-monitor',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  return project;
}

describe('calculateBfnNetworkInfluence', () => {
  it('propagates a single-chain derivative as the product of module-local gains', () => {
    const project = createDemoBfnProject();
    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));
    const localProduct = result.moduleInterpretations.reduce((product, interpretation) => {
      const gain = interpretation.localInfluence.perInput[0]!.localDifferentialGain;
      if (gain.availability !== 'available') throw new Error('Expected local gain.');
      return product * gain.value;
    }, 1);

    expect(availableGain(result)).toBeCloseTo(localProduct, 12);
    expect(result.perSource[0]!.direction).toBe('enhancing');
  });

  it('uses each production module output as the next operating value and current output', () => {
    const project = createDemoBfnProject();
    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));
    const sensorOutput =
      result.moduleInterpretations[0]!.localInfluence.outputAtOperatingPoint.value;
    const reporterInput = result.moduleInterpretations[1]!.localInfluence.operatingPoint[0]!.value;
    const reporterOutput =
      result.moduleInterpretations[1]!.localInfluence.outputAtOperatingPoint.value;

    expect(reporterInput).toBe(sensorOutput);
    expect(result.outputAtOperatingPoint.value).toBe(reporterOutput);
    expect(result.outputAtOperatingPoint.value).toBeCloseTo(0.4706, 12);
  });

  it('converts direct nM input to uM output as a numeric coordinate sensitivity', () => {
    const project = directProject('nM', 'uM');
    const request = requestFor(project, [{ inputSourceId: 'source-ahl', value: 1000, unit: 'nM' }]);
    const result = successfulResult(calculateBfnNetworkInfluence(project, request));

    expect(result.outputAtOperatingPoint.value).toBeCloseTo(1, 12);
    expect(result.outputAtOperatingPoint.unit).toBe('uM');
    expect(availableGain(result)).toBeCloseTo(0.001, 15);
    expect(result.perSource[0]!.totalDifferentialGain.unit).toEqual({
      outputUnit: 'uM',
      inputUnit: 'nM',
    });
    expect(result.target.directTransmission).toBe(true);
    expect(project.network.edges[0]).not.toHaveProperty('gain');
    expect(project.network.edges[0]).not.toHaveProperty('weight');
  });

  it('returns direct same-unit transmission as exactly one', () => {
    const project = directProject('nM', 'nM');
    const result = successfulResult(
      calculateBfnNetworkInfluence(
        project,
        requestFor(project, [{ inputSourceId: 'source-ahl', value: 7, unit: 'nM' }]),
      ),
    );
    expect(availableGain(result)).toBe(1);
    expect(result.perSource[0]!.logElasticity).toEqual({
      availability: 'available',
      value: 1,
      unit: 'dimensionless',
    });
  });

  it('preserves Project source order for a multi-input module', () => {
    const project = dualInputProject({ repressionSecond: true });
    const result = successfulResult(
      calculateBfnNetworkInfluence(
        project,
        requestFor(project, [
          { inputSourceId: 'source-a', value: 0.4, unit: 'dimensionless' },
          { inputSourceId: 'source-b', value: 0.7, unit: 'dimensionless' },
        ]),
      ),
    );

    expect(result.perSource.map((source) => source.inputSourceId)).toEqual([
      'source-b',
      'source-a',
    ]);
    expect(result.perSource.map((source) => source.direction)).toEqual(['inhibiting', 'enhancing']);
  });

  it('sums converging branch sensitivities for one external source', () => {
    const project = dualInputProject({ oneBranchedSource: true });
    const result = successfulResult(
      calculateBfnNetworkInfluence(
        project,
        requestFor(project, [
          { inputSourceId: 'source-shared', value: 0.6, unit: 'dimensionless' },
        ]),
      ),
    );
    const local = result.moduleInterpretations[0]!.localInfluence;
    const expected = local.perInput.reduce((sum, input) => {
      const gain = input.localDifferentialGain;
      if (gain.availability !== 'available') throw new Error('Expected local gain.');
      return sum + gain.value;
    }, 0);
    expect(availableGain(result)).toBeCloseTo(expected, 12);
  });

  it('propagates an exactly saturated branch as zero', () => {
    const project = dualInputProject({ oneBranchedSource: true, saturated: true });
    const result = successfulResult(
      calculateBfnNetworkInfluence(
        project,
        requestFor(project, [{ inputSourceId: 'source-shared', value: 1, unit: 'dimensionless' }]),
      ),
    );
    expect(availableGain(result)).toBe(0);
    expect(result.perSource[0]!.direction).toBe('no_local_change');
  });

  it('contains an unavailable local derivative to the source that reaches it', () => {
    const project = dualInputProject();
    const module = project.network.modules[0]!;
    const model = activeStaticModel(module);
    if (model.response.family !== 'independent_inputs') throw new Error('Expected dual response.');
    model.response.terms[0]!.n = { value: 1, unit: 'dimensionless' };
    const result = successfulResult(
      calculateBfnNetworkInfluence(
        project,
        requestFor(project, [
          { inputSourceId: 'source-a', value: 0, unit: 'dimensionless' },
          { inputSourceId: 'source-b', value: 0.7, unit: 'dimensionless' },
        ]),
      ),
    );
    const byId = new Map(result.perSource.map((source) => [source.inputSourceId, source] as const));

    expect(byId.get('source-a')?.totalDifferentialGain.availability).toBe('unavailable');
    expect(byId.get('source-b')?.totalDifferentialGain.availability).toBe('available');
  });

  it('calculates dimensionless relative sensitivity from the same network point', () => {
    const project = createDemoBfnProject();
    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));
    const elasticity = result.perSource[0]!.logElasticity;
    if (elasticity.availability !== 'available') throw new Error('Expected elasticity.');
    expect(elasticity.value).toBeCloseTo(
      (10 / result.outputAtOperatingPoint.value) * availableGain(result),
      12,
    );
    expect(elasticity.unit).toBe('dimensionless');
  });

  it('blocks the formal result and identifies an internal outside-domain point', () => {
    const project = createDemoBfnProject();
    const calculation = calculateBfnNetworkInfluence(
      project,
      requestFor(project, [{ inputSourceId: 'source-ahl', value: 150, unit: 'nM' }]),
    );
    expect(calculation.ok).toBe(false);
    if (calculation.ok) throw new Error('Expected outside-domain failure.');
    expect(calculation.calculationIssue).toMatchObject({
      code: 'outside_recorded_domain',
      moduleId: 'module-ahl-sensor',
      inputPortId: 'module-ahl-sensor-in',
      currentValue: 150,
      currentUnit: 'nM',
      minimum: 0.1,
      maximum: 100,
      rangeUnit: 'nM',
    });
  });

  it('allows a result and aggregates applicability when one model range is not recorded', () => {
    const project = createDemoBfnProject();
    const reporter = project.network.modules[1]!;
    const reporterModel = activeStaticModel(reporter);
    const domain = project.registry.validityDomains.find(
      (candidate) => candidate.id === reporterModel.validityDomainId,
    )!;
    domain.inputRanges = [];
    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));
    expect(result.applicability).toBe('applicability_not_recorded');
  });

  it('ignores an off-target module whose configured source lies outside its domain', () => {
    const project = createDemoBfnProject();
    const unrelated = createCatalogModule('ahl-sensor', 'outside-target');
    const model = activeStaticModel(unrelated);
    const domainId = 'domain-outside-target';
    model.validityDomainId = domainId;
    project.registry.validityDomains.push({
      id: domainId,
      labelKey: 'bfn.testing.outsideTargetDomain',
      inputRanges: [
        {
          portId: unrelated.inputPorts[0]!.id,
          minimum: 0,
          maximum: 1,
          unit: unrelated.inputPorts[0]!.unit,
        },
      ],
      contextId: model.contextId,
    });
    const source = sourceFor(
      'source-outside-target',
      unrelated.inputPorts[0]!.entity,
      unrelated.inputPorts[0]!.unit,
      unrelated.inputPorts[0]!.quantityType,
    );
    source.staticSpecification = { type: 'fixed_value', value: 50, unit: source.outputPort.unit };
    project.network.inputSources.push(source);
    project.network.modules.push(unrelated);
    project.network.edges.push({
      id: 'edge-outside-target',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: unrelated.id, portId: unrelated.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    });

    expect(calculateBfnNetworkInfluence(project, requestFor(project)).ok).toBe(true);
  });

  it('retains component evidence, provenance scope, uncertainty, and steady-state basis', () => {
    const project = createDemoBfnProject();
    const implementation = project.registry.implementations.find(
      (candidate) => candidate.id === project.network.modules[0]!.implementationIds[0],
    );
    implementation?.provenanceIds.push('implementation-only-provenance');
    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));

    expect(result.moduleInterpretations).toHaveLength(2);
    expect(result.moduleInterpretations[0]!.localInfluence.target.evidence).toMatchObject({
      evidenceGrade: 'data_driven_prediction',
      uncertaintyMethod: 'parameter_interval_envelope',
      provenanceIds: [],
    });
    expect(
      result.moduleInterpretations[0]!.localInfluence.target.evidence.provenanceIds,
    ).not.toContain('implementation-only-provenance');
    expect(result.moduleInterpretations[0]!.localInfluence.target.interpretationBasis).toBe(
      'first_order_steady_state_static_response',
    );
    expect(result).not.toHaveProperty('networkEvidenceGrade');
    expect(result).not.toHaveProperty('uncertaintyInterval');
  });

  it('retains a matched target-scoped Module-to-Module Context snapshot', () => {
    const project = createDemoBfnProject();
    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));

    expect(result.contextApplicability).toMatchObject({
      scope: 'target_relevant_module_edges',
      summary: 'matched',
      edges: [{ edgeId: 'edge-sensor-reporter', state: 'matched' }],
    });
    expect(result.contextApplicability.edges[0]!.checks).toHaveLength(4);
  });

  it('keeps a mathematical result and exact per-edge checks when relevant Contexts mismatch', () => {
    const project = createDemoBfnProject();
    const originalTemperature = project.registry.contexts[0]!.temperatureCelsius;
    if (originalTemperature === null) throw new Error('Expected demo temperature.');
    const contextId = addComparedContext(project, {
      temperatureCelsius: originalTemperature + 5,
    });
    setStaticModuleContext(project, 1, contextId);

    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));

    expect(result.outputAtOperatingPoint.value).toBeCloseTo(0.4706, 12);
    expect(result.contextApplicability.summary).toBe('mismatch_present');
    const [edgeContext] = result.contextApplicability.edges;
    expect(edgeContext).toEqual(
      expect.objectContaining({
        edgeId: 'edge-sensor-reporter',
        state: 'mismatched',
      }),
    );
    expect(edgeContext?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'temperatureCelsius', state: 'mismatched' }),
      ]),
    );
  });

  it('retains an uncertain relevant Context without blocking the result', () => {
    const project = createDemoBfnProject();
    const contextId = addComparedContext(project, { host: 'A differently reported host' });
    setStaticModuleContext(project, 1, contextId);

    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));

    expect(result.contextApplicability.summary).toBe('uncertain_or_unavailable');
    expect(result.contextApplicability.edges[0]).toMatchObject({
      edgeId: 'edge-sensor-reporter',
      state: 'uncertain',
    });
  });

  it('retains an unavailable relevant Context without blocking steady-state calculation', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 10,
      unit: 'nM',
    };
    const reporter = project.network.modules[1]!;
    const dynamicModel = reporter.modelVariants.find(
      (candidate) => candidate.id === reporter.activeModelIds.dynamic,
    );
    if (!dynamicModel || dynamicModel.mode !== 'dynamic') {
      throw new Error('Expected an active dynamic model.');
    }
    dynamicModel.contextId = 'context-missing-from-registry';

    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));

    expect(result.contextApplicability.summary).toBe('uncertain_or_unavailable');
    expect(result.contextApplicability.edges[0]).toMatchObject({
      edgeId: 'edge-sensor-reporter',
      state: 'unavailable',
    });
  });

  it('ignores an off-target Context mismatch', () => {
    const project = createDemoBfnProject();
    const originalTemperature = project.registry.contexts[0]!.temperatureCelsius;
    if (originalTemperature === null) throw new Error('Expected demo temperature.');
    const contextId = addComparedContext(project, {
      temperatureCelsius: originalTemperature + 5,
    });
    const offTargetSource = structuredClone(project.network.modules[0]!);
    const offTargetTarget = structuredClone(project.network.modules[1]!);
    offTargetSource.id = 'module-off-target-source';
    offTargetTarget.id = 'module-off-target-target';
    const offTargetModel = offTargetTarget.modelVariants.find(
      (candidate) => candidate.id === offTargetTarget.activeModelIds.static,
    );
    if (!offTargetModel || offTargetModel.mode !== 'static') {
      throw new Error('Expected an off-target static model.');
    }
    offTargetModel.contextId = contextId;
    project.network.modules.push(offTargetSource, offTargetTarget);
    const offTargetEdge = {
      id: 'edge-off-target-context-mismatch',
      source: {
        nodeId: offTargetSource.id,
        portId: offTargetSource.outputPorts[0]!.id,
      },
      target: {
        nodeId: offTargetTarget.id,
        portId: offTargetTarget.inputPorts[0]!.id,
      },
      mapping: 'identity' as const,
      enabled: true,
    };
    project.network.edges.push(offTargetEdge);
    expect(
      assessBfnConnectionContextApplicability(project, offTargetEdge.source, offTargetEdge.target)
        .overall,
    ).toBe('mismatched');

    const result = successfulResult(calculateBfnNetworkInfluence(project, requestFor(project)));

    expect(result.contextApplicability.summary).toBe('matched');
    expect(result.contextApplicability.edges.map((edge) => edge.edgeId)).toEqual([
      'edge-sensor-reporter',
    ]);
  });

  it('marks direct source transmission Context as not applicable', () => {
    const project = directProject('nM', 'uM');
    const result = successfulResult(
      calculateBfnNetworkInfluence(
        project,
        requestFor(project, [{ inputSourceId: 'source-ahl', value: 1000, unit: 'nM' }]),
      ),
    );

    expect(result.contextApplicability).toEqual({
      scope: 'target_relevant_module_edges',
      summary: 'not_applicable',
      edges: [],
    });
  });

  it('is pure, ephemeral, frozen, and independent of ANN thresholds', () => {
    const project = createDemoBfnProject();
    const request = requestFor(project);
    const projectBefore = structuredClone(project);
    const requestBefore = structuredClone(request);
    const first = successfulResult(calculateBfnNetworkInfluence(project, request));
    project.analysis.annThresholds = { minimumR2: 0.01, maximumNrmse: 99 };
    const second = successfulResult(calculateBfnNetworkInfluence(project, request));

    expect(first.outputAtOperatingPoint).toEqual(second.outputAtOperatingPoint);
    expect(first.perSource).toEqual(second.perSource);
    expect(first.persistence).toBe('ephemeral');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.perSource)).toBe(true);
    expect(Object.isFrozen(first.contextApplicability)).toBe(true);
    expect(Object.isFrozen(first.contextApplicability.edges)).toBe(true);
    expect(request).toEqual(requestBefore);
    expect({ ...project, analysis: projectBefore.analysis }).toEqual(projectBefore);
    expect(project.network.inputSources[0]!.staticSpecification).toEqual(
      projectBefore.network.inputSources[0]!.staticSpecification,
    );
    expect(project.network.edges).toEqual(projectBefore.network.edges);
  });
});
