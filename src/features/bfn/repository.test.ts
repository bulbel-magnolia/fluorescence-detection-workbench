import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalog/catalogBfnAdapter';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import {
  BFN_PROJECT_STORAGE_KEY,
  BFN_RUN_STORAGE_KEY,
  LEGACY_MODELING_PROJECT_KEY,
  loadBfnRuns,
  legacyModelingProjectExists,
  loadBfnProject,
  parseBfnProject,
  saveBfnRun,
  saveBfnProject,
} from './repository';
import { runBfnSimulation } from './simulation';
import {
  ACCUMULATOR_INPUT_PORT_ID,
  ACCUMULATOR_MODULE_ID,
  createAccumulatorBfnProject,
  getAccumulatorModule,
} from './testing/accumulatorFixtures';
import type { BfnStaticModel } from './types';
import { validateBfnProject } from './validation';

function projectWithCatalogReference() {
  const project = createDemoBfnProject();
  const candidate = buildBfnCatalogRuntimeCandidate(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id);
  const result = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-catalog-repository',
    modulePosition: { x: 360, y: 220 },
    createInputSource: false,
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.nextProject;
}

function asHistoricalV21(result: ReturnType<typeof runBfnSimulation>): Record<string, unknown> {
  const historical = structuredClone(result) as unknown as Record<string, unknown>;
  historical.engineVersion = 'BFN-SIM-2.1';
  const snapshot = historical.uncertaintySnapshot as {
    modules: Array<Record<string, unknown>>;
  };
  for (const module of snapshot.modules) delete module.propagationMode;
  const metrics = historical.dynamicMetrics;
  if (metrics !== null && typeof metrics === 'object' && !Array.isArray(metrics)) {
    delete (metrics as Record<string, unknown>).terminalValue;
    delete (metrics as Record<string, unknown>).steadyStateAvailable;
  }
  return historical;
}

function asHistoricalV20(result: ReturnType<typeof runBfnSimulation>): Record<string, unknown> {
  const historical = asHistoricalV21(result);
  historical.engineVersion = 'BFN-SIM-2.0';
  delete historical.uncertaintySnapshot;
  return historical;
}

