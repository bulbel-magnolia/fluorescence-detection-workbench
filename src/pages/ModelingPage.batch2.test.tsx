import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { ModelingPage } from './ModelingPage';

describe('biological network design Batch 2 interactions', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('deletes and reconnects an edge directly, with undo and redo', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    const canvas = screen.getByRole('application', { name: '生物网络画布' });
    expect(within(canvas).getAllByRole('button', { name: '选择连接' })).toHaveLength(3);

    await user.click(within(canvas).getAllByRole('button', { name: '选择连接' })[1]!);
    await user.click(screen.getByRole('button', { name: '删除连接' }));
    expect(screen.queryByRole('dialog', { name: /删除这条连接/ })).not.toBeInTheDocument();
    expect(within(canvas).getAllByRole('button', { name: '选择连接' })).toHaveLength(2);

    const source = within(canvas).getByRole('button', {
      name: 'AHL 响应，输出端口：启动子活性',
    });
    const target = within(canvas).getByRole('button', {
      name: '报告表达，输入端口：启动子活性',
    });
    fireEvent.pointerDown(source, { button: 0, clientX: 460, clientY: 180 });
    expect(target).toHaveAttribute('data-connection-state', 'compatible');
    fireEvent.pointerEnter(target);
    fireEvent.pointerMove(window, { clientX: 560, clientY: 180 });
    fireEvent.pointerUp(target, { button: 0, clientX: 560, clientY: 180 });
    expect(within(canvas).getAllByRole('button', { name: '选择连接' })).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(within(canvas).getAllByRole('button', { name: '选择连接' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '重做' }));
    expect(within(canvas).getAllByRole('button', { name: '选择连接' })).toHaveLength(3);
  });

  it('undoes module add and direct Delete-key removal without confirmation', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('button', { name: '添加模块' }));
    const moduleDialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.click(within(moduleDialog).getByText('内置示例模块'));
    await user.click(within(moduleDialog).getAllByRole('button', { name: '添加到网络' })[2]!);
    expect(screen.getByRole('button', { name: '双输入响应, 功能模块' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.queryByRole('button', { name: '双输入响应, 功能模块' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重做' }));
    expect(screen.getByRole('button', { name: '双输入响应, 功能模块' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.queryByRole('dialog', { name: /移除模块/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '双输入响应, 功能模块' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByRole('button', { name: '双输入响应, 功能模块' })).toBeInTheDocument();
  });

  it('groups input drawer edits into one semantic undo and protects field shortcuts', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));
    expect(await screen.findByText('当前结果')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '设置输入' }));
    const dialog = screen.getByRole('dialog', { name: '设置输入' });
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: '输入方式' }),
      'fixed_value',
    );
    const value = within(dialog).getByRole('spinbutton', { name: '输入值' });
    await user.clear(value);
    await user.type(value, '12');
    fireEvent.keyDown(value, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(value, { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'AHL 响应, 功能模块' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: '关闭输入设置' }));

    expect(screen.getByText('网络或输入已修改')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.queryByText('网络或输入已修改')).not.toBeInTheDocument();
    expect(screen.getByText('当前结果')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重做' }));
    expect(screen.getByText('网络或输入已修改')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByText('当前结果')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '设置输入' }));
    expect(
      within(screen.getByRole('dialog', { name: '设置输入' })).getByRole('combobox', {
        name: '输入方式',
      }),
    ).toHaveValue('working_range');
  });

  it('records a full node drag as one layout step without staling results', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));
    expect(await screen.findByText('当前结果')).toBeInTheDocument();
    const node = screen.getByRole('button', { name: 'AHL 响应, 功能模块' });

    fireEvent.pointerDown(node, { button: 0, clientX: 320, clientY: 170 });
    fireEvent.pointerMove(window, { clientX: 350, clientY: 190 });
    fireEvent.pointerMove(window, { clientX: 380, clientY: 220 });
    fireEvent.pointerUp(window, { clientX: 380, clientY: 220 });
    expect(screen.queryByText('网络或输入已修改')).not.toBeInTheDocument();
    expect(screen.getByText('当前结果')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.queryByText('网络或输入已修改')).not.toBeInTheDocument();
    expect(screen.getByText('当前结果')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重做' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '重做' }));
    expect(screen.queryByText('网络或输入已修改')).not.toBeInTheDocument();
    expect(screen.getByText('当前结果')).toBeInTheDocument();
  });

  it('blocks Delete while the module drawer is open', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'AHL 响应, 功能模块' }));
    await user.click(screen.getByRole('button', { name: '添加模块' }));
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });

    fireEvent.keyDown(dialog, { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'AHL 响应, 功能模块' })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'AHL/HSL 文献目录' })).not.toBeInTheDocument();
  });

  it('blocks project undo and Delete while the input drawer is open', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: '动态分析' }));
    await user.click(screen.getByRole('button', { name: 'AHL 响应, 功能模块' }));
    await user.click(screen.getByRole('button', { name: '设置输入' }));
    const dialog = screen.getByRole('dialog', { name: '设置输入' });

    fireEvent.keyDown(dialog, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(dialog, { key: 'Delete' });
    expect(screen.getByRole('button', { name: '动态分析' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'AHL 响应, 功能模块' })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '设置输入' })).not.toBeInTheDocument();
  });

  it('blocks undo and redo behind a confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: '动态分析' }));
    await user.click(screen.getByRole('button', { name: '添加模块' }));
    const picker = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.click(within(picker).getByText('内置示例模块'));
    await user.click(within(picker).getAllByRole('button', { name: '添加到网络' })[2]!);
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.queryByRole('button', { name: '双输入响应, 功能模块' })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('更多操作'));
    await user.click(screen.getByRole('button', { name: '重置演示项目' }));
    const dialog = screen.getByRole('alertdialog', { name: '重置演示项目？' });
    fireEvent.keyDown(dialog, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(dialog, { key: 'y', ctrlKey: true });

    expect(screen.getByRole('button', { name: '动态分析' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: '双输入响应, 功能模块' })).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps exact connection as a collapsed fallback', () => {
    render(<ModelingPage />);
    const fallback = screen.getByText('精确连接').closest('details');
    expect(fallback).not.toBeNull();
    expect(fallback).not.toHaveAttribute('open');
  });
});
