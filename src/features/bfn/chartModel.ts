import {
  createScale,
  evaluateLogEligibility,
  filterPointsInDomain,
  linearNiceTicks,
  logMajorTicks,
  resolveAutoDomain,
  validateManualDomain,
  visibleYValues,
} from './chartMath';
import type {
  BfnChartAxis,
  BfnChartDomain,
  BfnChartModel,
  BfnChartScale,
  BfnChartSeries,
  BfnChartSeriesPoint,
  BfnChartTick,
  BfnChartValidationResult,
  BfnChartVisibility,
  CreateBfnChartModelInput,
} from './chartTypes';
import type { BfnSimulationPoint, BfnSimulationResult } from './types';

function finiteExtent(values: readonly number[], fallback: BfnChartDomain): BfnChartDomain {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return fallback;
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  if (minimum === maximum) {
    const delta = Math.max(Math.abs(minimum) * 0.05, 1);
    return [minimum - delta, maximum + delta];
  }
  return [minimum, maximum];
}

function positiveExtent(values: readonly number[], fallback: BfnChartDomain): BfnChartDomain {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0);
  if (positive.length === 0) {
    const [fallbackMinimum, fallbackMaximum] = fallback;
    if (
      Number.isFinite(fallbackMinimum) &&
      Number.isFinite(fallbackMaximum) &&
      fallbackMinimum > 0 &&
      fallbackMinimum < fallbackMaximum
    ) {
      return fallback;
    }
    return [1, 10];
  }
  const minimum = Math.min(...positive);
  const maximum = Math.max(...positive);
  if (minimum === maximum) {
    const factor = 10 ** 0.05;
    return [minimum / factor, maximum * factor];
  }
  return [minimum, maximum];
}

function sourceForResult(project: CreateBfnChartModelInput['project'], result: BfnSimulationResult) {
  return project.network.inputSources.find((source) => source.id === result.primaryInputSourceId);
}

function monitorForResult(project: CreateBfnChartModelInput['project'], result: BfnSimulationResult) {
  return project.network.outputMonitors.find((monitor) => monitor.id === result.outputMonitorId);
}

function fallbackTranslation(
  translate: CreateBfnChartModelInput['translate'],
  key: string,
  fallback: string,
): string {
  const translated = translate(key);
  return translated === key || translated.trim().length === 0 ? fallback : translated;
}

function formatTick(value: number): string {
  if (Object.is(value, -0)) return '0';
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
    return value.toExponential(2);
  }
  return Number.isInteger(value) ? String(value) : value.toPrecision(3).replace(/\.0+$/, '');
}

