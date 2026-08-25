import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createBfnChartModel } from './chartModel';
import { nearestPointIndex } from './chartMath';
import type { BfnChartModel, BfnChartViewState } from './chartTypes';
import { defaultBfnChartViewState } from './chartTypes';
import { createDemoBfnProject } from './fixtures';
import { BfnChartTooltip } from './BfnChartTooltip';
import type { BfnProject, BfnSimulationResult } from './types';

export interface BfnResponseChartProps {
  project?: BfnProject;
  result: BfnSimulationResult | null;
  viewState?: BfnChartViewState;
  onViewStateChange?: (next: BfnChartViewState) => void;
  onCursorIndexChange?: (index: number | null) => void;
  model?: BfnChartModel;
}

const width = 760;
const height = 300;
const padding = { left: 62, right: 24, top: 24, bottom: 48 } as const;
const geometry = { width, height, padding };

export function BfnResponseChart({
  project: projectProp,
  result,
  viewState,
  onViewStateChange,
  onCursorIndexChange,
  model: suppliedModel,
}: BfnResponseChartProps) {
  const { t } = useTranslation();
  const project = projectProp ?? createDemoBfnProject();
  const [internalViewState, setInternalViewState] = useState<BfnChartViewState>(() =>
    result ? defaultBfnChartViewState(result) : {
      xScale: 'linear', yScale: 'linear', xDomainMode: 'auto', yDomainMode: 'auto',
      showFullModel: true, showUncertainty: true, showAnn: false, cursorIndex: null,
    },
  );
  const pointerRef = useRef<SVGSVGElement>(null);
  const activeViewState = viewState ?? internalViewState;

  useEffect(() => {
    if (viewState || !result) return;
    setInternalViewState(defaultBfnChartViewState(result));
  }, [result?.id, viewState]);

  const model = useMemo(() => {
    if (!result) return null;
    return suppliedModel ?? createBfnChartModel({
      project,
      result,
      viewState: activeViewState,
      geometry,
      translate: (key) => t(key),
    });
  }, [activeViewState, project, result, suppliedModel, t]);

  const updateView = (cursorIndex: number | null): void => {
    if (!result || activeViewState.cursorIndex === cursorIndex) return;
    const next = { ...activeViewState, cursorIndex };
    if (onCursorIndexChange) onCursorIndexChange(cursorIndex);
    if (onViewStateChange) onViewStateChange(next);
    else setInternalViewState(next);
  };

  const pointerCoordinate = (event: React.PointerEvent<SVGSVGElement>): number | null => {
    const svg = pointerRef.current;
    if (!svg || !model) return null;
    const rect = svg.getBoundingClientRect();
    const renderedWidth = rect.width || width;
    const renderedHeight = rect.height || height;
    const localX = ((event.clientX - rect.left) / renderedWidth) * width;
    const localY = ((event.clientY - rect.top) / renderedHeight) * height;
    if (localX < padding.left || localX > width - padding.right || localY < padding.top || localY > height - padding.bottom) return null;
    return model.scales.x.invert(localX);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!result) return;
    const coordinate = pointerCoordinate(event);
    if (coordinate === null) return;
    const index = nearestPointIndex(result.points, coordinate);
    if (index >= 0) updateView(index);
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>): void => {
    if (!result || event.ctrlKey || event.metaKey) return;
    const lastIndex = result.points.length - 1;
    let nextIndex: number | null = activeViewState.cursorIndex;
    if (event.key === 'ArrowLeft') {
      nextIndex = activeViewState.cursorIndex === null ? lastIndex : Math.max(0, activeViewState.cursorIndex - 1);
    } else if (event.key === 'ArrowRight') {
      nextIndex = activeViewState.cursorIndex === null ? 0 : Math.min(lastIndex, activeViewState.cursorIndex + 1);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = lastIndex;
    } else if (event.key === 'Escape') {
      nextIndex = null;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateView(nextIndex);
  };

  if (!result || result.points.length === 0 || !model) {
    return (
      <div className="bfn-chart bfn-chart--empty" role="img" aria-label={t('bfn.results.empty')}>
        <span className="bfn-chart__empty-orbit" aria-hidden="true" />
        <strong>{t('bfn.results.empty')}</strong>
        <small>{t('bfn.results.emptyHint')}</small>
      </div>
    );
  }

  const title = result.mode === 'static' ? t('bfn.results.staticChart') : t('bfn.results.dynamicChart');
  const cursor = model.cursor;
  return (
    <div className="bfn-chart" data-mode={result.mode}>
      <svg
        ref={pointerRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        aria-describedby="bfn-chart-focus-instructions"
        tabIndex={0}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => updateView(null)}
        onKeyDown={handleKeyDown}
      >
        <title>{title}</title>
        {model.ticks.y.map((tick) => (
          <g key={`y-${tick.value}-${tick.position}`}>
            <line className="bfn-chart__grid" x1={padding.left} x2={width - padding.right} y1={tick.position} y2={tick.position} />
            <text className="bfn-chart__tick" x={padding.left - 10} y={tick.position + 4} textAnchor="end">{tick.label}</text>
          </g>
        ))}
        {model.ticks.x.map((tick) => (
          <text className="bfn-chart__tick" key={`x-${tick.value}-${tick.position}`} x={tick.position} y={height - 18} textAnchor="middle">{tick.label}</text>
        ))}
        {model.series.uncertainty ? <path className="bfn-chart__band" d={model.series.uncertainty.path} /> : null}
        {model.series.comparison ? <path className="bfn-chart__comparison" d={model.series.comparison.path} /> : null}
        {model.series.ann ? <path className="bfn-chart__ann" data-status={result.annApproximation?.status} d={model.series.ann.path} /> : null}
        {model.series.full ? <path className="bfn-chart__line" d={model.series.full.path} /> : null}
        {cursor ? (
          <>
            <line className="bfn-chart__crosshair" data-index={cursor.index} x1={cursor.x} x2={cursor.x} y1={padding.top} y2={height - padding.bottom} />
            <circle className="bfn-chart__cursor" data-index={cursor.index} cx={cursor.x} cy={cursor.y} r="5" />
          </>
        ) : null}
        <text className="bfn-chart__axis-label" x={width / 2} y={height - 2} textAnchor="middle">{model.labels.x}</text>
        <text className="bfn-chart__axis-label" x="14" y={height / 2} textAnchor="middle" transform={`rotate(-90 14 ${height / 2})`}>{model.labels.y}</text>
      </svg>
      <p id="bfn-chart-focus-instructions" className="bfn-chart__focus-instructions">{t('bfn.results.chart.focusInstructions')}</p>
      {cursor ? <BfnChartTooltip project={project} result={result} model={model} cursor={cursor} /> : null}
      <div className="bfn-chart__legend" aria-label={t('bfn.results.chart.series')}>
        {model.series.full ? <span data-kind="full">{t('bfn.results.chart.fullModel')}</span> : null}
        {model.series.uncertainty ? <span data-kind="uncertainty">{t('bfn.results.chart.uncertaintyBand')}</span> : null}
        {model.series.ann ? <span data-kind="ann">{t('bfn.results.chart.annOverlay')}</span> : null}
      </div>
    </div>
  );
}
