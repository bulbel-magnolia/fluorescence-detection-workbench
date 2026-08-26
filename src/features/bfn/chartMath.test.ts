import { describe, expect, it } from 'vitest';
import {
  countVisibleBfnLineSeries,
  createScale,
  evaluateLogEligibility,
  filterPointsInDomain,
  linearNiceTicks,
  logMajorTicks,
  nearestPointIndex,
  resolveAutoDomain,
  validateManualDomain,
  validateChartCoordinates,
  visibleBfnPointIndices,
  visibleYValues,
} from './chartMath';
import type { BfnSimulationResult, BfnSimulationPoint } from './types';

function resultWithPoints(points: BfnSimulationPoint[]): BfnSimulationResult {
  return {
    id: 'result-test',
    engineVersion: 'BFN-SIM-2.0',
    networkId: 'network-test',
    mode: 'static',
    points,
    primaryInputSourceId: 'source-test',
    outputMonitorId: 'monitor-test',
    annApproximation: {
      id: 'ann-test',
      sourceNetworkId: 'network-test',
      workingDomain: { 'source-test': [1, 100] },
      inputSourceIds: ['source-test'],
      weights: [0.1],
      effectiveIntercept: 0.2,
      metrics: {
        r2: 0.99,
        nrmse: 0.01,
        maximumAbsoluteError: 0.1,
        predictionIntervalCoverage: 0.95,
      },
      thresholds: { minimumR2: 0.9, maximumNrmse: 0.1 },
      status: 'accepted',
      representation: 'ann_affine_approximation',
    },
    dynamicMetrics: null,
    validationIssues: [],
    modelVersions: ['test'],
    contextIds: ['context-test'],
    extrapolated: false,
    uncertaintyMethod: 'parameter_interval_envelope',
    completedAt: '2026-08-25T00:00:00.000Z',
    isDemo: true,
    experimentalValidity: 'not_validated',
  };
}

const visibility = { showFullModel: true, showUncertainty: true, showAnn: true };