function ticksFor(
  domain: BfnChartDomain,
  scale: BfnChartScale,
  map: (value: number) => number,
): readonly BfnChartTick[] {
  const values = scale === 'log' ? logMajorTicks(domain) : linearNiceTicks(domain, 5);
  return values.map((value) => ({
    value,
    position: map(value),
    label: formatTick(value),
    major: true,
  }));
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

function pointsForSeries(
  result: BfnSimulationResult,
  points: readonly BfnSimulationPoint[],
  valueFor: (point: BfnSimulationPoint) => number,
  mapX: (value: number) => number,
  mapY: (value: number) => number,
): BfnChartSeriesPoint[] {
  return points.map((point, index) => ({
    index,
    coordinate: point.coordinate,
    value: valueFor(point),
    x: mapX(point.coordinate),
    y: mapY(valueFor(point)),
  }));
}

function linePath(points: readonly BfnChartSeriesPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function bandPath(
  upper: readonly BfnChartSeriesPoint[],
  lower: readonly BfnChartSeriesPoint[],
): string {
  if (upper.length === 0 || lower.length === 0) return '';
  return `${linePath(upper)} ${lower
    .slice()
    .reverse()
    .map((point) => `L ${point.x} ${point.y}`)
    .join(' ')} Z`;
}

function visibilityFromState(state: CreateBfnChartModelInput['viewState']): BfnChartVisibility {
  return {
    showFullModel: state.showFullModel,
    showUncertainty: state.showUncertainty,
    showAnn: state.showAnn,
  };
}

function resultWithPoints(result: BfnSimulationResult, points: readonly BfnSimulationPoint[]): BfnSimulationResult {
  return { ...result, points: [...points] };
}

function withValidationAxis(
  validation: BfnChartValidationResult,
  axis: BfnChartAxis,
): BfnChartValidationResult {
  if (validation.valid) return validation;
  return { ...validation, axis };
}

function chooseDomain(
  values: readonly number[],
  scale: BfnChartScale,
  mode: 'auto' | 'manual',
  minimum: number | undefined,
  maximum: number | undefined,
  fallback: BfnChartDomain,
  normalized = false,
): { domain: BfnChartDomain; validation: BfnChartValidationResult } {
  if (mode === 'manual') {
    if (minimum === undefined || maximum === undefined) {
      return { domain: fallback, validation: { valid: false, reason: 'invalid_domain' } };
    }
    const validation = validateManualDomain([minimum, maximum], scale);
    if (!validation.valid) return { domain: fallback, validation };
    return { domain: [minimum, maximum], validation };
  }
  const resolution = resolveAutoDomain(values, { scale, normalized, detailed: true });
  if (resolution.valid) return { domain: resolution.domain, validation: { valid: true } };
  const safeDomain = scale === 'log' ? positiveExtent(values, fallback) : finiteExtent(values, fallback);
  return {
    domain: safeDomain,
    validation: { valid: false, reason: resolution.reason },
  };
}

function seriesFor(
  kind: 'full' | 'ann' | 'comparison',
  label: string,
  result: BfnSimulationResult,
  points: readonly BfnSimulationPoint[],
  mapX: (value: number) => number,
  mapY: (value: number) => number,
): BfnChartSeries {
  const valueFor = kind === 'ann'
    ? (point: BfnSimulationPoint) => annValue(result, point) ?? Number.NaN
    : (point: BfnSimulationPoint) => point.output;
  const seriesPoints = pointsForSeries(result, points, valueFor, mapX, mapY);
  return {
    kind,
    label,
    visible: true,
    path: linePath(seriesPoints),
    points: seriesPoints,
    resultId: result.id,
  };
}

export function createBfnChartModel({
  project,
  result,
  comparison,
  viewState,
  geometry,
  translate,
}: CreateBfnChartModelInput): BfnChartModel {
  const source = sourceForResult(project, result);
  const monitor = monitorForResult(project, result);
  const comparisonResult = comparison?.result;
  const xValues = [
    ...result.points.map((point) => point.coordinate),
    ...(comparisonResult?.points.map((point) => point.coordinate) ?? []),
  ];
  const xFallback: BfnChartDomain =
    result.mode === 'dynamic' ? [0, Math.max(1, project.analysis.durationHours)] : [0, 1];
  const xSelection = chooseDomain(
    xValues,
    viewState.xScale,
    viewState.xDomainMode,
    viewState.xMinimum,
    viewState.xMaximum,
    viewState.xScale === 'log' ? positiveExtent(xValues, [1, 10]) : xFallback,
  );
  const xDomain = xSelection.domain;
  const visible = visibilityFromState(viewState);
  const filteredResultPoints = filterPointsInDomain(result.points, xDomain);
  const filteredComparisonPoints = comparisonResult
    ? filterPointsInDomain(comparisonResult.points, xDomain)
    : [];
  const yValues = visibleYValues(
    resultWithPoints(result, filteredResultPoints),
    visible,
    comparison
      ? { ...comparison, result: resultWithPoints(comparison.result, filteredComparisonPoints) }
      : undefined,
  );
  const yFallback: BfnChartDomain = [0, 1];
  const ySelection = chooseDomain(
    yValues,
    viewState.yScale,
    viewState.yDomainMode,
    viewState.yMinimum,
    viewState.yMaximum,
    viewState.yScale === 'log' ? positiveExtent(yValues, [1, 10]) : yFallback,
    true,
  );
  const yDomain = ySelection.domain;
  const innerWidth = Math.max(1, geometry.width - geometry.padding.left - geometry.padding.right);
  const innerHeight = Math.max(1, geometry.height - geometry.padding.top - geometry.padding.bottom);
  const xScale = createScale(xDomain, [geometry.padding.left, geometry.padding.left + innerWidth], viewState.xScale);
  const yScale = createScale(yDomain, [geometry.padding.top + innerHeight, geometry.padding.top], viewState.yScale);
  const mapX = (value: number): number => xScale.map(value);
  const mapY = (value: number): number => yScale.map(value);

  const xLog = viewState.xScale === 'log'
    ? xSelection.validation.valid
      ? evaluateLogEligibility('x', xDomain, result, visible, comparison)
      : withValidationAxis(xSelection.validation, 'x')
    : ({ valid: true } as const);
  const yLog = viewState.yScale === 'log'
    ? ySelection.validation.valid
      ? evaluateLogEligibility('y', xDomain, result, visible, comparison)
      : withValidationAxis(ySelection.validation, 'y')
    : ({ valid: true } as const);
  const labels = {
    x:
      result.mode === 'dynamic'
        ? fallbackTranslation(translate, 'bfn.results.timeAxis', 'Time (hours)')
        : source
          ? `${source.outputPort.entity} (${source.outputPort.unit})`
          : result.primaryInputSourceId || fallbackTranslation(translate, 'bfn.results.inputAxis', 'Input'),
    y: monitor
      ? `${monitor.inputPort.entity} (${monitor.inputPort.unit})`
      : result.outputMonitorId || fallbackTranslation(translate, 'bfn.results.outputAxis', 'Output'),
    ...(source ? { xEntity: source.outputPort.entity, xUnit: source.outputPort.unit } : {}),
    ...(monitor ? { yEntity: monitor.inputPort.entity, yUnit: monitor.inputPort.unit } : {}),
  };

  const fullPoints = filteredResultPoints;
  const uncertaintyUpper = fullPoints.map((point) => ({ ...point, output: point.upper }));
  const uncertaintyLower = fullPoints.map((point) => ({ ...point, output: point.lower }));
  const fullSeries = viewState.showFullModel
    ? seriesFor('full', fallbackTranslation(translate, 'bfn.results.fullModel', 'Full model'), result, fullPoints, mapX, mapY)
    : undefined;
  const uncertaintySeries = viewState.showUncertainty
    ? (() => {
        const upper = pointsForSeries(result, uncertaintyUpper, (point) => point.output, mapX, mapY);
        const lower = pointsForSeries(result, uncertaintyLower, (point) => point.output, mapX, mapY);
        return {
          kind: 'uncertainty' as const,
          label: fallbackTranslation(translate, 'bfn.results.uncertaintyBand', 'Uncertainty'),
          visible: true,
          path: bandPath(upper, lower),
          band: bandPath(upper, lower),
          points: upper,
          resultId: result.id,
        };
      })()
    : undefined;
  const annSeries = viewState.showAnn && result.annApproximation
    ? seriesFor('ann', fallbackTranslation(translate, 'bfn.results.annOverlay', 'ANN approximation'), result, fullPoints, mapX, mapY)
    : undefined;
  const comparisonSeries = comparison
    ? seriesFor('comparison', comparison.label, comparison.result, filteredComparisonPoints, mapX, mapY)
    : undefined;

  const cursorPoint = viewState.cursorIndex === null ? undefined : result.points[viewState.cursorIndex];
  const cursor = cursorPoint && viewState.cursorIndex !== null && cursorPoint.coordinate >= xDomain[0] && cursorPoint.coordinate <= xDomain[1]
    ? {
        index: viewState.cursorIndex,
        coordinate: cursorPoint.coordinate,
        x: mapX(cursorPoint.coordinate),
        y: mapY(cursorPoint.output),
        point: cursorPoint,
        value: cursorPoint.output,
        lower: cursorPoint.lower,
        upper: cursorPoint.upper,
      }
    : undefined;
  return {
    geometry,
    labels,
    domains: { x: xDomain, y: yDomain },
    scales: { x: xScale, y: yScale },
    ticks: {
      x: ticksFor(xDomain, viewState.xScale, mapX),
      y: ticksFor(yDomain, viewState.yScale, mapY),
    },
    series: {
      ...(fullSeries ? { full: fullSeries } : {}),
      ...(uncertaintySeries ? { uncertainty: uncertaintySeries } : {}),
      ...(annSeries ? { ann: annSeries } : {}),
      ...(comparisonSeries ? { comparison: comparisonSeries } : {}),
    },
    ...(cursor ? { cursor } : {}),
    validation: {
      xLog,
      yLog,
      xDomain: xSelection.validation,
      yDomain: ySelection.validation,
    },
  };
}
