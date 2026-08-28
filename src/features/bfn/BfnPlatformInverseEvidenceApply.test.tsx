import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { BfnPlatformPage } from './BfnPlatformPage';
import { buildBfnCatalogRuntimeCandidate } from './catalog/catalogBfnAdapter';
import * as catalogInstantiation from './catalog/catalogInstantiation';
import { createDemoBfnProject } from './fixtures';
import {
  BFN_PROJECT_STORAGE_KEY,
  BFN_RUN_STORAGE_KEY,
  parseBfnProject,
  saveBfnProject,
} from './repository';
import { createBlankBfnProject } from './workspace/workspaceProjectFactory';
import type { BfnProject } from './types';

const L_3OC6_SIGNAL_ID = 'ahl.3oc6.l';
const KYLILIS_RESPONSE_ID = 'resp.kylilis2018.rhl.3oc6';

describe('BFN inverse evidence and explicit Catalog apply bridge', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the complete inverse session and project unchanged while browsing evidence', async () => {
    const user = userEvent.setup();
    const baseline = createBlankBfnProject({
      now: '2026-08-28T00:00:00.000Z',
      workspaceProjectId: 'workspace-browse',
      bfnProjectId: 'project-browse',
      networkId: 'network-browse',
    });
    const onProjectChange = vi.fn();
    const onCatalogOpen = vi.fn();
    render(
      <BfnPlatformPage
        project={baseline}
        runs={[]}
        onProjectChange={onProjectChange}
        onCatalogOpen={onCatalogOpen}
      />,
    );

    await searchInverseCatalog(user);
    const workspace = screen.getByTestId('catalog-inverse-workspace');
    const comparableRows = within(workspace)
      .getAllByRole('article')
      .filter((row) => within(row).queryByRole('checkbox', { name: '加入比较' }))
      .slice(0, 2);
    for (const row of comparableRows) {
      await user.click(within(row).getByRole('checkbox', { name: '加入比较' }));
    }
    const lowConcentration = screen.getByRole('spinbutton', { name: '低点浓度' });
    await user.clear(lowConcentration);
    await user.type(lowConcentration, '1');
    expect(screen.getByText('条件已修改')).toBeInTheDocument();

    const selectedRow = await openInverseEvidence(user, KYLILIS_RESPONSE_ID);
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    expect(screen.getByRole('tab', { name: '按目标设计' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(dialog).getByText(KYLILIS_RESPONSE_ID)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '返回目录' }));
    await user.click(within(dialog).getByRole('button', { name: '关闭添加模块' }));

    expect(onCatalogOpen).toHaveBeenCalledTimes(1);
    expect(onProjectChange).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: '低点浓度' })).toHaveValue(1);
    expect(screen.getByText('条件已修改')).toBeInTheDocument();
    expect(selectedRow).toHaveAttribute('data-selected', 'true');
    expect(
      within(screen.getByRole('region', { name: '匹配结果' }))
        .getAllByRole('checkbox', { name: '加入比较' })
        .filter((checkbox) => (checkbox as HTMLInputElement).checked),
    ).toHaveLength(2);
    expect(screen.getByText('对比 2 / 3')).toBeInTheDocument();
    expect(baseline).toEqual(
      createBlankBfnProject({
        now: '2026-08-28T00:00:00.000Z',
        workspaceProjectId: 'workspace-browse',
        bfnProjectId: 'project-browse',
        networkId: 'network-browse',
      }),
    );
  }, 20_000);

  it('adds a module and source to a blank project as one explicit edit without edges or runs', async () => {
    const user = userEvent.setup();
    const baseline = createBlankBfnProject({
      now: '2026-08-28T00:00:00.000Z',
      bfnProjectId: 'project-blank-apply',
      networkId: 'network-blank-apply',
    });
    saveBfnProject(baseline);
    render(<BfnPlatformPage />);

    await searchInverseCatalog(user);
    await openInverseEvidence(user, KYLILIS_RESPONSE_ID);
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    expect(within(dialog).getByRole('radio', { name: /添加模块并创建匹配输入源/u })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: '添加到网络' }));

    expect(screen.queryByRole('dialog', { name: 'AHL/HSL 文献目录' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '网络设计' })).toHaveAttribute('aria-selected', 'true');
    const added = await savedProjectWithModuleCount(1);
    expect(added.network.modules).toHaveLength(baseline.network.modules.length + 1);
    expect(added.network.inputSources).toHaveLength(baseline.network.inputSources.length + 1);
    expect(added.network.edges).toEqual(baseline.network.edges);
    expect(added.network.outputMonitors).toEqual(baseline.network.outputMonitors);
    const addedModel = added.network.modules[0]?.modelVariants[0];
    if (addedModel?.mode !== 'static') throw new Error('Expected a static Catalog model.');
    expect(addedModel.catalogReference).toMatchObject({
      responseId: KYLILIS_RESPONSE_ID,
    });
    expect(
      document.querySelector('.bfn-canvas-node--module[data-selected=true]'),
    ).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(BFN_RUN_STORAGE_KEY) ?? '[]')).toEqual([]);

    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(parseStoredProject()).toEqual(baseline));
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
  }, 20_000);

  it('defaults to module-only when the project already has a compatible source', async () => {
    const user = userEvent.setup();
    const baseline = projectWithCompatibleSource();
    saveBfnProject(baseline);
    render(<BfnPlatformPage />);

    await searchInverseCatalog(user);
    await openInverseEvidence(user, KYLILIS_RESPONSE_ID);
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    expect(within(dialog).getByRole('radio', { name: /只添加响应模块/u })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: '添加到网络' }));

    const added = await savedProjectWithModuleCount(1);
    expect(added.network.modules).toHaveLength(baseline.network.modules.length + 1);
    expect(added.network.inputSources).toEqual(baseline.network.inputSources);
    expect(added.network.edges).toEqual(baseline.network.edges);
  }, 20_000);

  it('fails closed when the Catalog state changes between Detail and Add', async () => {
    const user = userEvent.setup();
    const baseline = createBlankBfnProject({
      now: '2026-08-28T00:00:00.000Z',
      bfnProjectId: 'project-stale-catalog',
      networkId: 'network-stale-catalog',
    });
    saveBfnProject(baseline);
    render(<BfnPlatformPage />);

    await searchInverseCatalog(user);
    await openInverseEvidence(user, KYLILIS_RESPONSE_ID);
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    vi.spyOn(catalogInstantiation, 'instantiateBfnCatalogResponse').mockReturnValueOnce({
      ok: false,
      error: 'catalog-state-changed',
    });
    await user.click(within(dialog).getByRole('button', { name: '添加到网络' }));

    expect(screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' })).toBeInTheDocument();
    expect(
      screen.getByText('当前目录数据与网络状态已经变化，请重新选择该响应。'),
    ).toBeInTheDocument();
    expect(parseStoredProject()).toEqual(baseline);
    await user.click(within(dialog).getByRole('button', { name: '关闭添加模块' }));
    await user.click(screen.getByRole('tab', { name: '网络设计' }));
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    expect(JSON.parse(localStorage.getItem(BFN_RUN_STORAGE_KEY) ?? '[]')).toEqual([]);
  }, 20_000);
});

