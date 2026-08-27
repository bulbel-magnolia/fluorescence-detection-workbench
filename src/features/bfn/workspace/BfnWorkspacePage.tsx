import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { BfnPlatformPage } from '../BfnPlatformPage';
import { createBfnComputationSignature } from '../computationSignature';
import { parseBfnProject } from '../repository';
import type { BfnProject, BfnSimulationResult } from '../types';
import { BfnProjectCenter } from './BfnProjectCenter';
import { bootstrapBfnWorkspace } from './workspaceMigration';
import {
  createBlankBfnProject,
  createWorkspaceProjectMetadata,
  duplicateBfnProject,
  importedWorkspaceName,
} from './workspaceProjectFactory';
import { createBfnWorkspaceRepository } from './workspaceRepository';
import {
  workspaceRunRelation,
  type BfnWorkspaceProjectMetadata,
  type BfnWorkspaceRepository,
  type BfnWorkspaceRunRecord,
  type BfnWorkspaceVersionListItem,
} from './workspaceTypes';

interface ReadyWorkspaceState {
  projects: BfnWorkspaceProjectMetadata[];
  activeProject: BfnWorkspaceProjectMetadata;
  draft: BfnProject;
  versions: BfnWorkspaceVersionListItem[];
  runs: BfnWorkspaceRunRecord[];
}

export interface BfnWorkspacePageProps {
  repository?: BfnWorkspaceRepository;
  clock?: () => string;
}

