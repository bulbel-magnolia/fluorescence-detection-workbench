import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import '../i18n';
import type { Hc08dDiagnostics } from '../domain/types';
import { HardwareTechnicalDetails } from './HardwareTechnicalDetails';

const diagnostics: Hc08dDiagnostics = {
  serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
  notifyCharacteristicUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
  writeCharacteristicUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
  rssi: -52,
  latestFrameAt: '2026-07-24T10:00:00.500Z',
  recentRawLines: ['480:4428,515:13390,555:65535,CLR:65535'],
  candidates: [],
};

describe('hardware technical details', () => {
  it('keeps UUIDs and raw protocol text behind an expandable disclosure', async () => {
    const user = userEvent.setup();
    render(<HardwareTechnicalDetails diagnostics={diagnostics} />);

    const serviceUuid = screen.getByText(diagnostics.serviceUuid!);
    const rawLine = screen.getByText(diagnostics.recentRawLines[0]!);
    expect(serviceUuid).not.toBeVisible();
    expect(rawLine).not.toBeVisible();

    await user.click(screen.getByText('设备连接详情'));

    expect(serviceUuid).toBeVisible();
    expect(rawLine).toBeVisible();
  });
});
