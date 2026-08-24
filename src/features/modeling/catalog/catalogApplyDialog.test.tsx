import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { EvidenceCatalogDialog } from './EvidenceCatalogDialog';
import { loadEvidenceCatalog } from './catalogLoader';

const loaded = loadEvidenceCatalog();
if (loaded.status !== 'ready') throw new Error(loaded.message);

describe('catalog apply contract', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('applies a selected candidate for a newly created processing node', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <EvidenceCatalogDialog
        open
        index={loaded.index}
        triggerRef={createRef<HTMLButtonElement>()}
        onClose={vi.fn()}
        onApply={onApply}
        onAttachReference={vi.fn()}
        onDetach={vi.fn()}
      />,
    );

    const apply = screen.getByRole('button', { name: '应用到网络' });
    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ id: 'qs.cin' });
    expect(onApply.mock.calls[0]?.[1]).toMatchObject({
      targetNetworkRole: 'processing',
      applicationMode: 'calibration',
      allowed: true,
      parameterStatus: 'parameterizable-after-calibration',
    });
  });

  it('changes the role before applying a new output candidate', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <EvidenceCatalogDialog
        open
        index={loaded.index}
        triggerRef={createRef<HTMLButtonElement>()}
        onClose={vi.fn()}
        onApply={onApply}
        onAttachReference={vi.fn()}
        onDetach={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: '应用为网络角色' }), 'output');
    await user.type(screen.getByRole('searchbox', { name: '搜索文献元件库' }), 'output.sfgfp');
    await user.click(screen.getByRole('button', { name: /output\.sfgfp/i }));
    await user.click(screen.getByRole('button', { name: '应用到网络' }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'output.sfgfp' }),
      expect.objectContaining({ targetNetworkRole: 'output', allowed: true }),
    );
  });
});
