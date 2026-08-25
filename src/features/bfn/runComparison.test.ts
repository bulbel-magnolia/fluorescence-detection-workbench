import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import {
  compatibleBfnRuns,
  formatBfnComparisonTime,
  nearestBfnComparisonPoint,
  nearestBfnPointOnValidatedGrid,
} from './runComparison';
import { runBfnSimulation } from './simulation';

describe('BFN historical-run comparison', () => {
  it('keeps compatible runs in recency order while requiring all four identity fields', () => {
    const project = createDemoBfnProject();
    const current = {
      ...runBfnSimulation(project, '2026-08-26T10:00:00.000Z'),
      id: 'run-current',
    };
    const recent = { ...current, id: 'run-recent', completedAt: '2026-08-26T09:00:00.000Z' };
    const older = { ...current, id: 'run-older', completedAt: '2026-08-25T09:00:00.000Z' };
    const candidates = [
      current,
      recent,
      { ...current, id: 'wrong-network', networkId: 'network-other' },
      { ...current, id: 'wrong-mode', mode: 'dynamic' as const },
      { ...current, id: 'wrong-input', primaryInputSourceId: 'source-other' },
      { ...current, id: 'wrong-output', outputMonitorId: 'monitor-other' },
      older,
    ];

    expect(compatibleBfnRuns(current, candidates).map((run) => run.id)).toEqual([
      'run-recent',
      'run-older',
    ]);
  });

  it('selects the nearest real point on the historical run own coordinate grid', () => {
    const project = createDemoBfnProject();
    const history = runBfnSimulation(project, '2026-08-25T09:00:00.000Z');
    history.points = [
      { ...history.points[0]!, coordinate: 9.8, output: 0.41 },
      { ...history.points[1]!, coordinate: 10.4, output: 0.47 },
    ];

    const nearest = nearestBfnComparisonPoint(history, 10);

    expect(nearest).toMatchObject({ index: 0 });
    expect(nearest?.point.coordinate).toBe(9.8);
    expect(nearest?.point.output).toBe(0.41);
    expect(nearest?.point.coordinate).not.toBe(10);
  });

  it('formats a stable short 24-hour legend time without date, seconds, or day period', () => {
    for (const language of ['en-US', 'zh-CN']) {
      const formatted = formatBfnComparisonTime('2026-08-25T18:32:45', language);
      expect(formatted).toBe('18:32');
      expect(formatted).toMatch(/^\d{2}:\d{2}$/);
      expect(formatted).not.toMatch(/2026|25|45|AM|PM|上午|下午/i);
    }
  });

  it('uses the localized short fallback for repository-accepted invalid timestamps', () => {
    expect(formatBfnComparisonTime('not-a-timestamp', 'zh-CN', '未知')).toBe('未知');
    expect(formatBfnComparisonTime('not-a-timestamp', 'en-US', 'Unknown')).toBe('Unknown');
  });

  it('falls back to a safe locale when the active language tag is invalid', () => {
    expect(formatBfnComparisonTime('2026-08-25T18:32:45', 'invalid_locale', 'Unknown')).toBe(
      '18:32',
    );
  });

  it('reads a validated historical grid with logarithmic indexed access', () => {
    const project = createDemoBfnProject();
    const history = runBfnSimulation(project, '2026-08-25T09:00:00.000Z');
    const template = history.points[0];
    if (!template) throw new Error('Expected a simulation point');
    const points = Array.from({ length: 4096 }, (_, index) => ({
      ...template,
      coordinate: index,
      output: index / 4096,
    }));
    let indexedReads = 0;
    const measuredPoints = new Proxy(points, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) indexedReads += 1;
        const value: unknown = Reflect.get(target, property, receiver);
        return value;
      },
    });

    const nearest = nearestBfnPointOnValidatedGrid(measuredPoints, 2048.4);

    expect(nearest?.index).toBe(2048);
    expect(indexedReads).toBeLessThanOrEqual(32);
  });
});
