import { loadBfnProject, loadBfnRuns } from '../repository';
import type { BfnProject, BfnSimulationResult } from '../types';
import {
  createBlankBfnProject,
  createWorkspaceProjectMetadata,
  type BfnWorkspaceFactoryOptions,
} from './workspaceProjectFactory';
import type {
  BfnWorkspaceProjectMetadata,
  BfnWorkspaceRepository,
  BfnWorkspaceRunRecord,
} from './workspaceTypes';

export interface BfnWorkspaceBootstrapOptions extends BfnWorkspaceFactoryOptions {
  blankProjectName: string;
  migratedProjectName: string;
  loadLegacyProject?: () => BfnProject | null;
  loadLegacyRuns?: () => BfnSimulationResult[];
}

export interface BfnWorkspaceBootstrapResult {
  projects: BfnWorkspaceProjectMetadata[];
  activeProject: BfnWorkspaceProjectMetadata;
  draft: BfnProject;
  runs: BfnWorkspaceRunRecord[];
  migrated: boolean;
}

function legacyRunRecords(
  projectId: string,
  runs: readonly BfnSimulationResult[],
): BfnWorkspaceRunRecord[] {
  return runs.slice(0, 20).map((result, index) => ({
    id: `legacy:${projectId}:${result.id}:${index}`,
    projectId,
    result: structuredClone(result),
    computationSignature: null,
    createdAt: result.completedAt,
  }));
}

async function resolveActive(
  repository: BfnWorkspaceRepository,
  projects: BfnWorkspaceProjectMetadata[],
  now: string,
): Promise<BfnWorkspaceProjectMetadata> {
  const activeId = await repository.getActiveProjectId();
  const active = projects.find((project) => project.id === activeId) ?? projects[0];
  if (!active) throw new Error('BFN_WORKSPACE_EMPTY');
  await repository.setActiveProject(active.id, now);
  return { ...active, lastOpenedAt: now };
}

export async function bootstrapBfnWorkspace(
  repository: BfnWorkspaceRepository,
  options: BfnWorkspaceBootstrapOptions,
): Promise<BfnWorkspaceBootstrapResult> {
  const now = options.now ?? new Date().toISOString();
  let projects = await repository.listProjects();
  let migrated = false;

  if (projects.length === 0 && !(await repository.hasLegacyMigrationMarker())) {
    const legacyProject = (options.loadLegacyProject ?? loadBfnProject)();
    if (legacyProject) {
      const metadata = createWorkspaceProjectMetadata(options.migratedProjectName, {
        now,
        ...(options.workspaceProjectId ? { workspaceProjectId: options.workspaceProjectId } : {}),
      });
      migrated = await repository.migrateLegacy({
        metadata,
        draft: structuredClone(legacyProject),
        makeActive: true,
        runs: legacyRunRecords(metadata.id, (options.loadLegacyRuns ?? loadBfnRuns)()),
        completedAt: now,
      });
      projects = await repository.listProjects();
    }
  }

  if (projects.length === 0) {
    const metadata = createWorkspaceProjectMetadata(options.blankProjectName, {
      now,
      ...(options.workspaceProjectId ? { workspaceProjectId: options.workspaceProjectId } : {}),
    });
    const draft = createBlankBfnProject({
      now,
      ...(options.bfnProjectId ? { bfnProjectId: options.bfnProjectId } : {}),
      ...(options.networkId ? { networkId: options.networkId } : {}),
    });
    await repository.createProject({ metadata, draft, makeActive: true });
    projects = await repository.listProjects();
  }

  const activeProject = await resolveActive(repository, projects, now);
  const draft = await repository.getDraft(activeProject.id);
  if (!draft) throw new Error('BFN_WORKSPACE_DRAFT_MISSING');
  const runs = await repository.listRuns(activeProject.id);
  return {
    projects: await repository.listProjects(),
    activeProject,
    draft,
    runs,
    migrated,
  };
}
