import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { runBfnSimulation } from '../simulation';
import { createIndexedDbBfnWorkspaceRepository } from './indexedDbWorkspaceRepository';
import { createLocalStorageBfnWorkspaceRepository } from './localStorageWorkspaceRepository';
import { createWorkspaceProjectMetadata } from './workspaceProjectFactory';
import type { BfnWorkspaceRepository, BfnWorkspaceRunRecord } from './workspaceTypes';
import {
  BFN_WORKSPACE_DATABASE_NAME,
  BFN_WORKSPACE_DATABASE_VERSION,
  BFN_WORKSPACE_FALLBACK_KEY,
  BFN_WORKSPACE_RUN_LIMIT,
} from './workspaceTypes';

const firstTime = '2026-08-27T01:00:00.000Z';
const secondTime = '2026-08-27T02:00:00.000Z';

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a record fixture.');
  }
  return value as Record<string, unknown>;
}

function records(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('Expected a record array fixture.');
  return value.map(record);
}

function legacyV20Project(): unknown {
  const legacy = record(structuredClone(createDemoBfnProject()));
  legacy.schemaVersion = '2.0';
  const registry = record(legacy.registry);
  delete registry.entities;
  delete registry.provenanceRecords;
  for (const context of records(registry.contexts)) delete context.documentationState;
  for (const implementation of records(registry.implementations)) {
    delete implementation.maturity;
    delete implementation.provenanceIds;
  }
  for (const module of records(record(legacy.network).modules)) {
    delete module.implementationState;
    for (const model of records(module.modelVariants)) delete model.provenanceIds;
  }
  return legacy;
}

function legacyV21Project(): unknown {
  const legacy = record(structuredClone(createDemoBfnProject()));
  legacy.schemaVersion = '2.1';
  return legacy;
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB test request failed'));
  });
}

function idbTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB test failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB test aborted'));
  });
}

async function openWorkspaceDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(BFN_WORKSPACE_DATABASE_NAME, BFN_WORKSPACE_DATABASE_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Workspace database open failed'));
  });
}

function rejectedOpenRequest(message: string): IDBOpenDBRequest {
  const request = {
    error: new DOMException(message, 'UnknownError'),
    onblocked: null,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
  } as unknown as IDBOpenDBRequest;
  queueMicrotask(() => {
    request.onerror?.call(request, new Event('error'));
  });
  return request;
}

function controlledOpenFactory(failures: number): { factory: IDBFactory; attempts: () => number } {
  const delegate = new IDBFactory();
  let attempts = 0;
  const factory = Object.create(delegate) as IDBFactory;
  Object.defineProperty(factory, 'open', {
    value: (name: string, version?: number): IDBOpenDBRequest => {
      attempts += 1;
      if (attempts <= failures) return rejectedOpenRequest(`open failure ${attempts}`);
      return version === undefined ? delegate.open(name) : delegate.open(name, version);
    },
  });
  return { factory, attempts: () => attempts };
}

function fixture(id: string, name: string, now = firstTime) {
  return {
    metadata: createWorkspaceProjectMetadata(name, { now, workspaceProjectId: id }),
    draft: createDemoBfnProject(now),
    makeActive: true,
  } as const;
}

function runRecord(projectId: string, index: number): BfnWorkspaceRunRecord {
  const result = runBfnSimulation(createDemoBfnProject());
  result.id = `run-${index}`;
  result.completedAt = new Date(Date.parse(firstTime) + index * 1000).toISOString();
  return {
    id: `${projectId}:run-${index}`,
    projectId,
    result,
    computationSignature: `signature-${index}`,
    createdAt: result.completedAt,
  };
}