function uniqueProjectName(base: string, projects: readonly BfnWorkspaceProjectMetadata[]): string {
  const names = new Set(projects.map((project) => project.name.toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!names.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

export function BfnWorkspacePage({ repository: repositoryProp, clock }: BfnWorkspacePageProps) {
  const { t } = useTranslation();
  const repositoryRef = useRef<BfnWorkspaceRepository | null>(null);
  if (!repositoryRef.current) {
    repositoryRef.current = repositoryProp ?? createBfnWorkspaceRepository();
  }
  const repository = repositoryRef.current;
  const now = useCallback(() => clock?.() ?? new Date().toISOString(), [clock]);
  const [state, setState] = useState<ReadyWorkspaceState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const [projectCenterOpen, setProjectCenterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const stateRef = useRef<ReadyWorkspaceState | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosavePendingRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);

  const applyState = useCallback((next: ReadyWorkspaceState): void => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    stateRef.current = null;
    setLoadError(false);
    void bootstrapBfnWorkspace(repository, {
      blankProjectName: t('bfn.workspace.defaults.blankName'),
      migratedProjectName: t('bfn.workspace.defaults.migratedName'),
      now: now(),
    })
      .then(async (result) => {
        const versions = await repository.listVersions(result.activeProject.id);
        if (cancelled) return;
        applyState({
          projects: result.projects,
          activeProject: result.activeProject,
          draft: result.draft,
          versions,
          runs: result.runs,
        });
        if (result.migrated) setWorkspaceNotice(t('bfn.workspace.notices.migrated'));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applyState, now, repository, retryToken, t]);

  const updateMetadata = useCallback((metadata: BfnWorkspaceProjectMetadata): void => {
    setState((current) => {
      if (!current) return current;
      const next = {
        ...current,
        activeProject: current.activeProject.id === metadata.id ? metadata : current.activeProject,
        projects: current.projects
          .map((project) => (project.id === metadata.id ? metadata : project))
          .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt)),
      };
      stateRef.current = next;
      return next;
    });
  }, []);

  const flushAutosave = useCallback(async (): Promise<void> => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (savePromiseRef.current) await savePromiseRef.current;
    if (!autosavePendingRef.current) return;
    const current = stateRef.current;
    if (!current) return;
    const projectId = current.activeProject.id;
    const draft = structuredClone(current.draft);
    const updatedAt = now();
    autosavePendingRef.current = false;
    const save = repository
      .saveDraft(projectId, draft, updatedAt)
      .then((metadata) => {
        updateMetadata(metadata);
        setSaveStatus('saved');
      })
      .catch((error: unknown) => {
        autosavePendingRef.current = true;
        setSaveStatus('error');
        throw error;
      })
      .finally(() => {
        savePromiseRef.current = null;
      });
    savePromiseRef.current = save;
    await save;
    if (autosavePendingRef.current) await flushAutosave();
  }, [now, repository, updateMetadata]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
      if (autosavePendingRef.current) void flushAutosave().catch(() => undefined);
    },
    [flushAutosave],
  );

  const handleProjectChange = (draft: BfnProject): void => {
    setState((current) => {
      if (!current) return current;
      const next = { ...current, draft };
      stateRef.current = next;
      return next;
    });
    autosavePendingRef.current = true;
    setSaveStatus('saving');
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void flushAutosave().catch(() => {
        setWorkspaceNotice(t('bfn.workspace.notices.autosaveFailed'));
      });
    }, 320);
  };

  const loadProject = async (
    projectId: string,
    options: { closeCenter?: boolean } = {},
  ): Promise<void> => {
    const openedAt = now();
    await repository.setActiveProject(projectId, openedAt);
    const [projects, metadata, draft, versions, runs] = await Promise.all([
      repository.listProjects(),
      repository.getProject(projectId),
      repository.getDraft(projectId),
      repository.listVersions(projectId),
      repository.listRuns(projectId),
    ]);
    if (!metadata || !draft) throw new Error('BFN_WORKSPACE_PROJECT_INCOMPLETE');
    applyState({
      projects,
      activeProject: { ...metadata, lastOpenedAt: openedAt },
      draft,
      versions,
      runs,
    });
    autosavePendingRef.current = false;
    setSaveStatus('saved');
    setEditorGeneration((value) => value + 1);
    if (options.closeCenter ?? true) setProjectCenterOpen(false);
  };

  const switchProject = async (projectId: string): Promise<void> => {
    const current = stateRef.current;
    if (!current || projectId === current.activeProject.id) {
      setProjectCenterOpen(false);
      return;
    }
    setBusy(true);
    try {
      await flushAutosave();
      await loadProject(projectId);
    } catch {
      setWorkspaceNotice(t('bfn.workspace.notices.switchBlocked'));
      setSaveStatus('error');
    } finally {
      setBusy(false);
    }
  };

  const activateNewProject = async (
    metadata: BfnWorkspaceProjectMetadata,
    draft: BfnProject,
  ): Promise<void> => {
    await flushAutosave();
    await repository.createProject({ metadata, draft, makeActive: true });
    await loadProject(metadata.id);
  };

  const createBlank = async (): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    setBusy(true);
    try {
      const timestamp = now();
      const name = uniqueProjectName(t('bfn.workspace.defaults.blankName'), current.projects);
      await activateNewProject(
        createWorkspaceProjectMetadata(name, { now: timestamp }),
        createBlankBfnProject({ now: timestamp }),
      );
      setWorkspaceNotice(t('bfn.workspace.notices.blankCreated'));
    } catch {
      setWorkspaceNotice(t('bfn.workspace.notices.operationFailed'));
    } finally {
      setBusy(false);
    }
  };

  const duplicateCurrent = async (): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    setBusy(true);
    try {
      const timestamp = now();
      const name = uniqueProjectName(
        t('bfn.workspace.defaults.copyName', { name: current.activeProject.name }),
        current.projects,
      );
      await activateNewProject(
        createWorkspaceProjectMetadata(name, { now: timestamp }),
        duplicateBfnProject(current.draft, { now: timestamp }),
      );
      setWorkspaceNotice(t('bfn.workspace.notices.duplicated'));
    } catch {
      setWorkspaceNotice(t('bfn.workspace.notices.operationFailed'));
    } finally {
      setBusy(false);
    }
  };

  const renameProject = async (projectId: string, name: string): Promise<void> => {
    setBusy(true);
    try {
      const metadata = await repository.renameProject(projectId, name);
      updateMetadata(metadata);
      setWorkspaceNotice(t('bfn.workspace.notices.renamed'));
    } catch {
      setWorkspaceNotice(t('bfn.workspace.notices.operationFailed'));
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async (projectId: string): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    setBusy(true);
    try {
      if (projectId === current.activeProject.id) await flushAutosave();
      await repository.deleteProject(projectId);
      const activeId = await repository.getActiveProjectId();
      if (!activeId) throw new Error('BFN_WORKSPACE_ACTIVE_PROJECT_MISSING');
      if (projectId === current.activeProject.id) {
        await loadProject(activeId, { closeCenter: false });
      } else {
        const projects = await repository.listProjects();
        applyState({ ...current, projects });
      }
      setWorkspaceNotice(t('bfn.workspace.notices.deleted'));
    } catch {
      setWorkspaceNotice(t('bfn.workspace.notices.operationFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveVersion = async (name?: string, note?: string): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    setBusy(true);
    try {
      await repository.createVersion({
        projectId: current.activeProject.id,
        snapshot: structuredClone(current.draft),
        computationSignature: createBfnComputationSignature(current.draft),
        createdAt: now(),
        ...(name ? { name } : {}),
        ...(note ? { note } : {}),
      });
      const versions = await repository.listVersions(current.activeProject.id);
      const latest = stateRef.current;
      if (latest) applyState({ ...latest, versions });
      setWorkspaceNotice(t('bfn.workspace.notices.versionSaved'));
    } catch {
      setWorkspaceNotice(t('bfn.workspace.notices.operationFailed'));
      throw new Error('BFN_WORKSPACE_VERSION_SAVE_FAILED');
    } finally {
      setBusy(false);
    }
  };

  const restoreVersion = async (versionId: string): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    setBusy(true);
    try {
      await flushAutosave();
      const version = await repository.getVersion(versionId);
      if (!version || version.projectId !== current.activeProject.id) {
        throw new Error('BFN_WORKSPACE_VERSION_NOT_FOUND');
      }
      const timestamp = now();
      const draft = { ...structuredClone(version.snapshot), updatedAt: timestamp };
      const metadata = await repository.replaceDraft(current.activeProject.id, draft, timestamp);
      autosavePendingRef.current = false;
      applyState({
        ...current,
        activeProject: metadata,
        projects: current.projects.map((project) =>
          project.id === metadata.id ? metadata : project,
        ),
        draft,
      });
      setSaveStatus('saved');
      setEditorGeneration((value) => value + 1);
      setProjectCenterOpen(false);
      setWorkspaceNotice(t('bfn.workspace.notices.restored', { revision: version.revision }));
    } catch {
      setWorkspaceNotice(t('bfn.workspace.notices.operationFailed'));
    } finally {
      setBusy(false);
    }
  };

  const importAsProject = async (file: File): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    const imported = parseBfnProject(await file.text());
    const timestamp = now();
    const name = uniqueProjectName(
      importedWorkspaceName(file.name, t('bfn.workspace.defaults.importedName')),
      current.projects,
    );
    await activateNewProject(createWorkspaceProjectMetadata(name, { now: timestamp }), imported);
    setWorkspaceNotice(t('bfn.workspace.notices.imported'));
  };

  const saveRun = async (
    result: BfnSimulationResult,
    computationSignature: string,
  ): Promise<void> => {
    const current = stateRef.current;
    if (!current) throw new Error('BFN_WORKSPACE_NOT_READY');
    const record: BfnWorkspaceRunRecord = {
      id: `${current.activeProject.id}:${result.id}`,
      projectId: current.activeProject.id,
      result: structuredClone(result),
      computationSignature,
      createdAt: result.completedAt,
    };
    const runs = await repository.saveRun(record);
    setState((latest) => {
      if (!latest || latest.activeProject.id !== record.projectId) return latest;
      const next = { ...latest, runs };
      stateRef.current = next;
      return next;
    });
  };

  const clearRuns = async (): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    await repository.clearRuns(current.activeProject.id);
    applyState({ ...current, runs: [] });
  };

  if (loadError) {
    return (
      <div className="bfn-workspace-gate" role="alert">
        <h2>{t('bfn.workspace.loadError.title')}</h2>
        <p>{t('bfn.workspace.loadError.description')}</p>
        <Button variant="primary" onClick={() => setRetryToken((value) => value + 1)}>
          {t('bfn.workspace.loadError.retry')}
        </Button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="bfn-workspace-gate" role="status">
        <div className="bfn-workspace-gate__spinner" aria-hidden="true" />
        <p>{t('bfn.workspace.loading')}</p>
      </div>
    );
  }

  const currentSignature = createBfnComputationSignature(state.draft);
  const runSignatures = Object.fromEntries(
    state.runs.map((record) => [record.result.id, record.computationSignature]),
  );
  const runRelations = Object.fromEntries(
    state.runs.map((record) => [record.result.id, workspaceRunRelation(record, currentSignature)]),
  );

  return (
    <>
      <BfnPlatformPage
        key={`${state.activeProject.id}:${editorGeneration}`}
        project={state.draft}
        projectName={state.activeProject.name}
        runs={state.runs.map((record) => record.result)}
        runSignatures={runSignatures}
        runRelations={runRelations}
        saveStatus={saveStatus}
        projectCenterOpen={projectCenterOpen}
        onProjectChange={handleProjectChange}
        onRunCreated={saveRun}
        onClearRuns={clearRuns}
        onImportProject={importAsProject}
        onOpenProjectCenter={() => setProjectCenterOpen(true)}
        onCatalogOpen={() => setProjectCenterOpen(false)}
      />
      <BfnProjectCenter
        open={projectCenterOpen}
        projects={state.projects}
        activeProject={state.activeProject}
        draft={state.draft}
        versions={state.versions}
        runCount={state.runs.length}
        busy={busy}
        onClose={() => setProjectCenterOpen(false)}
        onSwitch={switchProject}
        onCreateBlank={createBlank}
        onDuplicate={duplicateCurrent}
        onRename={renameProject}
        onDelete={deleteProject}
        onSaveVersion={saveVersion}
        onRestore={restoreVersion}
      />
      {workspaceNotice ? (
        <button
          className="bfn-workspace-notice"
          type="button"
          role="status"
          onClick={() => setWorkspaceNotice(null)}
        >
          {workspaceNotice}
        </button>
      ) : null}
    </>
  );
}
