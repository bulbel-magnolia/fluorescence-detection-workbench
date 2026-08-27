import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBfnComputationSignature } from '../features/bfn/computationSignature';
import { BFN_PROJECT_STORAGE_KEY, parseBfnProject } from '../features/bfn/repository';
import i18n from '../i18n';
import { BfnPlatformPage as ModelingPage } from '../features/bfn/BfnPlatformPage';

describe('biological network design Batch 5.1 catalog isolation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('keeps discovery state ephemeral and leaves the current result fresh', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await waitFor(() => expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull());
    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));
    expect(await screen.findByText('当前结果')).toBeInTheDocument();

    const beforeJson = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
    if (!beforeJson) throw new Error('BFN project was not persisted.');
    const beforeSignature = createBfnComputationSignature(parseBfnProject(beforeJson));
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '添加模块' }));
    const dialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    const search = within(dialog).getByRole('searchbox', { name: '搜索文献目录' });
    await user.type(search, 'Kylilis');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: '状态' }),
      'runnable-demo',
    );
    const receiverGroup = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-group__trigger');
    expect(receiverGroup).not.toBeNull();
    if (!receiverGroup) throw new Error('Kylilis catalog group was not rendered.');
    if (receiverGroup.getAttribute('aria-expanded') !== 'true') await user.click(receiverGroup);
    const response = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-response-row');
    expect(response).not.toBeNull();
    if (!response) throw new Error('Runnable catalog response was not rendered.');
    await user.click(response);
    expect(within(dialog).getByRole('region', { name: '目录条目预览' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '清除筛选' }));
    await user.type(search, 'CinI SEVA');
    const sender = dialog.querySelector<HTMLButtonElement>('.bfn-catalog-sender-row');
    expect(sender).not.toBeNull();
    if (!sender) throw new Error('Sender catalog entry was not rendered.');
    await user.click(sender);
    expect(
      within(within(dialog).getByRole('region', { name: '目录条目预览' })).getByText(
        '暂无定量发送函数',
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(search, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(search, { key: 'y', ctrlKey: true });
    fireEvent.keyDown(search, { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'AHL 响应, 功能模块' })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'AHL/HSL 文献目录' })).not.toBeInTheDocument();

    await waitFor(() => expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(beforeJson));
    const afterJson = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
    if (!afterJson) throw new Error('BFN project disappeared after discovery.');
    expect(createBfnComputationSignature(parseBfnProject(afterJson))).toBe(beforeSignature);
    expect(screen.getByText('当前结果')).toBeInTheDocument();
    expect(screen.queryByText('网络或输入已修改')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
  });
});