function repositoryContract(label: string, createRepository: () => BfnWorkspaceRepository): void {
  describe(label, () => {
    let repository: BfnWorkspaceRepository;

    beforeEach(() => {
      repository = createRepository();
    });

    it('creates, reads, renames, saves, lists, and activates independent project drafts', async () => {
      const first = fixture('project-a', 'Project A');
      const second = fixture('project-b', 'Project B', secondTime);
      await repository.createProject(first);
      await repository.createProject(second);

      expect((await repository.listProjects()).map((project) => project.id)).toEqual([
        'project-b',
        'project-a',
      ]);
      expect(await repository.getDraft('project-a')).toEqual(first.draft);
      expect(await repository.getActiveProjectId()).toBe('project-b');

      const renamed = await repository.renameProject('project-a', 'Renamed A');
      expect(renamed.name).toBe('Renamed A');
      const edited = structuredClone(first.draft);
      edited.network.mode = 'dynamic';
      const saved = await repository.saveDraft('project-a', edited, secondTime);
      expect(saved.draftUpdatedAt).toBe(secondTime);
      expect((await repository.getDraft('project-a'))?.network.mode).toBe('dynamic');

      await repository.setActiveProject('project-a', secondTime);
      expect(await repository.getActiveProjectId()).toBe('project-a');
      expect((await repository.listProjects())[0]?.id).toBe('project-a');
    });

    it('allocates immutable, project-local revisions without autosave creating versions', async () => {
      const first = fixture('project-a', 'Project A');
      const second = fixture('project-b', 'Project B');
      await repository.createProject(first);
      await repository.createProject(second);
      const edited = structuredClone(first.draft);
      edited.network.mode = 'dynamic';
      await repository.saveDraft('project-a', edited, secondTime);
      expect(await repository.listVersions('project-a')).toEqual([]);

      const versionOne = await repository.createVersion({
        projectId: 'project-a',
        snapshot: edited,
        computationSignature: 'signature-a',
        name: 'Dynamic candidate',
        note: 'Preserve before parameter review',
        createdAt: secondTime,
      });
      edited.network.mode = 'static';
      const versionTwo = await repository.createVersion({
        projectId: 'project-a',
        snapshot: edited,
        computationSignature: 'signature-b',
        createdAt: '2026-08-27T03:00:00.000Z',
      });
      const otherVersion = await repository.createVersion({
        projectId: 'project-b',
        snapshot: second.draft,
        computationSignature: 'signature-other',
        createdAt: secondTime,
      });

      expect([versionOne.revision, versionTwo.revision, otherVersion.revision]).toEqual([1, 2, 1]);
      expect(versionOne.summary.edgeCount).toBe(versionOne.snapshot.network.edges.length);
      expect(
        (await repository.listVersions('project-a')).map((version) => version.revision),
      ).toEqual([2, 1]);
      const persisted = await repository.getVersion(versionOne.id);
      expect(persisted?.snapshot.network.mode).toBe('dynamic');
      persisted!.snapshot.network.mode = 'static';
      expect((await repository.getVersion(versionOne.id))?.snapshot.network.mode).toBe('dynamic');
    });

    it('scopes, caps, clears, and cascades runs while guarding the last project', async () => {
      await repository.createProject(fixture('project-a', 'Project A'));
      await repository.createProject(fixture('project-b', 'Project B'));
      for (let index = 0; index < BFN_WORKSPACE_RUN_LIMIT + 3; index += 1) {
        await repository.saveRun(runRecord('project-a', index));
      }
      await repository.saveRun(runRecord('project-b', 99));

      const firstRuns = await repository.listRuns('project-a');
      expect(firstRuns).toHaveLength(BFN_WORKSPACE_RUN_LIMIT);
      expect(firstRuns[0]?.result.id).toBe(`run-${BFN_WORKSPACE_RUN_LIMIT + 2}`);
      expect(await repository.listRuns('project-b')).toHaveLength(1);

      await repository.clearRuns('project-a');
      expect(await repository.listRuns('project-a')).toEqual([]);
      expect(await repository.listRuns('project-b')).toHaveLength(1);

      await repository.createVersion({
        projectId: 'project-a',
        snapshot: createDemoBfnProject(),
        computationSignature: 'signature',
        createdAt: secondTime,
      });
      await repository.deleteProject('project-a');
      expect(await repository.getProject('project-a')).toBeNull();
      expect(await repository.getDraft('project-a')).toBeNull();
      expect(await repository.listProjects()).toHaveLength(1);
      await expect(repository.deleteProject('project-b')).rejects.toThrow(
        'BFN_WORKSPACE_LAST_PROJECT',
      );
    });
  });
}

