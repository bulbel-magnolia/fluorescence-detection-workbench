import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import { compatibleBfnRuns, nearestBfnComparisonPoint } from './runComparison';
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
});
