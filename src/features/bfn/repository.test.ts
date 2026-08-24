import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import {
  BFN_PROJECT_STORAGE_KEY,
  LEGACY_MODELING_PROJECT_KEY,
  legacyModelingProjectExists,
  loadBfnProject,
  parseBfnProject,
  saveBfnProject,
} from './repository';

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
});
