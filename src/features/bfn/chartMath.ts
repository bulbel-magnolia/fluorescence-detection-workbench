import type { BfnSimulationPoint, BfnSimulationResult } from './types';
import type {
  BfnChartAxis,
  BfnChartComparison,
  BfnChartCoordinateValidation,
  BfnChartDomain,
  BfnChartDomainObject,
  BfnChartDomainResolution,
  BfnChartScale,
  BfnChartScaleFunctions,
  BfnChartValidationResult,
  BfnChartVisibility,
} from './chartTypes';

export type ChartCoordinate = Pick<BfnSimulationPoint, 'coordinate'>;

export type ChartDomainInput = BfnChartDomainObject | BfnChartDomain;

export interface BfnAutoDomainOptions {
  scale?: BfnChartScale;
  normalized?: boolean;
  includeZero?: boolean;
  padding?: number;
  fallback?: BfnChartDomain;
  detailed?: boolean;
}

export interface BfnScale {
  map(value: number): number;
  invert(value: number): number;
}

function domainValues(domain: ChartDomainInput): [number, number] {
  if ('minimum' in domain) return [domain.minimum, domain.maximum];
  return [domain[0] ?? Number.NaN, domain[1] ?? Number.NaN];
}

function finiteValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function visibilityFlag(
  visibility: BfnChartVisibility | undefined,
  kind: 'full' | 'uncertainty' | 'ann',
): boolean {
  if (!visibility) return kind === 'full';
  if (kind === 'full') return visibility.showFullModel ?? visibility.full ?? true;
  if (kind === 'uncertainty') return visibility.showUncertainty ?? visibility.uncertainty ?? false;
  return visibility.showAnn ?? visibility.ann ?? false;
}

function annValue(result: BfnSimulationResult, point: BfnSimulationPoint): number | null {
  const approximation = result.annApproximation;
  if (!approximation) return null;
  return approximation.inputSourceIds.reduce(
    (sum, sourceId, index) =>
      sum + (point.inputs[sourceId] ?? 0) * (approximation.weights[index] ?? 0),
    approximation.effectiveIntercept,
  );
}

function valuesForPoint(
  result: BfnSimulationResult,
  point: BfnSimulationPoint,
  visibility: BfnChartVisibility | undefined,
): number[] {
  const values: number[] = [];
  if (visibilityFlag(visibility, 'full')) values.push(point.output);
  if (visibilityFlag(visibility, 'uncertainty')) values.push(point.lower, point.upper);
  if (visibilityFlag(visibility, 'ann')) {
    const value = annValue(result, point);
    if (value !== null) values.push(value);
  }
  return values;
}

/** Create a reversible linear or base-10 logarithmic scale. */
export function createScale(
  domain: BfnChartDomain,
  range: BfnChartDomain,
  scale: BfnChartScale,
): BfnChartScaleFunctions {
  const [domainMinimum, domainMaximum] = domain;
  const [rangeMinimum, rangeMaximum] = range;
  if (
    !Number.isFinite(domainMinimum) ||
    !Number.isFinite(domainMaximum) ||
    !Number.isFinite(rangeMinimum) ||
    !Number.isFinite(rangeMaximum) ||
    domainMinimum >= domainMaximum ||
    rangeMinimum === rangeMaximum
  ) {
    throw new RangeError('INVALID_CHART_SCALE_DOMAIN');
  }
  if (scale === 'log' && (domainMinimum <= 0 || domainMaximum <= 0)) {
    throw new RangeError('LOG_SCALE_DOMAIN_REQUIRES_POSITIVE_VALUES');
  }
  const transform = (value: number): number => (scale === 'log' ? Math.log10(value) : value);
  const inverse = (value: number): number => (scale === 'log' ? 10 ** value : value);
  const transformedMinimum = transform(domainMinimum);
  const transformedMaximum = transform(domainMaximum);
  const span = transformedMaximum - transformedMinimum;
  const rangeSpan = rangeMaximum - rangeMinimum;
  return {
    domain,
    range,
    scale,
    map(value: number): number {
      return rangeMinimum + ((transform(value) - transformedMinimum) / span) * rangeSpan;
    },
    invert(value: number): number {
      return inverse(transformedMinimum + ((value - rangeMinimum) / rangeSpan) * span);
    },
  };
}

