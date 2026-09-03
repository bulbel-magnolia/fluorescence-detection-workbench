import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { BfnPlatformPage } from './BfnPlatformPage';
import { createLocalStorageBfnModuleLibraryRepository } from './module-library';
import {
  captureStaticFixture,
  createBlankTemplateProject,
  createStaticTemplateProject,
} from './module-library/template/templateTestFixtures';
import type { BfnProject } from './types';

const TIME = '2026-09-03T11:00:00.000Z';

describe('BFN reusable module library workflow integration', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('shows Save to Module Library for a supported selected user module', () => {
    const project = createStaticTemplateProject();
    render(<BfnPlatformPage project={project} />);
    expect(screen.getByRole('button', { name: '保存到模块库' })).toBeEnabled();
    expect(
      screen.getByText('保存这份科学定义，可在其他项目复用，也可作为已有模块的后续版本。'),
    ).toBeVisible();
  });

  it('keeps saving disabled with a friendly reason for an unsupported dependency', () => {
    const project = createStaticTemplateProject();
    project.network.modules[0]!.modelVariants[0]!.sourceDatasetIds = ['dataset.external'];
    render(<BfnPlatformPage project={project} />);
    expect(screen.getByRole('button', { name: '保存到模块库' })).toBeDisabled();
    expect(screen.getByText('该模块依赖关联实验数据，当前不能随模块保存。')).toBeVisible();
  });

  it('opens save review from the Inspector and persists one new module', async () => {
    const user = userEvent.setup();
    const project = createStaticTemplateProject();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    render(
      <BfnPlatformPage
        project={project}
        moduleLibraryRepository={repository}
        moduleLibraryClock={() => TIME}
      />,
    );
    await user.click(screen.getByRole('button', { name: '保存到模块库' }));
    const dialog = screen.getByRole('dialog', { name: '保存到模块库' });
    expect(within(dialog).getByText('输入与输出')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: '保存为新模块' }));
    await waitFor(async () => expect(await repository.listTemplates()).toHaveLength(1));
  });

  it('places My Modules first in Add Module and opens its empty state', async () => {
    const user = userEvent.setup();
    const project = createBlankTemplateProject();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    render(<BfnPlatformPage project={project} moduleLibraryRepository={repository} />);
    await user.click(screen.getByRole('button', { name: '添加模块' }));
    const catalog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const entries = catalog.querySelectorAll('.bfn-user-authoring-entry');
    expect(entries[0]).toHaveTextContent('我的模块');
    await user.click(within(catalog).getByRole('button', { name: '打开我的模块' }));
    expect(screen.getByRole('dialog', { name: '我的模块' })).toBeVisible();
    expect(await screen.findByText('还没有已保存模块')).toBeVisible();
  });

  it('adds one independent copy without edges, sources, monitors, mode changes, or a run', async () => {
    const user = userEvent.setup();
    const repository = createLocalStorageBfnModuleLibraryRepository();
    const created = await repository.createTemplate({
      templateId: 'module.saved-response',
      name: 'Saved response',
      description: 'Reusable response',
      createdAt: TIME,
      note: null,
      initialPayload: captureStaticFixture(),
    });
    const project = createBlankTemplateProject('target.project');
    const onProjectChange = vi.fn<(nextProject: BfnProject) => void>();
    render(
      <BfnPlatformPage
        project={project}
        onProjectChange={onProjectChange}
        moduleLibraryRepository={repository}
        moduleLibraryClock={() => TIME}
      />,
    );
    await user.click(screen.getByRole('button', { name: '添加模块' }));
    const catalog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.click(within(catalog).getByRole('button', { name: '打开我的模块' }));
    await screen.findByRole('combobox', { name: '模块版本' });
    await user.click(screen.getByRole('button', { name: '添加到项目' }));

    expect(onProjectChange).toHaveBeenCalledTimes(1);
    const nextProject = onProjectChange.mock.calls[0]?.[0];
    if (!nextProject) throw new Error('Expected the added project copy.');
    expect(nextProject.network.modules).toHaveLength(1);
    expect(nextProject.network.edges).toEqual([]);
    expect(nextProject.network.inputSources).toEqual([]);
    expect(nextProject.network.outputMonitors).toEqual([]);
    expect(nextProject.network.mode).toBe('static');
    expect(localStorage.getItem('fluorescence-desktop.bfn.runs')).toBeNull();
    expect((await repository.getVersion(created.version.id))?.payload).toEqual(
      created.version.payload,
    );
  });
});
