import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '../../components/Button';
import { InlineStatus } from '../../components/InlineStatus';
import { StatusPill } from '../../components/StatusPill';
import { BfnChartControls } from './BfnChartControls';
import { BfnExportMenu } from './BfnExportMenu';
import { createBfnChartModel } from './chartModel';
import { countVisibleBfnLineSeries } from './chartMath';
import {
  defaultBfnChartViewState,
  type BfnChartComparison,
  type BfnChartGeometry,
  type BfnChartValidationResult,
  type BfnChartViewState,
} from './chartTypes';
import { BfnResponseChart, bfnChartResultIdentity } from './BfnResponseChart';
import { BfnRunProvenance } from './BfnRunProvenance';
import { compatibleBfnRuns, formatBfnComparisonTime } from './runComparison';
import {
  bfnTemporalExecutionSummariesDiffer,
  countBfnTemporalExecution,
  interpretBfnDynamicTimeHandling,
} from './runInterpretation';
import { resolveBfnResultSignals } from './resultSignals';
import type { BfnProject, BfnSimulationResult } from './types';

type ResultFreshness = 'current' | 'stale';

export interface BfnResultWorkspaceProps {
  project: BfnProject;
  result: BfnSimulationResult | null;
  runs: readonly BfnSimulationResult[];
  runRelations?: Readonly<Record<string, 'current' | 'earlier' | 'legacy'>>;
  resultFreshness: ResultFreshness;
  resultPanelOpen: boolean;
  onTogglePanel: () => void;
  onRunSimulation: () => void;
  onRequestClearRuns: () => void;
  onSelectRun: (run: BfnSimulationResult) => void;
}

const geometry: BfnChartGeometry = {
  width: 760,
  height: 300,
  padding: { left: 62, right: 24, top: 24, bottom: 48 },
};

function displayNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) > 0 && Math.abs(value) < 0.001) return value.toExponential(2);
  return value.toFixed(digits);
}

function currentOutput(result: BfnSimulationResult | null): number | null {
  return result?.points.at(-1)?.output ?? null;
}

function resultInputRange(result: BfnSimulationResult, t: TFunction): string {
  const unit = resolveBfnResultSignals(result, t).input.unitLabel;
  if (result.mode === 'dynamic') {
    const first = result.points[0]?.inputs[result.primaryInputSourceId];
    const last = result.points.at(-1)?.inputs[result.primaryInputSourceId];
    const duration = result.points.at(-1)?.timeHours ?? 0;
    return first === undefined || last === undefined
      ? `0–${displayNumber(duration, 1)} h`
      : `${displayNumber(first)} → ${displayNumber(last)} ${unit} · 0–${displayNumber(duration, 1)} h`;
  }
  const values = result.points
    .map((point) => point.inputs[result.primaryInputSourceId])
    .filter((value): value is number => value !== undefined);
  if (values.length === 0) return '—';
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return minimum === maximum
    ? `${displayNumber(minimum)} ${unit}`
    : `${displayNumber(minimum)}–${displayNumber(maximum)} ${unit}`;
}

function logFallbackReason(validation: BfnChartValidationResult, t: TFunction): string {
  if (validation.valid) return '';
  if (validation.reason === 'non_positive_visible_value') {
    return t('bfn.results.chart.logValue', { value: validation.value ?? '—' });
  }
  if (validation.reason === 'no_visible_values') return t('bfn.results.chart.noVisibleValues');
  return t('bfn.results.chart.logPositive');
}

