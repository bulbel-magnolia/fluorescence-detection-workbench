import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { evaluateLogEligibility, validateManualDomain } from './chartMath';
import type {
  BfnChartAxis,
  BfnChartComparison,
  BfnChartModel,
  BfnChartScale,
  BfnChartViewState,
} from './chartTypes';
import type { BfnProject, BfnSimulationResult } from './types';
import { bfnChartResultIdentity } from './BfnResponseChart';

interface BfnChartControlsProps {
  project?: BfnProject;
  result: BfnSimulationResult;
  model: BfnChartModel;
  viewState: BfnChartViewState;
  comparison?: BfnChartComparison;
  onViewStateChange: (next: BfnChartViewState) => void;
  onReset: () => void;
}

type DraftValues = Record<'xMin' | 'xMax' | 'yMin' | 'yMax', string>;

function inputValue(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '' : String(value);
}

function reasonText(reason: string | undefined, value: number | undefined, t: TFunction): string {
  if (reason === 'non_positive_visible_value') {
    return t('bfn.results.chart.logValue', { value: value ?? '—' });
  }
  if (reason === 'no_visible_values') return t('bfn.results.chart.noVisibleValues');
  if (reason === 'log_domain_requires_positive_values') return t('bfn.results.chart.logPositive');
  if (reason === 'minimum_not_less_than_maximum' || reason === 'domain_values_must_be_finite') {
    return t('bfn.results.chart.invalidDomain');
  }
  return t('bfn.results.chart.logPositive');
}

