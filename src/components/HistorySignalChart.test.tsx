import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import type { HistorySeries } from '../features/history/historyPresentation';
import { HistorySignalChart } from './HistorySignalChart';

const series: HistorySeries[] = [
  {
    id: 'channel1',
    labelKey: 'channels.channel1',
    color: '#00f5ff',
    points: [
      { elapsedMs: 0, sequence: 0, value: 10 },
      { elapsedMs: 500, sequence: 1, value: 20 },
      { elapsedMs: 1000, sequence: 2, value: 30 },
    ],
  },
  {
    id: 'channel2',
    labelKey: 'channels.channel2',
    color: '#ff4fa3',
    points: [
      { elapsedMs: 0, sequence: 0, value: 16 },
      { elapsedMs: 500, sequence: 1, value: 26 },
      { elapsedMs: 1000, sequence: 2, value: 36 },
    ],
  },
];

describe('HistorySignalChart', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('toggles individual channels without deleting their data', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <HistorySignalChart
        series={series}
        visibleIds={new Set(series.map((item) => item.id))}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByRole('button', { name: '通道 1' }));
    expect(onToggle).toHaveBeenCalledWith('channel1');
  });

  it('shows full-resolution nearest values on pointer hover', () => {
    render(
      <HistorySignalChart
        series={series}
        visibleIds={new Set(series.map((item) => item.id))}
        onToggle={() => undefined}
      />,
    );
    const chart = screen.getByRole('img', { name: '检测信号曲线' });
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 900,
      height: 330,
      right: 900,
      bottom: 330,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(chart, { clientX: 450, clientY: 100 });
    expect(screen.getByRole('status')).toHaveTextContent('0.5 s');
    expect(screen.getByRole('status')).toHaveTextContent('20.0 a.u.');
  });
});
