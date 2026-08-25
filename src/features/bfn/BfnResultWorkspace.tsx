import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '../../components/Button';
import { InlineStatus } from '../../components/InlineStatus';
import { StatusPill } from '../../components/StatusPill';
import { BfnChartControls } from './BfnChartControls';
import { createBfnChartModel } from './chartModel';
import { defaultBfnChartViewState, type BfnChartGeometry, type BfnChartViewState } from './chartTypes';
import { BfnResponseChart, bfnChartResultIdentity } from './BfnResponseChart';
import type { BfnProject, BfnSimulationResult } from './types';
import { bfnUnitLabel } from './presentation';

type ResultFreshness = 'current' | 'stale';

export interface BfnResultWorkspaceProps {
  project: BfnProject;
  result: BfnSimulationResult | null;
  runs: readonly BfnSimulationResult[];
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

function resultInputRange(result: BfnSimulationResult, project: BfnProject, t: TFunction): string {
  const source = project.network.inputSources.find((candidate) => candidate.id === result.primaryInputSourceId);
  const unit = bfnUnitLabel(source?.outputPort.unit ?? 'dimensionless', t);
  if (result.mode === 'dynamic') {
    const first = result.points[0]?.inputs[result.primaryInputSourceId];
    const last = result.points.at(-1)?.inputs[result.primaryInputSourceId];
    const duration = result.points.at(-1)?.timeHours ?? 0;
    return first === undefined || last === undefined
      ? `0–${displayNumber(duration, 1)} h`
      : `${displayNumber(first)} → ${displayNumber(last)} · 0–${displayNumber(duration, 1)} h`;
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

export function BfnResultWorkspace({
  project,
  result,
  runs,
  resultFreshness,
  resultPanelOpen,
  onTogglePanel,
  onRunSimulation,
  onRequestClearRuns,
  onSelectRun,
}: BfnResultWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const resultIdentity = bfnChartResultIdentity(result);
  const defaultViewState = useMemo<BfnChartViewState | null>(
    () => result ? defaultBfnChartViewState(result) : null,
    [resultIdentity],
  );
  const [viewState, setViewState] = useState<BfnChartViewState | null>(() => defaultViewState);

  useEffect(() => {
    setViewState(defaultViewState);
  }, [defaultViewState]);

  const model = useMemo(() => {
    if (!result || !viewState) return null;
    return createBfnChartModel({
      project,
      result,
      viewState,
      geometry,
      translate: (key) => t(key),
    });
  }, [project, result, t, viewState]);

  const resetView = (): void => {
    setViewState(defaultViewState);
  };

  return (
    <section className="bfn-result-panel" data-open={resultPanelOpen}>
      <header className="bfn-result-panel__header">
        <div>
          <h2>{t('bfn.results.title')}</h2>
          <span>{result ? t('bfn.results.lastRun', { time: new Date(result.completedAt).toLocaleString(i18n.language) }) : t('bfn.results.notRun')}</span>
        </div>
        <div className="bfn-result-panel__actions">
          <InlineStatus
            label={!result ? t('bfn.results.awaiting') : resultFreshness === 'stale' ? t('bfn.results.stale') : t('bfn.results.current')}
            tone={!result ? 'neutral' : resultFreshness === 'stale' ? 'warning' : 'accent'}
          />
          <button className="bfn-result-panel__toggle" type="button" aria-expanded={resultPanelOpen} onClick={onTogglePanel}>
            {resultPanelOpen ? t('bfn.results.collapse') : t('bfn.results.expand')}
          </button>
        </div>
      </header>
      {result && resultFreshness === 'stale' ? (
        <div className="bfn-result-stale" role="status">
          <div><strong>{t('bfn.results.staleTitle')}</strong><span>{t('bfn.results.staleHint')}</span></div>
          <Button variant="secondary" size="sm" onClick={onRunSimulation}>{t('bfn.actions.rerun')}</Button>
        </div>
      ) : null}
      {resultPanelOpen ? (
        <div className="bfn-analysis-results">
          {result && viewState && model ? (
            <>
              <div className="bfn-chart-column">
                <BfnChartControls
                  project={project}
                  result={result}
                  model={model}
                  viewState={viewState}
                  onViewStateChange={setViewState}
                  onReset={resetView}
                />
                <BfnResponseChart project={project} result={result} viewState={viewState} onViewStateChange={setViewState} model={model} />
              </div>
              <div className="bfn-result-facts">
                <article><span>{t('bfn.results.finalOutput')}</span><strong>{displayNumber(currentOutput(result) ?? 0)}</strong><small>{bfnUnitLabel(project.network.outputMonitors[0]?.inputPort.unit ?? 'dimensionless', t)}</small></article>
                <article><span>{t('bfn.results.domainStatus')}</span><strong>{result.extrapolated ? t('bfn.results.extrapolated') : t('bfn.results.inDomain')}</strong><small>{result.extrapolated ? t('bfn.results.extrapolatedHint') : t('bfn.results.inDomainHint')}</small></article>
                <article><span>{t('bfn.results.parameterRange')}</span><strong>{resultInputRange(result, project, t)}</strong><small>{t('bfn.results.rangeHint')}</small></article>
              </div>
              {result.mode === 'static' ? <AnnResultCard result={result} /> : <DynamicMetricsCard result={result} />}
              <details className="bfn-result-details"><summary>{t('bfn.results.showDetails')}</summary><dl><div><dt>{t('bfn.results.engineVersion')}</dt><dd>{result.engineVersion}</dd></div><div><dt>{t('bfn.results.modelVersion')}</dt><dd>{result.modelVersions.join(' · ')}</dd></div><div><dt>{t('bfn.results.computedPoints')}</dt><dd>{result.points.length}</dd></div></dl></details>
            </>
          ) : <BfnResponseChart project={project} result={result} />}
          <section className="bfn-run-history">
            <header><div><h3>{t('bfn.runs.title')}</h3></div>{runs.length ? <button className="danger-text-button" type="button" onClick={onRequestClearRuns}>{t('bfn.runs.clear')}</button> : null}</header>
            {runs.length ? runs.map((run) => <button key={run.id} type="button" onClick={() => onSelectRun(run)}><span>{new Date(run.completedAt).toLocaleString(i18n.language)}</span><strong>{t(`bfn.modes.${run.mode}`)}</strong><code>{displayNumber(run.points.at(-1)?.output ?? 0)}</code></button>) : <p>{t('bfn.runs.empty')}</p>}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function AnnResultCard({ result }: { result: BfnSimulationResult }) {
  const { t } = useTranslation();
  const ann = result.annApproximation;
  if (!ann) return <section className="bfn-ann-card bfn-ann-card--absent"><header><strong>{t('bfn.ann.title')}</strong><StatusPill label={t('bfn.ann.notGenerated')} tone="neutral" /></header><p>{t('bfn.ann.fixedPointRule')}</p></section>;
  const equation = `y ≈ ${ann.weights.map((weight, index) => `${displayNumber(weight)}x${index + 1}`).join(' + ')} + ${displayNumber(ann.effectiveIntercept)}`;
  return <section className="bfn-ann-card" data-status={ann.status}><header><div><h3>{t('bfn.ann.title')}</h3></div><StatusPill label={t(`bfn.ann.${ann.status}`)} tone={ann.status === 'accepted' ? 'success' : 'warning'} /></header><p>{ann.status === 'accepted' ? t('bfn.results.chart.annAccepted') : t('bfn.results.chart.annRejected')}</p><details><summary>{t('bfn.ann.showMetrics')}</summary><p>{t('bfn.ann.method')}: {t('bfn.ann.methodValue')}</p><code>{equation}</code><dl><div><dt>R²</dt><dd>{ann.metrics.r2.toFixed(4)}</dd></div><div><dt>NRMSE</dt><dd>{(ann.metrics.nrmse * 100).toFixed(2)}%</dd></div><div><dt>{t('bfn.ann.maxError')}</dt><dd>{ann.metrics.maximumAbsoluteError.toFixed(4)}</dd></div><div><dt>{t('bfn.ann.coverage')}</dt><dd>{(ann.metrics.predictionIntervalCoverage * 100).toFixed(1)}%</dd></div></dl></details></section>;
}

function DynamicMetricsCard({ result }: { result: BfnSimulationResult }) {
  const { t } = useTranslation();
  const metrics = result.dynamicMetrics;
  if (!metrics) return null;
  return <section className="bfn-dynamic-metrics"><header><h3>{t('bfn.dynamic.title')}</h3></header><dl><div><dt>{t('bfn.dynamic.steady')}</dt><dd>{metrics.steadyValue.toFixed(3)}</dd></div><div><dt>{t('bfn.dynamic.riseTime')}</dt><dd>{metrics.riseTimeHours === null ? '—' : `${metrics.riseTimeHours.toFixed(2)} h`}</dd></div><div><dt>{t('bfn.dynamic.peak')}</dt><dd>{metrics.peakValue.toFixed(3)}</dd></div><div><dt>{t('bfn.dynamic.overshoot')}</dt><dd>{(metrics.overshootFraction * 100).toFixed(1)}%</dd></div><div><dt>DC gain</dt><dd>{metrics.dcGain === null ? '—' : metrics.dcGain.toFixed(4)}</dd></div><div><dt>|G(jω)|</dt><dd>{metrics.frequencyGain === null ? '—' : metrics.frequencyGain.magnitude.toFixed(4)}</dd></div></dl></section>;
}
