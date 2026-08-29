import type { BfnProject } from '../types';
import { upgradeBfnProjectToCurrent } from '../bfnIrMigration';
import {
  BFN_WORKSPACE_DATABASE_NAME,
  BFN_WORKSPACE_DATABASE_VERSION,
  BFN_WORKSPACE_MIGRATION_ID,
  BFN_WORKSPACE_RUN_LIMIT,
  BFN_WORKSPACE_SETTINGS_ID,
  summarizeBfnProject,
  type BfnLegacyMigrationInput,
  type BfnWorkspaceMigrationMarker,
  type BfnWorkspaceProjectMetadata,
  type BfnWorkspaceRepository,
  type BfnWorkspaceRunRecord,
  type BfnWorkspaceSettings,
  type BfnWorkspaceVersion,
  type BfnWorkspaceVersionListItem,
  type CreateBfnWorkspaceProjectInput,
  type CreateBfnWorkspaceVersionInput,
} from './workspaceTypes';

const STORE_SETTINGS = 'settings';
const STORE_PROJECTS = 'projects';
const STORE_DRAFTS = 'drafts';
const STORE_VERSIONS = 'versions';
const STORE_RUNS = 'runs';
const INDEX_PROJECT_ID = 'projectId';
const INDEX_PROJECT_REVISION = 'projectIdRevision';

interface DraftRecord {
  projectId: string;
  project: BfnProject;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('BFN_WORKSPACE_IDB_REQUEST_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('BFN_WORKSPACE_IDB_ABORTED'));
    transaction.onerror = () => reject(transaction.error ?? new Error('BFN_WORKSPACE_IDB_FAILED'));
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(BFN_WORKSPACE_DATABASE_NAME, BFN_WORKSPACE_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
        database.createObjectStore(STORE_SETTINGS, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_PROJECTS)) {
        database.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_DRAFTS)) {
        database.createObjectStore(STORE_DRAFTS, { keyPath: 'projectId' });
      }
      if (!database.objectStoreNames.contains(STORE_VERSIONS)) {
        const versions = database.createObjectStore(STORE_VERSIONS, { keyPath: 'id' });
        versions.createIndex(INDEX_PROJECT_ID, 'projectId', { unique: false });
        versions.createIndex(INDEX_PROJECT_REVISION, ['projectId', 'revision'], { unique: true });
      }
      if (!database.objectStoreNames.contains(STORE_RUNS)) {
        const runs = database.createObjectStore(STORE_RUNS, { keyPath: 'id' });
        runs.createIndex(INDEX_PROJECT_ID, 'projectId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('BFN_WORKSPACE_IDB_OPEN_FAILED'));
    request.onblocked = () => reject(new Error('BFN_WORKSPACE_IDB_BLOCKED'));
  });
}

async function projectOrThrow(
  store: IDBObjectStore,
  projectId: string,
): Promise<BfnWorkspaceProjectMetadata> {
  const project = (await requestResult(store.get(projectId))) as
    BfnWorkspaceProjectMetadata | undefined;
  if (!project) throw new Error('BFN_WORKSPACE_PROJECT_NOT_FOUND');
  return project;
}

function versionListItem(version: BfnWorkspaceVersion): BfnWorkspaceVersionListItem {
  return {
    id: version.id,
    projectId: version.projectId,
    revision: version.revision,
    createdAt: version.createdAt,
    computationSignature: version.computationSignature,
    summary: structuredClone(version.summary),
    ...(version.name ? { name: version.name } : {}),
    ...(version.note ? { note: version.note } : {}),
  };
}

