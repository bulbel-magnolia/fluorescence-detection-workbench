import type { BfnNetworkMode, BfnProject, BfnSimulationResult } from '../types';

export const BFN_WORKSPACE_DATABASE_NAME = 'fluorescence-desktop-bfn-workspace';
export const BFN_WORKSPACE_DATABASE_VERSION = 1;
export const BFN_WORKSPACE_FALLBACK_KEY = 'fluorescence-desktop.bfn-workspace.v1';
export const BFN_WORKSPACE_SETTINGS_ID = 'workspace';
export const BFN_WORKSPACE_MIGRATION_ID = 'legacy-bfn-v2';
export const BFN_WORKSPACE_RUN_LIMIT = 20;

export interface BfnWorkspaceProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  lastOpenedAt: string;
  draftUpdatedAt: string;
  nextRevision: number;
}

export interface BfnWorkspaceVersionSummary {
  inputCount: number;
  moduleCount: number;
  outputCount: number;
  mode: BfnNetworkMode;
}

export interface BfnWorkspaceVersionListItem {
  id: string;
  projectId: string;
  revision: number;
  name?: string;
  note?: string;
  createdAt: string;
  computationSignature: string;
  summary: BfnWorkspaceVersionSummary;
}

export interface BfnWorkspaceVersion extends BfnWorkspaceVersionListItem {
  snapshot: BfnProject;
}

export interface BfnWorkspaceRunRecord {
  id: string;
  projectId: string;
  result: BfnSimulationResult;
  computationSignature: string | null;
  createdAt: string;
}

export interface BfnWorkspaceSettings {
  id: typeof BFN_WORKSPACE_SETTINGS_ID;
  activeProjectId: string | null;
}

export interface BfnWorkspaceMigrationMarker {
  id: typeof BFN_WORKSPACE_MIGRATION_ID;
  completedAt: string;
}

export interface CreateBfnWorkspaceProjectInput {
  metadata: BfnWorkspaceProjectMetadata;
  draft: BfnProject;
  makeActive?: boolean;
}

export interface CreateBfnWorkspaceVersionInput {
  projectId: string;
  snapshot: BfnProject;
  computationSignature: string;
  name?: string;
  note?: string;
  createdAt: string;
}

export interface BfnLegacyMigrationInput extends CreateBfnWorkspaceProjectInput {
  runs: readonly BfnWorkspaceRunRecord[];
  completedAt: string;
}

export interface BfnWorkspaceRepository {
  readonly kind: 'indexeddb' | 'local-storage';
  listProjects(): Promise<BfnWorkspaceProjectMetadata[]>;
  getProject(projectId: string): Promise<BfnWorkspaceProjectMetadata | null>;
  getDraft(projectId: string): Promise<BfnProject | null>;
  createProject(input: CreateBfnWorkspaceProjectInput): Promise<void>;
  renameProject(projectId: string, name: string): Promise<BfnWorkspaceProjectMetadata>;
  saveDraft(
    projectId: string,
    draft: BfnProject,
    updatedAt: string,
  ): Promise<BfnWorkspaceProjectMetadata>;
  replaceDraft(
    projectId: string,
    draft: BfnProject,
    updatedAt: string,
  ): Promise<BfnWorkspaceProjectMetadata>;
  getActiveProjectId(): Promise<string | null>;
  setActiveProject(projectId: string, openedAt: string): Promise<void>;
  createVersion(input: CreateBfnWorkspaceVersionInput): Promise<BfnWorkspaceVersion>;
  listVersions(projectId: string): Promise<BfnWorkspaceVersionListItem[]>;
  getVersion(versionId: string): Promise<BfnWorkspaceVersion | null>;
  saveRun(record: BfnWorkspaceRunRecord): Promise<BfnWorkspaceRunRecord[]>;
  listRuns(projectId: string): Promise<BfnWorkspaceRunRecord[]>;
  clearRuns(projectId: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  hasLegacyMigrationMarker(): Promise<boolean>;
  migrateLegacy(input: BfnLegacyMigrationInput): Promise<boolean>;
}

export function summarizeBfnProject(project: BfnProject): BfnWorkspaceVersionSummary {
  return {
    inputCount: project.network.inputSources.length,
    moduleCount: project.network.modules.length,
    outputCount: project.network.outputMonitors.length,
    mode: project.network.mode,
  };
}

export function workspaceRunRelation(
  record: BfnWorkspaceRunRecord,
  currentSignature: string,
): 'current' | 'earlier' | 'legacy' {
  if (record.computationSignature === null) return 'legacy';
  return record.computationSignature === currentSignature ? 'current' : 'earlier';
}
