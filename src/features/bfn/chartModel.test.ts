import { describe, expect, it } from 'vitest';
import { createBfnChartModel } from './chartModel';
import { defaultBfnChartViewState } from './chartTypes';
import { createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import type { BfnChartGeometry } from './chartTypes';

const geometry: BfnChartGeometry = {
  width: 640,
  height: 320,
  padding: { left: 64, right: 24, top: 24, bottom: 48 },
};

describe('createBfnChartModel', () => {
  it('resolves current labels, scales, ticks, paths, and exact cursor geometry', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-25T00:00:00.000Z');
    const viewState = { ...defaultBfnChartViewState(result), cursorIndex: 1 };
    const model = createBfnChartModel({
      project,
      result,
      viewState,
      geometry,
      translate: (key: string) => key,
    });

    expect(model.labels.x).toContain('3OC6-HSL');
    expect(model.labels.y).toContain('normalized_reporter_expression');
    expect(model.domains.x[0]).toBeLessThanOrEqual(result.points[0]?.coordinate ?? Number.POSITIVE_INFINITY);
    expect(model.domains.x[1]).toBeGreaterThanOrEqual(result.points.at(-1)?.coordinate ?? Number.NEGATIVE_INFINITY);
    expect(model.domains.y[0]).toBeLessThanOrEqual(result.points[0]?.lower ?? Number.POSITIVE_INFINITY);
    expect(model.domains.y[1]).toBeGreaterThanOrEqual(result.points.at(-1)?.upper ?? Number.NEGATIVE_INFINITY);
    expect(model.series.full?.path.startsWith('M ')).toBe(true);
    expect(model.series.uncertainty?.path.endsWith('Z')).toBe(true);
    expect(model.series.ann?.path.startsWith('M ')).toBe(true);
    expect(model.ticks.x.length).toBeGreaterThan(0);
    expect(model.ticks.y.length).toBeGreaterThan(0);
    expect(model.cursor?.index).toBe(1);
    expect(model.cursor?.coordinate).toBe(result.points[1]?.coordinate);
    expect(model.cursor?.x).toBeCloseTo(model.scales.x.map(model.cursor?.coordinate ?? Number.NaN));
    expect(model.cursor?.y).toBeCloseTo(model.scales.y.map(model.cursor?.value ?? Number.NaN));
  });

  it('uses dynamic time labels and keeps comparison as a full line only', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const result = runBfnSimulation(project, '2026-08-25T00:00:00.000Z');
    const comparison = runBfnSimulation(project, '2026-08-25T00:00:01.000Z');
    const model = createBfnChartModel({
      project,
      result,
      comparison: { result: comparison, label: 'prior run' },
      viewState: defaultBfnChartViewState(result),
      geometry,
      translate: (key: string) => key,
    });
    expect(model.labels.x).toContain('hour');
    expect(model.series.comparison?.path.startsWith('M ')).toBe(true);
    expect(model.series.comparison?.band).toBeUndefined();
    expect(model.series.comparison?.points[0]?.value).toBe(comparison.points[0]?.output);
  });
});