describe('workspace repository contracts', () => {
  beforeEach(() => localStorage.clear());

  repositoryContract('new-key localStorage fallback', () =>
    createLocalStorageBfnWorkspaceRepository(localStorage),
  );

  repositoryContract('actual IndexedDB transactions', () =>
    createIndexedDbBfnWorkspaceRepository(new IDBFactory()),
  );

  it('creates exactly the required IndexedDB stores and indexes', async () => {
    const factory = new IDBFactory();
    const repository = createIndexedDbBfnWorkspaceRepository(factory);
    await repository.listProjects();
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(BFN_WORKSPACE_DATABASE_NAME, BFN_WORKSPACE_DATABASE_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB contract database could not be opened'));
    });
    expect(Array.from(database.objectStoreNames)).toEqual([
      'drafts',
      'projects',
      'runs',
      'settings',
      'versions',
    ]);
    const transaction = database.transaction(['versions', 'runs'], 'readonly');
    expect(Array.from(transaction.objectStore('versions').indexNames)).toEqual([
      'projectId',
      'projectIdRevision',
    ]);
    expect(Array.from(transaction.objectStore('runs').indexNames)).toEqual(['projectId']);
    database.close();
  });

  it.each([
    ['2.0', legacyV20Project],
    ['2.1', legacyV21Project],
  ] as const)(
    'migrates old IndexedDB %s Draft and Version reads without rewriting the immutable snapshot',
    async (storedSchemaVersion, createLegacy) => {
      const factory = new IDBFactory();
      const repository = createIndexedDbBfnWorkspaceRepository(factory);
      const input = fixture('project-legacy', 'Legacy project');
      await repository.createProject(input);
      const version = await repository.createVersion({
        projectId: input.metadata.id,
        snapshot: input.draft,
        computationSignature: 'legacy-signature',
        createdAt: secondTime,
      });
      const legacy = createLegacy();
      const database = await openWorkspaceDatabase(factory);
      const write = database.transaction(['drafts', 'versions'], 'readwrite');
      write.objectStore('drafts').put({ projectId: input.metadata.id, project: legacy });
      const storedVersion = record(await idbRequest(write.objectStore('versions').get(version.id)));
      storedVersion.snapshot = structuredClone(legacy);
      write.objectStore('versions').put(storedVersion);
      await idbTransaction(write);

      expect((await repository.getDraft(input.metadata.id))?.schemaVersion).toBe('2.2');
      const migratedVersion = await repository.getVersion(version.id);
      expect(migratedVersion?.snapshot.schemaVersion).toBe('2.2');

      const inspect = database.transaction('versions', 'readonly');
      const untouched = record(await idbRequest(inspect.objectStore('versions').get(version.id)));
      expect(record(untouched.snapshot).schemaVersion).toBe(storedSchemaVersion);
      await idbTransaction(inspect);

      await repository.replaceDraft(input.metadata.id, migratedVersion!.snapshot, secondTime);
      expect((await repository.getDraft(input.metadata.id))?.schemaVersion).toBe('2.2');
      const inspectAgain = database.transaction('versions', 'readonly');
      const stillUntouched = record(
        await idbRequest(inspectAgain.objectStore('versions').get(version.id)),
      );
      expect(record(stillUntouched.snapshot).schemaVersion).toBe(storedSchemaVersion);
      await idbTransaction(inspectAgain);
      database.close();
    },
  );

  it.each([
    ['2.0', legacyV20Project],
    ['2.1', legacyV21Project],
  ] as const)(
    'migrates old localStorage %s Draft and Version reads without rewriting stored history',
    async (storedSchemaVersion, createLegacy) => {
      const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
      const input = fixture('project-fallback-legacy', 'Fallback legacy project');
      await repository.createProject(input);
      const version = await repository.createVersion({
        projectId: input.metadata.id,
        snapshot: input.draft,
        computationSignature: 'legacy-signature',
        createdAt: secondTime,
      });
      const state = record(JSON.parse(localStorage.getItem(BFN_WORKSPACE_FALLBACK_KEY)!));
      record(state.drafts)[input.metadata.id] = createLegacy();
      record(record(state.versions)[version.id]).snapshot = createLegacy();
      localStorage.setItem(BFN_WORKSPACE_FALLBACK_KEY, JSON.stringify(state));

      expect((await repository.getDraft(input.metadata.id))?.schemaVersion).toBe('2.2');
      const migratedVersion = await repository.getVersion(version.id);
      expect(migratedVersion?.snapshot.schemaVersion).toBe('2.2');
      const untouched = record(JSON.parse(localStorage.getItem(BFN_WORKSPACE_FALLBACK_KEY)!));
      expect(record(record(untouched.versions)[version.id]).snapshot).toMatchObject({
        schemaVersion: storedSchemaVersion,
      });

      await repository.replaceDraft(input.metadata.id, migratedVersion!.snapshot, secondTime);
      expect((await repository.getDraft(input.metadata.id))?.schemaVersion).toBe('2.2');
      const afterRestore = record(JSON.parse(localStorage.getItem(BFN_WORKSPACE_FALLBACK_KEY)!));
      expect(record(record(afterRestore.versions)[version.id]).snapshot).toMatchObject({
        schemaVersion: storedSchemaVersion,
      });
    },
  );

  it('reopens IndexedDB after the first open request fails', async () => {
    const controlled = controlledOpenFactory(1);
    const repository = createIndexedDbBfnWorkspaceRepository(controlled.factory);

    await expect(repository.listProjects()).rejects.toThrow('open failure 1');
    await expect(repository.listProjects()).resolves.toEqual([]);
    expect(controlled.attempts()).toBe(2);
  });

  it('starts a fresh IndexedDB open request after every rejected retry', async () => {
    const controlled = controlledOpenFactory(2);
    const repository = createIndexedDbBfnWorkspaceRepository(controlled.factory);

    await expect(repository.listProjects()).rejects.toThrow('open failure 1');
    await expect(repository.listProjects()).rejects.toThrow('open failure 2');
    await expect(repository.listProjects()).resolves.toEqual([]);
    expect(controlled.attempts()).toBe(3);
  });
});
