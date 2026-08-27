import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { createDemoBfnProject } from '../fixtures';
import { runBfnSimulation } from '../simulation';
import { BfnWorkspacePage } from './BfnWorkspacePage';
import { createBfnComputationSignature } from '../computationSignature';
import { createLocalStorageBfnWorkspaceRepository } from './localStorageWorkspaceRepository';
import { createWorkspaceProjectMetadata } from './workspaceProjectFactory';
import type { BfnWorkspaceRepository, BfnWorkspaceRunRecord } from './workspaceTypes';

const now = '2026-08-27T06:00:00.000Z';

function jsonFile(value: unknown, name: string): File {
  const raw = JSON.stringify(value);
  const file = new File([raw], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(raw) });
  return file;
}

describe('multi-project workspace UI', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
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
    expect(within(draft).getAllByText('0', { selector: 'dd' })).toHaveLength(2);
    expect(within(draft).getByText('1', { selector: 'dd' })).toBeInTheDocument();
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

  it('keeps autosave separate from versions and restores non-destructively with editor history reset', async () => {
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

    await user.click(
      within(screen.getByRole('dialog', { name: '项目中心' })).getByRole('button', {
        name: '关闭项目中心',
      }),
    );
    await user.click(screen.getByRole('button', { name: '稳态分析' }));
    await user.click(screen.getByRole('button', { name: 'Demo design' }));
    await user.click(screen.getByRole('button', { name: '保存当前版本' }));
    await user.click(screen.getByRole('button', { name: '保存版本' }));
    expect(await screen.findByText('版本 2')).toBeInTheDocument();

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
    const repository: BfnWorkspaceRepository = {
      ...base,
      saveDraft: vi.fn().mockRejectedValue(new Error('disk unavailable')),
    };
    render(<BfnWorkspacePage repository={repository} clock={() => now} />);
    await screen.findByRole('heading', { name: 'Project A' });

    await user.click(screen.getByRole('button', { name: '动态分析' }));
    await user.click(screen.getByRole('button', { name: 'Project A' }));
    await user.click(screen.getByRole('button', { name: /Project B.*2026/ }));

    expect(await screen.findByText('当前草稿未能落盘，因此没有切换项目。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project A', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '项目中心' })).toBeInTheDocument();
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
