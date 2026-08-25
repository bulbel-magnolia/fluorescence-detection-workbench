import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createBfnChartModel } from './chartModel';
import { nearestPointIndex } from './chartMath';
import type { BfnChartComparison, BfnChartModel, BfnChartViewState } from './chartTypes';
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
  comparison?: BfnChartComparison;
}

const width = 760;
const height = 300;
const padding = { left: 62, right: 24, top: 24, bottom: 48 } as const;
const geometry = { width, height, padding };

interface SvgLocalPoint {
  x: number;
  y: number;
}

function clientToSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): SvgLocalPoint | null {
  let screenMatrix: DOMMatrix | null = null;
  try {
    screenMatrix = svg.getScreenCTM?.() ?? null;
  } catch {
    screenMatrix = null;
  }
  if (screenMatrix) {
    try {
      const inverse = screenMatrix.inverse();
      if (typeof DOMPoint !== 'undefined') {
        const point = new DOMPoint(clientX, clientY).matrixTransform(inverse);
        if (Number.isFinite(point.x) && Number.isFinite(point.y)) return { x: point.x, y: point.y };
      }
      // DOMPoint is absent in some test DOMs. A 2D SVG matrix still provides
      // the same conversion without assuming that the element is unscaled.
      const determinant = inverse.a * inverse.d - inverse.b * inverse.c;
      if (Number.isFinite(determinant) && determinant !== 0) {
        const x = inverse.a * clientX + inverse.c * clientY + inverse.e;
        const y = inverse.b * clientX + inverse.d * clientY + inverse.f;
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
      }
    } catch {
      // Fall through to the preserveAspectRatio fallback used by JSDOM.
    }
  }

  const rect = svg.getBoundingClientRect();
  const renderedWidth = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : width;
  const renderedHeight = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : height;
  const scale = Math.min(renderedWidth / width, renderedHeight / height);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  // SVG defaults to preserveAspectRatio="xMidYMid meet" for a viewBox.
  const offsetX = (renderedWidth - width * scale) / 2;
  const offsetY = (renderedHeight - height * scale) / 2;
  return {
    x: (clientX - rect.left - offsetX) / scale,
    y: (clientY - rect.top - offsetY) / scale,
  };
}

/**
 * Identity for chart-local state. A run id can be reused by imported or
 * refreshed results, so point content is included to prevent stale cursors
 * and axis state from leaking into a replacement result.
 */
export function bfnChartResultIdentity(result: BfnSimulationResult | null): string {
  if (!result) return 'empty';
  return JSON.stringify({
    id: result.id,
    completedAt: result.completedAt,
    mode: result.mode,
    points: result.points.map((point) => ({
      coordinate: point.coordinate,
      timeHours: point.timeHours,
      output: point.output,
      lower: point.lower,
      upper: point.upper,
      extrapolated: point.extrapolated,
      inputs: point.inputs,
      moduleOutputs: point.moduleOutputs,
    })),
    ann: result.annApproximation?.id ?? null,
  });
}

