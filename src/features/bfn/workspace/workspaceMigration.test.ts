import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import {
  BFN_PROJECT_STORAGE_KEY,
  BFN_RUN_STORAGE_KEY,
  saveBfnProject,
  saveBfnRun,
} from '../repository';
import { runBfnSimulation } from '../simulation';
import { createLocalStorageBfnWorkspaceRepository } from './localStorageWorkspaceRepository';
import { bootstrapBfnWorkspace } from './workspaceMigration';
import { createWorkspaceProjectMetadata } from './workspaceProjectFactory';

const now = '2026-08-27T04:00:00.000Z';

describe('legacy single-project migration', () => {
  beforeEach(() => localStorage.clear());

  it('migrates the exact draft and valid runs once while retaining rollback keys', async () => {
    const legacyProject = createDemoBfnProject('2026-08-20T00:00:00.000Z');
    const legacyRun = runBfnSimulation(legacyProject);
    saveBfnProject(legacyProject);
    saveBfnRun(legacyRun);
    const projectRaw = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
    const runsRaw = localStorage.getItem(BFN_RUN_STORAGE_KEY);
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);

    const first = await bootstrapBfnWorkspace(repository, {
      blankProjectName: 'Blank',
      migratedProjectName: 'Migrated',
      workspaceProjectId: 'migrated-project',
      now,
    });
    const second = await bootstrapBfnWorkspace(repository, {
      blankProjectName: 'Blank',
      migratedProjectName: 'Migrated again',
      now,
    });

    expect(first.migrated).toBe(true);
    expect(first.draft).toEqual(legacyProject);
    expect(first.runs).toHaveLength(1);
    expect(first.runs[0]?.computationSignature).toBeNull();
    expect(await repository.listVersions(first.activeProject.id)).toEqual([]);
    expect(second.migrated).toBe(false);
    expect(second.projects).toHaveLength(1);
    expect(await repository.hasLegacyMigrationMarker()).toBe(true);
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(projectRaw);
    expect(localStorage.getItem(BFN_RUN_STORAGE_KEY)).toBe(runsRaw);
  });

  it('lets an existing workspace win without reading or overwriting legacy data', async () => {
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Existing', {
      now,
      workspaceProjectId: 'existing',
    });
    const existing = createDemoBfnProject(now);
    existing.id = 'existing-bfn';
    await repository.createProject({ metadata, draft: existing, makeActive: true });
    const legacy = createDemoBfnProject();

    const result = await bootstrapBfnWorkspace(repository, {
      blankProjectName: 'Blank',
      migratedProjectName: 'Migrated',
      now,
      loadLegacyProject: () => legacy,
      loadLegacyRuns: () => {
        throw new Error('legacy runs must not be read');
      },
    });

    expect(result.draft.id).toBe('existing-bfn');
    expect(result.projects).toHaveLength(1);
    expect(result.migrated).toBe(false);
  });

  it('creates a non-demo blank project when no valid legacy project exists', async () => {
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const result = await bootstrapBfnWorkspace(repository, {
      blankProjectName: 'Blank',
      migratedProjectName: 'Migrated',
      workspaceProjectId: 'blank-workspace-project',
      bfnProjectId: 'blank-bfn',
      networkId: 'blank-network',
      now,
      loadLegacyProject: () => null,
    });

    expect(result.activeProject.name).toBe('Blank');
    expect(result.draft).toMatchObject({ id: 'blank-bfn', isDemo: false });
    expect(result.draft.network.inputSources).toHaveLength(0);
    expect(result.draft.network.modules).toHaveLength(0);
    expect(result.draft.network.outputMonitors).toHaveLength(1);
  });

  it('leaves no marker or partial workspace when migration fails', async () => {
    const base = createLocalStorageBfnWorkspaceRepository(localStorage);
    const repository = {
      ...base,
      migrateLegacy: () => Promise.reject(new Error('injected migration failure')),
    };

    await expect(
      bootstrapBfnWorkspace(repository, {
        blankProjectName: 'Blank',
        migratedProjectName: 'Migrated',
        now,
        loadLegacyProject: () => createDemoBfnProject(),
        loadLegacyRuns: () => [],
      }),
    ).rejects.toThrow('injected migration failure');
    expect(await base.listProjects()).toEqual([]);
    expect(await base.hasLegacyMigrationMarker()).toBe(false);
  });
});
