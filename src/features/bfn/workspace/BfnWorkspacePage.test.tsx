import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { createDemoBfnProject } from '../fixtures';
import { runBfnSimulation } from '../simulation';
import { BfnWorkspacePage } from './BfnWorkspacePage';
import { createBfnComputationSignature } from '../computationSignature';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from '../catalog/catalogBfnAdapter';
import { addIdealConnection } from '../validation';
import { createIndexedDbBfnWorkspaceRepository } from './indexedDbWorkspaceRepository';
import { createLocalStorageBfnWorkspaceRepository } from './localStorageWorkspaceRepository';
import { createWorkspaceProjectMetadata } from './workspaceProjectFactory';
import type {
  BfnWorkspaceRepository,
  BfnWorkspaceRunRecord,
  CreateBfnWorkspaceProjectInput,
} from './workspaceTypes';
import { BFN_WORKSPACE_FALLBACK_KEY } from './workspaceTypes';

const now = '2026-08-27T06:00:00.000Z';

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

function failFirstOpenFactory(): { factory: IDBFactory; attempts: () => number } {
  const delegate = new IDBFactory();
  let attempts = 0;
  const factory = Object.create(delegate) as IDBFactory;
  Object.defineProperty(factory, 'open', {
    value: (name: string, version?: number): IDBOpenDBRequest => {
      attempts += 1;
      if (attempts === 1) return rejectedOpenRequest('temporary open failure');
      return version === undefined ? delegate.open(name) : delegate.open(name, version);
    },
  });
  return { factory, attempts: () => attempts };
}

function jsonFile(value: unknown, name: string): File {
  const raw = JSON.stringify(value);
  const file = new File([raw], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(raw) });
  return file;
}

type ProjectTransitionFailure = 'metadata' | 'draft' | 'versions' | 'runs' | 'activation';

async function seedTwoProjects(): Promise<{
  repository: BfnWorkspaceRepository;
  projectADraft: ReturnType<typeof createDemoBfnProject>;
  projectBDraft: ReturnType<typeof createDemoBfnProject>;
}> {
  const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
  const projectBDraft = createDemoBfnProject('2026-08-27T05:00:00.000Z');
  const projectADraft = createDemoBfnProject(now);
  await repository.createProject({
    metadata: createWorkspaceProjectMetadata('Project B', {
      now: '2026-08-27T05:00:00.000Z',
      workspaceProjectId: 'project-b',
    }),
    draft: projectBDraft,
    makeActive: true,
  });
  await repository.createProject({
    metadata: createWorkspaceProjectMetadata('Project A', {
      now,
      workspaceProjectId: 'project-a',
    }),
    draft: projectADraft,
    makeActive: true,
  });
  return { repository, projectADraft, projectBDraft };
}

function withTargetTransitionFailure(
  repository: BfnWorkspaceRepository,
  failure: ProjectTransitionFailure,
): BfnWorkspaceRepository {
  const failForTarget = (projectId: string): void => {
    if (projectId === 'project-b') throw new Error(`target ${failure} unavailable`);
  };
  switch (failure) {
    case 'metadata':
      return {
        ...repository,
        getProject: async (projectId) => {
          failForTarget(projectId);
          return repository.getProject(projectId);
        },
      };
    case 'draft':
      return {
        ...repository,
        getDraft: async (projectId) => {
          failForTarget(projectId);
          return repository.getDraft(projectId);
        },
      };
    case 'versions':
      return {
        ...repository,
        listVersions: async (projectId) => {
          failForTarget(projectId);
          return repository.listVersions(projectId);
        },
      };
    case 'runs':
      return {
        ...repository,
        listRuns: async (projectId) => {
          failForTarget(projectId);
          return repository.listRuns(projectId);
        },
      };
    case 'activation':
      return {
        ...repository,
        setActiveProject: async (projectId, openedAt) => {
          failForTarget(projectId);
          return repository.setActiveProject(projectId, openedAt);
        },
      };
  }
}

function withPostCreateReadFailure(repository: BfnWorkspaceRepository): {
  repository: BfnWorkspaceRepository;
  createInputs: CreateBfnWorkspaceProjectInput[];
  restoreReads: () => void;
} {
  let createCommitted = false;
  const createInputs: CreateBfnWorkspaceProjectInput[] = [];
  const rejectPostCreateRead = (): void => {
    if (createCommitted) throw new Error('post-create read unavailable');
  };
  return {
    createInputs,
    restoreReads: () => {
      createCommitted = false;
    },
    repository: {
      ...repository,
      listProjects: async () => {
        rejectPostCreateRead();
        return repository.listProjects();
      },
      getProject: async (projectId) => {
        rejectPostCreateRead();
        return repository.getProject(projectId);
      },
      getDraft: async (projectId) => {
        rejectPostCreateRead();
        return repository.getDraft(projectId);
      },
      listVersions: async (projectId) => {
        rejectPostCreateRead();
        return repository.listVersions(projectId);
      },
      listRuns: async (projectId) => {
        rejectPostCreateRead();
        return repository.listRuns(projectId);
      },
      getActiveProjectId: async () => {
        rejectPostCreateRead();
        return repository.getActiveProjectId();
      },
      setActiveProject: async (projectId, openedAt) => {
        rejectPostCreateRead();
        return repository.setActiveProject(projectId, openedAt);
      },
      createProject: async (input) => {
        await repository.createProject(input);
        createInputs.push(structuredClone(input));
        createCommitted = true;
      },
    },
  };
}