describe('chart math', () => {
  it('maps and inverts linear and log10 scales', () => {
    const linear = createScale([0, 10], [20, 220], 'linear');
    expect(linear.map(5)).toBeCloseTo(120);
    expect(linear.invert(120)).toBeCloseTo(5);

    const logarithmic = createScale([1, 100], [0, 200], 'log');
    expect(logarithmic.map(10)).toBeCloseTo(100);
    expect(logarithmic.invert(100)).toBeCloseTo(10);
  });

  it('selects the nearest real point with binary search and no interpolation', () => {
    const points = [{ coordinate: 1 }, { coordinate: 4 }, { coordinate: 10 }];
    expect(nearestPointIndex(points, 7.8)).toBe(2);
    expect(nearestPointIndex(points, 2.5)).toBe(0);
    expect(nearestPointIndex(points, 4)).toBe(1);
  });

  it('returns the lowest original index for duplicate coordinates and ties', () => {
    const duplicatePoints = [
      { coordinate: 0 },
      { coordinate: 4 },
      { coordinate: 4 },
      { coordinate: 4 },
      { coordinate: 8 },
      { coordinate: 8 },
      { coordinate: 12 },
    ];
    expect(validateChartCoordinates(duplicatePoints)).toEqual({ valid: true });
    expect(nearestPointIndex(duplicatePoints, 4)).toBe(1);
    expect(nearestPointIndex(duplicatePoints, 6)).toBe(1);
  });

  it('rejects nonfinite nearest-point queries and coordinates', () => {
    expect(nearestPointIndex([{ coordinate: 1 }, { coordinate: 4 }], Number.NaN)).toBe(-1);
    expect(nearestPointIndex([{ coordinate: Number.NaN }], 1)).toBe(-1);
    expect(validateChartCoordinates([{ coordinate: Number.NaN }])).toEqual({
      valid: false,
      reason: 'coordinates_must_be_finite_and_ascending',
    });
    expect(validateChartCoordinates([{ coordinate: 2 }, { coordinate: 1 }])).toEqual({
      valid: false,
      reason: 'coordinates_must_be_finite_and_ascending',
    });
    expect(validateChartCoordinates([{ coordinate: 1 }, { coordinate: 4 }])).toEqual({
      valid: true,
    });
  }, 250);

  it('validates manual domains and positive log domains', () => {
    expect(validateManualDomain({ minimum: 2, maximum: 1 }, 'linear')).toEqual({
      valid: false,
      reason: 'minimum_not_less_than_maximum',
    });
    expect(validateManualDomain({ minimum: 0, maximum: 1 }, 'log')).toEqual({
      valid: false,
      reason: 'log_domain_requires_positive_values',
    });
    expect(validateManualDomain({ minimum: 1, maximum: 100 }, 'log')).toEqual({ valid: true });
  });

  it('produces useful linear ticks and engineering log ticks', () => {
    const linearTicks = linearNiceTicks([0.17, 0.93], 5);
    expect(linearTicks.length).toBeGreaterThanOrEqual(4);
    expect(linearTicks.length).toBeLessThanOrEqual(7);
    expect(linearTicks[0]).toBeLessThanOrEqual(0.17);
    expect(linearTicks.at(-1)).toBeGreaterThanOrEqual(0.93);

    expect(logMajorTicks([1, 1000])).toEqual([1, 10, 100, 1000]);
    expect(logMajorTicks([2, 5])).toEqual([2, 5]);
    expect(logMajorTicks([2, 50])).toEqual([2, 5, 10, 20, 50]);
    expect(logMajorTicks([0.2, 0.8])).toEqual([0.2, 0.5]);
    expect(logMajorTicks([0, 10])).toEqual([]);
    expect(logMajorTicks([-10, -1])).toEqual([]);
  });

  it('shares one finite inclusive point-visibility contract', () => {
    expect(
      visibleBfnPointIndices(
        [
          { coordinate: 1 },
          { coordinate: 2 },
          { coordinate: Number.NaN },
          { coordinate: 3 },
          { coordinate: 4 },
          { coordinate: Number.POSITIVE_INFINITY },
          { coordinate: 5 },
        ],
        [2, 4],
      ),
    ).toEqual([1, 3, 4]);
    expect(visibleBfnPointIndices([{ coordinate: 2 }], [4, 2])).toEqual([]);
  });

  it('counts only available visible line series', () => {
    expect(
      countVisibleBfnLineSeries(
        { showFullModel: true, showUncertainty: true, showAnn: false },
        { annAvailable: true, comparisonAvailable: false },
      ),
    ).toBe(1);
    expect(
      countVisibleBfnLineSeries(
        { showFullModel: false, showUncertainty: true, showAnn: true },
        { annAvailable: true, comparisonAvailable: false },
      ),
    ).toBe(1);
    expect(
      countVisibleBfnLineSeries(
        { showFullModel: false, showUncertainty: true, showAnn: true },
        { annAvailable: false, comparisonAvailable: false },
      ),
    ).toBe(0);
    expect(
      countVisibleBfnLineSeries(
        { showFullModel: false, showUncertainty: false, showAnn: false },
        { annAvailable: false, comparisonAvailable: true },
      ),
    ).toBe(1);
  });

  it('filters points by an active domain and keeps normalized linear output in 0-1', () => {
    const result = resultWithPoints([
      {
        coordinate: 1,
        inputs: { 'source-test': 1 },
        moduleOutputs: {},
        output: 0.2,
        lower: 0.1,
        upper: 0.3,
        extrapolated: false,
      },
      {
        coordinate: 10,
        inputs: { 'source-test': 10 },
        moduleOutputs: {},
        output: 0.8,
        lower: 0.7,
        upper: 0.9,
        extrapolated: false,
      },
    ]);
    expect(filterPointsInDomain(result.points, [2, 9])).toHaveLength(0);
    expect(
      resolveAutoDomain(
        visibleYValues(result, { showFullModel: true, showUncertainty: true, showAnn: false }),
        { scale: 'linear', normalized: true },
      ),
    ).toEqual([0, 1]);
  });

  it('expands linear domains for actual out-of-range values and includes visible ANN/comparison values', () => {
    const result = resultWithPoints([
      {
        coordinate: 1,
        inputs: { 'source-test': 1 },
        moduleOutputs: {},
        output: 0.2,
        lower: -0.1,
        upper: 0.4,
        extrapolated: false,
      },
      {
        coordinate: 10,
        inputs: { 'source-test': 10 },
        moduleOutputs: {},
        output: 1.8,
        lower: 1.5,
        upper: 2,
        extrapolated: false,
      },
    ]);
    const comparison = resultWithPoints([
      {
        coordinate: 1,
        inputs: { 'source-test': 1 },
        moduleOutputs: {},
        output: 4,
        lower: 4,
        upper: 4,
        extrapolated: false,
      },
    ]);
    const values = visibleYValues(result, visibility, { result: comparison, label: 'comparison' });
    expect(values.find((value) => Math.abs(value - 0.3) < 1e-9)).toBeDefined();
    expect(values).toContain(4);
    const domain = resolveAutoDomain(values, { scale: 'linear', normalized: true });
    expect(domain[0]).toBeLessThanOrEqual(-0.1);
    expect(domain[1]).toBeGreaterThanOrEqual(4);
  });

  it('allows a manual X domain to exclude non-positive points for log X', () => {
    const result = resultWithPoints([
      {
        coordinate: -1,
        inputs: { 'source-test': -1 },
        moduleOutputs: {},
        output: 0.2,
        lower: 0.1,
        upper: 0.3,
        extrapolated: false,
      },
      {
        coordinate: 0,
        inputs: { 'source-test': 0 },
        moduleOutputs: {},
        output: 0.3,
        lower: 0.2,
        upper: 0.4,
        extrapolated: false,
      },
      {
        coordinate: 10,
        inputs: { 'source-test': 10 },
        moduleOutputs: {},
        output: 0.8,
        lower: 0.7,
        upper: 0.9,
        extrapolated: false,
      },
    ]);
    expect(evaluateLogEligibility('x', [1, 20], result, visibility)).toEqual({ valid: true });
    expect(evaluateLogEligibility('x', [-2, 20], result, visibility)).toMatchObject({
      valid: false,
    });
  });

  it('does not let hidden uncertainty block a log Y axis', () => {
    const result = resultWithPoints([
      {
        coordinate: 1,
        inputs: { 'source-test': 1 },
        moduleOutputs: {},
        output: 10,
        lower: -1,
        upper: 20,
        extrapolated: false,
      },
      {
        coordinate: 2,
        inputs: { 'source-test': 2 },
        moduleOutputs: {},
        output: 20,
        lower: -2,
        upper: 30,
        extrapolated: false,
      },
    ]);
    expect(
      evaluateLogEligibility('y', [1, 2], result, {
        showFullModel: true,
        showUncertainty: false,
        showAnn: false,
      }),
    ).toEqual({ valid: true });
  });

  it('treats the visible comparison line as eligible when current Y series are hidden', () => {
    const result = resultWithPoints([
      {
        coordinate: 1,
        inputs: { 'source-test': 1 },
        moduleOutputs: {},
        output: 10,
        lower: 8,
        upper: 12,
        extrapolated: false,
      },
    ]);
    const comparison = resultWithPoints([
      {
        coordinate: 1,
        inputs: { 'source-test': 1 },
        moduleOutputs: {},
        output: 20,
        lower: 18,
        upper: 22,
        extrapolated: false,
      },
    ]);
    expect(
      evaluateLogEligibility(
        'y',
        [1, 2],
        result,
        { showFullModel: false, showUncertainty: false, showAnn: false },
        { result: comparison, label: 'prior run' },
      ),
    ).toEqual({ valid: true });
  });

  it('does not count an unavailable ANN as visible X data', () => {
    const result = {
      ...resultWithPoints([
        {
          coordinate: 1,
          inputs: { 'source-test': 1 },
          moduleOutputs: {},
          output: 10,
          lower: 8,
          upper: 12,
          extrapolated: false,
        },
      ]),
      annApproximation: null,
    };
    expect(
      evaluateLogEligibility('x', [1, 2], result, {
        showFullModel: false,
        showUncertainty: false,
        showAnn: true,
      }),
    ).toEqual({ valid: false, reason: 'no_visible_values', axis: 'x' });
  });

  it('rejects invalid auto-domain fallbacks for the requested scale', () => {
    expect(resolveAutoDomain([], { scale: 'log', fallback: [0, 1], detailed: true })).toEqual({
      valid: false,
      reason: 'log_domain_requires_positive_values',
    });
    expect(resolveAutoDomain([], { scale: 'linear', fallback: [2, 1], detailed: true })).toEqual({
      valid: false,
      reason: 'minimum_not_less_than_maximum',
    });
    expect(
      resolveAutoDomain([], {
        scale: 'linear',
        fallback: [Number.NEGATIVE_INFINITY, 1],
        detailed: true,
      }),
    ).toEqual({
      valid: false,
      reason: 'domain_values_must_be_finite',
    });
  });

  it('rejects visible negative uncertainty and ANN values without transforming them', () => {
    const negativeUncertainty = resultWithPoints([
      {
        coordinate: 1,
        inputs: { 'source-test': 1 },
        moduleOutputs: {},
        output: 10,
        lower: -1,
        upper: 20,
        extrapolated: false,
      },
    ]);
    expect(
      visibleYValues(negativeUncertainty, {
        showFullModel: false,
        showUncertainty: true,
        showAnn: false,
      }),
    ).toContain(-1);
    expect(
      evaluateLogEligibility('y', [1, 2], negativeUncertainty, {
        showFullModel: false,
        showUncertainty: true,
        showAnn: false,
      }),
    ).toEqual({ valid: false, reason: 'non_positive_visible_value', axis: 'y', value: -1 });

    const negativeAnn = resultWithPoints([
      {
        coordinate: 1,
        inputs: { 'source-test': -10 },
        moduleOutputs: {},
        output: 10,
        lower: 8,
        upper: 12,
        extrapolated: false,
      },
    ]);
    const annEligibility = evaluateLogEligibility('y', [1, 2], negativeAnn, {
      showFullModel: false,
      showUncertainty: false,
      showAnn: true,
    });
    expect(annEligibility.valid).toBe(false);
    if (!annEligibility.valid) {
      expect(annEligibility.reason).toBe('non_positive_visible_value');
      expect(annEligibility.value).toBeCloseTo(-0.8);
    }
  });
});
