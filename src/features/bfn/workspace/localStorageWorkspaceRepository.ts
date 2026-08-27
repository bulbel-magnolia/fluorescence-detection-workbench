import type { BfnProject } from '../types';
import {
  BFN_WORKSPACE_FALLBACK_KEY,
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

interface LocalWorkspaceState {
  settings: BfnWorkspaceSettings;
  migration: BfnWorkspaceMigrationMarker | null;
  projects: Record<string, BfnWorkspaceProjectMetadata>;
  drafts: Record<string, BfnProject>;
  versions: Record<string, BfnWorkspaceVersion>;
  runs: Record<string, BfnWorkspaceRunRecord>;
}

function emptyState(): LocalWorkspaceState {
  return {
    settings: { id: BFN_WORKSPACE_SETTINGS_ID, activeProjectId: null },
    migration: null,
    projects: {},
    drafts: {},
    versions: {},
    runs: {},
  };
}

function readState(storage: Storage): LocalWorkspaceState {
  const raw = storage.getItem(BFN_WORKSPACE_FALLBACK_KEY);
  if (!raw) return emptyState();
  try {
    const value = JSON.parse(raw) as Partial<LocalWorkspaceState>;
    if (!value || typeof value !== 'object') return emptyState();
    return {
      settings:
        value.settings?.id === BFN_WORKSPACE_SETTINGS_ID
          ? structuredClone(value.settings)
          : { id: BFN_WORKSPACE_SETTINGS_ID, activeProjectId: null },
      migration:
        value.migration?.id === BFN_WORKSPACE_MIGRATION_ID
          ? structuredClone(value.migration)
          : null,
      projects: structuredClone(value.projects ?? {}),
      drafts: structuredClone(value.drafts ?? {}),
      versions: structuredClone(value.versions ?? {}),
      runs: structuredClone(value.runs ?? {}),
    };
  } catch {
    return emptyState();
  }
}

function writeState(storage: Storage, state: LocalWorkspaceState): void {
  storage.setItem(BFN_WORKSPACE_FALLBACK_KEY, JSON.stringify(state));
}

function requireProject(
  state: LocalWorkspaceState,
  projectId: string,
): BfnWorkspaceProjectMetadata {
  const project = state.projects[projectId];
  if (!project) throw new Error('BFN_WORKSPACE_PROJECT_NOT_FOUND');
  return project;
}

function listProjectValues(state: LocalWorkspaceState): BfnWorkspaceProjectMetadata[] {
  return Object.values(state.projects).sort((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt),
  );
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

export function createLocalStorageBfnWorkspaceRepository(
  storage: Storage = localStorage,
): BfnWorkspaceRepository {
  return {
    kind: 'local-storage',

    async listProjects() {
      await Promise.resolve();
      return structuredClone(listProjectValues(readState(storage)));
    },

    async getProject(projectId) {
      await Promise.resolve();
      return structuredClone(readState(storage).projects[projectId] ?? null);
    },

    async getDraft(projectId) {
      await Promise.resolve();
      return structuredClone(readState(storage).drafts[projectId] ?? null);
    },

    async createProject(input: CreateBfnWorkspaceProjectInput) {
      await Promise.resolve();
      const state = readState(storage);
      if (state.projects[input.metadata.id]) throw new Error('BFN_WORKSPACE_PROJECT_EXISTS');
      const next = structuredClone(state);
      next.projects[input.metadata.id] = structuredClone(input.metadata);
      next.drafts[input.metadata.id] = structuredClone(input.draft);
      if (input.makeActive ?? true) next.settings.activeProjectId = input.metadata.id;
      writeState(storage, next);
    },

    async renameProject(projectId, name) {
      await Promise.resolve();
      const trimmed = name.trim();
      if (!trimmed) throw new Error('BFN_WORKSPACE_PROJECT_NAME_REQUIRED');
      const state = readState(storage);
      const project = requireProject(state, projectId);
      const next = structuredClone(state);
      next.projects[projectId] = { ...project, name: trimmed };
      writeState(storage, next);
      return structuredClone(next.projects[projectId]);
    },

    async saveDraft(projectId, draft, updatedAt) {
      await Promise.resolve();
      const state = readState(storage);
      const project = requireProject(state, projectId);
      const next = structuredClone(state);
      next.drafts[projectId] = structuredClone(draft);
      next.projects[projectId] = { ...project, draftUpdatedAt: updatedAt };
      writeState(storage, next);
      return structuredClone(next.projects[projectId]);
    },

    async replaceDraft(projectId, draft, updatedAt) {
      return this.saveDraft(projectId, draft, updatedAt);
    },

    async getActiveProjectId() {
      await Promise.resolve();
      return readState(storage).settings.activeProjectId;
    },

    async setActiveProject(projectId, openedAt) {
      await Promise.resolve();
      const state = readState(storage);
      const project = requireProject(state, projectId);
      const next = structuredClone(state);
      next.projects[projectId] = { ...project, lastOpenedAt: openedAt };
      next.settings.activeProjectId = projectId;
      writeState(storage, next);
    },

    async createVersion(input: CreateBfnWorkspaceVersionInput) {
      await Promise.resolve();
      const state = readState(storage);
      const project = requireProject(state, input.projectId);
      const revision = project.nextRevision;
      const id = `${input.projectId}:version:${revision}`;
      const version: BfnWorkspaceVersion = {
        id,
        projectId: input.projectId,
        revision,
        createdAt: input.createdAt,
        computationSignature: input.computationSignature,
        summary: summarizeBfnProject(input.snapshot),
        snapshot: structuredClone(input.snapshot),
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      };
      const next = structuredClone(state);
      next.versions[id] = version;
      next.projects[input.projectId] = { ...project, nextRevision: revision + 1 };
      writeState(storage, next);
      return structuredClone(version);
    },

    async listVersions(projectId) {
      await Promise.resolve();
      requireProject(readState(storage), projectId);
      return Object.values(readState(storage).versions)
        .filter((version) => version.projectId === projectId)
        .sort((left, right) => right.revision - left.revision)
        .map(versionListItem);
    },

    async getVersion(versionId) {
      await Promise.resolve();
      return structuredClone(readState(storage).versions[versionId] ?? null);
    },

    async saveRun(record) {
      await Promise.resolve();
      const state = readState(storage);
      requireProject(state, record.projectId);
      const next = structuredClone(state);
      next.runs[record.id] = structuredClone(record);
      const records = Object.values(next.runs)
        .filter((entry) => entry.projectId === record.projectId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      for (const stale of records.slice(BFN_WORKSPACE_RUN_LIMIT)) delete next.runs[stale.id];
      writeState(storage, next);
      return structuredClone(records.slice(0, BFN_WORKSPACE_RUN_LIMIT));
    },

    async listRuns(projectId) {
      await Promise.resolve();
      requireProject(readState(storage), projectId);
      return Object.values(readState(storage).runs)
        .filter((record) => record.projectId === projectId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, BFN_WORKSPACE_RUN_LIMIT)
        .map((record) => structuredClone(record));
    },

    async clearRuns(projectId) {
      await Promise.resolve();
      const state = readState(storage);
      requireProject(state, projectId);
      const next = structuredClone(state);
      for (const [id, record] of Object.entries(next.runs)) {
        if (record.projectId === projectId) delete next.runs[id];
      }
      writeState(storage, next);
    },

    async deleteProject(projectId) {
      await Promise.resolve();
      const state = readState(storage);
      requireProject(state, projectId);
      if (Object.keys(state.projects).length <= 1) {
        throw new Error('BFN_WORKSPACE_LAST_PROJECT');
      }
      const next = structuredClone(state);
      delete next.projects[projectId];
      delete next.drafts[projectId];
      for (const [id, version] of Object.entries(next.versions)) {
        if (version.projectId === projectId) delete next.versions[id];
      }
      for (const [id, run] of Object.entries(next.runs)) {
        if (run.projectId === projectId) delete next.runs[id];
      }
      if (next.settings.activeProjectId === projectId) {
        next.settings.activeProjectId = listProjectValues(next)[0]?.id ?? null;
      }
      writeState(storage, next);
    },

    async hasLegacyMigrationMarker() {
      await Promise.resolve();
      return readState(storage).migration?.id === BFN_WORKSPACE_MIGRATION_ID;
    },

    async migrateLegacy(input: BfnLegacyMigrationInput) {
      await Promise.resolve();
      const state = readState(storage);
      if (Object.keys(state.projects).length > 0 || state.migration !== null) return false;
      const next = structuredClone(state);
      next.projects[input.metadata.id] = structuredClone(input.metadata);
      next.drafts[input.metadata.id] = structuredClone(input.draft);
      for (const run of input.runs.slice(0, BFN_WORKSPACE_RUN_LIMIT)) {
        next.runs[run.id] = structuredClone(run);
      }
      next.settings.activeProjectId = input.metadata.id;
      next.migration = { id: BFN_WORKSPACE_MIGRATION_ID, completedAt: input.completedAt };
      writeState(storage, next);
      return true;
    },
  };
}
