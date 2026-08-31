import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import { BfnOntologyContractError } from '../../modeling/ontology/v1/ontologyTypes';
import { createDemoBfnProject } from '../fixtures';
import {
  DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
  type BfnSemanticPresentationAdapter,
} from '../semantic/semanticPresentation';
import { buildBfnCatalogRuntimeCandidate } from './catalogBfnAdapter';
import { BfnCatalogDiscoveryDrawer } from './BfnCatalogDiscoveryDrawer';
import { bfnCatalogSignalDisplayName, buildBfnCatalogDiscoveryModel } from './catalogDiscovery';

describe('BFN catalog discovery drawer', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('opens as an accessible, focused, fully collapsed catalog', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const search = within(dialog).getByRole('searchbox', { name: '搜索文献目录' });

    expect(search).toHaveFocus();
    expect(
      within(dialog).getByText(
        '76个元件 · 52条受体响应 · 53条发送端证据 · 可运行受体 20 · 可运行发送端 0',
      ),
    ).toBeInTheDocument();
    const groups = dialog.querySelectorAll<HTMLButtonElement>('.bfn-catalog-group__trigger');
    expect(groups).toHaveLength(76);
    expect([...groups].every((group) => group.getAttribute('aria-expanded') === 'false')).toBe(
      true,
    );
    expect(within(dialog).getByRole('combobox', { name: '功能' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: '状态' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: '输入信号' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: '宿主' })).toBeInTheDocument();
  });

  it('renders the same four labeled filters in English', async () => {
    await i18n.changeLanguage('en-US');
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL Literature Catalog' });

    expect(within(dialog).getByRole('combobox', { name: 'Function' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Input signal' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Host' })).toBeInTheDocument();
  });

  it('auto-expands one matching component and prunes rows for a signal search', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.type(within(dialog).getByRole('searchbox', { name: '搜索文献目录' }), 'CinI SEVA');

    const groups = dialog.querySelectorAll<HTMLButtonElement>('.bfn-catalog-group__trigger');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAttribute('aria-expanded', 'true');
    expect(dialog.querySelectorAll('.bfn-catalog-sender-output-row').length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole('button', { name: '清除筛选' }));
    await user.type(within(dialog).getByRole('searchbox', { name: '搜索文献目录' }), '3OC6');
    const signalGroup = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-group__trigger');
    expect(signalGroup).not.toBeNull();
    if (!signalGroup) throw new Error('3OC6 search did not return a component group.');
    if (signalGroup.getAttribute('aria-expanded') !== 'true') await user.click(signalGroup);
    const responseRows = signalGroup
      .closest('.bfn-catalog-group')
      ?.querySelectorAll('.bfn-catalog-response-row');
    expect(responseRows).toBeDefined();
    if (!responseRows) throw new Error('3OC6 component did not expose response rows.');
    expect(responseRows.length).toBeGreaterThan(0);
    expect(
      [...responseRows].every((row) => row.textContent?.toLocaleLowerCase().includes('3oc6')),
    ).toBe(true);
  });

  it('filters components by stable functional-family ID and clears the new state with all filters', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const functionFilter = within(dialog).getByRole('combobox', { name: '功能' });
    const statusFilter = within(dialog).getByRole('combobox', { name: '状态' });
    const search = within(dialog).getByRole('searchbox', { name: '搜索文献目录' });

    expect(within(functionFilter).getByRole('option', { name: '信号响应' })).toHaveValue(
      'functional.signal_response',
    );
    expect(within(functionFilter).getByRole('option', { name: '信号产生' })).toHaveValue(
      'functional.signal_production',
    );

    await user.selectOptions(functionFilter, 'functional.signal_response');
    const receiverGroups = dialog.querySelectorAll<HTMLElement>('.bfn-catalog-group');
    expect(receiverGroups.length).toBeGreaterThan(0);
    expect([...receiverGroups].every((group) => group.dataset.role === 'receiver')).toBe(true);
    expect([...receiverGroups].every((group) => group.textContent?.includes('信号响应'))).toBe(
      true,
    );

    await user.selectOptions(functionFilter, 'functional.signal_production');
    const senderGroups = dialog.querySelectorAll<HTMLElement>('.bfn-catalog-group');
    expect(senderGroups.length).toBeGreaterThan(0);
    expect([...senderGroups].every((group) => group.dataset.role === 'sender')).toBe(true);
    expect([...senderGroups].every((group) => group.textContent?.includes('信号产生'))).toBe(true);

    await user.selectOptions(statusFilter, 'reference-only');
    await user.type(search, 'CinI');
    await user.click(within(dialog).getByRole('button', { name: '清除筛选' }));
    expect(functionFilter).toHaveValue('all');
    expect(statusFilter).toHaveValue('all');
    expect(search).toHaveValue('');
    expect(dialog.querySelectorAll('.bfn-catalog-group__trigger')).toHaveLength(76);
  });

  it('finds receiver and sender groups through localized semantic family names', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const search = within(dialog).getByRole('searchbox', { name: '搜索文献目录' });

    await user.type(search, '信号响应');
    const receivers = dialog.querySelectorAll<HTMLElement>('.bfn-catalog-group');
    expect(receivers.length).toBeGreaterThan(0);
    expect([...receivers].every((group) => group.dataset.role === 'receiver')).toBe(true);

    await user.clear(search);
    await user.type(search, 'AHL 合成系统');
    const senders = dialog.querySelectorAll<HTMLElement>('.bfn-catalog-group');
    expect(senders.length).toBeGreaterThan(0);
    expect([...senders].every((group) => group.dataset.role === 'sender')).toBe(true);
  });

  it('previews runnable and non-runnable responses without a literature add action', async () => {
    const user = userEvent.setup();
    const model = buildBfnCatalogDiscoveryModel(loadReleaseCatalogPresentation());
    const runnableGroup = model.groups.find((group) =>
      group.responses.some((entry) => entry.runnable),
    );
    const nonRunnableGroup = model.groups.find((group) =>
      group.responses.some((entry) => !entry.runnable),
    );
    if (!runnableGroup || !nonRunnableGroup)
      throw new Error('Release response fixtures are missing.');
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const search = within(dialog).getByRole('searchbox', { name: '搜索文献目录' });

    await user.type(search, runnableGroup.names.en);
    const runnableRow = dialog
      .querySelector<HTMLButtonElement>('.bfn-catalog-response-row [data-status="runnable-demo"]')
      ?.closest<HTMLButtonElement>('button');
    expect(runnableRow).not.toBeNull();
    if (!runnableRow) throw new Error('Runnable response row was not rendered.');
    runnableRow.focus();
    await user.keyboard('{Enter}');
    const runnablePreview = within(dialog).getByRole('region', { name: '目录条目预览' });
    expect(runnablePreview).toHaveTextContent('可运行（示例模型）');
    expect(runnablePreview).toHaveTextContent('功能类别信号响应');
    expect(runnablePreview).toHaveTextContent('生物元件类别AHL 接收/调控系统');
    expect(runnablePreview).toHaveTextContent('Hill 响应');
    expect(runnablePreview).toHaveTextContent('归一化报告响应');

    await user.click(within(dialog).getByRole('button', { name: '清除筛选' }));
    await user.type(search, nonRunnableGroup.names.en);
    const nonRunnableRow = dialog.querySelector<HTMLButtonElement>(
      '.bfn-catalog-response-row:not(:has([data-status="runnable-demo"]))',
    );
    expect(nonRunnableRow).not.toBeNull();
    if (!nonRunnableRow) throw new Error('Non-runnable response row was not rendered.');
    nonRunnableRow.focus();
    await user.keyboard(' ');
    const nonRunnablePreview = within(dialog).getByRole('region', { name: '目录条目预览' });
    expect(nonRunnablePreview).toHaveTextContent('功能类别信号响应');
    expect(nonRunnablePreview).toHaveTextContent('生物元件类别AHL 接收/调控系统');
    expect(nonRunnablePreview).not.toHaveTextContent('Hill 响应');
    expect(dialog.querySelector('.bfn-catalog-groups')).not.toHaveTextContent('添加到网络');
  });

  it.each([
    {
      language: 'zh-CN',
      lLabel: '3OC6-HSL（L）',
      unspecifiedLabel: '3OC6-HSL（立体构型未说明）',
    },
    {
      language: 'en-US',
      lLabel: '3OC6-HSL (L)',
      unspecifiedLabel: '3OC6-HSL (stereo unspecified)',
    },
  ])(
    'keeps shared-abbreviation filter options distinct in $language',
    async ({ language, lLabel, unspecifiedLabel }) => {
      await i18n.changeLanguage(language);
      renderDrawer();
      const dialog = screen.getByRole('dialog', {
        name: language === 'zh-CN' ? 'AHL/HSL 文献目录' : 'AHL/HSL Literature Catalog',
      });
      const signalFilter = within(dialog).getByRole('combobox', {
        name: language === 'zh-CN' ? '输入信号' : 'Input signal',
      });
      const lOption = within(signalFilter).getByRole('option', { name: lLabel });
      const unspecifiedOption = within(signalFilter).getByRole('option', {
        name: unspecifiedLabel,
      });

      expect(lOption).toHaveValue('ahl.3oc6.l');
      expect(unspecifiedOption).toHaveValue('ahl.3oc6.stereo-unspecified');
      expect(lOption.textContent).not.toBe(unspecifiedOption.textContent);
    },
  );

  it('preserves stereochemistry in response rows and the selected preview', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const signalFilter = within(dialog).getByRole('combobox', { name: '输入信号' });

    await user.selectOptions(signalFilter, 'ahl.3oc6.l');
    const lGroup = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-group__trigger');
    expect(lGroup).not.toBeNull();
    if (!lGroup) throw new Error('3OC6-HSL (L) did not return a component group.');
    await user.click(lGroup);
    const lRow = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-response-row');
    expect(lRow).not.toBeNull();
    expect(lRow).toHaveTextContent('3OC6-HSL（L） → 归一化报告响应');

    await user.selectOptions(signalFilter, 'ahl.3oc6.stereo-unspecified');
    const unspecifiedGroup = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-group__trigger');
    expect(unspecifiedGroup).not.toBeNull();
    if (!unspecifiedGroup)
      throw new Error('3OC6-HSL (stereo unspecified) did not return a component group.');
    if (unspecifiedGroup.getAttribute('aria-expanded') !== 'true')
      await user.click(unspecifiedGroup);
    const unspecifiedRow = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-response-row');
    expect(unspecifiedRow).not.toBeNull();
    if (!unspecifiedRow) throw new Error('Stereo-unspecified response row was not rendered.');
    expect(unspecifiedRow).toHaveTextContent('3OC6-HSL（立体构型未说明） → 归一化报告响应');
    expect(unspecifiedRow.textContent).not.toBe(lRow?.textContent);

    await user.click(unspecifiedRow);
    expect(within(dialog).getByRole('region', { name: '目录条目预览' })).toHaveTextContent(
      '3OC6-HSL（立体构型未说明） → 归一化报告响应',
    );
  });

  it('previews a Sender V1.2 evidence record without inventing semantics or a model', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.type(
      within(dialog).getByRole('searchbox', { name: '搜索文献目录' }),
      'AAA063 genomic CepI sender',
    );
    const senderRow = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-sender-output-row');
    expect(senderRow).not.toBeNull();
    if (!senderRow) throw new Error('Sender evidence entry was not rendered.');
    await user.click(senderRow);

    const preview = within(dialog).getByRole('region', { name: '目录条目预览' });
    expect(preview).toHaveTextContent('功能分类暂不可用');
    expect(preview).toHaveTextContent('端点浓度证据');
    expect(preview).toHaveTextContent('当前不可作为发送端运行');
    expect(preview).toHaveTextContent('证据可查不等于运行准入');
    expect(preview).not.toHaveTextContent('信号产生');
    expect(within(preview).queryByText('添加到网络')).not.toBeInTheDocument();
  });

  it('opens Full Detail in the same Drawer and restores discovery state and scroll', async () => {
    const user = userEvent.setup();
    const { group, response } = runnableFixture();
    const onClose = vi.fn();
    renderDrawer({ onClose });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const search = within(dialog).getByRole('searchbox', { name: '搜索文献目录' });
    const statusFilter = within(dialog).getByRole('combobox', { name: '状态' });
    const hostFilter = within(dialog).getByRole('combobox', { name: '宿主' });
    const body = dialog.querySelector<HTMLElement>('.bfn-catalog-discovery__body');
    if (!body) throw new Error('Catalog body was not rendered.');

    await user.selectOptions(statusFilter, 'runnable-demo');
    if (group.hostSpecies) await user.selectOptions(hostFilter, group.hostSpecies);
    await openResponsePreview(user, dialog, group, response.id);
    body.scrollTop = 173;
    await user.click(within(dialog).getByRole('button', { name: '查看完整详情' }));

    expect(dialog).toContainElement(within(dialog).getByLabelText(/完整详情/u));
    expect(within(dialog).queryByRole('searchbox')).not.toBeInTheDocument();
    expect(within(dialog).getByText('功能分类')).toBeInTheDocument();
    expect(within(dialog).getByText('功能类别')).toBeInTheDocument();
    expect(within(dialog).getByText('信号响应')).toBeInTheDocument();
    expect(within(dialog).getByText('生物元件类别')).toBeInTheDocument();
    expect(within(dialog).getByText('AHL 接收/调控系统')).toBeInTheDocument();
    expect(within(dialog).getByText('当前软件使用的响应模型')).toBeInTheDocument();
    expect(within(dialog).getByText('文献中的原始拟合参数')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(search).toHaveValue(group.names.en);
    expect(statusFilter).toHaveValue('runnable-demo');
    expect(hostFilter).toHaveValue(group.hostSpecies ?? 'all');
    await waitFor(() => expect(body.scrollTop).toBe(173));
    expect(within(dialog).getByRole('region', { name: '目录条目预览' })).toBeInTheDocument();
    expect(dialog.querySelector('.bfn-catalog-group__trigger')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('defaults to module plus source when no compatible input exists and forwards the choice', async () => {
    const user = userEvent.setup();
    const onInstantiate = vi.fn();
    const { group, response } = runnableFixture();
    renderDrawer({ onInstantiateCatalogResponse: onInstantiate });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    await openResponseDetail(user, dialog, group, response.id);

    expect(within(dialog).getByText(/当前网络还没有可以提供/u)).toBeInTheDocument();
    const moduleAndSource = within(dialog).getByRole('radio', {
      name: /添加模块并创建匹配输入源/u,
    });
    expect(moduleAndSource).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: '添加到网络' }));
    expect(onInstantiate).toHaveBeenCalledWith(response.id, true);
  });

  it('defaults to module only when compatible sources exist but allows creating another', async () => {
    const user = userEvent.setup();
    const onInstantiate = vi.fn();
    const { group, response } = runnableFixture();
    const candidate = buildBfnCatalogRuntimeCandidate(response.id);
    const project = createDemoBfnProject();
    const signalName = bfnCatalogSignalDisplayName(
      response.inputSignalNames,
      response.inputSignalAbbreviations,
      'zh-CN',
    );
    project.network.inputSources[0]!.outputPort = {
      id: 'existing-catalog-signal',
      displayName: {
        en: bfnCatalogSignalDisplayName(
          response.inputSignalNames,
          response.inputSignalAbbreviations,
          'en-US',
        ),
        zh: signalName,
      },
      entity: candidate.inputEntity,
      quantityType: 'concentration',
      unit: 'nM',
      direction: 'output',
    };
    project.network.inputSources[0]!.displayName = {
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
    };
    renderDrawer({ project, onInstantiateCatalogResponse: onInstantiate });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    await openResponseDetail(user, dialog, group, response.id);

    expect(within(dialog).getByText(/当前网络已经有 1 个/u)).toBeInTheDocument();
    expect(within(dialog).getAllByText(signalName).length).toBeGreaterThan(0);
    const compatibleSourceList = dialog.querySelector<HTMLElement>(
      '.bfn-catalog-instantiation__resolution ul',
    );
    if (!compatibleSourceList) throw new Error('Expected the compatible source list.');
    expect(within(compatibleSourceList).getByText(`${signalName} · nM`)).toBeInTheDocument();
    expect(within(compatibleSourceList).queryByText('输入源 · nM')).not.toBeInTheDocument();
    const moduleOnly = within(dialog).getByRole('radio', { name: /只添加响应模块/u });
    const moduleAndSource = within(dialog).getByRole('radio', {
      name: /添加模块并创建匹配输入源/u,
    });
    expect(moduleOnly).toBeChecked();
    await user.click(moduleAndSource);
    await user.click(within(dialog).getByRole('button', { name: '添加到网络' }));
    expect(onInstantiate).toHaveBeenCalledWith(response.id, true);
  });

  it('fails closed when Detail cannot rebuild a trusted runtime candidate', async () => {
    const user = userEvent.setup();
    const { group, response } = runnableFixture();
    renderDrawer({
      runtimeCandidateBuilder: () => {
        throw new Error('fresh trust failed');
      },
    });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    await openResponseDetail(user, dialog, group, response.id);

    expect(within(dialog).getByText('当前不可运行')).toBeInTheDocument();
    expect(within(dialog).queryByText('当前软件使用的响应模型')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '添加到网络' })).not.toBeInTheDocument();
  });

  it('opens an initial response target directly and returns to the default catalog list', async () => {
    const user = userEvent.setup();
    const { response } = runnableFixture();
    renderDrawer({
      initialDetailTarget: { kind: 'response', responseId: response.id },
    });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    expect(within(dialog).getByText(response.id)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '返回目录' })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('searchbox', { name: '搜索文献目录' }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '返回目录' }));
    expect(within(dialog).getByRole('searchbox', { name: '搜索文献目录' })).toBeInTheDocument();
    expect(dialog.querySelectorAll('.bfn-catalog-group__trigger')).toHaveLength(76);
  });

  it('deep-links to the exact Kylilis 3OC6 response instead of a sibling record', () => {
    renderDrawer({
      initialDetailTarget: {
        kind: 'response',
        responseId: 'resp.kylilis2018.rhl.3oc6',
      },
    });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const flow = dialog.querySelector('.bfn-catalog-detail__flow');

    expect(flow).toHaveTextContent('3OC6-HSL（L）');
    expect(flow).not.toHaveTextContent('C4-HSL');
    expect(within(dialog).getByText('resp.kylilis2018.rhl.3oc6')).toBeInTheDocument();
    expect(within(dialog).getByText('RhlR / pRhl')).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Escherichia coli/u).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/TOP10/u).length).toBeGreaterThan(0);
    expect(
      within(dialog).getByText(
        'Tools for engineering coordinated system behaviour in synthetic microbial consortia',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText('10.1038/s41467-018-05046-2').length).toBeGreaterThan(0);
  });

  it('deep-links to one exact Sender evidence record and keeps it view-only', () => {
    renderDrawer({
      initialDetailTarget: {
        kind: 'sender_output',
        senderOutputId: 'sout.vanaalst2025.aaa063.cepi.v1.c8hsl.v1',
      },
    });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    expect(within(dialog).getByLabelText(/发送端证据详情/u)).toBeInTheDocument();
    expect(within(dialog).getByText('当前不可作为发送端运行')).toBeInTheDocument();
    expect(within(dialog).getAllByText('端点浓度证据').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('原始证据点')).toBeInTheDocument();
    expect(
      within(dialog).getAllByText(
        'Engineering N-acyl-homoserine lactone-based quorum-sensing circuit for dynamic regulatory control in Saccharomyces cerevisiae',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(dialog).getAllByText('sout.vanaalst2025.aaa063.cepi.v1.c8hsl.v1').length,
    ).toBeGreaterThan(0);
    expect(
      within(dialog).queryByText('AAA111 CepI + strong SAM2/MET6 sender'),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '添加到网络' })).not.toBeInTheDocument();
  });

  it('keeps a canonical non-runnable response view-only', () => {
    const response = loadReleaseCatalogPresentation().responseVariants.find(
      (entry) => !entry.runnable,
    );
    if (!response) throw new Error('Release has no non-runnable response fixture.');
    renderDrawer({
      initialDetailTarget: { kind: 'response', responseId: response.id },
    });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    expect(within(dialog).getByText(response.id)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '返回目录' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '添加到网络' })).not.toBeInTheDocument();
  });

  it('isolates semantic resolution failure from Catalog browsing, Full Detail, and Add eligibility', () => {
    const throwingAdapter: BfnSemanticPresentationAdapter = {
      ...DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
      resolveCatalogComponent: () => {
        throw new BfnOntologyContractError('ontology-invalid');
      },
    };
    const listView = renderDrawer({ semanticAdapter: throwingAdapter });
    const listDialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    expect(listDialog.querySelectorAll('.bfn-catalog-group__trigger')).toHaveLength(76);
    expect(within(listDialog).queryByText('文献目录暂时无法加载。')).not.toBeInTheDocument();
    const functionFilter = within(listDialog).getByRole('combobox', { name: '功能' });
    expect(functionFilter).toBeDisabled();
    expect(functionFilter).toHaveTextContent('功能分类暂不可用');
    listView.unmount();

    const { response } = runnableFixture();
    renderDrawer({
      semanticAdapter: throwingAdapter,
      initialDetailTarget: { kind: 'response', responseId: response.id },
    });
    const detailDialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    expect(within(detailDialog).getByText('功能分类暂不可用')).toBeInTheDocument();
    expect(within(detailDialog).getByText('当前软件使用的响应模型')).toBeInTheDocument();
    expect(within(detailDialog).getByRole('button', { name: '添加到网络' })).toBeInTheDocument();
    expect(within(detailDialog).queryByText('文献记录暂不可用')).not.toBeInTheDocument();
  });

  it('contains an invalid deep-link failure inside the Drawer and can return to discovery', async () => {
    const user = userEvent.setup();
    renderDrawer({
      initialDetailTarget: {
        kind: 'response',
        responseId: 'resp.missing.invalid-target',
      },
    });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const error = within(dialog).getByRole('alert');

    expect(error).toHaveTextContent('文献记录暂不可用');
    expect(error).toHaveTextContent('当前记录无法完成来源核对。');
    expect(within(dialog).queryByRole('searchbox')).not.toBeInTheDocument();
    await user.click(within(error).getByRole('button', { name: '返回目录' }));
    expect(within(dialog).getByRole('searchbox', { name: '搜索文献目录' })).toBeInTheDocument();
  });

  it('keeps the three built-in demos in a secondary disclosure', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderDrawer({ onAddBuiltInModule: onAdd });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    const builtIn = dialog.querySelector('.bfn-built-in-modules');
    const body = dialog.querySelector('.bfn-catalog-discovery__body');
    expect(builtIn).not.toHaveAttribute('open');
    expect(body?.firstElementChild).toHaveClass('bfn-user-authoring-entry');
    expect(body?.firstElementChild?.nextElementSibling).toBe(builtIn);
    expect(builtIn?.nextElementSibling).toHaveClass('bfn-catalog-release-summary');
    await user.click(within(dialog).getByText('内置示例模块'));
    const reporter = within(dialog).getByRole('heading', { name: '报告表达' }).closest('article');
    if (!reporter) throw new Error('Built-in Reporter row was not rendered.');
    expect(reporter).toHaveTextContent('功能类别表达响应');
    expect(reporter).toHaveTextContent('数学模型线性响应');
    expect(reporter).toHaveTextContent('模型依据机制模型');
    const addButtons = within(dialog).getAllByRole('button', { name: '添加到网络' });
    expect(addButtons).toHaveLength(3);
    await user.click(addButtons[2]!);
    expect(onAdd).toHaveBeenCalledWith('dual-input-gate');
  });

  it('opens user-defined authoring from the Module Library without mutating the Project', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const snapshot = structuredClone(project);
    const onAddUserModule = vi.fn(() => ({ ok: false as const, issues: [] }));
    renderDrawer({ project, onAddUserModule });
    const catalog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    expect(within(catalog).getByText('自定义功能模块')).toBeInTheDocument();
    await user.click(within(catalog).getByRole('button', { name: '开始定义' }));
    const authoring = screen.getByRole('dialog', { name: '自定义功能模块' });
    expect(within(authoring).getByRole('form', { name: '自定义功能模块' })).toBeInTheDocument();
    expect(project).toEqual(snapshot);
    expect(onAddUserModule).not.toHaveBeenCalled();

    await user.click(within(authoring).getByRole('button', { name: '取消' }));
    expect(screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' })).toBeInTheDocument();
    expect(project).toEqual(snapshot);
  });

  it('keeps a built-in function category stable while the current mode changes its model label', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    renderDrawer({ project });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    await user.click(within(dialog).getByText('内置示例模块'));
    const sensor = within(dialog).getByRole('heading', { name: 'AHL 响应' }).closest('article');
    if (!sensor) throw new Error('Built-in AHL Sensor row was not rendered.');
    expect(sensor).toHaveTextContent('功能类别信号响应');
    expect(sensor).toHaveTextContent('数学模型一阶动态模型');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' }), {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('survives a catalog load failure while keeping built-in demos usable', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderDrawer({
      onAddBuiltInModule: onAdd,
      presentationLoader: () => {
        throw new Error('catalog unavailable');
      },
    });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('文献目录暂时无法加载。');
    expect(dialog.querySelector('.bfn-catalog-group')).not.toBeInTheDocument();

    await user.click(within(dialog).getByText('内置示例模块'));
    await user.click(within(dialog).getAllByRole('button', { name: '添加到网络' })[0]!);
    expect(onAdd).toHaveBeenCalledWith('ahl-sensor');
  });
});