function parameterEnvelopeIdentityAccumulatorProject(): {
  project: ReturnType<typeof createAccumulatorBfnProject>;
  identityModuleId: string;
} {
  const project = createAccumulatorBfnProject();
  const source = project.network.inputSources[0]!;
  const accumulator = getAccumulatorModule(project);
  const producerModuleId = 'module-repository-rate-producer';
  const producerInputPortId = 'port-repository-rate-producer-in';
  const producerOutputPortId = 'port-repository-rate-producer-out';
  const producerDomainId = 'domain-repository-rate-producer';
  const identityModuleId = 'module-repository-zero-parameter-identity';
  const identityInputPortId = 'port-repository-zero-parameter-identity-in';
  const identityOutputPortId = 'port-repository-zero-parameter-identity-out';
  const identityDomainId = 'domain-repository-zero-parameter-identity';
  const producerModel: BfnStaticModel = {
    id: 'model-repository-rate-producer',
    version: 'test.1',
    mode: 'static',
    family: 'linear_transfer',
    response: {
      family: 'linear_transfer',
      inputPortId: producerInputPortId,
      scale: { value: 1, unit: 'dimensionless', interval95: [0.5, 1.5] },
      intercept: { value: 0, unit: 'nM/h', interval95: [0, 0] },
    },
    contextId: null,
    validityDomainId: producerDomainId,
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'parameter_interval_envelope',
    isDemo: true,
  };
  const identityModel: BfnStaticModel = {
    id: 'model-repository-zero-parameter-identity',
    version: 'test.1',
    mode: 'static',
    family: 'identity',
    response: { family: 'identity', inputPortId: identityInputPortId },
    contextId: null,
    validityDomainId: identityDomainId,
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'parameter_interval_envelope',
    isDemo: true,
  };

  source.outputPort = {
    ...source.outputPort,
    entity: 'entity.repository.rate-control',
    quantityType: 'concentration',
    unit: 'nM',
  };
  source.staticSpecification = { type: 'fixed_value', value: 10, unit: 'nM' };
  source.dynamicSpecification = { type: 'constant', value: 10, unit: 'nM' };
  project.analysis.durationHours = 1;
  project.analysis.timeStepHours = 0.5;
  project.network.modules.push(
    {
      kind: 'functional_module',
      id: producerModuleId,
      labelKey: 'bfn.testing.repositoryRateProducer',
      descriptionKey: 'bfn.testing.repositoryRateProducerDescription',
      inputPorts: [
        {
          id: producerInputPortId,
          entity: source.outputPort.entity,
          quantityType: 'concentration',
          unit: 'nM',
          direction: 'input',
        },
      ],
      outputPorts: [
        {
          id: producerOutputPortId,
          entity: accumulator.inputPorts[0]!.entity,
          quantityType: 'production_rate',
          unit: 'nM/h',
          direction: 'output',
        },
      ],
      modelVariants: [producerModel],
      activeModelIds: { static: producerModel.id },
      implementationIds: [],
      implementationState: 'unspecified',
      evidenceGrade: 'independent_assumption',
      position: { x: 160, y: 160 },
      isDemo: true,
    },
    {
      kind: 'functional_module',
      id: identityModuleId,
      labelKey: 'bfn.testing.repositoryIdentity',
      descriptionKey: 'bfn.testing.repositoryIdentityDescription',
      inputPorts: [
        {
          id: identityInputPortId,
          entity: accumulator.inputPorts[0]!.entity,
          quantityType: 'production_rate',
          unit: 'nM/h',
          direction: 'input',
        },
      ],
      outputPorts: [
        {
          id: identityOutputPortId,
          entity: accumulator.inputPorts[0]!.entity,
          quantityType: 'production_rate',
          unit: 'nM/h',
          direction: 'output',
        },
      ],
      modelVariants: [identityModel],
      activeModelIds: { static: identityModel.id },
      implementationIds: [],
      implementationState: 'unspecified',
      evidenceGrade: 'independent_assumption',
      position: { x: 260, y: 160 },
      isDemo: true,
    },
  );
  project.registry.validityDomains.push(
    {
      id: producerDomainId,
      labelKey: 'bfn.testing.repositoryRateProducerDomain',
      inputRanges: [{ portId: producerInputPortId, minimum: 0, maximum: 20, unit: 'nM' }],
      contextId: null,
    },
    {
      id: identityDomainId,
      labelKey: 'bfn.testing.repositoryIdentityDomain',
      inputRanges: [],
      contextId: null,
    },
  );
  project.network.edges = project.network.edges.filter(
    (edge) => edge.id !== 'edge-accumulator-rate',
  );
  project.network.edges.push(
    {
      id: 'edge-repository-source-producer',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: producerModuleId, portId: producerInputPortId },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-repository-producer-identity',
      source: { nodeId: producerModuleId, portId: producerOutputPortId },
      target: { nodeId: identityModuleId, portId: identityInputPortId },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-repository-identity-accumulator',
      source: { nodeId: identityModuleId, portId: identityOutputPortId },
      target: { nodeId: ACCUMULATOR_MODULE_ID, portId: ACCUMULATOR_INPUT_PORT_ID },
      mapping: 'identity',
      enabled: true,
    },
  );
  return { project, identityModuleId };
}

