import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { HistoryRecord } from '../../domain/types';
import { createDemoHistoryRecord } from '../history/demoHistoryRecord';
import { DetectionModelingPicker } from './DetectionModelingPicker';

function demoRecord(): HistoryRecord {
  return createDemoHistoryRecord({
    recordId: 'demo-record',
    sampleId: 'DEMO-RECORD',
    now: '2026-08-03T00:00:00.000Z',
  });
}

describe('DetectionModelingPicker', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('confirms an explicitly mapped demo result as a reverse-design target', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <DetectionModelingPicker
        open
        mode="reverse-target"
        records={[demoRecord()]}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getAllByText('DEMO-RECORD')).toHaveLength(2);
    });
    const confirm = dialog.querySelector<HTMLButtonElement>('.button--primary');
    expect(confirm).not.toBeNull();
    expect(confirm).toBeEnabled();
    await user.click(confirm!);

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'reverse-target',
        recordId: 'demo-record',
        mappingStatus: 'normalized-demo',
      }),
    );
  });

  it('blocks records that have no approved mapping instead of normalizing them silently', async () => {
    const record: HistoryRecord = { ...demoRecord(), isDemo: false };
    render(
      <DetectionModelingPicker
        open
        mode="network-validation"
        networkId="known-network"
        records={[record]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    const confirm = dialog.querySelector<HTMLButtonElement>('.button--primary');
    expect(confirm).not.toBeNull();
    await waitFor(() => expect(confirm).toBeDisabled());
  });
});
