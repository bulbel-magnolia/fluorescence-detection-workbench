import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
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
const translate = (key: string): string => i18n.getFixedT('en-US')(key);

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
      translate,
    });

    expect(model.labels.x).toContain('3OC6-HSL');
    expect(model.labels.y).toBe('Reporter signal (Relative value)');
    expect(model.labels.y).not.toContain('normalized_reporter_expression');
    expect(model.labels.y).not.toContain('dimensionless');
    expect(model.domains.x[0]).toBeLessThanOrEqual(
      result.points[0]?.coordinate ?? Number.POSITIVE_INFINITY,
    );
    expect(model.domains.x[1]).toBeGreaterThanOrEqual(
      result.points.at(-1)?.coordinate ?? Number.NEGATIVE_INFINITY,
    );
    expect(model.domains.y[0]).toBeLessThanOrEqual(
      result.points[0]?.lower ?? Number.POSITIVE_INFINITY,
    );
    expect(model.domains.y[1]).toBeGreaterThanOrEqual(
      result.points.at(-1)?.upper ?? Number.NEGATIVE_INFINITY,
    );
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
      translate,
    });
    expect(model.labels.x).toBe('Time (h)');
    expect(model.series.comparison?.path.startsWith('M ')).toBe(true);
    expect(model.series.comparison?.band).toBeUndefined();
    expect(model.series.comparison?.points[0]?.value).toBe(comparison.points[0]?.output);
  });

  it('keeps invalid log models constructible with a finite linear domain and explicit reasons', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-25T00:00:00.000Z');
    const yPoints = result.points.slice(0, 2).map((point, index) => ({
      ...point,
      output: index === 0 ? 1 : -1,
      lower: index === 0 ? 1 : -1,
      upper: index === 0 ? 1 : -1,
    }));
    const yResult = { ...result, points: yPoints };
    const yViewState = {
      ...defaultBfnChartViewState(yResult),
      yScale: 'log' as const,
      showUncertainty: false,
      showAnn: false,
    };
    expect(() =>
      createBfnChartModel({
        project,
        result: yResult,
        viewState: yViewState,
        geometry,
        translate,
      }),
    ).not.toThrow();
    const yModel = createBfnChartModel({
      project,
      result: yResult,
      viewState: yViewState,
      geometry,
      translate,
    });
    expect(yModel.domains.y[0]).toBeLessThanOrEqual(-1);
    expect(yModel.domains.y[1]).toBeGreaterThan(yModel.domains.y[0]);
    expect(yModel.domains.y[1]).toBeGreaterThanOrEqual(1);
    expect(yModel.validation.yLog).toMatchObject({
      valid: false,
      reason: 'non_positive_visible_value',
      axis: 'y',
    });

    const xResult = {
      ...result,
      points: result.points.slice(0, 2).map((point, index) => ({ ...point, coordinate: index })),
    };
    const xViewState = { ...defaultBfnChartViewState(xResult), xScale: 'log' as const };
    const xModel = createBfnChartModel({
      project,
      result: xResult,
      viewState: xViewState,
      geometry,
      translate,
    });
    expect(xModel.domains.x[0]).toBeLessThanOrEqual(0);
    expect(xModel.domains.x[1]).toBeGreaterThanOrEqual(1);
    expect(xModel.validation.xLog).toMatchObject({
      valid: false,
      reason: 'non_positive_visible_value',
      axis: 'x',
    });
  });

  it('reports nonfinite and invalid manual domains without applying them', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-25T00:00:00.000Z');
    const nonfiniteModel = createBfnChartModel({
      project,
      result,
      viewState: {
        ...defaultBfnChartViewState(result),
        xDomainMode: 'manual',
        xMinimum: Number.NaN,
        xMaximum: 1,
      },
      geometry,
      translate,
    });
    expect(nonfiniteModel.validation.xDomain).toEqual({
      valid: false,
      reason: 'domain_values_must_be_finite',
    });

    const infiniteModel = createBfnChartModel({
      project,
      result,
      viewState: {
        ...defaultBfnChartViewState(result),
        xDomainMode: 'manual',
        xMinimum: Number.NEGATIVE_INFINITY,
        xMaximum: Number.POSITIVE_INFINITY,
      },
      geometry,
      translate,
    });
    expect(infiniteModel.validation.xDomain).toEqual({
      valid: false,
      reason: 'domain_values_must_be_finite',
    });

    const invalidBoundsModel = createBfnChartModel({
      project,
      result,
      viewState: {
        ...defaultBfnChartViewState(result),
        yDomainMode: 'manual',
        yMinimum: 2,
        yMaximum: 1,
      },
      geometry,
      translate,
    });
    expect(invalidBoundsModel.validation.yDomain).toEqual({
      valid: false,
      reason: 'minimum_not_less_than_maximum',
    });
  });

  it('keeps historical snapshot semantics and uses explicit legacy fallbacks', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-25T00:00:00.000Z');
    const unresolvedProject = {
      ...project,
      network: {
        ...project.network,
        inputSources: [],
        outputMonitors: [],
      },
    };
    const snapshotModel = createBfnChartModel({
      project: unresolvedProject,
      result,
      viewState: defaultBfnChartViewState(result),
      geometry,
      translate,
    });
    expect(snapshotModel.labels.x).toBe('3OC6-HSL Concentration (nM)');
    expect(snapshotModel.labels.y).toBe('Reporter signal (Relative value)');

    const legacyResult = {
      ...result,
      primaryInputSourceId: 'historical-input-source',
      outputMonitorId: 'historical-output-monitor',
    };
    delete legacyResult.signalSnapshot;
    const legacyModel = createBfnChartModel({
      project: unresolvedProject,
      result: legacyResult,
      viewState: defaultBfnChartViewState(legacyResult),
      geometry,
      translate,
    });
    expect(legacyModel.labels.x).toBe('Unknown input · historical-input-source (Unknown unit)');
    expect(legacyModel.labels.y).toBe('Unknown output · historical-output-monitor (Unknown unit)');
  });

  it('keeps invalid-log paths and cursor geometry finite while exposing requested and applied scales', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-25T00:00:00.000Z');
    const approximation = result.annApproximation;
    if (!approximation) throw new Error('Expected demo result ANN approximation');
    const sourceId = result.primaryInputSourceId;
    const invalidResult = {
      ...result,
      points: result.points.slice(0, 2).map((point, index) => ({
        ...point,
        inputs: { [sourceId]: index === 0 ? 1 : -1 },
        output: index === 0 ? 1 : -1,
        lower: index === 0 ? 0.5 : -2,
        upper: index === 0 ? 2 : -0.5,
      })),
      annApproximation: {
        ...approximation,
        inputSourceIds: [sourceId],
        weights: [1],
        effectiveIntercept: 0,
      },
    };
    const model = createBfnChartModel({
      project,
      result: invalidResult,
      viewState: {
        ...defaultBfnChartViewState(invalidResult),
        yScale: 'log',
        cursorIndex: 1,
      },
      geometry,
      translate,
    });
    const paths = [model.series.full?.path, model.series.uncertainty?.path, model.series.ann?.path];
    expect(paths.every((path) => typeof path === 'string' && !/NaN|Infinity/.test(path))).toBe(
      true,
    );
    expect(model.domains.y[0]).toBeLessThanOrEqual(-2);
    expect(model.domains.y[1]).toBeGreaterThanOrEqual(2);
    expect(model.cursor).toBeDefined();
    expect(Number.isFinite(model.cursor?.x)).toBe(true);
    expect(Number.isFinite(model.cursor?.y)).toBe(true);
    expect(model.requestedScales.y).toBe('log');
    expect(model.scales.y.scale).toBe('linear');
    expect(model.validation.yLog).toMatchObject({
      valid: false,
      reason: 'non_positive_visible_value',
      axis: 'y',
    });
  });

  it('preserves source indices after manual X-domain filtering', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-25T00:00:00.000Z');
    const firstVisibleCoordinate = result.points[1]?.coordinate;
    const lastCoordinate = result.points.at(-1)?.coordinate;
    if (firstVisibleCoordinate === undefined || lastCoordinate === undefined)
      throw new Error('Expected demo points');
    const model = createBfnChartModel({
      project,
      result,
      viewState: {
        ...defaultBfnChartViewState(result),
        xDomainMode: 'manual',
        xMinimum: firstVisibleCoordinate,
        xMaximum: lastCoordinate,
      },
      geometry,
      translate,
    });
    expect(model.series.full?.points[0]?.index).toBe(1);
    expect(model.series.uncertainty?.points[0]?.index).toBe(1);
    expect(model.series.ann?.points[0]?.index).toBe(1);
  });

  it('renders narrow engineering log ticks and supports ANN- or comparison-only lines', () => {
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project);
    const result = {
      ...base,
      points: base.points.slice(0, 2).map((point, index) => ({
        ...point,
        coordinate: index === 0 ? 2 : 5,
        inputs: { ...point.inputs, [base.primaryInputSourceId]: index === 0 ? 2 : 5 },
      })),
    };
    const annOnly = createBfnChartModel({
      project,
      result,
      viewState: {
        ...defaultBfnChartViewState(result),
        xScale: 'log',
        xDomainMode: 'manual',
        xMinimum: 2,
        xMaximum: 5,
        showFullModel: false,
        showAnn: true,
      },
      geometry,
      translate,
    });
    expect(annOnly.ticks.x.map((tick) => tick.value)).toEqual([2, 5]);
    expect(annOnly.series.full).toBeUndefined();
    expect(annOnly.series.ann?.path).toMatch(/^M /);

    const comparisonOnly = createBfnChartModel({
      project,
      result: { ...result, annApproximation: null },
      comparison: { result: { ...result, id: 'comparison' }, label: 'Comparison' },
      viewState: {
        ...defaultBfnChartViewState({ ...result, annApproximation: null }),
        showFullModel: false,
        showAnn: false,
      },
      geometry,
      translate,
    });
    expect(comparisonOnly.series.full).toBeUndefined();
    expect(comparisonOnly.series.ann).toBeUndefined();
    expect(comparisonOnly.series.comparison?.path).toMatch(/^M /);
  });

  it('splits line and paired uncertainty paths across invalid sample gaps', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-25T00:00:00.000Z');
    const gapResult = {
      ...result,
      points: result.points.slice(0, 3).map((point, index) => ({
        ...point,
        coordinate: index + 1,
        output: index === 1 ? Number.NaN : index + 1,
        lower: index === 1 ? Number.NaN : index + 0.5,
        upper: index === 1 ? 2 : index + 1.5,
      })),
    };
    const model = createBfnChartModel({
      project,
      result: gapResult,
      viewState: { ...defaultBfnChartViewState(gapResult), showAnn: false },
      geometry,
      translate,
    });
    const fullPath = model.series.full?.path ?? '';
    expect((fullPath.match(/\bM\b/g) ?? []).length).toBe(2);
    expect((fullPath.match(/\bL\b/g) ?? []).length).toBe(0);
    const uncertaintyPath = model.series.uncertainty?.path ?? '';
    expect((uncertaintyPath.match(/\bM\b/g) ?? []).length).toBe(2);
    expect((uncertaintyPath.match(/\bZ\b/g) ?? []).length).toBe(2);
    expect(model.series.uncertainty?.points.map((point) => point.index)).toEqual([0, 2]);
  });

  it('reports unsorted or nonfinite source coordinates at the model boundary', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-25T00:00:00.000Z');
    const invalidCoordinatesResult = {
      ...result,
      points: result.points.slice(0, 3).map((point, index) => ({
        ...point,
        coordinate: index === 1 ? Number.NaN : index === 0 ? 2 : 1,
      })),
    };
    const model = createBfnChartModel({
      project,
      result: invalidCoordinatesResult,
      viewState: { ...defaultBfnChartViewState(invalidCoordinatesResult), showAnn: false },
      geometry,
      translate,
    });
    expect(model.coordinateValidation.result).toEqual({
      valid: false,
      reason: 'coordinates_must_be_finite_and_ascending',
    });
    expect(model.series.full?.path).not.toMatch(/NaN|Infinity/);
  });
});