describe('BFN-IR repository', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a versioned BFN-IR 2.3 project', () => {
    const project = createDemoBfnProject();
    saveBfnProject(project);
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull();
    expect(loadBfnProject()).toEqual(project);
  });

  it('round-trips a dynamic-only accumulator through JSON and localStorage losslessly', () => {
    const project = createAccumulatorBfnProject();

    expect(parseBfnProject(JSON.stringify(project))).toEqual(project);
    saveBfnProject(project);
    expect(loadBfnProject()).toEqual(project);
  });

  it('round-trips a valid optional Catalog model reference', () => {
    const project = projectWithCatalogReference();

    expect(parseBfnProject(JSON.stringify(project))).toEqual(project);
  });

  it('round-trips optional localized node names and keeps legacy nodes valid', () => {
    const project = createDemoBfnProject();
    project.network.inputSources[0]!.displayName = {
      en: '3OC6-HSL (L)',
      zh: '3OC6-HSL（L）',
    };
    project.network.inputSources[0]!.outputPort.displayName = {
      en: '3OC6-HSL (L)',
      zh: '3OC6-HSL（L）',
    };
    project.network.modules[0]!.displayName = { en: 'RhlR / pRhl', zh: 'RhlR / pRhl' };

    const parsed = parseBfnProject(JSON.stringify(project));

    expect(parsed.network.inputSources[0]?.displayName).toEqual(
      project.network.inputSources[0]?.displayName,
    );
    expect(parsed.network.inputSources[0]?.outputPort.displayName).toEqual(
      project.network.inputSources[0]?.outputPort.displayName,
    );
    expect(parsed.network.modules[0]?.displayName).toEqual(project.network.modules[0]?.displayName);
    delete project.network.inputSources[0]!.displayName;
    delete project.network.inputSources[0]!.outputPort.displayName;
    delete project.network.modules[0]!.displayName;
    expect(parseBfnProject(JSON.stringify(project))).toEqual(project);
  });

  it.each([
    ['missing language', { en: 'Only English' }],
    ['empty language', { en: 'Name', zh: ' ' }],
    ['wrong shape', 'Name'],
  ])('rejects a malformed node display name: %s', (_label, displayName) => {
    const project = createDemoBfnProject();
    Object.assign(project.network.modules[0]!, { displayName });

    expect(() => parseBfnProject(JSON.stringify(project))).toThrow('BFN_IMPORT_SCHEMA_INVALID');
  });

  it('keeps an unknown Catalog release readable but untrusted for execution', () => {
    const project = projectWithCatalogReference();
    const model = project.network.modules.at(-1)!.modelVariants[0]!;
    if (model.mode !== 'static') throw new Error('expected static Catalog model');
    model.catalogReference!.releaseVersion = 'future-unknown';

    const parsed = parseBfnProject(JSON.stringify(project));

    const parsedModel = parsed.network.modules.at(-1)!.modelVariants[0]!;
    if (parsedModel.mode !== 'static') throw new Error('expected parsed static Catalog model');
    expect(parsedModel.catalogReference?.releaseVersion).toBe('future-unknown');
    expect(validateBfnProject(parsed).map((issue) => issue.code)).toContain(
      'catalog_release_unavailable',
    );
  });

  it('keeps a malformed Catalog reference readable and reports a safe business error', () => {
    const project = projectWithCatalogReference();
    const model = project.network.modules.at(-1)!.modelVariants[0]!;
    Object.assign(model, { catalogReference: { kind: 'catalog_receiver_response' } });

    const parsed = parseBfnProject(JSON.stringify(project));

    expect(() => validateBfnProject(parsed)).not.toThrow();
    expect(validateBfnProject(parsed).map((issue) => issue.code)).toContain(
      'catalog_model_reference_invalid',
    );
  });

  it('rejects a legacy weight-based project instead of silently relabeling it', () => {
    expect(() =>
      parseBfnProject(JSON.stringify({ schemaVersion: 2, nodes: [], edges: [] })),
    ).toThrow('BFN_IMPORT_SCHEMA_INVALID');
  });

  it('detects legacy storage without modifying it', () => {
    const legacy = JSON.stringify({ schemaVersion: 2, nodes: [{ parameters: { gain: 1 } }] });
    localStorage.setItem(LEGACY_MODELING_PROJECT_KEY, legacy);
    expect(legacyModelingProjectExists()).toBe(true);
    expect(localStorage.getItem(LEGACY_MODELING_PROJECT_KEY)).toBe(legacy);
  });

  it('round-trips a result signal snapshot as a deep clone', () => {
    const result = runBfnSimulation(createDemoBfnProject());

    saveBfnRun(result);
    const loaded = loadBfnRuns();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.signalSnapshot).toEqual(result.signalSnapshot);
    expect(loaded[0]?.signalSnapshot).not.toBe(result.signalSnapshot);
  });

  it('round-trips temporal and context applicability snapshots as deep clones', () => {
    const result = runBfnSimulation(createDemoBfnProject());

    saveBfnRun(result);
    const loaded = loadBfnRuns();

    expect(loaded[0]?.temporalSnapshot).toEqual(result.temporalSnapshot);
    expect(loaded[0]?.contextApplicabilitySnapshot).toEqual(result.contextApplicabilitySnapshot);
    expect(loaded[0]?.temporalSnapshot).not.toBe(result.temporalSnapshot);
    expect(loaded[0]?.contextApplicabilitySnapshot).not.toBe(result.contextApplicabilitySnapshot);
  });

  it('writes BFN-SIM 2.2 runs and keeps frozen BFN-SIM 2.0/2.1 records readable and immutable', () => {
    const current = runBfnSimulation(createDemoBfnProject());
    const v20 = asHistoricalV20(current);
    v20.id = 'historical-bfn-sim-2.0';
    const v21 = asHistoricalV21(current);
    v21.id = 'historical-bfn-sim-2.1';
    const historicalJson = JSON.stringify([v20, v21]);
    localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify([v20, v21, current]));

    const loaded = loadBfnRuns();

    expect(current.engineVersion).toBe('BFN-SIM-2.2');
    expect(loaded.map((run) => run.engineVersion)).toEqual([
      'BFN-SIM-2.0',
      'BFN-SIM-2.1',
      'BFN-SIM-2.2',
    ]);
    expect(JSON.stringify(loaded.slice(0, 2))).toBe(historicalJson);
    expect(localStorage.getItem(BFN_RUN_STORAGE_KEY)).toBe(JSON.stringify([v20, v21, current]));
  });

  it('round-trips a generated zero-parameter identity transform losslessly in SIM 2.2', () => {
    const { project, identityModuleId } = parameterEnvelopeIdentityAccumulatorProject();
    const result = runBfnSimulation(project);
    const identitySnapshot = result.uncertaintySnapshot.modules.find(
      ({ moduleId }) => moduleId === identityModuleId,
    );

    expect(identitySnapshot).toMatchObject({
      method: 'parameter_interval_envelope',
      intervalExecutable: true,
      reason: null,
      propagationMode: 'deterministic_transform',
    });
    expect(result.points.every((point) => point.lower !== null && point.upper !== null)).toBe(true);

    const saved = saveBfnRun(result);
    const loaded = loadBfnRuns();

    expect(saved).toEqual([result]);
    expect(loaded).toEqual(saved);
    expect(loaded[0]).toEqual(result);
    expect(loaded[0]).not.toBe(result);
  });

  it('rejects an unsupported deterministic-transform method in SIM 2.2 persistence', () => {
    const { project, identityModuleId } = parameterEnvelopeIdentityAccumulatorProject();
    const malformed = runBfnSimulation(project);
    const identitySnapshot = malformed.uncertaintySnapshot.modules.find(
      ({ moduleId }) => moduleId === identityModuleId,
    );
    if (identitySnapshot === undefined) throw new Error('Expected identity uncertainty snapshot.');
    identitySnapshot.method = 'bootstrap';
    localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify([malformed]));

    expect(loadBfnRuns()).toEqual([]);
  });

  it('distinguishes frozen BFN-SIM 2.0/2.1 records from the versioned 2.2 contract', () => {
    const v22 = runBfnSimulation(createDemoBfnProject());
    const v21 = asHistoricalV21(v22);
    v21.id = 'historical-bfn-sim-2.1';
    const v20 = asHistoricalV20(v22);
    v20.id = 'historical-bfn-sim-2.0';
    localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify([v20, v21, v22]));

    const loaded = loadBfnRuns();

    expect(loaded.map((run) => run.engineVersion)).toEqual([
      'BFN-SIM-2.0',
      'BFN-SIM-2.1',
      'BFN-SIM-2.2',
    ]);
    expect(loaded[1]).not.toHaveProperty('uncertaintySnapshot.modules.0.propagationMode');
    expect(loaded[2]).toHaveProperty(
      'uncertaintySnapshot.modules.0.propagationMode',
      'parameter_interval',
    );
  });

  it('requires SIM 2.2 uncertainty propagation and dynamic metrics fields only from 2.2', () => {
    const valid = runBfnSimulation(createDemoBfnProject());
    const malformedSnapshot = structuredClone(valid) as unknown as Record<string, unknown>;
    malformedSnapshot.id = 'malformed-sim-2.2-snapshot';
    const malformedSnapshotModules = malformedSnapshot.uncertaintySnapshot as {
      modules: Array<Record<string, unknown>>;
    };
    delete malformedSnapshotModules.modules[0]!.propagationMode;

    const dynamicProject = createDemoBfnProject();
    dynamicProject.network.mode = 'dynamic';
    const malformedMetrics = structuredClone(runBfnSimulation(dynamicProject)) as unknown as Record<
      string,
      unknown
    >;
    malformedMetrics.id = 'malformed-sim-2.2-metrics';
    delete (malformedMetrics.dynamicMetrics as Record<string, unknown>).terminalValue;

    localStorage.setItem(
      BFN_RUN_STORAGE_KEY,
      JSON.stringify([valid, malformedSnapshot, malformedMetrics]),
    );

    expect(loadBfnRuns()).toEqual([valid]);
  });

  it('accepts legacy runs without a signal snapshot', () => {
    const legacy = runBfnSimulation(createDemoBfnProject());
    delete legacy.signalSnapshot;
    localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify([legacy]));

    expect(loadBfnRuns()).toEqual([legacy]);
  });

  it('accepts legacy runs without temporal or context applicability snapshots', () => {
    const legacy = runBfnSimulation(createDemoBfnProject());
    delete legacy.temporalSnapshot;
    delete legacy.contextApplicabilitySnapshot;
    localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify([legacy]));

    expect(loadBfnRuns()).toEqual([legacy]);
  });

  it('filters malformed optional temporal snapshots without changing the BFN-SIM version', () => {
    const malformed = runBfnSimulation(createDemoBfnProject());
    Object.assign(malformed, {
      temporalSnapshot: {
        scope: 'output_reachable',
        modules: [{ moduleId: 'module-ahl-sensor', executionMode: 'invented' }],
      },
    });
    localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify([malformed]));

    expect(malformed.engineVersion).toBe('BFN-SIM-2.2');
    expect(loadBfnRuns()).toEqual([]);
  });

  it.each([
    ['null snapshot', null],
    ['missing output', { primaryInput: {} }],
    [
      'invalid quantity type',
      {
        primaryInput: {
          sourceId: 'source-ahl',
          labelKey: 'bfn.sources.ahl',
          entity: '3OC6-HSL',
          quantityType: 'invalid',
          unit: 'nM',
        },
        output: {
          monitorId: 'monitor-reporter',
          labelKey: 'bfn.monitors.reporter',
          entity: 'normalized_reporter_expression',
          quantityType: 'expression_level',
          unit: 'dimensionless',
        },
      },
    ],
    [
      'invalid unit',
      {
        primaryInput: {
          sourceId: 'source-ahl',
          labelKey: 'bfn.sources.ahl',
          entity: '3OC6-HSL',
          quantityType: 'concentration',
          unit: 'ppm',
        },
        output: {
          monitorId: 'monitor-reporter',
          labelKey: 'bfn.monitors.reporter',
          entity: 'normalized_reporter_expression',
          quantityType: 'expression_level',
          unit: 'dimensionless',
        },
      },
    ],
  ])('filters a run with a malformed %s', (_label, signalSnapshot) => {
    const valid = runBfnSimulation(createDemoBfnProject());
    const malformed = { ...valid, id: 'malformed', signalSnapshot };
    const legacy = { ...valid, id: 'legacy' };
    delete legacy.signalSnapshot;
    localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify([valid, legacy, malformed]));

    expect(loadBfnRuns().map((run) => run.id)).toEqual([valid.id, 'legacy']);
  });

  it('filters snapshots whose nested IDs disagree with the result identity', () => {
    const result = runBfnSimulation(createDemoBfnProject());
    const wrongInput = structuredClone(result);
    wrongInput.id = 'wrong-input';
    wrongInput.signalSnapshot!.primaryInput.sourceId = 'source-other';
    const wrongOutput = structuredClone(result);
    wrongOutput.id = 'wrong-output';
    wrongOutput.signalSnapshot!.output.monitorId = 'monitor-other';
    localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify([wrongInput, wrongOutput]));

    expect(loadBfnRuns()).toEqual([]);
  });
});
