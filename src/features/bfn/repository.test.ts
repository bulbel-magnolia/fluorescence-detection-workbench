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

describe('BFN-IR repository', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a versioned BFN-IR 2.1 project', () => {
    const project = createDemoBfnProject();
    saveBfnProject(project);
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull();
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

    expect(malformed.engineVersion).toBe('BFN-SIM-2.0');
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
