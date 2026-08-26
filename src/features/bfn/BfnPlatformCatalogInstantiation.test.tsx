import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { BfnPlatformPage } from './BfnPlatformPage';
import {
  bfnCatalogSignalDisplayName,
  buildBfnCatalogDiscoveryModel,
} from './catalog/catalogDiscovery';
import { loadReleaseCatalogPresentation } from '../modeling/catalog/releaseCatalogPresentation';
import { createDemoBfnProject } from './fixtures';
import {
  BFN_PROJECT_STORAGE_KEY,
  BFN_RUN_STORAGE_KEY,
  parseBfnProject,
} from './repository';

describe('BFN Platform Catalog instantiation workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('adds one named source/module transaction, keeps topology manual, and round-trips Undo/Redo', async () => {
    const user = userEvent.setup();
    const baseline = createDemoBfnProject();
    const fixture = runnableFixture();
    render(<BfnPlatformPage />);

    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));
    expect(await screen.findByText('当前结果')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(BFN_RUN_STORAGE_KEY) ?? '[]')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '添加模块' }));
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.type(
      within(dialog).getByRole('searchbox', { name: '搜索文献目录' }),
      fixture.group.names.en,
    );
    const responseIndex = fixture.group.responses.findIndex(
      (entry) => entry.id === fixture.response.id,
    );
    const row = dialog.querySelectorAll<HTMLButtonElement>('.bfn-catalog-response-row').item(
      responseIndex,
    );
    if (!row) throw new Error('Runnable Catalog response row was not rendered.');
    await user.click(row);
    await user.click(within(dialog).getByRole('button', { name: '查看完整详情' }));
    await user.click(within(dialog).getByRole('button', { name: '添加到网络' }));

    expect(screen.queryByRole('dialog', { name: 'AHL/HSL 文献目录' })).not.toBeInTheDocument();
    expect(
      await screen.findByText('响应模块和输入源已加入网络。请在画布中建立连接。'),
    ).toBeInTheDocument();
    expect(screen.getByText('网络或输入已修改')).toBeInTheDocument();
    expect(screen.getAllByText(fixture.componentDisplayName.zh).length).toBeGreaterThanOrEqual(3);
    expect(
      screen.getByRole('button', {
        name: `${fixture.componentDisplayName.zh}, 功能模块`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `${fixture.signalDisplayName.zh}, 输入`,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByText('精确连接'));
    const exactSource = screen.getByRole('combobox', { name: '从' });
    const exactTarget = screen.getByRole('combobox', { name: '连接到' });
    expect(exactSource).toHaveTextContent(fixture.signalDisplayName.zh);
    expect(exactTarget).toHaveTextContent(fixture.componentDisplayName.zh);
    expect(exactTarget).toHaveTextContent(fixture.signalDisplayName.zh);

    const added = await savedProjectWithModuleCount(baseline.network.modules.length + 1);
    const addedCatalogModule = added.network.modules.find(
      (module) => module.displayName?.zh === fixture.componentDisplayName.zh,
    )!;
    const addedCatalogSource = added.network.inputSources.find(
      (source) => source.displayName?.zh === fixture.signalDisplayName.zh,
    )!;
    expect(added.network.edges).toEqual(baseline.network.edges);
    expect(added.network.outputMonitors).toEqual(baseline.network.outputMonitors);
    expect(JSON.parse(localStorage.getItem(BFN_RUN_STORAGE_KEY) ?? '[]')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.queryByText('网络或输入已修改')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: `${fixture.componentDisplayName.zh}, 功能模块`,
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重做' }));
    expect(await screen.findByText('网络或输入已修改')).toBeInTheDocument();
    const redone = await savedProjectWithModuleCount(baseline.network.modules.length + 1);
    expect(redone.network.modules.some((module) => module.id === addedCatalogModule.id)).toBe(true);
    expect(redone.network.inputSources.some((source) => source.id === addedCatalogSource.id)).toBe(
      true,
    );
    expect(redone.network.edges).toEqual(baseline.network.edges);
    expect(JSON.parse(localStorage.getItem(BFN_RUN_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  }, 15_000);
});

function runnableFixture() {
  const presentation = loadReleaseCatalogPresentation();
  const model = buildBfnCatalogDiscoveryModel(presentation);
  const group = model.groups.find((entry) => entry.responses.some((response) => response.runnable));
  const response = group?.responses.find((entry) => entry.runnable);
  const component = group
    ? presentation.components.find((entry) => entry.id === group.id)
    : undefined;
  if (!group || !response || !component) throw new Error('Runnable Catalog fixture is missing.');
  const functionalName = [component.regulatorOrEnzyme, component.promoter]
    .filter((value): value is string => Boolean(value))
    .join(' / ');
  return {
    group,
    response,
    componentDisplayName: {
      en: functionalName || component.names.en,
      zh: functionalName || component.names.zh,
    },
    signalDisplayName: {
      en: bfnCatalogSignalDisplayName(
        response.inputSignalNames,
        response.inputSignalAbbreviations,
        'en-US',
      ),
      zh: bfnCatalogSignalDisplayName(
        response.inputSignalNames,
        response.inputSignalAbbreviations,
        'zh-CN',
      ),
    },
  };
}

async function savedProjectWithModuleCount(count: number) {
  await waitFor(
    () => {
      const raw = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(parseBfnProject(raw!).network.modules).toHaveLength(count);
    },
    { timeout: 2500 },
  );
  return parseBfnProject(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)!);
}
