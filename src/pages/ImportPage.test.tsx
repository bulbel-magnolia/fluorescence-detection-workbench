import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { createDemoHistoryRecord } from '../features/history/demoHistoryRecord';
import type { ImportPreview } from '../features/import/parseImport';
import { parseImportFile } from '../features/import/parseImport';
import { useAppStore } from '../store/appStore';
import { ImportPage } from './ImportPage';

vi.mock('../features/import/parseImport', () => ({
  parseImportFile: vi.fn(),
}));

const preview: ImportPreview = {
  fileName: 'import.json',
  format: 'json',
  rowCount: 9,
  channelCount: 3,
  result: createDemoHistoryRecord().result,
};

describe('ImportPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
    vi.mocked(parseImportFile).mockResolvedValue(preview);
  });

  it('does not show a saved state when persistence rejects the imported record', async () => {
    const user = userEvent.setup();
    const addImportedResult = vi.fn().mockResolvedValue(false);
    useAppStore.setState({ addImportedResult });
    const { container } = render(<ImportPage />);
    const file = new File(['{}'], 'import.json', { type: 'application/json' });
    const input = container.querySelector('input[type=file]');

    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/9 行数据/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '保存记录' }));

    expect(addImportedResult).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '记录已保存' })).not.toBeInTheDocument();
    expect(screen.getByText('文件检查未通过')).toBeInTheDocument();
  });
});
