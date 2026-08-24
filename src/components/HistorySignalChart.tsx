import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  downsampleHistoryPoints,
  findNearestHistoryValues,
  type HistorySeries,
  type HistorySeriesId,
} from '../features/history/historyPresentation';

interface HistorySignalChartProps {
  series: HistorySeries[];
  visibleIds: ReadonlySet<HistorySeriesId>;
  onToggle: (id: HistorySeriesId) => void;
}

interface HoverState {
  elapsedMs: number;
  x: number;
  values: ReturnType<typeof findNearestHistoryValues>;
}

const viewBox = { width: 900, height: 330 };
const inset = { top: 24, right: 28, bottom: 38, left: 62 };
const plotWidth = viewBox.width - inset.left - inset.right;
const plotHeight = viewBox.height - inset.top - inset.bottom;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function HistorySignalChart({ series, visibleIds, onToggle }: HistorySignalChartProps) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<HoverState | null>(null);
  const visibleSeries = useMemo(
    () => series.filter((item) => visibleIds.has(item.id)),
    [series, visibleIds],
  );
  const domain = useMemo(() => {
    const points = visibleSeries.flatMap((item) => item.points);
    const maximumX = Math.max(1, ...points.map((point) => point.elapsedMs));
    const maximumY = Math.max(1, ...points.map((point) => point.value));
    return { maximumX, maximumY };
  }, [visibleSeries]);

  const xFor = (elapsedMs: number): number =>
    inset.left + (elapsedMs / domain.maximumX) * plotWidth;
  const yFor = (value: number): number =>
    inset.top + plotHeight - (value / domain.maximumY) * plotHeight;

  const paths = visibleSeries.map((item) => {
    const points = downsampleHistoryPoints(item.points);
    const d = points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${xFor(point.elapsedMs).toFixed(2)} ${yFor(point.value).toFixed(2)}`,
      )
      .join(' ');
    return { ...item, d };
  });

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    if (visibleSeries.every((item) => item.points.length === 0)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const viewX = ((event.clientX - bounds.left) / bounds.width) * viewBox.width;
    const x = clamp(viewX, inset.left, inset.left + plotWidth);
    const elapsedMs = ((x - inset.left) / plotWidth) * domain.maximumX;
    setHover({
      elapsedMs,
      x,
      values: findNearestHistoryValues(visibleSeries, elapsedMs),
    });
  };

  const hasVisibleData = visibleSeries.some((item) => item.points.length > 0);

  return (
    <section className="panel history-chart" aria-labelledby="history-chart-title">
      <div className="history-chart__heading">
        <div>
          <h3 id="history-chart-title">{t('history.curveTitle')}</h3>
          <span>{t('history.chartUnit')}</span>
        </div>
        <div className="history-chart__legend" aria-label={t('history.channels')}>
          {series.map((item) => {
            const visible = visibleIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={visible}
                className={visible ? 'is-active' : undefined}
                style={{ '--series-color': item.color } as CSSProperties}
                onClick={() => onToggle(item.id)}
              >
                <span aria-hidden="true" />
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="history-chart__stage">
        {hasVisibleData ? (
          <>
            <svg
              viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
              role="img"
              aria-label={t('history.curveTitle')}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
            >
              <g className="history-chart__grid" aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => {
                  const ratio = index / 5;
                  const y = inset.top + ratio * plotHeight;
                  const value = domain.maximumY * (1 - ratio);
                  return (
                    <g key={`horizontal-${index}`}>
                      <line x1={inset.left} x2={inset.left + plotWidth} y1={y} y2={y} />
                      <text x={inset.left - 12} y={y + 4} textAnchor="end">
                        {value.toFixed(0)}
                      </text>
                    </g>
                  );
                })}
                {Array.from({ length: 7 }, (_, index) => {
                  const ratio = index / 6;
                  const x = inset.left + ratio * plotWidth;
                  return (
                    <g key={`vertical-${index}`}>
                      <line x1={x} x2={x} y1={inset.top} y2={inset.top + plotHeight} />
                      <text x={x} y={viewBox.height - 12} textAnchor="middle">
                        {((domain.maximumX * ratio) / 1000).toFixed(1)} s
                      </text>
                    </g>
                  );
                })}
              </g>
              <g className="history-chart__series" aria-hidden="true">
                {paths.map((item) => (
                  <path key={item.id} d={item.d} style={{ stroke: item.color }} />
                ))}
              </g>
              {hover ? (
                <line
                  className="history-chart__crosshair"
                  x1={hover.x}
                  x2={hover.x}
                  y1={inset.top}
                  y2={inset.top + plotHeight}
                  aria-hidden="true"
                />
              ) : null}
            </svg>
            {hover ? (
              <div
                className="history-chart__tooltip"
                role="status"
                style={{ left: `${(hover.x / viewBox.width) * 100}%` }}
              >
                <strong>{(hover.elapsedMs / 1000).toFixed(1)} s</strong>
                {hover.values.map((item) => (
                  <span key={item.id}>
                    <i style={{ background: item.color }} />
                    {t(item.labelKey)}
                    <b>{item.value.toFixed(1)} a.u.</b>
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="history-chart__empty">{t('history.noCurveData')}</div>
        )}
      </div>
    </section>
  );
}
