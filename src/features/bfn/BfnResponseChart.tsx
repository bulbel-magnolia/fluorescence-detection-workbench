import { useTranslation } from 'react-i18next';
import type { BfnSimulationPoint, BfnSimulationResult } from './types';

interface BfnResponseChartProps {
  result: BfnSimulationResult | null;
}

const width = 760;
const height = 300;
const padding = { left: 62, right: 24, top: 24, bottom: 48 };

function extent(values: number[], fallback: readonly [number, number]): readonly [number, number] {
  if (values.length === 0) return fallback;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (Math.abs(maximum - minimum) < Number.EPSILON) return [minimum, minimum + 1];
  return [minimum, maximum];
}

function pathFor(
  points: readonly BfnSimulationPoint[],
  value: (point: BfnSimulationPoint) => number,
  scaleX: (value: number) => number,
  scaleY: (value: number) => number,
): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${scaleX(point.coordinate)} ${scaleY(value(point))}`,
    )
    .join(' ');
}

export function BfnResponseChart({ result }: BfnResponseChartProps) {
  const { t } = useTranslation();
  if (!result || result.points.length === 0) {
    return (
      <div className="bfn-chart bfn-chart--empty" role="img" aria-label={t('bfn.results.empty')}>
        <span className="bfn-chart__empty-orbit" aria-hidden="true" />
        <strong>{t('bfn.results.empty')}</strong>
        <small>{t('bfn.results.emptyHint')}</small>
      </div>
    );
  }
  const points = result.points;
  const [xMinimum, xMaximum] = extent(
    points.map((point) => point.coordinate),
    [0, 1],
  );
  const [rawYMinimum, rawYMaximum] = extent(
    points.flatMap((point) => [point.lower, point.upper, point.output]),
    [0, 1],
  );
  const yMinimum = Math.min(0, rawYMinimum);
  const yMaximum = Math.max(1, rawYMaximum);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const scaleX = (value: number): number =>
    padding.left + ((value - xMinimum) / (xMaximum - xMinimum)) * innerWidth;
  const scaleY = (value: number): number =>
    padding.top + innerHeight - ((value - yMinimum) / (yMaximum - yMinimum)) * innerHeight;
  const upper = pathFor(points, (point) => point.upper, scaleX, scaleY);
  const lower = [...points]
    .reverse()
    .map((point) => `L ${scaleX(point.coordinate)} ${scaleY(point.lower)}`)
    .join(' ');
  const band = `${upper} ${lower} Z`;
  const ann = result.annApproximation;
  const annPath = ann
    ? pathFor(
        points,
        (point) =>
          ann.inputSourceIds.reduce(
            (sum, sourceId, index) =>
              sum + (point.inputs[sourceId] ?? 0) * (ann.weights[index] ?? 0),
            ann.effectiveIntercept,
          ),
        scaleX,
        scaleY,
      )
    : null;
  const ticks = Array.from({ length: 5 }, (_, index) => index / 4);
  return (
    <div className="bfn-chart" data-mode={result.mode}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          result.mode === 'static' ? t('bfn.results.staticChart') : t('bfn.results.dynamicChart')
        }
      >
        <title>
          {result.mode === 'static' ? t('bfn.results.staticChart') : t('bfn.results.dynamicChart')}
        </title>
        {ticks.map((tick) => {
          const y = padding.top + innerHeight * tick;
          const value = yMaximum - (yMaximum - yMinimum) * tick;
          return (
            <g key={`y-${tick}`}>
              <line
                className="bfn-chart__grid"
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
              />
              <text className="bfn-chart__tick" x={padding.left - 10} y={y + 4} textAnchor="end">
                {value.toFixed(2)}
              </text>
            </g>
          );
        })}
        {ticks.map((tick) => {
          const x = padding.left + innerWidth * tick;
          const value = xMinimum + (xMaximum - xMinimum) * tick;
          return (
            <text
              className="bfn-chart__tick"
              key={`x-${tick}`}
              x={x}
              y={height - 18}
              textAnchor="middle"
            >
              {value.toFixed(value >= 10 ? 0 : 1)}
            </text>
          );
        })}
        <path className="bfn-chart__band" d={band} />
        {annPath ? <path className="bfn-chart__ann" d={annPath} data-status={ann?.status} /> : null}
        <path
          className="bfn-chart__line"
          d={pathFor(points, (point) => point.output, scaleX, scaleY)}
        />
        <circle
          className="bfn-chart__endpoint"
          cx={scaleX(points.at(-1)?.coordinate ?? 0)}
          cy={scaleY(points.at(-1)?.output ?? 0)}
          r="4.5"
        />
        <text className="bfn-chart__axis-label" x={width / 2} y={height - 2} textAnchor="middle">
          {result.mode === 'static' ? t('bfn.results.inputAxis') : t('bfn.results.timeAxis')}
        </text>
        <text
          className="bfn-chart__axis-label"
          x="14"
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${height / 2})`}
        >
          {t('bfn.results.outputAxis')}
        </text>
      </svg>
      <div className="bfn-chart__legend">
        <span data-kind="full">{t('bfn.results.fullModel')}</span>
        <span data-kind="uncertainty">{t('bfn.results.uncertaintyBand')}</span>
        {ann ? <span data-kind="ann">{t('bfn.results.annOverlay')}</span> : null}
      </div>
    </div>
  );
}