export function BfnResponseChart({
  project: projectProp,
  result,
  viewState,
  onViewStateChange,
  onCursorIndexChange,
  model: suppliedModel,
  comparison,
}: BfnResponseChartProps) {
  const { t } = useTranslation();
  const project = projectProp ?? createDemoBfnProject();
  const resultIdentity = bfnChartResultIdentity(result);
  const defaultViewState = useMemo<BfnChartViewState>(() => result ? defaultBfnChartViewState(result) : {
    xScale: 'linear', yScale: 'linear', xDomainMode: 'auto', yDomainMode: 'auto',
    showFullModel: true, showUncertainty: true, showAnn: false, cursorIndex: null,
  }, [resultIdentity]);
  const [internalViewState, setInternalViewState] = useState<BfnChartViewState>(() =>
    defaultViewState,
  );
  const pointerRef = useRef<SVGSVGElement>(null);
  const previousResultIdentityRef = useRef(resultIdentity);
  const resultIdentityChanged = previousResultIdentityRef.current !== resultIdentity;
  if (resultIdentityChanged) previousResultIdentityRef.current = resultIdentity;
  const activeViewState = resultIdentityChanged
    ? { ...(viewState ?? internalViewState), cursorIndex: null }
    : viewState ?? internalViewState;

  useEffect(() => {
    if (viewState || resultIdentity === 'empty') return;
    setInternalViewState(defaultViewState);
  }, [defaultViewState, resultIdentity, viewState]);

  const model = useMemo(() => {
    if (!result) return null;
    return suppliedModel ?? createBfnChartModel({
      project,
      result,
      ...(comparison ? { comparison } : {}),
      viewState: activeViewState,
      geometry,
      translate: (key) => t(key),
    });
  }, [activeViewState, comparison, project, result, suppliedModel, t]);

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
    const localPoint = clientToSvgPoint(svg, event.clientX, event.clientY);
    if (!localPoint) return null;
    const { x: localX, y: localY } = localPoint;
    if (localX < 0 || localX > width || localY < 0 || localY > height) return null;
    if (localX < padding.left || localX > width - padding.right || localY < padding.top || localY > height - padding.bottom) return null;
    return model.scales.x.invert(localX);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!result || !model) return;
    const coordinate = pointerCoordinate(event);
    if (coordinate === null) return;
    const visiblePoints = result.points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.coordinate >= model.domains.x[0] && point.coordinate <= model.domains.x[1]);
    const nearestIndex = nearestPointIndex(visiblePoints.map(({ point }) => point), coordinate);
    if (nearestIndex >= 0) updateView(visiblePoints[nearestIndex]?.index ?? null);
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
    <div className="bfn-chart" data-mode={result.mode} onPointerLeave={() => updateView(null)}>
      <svg
        ref={pointerRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        aria-describedby="bfn-chart-focus-instructions"
        tabIndex={0}
        onPointerMove={handlePointerMove}
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
        {model.series.comparison ? <path className="bfn-chart__comparison" data-run-role="comparison" d={model.series.comparison.path} /> : null}
        {model.series.ann ? <path className="bfn-chart__ann" data-status={result.annApproximation?.status} d={model.series.ann.path} /> : null}
        {model.series.full ? <path className="bfn-chart__line" d={model.series.full.path} /> : null}
        {cursor ? (
          <>
            <line className="bfn-chart__crosshair" data-index={cursor.index} x1={cursor.x} x2={cursor.x} y1={padding.top} y2={height - padding.bottom} />
            <circle className="bfn-chart__cursor" data-index={cursor.index} cx={cursor.x} cy={cursor.y} r="5" />
            {cursor.comparison ? (
              <circle
                className="bfn-chart__comparison-cursor"
                data-index={cursor.comparison.index}
                data-coordinate={cursor.comparison.coordinate}
                cx={cursor.comparison.x}
                cy={cursor.comparison.y}
                r="4"
              />
            ) : null}
          </>
        ) : null}
        <text className="bfn-chart__axis-label" x={width / 2} y={height - 2} textAnchor="middle">{model.labels.x}</text>
        <text className="bfn-chart__axis-label" x="14" y={height / 2} textAnchor="middle" transform={`rotate(-90 14 ${height / 2})`}>{model.labels.y}</text>
      </svg>
      <p id="bfn-chart-focus-instructions" className="bfn-chart__focus-instructions">{t('bfn.results.chart.focusInstructions')}</p>
      {cursor ? <BfnChartTooltip project={project} result={result} {...(comparison ? { comparison } : {})} model={model} cursor={cursor} /> : null}
      <div className="bfn-chart__legend" aria-label={t('bfn.results.chart.series')}>
        {model.series.full ? <span data-kind="full">{model.series.full.label}</span> : null}
        {model.series.uncertainty ? <span data-kind="uncertainty">{t('bfn.results.chart.uncertaintyBand')}</span> : null}
        {model.series.ann ? <span data-kind="ann">{t('bfn.results.chart.annOverlay')}</span> : null}
        {model.series.comparison ? <span data-kind="comparison">{model.series.comparison.label}</span> : null}
      </div>
    </div>
  );
}