export function BfnResultWorkspace({
  project,
  result,
  runs,
  runRelations = {},
  resultFreshness,
  resultPanelOpen,
  onTogglePanel,
  onRunSimulation,
  onRequestClearRuns,
  onSelectRun,
}: BfnResultWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const resultSignals = useMemo(
    () => (result ? resolveBfnResultSignals(result, t) : null),
    [result, t],
  );
  const resultIdentity = bfnChartResultIdentity(result);
  const defaultViewState = useMemo<BfnChartViewState | null>(
    () => (result ? defaultBfnChartViewState(result) : null),
    [resultIdentity],
  );
  const [viewState, setViewState] = useState<BfnChartViewState | null>(() => defaultViewState);
  const [comparisonId, setComparisonId] = useState('');
  const [comparisonNotice, setComparisonNotice] = useState<string | null>(null);
  const previousResultIdentityRef = useRef(resultIdentity);
  const previousAnnAvailableRef = useRef(Boolean(result?.annApproximation));
  const resultViewSnapshot = useMemo(
    () => ({
      defaultViewState,
      annAvailable: Boolean(result?.annApproximation),
    }),
    [resultIdentity, defaultViewState, result],
  );

  useEffect(() => {
    if (previousResultIdentityRef.current === resultIdentity) return;
    setViewState((current) => {
      if (!resultViewSnapshot.defaultViewState) return null;
      if (!current) return resultViewSnapshot.defaultViewState;
      const showAnn = !resultViewSnapshot.annAvailable
        ? false
        : previousAnnAvailableRef.current === false
          ? true
          : current.showAnn;
      return {
        ...current,
        showFullModel: true,
        showAnn,
        cursorIndex: null,
      };
    });
    previousResultIdentityRef.current = resultIdentity;
    previousAnnAvailableRef.current = resultViewSnapshot.annAvailable;
  }, [resultIdentity, resultViewSnapshot]);

  const compatibleRuns = useMemo(
    () => (result ? compatibleBfnRuns(result, runs) : []),
    [result, runs],
  );
  const comparisonRun = compatibleRuns.find((run) => run.id === comparisonId);
  const comparison = useMemo<BfnChartComparison | undefined>(
    () =>
      comparisonRun
        ? {
            result: comparisonRun,
            label: t('bfn.results.chart.comparisonRunLabel', {
              time: formatBfnComparisonTime(
                comparisonRun.completedAt,
                i18n.language,
                t('bfn.results.comparison.unknownTime'),
              ),
            }),
          }
        : undefined,
    [comparisonRun, i18n.language, t],
  );
  const comparisonAvailable = comparison !== undefined;
  const temporalComparisonDifference = comparison
    ? bfnTemporalExecutionSummariesDiffer(result!, comparison.result)
    : null;

  useEffect(() => {
    setViewState((current) => {
      if (
        !current ||
        countVisibleBfnLineSeries(current, {
          annAvailable: result?.annApproximation !== null && result?.annApproximation !== undefined,
          comparisonAvailable,
        }) > 0
      ) {
        return current;
      }
      return { ...current, showFullModel: true };
    });
  }, [comparisonAvailable, result?.annApproximation]);

  useEffect(() => {
    if (!comparisonId || comparisonRun) return;
    setComparisonId('');
    setComparisonNotice(t('bfn.results.comparison.cleared'));
  }, [comparisonId, comparisonRun, t]);

  const model = useMemo(() => {
    if (!result || !viewState) return null;
    return createBfnChartModel({
      project,
      result,
      ...(comparison ? { comparison } : {}),
      viewState,
      geometry,
      translate: (key) => t(key),
    });
  }, [comparison, project, result, t, viewState]);

  useEffect(() => {
    if (!comparison || !model || !viewState) return;
    const xInvalid = viewState.xScale === 'log' && !model.validation.xLog.valid;
    const yInvalid = viewState.yScale === 'log' && !model.validation.yLog.valid;
    if (!xInvalid && !yInvalid) return;
    const axes = [
      xInvalid ? t('bfn.results.chart.xAxis') : '',
      yInvalid ? t('bfn.results.chart.yAxis') : '',
    ]
      .filter(Boolean)
      .join(' / ');
    const validation = xInvalid ? model.validation.xLog : model.validation.yLog;
    setViewState((current) =>
      current
        ? {
            ...current,
            ...(xInvalid ? { xScale: 'linear' as const } : {}),
            ...(yInvalid ? { yScale: 'linear' as const } : {}),
          }
        : current,
    );
    setComparisonNotice(
      t('bfn.results.comparison.logFallback', {
        axes,
        reason: logFallbackReason(validation, t),
      }),
    );
  }, [comparison, model, t, viewState]);

  const resetView = (): void => {
    setViewState(defaultViewState);
  };

  return (
    <section className="bfn-result-panel" data-open={resultPanelOpen}>
      <header className="bfn-result-panel__header">
        <div>
          <h2>{t('bfn.results.title')}</h2>
          <span>
            {result
              ? t('bfn.results.lastRun', {
                  time: new Date(result.completedAt).toLocaleString(i18n.language),
                })
              : t('bfn.results.notRun')}
          </span>
        </div>
        <div className="bfn-result-panel__actions">
          <InlineStatus
            label={
              !result
                ? t('bfn.results.awaiting')
                : resultFreshness === 'stale'
                  ? t('bfn.results.stale')
                  : t('bfn.results.current')
            }
            tone={!result ? 'neutral' : resultFreshness === 'stale' ? 'warning' : 'accent'}
          />
          <button
            className="bfn-result-panel__toggle"
            type="button"
            aria-expanded={resultPanelOpen}
            onClick={onTogglePanel}
          >
            {resultPanelOpen ? t('bfn.results.collapse') : t('bfn.results.expand')}
          </button>
        </div>
      </header>
      {result && resultFreshness === 'stale' ? (
        <div className="bfn-result-stale" role="status">
          <div>
            <strong>{t('bfn.results.staleTitle')}</strong>
            <span>{t('bfn.results.staleHint')}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={onRunSimulation}>
            {t('bfn.actions.rerun')}
          </Button>
        </div>
      ) : null}
      {resultPanelOpen ? (
        <div className="bfn-analysis-results">
          {result && viewState && model ? (
            <>
              <div className="bfn-chart-column">
                <div className="bfn-chart-toolbar">
                  <BfnChartControls
                    project={project}
                    result={result}
                    model={model}
                    viewState={viewState}
                    {...(comparison ? { comparison } : {})}
                    onViewStateChange={setViewState}
                    onReset={resetView}
                  />
                  <BfnExportMenu
                    project={project}
                    result={result}
                    {...(comparison ? { comparison } : {})}
                    model={model}
                  />
                </div>
                <div className="bfn-comparison-bar">
                  {compatibleRuns.length > 0 ? (
                    <label>
                      <span>{t('bfn.results.comparison.label')}</span>
                      <select
                        aria-label={t('bfn.results.comparison.label')}
                        value={comparisonId}
                        onChange={(event) => {
                          setComparisonId(event.target.value);
                          setComparisonNotice(null);
                        }}
                      >
                        <option value="">{t('bfn.results.comparison.noneSelected')}</option>
                        {compatibleRuns.map((run) => (
                          <option key={run.id} value={run.id}>
                            {t('bfn.results.comparison.option', {
                              time: new Date(run.completedAt).toLocaleString(i18n.language),
                              mode: t(`bfn.modes.${run.mode}`),
                              range: resultInputRange(run, t),
                            })}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p>{t('bfn.results.comparison.noneAvailable')}</p>
                  )}
                  {comparisonNotice ? (
                    <p className="bfn-comparison-bar__notice" role="status">
                      {comparisonNotice}
                    </p>
                  ) : null}
                  {comparison && (!result.signalSnapshot || !comparison.result.signalSnapshot) ? (
                    <p className="bfn-comparison-bar__notice" role="status">
                      {t('bfn.results.signals.legacySemanticsUnavailable')}
                    </p>
                  ) : null}
                  {comparison && temporalComparisonDifference === null ? (
                    <p className="bfn-comparison-bar__notice" role="status">
                      {t('bfn.results.comparison.temporalIncomplete')}
                    </p>
                  ) : null}
                  {comparison && temporalComparisonDifference === true ? (
                    <p className="bfn-comparison-bar__notice" role="status">
                      {t('bfn.results.comparison.temporalDifferent')}
                    </p>
                  ) : null}
                </div>
                <BfnResponseChart
                  project={project}
                  result={result}
                  {...(comparison ? { comparison } : {})}
                  viewState={viewState}
                  onViewStateChange={setViewState}
                  model={model}
                />
              </div>
              <UncertaintyResultNotice result={result} />
              <div className="bfn-result-facts">
                <article>
                  <span>{t('bfn.results.finalOutput')}</span>
                  <strong>{displayNumber(currentOutput(result) ?? 0)}</strong>
                  <small>{resultSignals?.output.unitLabel}</small>
                </article>
                <article>
                  <span>{t('bfn.results.domainStatus')}</span>
                  <strong>
                    {result.extrapolated
                      ? t('bfn.results.extrapolated')
                      : t('bfn.results.inDomain')}
                  </strong>
                  <small>
                    {result.extrapolated
                      ? t('bfn.results.extrapolatedHint')
                      : t('bfn.results.inDomainHint')}
                  </small>
                </article>
                <article>
                  <span>{t('bfn.results.parameterRange')}</span>
                  <strong>{resultInputRange(result, t)}</strong>
                  <small>{t('bfn.results.rangeHint')}</small>
                </article>
              </div>
              {result.mode === 'dynamic' ? <TimeHandlingSummary result={result} /> : null}
              {result.mode === 'static' ? (
                <AnnResultCard result={result} />
              ) : (
                <DynamicMetricsCard result={result} />
              )}
              <BfnRunProvenance result={result} />
            </>
          ) : (
            <BfnResponseChart project={project} result={result} />
          )}
          <section className="bfn-run-history">
            <header>
              <div>
                <h3>{t('bfn.runs.title')}</h3>
              </div>
              {runs.length ? (
                <button className="danger-text-button" type="button" onClick={onRequestClearRuns}>
                  {t('bfn.runs.clear')}
                </button>
              ) : null}
            </header>
            {runs.length ? (
              runs.map((run) => (
                <button key={run.id} type="button" onClick={() => onSelectRun(run)}>
                  <span>{new Date(run.completedAt).toLocaleString(i18n.language)}</span>
                  <strong>{t(`bfn.modes.${run.mode}`)}</strong>
                  <small data-relation={runRelations[run.id] ?? 'legacy'}>
                    {t(`bfn.workspace.runs.${runRelations[run.id] ?? 'legacy'}`)}
                  </small>
                  <code>{displayNumber(run.points.at(-1)?.output ?? 0)}</code>
                </button>
              ))
            ) : (
              <p>{t('bfn.runs.empty')}</p>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function AnnResultCard({ result }: { result: BfnSimulationResult }) {
  const { t } = useTranslation();
  const ann = result.annApproximation;
  if (!ann)
    return (
      <section className="bfn-ann-card bfn-ann-card--absent">
        <header>
          <strong>{t('bfn.ann.title')}</strong>
          <StatusPill label={t('bfn.ann.notGenerated')} tone="neutral" />
        </header>
        <p>{t('bfn.ann.fixedPointRule')}</p>
      </section>
    );
  const equation = `y ≈ ${ann.weights.map((weight, index) => `${displayNumber(weight)}x${index + 1}`).join(' + ')} + ${displayNumber(ann.effectiveIntercept)}`;
  return (
    <section className="bfn-ann-card" data-status={ann.status}>
      <header>
        <div>
          <h3>{t('bfn.ann.title')}</h3>
        </div>
        <StatusPill
          label={t(`bfn.ann.${ann.status}`)}
          tone={ann.status === 'accepted' ? 'success' : 'warning'}
        />
      </header>
      <p>
        {ann.status === 'accepted'
          ? t('bfn.results.chart.annAccepted')
          : t('bfn.results.chart.annRejected')}
      </p>
      <details>
        <summary>{t('bfn.ann.showMetrics')}</summary>
        <p>
          {t('bfn.ann.method')}: {t('bfn.ann.methodValue')}
        </p>
        <code>{equation}</code>
        <dl>
          <div>
            <dt>R²</dt>
            <dd>{ann.metrics.r2.toFixed(4)}</dd>
          </div>
          <div>
            <dt>NRMSE</dt>
            <dd>{(ann.metrics.nrmse * 100).toFixed(2)}%</dd>
          </div>
          <div>
            <dt>{t('bfn.ann.maxError')}</dt>
            <dd>{ann.metrics.maximumAbsoluteError.toFixed(4)}</dd>
          </div>
          <div>
            <dt>{t('bfn.ann.coverage')}</dt>
            <dd>
              {ann.metrics.predictionIntervalCoverage === null
                ? t('bfn.ann.coverageUnavailable')
                : `${(ann.metrics.predictionIntervalCoverage * 100).toFixed(1)}%`}
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

function UncertaintyResultNotice({ result }: { result: BfnSimulationResult }) {
  const { t } = useTranslation();
  if (result.engineVersion !== 'BFN-SIM-2.1' || result.uncertaintySnapshot.status === 'available') {
    return null;
  }
  const reasons = [
    ...new Set(
      result.uncertaintySnapshot.modules.flatMap((module) =>
        module.intervalExecutable || module.reason === null ? [] : [module.reason],
      ),
    ),
  ];
  return (
    <section className="bfn-uncertainty-boundary" role="status">
      <strong>{t('bfn.results.uncertainty.unavailableTitle')}</strong>
      {reasons.length > 0 ? (
        reasons.map((reason) => (
          <p key={reason}>{t(`bfn.results.uncertainty.reasons.${reason}`)}</p>
        ))
      ) : (
        <p>{t('bfn.results.uncertainty.unavailableFallback')}</p>
      )}
    </section>
  );
}

function DynamicMetricsCard({ result }: { result: BfnSimulationResult }) {
  const { t } = useTranslation();
  const metrics = result.dynamicMetrics;
  if (!metrics) return null;
  const timeInterpretation = interpretBfnDynamicTimeHandling(result);
  const quasiStaticOnly = timeInterpretation === 'all_quasi_static';
  return (
    <section className="bfn-dynamic-metrics">
      <header>
        <h3>{t(quasiStaticOnly ? 'bfn.dynamic.trajectoryTitle' : 'bfn.dynamic.title')}</h3>
      </header>
      {quasiStaticOnly ? <p>{t('bfn.dynamic.quasiStaticBoundary')}</p> : null}
      <dl>
        <div>
          <dt>{t('bfn.dynamic.steady')}</dt>
          <dd>{metrics.steadyValue.toFixed(3)}</dd>
        </div>
        <div>
          <dt>{t('bfn.dynamic.riseTime')}</dt>
          <dd>{metrics.riseTimeHours === null ? '—' : `${metrics.riseTimeHours.toFixed(2)} h`}</dd>
        </div>
        <div>
          <dt>{t('bfn.dynamic.peak')}</dt>
          <dd>{metrics.peakValue.toFixed(3)}</dd>
        </div>
        <div>
          <dt>{t('bfn.dynamic.overshoot')}</dt>
          <dd>{(metrics.overshootFraction * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt>DC gain</dt>
          <dd>{metrics.dcGain === null ? '—' : metrics.dcGain.toFixed(4)}</dd>
        </div>
        <div>
          <dt>|G(jω)|</dt>
          <dd>
            {metrics.frequencyGain === null ? '—' : metrics.frequencyGain.magnitude.toFixed(4)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function TimeHandlingSummary({ result }: { result: BfnSimulationResult }) {
  const { t } = useTranslation();
  const interpretation = interpretBfnDynamicTimeHandling(result);
  const snapshot = result.temporalSnapshot;
  const counts = snapshot ? countBfnTemporalExecution(snapshot) : null;
  return (
    <section className="bfn-time-handling" data-time-interpretation={interpretation}>
      <header>
        <h3>{t('bfn.temporal.result.title')}</h3>
      </header>
      <strong>{t(`bfn.temporal.result.states.${interpretation}`)}</strong>
      <p>{t(`bfn.temporal.result.boundaries.${interpretation}`)}</p>
      {counts ? (
        <dl>
          <div>
            <dt>{t('bfn.temporal.modes.steady_state')}</dt>
            <dd>{counts.steadyState}</dd>
          </div>
          <div>
            <dt>{t('bfn.temporal.modes.quasi_static')}</dt>
            <dd>{counts.quasiStatic}</dd>
          </div>
          <div>
            <dt>{t('bfn.temporal.modes.stateful_dynamic')}</dt>
            <dd>{counts.statefulDynamic}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