function connectedCatalogProject() {
  const project = createDemoBfnProject(now);
  project.isDemo = false;
  project.network.inputSources = [];
  project.network.modules = [];
  project.network.edges = [];
  project.registry.validityDomains = [];
  const responseId = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;
  const candidate = buildBfnCatalogRuntimeCandidate(responseId);
  const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-workspace-catalog',
    modulePosition: { x: 360, y: 180 },
    createInputSource: true,
    inputSourceId: 'source-workspace-catalog',
    inputSourcePosition: { x: 60, y: 180 },
  });
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  const next = instantiated.nextProject;
  const source = next.network.inputSources[0]!;
  const module = next.network.modules[0]!;
  const monitor = next.network.outputMonitors[0]!;
  monitor.inputPort = {
    ...module.outputPorts[0]!,
    id: monitor.inputPort.id,
    direction: 'input',
  };
  const withInput = addIdealConnection(
    next,
    { nodeId: source.id, portId: source.outputPort.id },
    { nodeId: module.id, portId: module.inputPorts[0]!.id },
    'edge-workspace-catalog-input',
  );
  return addIdealConnection(
    withInput,
    { nodeId: module.id, portId: module.outputPorts[0]!.id },
    { nodeId: monitor.id, portId: monitor.inputPort.id },
    'edge-workspace-catalog-output',
  );
}