export function validateChartCoordinates(
  points: readonly ChartCoordinate[],
): BfnChartCoordinateValidation {
  let previous = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (!Number.isFinite(point.coordinate) || point.coordinate < previous) {
      return { valid: false, reason: 'coordinates_must_be_finite_and_ascending' };
    }
    previous = point.coordinate;
  }
  return { valid: true };
}

/**
 * Return the nearest existing point. Exact duplicates and distance ties resolve
 * to the lowest original index. Callers must pass a finite ascending sequence
 * validated by validateChartCoordinates.
 */
export function nearestPointIndex(
  points: readonly ChartCoordinate[],
  coordinate: number,
): number {
  if (!Number.isFinite(coordinate) || points.length === 0) return -1;
  const lowerBound = (target: number): number => {
    let low = 0;
    let high = points.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const pointCoordinate = points[middle]?.coordinate;
      if (pointCoordinate === undefined || !Number.isFinite(pointCoordinate)) return -1;
      if (pointCoordinate < target) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const insertion = lowerBound(coordinate);
  if (insertion < 0) return -1;
  if (insertion < points.length && points[insertion]?.coordinate === coordinate) return insertion;
  if (insertion <= 0) return 0;
  if (insertion >= points.length) return points.length - 1;
  const leftIndex = insertion - 1;
  const leftCoordinate = points[leftIndex]?.coordinate;
  const rightCoordinate = points[insertion]?.coordinate;
  if (leftCoordinate === undefined || rightCoordinate === undefined) return -1;
  const leftDistance = coordinate - leftCoordinate;
  const rightDistance = rightCoordinate - coordinate;
  if (leftDistance < rightDistance) return lowerBound(leftCoordinate);
  if (rightDistance < leftDistance) return insertion;
  return lowerBound(leftCoordinate);
}

export function validateManualDomain(
  domain: ChartDomainInput,
  scale: BfnChartScale,
): BfnChartValidationResult {
  const [minimum, maximum] = domainValues(domain);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    return { valid: false, reason: 'domain_values_must_be_finite' };
  }
  if (minimum >= maximum) {
    return { valid: false, reason: 'minimum_not_less_than_maximum' };
  }
  if (scale === 'log' && (minimum <= 0 || maximum <= 0)) {
    return { valid: false, reason: 'log_domain_requires_positive_values' };
  }
  return { valid: true };
}

function niceStep(span: number, targetCount: number): number {
  const raw = span / Math.max(4, Math.min(7, targetCount));
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const multiplier = normalized >= 5 ? 5 : normalized >= 2.5 ? 2.5 : normalized >= 2 ? 2 : 1;
  return multiplier * magnitude;
}

export function linearNiceTicks(
  domain: BfnChartDomain,
  targetCount = 5,
): readonly number[] {
  const [minimum, maximum] = domain;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) return [];
  if (minimum === maximum) return [minimum];
  let step = niceStep(maximum - minimum, targetCount);
  let start = Math.floor(minimum / step) * step;
  let end = Math.ceil(maximum / step) * step;
  let count = Math.round((end - start) / step) + 1;
  while (count > 7) {
    step *= 2;
    start = Math.floor(minimum / step) * step;
    end = Math.ceil(maximum / step) * step;
    count = Math.round((end - start) / step) + 1;
  }
  while (count < 4) {
    step /= 2;
    start = Math.floor(minimum / step) * step;
    end = Math.ceil(maximum / step) * step;
    count = Math.round((end - start) / step) + 1;
    if (count > 12) break;
  }
  const ticks: number[] = [];
  for (let value = start, index = 0; value <= end + step * 1e-9 && index < 100; value += step, index += 1) {
    ticks.push(Number(value.toPrecision(14)));
  }
  return ticks;
}

export function logMajorTicks(domain: BfnChartDomain): readonly number[] {
  const [minimum, maximum] = domain;
  if (minimum <= 0 || maximum <= 0 || !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    return [];
  }
  const start = Math.ceil(Math.log10(minimum));
  const end = Math.floor(Math.log10(maximum));
  const ticks: number[] = [];
  for (let exponent = start; exponent <= end; exponent += 1) ticks.push(10 ** exponent);
  if (ticks.length === 0) {
    return [];
  }
  return ticks;
}

export function filterPointsInDomain(
  points: readonly BfnSimulationPoint[],
  domain: BfnChartDomain,
): BfnSimulationPoint[] {
  return points.filter((point) => point.coordinate >= domain[0] && point.coordinate <= domain[1]);
}

