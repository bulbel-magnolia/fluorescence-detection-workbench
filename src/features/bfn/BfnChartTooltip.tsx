import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BfnChartComparison, BfnChartCursor, BfnChartModel } from './chartTypes';
import type { BfnProject, BfnSimulationResult } from './types';

interface BfnChartTooltipProps {
  project: BfnProject;
  result: BfnSimulationResult;
  comparison?: BfnChartComparison;
  model: BfnChartModel;
  cursor?: BfnChartCursor;
}

function valueLabel(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '—';
  const text =
    Math.abs(value) > 0 && Math.abs(value) < 0.001 ? value.toExponential(3) : value.toFixed(3);
  return unit ? `${text} ${unit}` : text;
}

function annValue(result: BfnSimulationResult, index: number): number | null {
  const approximation = result.annApproximation;
  const point = result.points[index];
  if (!approximation || !point) return null;
  return approximation.inputSourceIds.reduce(
    (sum, sourceId, sourceIndex) =>
      sum + (point.inputs[sourceId] ?? 0) * (approximation.weights[sourceIndex] ?? 0),
    approximation.effectiveIntercept,
  );
}

export function BfnChartTooltip({
  project,
  result,
  comparison,
  model,
  cursor,
}: BfnChartTooltipProps) {
  const { t } = useTranslation();
  const point = cursor?.point;
  const sources = project.network.inputSources;
  const primarySource = sources.find((source) => source.id === result.primaryInputSourceId);
  const inputRows = useMemo(() => {
    if (!point) return [];
    if (result.mode === 'static') {
      const value = point.inputs[result.primaryInputSourceId] ?? point.coordinate;
      return [
        {
          id: result.primaryInputSourceId,
          label: primarySource?.outputPort.entity ?? result.primaryInputSourceId,
          value,
          unit: primarySource?.outputPort.unit,
        },
      ];
    }
    return Object.entries(point.inputs).map(([id, value]) => {
      const source = sources.find((candidate) => candidate.id === id);
      return {
        id,
        label: source?.outputPort.entity ?? id,
        value,
        unit: source?.outputPort.unit,
      };
    });
  }, [point, primarySource, result, sources]);
  if (!point || cursor === undefined) return null;
  const approximation = model.series.ann ? annValue(result, cursor.index) : null;
  const outputUnit = model.labels.yUnit;
  const comparisonCursor = cursor.comparison;
  const comparisonCoordinate = comparisonCursor
    ? result.mode === 'dynamic'
      ? (comparisonCursor.point.timeHours ?? comparisonCursor.coordinate)
      : (comparisonCursor.point.inputs[result.primaryInputSourceId] ?? comparisonCursor.coordinate)
    : null;
  return (
    <aside
      className="bfn-chart-tooltip"
      data-index={cursor.index}
      role="note"
      aria-label={t('bfn.results.chart.computedPoint')}
      tabIndex={0}
    >
      <strong>{t('bfn.results.chart.computedPoint')}</strong>
      {comparisonCursor ? (
        <span className="bfn-chart-tooltip__run-label">{t('bfn.results.chart.currentRun')}</span>
      ) : null}
      <dl>
        {result.mode === 'dynamic' ? (
          <div>
            <dt>{t('bfn.results.chart.time')}</dt>
            <dd>{valueLabel(point.timeHours ?? point.coordinate, 'h')}</dd>
          </div>
        ) : null}
        <div>
          <dt>
            {t(
              result.mode === 'static'
                ? 'bfn.results.chart.cursorInput'
                : 'bfn.results.chart.cursorInputs',
            )}
          </dt>
          <dd>
            {inputRows.map((row) => (
              <span key={row.id} className="bfn-chart-tooltip__input">
                {row.label}: {valueLabel(row.value, row.unit)}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>{t('bfn.results.chart.cursorOutput')}</dt>
          <dd>{valueLabel(point.output, outputUnit)}</dd>
        </div>
        <div>
          <dt>{t('bfn.results.chart.cursorLower')}</dt>
          <dd>{valueLabel(point.lower, outputUnit)}</dd>
        </div>
        <div>
          <dt>{t('bfn.results.chart.cursorUpper')}</dt>
          <dd>{valueLabel(point.upper, outputUnit)}</dd>
        </div>
        {approximation !== null ? (
          <div>
            <dt>{t('bfn.results.chart.annOverlay')}</dt>
            <dd>{valueLabel(approximation, outputUnit)}</dd>
          </div>
        ) : null}
      </dl>
      {comparisonCursor && comparisonCoordinate !== null ? (
        <section className="bfn-chart-tooltip__comparison">
          <strong>{comparison?.label ?? t('bfn.results.chart.comparisonRun')}</strong>
          <dl>
            <div>
              <dt>
                {t(
                  result.mode === 'dynamic'
                    ? 'bfn.results.chart.time'
                    : 'bfn.results.chart.cursorInput',
                )}
              </dt>
              <dd>
                {valueLabel(
                  comparisonCoordinate,
                  result.mode === 'dynamic' ? 'h' : model.labels.xUnit,
                )}
              </dd>
            </div>
            <div>
              <dt>{t('bfn.results.chart.cursorOutput')}</dt>
              <dd>{valueLabel(comparisonCursor.value, outputUnit)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
      {point.extrapolated ? (
        <p className="bfn-chart-tooltip__warning" role="status">
          {t('bfn.results.chart.extrapolatedWarning')}
        </p>
      ) : null}
      {approximation !== null ? (
        <p className="bfn-chart-tooltip__ann-status">
          {result.annApproximation?.status === 'accepted'
            ? t('bfn.results.chart.annAccepted')
            : t('bfn.results.chart.annRejected')}
        </p>
      ) : null}
    </aside>
  );
}