export function createIndexedDbBfnWorkspaceRepository(
  factory: IDBFactory = indexedDB,
): BfnWorkspaceRepository {
  let databasePromise: Promise<IDBDatabase> | null = null;
  const database = (): Promise<IDBDatabase> => {
    if (!databasePromise) {
      databasePromise = openDatabase(factory).catch((error: unknown) => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  };

  return {
    kind: 'indexeddb',

    async listProjects() {
      const db = await database();
      const transaction = db.transaction(STORE_PROJECTS, 'readonly');
      const records = (await requestResult(
        transaction.objectStore(STORE_PROJECTS).getAll(),
      )) as BfnWorkspaceProjectMetadata[];
      await transactionDone(transaction);
      return records
        .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
        .map((record) => structuredClone(record));
    },

    async getProject(projectId) {
      const db = await database();
      const transaction = db.transaction(STORE_PROJECTS, 'readonly');
      const value = (await requestResult(
        transaction.objectStore(STORE_PROJECTS).get(projectId),
      )) as BfnWorkspaceProjectMetadata | undefined;
      await transactionDone(transaction);
      return value ? structuredClone(value) : null;
    },

    async getDraft(projectId) {
      const db = await database();
      const transaction = db.transaction(STORE_DRAFTS, 'readonly');
      const value = (await requestResult(transaction.objectStore(STORE_DRAFTS).get(projectId))) as
        DraftRecord | undefined;
      await transactionDone(transaction);
      return value ? upgradeBfnProjectToCurrent(value.project) : null;
    },

    async createProject(input: CreateBfnWorkspaceProjectInput) {
      const db = await database();
      const transaction = db.transaction(
        [STORE_PROJECTS, STORE_DRAFTS, STORE_SETTINGS],
        'readwrite',
      );
      transaction.objectStore(STORE_PROJECTS).add(structuredClone(input.metadata));
      transaction.objectStore(STORE_DRAFTS).add({
        projectId: input.metadata.id,
        project: structuredClone(input.draft),
      } satisfies DraftRecord);
      if (input.makeActive ?? true) {
        transaction.objectStore(STORE_SETTINGS).put({
          id: BFN_WORKSPACE_SETTINGS_ID,
          activeProjectId: input.metadata.id,
        } satisfies BfnWorkspaceSettings);
      }
      await transactionDone(transaction);
    },

    async renameProject(projectId, name) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('BFN_WORKSPACE_PROJECT_NAME_REQUIRED');
      const db = await database();
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      const project = await projectOrThrow(store, projectId);
      const next = { ...project, name: trimmed };
      store.put(next);
      await transactionDone(transaction);
      return structuredClone(next);
    },

    async saveDraft(projectId, draft, updatedAt) {
      const db = await database();
      const transaction = db.transaction([STORE_PROJECTS, STORE_DRAFTS], 'readwrite');
      const projects = transaction.objectStore(STORE_PROJECTS);
      const project = await projectOrThrow(projects, projectId);
      const next = { ...project, draftUpdatedAt: updatedAt };
      projects.put(next);
      transaction.objectStore(STORE_DRAFTS).put({
        projectId,
        project: structuredClone(draft),
      } satisfies DraftRecord);
      await transactionDone(transaction);
      return structuredClone(next);
    },

    async replaceDraft(projectId, draft, updatedAt) {
      return this.saveDraft(projectId, draft, updatedAt);
    },

    async getActiveProjectId() {
      const db = await database();
      const transaction = db.transaction(STORE_SETTINGS, 'readonly');
      const value = (await requestResult(
        transaction.objectStore(STORE_SETTINGS).get(BFN_WORKSPACE_SETTINGS_ID),
      )) as BfnWorkspaceSettings | undefined;
      await transactionDone(transaction);
      return value?.activeProjectId ?? null;
    },

    async setActiveProject(projectId, openedAt) {
      const db = await database();
      const transaction = db.transaction([STORE_PROJECTS, STORE_SETTINGS], 'readwrite');
      const projects = transaction.objectStore(STORE_PROJECTS);
      const project = await projectOrThrow(projects, projectId);
      projects.put({ ...project, lastOpenedAt: openedAt });
      transaction.objectStore(STORE_SETTINGS).put({
        id: BFN_WORKSPACE_SETTINGS_ID,
        activeProjectId: projectId,
      } satisfies BfnWorkspaceSettings);
      await transactionDone(transaction);
    },

    async createVersion(input: CreateBfnWorkspaceVersionInput) {
      const db = await database();
      const transaction = db.transaction([STORE_PROJECTS, STORE_VERSIONS], 'readwrite');
      const projects = transaction.objectStore(STORE_PROJECTS);
      const project = await projectOrThrow(projects, input.projectId);
      const revision = project.nextRevision;
      const version: BfnWorkspaceVersion = {
        id: `${input.projectId}:version:${revision}`,
        projectId: input.projectId,
        revision,
        createdAt: input.createdAt,
        computationSignature: input.computationSignature,
        summary: summarizeBfnProject(input.snapshot),
        snapshot: structuredClone(input.snapshot),
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      };
      transaction.objectStore(STORE_VERSIONS).add(version);
      projects.put({ ...project, nextRevision: revision + 1 });
      await transactionDone(transaction);
      return structuredClone(version);
    },

    async listVersions(projectId) {
      const db = await database();
      const transaction = db.transaction(STORE_VERSIONS, 'readonly');
      const values = (await requestResult(
        transaction.objectStore(STORE_VERSIONS).index(INDEX_PROJECT_ID).getAll(projectId),
      )) as BfnWorkspaceVersion[];
      await transactionDone(transaction);
      return values.sort((left, right) => right.revision - left.revision).map(versionListItem);
    },

    async getVersion(versionId) {
      const db = await database();
      const transaction = db.transaction(STORE_VERSIONS, 'readonly');
      const value = (await requestResult(
        transaction.objectStore(STORE_VERSIONS).get(versionId),
      )) as BfnWorkspaceVersion | undefined;
      await transactionDone(transaction);
      return value
        ? {
            ...structuredClone(value),
            snapshot: upgradeBfnProjectToCurrent(value.snapshot),
          }
        : null;
    },

    async saveRun(record) {
      const db = await database();
      const transaction = db.transaction([STORE_PROJECTS, STORE_RUNS], 'readwrite');
      await projectOrThrow(transaction.objectStore(STORE_PROJECTS), record.projectId);
      const runs = transaction.objectStore(STORE_RUNS);
      runs.put(structuredClone(record));
      const records = (await requestResult(
        runs.index(INDEX_PROJECT_ID).getAll(record.projectId),
      )) as BfnWorkspaceRunRecord[];
      records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      for (const stale of records.slice(BFN_WORKSPACE_RUN_LIMIT)) runs.delete(stale.id);
      await transactionDone(transaction);
      return records.slice(0, BFN_WORKSPACE_RUN_LIMIT).map((entry) => structuredClone(entry));
    },

    async listRuns(projectId) {
      const db = await database();
      const transaction = db.transaction([STORE_PROJECTS, STORE_RUNS], 'readonly');
      await projectOrThrow(transaction.objectStore(STORE_PROJECTS), projectId);
      const values = (await requestResult(
        transaction.objectStore(STORE_RUNS).index(INDEX_PROJECT_ID).getAll(projectId),
      )) as BfnWorkspaceRunRecord[];
      await transactionDone(transaction);
      return values
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, BFN_WORKSPACE_RUN_LIMIT)
        .map((entry) => structuredClone(entry));
    },

    async clearRuns(projectId) {
      const db = await database();
      const transaction = db.transaction([STORE_PROJECTS, STORE_RUNS], 'readwrite');
      await projectOrThrow(transaction.objectStore(STORE_PROJECTS), projectId);
      const runs = transaction.objectStore(STORE_RUNS);
      const keys = await requestResult(runs.index(INDEX_PROJECT_ID).getAllKeys(projectId));
      for (const key of keys) runs.delete(key);
      await transactionDone(transaction);
    },

    async deleteProject(projectId) {
      const db = await database();
      const transaction = db.transaction(
        [STORE_SETTINGS, STORE_PROJECTS, STORE_DRAFTS, STORE_VERSIONS, STORE_RUNS],
        'readwrite',
      );
      const projects = transaction.objectStore(STORE_PROJECTS);
      await projectOrThrow(projects, projectId);
      const projectCount = await requestResult(projects.count());
      if (projectCount <= 1) {
        transaction.abort();
        try {
          await transactionDone(transaction);
        } catch {
          // The public error below is more useful than the generic transaction abort.
        }
        throw new Error('BFN_WORKSPACE_LAST_PROJECT');
      }
      projects.delete(projectId);
      transaction.objectStore(STORE_DRAFTS).delete(projectId);
      const versions = transaction.objectStore(STORE_VERSIONS);
      const versionKeys = await requestResult(
        versions.index(INDEX_PROJECT_ID).getAllKeys(projectId),
      );
      for (const key of versionKeys) versions.delete(key);
      const runs = transaction.objectStore(STORE_RUNS);
      const runKeys = await requestResult(runs.index(INDEX_PROJECT_ID).getAllKeys(projectId));
      for (const key of runKeys) runs.delete(key);
      const settingsStore = transaction.objectStore(STORE_SETTINGS);
      const settings = (await requestResult(settingsStore.get(BFN_WORKSPACE_SETTINGS_ID))) as
        BfnWorkspaceSettings | undefined;
      if (settings?.activeProjectId === projectId) {
        const remaining = (await requestResult(projects.getAll())) as BfnWorkspaceProjectMetadata[];
        remaining.sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
        settingsStore.put({
          id: BFN_WORKSPACE_SETTINGS_ID,
          activeProjectId: remaining[0]?.id ?? null,
        } satisfies BfnWorkspaceSettings);
      }
      await transactionDone(transaction);
    },

    async hasLegacyMigrationMarker() {
      const db = await database();
      const transaction = db.transaction(STORE_SETTINGS, 'readonly');
      const value: unknown = await requestResult(
        transaction
          .objectStore(STORE_SETTINGS)
          .get(BFN_WORKSPACE_MIGRATION_ID) as IDBRequest<unknown>,
      );
      await transactionDone(transaction);
      return value !== undefined;
    },

    async migrateLegacy(input: BfnLegacyMigrationInput) {
      const db = await database();
      const transaction = db.transaction(
        [STORE_SETTINGS, STORE_PROJECTS, STORE_DRAFTS, STORE_RUNS],
        'readwrite',
      );
      const settings = transaction.objectStore(STORE_SETTINGS);
      const projects = transaction.objectStore(STORE_PROJECTS);
      const projectCountRequest = projects.count();
      const markerRequest = settings.get(BFN_WORKSPACE_MIGRATION_ID) as IDBRequest<unknown>;
      const projectCount = await requestResult(projectCountRequest);
      const marker: unknown = await requestResult(markerRequest);
      if (projectCount > 0 || marker !== undefined) {
        await transactionDone(transaction);
        return false;
      }
      projects.add(structuredClone(input.metadata));
      transaction.objectStore(STORE_DRAFTS).add({
        projectId: input.metadata.id,
        project: structuredClone(input.draft),
      } satisfies DraftRecord);
      const runs = transaction.objectStore(STORE_RUNS);
      for (const run of input.runs.slice(0, BFN_WORKSPACE_RUN_LIMIT)) {
        runs.add(structuredClone(run));
      }
      settings.put({
        id: BFN_WORKSPACE_SETTINGS_ID,
        activeProjectId: input.metadata.id,
      } satisfies BfnWorkspaceSettings);
      settings.add({
        id: BFN_WORKSPACE_MIGRATION_ID,
        completedAt: input.completedAt,
      } satisfies BfnWorkspaceMigrationMarker);
      await transactionDone(transaction);
      return true;
    },
  };
}
