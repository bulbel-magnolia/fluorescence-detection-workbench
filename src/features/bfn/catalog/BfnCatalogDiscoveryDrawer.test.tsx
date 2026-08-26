import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import { createDemoBfnProject } from '../fixtures';
import { BfnCatalogDiscoveryDrawer } from './BfnCatalogDiscoveryDrawer';
import { buildBfnCatalogDiscoveryModel } from './catalogDiscovery';

describe('BFN catalog discovery drawer', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('opens as an accessible, focused, fully collapsed catalog', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const search = within(dialog).getByRole('searchbox', { name: '搜索文献目录' });

    expect(search).toHaveFocus();
    expect(within(dialog).getByText('42个元件 · 52条响应 · 20个可运行示例')).toBeInTheDocument();
    const groups = dialog.querySelectorAll<HTMLButtonElement>('.bfn-catalog-group__trigger');
    expect(groups).toHaveLength(42);
    expect([...groups].every((group) => group.getAttribute('aria-expanded') === 'false')).toBe(
      true,
    );
    expect(within(dialog).getByRole('combobox', { name: '状态' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: '输入信号' })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: '宿主' })).toBeInTheDocument();
  });

  it('auto-expands one matching component and prunes rows for a signal search', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.type(within(dialog).getByRole('searchbox', { name: '搜索文献目录' }), 'CinI SEVA');

    const groups = dialog.querySelectorAll<HTMLButtonElement>('.bfn-catalog-group__trigger');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByText('暂无定量发送函数')).toBeInTheDocument();

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
    expect(nonRunnablePreview).not.toHaveTextContent('Hill 响应');
    expect(dialog.querySelector('.bfn-catalog-groups')).not.toHaveTextContent('添加到网络');
  });

  it('previews a sender without inventing a response model', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.type(within(dialog).getByRole('searchbox', { name: '搜索文献目录' }), 'CinI SEVA');
    const senderRow = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-sender-row');
    expect(senderRow).not.toBeNull();
    if (!senderRow) throw new Error('Sender entry was not rendered.');
    await user.click(senderRow);

    const preview = within(dialog).getByRole('region', { name: '目录条目预览' });
    expect(preview).toHaveTextContent('发送元件');
    expect(preview).toHaveTextContent('暂无定量发送函数');
    expect(preview).toHaveTextContent('没有可独立计算输入→AHL 输出的发送函数');
    expect(within(preview).queryByText('模型')).not.toBeInTheDocument();
  });

  it('keeps the three built-in demos in a secondary disclosure', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderDrawer({ onAddBuiltInModule: onAdd });
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    expect(dialog.querySelector('.bfn-built-in-modules')).not.toHaveAttribute('open');
    await user.click(within(dialog).getByText('内置示例模块'));
    const addButtons = within(dialog).getAllByRole('button', { name: '添加到网络' });
    expect(addButtons).toHaveLength(3);
    await user.click(addButtons[2]!);
    expect(onAdd).toHaveBeenCalledWith('dual-input-gate');
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
      {...overrides}
    />,
  );
}