export function BfnChartControls({
  result,
  model,
  viewState,
  comparison,
  onViewStateChange,
  onReset,
}: BfnChartControlsProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DraftValues>({
    xMin: inputValue(viewState.xMinimum),
    xMax: inputValue(viewState.xMaximum),
    yMin: inputValue(viewState.yMinimum),
    yMax: inputValue(viewState.yMaximum),
  });
  const [errors, setErrors] = useState<Record<'x' | 'y', string | undefined>>({ x: undefined, y: undefined });
  const [seriesError, setSeriesError] = useState<string | undefined>(undefined);
  const resultFeedbackIdentity = bfnChartResultIdentity(result);

  useEffect(() => {
    setDraft({
      xMin: inputValue(viewState.xMinimum),
      xMax: inputValue(viewState.xMaximum),
      yMin: inputValue(viewState.yMinimum),
      yMax: inputValue(viewState.yMaximum),
    });
  }, [viewState.xMaximum, viewState.xMinimum, viewState.yMaximum, viewState.yMinimum]);

  useEffect(() => {
    setErrors({ x: undefined, y: undefined });
    setSeriesError(undefined);
  }, [resultFeedbackIdentity]);

  const visibility = {
    showFullModel: viewState.showFullModel,
    showUncertainty: viewState.showUncertainty,
    showAnn: viewState.showAnn,
  };

  const setSeries = (kind: 'showFullModel' | 'showUncertainty' | 'showAnn'): void => {
    const next = !viewState[kind];
    if (kind === 'showFullModel' && !next) {
      setSeriesError(t('bfn.results.chart.lastSeriesExplanation'));
      return;
    }
    if (kind === 'showAnn' && !next && !viewState.showFullModel) {
      setSeriesError(t('bfn.results.chart.lastSeriesExplanation'));
      return;
    }
    onViewStateChange({ ...viewState, [kind]: next });
    setSeriesError(undefined);
  };

  const setScale = (axis: BfnChartAxis, scale: BfnChartScale): void => {
    if (scale === 'log') {
      const mode = axis === 'x' ? viewState.xDomainMode : viewState.yDomainMode;
      if (mode === 'manual') {
        const minimumRaw = axis === 'x' ? draft.xMin : draft.yMin;
        const maximumRaw = axis === 'x' ? draft.xMax : draft.yMax;
        const minimum = minimumRaw.trim() === '' ? Number.NaN : Number(minimumRaw);
        const maximum = maximumRaw.trim() === '' ? Number.NaN : Number(maximumRaw);
        const manualValidation = validateManualDomain([minimum, maximum], 'log');
        if (!manualValidation.valid) {
          setErrors((current) => ({
            ...current,
            [axis]: reasonText(manualValidation.reason, undefined, t),
          }));
          return;
        }
      }
      const eligibility = evaluateLogEligibility(
        axis,
        model.domains.x,
        result,
        visibility,
        comparison,
      );
      if (!eligibility.valid) {
        setErrors((current) => ({
          ...current,
          [axis]: reasonText(eligibility.reason, eligibility.value, t),
        }));
        return;
      }
    }
    onViewStateChange({ ...viewState, [axis === 'x' ? 'xScale' : 'yScale']: scale });
    setErrors((current) => ({ ...current, [axis]: undefined }));
  };

  const setRangeMode = (axis: BfnChartAxis, mode: 'auto' | 'manual'): void => {
    if (mode === 'auto') {
      const next = { ...viewState, [axis === 'x' ? 'xDomainMode' : 'yDomainMode']: mode };
      if (axis === 'x') {
        delete next.xMinimum;
        delete next.xMaximum;
      } else {
        delete next.yMinimum;
        delete next.yMaximum;
      }
      onViewStateChange(next);
      setErrors((current) => ({ ...current, [axis]: undefined }));
      return;
    }
    const minimum = axis === 'x' ? model.domains.x[0] : model.domains.y[0];
    const maximum = axis === 'x' ? model.domains.x[1] : model.domains.y[1];
    setDraft((current) => ({
      ...current,
      ...(axis === 'x' ? { xMin: String(minimum), xMax: String(maximum) } : { yMin: String(minimum), yMax: String(maximum) }),
    }));
    const validated = validateManualDomain([minimum, maximum], axis === 'x' ? viewState.xScale : viewState.yScale);
    if (!validated.valid) {
      setErrors((current) => ({ ...current, [axis]: t('bfn.results.chart.invalidDomain') }));
      return;
    }
    onViewStateChange({
      ...viewState,
      [axis === 'x' ? 'xDomainMode' : 'yDomainMode']: mode,
      ...(axis === 'x' ? { xMinimum: minimum, xMaximum: maximum } : { yMinimum: minimum, yMaximum: maximum }),
    });
    setErrors((current) => ({ ...current, [axis]: undefined }));
  };

  const updateDraft = (axis: BfnChartAxis, side: 'min' | 'max', raw: string): void => {
    const key = axis === 'x' ? (side === 'min' ? 'xMin' : 'xMax') : side === 'min' ? 'yMin' : 'yMax';
    const nextDraft = { ...draft, [key]: raw };
    setDraft(nextDraft);
    const minimumRaw = nextDraft[axis === 'x' ? 'xMin' : 'yMin'];
    const maximumRaw = nextDraft[axis === 'x' ? 'xMax' : 'yMax'];
    const minimum = minimumRaw.trim() === '' ? Number.NaN : Number(minimumRaw);
    const maximum = maximumRaw.trim() === '' ? Number.NaN : Number(maximumRaw);
    const scale = axis === 'x' ? viewState.xScale : viewState.yScale;
    const validated = validateManualDomain([minimum, maximum], scale);
    if (!validated.valid) {
      setErrors((current) => ({
        ...current,
        [axis]: validated.reason === 'log_domain_requires_positive_values'
          ? t('bfn.results.chart.logPositive')
          : t('bfn.results.chart.invalidDomain'),
      }));
      return;
    }
    setErrors((current) => ({ ...current, [axis]: undefined }));
    onViewStateChange({
      ...viewState,
      [axis === 'x' ? 'xDomainMode' : 'yDomainMode']: 'manual',
      ...(axis === 'x' ? { xMinimum: minimum, xMaximum: maximum } : { yMinimum: minimum, yMaximum: maximum }),
    });
  };

  const axisControls = (axis: BfnChartAxis) => {
    const scale = axis === 'x' ? viewState.xScale : viewState.yScale;
    const mode = axis === 'x' ? viewState.xDomainMode : viewState.yDomainMode;
    const minimum = axis === 'x' ? draft.xMin : draft.yMin;
    const maximum = axis === 'x' ? draft.xMax : draft.yMax;
    const label = axis === 'x' ? t('bfn.results.chart.xAxis') : t('bfn.results.chart.yAxis');
    return (
      <details className="bfn-chart-axis" data-axis={axis} key={axis}>
        <summary>{label}</summary>
        <div className="bfn-chart-axis__body">
          <span className="bfn-chart-axis__label">{t('bfn.results.chart.scale')}</span>
          <div className="bfn-chart-axis__segmented">
            <button type="button" aria-pressed={scale === 'linear'} onClick={() => setScale(axis, 'linear')}>
              {t('bfn.results.chart.linear')}
            </button>
            <button type="button" aria-pressed={scale === 'log'} onClick={() => setScale(axis, 'log')}>
              {t('bfn.results.chart.log10')}
            </button>
          </div>
          <span className="bfn-chart-axis__label">{t('bfn.results.chart.range')}</span>
          <div className="bfn-chart-axis__segmented">
            <button type="button" aria-pressed={mode === 'auto'} onClick={() => setRangeMode(axis, 'auto')}>
              {t('bfn.results.chart.auto')}
            </button>
            <button type="button" aria-pressed={mode === 'manual'} onClick={() => setRangeMode(axis, 'manual')}>
              {t('bfn.results.chart.manual')}
            </button>
          </div>
          {mode === 'manual' ? (
            <div className="bfn-chart-axis__range-fields">
              <label>
                <span>{t('bfn.results.chart.min')}</span>
                <input type="number" value={minimum} onChange={(event) => updateDraft(axis, 'min', event.target.value)} />
              </label>
              <label>
                <span>{t('bfn.results.chart.max')}</span>
                <input type="number" value={maximum} onChange={(event) => updateDraft(axis, 'max', event.target.value)} />
              </label>
            </div>
          ) : null}
          {errors[axis] ? <p className="bfn-chart-axis__error" role="status">{errors[axis]}</p> : null}
        </div>
      </details>
    );
  };

  const resetView = (): void => {
    setErrors({ x: undefined, y: undefined });
    setSeriesError(undefined);
    onReset();
  };

  return (
    <div className="bfn-chart-controls" aria-label={t('bfn.results.chart.series')}>
      <div className="bfn-chart-controls__series">
        <span>{t('bfn.results.chart.series')}</span>
        <button type="button" data-series="full" aria-pressed={viewState.showFullModel} onClick={() => setSeries('showFullModel')}>
          {t('bfn.results.chart.fullModel')}
        </button>
        <button type="button" data-series="uncertainty" aria-pressed={viewState.showUncertainty} onClick={() => setSeries('showUncertainty')}>
          {t('bfn.results.chart.uncertaintyBand')}
        </button>
        {result.annApproximation ? (
          <button type="button" data-series="ann" aria-pressed={viewState.showAnn} onClick={() => setSeries('showAnn')}>
            {t('bfn.results.chart.annOverlay')}
          </button>
        ) : null}
      </div>
      <div className="bfn-chart-controls__axes">
        <span>{t('bfn.results.chart.axes')}</span>
        {axisControls('x')}
        {axisControls('y')}
      </div>
      <button type="button" className="bfn-chart-controls__reset" onClick={resetView}>
        {t('bfn.results.chart.resetView')}
      </button>
      {seriesError ? <p className="bfn-chart-controls__error" role="status">{seriesError}</p> : null}
    </div>
  );
}

export type { BfnChartControlsProps };