export function visibleYValues(
  result: BfnSimulationResult,
  visibility: BfnChartVisibility | undefined = undefined,
  comparison?: BfnChartComparison,
): number[] {
  const values = result.points.flatMap((point) => valuesForPoint(result, point, visibility));
  if (comparison) {
    values.push(
      ...comparison.result.points.flatMap((point) => [point.output]),
    );
  }
  return values;
}

function makeDomainResult(
  values: readonly number[],
  options: BfnAutoDomainOptions,
): BfnChartDomainResolution {
  const scale = options.scale ?? 'linear';
  const fallback = options.fallback ?? (scale === 'log' ? [1, 10] : [0, 1]);
  const fallbackValidation = validateManualDomain(fallback, scale);
  if (!fallbackValidation.valid) return { valid: false, reason: fallbackValidation.reason };
  const finite = finiteValues(values);
  if (finite.length === 0) return { valid: true, domain: fallback };
  if (scale === 'log') {
    const invalid = finite.find((value) => value <= 0);
    if (invalid !== undefined) return { valid: false, reason: 'non_positive_visible_value', value: invalid };
    const minimum = Math.min(...finite);
    const maximum = Math.max(...finite);
    if (minimum === maximum) {
      const factor = 10 ** Math.max(0.05, options.padding ?? 0.05);
      return { valid: true, domain: [minimum / factor, maximum * factor] };
    }
    const padding = Math.max(0, options.padding ?? 0.05);
    const factor = 10 ** padding;
    return { valid: true, domain: [minimum / factor, maximum * factor] };
  }
  if (options.normalized && finite.every((value) => value >= 0 && value <= 1)) {
    return { valid: true, domain: [0, 1] };
  }
  let minimum = Math.min(...finite);
  let maximum = Math.max(...finite);
  if (options.includeZero) {
    minimum = Math.min(0, minimum);
    maximum = Math.max(0, maximum);
  }
  if (minimum === maximum) {
    const delta = Math.max(Math.abs(minimum) * 0.05, 1);
    return { valid: true, domain: [minimum - delta, maximum + delta] };
  }
  const padding = Math.max(0, options.padding ?? 0.05);
  const delta = (maximum - minimum) * padding;
  return { valid: true, domain: [minimum - delta, maximum + delta] };
}

export function resolveAutoDomain(
  values: readonly number[],
  options: BfnAutoDomainOptions & { detailed: true },
): BfnChartDomainResolution;
export function resolveAutoDomain(
  values: readonly number[],
  options?: BfnAutoDomainOptions,
): BfnChartDomain;
export function resolveAutoDomain(
  values: readonly number[],
  options: BfnAutoDomainOptions = {},
): BfnChartDomain | BfnChartDomainResolution {
  const result = makeDomainResult(values, options);
  if (options.detailed) return result;
  if (!result.valid) throw new RangeError(result.reason);
  return result.domain;
}

function visibleCoordinates(
  result: BfnSimulationResult,
  visibility: BfnChartVisibility | undefined,
): number[] {
  const annVisible = visibilityFlag(visibility, 'ann') && result.annApproximation !== null;
  if (!visibilityFlag(visibility, 'full') && !visibilityFlag(visibility, 'uncertainty') && !annVisible) {
    return [];
  }
  return result.points.map((point) => point.coordinate);
}

export function evaluateLogEligibility(
  axis: BfnChartAxis,
  activeDomain: BfnChartDomain,
  result: BfnSimulationResult,
  visibility: BfnChartVisibility | undefined,
  comparison?: BfnChartComparison,
): BfnChartValidationResult {
  const selected: number[] = [];
  const append = (candidate: BfnSimulationResult, comparisonVisible = false): void => {
    const points = filterPointsInDomain(candidate.points, activeDomain);
    if (axis === 'x') {
      selected.push(
        ...(comparisonVisible ? points.map((point) => point.coordinate) : visibleCoordinates({ ...candidate, points }, visibility)),
      );
      return;
    }
    for (const point of points) {
      selected.push(...(comparisonVisible ? [point.output] : valuesForPoint(candidate, point, visibility)));
    }
  };
  append(result);
  if (comparison) append(comparison.result, true);
  if (selected.length === 0) return { valid: false, reason: 'no_visible_values', axis };
  const invalid = selected.find((value) => !Number.isFinite(value) || value <= 0);
  if (invalid !== undefined) return { valid: false, reason: 'non_positive_visible_value', axis, value: invalid };
  return { valid: true };
}