async function searchInverseCatalog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: '按目标设计' }));
  await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
  await user.click(screen.getByRole('button', { name: '使用此范围' }));
  await user.click(screen.getByRole('button', { name: '查找匹配响应' }));
  await screen.findByRole('region', { name: '匹配结果' });
}

async function openInverseEvidence(
  user: ReturnType<typeof userEvent.setup>,
  responseId: string,
): Promise<HTMLElement> {
  const workspace = screen.getByTestId('catalog-inverse-workspace');
  const row = [...workspace.querySelectorAll<HTMLElement>('.bfn-inverse-result-row')].find(
    (candidate) => candidate.dataset.responseId === responseId,
  );
  if (!row) throw new Error(`Inverse response row missing: ${responseId}`);
  const group = row.closest('details');
  if (group && !group.open) await user.click(group.querySelector('summary')!);
  await user.click(within(row).getByRole('button', { name: '查看候选详情' }));
  await user.click(screen.getByRole('button', { name: /^文献与实验条件：/u }));
  await screen.findByRole('dialog', { name: 'AHL/HSL 文献目录' });
  return row;
}

function projectWithCompatibleSource(): BfnProject {
  const project = createBlankBfnProject({
    now: '2026-08-28T00:00:00.000Z',
    bfnProjectId: 'project-compatible-source',
    networkId: 'network-compatible-source',
  });
  const candidate = buildBfnCatalogRuntimeCandidate(KYLILIS_RESPONSE_ID);
  const supportSource = structuredClone(createDemoBfnProject().network.inputSources[0]!);
  supportSource.id = 'compatible-3oc6-source';
  supportSource.displayName = { en: 'Existing 3OC6-HSL', zh: '现有 3OC6-HSL' };
  supportSource.outputPort = {
    ...supportSource.outputPort,
    id: 'compatible-3oc6-output',
    displayName: { en: '3OC6-HSL concentration', zh: '3OC6-HSL 浓度' },
    entity: candidate.inputEntity,
    quantityType: 'concentration',
    unit: 'nM',
    direction: 'output',
  };
  project.network.inputSources = [supportSource];
  return project;
}

async function savedProjectWithModuleCount(count: number): Promise<BfnProject> {
  await waitFor(() => expect(parseStoredProject().network.modules).toHaveLength(count), {
    timeout: 2500,
  });
  return parseStoredProject();
}

function parseStoredProject(): BfnProject {
  const raw = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
  if (!raw) throw new Error('Expected a saved BFN project.');
  return parseBfnProject(raw);
}
