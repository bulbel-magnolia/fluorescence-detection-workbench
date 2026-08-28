import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../i18n';
import { buildCatalogInverseSearchSpace } from '../catalogInverseDesignSpace';
import { BfnCatalogInverseWorkspace } from './BfnCatalogInverseWorkspace';

describe('catalog-backed inverse design workspace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('starts from an explicit blank target and builds options only once on mount', () => {
    const buildSearchSpace = vi.fn(buildCatalogInverseSearchSpace);
    render(<BfnCatalogInverseWorkspace buildSearchSpace={buildSearchSpace} />);

    expect(screen.getByRole('heading', { name: '按目录检索响应方案' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '输入信号' })).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: '低点浓度' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: '高点浓度' })).toHaveValue(null);
    expect(buildSearchSpace).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/推荐方案|综合评分|宿主负载|遗传风险/u)).not.toBeInTheDocument();
  });

  it('uses the common trusted range explicitly and evaluates only on Search', async () => {
    const user = userEvent.setup();
    const buildSearchSpace = vi.fn(buildCatalogInverseSearchSpace);
    render(<BfnCatalogInverseWorkspace buildSearchSpace={buildSearchSpace} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), 'ahl.3oc6.l');
    expect(buildSearchSpace).toHaveBeenCalledTimes(1);
    expect(screen.getByText('共同可信区间')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    expect(screen.getByText(/可直接比较 \d+ \/ \d+ 条/u)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '搜索目录' }));

    expect(buildSearchSpace).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('heading', { name: '符合条件' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '接近条件' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '不适用' })).toBeInTheDocument();
    expect(screen.queryByText(/最佳|排名|综合评分|burden|noise/iu)).not.toBeInTheDocument();
  });

  it('keeps old results visible, ignores display-only unit changes, and marks scientific edits stale', async () => {
    const user = userEvent.setup();
    render(<BfnCatalogInverseWorkspace />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), 'ahl.3oc6.l');
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByRole('button', { name: '搜索目录' }));
    expect(await screen.findByRole('heading', { name: '符合条件' })).toBeInTheDocument();

    const unit = screen.getByRole('combobox', { name: '浓度单位' });
    const nextUnit = (unit as HTMLSelectElement).value === 'µM' ? 'nM' : 'µM';
    await user.selectOptions(unit, nextUnit);
    expect(screen.queryByText('条件已修改')).not.toBeInTheDocument();

    const lowInput = screen.getByRole('spinbutton', { name: '低点浓度' });
    await user.clear(lowInput);
    await user.type(lowInput, '1');
    expect(screen.getByText('条件已修改')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '符合条件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新搜索' })).toBeInTheDocument();
  });

  it('supports explicit candidate selection and a maximum of three manual comparisons', async () => {
    const user = userEvent.setup();
    render(<BfnCatalogInverseWorkspace />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), 'ahl.3oc6.l');
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByRole('button', { name: '搜索目录' }));
    const results = await screen.findByRole('region', { name: '候选响应' });
    const eligibleRows = within(results).getAllByRole('article').filter((row) =>
      within(row).queryByRole('checkbox', { name: '加入比较' }),
    );
    expect(eligibleRows.length).toBeGreaterThanOrEqual(4);

    await user.click(within(eligibleRows[0]!).getByRole('button', { name: '查看候选详情' }));
    expect(screen.getByRole('img', { name: '候选响应曲线' })).toBeInTheDocument();
    await user.click(within(eligibleRows[0]!).getByRole('checkbox', { name: '加入比较' }));
    await user.click(within(eligibleRows[1]!).getByRole('checkbox', { name: '加入比较' }));
    await user.click(within(eligibleRows[2]!).getByRole('checkbox', { name: '加入比较' }));
    expect(
      within(results).getAllByRole('checkbox', { name: '加入比较' }).filter((box) =>
        (box as HTMLInputElement).checked
      ),
    ).toHaveLength(3);
    expect(
      within(eligibleRows[3]!).getByRole('checkbox', { name: '加入比较' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: '比较视图' }));

    expect(screen.getByRole('img', { name: '候选响应比较曲线' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '候选参数比较' })).toBeInTheDocument();
  });

  it('clears candidate inspection and manual comparison when a fresh search replaces results', async () => {
    const user = userEvent.setup();
    render(<BfnCatalogInverseWorkspace />);

    await user.selectOptions(screen.getByRole('combobox', { name: '输入信号' }), 'ahl.3oc6.l');
    await user.click(screen.getByRole('button', { name: '使用此范围' }));
    await user.click(screen.getByRole('button', { name: '搜索目录' }));
    const results = await screen.findByRole('region', { name: '候选响应' });
    const firstRow = within(results)
      .getAllByRole('article')
      .find((row) => within(row).queryByRole('checkbox', { name: '加入比较' }));
    expect(firstRow).toBeDefined();

    await user.click(within(firstRow!).getByRole('button', { name: '查看候选详情' }));
    await user.click(within(firstRow!).getByRole('checkbox', { name: '加入比较' }));
    expect(screen.getByRole('img', { name: '候选响应曲线' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '搜索目录' }));

    expect(screen.getByText('尚未选择候选')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '候选响应曲线' })).not.toBeInTheDocument();
    const comparisonBoxes = within(
      screen.getByRole('region', { name: '候选响应' }),
    ).getAllByRole('checkbox', {
        name: '加入比较',
      });
    expect(comparisonBoxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
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
