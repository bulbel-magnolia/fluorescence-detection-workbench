import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TelemetryStrip } from './TelemetryStrip';

describe('TelemetryStrip', () => {
  it('announces live status and error values without making telemetry data live', () => {
    render(
      <TelemetryStrip
        label='设备遥测'
        items={[
          { label: '采集状态', value: '正在采集', tone: 'success' },
          { label: '设备错误', value: '无', tone: 'danger' },
          { label: '最新一组数据', value: '刚刚', tone: 'success' },
          { label: '数据点', value: '1234567890' },
        ]}
      />,
    );

    const liveStatus = screen.getByText('正在采集').closest('.telemetry-cell');
    const liveError = screen.getByText('无').closest('.telemetry-cell');
    const highFrequencyData = screen.getByText('刚刚').closest('.telemetry-cell');
    const dataCell = screen.getByText('1234567890').closest('.telemetry-cell');

    expect(liveStatus).toHaveAttribute('role', 'status');
    expect(liveStatus).toHaveAttribute('aria-live', 'polite');
    expect(liveError).toHaveAttribute('role', 'status');
    expect(liveError).toHaveAttribute('aria-live', 'polite');
    expect(highFrequencyData).not.toHaveAttribute('role');
    expect(highFrequencyData).not.toHaveAttribute('aria-live');
    expect(dataCell).not.toHaveAttribute('role');
    expect(dataCell).not.toHaveAttribute('aria-live');
    expect(dataCell).toHaveAttribute('title', '1234567890');
    expect(screen.getByText('1234567890')).toHaveAttribute('aria-label', '1234567890');
  });
});
