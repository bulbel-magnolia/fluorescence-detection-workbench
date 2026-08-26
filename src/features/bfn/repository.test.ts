import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
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

describe('BFN-IR repository', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a versioned BFN-IR 2.0 project', () => {
    const project = createDemoBfnProject();
    saveBfnProject(project);
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull();
    expect(loadBfnProject()).toEqual(project);
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

  it('accepts legacy runs without a signal snapshot', () => {
    const legacy = runBfnSimulation(createDemoBfnProject());
    delete legacy.signalSnapshot;
    localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify([legacy]));

    expect(loadBfnRuns()).toEqual([legacy]);
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