function renderDrawer(
  overrides: Partial<React.ComponentProps<typeof BfnCatalogDiscoveryDrawer>> = {},
) {
  return render(
    <BfnCatalogDiscoveryDrawer
      project={createDemoBfnProject()}
      onClose={vi.fn()}
      onAddBuiltInModule={vi.fn()}
      onInstantiateCatalogResponse={vi.fn()}
      onAddUserModule={vi.fn(() => ({ ok: false as const, issues: [] }))}
      {...overrides}
    />,
  );
}

function runnableFixture() {
  const model = buildBfnCatalogDiscoveryModel(loadReleaseCatalogPresentation());
  const group = model.groups.find((entry) => entry.responses.some((response) => response.runnable));
  const response = group?.responses.find((entry) => entry.runnable);
  if (!group || !response) throw new Error('Release has no runnable response fixture.');
  return { group, response };
}

async function openResponsePreview(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  group: ReturnType<typeof runnableFixture>['group'],
  responseId: string,
) {
  const search = within(dialog).getByRole('searchbox', { name: '搜索文献目录' });
  await user.type(search, group.names.en);
  const responseIndex = group.responses.findIndex((entry) => entry.id === responseId);
  const rows = dialog.querySelectorAll<HTMLButtonElement>('.bfn-catalog-response-row');
  const row = rows.item(responseIndex);
  if (!row) throw new Error('Selected response row was not rendered.');
  await user.click(row);
}

async function openResponseDetail(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  group: ReturnType<typeof runnableFixture>['group'],
  responseId: string,
) {
  await openResponsePreview(user, dialog, group, responseId);
  await user.click(within(dialog).getByRole('button', { name: '查看完整详情' }));
}
