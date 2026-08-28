import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../i18n';
import { loadReleaseCatalogPresentation } from '../../../modeling/catalog/releaseCatalogPresentation';
import { runCatalogInverseDesign } from '../catalogInverseDesignEvaluation';
import {
  buildCatalogInverseSearchSpace,
  computeCommonTrustedRange,
} from '../catalogInverseDesignSpace';
import { BfnCatalogInverseWorkspace } from './BfnCatalogInverseWorkspace';

const L_3OC6_SIGNAL_ID = 'ahl.3oc6.l';

describe('catalog-backed inverse design workspace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('starts from an explicit blank target and builds options only once on mount', () => {
    const buildSearchSpace = vi.fn(buildCatalogInverseSearchSpace);
    render(<BfnCatalogInverseWorkspace buildSearchSpace={buildSearchSpace} />);

    expect(screen.getByRole('heading', { name: '设计目标' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '输入信号' })).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: '低点浓度' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: '高点浓度' })).toHaveValue(null);
    expect(screen.getByRole('button', { name: '查找匹配响应' })).toBeDisabled();
    expect(buildSearchSpace).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(
        /目录逆向设计|按目录检索响应方案|目录结果|响应核对|推荐方案|综合评分|宿主负载|遗传风险/u,
      ),
    ).not.toBeInTheDocument();
  });

  it('uses the common trusted range explicitly and evaluates only on Search', async () => {
    const user = userEvent.setup();
    const buildSearchSpace = vi.fn(buildCatalogInverseSearchSpace);
    render(<BfnCatalogInverseWorkspace buildSearchSpace={buildSearchSpace} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    expect(buildSearchSpace).toHaveBeenCalledTimes(1);
    expect(screen.getByText('共同可信范围')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    expect(screen.getByText(/可直接比较 \d+ \/ \d+ 条/u)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查找匹配响应' }));

    expect(buildSearchSpace).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('heading', { name: '满足全部目标' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '接近目标' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '当前不适用' })).toBeInTheDocument();
    expect(screen.getAllByText(/未满足 \d+ 项 ·/u).length).toBeGreaterThan(0);
    expect(screen.queryByText(/最佳|排名|综合评分|burden|noise/iu)).not.toBeInTheDocument();
  });

  it('gates Search from real-time target validation while warnings remain searchable', async () => {
    const user = userEvent.setup();
    render(<BfnCatalogInverseWorkspace />);
    const search = screen.getByRole('button', { name: '查找匹配响应' });

    expect(search).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    expect(search).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    expect(search).toBeEnabled();

    const low = screen.getByRole('spinbutton', { name: '低点浓度' });
    const high = screen.getByRole('spinbutton', { name: '高点浓度' });
    await user.clear(low);
    await user.type(low, '100');
    await user.clear(high);
    await user.type(high, '10');
    expect(screen.getByText('高点浓度必须大于低点浓度。')).toBeInTheDocument();
    expect(search).toBeDisabled();

    await user.clear(high);
    await user.type(high, '1000');
    expect(search).toBeEnabled();
    const lowResponse = screen.getByRole('spinbutton', { name: '低点响应上限' });
    await user.clear(lowResponse);
    await user.type(lowResponse, '1.1');
    expect(screen.getByText('低点响应上限需在 0 到 1 之间。')).toBeInTheDocument();
    expect(search).toBeDisabled();

    await user.clear(lowResponse);
    await user.type(lowResponse, '0.9');
    expect(screen.getByText('低点与高点响应分离较弱。')).toBeInTheDocument();
    expect(search).toBeEnabled();
  });

  it('supports a complete strain-only search and matches the frozen engine result', async () => {
    const user = userEvent.setup();
    const space = buildCatalogInverseSearchSpace();
    const commonRange = computeCommonTrustedRange(space, L_3OC6_SIGNAL_ID);
    if (commonRange === null) throw new Error('expected a common trusted range');
    const expected = runCatalogInverseDesign(space, {
      inputSignalId: L_3OC6_SIGNAL_ID,
      responseWindow: {
        lowConcentrationM: commonRange.minimum,
        lowResponseMaximum: 0.2,
        highConcentrationM: commonRange.maximum,
        highResponseMinimum: 0.8,
      },
      biologicalDirection: 'any',
      contextFilter: { hostStrain: 'TOP10' },
    });
    render(<BfnCatalogInverseWorkspace buildSearchSpace={() => space} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    await user.click(screen.getByText('高级条件'));
    const host = screen.getByRole('combobox', { name: '宿主' });
    const strain = screen.getByRole('combobox', { name: '菌株' });
    expect(host).toHaveValue('');
    expect(strain).toBeEnabled();
    expect(within(strain).getByRole('option', { name: 'DH5α' })).toBeInTheDocument();
    expect(within(strain).getByRole('option', { name: 'TOP10' })).toBeInTheDocument();
    await user.selectOptions(strain, 'TOP10');
    expect(host).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByRole('button', { name: '查找匹配响应' }));

    const expectedIds = [
      ...expected.matched,
      ...expected.nearMatches,
      ...expected.notApplicable,
    ].map((candidate) => candidate.responseId);
    expectedIds.push(
      ...expected.unavailableResponseIds.filter((responseId) => !expectedIds.includes(responseId)),
    );
    expect(
      Array.from(
        screen
          .getByTestId('catalog-inverse-workspace')
          .querySelectorAll<HTMLElement>('.bfn-inverse-result-row'),
      ).map((row) => row.dataset.responseId),
    ).toEqual(expectedIds);
  });

  it('preserves a valid strain across Host changes and clears it only when incompatible', async () => {
    const user = userEvent.setup();
    const base = buildCatalogInverseSearchSpace();
    const space = {
      ...base,
      contextOptions: [
        ...base.contextOptions,
        {
          signalId: L_3OC6_SIGNAL_ID,
          hostSpecies: 'Pseudomonas putida',
          hostStrain: 'KT2440',
          candidateCount: 1,
        },
      ],
    };
    render(<BfnCatalogInverseWorkspace buildSearchSpace={() => space} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    await user.click(screen.getByText('高级条件'));
    const host = screen.getByRole('combobox', { name: '宿主' });
    const strain = screen.getByRole('combobox', { name: '菌株' });
    await user.selectOptions(strain, 'DH5α');
    await user.selectOptions(host, 'Escherichia coli');
    expect(strain).toHaveValue('DH5α');
    await user.selectOptions(host, '');
    expect(strain).toHaveValue('DH5α');
    await user.selectOptions(host, 'Pseudomonas putida');
    expect(strain).toHaveValue('');
  });

  it('keeps old results visible, ignores display-only unit changes, and marks scientific edits stale', async () => {
    const user = userEvent.setup();
    render(<BfnCatalogInverseWorkspace />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByRole('button', { name: '查找匹配响应' }));
    expect(await screen.findByRole('heading', { name: '满足全部目标' })).toBeInTheDocument();

    const unit = screen.getByRole('combobox', { name: '浓度单位' });
    const nextUnit = (unit as HTMLSelectElement).value === 'µM' ? 'nM' : 'µM';
    await user.selectOptions(unit, nextUnit);
    expect(screen.queryByText('条件已修改')).not.toBeInTheDocument();

    const lowInput = screen.getByRole('spinbutton', { name: '低点浓度' });
    await user.clear(lowInput);
    await user.type(lowInput, '1');
    expect(screen.getByText('条件已修改')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '满足全部目标' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新搜索' })).toBeInTheDocument();
  });

  it('supports explicit candidate selection and a maximum of three manual comparisons', async () => {
    const user = userEvent.setup();
    render(<BfnCatalogInverseWorkspace />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByRole('button', { name: '查找匹配响应' }));
    const results = await screen.findByRole('region', { name: '匹配结果' });
    const eligibleRows = within(results)
      .getAllByRole('article')
      .filter((row) => within(row).queryByRole('checkbox', { name: '加入比较' }));
    expect(eligibleRows.length).toBeGreaterThanOrEqual(4);

    await user.click(within(eligibleRows[0]!).getByRole('button', { name: '查看候选详情' }));
    expect(screen.getByRole('img', { name: '候选响应曲线' })).toBeInTheDocument();
    await user.click(within(eligibleRows[0]!).getByRole('checkbox', { name: '加入比较' }));
    await user.click(within(eligibleRows[1]!).getByRole('checkbox', { name: '加入比较' }));
    await user.click(within(eligibleRows[2]!).getByRole('checkbox', { name: '加入比较' }));
    expect(
      within(results)
        .getAllByRole('checkbox', { name: '加入比较' })
        .filter((box) => (box as HTMLInputElement).checked),
    ).toHaveLength(3);
    expect(screen.getByText('对比 3 / 3')).toBeInTheDocument();
    expect(within(eligibleRows[3]!).getByRole('checkbox', { name: '加入比较' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: '对比' }));

    const comparisonChart = screen.getByRole('img', { name: '候选响应比较曲线' });
    expect(comparisonChart).toBeInTheDocument();
    expect(comparisonChart.querySelectorAll('.bfn-inverse-chart__curve')).toHaveLength(3);
    expect(comparisonChart.querySelectorAll('[data-constraint]')).toHaveLength(2);
    expect(screen.getByRole('table', { name: '候选参数比较' })).toBeInTheDocument();
    expect(
      screen.getByText('实验背景不同｜以下比较基于各文献记录的归一化响应。'),
    ).toBeInTheDocument();

    await user.click(within(eligibleRows[0]!).getByRole('checkbox', { name: '加入比较' }));
    expect(screen.getByText('对比 2 / 3')).toBeInTheDocument();
    expect(within(eligibleRows[3]!).getByRole('checkbox', { name: '加入比较' })).toBeEnabled();
  });

  it('opens literature evidence by canonical response ID from every result status', async () => {
    const user = userEvent.setup();
    const onOpenCatalogDetail = vi.fn();
    const baseSpace = buildCatalogInverseSearchSpace();
    const presentation = loadReleaseCatalogPresentation();
    const unavailableResponse = presentation.responseVariants.find(
      (response) =>
        response.inputMolecule.id === L_3OC6_SIGNAL_ID &&
        !response.runnable &&
        !baseSpace.candidates.some((candidate) => candidate.responseId === response.id),
    );
    if (!unavailableResponse) throw new Error('expected a canonical unavailable response');
    const space = {
      ...baseSpace,
      unavailableResponses: [
        ...baseSpace.unavailableResponses,
        { responseId: unavailableResponse.id, inputSignalId: L_3OC6_SIGNAL_ID },
      ],
      unavailableResponseIds: [...baseSpace.unavailableResponseIds, unavailableResponse.id],
    };

    render(
      <BfnCatalogInverseWorkspace
        buildSearchSpace={() => space}
        onOpenCatalogDetail={onOpenCatalogDetail}
      />,
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    await user.click(screen.getByText('高级条件'));
    await user.selectOptions(screen.getByRole('combobox', { name: '菌株' }), 'TOP10');
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByRole('button', { name: '查找匹配响应' }));
    const workspace = await screen.findByTestId('catalog-inverse-workspace');
    const resultRows = [...workspace.querySelectorAll<HTMLElement>('.bfn-inverse-result-row')];
    const unavailableRow = resultRows.find(
      (row) => row.dataset.responseId === unavailableResponse.id,
    );
    const responseRows = [
      resultRows.find((row) => row.dataset.status === 'matched'),
      resultRows.find((row) => row.dataset.status === 'near-match'),
      resultRows.find(
        (row) =>
          row.dataset.status === 'not-applicable' &&
          !row.textContent?.includes('当前无法完成可信校验'),
      ),
      unavailableRow,
    ];
    expect(responseRows.every((row) => row !== undefined)).toBe(true);

    for (const row of responseRows) {
      if (!row || !row.dataset.responseId) throw new Error('expected all inverse result fixtures');
      const group = row.closest('details');
      if (group && !group.open) await user.click(group.querySelector('summary')!);
      await user.click(within(row).getByRole('button', { name: '查看候选详情' }));
      await user.click(screen.getByRole('button', { name: /^文献与实验条件：/u }));
      expect(onOpenCatalogDetail).toHaveBeenLastCalledWith(row.dataset.responseId);
    }
    expect(onOpenCatalogDetail).toHaveBeenCalledTimes(4);
  });

  it('opens the evidence record belonging to the selected comparison column', async () => {
    const user = userEvent.setup();
    const onOpenCatalogDetail = vi.fn();
    render(<BfnCatalogInverseWorkspace onOpenCatalogDetail={onOpenCatalogDetail} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByRole('button', { name: '查找匹配响应' }));
    const results = await screen.findByRole('region', { name: '匹配结果' });
    const rows = within(results)
      .getAllByRole('article')
      .filter((row) => within(row).queryByRole('checkbox', { name: '加入比较' }))
      .slice(0, 2);
    const responseIds = rows.map((row) => row.dataset.responseId);
    expect(responseIds.every((responseId) => responseId !== undefined)).toBe(true);
    for (const row of rows) {
      await user.click(within(row).getByRole('checkbox', { name: '加入比较' }));
    }
    await user.click(screen.getByRole('tab', { name: '对比' }));

    const table = screen.getByRole('table', { name: '候选参数比较' });
    const evidenceButtons = within(table).getAllByRole('button', { name: /^文献：/u });
    expect(evidenceButtons).toHaveLength(2);
    expect(within(table).queryByRole('button', { name: '添加到网络' })).not.toBeInTheDocument();
    await user.click(evidenceButtons[1]!);
    expect(onOpenCatalogDetail).toHaveBeenCalledWith(responseIds[1]);
  });

  it('clears candidate inspection and manual comparison when a fresh search replaces results', async () => {
    const user = userEvent.setup();
    render(<BfnCatalogInverseWorkspace />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByRole('button', { name: '查找匹配响应' }));
    const results = await screen.findByRole('region', { name: '匹配结果' });
    const firstRow = within(results)
      .getAllByRole('article')
      .find((row) => within(row).queryByRole('checkbox', { name: '加入比较' }));
    expect(firstRow).toBeDefined();

    await user.click(within(firstRow!).getByRole('button', { name: '查看候选详情' }));
    await user.click(within(firstRow!).getByRole('checkbox', { name: '加入比较' }));
    expect(screen.getByRole('img', { name: '候选响应曲线' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查找匹配响应' }));

    expect(screen.getByText('未选择响应')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '候选响应曲线' })).not.toBeInTheDocument();
    const comparisonBoxes = within(screen.getByRole('region', { name: '匹配结果' })).getAllByRole(
      'checkbox',
      {
        name: '加入比较',
      },
    );
    expect(comparisonBoxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });

  it('does not render a response chart for a Not Applicable result', async () => {
    const user = userEvent.setup();
    render(<BfnCatalogInverseWorkspace />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), L_3OC6_SIGNAL_ID);
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByText('高级条件'));
    await user.selectOptions(screen.getByRole('combobox', { name: '菌株' }), 'TOP10');
    await user.click(screen.getByRole('button', { name: '查找匹配响应' }));
    const notApplicableHeading = await screen.findByRole('heading', { name: '当前不适用' });
    await user.click(notApplicableHeading.closest('summary')!);
    const group = notApplicableHeading.closest('details')!;
    const row = within(group).getAllByRole('article')[0]!;
    await user.click(within(row).getByRole('button', { name: '查看候选详情' }));

    expect(screen.getByText('没有可展示的数值曲线')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '候选响应曲线' })).not.toBeInTheDocument();
  });

  it('shows a controlled release failure and can retry without falling back to legacy design', async () => {
    const user = userEvent.setup();
    const buildSearchSpace = vi
      .fn<() => ReturnType<typeof buildCatalogInverseSearchSpace>>()
      .mockImplementationOnce(() => {
        throw new Error('release unavailable');
      })
      .mockImplementation(buildCatalogInverseSearchSpace);

    render(<BfnCatalogInverseWorkspace buildSearchSpace={buildSearchSpace} />);
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('文献模型暂不可用');
    expect(screen.queryByText(/生成候选方案|推荐方案/u)).not.toBeInTheDocument();

    await user.click(within(error).getByRole('button', { name: '重试' }));
    await waitFor(() => expect(buildSearchSpace).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('combobox', { name: '输入信号' })).toBeInTheDocument();
  });
});