describe('multi-project workspace UI', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('retries the same IndexedDB repository after an initial bootstrap open failure', async () => {
    const user = userEvent.setup();
    const controlled = failFirstOpenFactory();
    const repository = createIndexedDbBfnWorkspaceRepository(controlled.factory);
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);

    const errorSurface = await screen.findByRole('alert');
    expect(
      within(errorSurface).getByRole('heading', {
        name: '本地建模项目暂时无法打开。',
      }),
    ).toBeInTheDocument();
    expect(controlled.attempts()).toBe(1);

    await user.click(within(errorSurface).getByRole('button', { name: '重试' }));

    expect(await screen.findByRole('heading', { name: '未命名项目' })).toBeInTheDocument();
    expect(controlled.attempts()).toBe(2);
  });

  it('opens a real blank project and exposes the accessible overlay Project Center', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);

    expect(screen.getByText('正在打开项目工作区…')).toBeInTheDocument();
    const heading = await screen.findByRole('heading', { name: '未命名项目' });
    expect(screen.queryByText('DEMO')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '3OC6-HSL, 输入' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AHL 响应, 功能模块' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '报告信号, 输出' })).toBeInTheDocument();

    await user.click(within(heading).getByRole('button', { name: '未命名项目' }));
    const center = screen.getByRole('dialog', { name: '项目中心' });
    expect(center).toHaveAttribute('aria-modal', 'true');
    expect(within(center).getByText('当前草稿')).toBeInTheDocument();
    expect(within(center).getByText('持续自动保存')).toBeInTheDocument();
    const draft = within(center).getByText('当前草稿').closest('article')!;
    expect(within(draft).getAllByText('0', { selector: 'dd' })).toHaveLength(3);
    expect(within(draft).getByText('1', { selector: 'dd' })).toBeInTheDocument();
    expect(within(draft).getByText('连接')).toBeInTheDocument();
    expect(within(center).getByText(/自动保存不会创建版本/)).toBeInTheDocument();
  });

  it('creates, renames, duplicates, switches, and deletes project-scoped data', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: '未命名项目' });

    await user.click(screen.getByRole('button', { name: '未命名项目' }));
    await user.click(screen.getByRole('button', { name: '新建空白项目' }));
    expect(await screen.findByRole('heading', { name: '未命名项目 2' })).toBeInTheDocument();
    expect(await repository.listProjects()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '未命名项目 2' }));
    const currentSelector = screen.getByRole('button', {
      name: /未命名项目 2.*2026/,
      current: true,
    });
    const currentRow = currentSelector.closest('article')!;
    await user.click(within(currentRow).getByRole('button', { name: '重命名 未命名项目 2' }));
    const nameInput = within(currentRow).getByRole('textbox', { name: '项目名称' });
    await user.clear(nameInput);
    await user.type(nameInput, 'AHL 设计验证');
    await user.click(within(currentRow).getByRole('button', { name: '保存' }));
    expect(
      await screen.findByRole('heading', { name: 'AHL 设计验证', level: 1 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '复制当前项目' }));
    expect(await screen.findByRole('heading', { name: 'AHL 设计验证 副本' })).toBeInTheDocument();
    const projectsAfterCopy = await repository.listProjects();
    expect(projectsAfterCopy).toHaveLength(3);
    const duplicate = projectsAfterCopy.find((project) => project.name === 'AHL 设计验证 副本')!;
    expect(await repository.listVersions(duplicate.id)).toEqual([]);
    expect(await repository.listRuns(duplicate.id)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'AHL 设计验证 副本' }));
    const center = screen.getByRole('dialog', { name: '项目中心' });
    const firstProject = within(center).getByRole('button', { name: /未命名项目.*2026/ });
    await user.click(firstProject);
    expect(await screen.findByRole('heading', { name: '未命名项目' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '未命名项目' }));
    const copyRow = screen
      .getByRole('button', { name: /AHL 设计验证 副本.*2026/ })
      .closest('article')!;
    await user.click(within(copyRow).getByRole('button', { name: '删除 AHL 设计验证 副本' }));
    const confirmation = screen.getByRole('alertdialog', { name: '删除这个项目？' });
    await user.click(within(confirmation).getByRole('button', { name: '删除项目' }));
    await waitFor(async () => expect(await repository.listProjects()).toHaveLength(2));
  });

  it('activates a known blank project after one atomic create without post-create reads', async () => {
    const user = userEvent.setup();
    const seeded = await seedTwoProjects();
    const harness = withPostCreateReadFailure(seeded.repository);
    render(<BfnWorkspacePage repository={harness.repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });

    await user.click(screen.getByRole('button', { name: 'Project A' }));
    await user.click(screen.getByRole('button', { name: '新建空白项目' }));

    expect(
      await screen.findByRole('heading', { name: '未命名项目', level: 1 }),
    ).toBeInTheDocument();
    expect(harness.createInputs).toHaveLength(1);
    const created = harness.createInputs[0]!;
    expect(created.makeActive).toBe(true);
    expect(await seeded.repository.getActiveProjectId()).toBe(created.metadata.id);
    expect(await seeded.repository.getDraft(created.metadata.id)).toEqual(created.draft);
    expect(await seeded.repository.listVersions(created.metadata.id)).toEqual([]);
    expect(await seeded.repository.listRuns(created.metadata.id)).toEqual([]);
    expect(screen.queryByRole('dialog', { name: '项目中心' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
  });

  it('activates a known Catalog-backed duplicate without copying versions or runs', async () => {
    const user = userEvent.setup();
    const base = createLocalStorageBfnWorkspaceRepository(localStorage);
    const projectA = connectedCatalogProject();
    const metadataA = createWorkspaceProjectMetadata('Project A', {
      now,
      workspaceProjectId: 'project-a',
    });
    await base.createProject({ metadata: metadataA, draft: projectA, makeActive: true });
    await base.createVersion({
      projectId: metadataA.id,
      snapshot: projectA,
      computationSignature: createBfnComputationSignature(projectA),
      name: 'A checkpoint',
      createdAt: now,
    });
    const resultA = runBfnSimulation(projectA);
    await base.saveRun({
      id: `${metadataA.id}:${resultA.id}`,
      projectId: metadataA.id,
      result: resultA,
      computationSignature: createBfnComputationSignature(projectA),
      createdAt: resultA.completedAt,
    });
    const harness = withPostCreateReadFailure(base);
    render(<BfnWorkspacePage repository={harness.repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });
    expect(await screen.findByText('来源记录已匹配')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Project A' }));
    await user.click(screen.getByRole('button', { name: '复制当前项目' }));

    expect(
      await screen.findByRole('heading', { name: 'Project A 副本', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText('来源记录已匹配')).toBeInTheDocument();
    expect(harness.createInputs).toHaveLength(1);
    const created = harness.createInputs[0]!;
    const duplicate = await base.getDraft(created.metadata.id);
    expect(created.makeActive).toBe(true);
    expect(await base.getActiveProjectId()).toBe(created.metadata.id);
    expect(duplicate?.id).not.toBe(projectA.id);
    expect(duplicate?.network.id).not.toBe(projectA.network.id);
    expect(duplicate?.network.modules).toEqual(projectA.network.modules);
    expect(await base.listVersions(metadataA.id)).toHaveLength(1);
    expect(await base.listRuns(metadataA.id)).toHaveLength(1);
    expect(await base.listVersions(created.metadata.id)).toEqual([]);
    expect(await base.listRuns(created.metadata.id)).toEqual([]);
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();

    harness.restoreReads();
    await user.click(screen.getByRole('button', { name: 'Project A 副本' }));
    await user.click(screen.getByRole('button', { name: '保存当前版本' }));
    await user.type(screen.getByRole('textbox', { name: '名称（可选）' }), 'Catalog checkpoint');
    await user.click(screen.getByRole('button', { name: '保存版本' }));
    expect(await screen.findByText('Catalog checkpoint')).toBeInTheDocument();

    const copyCenter = screen.getByRole('dialog', { name: '项目中心' });
    const originalSelector = within(copyCenter)
      .getAllByRole('button', { name: /Project A.*2026/ })
      .find((button) => button.getAttribute('aria-current') !== 'true');
    if (!originalSelector) throw new Error('Original Project A selector was not rendered.');
    await user.click(originalSelector);
    await screen.findByRole('heading', { name: 'Project A', level: 1 });
    expect(await screen.findByText('来源记录已匹配')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Project A' }));
    const originalCenter = screen.getByRole('dialog', { name: '项目中心' });
    await user.click(within(originalCenter).getByRole('button', { name: /Project A 副本.*2026/ }));
    await screen.findByRole('heading', { name: 'Project A 副本', level: 1 });
    expect(await screen.findByText('来源记录已匹配')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '动态分析' }));
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Project A 副本' }));
    await user.click(screen.getByRole('button', { name: '恢复版本 1' }));
    const confirmation = screen.getByRole('alertdialog', { name: '恢复版本 1？' });
    await user.click(within(confirmation).getByRole('button', { name: '恢复此版本' }));
    expect(await screen.findByText('来源记录已匹配')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
  });

  it('activates a known imported project without post-create reads or changing the source project', async () => {
    const user = userEvent.setup();
    const seeded = await seedTwoProjects();
    const harness = withPostCreateReadFailure(seeded.repository);
    const imported = createDemoBfnProject('2026-08-20T00:00:00.000Z');
    render(<BfnWorkspacePage repository={harness.repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });

    await user.upload(
      screen.getByLabelText('导入模型'),
      jsonFile(imported, 'Receiver design.bfn-ir.json'),
    );

    expect(
      await screen.findByRole('heading', { name: 'Receiver design', level: 1 }),
    ).toBeInTheDocument();
    expect(harness.createInputs).toHaveLength(1);
    const created = harness.createInputs[0]!;
    expect(created.makeActive).toBe(true);
    expect(created.draft.id).toBe(imported.id);
    expect(created.draft.network.id).toBe(imported.network.id);
    expect(await seeded.repository.getActiveProjectId()).toBe(created.metadata.id);
    expect(await seeded.repository.getDraft(created.metadata.id)).toEqual(imported);
    expect(await seeded.repository.listVersions(created.metadata.id)).toEqual([]);
    expect(await seeded.repository.listRuns(created.metadata.id)).toEqual([]);
    expect(await seeded.repository.getDraft('project-a')).toEqual(seeded.projectADraft);
  });

  it('keeps the current project when the atomic create transaction rejects', async () => {
    const user = userEvent.setup();
    const seeded = await seedTwoProjects();
    const repository: BfnWorkspaceRepository = {
      ...seeded.repository,
      createProject: vi.fn().mockRejectedValue(new Error('transaction aborted')),
    };
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });

    await user.click(screen.getByRole('button', { name: 'Project A' }));
    await user.click(screen.getByRole('button', { name: '新建空白项目' }));

    expect(await screen.findByText('未能完成工作区操作。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project A', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '项目中心' })).toBeInTheDocument();
    expect(await seeded.repository.getActiveProjectId()).toBe('project-a');
    expect(await seeded.repository.listProjects()).toHaveLength(2);
    expect(await seeded.repository.getDraft('project-a')).toEqual(seeded.projectADraft);
  });

  it('keeps autosave separate from explicitly saved versions', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Demo design', {
      now,
      workspaceProjectId: 'demo-workspace',
    });
    await repository.createProject({
      metadata,
      draft: createDemoBfnProject(now),
      makeActive: true,
    });
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Demo design' });

    await user.click(screen.getByRole('button', { name: '动态分析' }));
    await waitFor(async () => {
      expect((await repository.getDraft(metadata.id))?.network.mode).toBe('dynamic');
    });
    expect(await repository.listVersions(metadata.id)).toEqual([]);
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Demo design' }));
    await user.click(screen.getByRole('button', { name: '保存当前版本' }));
    await user.type(screen.getByRole('textbox', { name: '名称（可选）' }), 'Dynamic checkpoint');
    await user.type(screen.getByRole('textbox', { name: '备注（可选）' }), 'Before static review');
    await user.click(screen.getByRole('button', { name: '保存版本' }));
    expect(await screen.findByText('Dynamic checkpoint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled();
    expect((await repository.listVersions(metadata.id)).map((version) => version.revision)).toEqual(
      [1],
    );
  });

  it('restores a saved version non-destructively and resets editor history', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Restore design', {
      now,
      workspaceProjectId: 'restore-workspace',
    });
    const staticDraft = createDemoBfnProject(now);
    const dynamicSnapshot = structuredClone(staticDraft);
    dynamicSnapshot.network.mode = 'dynamic';
    await repository.createProject({ metadata, draft: staticDraft, makeActive: true });
    await repository.createVersion({
      projectId: metadata.id,
      snapshot: dynamicSnapshot,
      computationSignature: createBfnComputationSignature(dynamicSnapshot),
      createdAt: now,
    });
    await repository.createVersion({
      projectId: metadata.id,
      snapshot: staticDraft,
      computationSignature: createBfnComputationSignature(staticDraft),
      createdAt: '2026-08-27T06:01:00.000Z',
    });
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Restore design' });

    await user.click(screen.getByRole('button', { name: '动态分析' }));
    await user.click(screen.getByRole('button', { name: '稳态分析' }));
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Restore design' }));
    expect(screen.getByText('版本 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '恢复版本 1' }));
    const confirmation = screen.getByRole('alertdialog', { name: '恢复版本 1？' });
    await user.click(within(confirmation).getByRole('button', { name: '恢复此版本' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '动态分析' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    expect((await repository.listVersions(metadata.id)).map((version) => version.revision)).toEqual(
      [2, 1],
    );
    expect((await repository.getDraft(metadata.id))?.network.mode).toBe('dynamic');
  });

  it('advances the visible revision immediately across unchanged consecutive version saves', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Consecutive versions', {
      now,
      workspaceProjectId: 'consecutive-versions',
    });
    const originalDraft = createDemoBfnProject(now);
    const originalSignature = createBfnComputationSignature(originalDraft);
    await repository.createProject({ metadata, draft: originalDraft, makeActive: true });
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Consecutive versions' });

    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));
    expect(await screen.findByText('当前设计')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Consecutive versions' }));
    await user.click(screen.getByRole('button', { name: '保存当前版本' }));
    expect(screen.getByText('版本 1 · 名称和备注均为选填')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '名称（可选）' }), 'V1 checkpoint');
    await user.click(screen.getByRole('button', { name: '保存版本' }));
    const versionOneItem = (await screen.findByText('V1 checkpoint')).closest('li');
    if (!versionOneItem) throw new Error('Version 1 history item was not rendered.');
    expect(
      within(versionOneItem).getByText(new RegExp(`${originalDraft.network.edges.length} 条连接`)),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '保存当前版本' }));
    expect(screen.getByText('版本 2 · 名称和备注均为选填')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '名称（可选）' }), 'V2 checkpoint');
    await user.click(screen.getByRole('button', { name: '保存版本' }));
    expect(await screen.findByText('V2 checkpoint')).toBeInTheDocument();

    const revisionLabels = screen.getAllByText(/^版本 [12]$/).map((element) => element.textContent);
    expect(revisionLabels).toEqual(['版本 2', '版本 1']);
    expect((await repository.getProject(metadata.id))?.nextRevision).toBe(3);
    expect((await repository.listVersions(metadata.id)).map((version) => version.revision)).toEqual(
      [2, 1],
    );
    const persistedDraft = await repository.getDraft(metadata.id);
    expect(persistedDraft).toEqual(originalDraft);
    expect(createBfnComputationSignature(persistedDraft!)).toBe(originalSignature);
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    expect(screen.getByText('当前设计')).toBeInTheDocument();
  });

  it('keeps a committed version successful without a fragile post-save version read', async () => {
    const user = userEvent.setup();
    const base = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Version transaction', {
      now,
      workspaceProjectId: 'version-transaction',
    });
    await base.createProject({
      metadata,
      draft: createDemoBfnProject(now),
      makeActive: true,
    });
    let listCalls = 0;
    const repository: BfnWorkspaceRepository = {
      ...base,
      listVersions: async (projectId) => {
        listCalls += 1;
        if (listCalls > 1) throw new Error('post-save list unavailable');
        return base.listVersions(projectId);
      },
    };
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Version transaction' });

    await user.click(screen.getByRole('button', { name: 'Version transaction' }));
    await user.click(screen.getByRole('button', { name: '保存当前版本' }));
    await user.click(screen.getByRole('button', { name: '保存版本' }));

    expect(await screen.findByText('不可变版本已保存。')).toBeInTheDocument();
    expect(screen.getByText('版本 1')).toBeInTheDocument();
    expect((await base.getProject(metadata.id))?.nextRevision).toBe(2);
    expect(await base.listVersions(metadata.id)).toHaveLength(1);
  });

  it('imports each valid BFN-IR file as a new project and leaves the current project on failure', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: '未命名项目' });
    const imported = createDemoBfnProject('2026-08-20T00:00:00.000Z');
    const input = screen.getByLabelText('导入模型');

    await user.upload(input, jsonFile(imported, 'Receiver design.bfn-ir.json'));
    expect(await screen.findByRole('heading', { name: 'Receiver design' })).toBeInTheDocument();
    const firstImportMetadata = (await repository.listProjects()).find(
      (project) => project.name === 'Receiver design',
    )!;
    expect((await repository.getDraft(firstImportMetadata.id))?.id).toBe(imported.id);

    await user.upload(
      screen.getByLabelText('导入模型'),
      jsonFile(imported, 'Receiver design.bfn-ir.json'),
    );
    expect(await screen.findByRole('heading', { name: 'Receiver design 2' })).toBeInTheDocument();
    expect(await repository.listProjects()).toHaveLength(3);

    await user.upload(
      screen.getByLabelText('导入模型'),
      jsonFile({ schema: 'wrong' }, 'invalid.json'),
    );
    expect(await screen.findByText('无法读取该模型文件，请检查文件格式。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Receiver design 2' })).toBeInTheDocument();
    expect(await repository.listProjects()).toHaveLength(3);
  });

  it('marks project-scoped runs as current, earlier, and legacy by computation signature', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Run scope', {
      now,
      workspaceProjectId: 'run-scope',
    });
    const project = createDemoBfnProject(now);
    await repository.createProject({ metadata, draft: project, makeActive: true });
    const legacyResult = runBfnSimulation(project);
    legacyResult.id = 'legacy-result';
    const legacyRecord: BfnWorkspaceRunRecord = {
      id: 'run-scope:legacy-result',
      projectId: metadata.id,
      result: legacyResult,
      computationSignature: null,
      createdAt: legacyResult.completedAt,
    };
    await repository.saveRun(legacyRecord);
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Run scope' });

    expect(await screen.findByRole('img', { name: '输入—输出响应' })).toBeInTheDocument();
    expect(screen.getByText('旧版运行记录')).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('region', { name: '分析工具栏' })).getByRole('button', {
        name: '重新运行',
      }),
    );
    expect(await screen.findByText('当前设计')).toBeInTheDocument();
    expect(screen.getByText('旧版运行记录')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '动态分析' }));
    expect(await screen.findByText('较早设计')).toBeInTheDocument();
    expect(screen.getByText('旧版运行记录')).toBeInTheDocument();
  });

  it('loads the latest scoped result when the user switches projects', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const projectB = createDemoBfnProject('2026-08-27T04:00:00.000Z');
    const projectA = createDemoBfnProject(now);
    await repository.createProject({
      metadata: createWorkspaceProjectMetadata('Project B', {
        now: '2026-08-27T04:00:00.000Z',
        workspaceProjectId: 'project-b',
      }),
      draft: projectB,
      makeActive: true,
    });
    await repository.createProject({
      metadata: createWorkspaceProjectMetadata('Project A', {
        now,
        workspaceProjectId: 'project-a',
      }),
      draft: projectA,
      makeActive: true,
    });
    const resultA = runBfnSimulation(projectA);
    resultA.id = 'result-a';
    resultA.points[resultA.points.length - 1]!.output = 0.111;
    const resultB = runBfnSimulation(projectB);
    resultB.id = 'result-b';
    resultB.points[resultB.points.length - 1]!.output = 0.222;
    await repository.saveRun({
      id: 'project-a:result-a',
      projectId: 'project-a',
      result: resultA,
      computationSignature: createBfnComputationSignature(projectA),
      createdAt: resultA.completedAt,
    });
    await repository.saveRun({
      id: 'project-b:result-b',
      projectId: 'project-b',
      result: resultB,
      computationSignature: createBfnComputationSignature(projectB),
      createdAt: resultB.completedAt,
    });

    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });
    expect(await screen.findByRole('img', { name: '输入—输出响应' })).toBeInTheDocument();
    expect(screen.getAllByText('0.111').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Project A' }));
    await user.click(screen.getByRole('button', { name: /Project B.*2026/ }));
    await screen.findByRole('heading', { name: 'Project B' });
    expect(await screen.findByRole('img', { name: '输入—输出响应' })).toBeInTheDocument();
    expect(screen.getAllByText('0.222').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.111')).not.toBeInTheDocument();
  });

  it.each([
    ['metadata', 'target metadata read'],
    ['draft', 'target draft read'],
    ['versions', 'target version read'],
    ['runs', 'target run read'],
    ['activation', 'persistent activation'],
  ] as const)(
    'keeps Project A active when %s fails during a switch (%s)',
    async (failure, label) => {
      void label;
      const user = userEvent.setup();
      const seeded = await seedTwoProjects();
      const repository = withTargetTransitionFailure(seeded.repository, failure);
      render(<BfnWorkspacePage repository={repository} clock={() => now} />);
      await screen.findByRole('heading', { name: 'Project A' });

      await user.click(screen.getByRole('button', { name: 'Project A' }));
      const targetButton = screen.getByRole('button', { name: /Project B.*2026/ });
      await user.click(targetButton);

      await waitFor(() => expect(targetButton).toBeEnabled());
      expect(await seeded.repository.getActiveProjectId()).toBe('project-a');
      expect(screen.getByRole('heading', { name: 'Project A', level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: '项目中心' })).toBeInTheDocument();
      expect(await seeded.repository.getDraft('project-a')).toEqual(seeded.projectADraft);
      expect(screen.getByText('无法打开该项目，当前项目保持不变。')).toBeInTheDocument();
    },
  );

  it.each(['metadata', 'draft', 'versions', 'runs'] as const)(
    'keeps the active project intact when replacement %s cannot be prepared for deletion',
    async (failure) => {
      const user = userEvent.setup();
      const seeded = await seedTwoProjects();
      const failingRepository = withTargetTransitionFailure(seeded.repository, failure);
      const deleteProject = vi.fn((projectId: string) =>
        seeded.repository.deleteProject(projectId),
      );
      const repository: BfnWorkspaceRepository = { ...failingRepository, deleteProject };
      render(<BfnWorkspacePage repository={repository} clock={() => now} />);
      await screen.findByRole('heading', { name: 'Project A' });

      await user.click(screen.getByRole('button', { name: 'Project A' }));
      const center = screen.getByRole('dialog', { name: '项目中心' });
      const activeRow = within(center)
        .getByRole('button', { name: /Project A.*2026/, current: true })
        .closest('article')!;
      await user.click(within(activeRow).getByRole('button', { name: '删除 Project A' }));
      const confirmation = screen.getByRole('alertdialog', { name: '删除这个项目？' });
      await user.click(within(confirmation).getByRole('button', { name: '删除项目' }));

      expect(
        await screen.findByText('无法准备下一个项目，因此当前项目没有删除。'),
      ).toBeInTheDocument();
      expect(deleteProject).not.toHaveBeenCalled();
      expect(await seeded.repository.getActiveProjectId()).toBe('project-a');
      expect(await seeded.repository.getProject('project-a')).not.toBeNull();
      expect(await seeded.repository.getDraft('project-a')).toEqual(seeded.projectADraft);
      expect(screen.getByRole('heading', { name: 'Project A', level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: '项目中心' })).toBeInTheDocument();
    },
  );

  it('applies a prepared replacement after active deletion without any post-delete reads', async () => {
    const user = userEvent.setup();
    const seeded = await seedTwoProjects();
    const base = seeded.repository;
    const versionA = await base.createVersion({
      projectId: 'project-a',
      snapshot: seeded.projectADraft,
      computationSignature: createBfnComputationSignature(seeded.projectADraft),
      name: 'A checkpoint',
      createdAt: now,
    });
    await base.createVersion({
      projectId: 'project-b',
      snapshot: seeded.projectBDraft,
      computationSignature: createBfnComputationSignature(seeded.projectBDraft),
      name: 'B checkpoint',
      createdAt: '2026-08-27T05:30:00.000Z',
    });
    const resultA = runBfnSimulation(seeded.projectADraft);
    resultA.id = 'delete-result-a';
    resultA.points[resultA.points.length - 1]!.output = 0.111;
    const resultB = runBfnSimulation(seeded.projectBDraft);
    resultB.id = 'delete-result-b';
    resultB.points[resultB.points.length - 1]!.output = 0.222;
    await base.saveRun({
      id: 'project-a:delete-result-a',
      projectId: 'project-a',
      result: resultA,
      computationSignature: createBfnComputationSignature(seeded.projectADraft),
      createdAt: resultA.completedAt,
    });
    await base.saveRun({
      id: 'project-b:delete-result-b',
      projectId: 'project-b',
      result: resultB,
      computationSignature: createBfnComputationSignature(seeded.projectBDraft),
      createdAt: resultB.completedAt,
    });
    let deleteCommitted = false;
    const rejectPostDeleteRead = (): void => {
      if (deleteCommitted) throw new Error('post-delete read unavailable');
    };
    const repository: BfnWorkspaceRepository = {
      ...base,
      listProjects: async () => {
        rejectPostDeleteRead();
        return base.listProjects();
      },
      getProject: async (projectId) => {
        rejectPostDeleteRead();
        return base.getProject(projectId);
      },
      getDraft: async (projectId) => {
        rejectPostDeleteRead();
        return base.getDraft(projectId);
      },
      listVersions: async (projectId) => {
        rejectPostDeleteRead();
        return base.listVersions(projectId);
      },
      listRuns: async (projectId) => {
        rejectPostDeleteRead();
        return base.listRuns(projectId);
      },
      getActiveProjectId: async () => {
        rejectPostDeleteRead();
        return base.getActiveProjectId();
      },
      deleteProject: async (projectId) => {
        await base.deleteProject(projectId);
        deleteCommitted = true;
      },
    };
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });
    await user.click(screen.getByRole('button', { name: '动态分析' }));
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Project A' }));
    const center = screen.getByRole('dialog', { name: '项目中心' });
    const activeRow = within(center)
      .getByRole('button', { name: /Project A.*2026/, current: true })
      .closest('article')!;
    await user.click(within(activeRow).getByRole('button', { name: '删除 Project A' }));
    const confirmation = screen.getByRole('alertdialog', { name: '删除这个项目？' });
    await user.click(within(confirmation).getByRole('button', { name: '删除项目' }));

    expect(
      await screen.findByRole('heading', { name: 'Project B', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText('项目已从工作区删除。')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '项目中心' })).toBeInTheDocument();
    expect(screen.getByText('B checkpoint')).toBeInTheDocument();
    expect(screen.getAllByText('0.222').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.111')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    expect(await base.getActiveProjectId()).toBe('project-b');
    expect(await base.getProject('project-a')).toBeNull();
    expect(await base.getDraft('project-a')).toBeNull();
    expect(await base.getVersion(versionA.id)).toBeNull();
    const persisted = JSON.parse(localStorage.getItem(BFN_WORKSPACE_FALLBACK_KEY)!) as {
      runs: Record<string, unknown>;
    };
    expect(persisted.runs['project-a:delete-result-a']).toBeUndefined();
    expect(await base.listVersions('project-b')).toHaveLength(1);
    expect(await base.listRuns('project-b')).toHaveLength(1);
  });

  it('filters a deleted non-active project locally when the project list cannot be reread', async () => {
    const user = userEvent.setup();
    const seeded = await seedTwoProjects();
    const base = seeded.repository;
    let deleteCommitted = false;
    const repository: BfnWorkspaceRepository = {
      ...base,
      listProjects: async () => {
        if (deleteCommitted) throw new Error('post-delete project list unavailable');
        return base.listProjects();
      },
      deleteProject: async (projectId) => {
        await base.deleteProject(projectId);
        deleteCommitted = true;
      },
    };
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });

    await user.click(screen.getByRole('button', { name: 'Project A' }));
    const center = screen.getByRole('dialog', { name: '项目中心' });
    const projectBRow = within(center)
      .getByRole('button', { name: /Project B.*2026/ })
      .closest('article')!;
    await user.click(within(projectBRow).getByRole('button', { name: '删除 Project B' }));
    const confirmation = screen.getByRole('alertdialog', { name: '删除这个项目？' });
    await user.click(within(confirmation).getByRole('button', { name: '删除项目' }));

    expect(await screen.findByText('项目已从工作区删除。')).toBeInTheDocument();
    expect(within(center).queryByRole('button', { name: /Project B.*2026/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project A', level: 1 })).toBeInTheDocument();
    expect(await base.getActiveProjectId()).toBe('project-a');
    expect(await base.getProject('project-b')).toBeNull();
    expect(await base.getDraft('project-a')).toEqual(seeded.projectADraft);
  });

  it('blocks a switch when the pending draft cannot be flushed', async () => {
    const user = userEvent.setup();
    const base = createLocalStorageBfnWorkspaceRepository(localStorage);
    await base.createProject({
      metadata: createWorkspaceProjectMetadata('Project B', {
        now: '2026-08-27T05:00:00.000Z',
        workspaceProjectId: 'project-b',
      }),
      draft: createDemoBfnProject(now),
      makeActive: true,
    });
    await base.createProject({
      metadata: createWorkspaceProjectMetadata('Project A', {
        now,
        workspaceProjectId: 'project-a',
      }),
      draft: createDemoBfnProject(now),
      makeActive: true,
    });
    const projectADraft = createDemoBfnProject(now);
    await base.replaceDraft('project-a', projectADraft, now);
    const repository: BfnWorkspaceRepository = {
      ...base,
      saveDraft: vi.fn().mockRejectedValue(new Error('disk unavailable')),
    };
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });

    await user.click(screen.getByRole('button', { name: '动态分析' }));
    await user.click(screen.getByRole('button', { name: 'Project A' }));
    await user.click(screen.getByRole('button', { name: /Project B.*2026/ }));

    expect(await screen.findByText('当前草稿未能保存，因此没有切换项目。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project A', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '项目中心' })).toBeInTheDocument();
    expect(await base.getActiveProjectId()).toBe('project-a');
    expect(await base.getDraft('project-a')).toEqual(projectADraft);
  });

  it('handles Project Center Escape in layers, guards the last project, and excludes Catalog', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Accessible project', {
      now,
      workspaceProjectId: 'accessible-project',
    });
    await repository.createProject({
      metadata,
      draft: createDemoBfnProject(now),
      makeActive: true,
    });
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Accessible project' });

    await user.click(screen.getByRole('button', { name: 'Accessible project' }));
    const center = screen.getByRole('dialog', { name: '项目中心' });
    expect(within(center).getByRole('button', { name: '删除 Accessible project' })).toBeDisabled();
    await user.click(within(center).getByRole('button', { name: '保存当前版本' }));
    expect(within(center).getByRole('textbox', { name: '名称（可选）' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '项目中心' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '名称（可选）' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '项目中心' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '添加模块' }));
    expect(screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accessible project' }));
    expect(screen.getByRole('dialog', { name: '项目中心' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'AHL/HSL 文献目录' })).not.toBeInTheDocument();
  });

  it('commits Input Settings before opening Project Center and keeps the drawers exclusive', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Overlay integrity', {
      now,
      workspaceProjectId: 'overlay-integrity',
    });
    const project = createDemoBfnProject(now);
    const originalSpecification = structuredClone(
      project.network.inputSources[0]!.staticSpecification,
    );
    await repository.createProject({ metadata, draft: project, makeActive: true });
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Overlay integrity' });

    await user.click(screen.getByRole('button', { name: '设置输入' }));
    const inputDialog = screen.getByRole('dialog', { name: '设置输入' });
    await user.selectOptions(
      within(inputDialog).getByRole('combobox', { name: '输入方式' }),
      'fixed_value',
    );
    const value = within(inputDialog).getByRole('spinbutton', { name: '输入值' });
    await user.clear(value);
    await user.type(value, '17.25');

    await user.click(screen.getByRole('button', { name: 'Overlay integrity' }));

    expect(screen.queryByRole('dialog', { name: '设置输入' })).not.toBeInTheDocument();
    const center = screen.getByRole('dialog', { name: '项目中心' });
    await waitFor(async () => {
      expect(
        (await repository.getDraft(metadata.id))?.network.inputSources[0]?.staticSpecification,
      ).toMatchObject({ type: 'fixed_value', value: 17.25 });
    });
    await user.click(within(center).getByRole('button', { name: '关闭项目中心' }));
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(async () => {
      expect(
        (await repository.getDraft(metadata.id))?.network.inputSources[0]?.staticSpecification,
      ).toEqual(originalSpecification);
    });
  });

  it('clears an unfinished version form when the active project changes', async () => {
    const user = userEvent.setup();
    const seeded = await seedTwoProjects();
    render(<BfnWorkspacePage repository={seeded.repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });

    await user.click(screen.getByRole('button', { name: 'Project A' }));
    await user.click(screen.getByRole('button', { name: '保存当前版本' }));
    await user.type(screen.getByRole('textbox', { name: '名称（可选）' }), 'A checkpoint');
    await user.type(screen.getByRole('textbox', { name: '备注（可选）' }), 'note A');
    await user.click(screen.getByRole('button', { name: /Project B.*2026/ }));
    await screen.findByRole('heading', { name: 'Project B' });

    await user.click(screen.getByRole('button', { name: 'Project B' }));
    expect(screen.queryByRole('textbox', { name: '名称（可选）' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存当前版本' }));
    expect(screen.getByRole('textbox', { name: '名称（可选）' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: '备注（可选）' })).toHaveValue('');
  });

  it('clears inline rename state whenever Project Center closes', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Rename reset', {
      now,
      workspaceProjectId: 'rename-reset',
    });
    await repository.createProject({
      metadata,
      draft: createDemoBfnProject(now),
      makeActive: true,
    });
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Rename reset' });

    await user.click(screen.getByRole('button', { name: 'Rename reset' }));
    let center = screen.getByRole('dialog', { name: '项目中心' });
    await user.click(within(center).getByRole('button', { name: '重命名 Rename reset' }));
    expect(within(center).getByRole('textbox', { name: '项目名称' })).toBeInTheDocument();
    await user.click(within(center).getByRole('button', { name: '关闭项目中心' }));

    await user.click(screen.getByRole('button', { name: 'Rename reset' }));
    center = screen.getByRole('dialog', { name: '项目中心' });
    expect(within(center).queryByRole('textbox', { name: '项目名称' })).not.toBeInTheDocument();
    expect(within(center).getByRole('button', { name: /Rename reset.*2026/ })).toBeInTheDocument();
  });

  it('renders an old stored version without edgeCount using a safe unknown marker', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Legacy summary', {
      now,
      workspaceProjectId: 'legacy-summary',
    });
    const project = createDemoBfnProject(now);
    await repository.createProject({ metadata, draft: project, makeActive: true });
    await repository.createVersion({
      projectId: metadata.id,
      snapshot: project,
      computationSignature: createBfnComputationSignature(project),
      createdAt: now,
    });
    const stored = JSON.parse(localStorage.getItem(BFN_WORKSPACE_FALLBACK_KEY)!) as {
      versions: Record<string, { summary: { edgeCount?: number } }>;
    };
    delete Object.values(stored.versions)[0]!.summary.edgeCount;
    localStorage.setItem(BFN_WORKSPACE_FALLBACK_KEY, JSON.stringify(stored));

    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Legacy summary' });
    await user.click(screen.getByRole('button', { name: 'Legacy summary' }));

    expect(screen.getByText(/— 条连接/)).toBeInTheDocument();
  });

  it('exports only the active BFN-IR document with the sanitized workspace name', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('AHL / Receiver: 01', {
      now,
      workspaceProjectId: 'export-project',
    });
    const project = createDemoBfnProject(now);
    await repository.createProject({ metadata, draft: project, makeActive: true });
    let exportedBlob: Blob | null = null;
    let downloadName = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      exportedBlob = blob as Blob;
      return 'blob:workspace-export';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function handleClick(
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'AHL / Receiver: 01' });

    await user.click(screen.getByRole('button', { name: '导出模型' }));

    expect(downloadName).toBe('AHL---Receiver--01.bfn-ir.json');
    expect(exportedBlob).toBeInstanceOf(Blob);
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Workspace export was not read as text'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Workspace export read failed'));
      reader.readAsText(exportedBlob!);
    });
    expect(JSON.parse(raw)).toEqual(project);
    expect(JSON.parse(raw)).not.toHaveProperty('activeProject');
    expect(JSON.parse(raw)).not.toHaveProperty('versions');
    expect(JSON.parse(raw)).not.toHaveProperty('runs');
  });

  it('keeps a computed result visible when only its run-record persistence fails', async () => {
    const user = userEvent.setup();
    const base = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Run failure', {
      now,
      workspaceProjectId: 'run-failure',
    });
    await base.createProject({ metadata, draft: createDemoBfnProject(now), makeActive: true });
    const repository: BfnWorkspaceRepository = {
      ...base,
      saveRun: vi.fn().mockRejectedValue(new Error('run store unavailable')),
    };
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Run failure' });

    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));

    expect(await screen.findByRole('img', { name: '输入—输出响应' })).toBeInTheDocument();
    expect(await screen.findByText('结果仍可查看，但项目运行记录保存失败。')).toBeInTheDocument();
    expect(screen.getByText('当前结果')).toBeInTheDocument();
  });
});
