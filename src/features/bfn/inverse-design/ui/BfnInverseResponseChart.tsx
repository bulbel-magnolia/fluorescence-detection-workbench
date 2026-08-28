import type {
  BfnCatalogInverseCurvePoint,
  BfnCatalogInverseTarget,
} from '../catalogInverseDesignTypes';
import {
  formatConcentration,
  type BfnCatalogInverseConcentrationUnit,
} from './catalogInverseDesignUnits';

interface BfnInverseResponseChartCurve {
  id: string;
  label: string;
  points: readonly BfnCatalogInverseCurvePoint[];
}

interface BfnInverseResponseChartProps {
  curves: readonly BfnInverseResponseChartCurve[];
  target: BfnCatalogInverseTarget;
  concentrationUnit: BfnCatalogInverseConcentrationUnit;
  locale: string;
  ariaLabel: string;
}

const WIDTH = 640;
const HEIGHT = 250;
const LEFT = 54;
const RIGHT = 16;
const TOP = 16;
const BOTTOM = 38;

export function BfnInverseResponseChart({
  curves,
  target,
  concentrationUnit,
  locale,
  ariaLabel,
}: BfnInverseResponseChartProps) {
  const allPoints = curves.flatMap((curve) => curve.points);
  const minimumM = Math.min(
    target.responseWindow.lowConcentrationM,
    ...allPoints.map((point) => point.concentrationM),
  );
  const maximumM = Math.max(
    target.responseWindow.highConcentrationM,
    ...allPoints.map((point) => point.concentrationM),
  );
  const minimumLog = Math.log10(minimumM);
  const maximumLog = Math.log10(maximumM);
  const logSpan = Math.max(Number.EPSILON, maximumLog - minimumLog);
  const x = (concentrationM: number) =>
    LEFT + ((Math.log10(concentrationM) - minimumLog) / logSpan) * (WIDTH - LEFT - RIGHT);
  const y = (response: number) => TOP + (1 - response) * (HEIGHT - TOP - BOTTOM);
  const pathFor = (points: readonly BfnCatalogInverseCurvePoint[]) =>
    points
      .map((point, index) =>
        `${index === 0 ? 'M' : 'L'} ${x(point.concentrationM).toFixed(2)} ${y(point.response).toFixed(2)}`,
      )
      .join(' ');

  const lowX = x(target.responseWindow.lowConcentrationM);
  const highX = x(target.responseWindow.highConcentrationM);
  const lowY = y(target.responseWindow.lowResponseMaximum);
  const highY = y(target.responseWindow.highResponseMinimum);

  return (
    <figure className='bfn-inverse-chart'>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role='img' aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        <line className='bfn-inverse-chart__axis' x1={LEFT} x2={LEFT} y1={TOP} y2={HEIGHT - BOTTOM} />
        <line
          className='bfn-inverse-chart__axis'
          x1={LEFT}
          x2={WIDTH - RIGHT}
          y1={HEIGHT - BOTTOM}
          y2={HEIGHT - BOTTOM}
        />
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line
              className='bfn-inverse-chart__grid'
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text x={LEFT - 9} y={y(tick) + 4} textAnchor='end'>
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        <line
          className='bfn-inverse-chart__constraint bfn-inverse-chart__constraint--low'
          x1={LEFT}
          x2={lowX}
          y1={lowY}
          y2={lowY}
        />
        <line
          className='bfn-inverse-chart__constraint bfn-inverse-chart__constraint--high'
          x1={highX}
          x2={WIDTH - RIGHT}
          y1={highY}
          y2={highY}
        />
        <line
          className='bfn-inverse-chart__marker'
          x1={lowX}
          x2={lowX}
          y1={TOP}
          y2={HEIGHT - BOTTOM}
        />
        <line
          className='bfn-inverse-chart__marker'
          x1={highX}
          x2={highX}
          y1={TOP}
          y2={HEIGHT - BOTTOM}
        />
        {curves.map((curve, index) => (
          <path
            key={curve.id}
            className={`bfn-inverse-chart__curve bfn-inverse-chart__curve--${index + 1}`}
            d={pathFor(curve.points)}
          />
        ))}
        <circle className='bfn-inverse-chart__constraint-point' cx={lowX} cy={lowY} r={3.5} />
        <circle className='bfn-inverse-chart__constraint-point' cx={highX} cy={highY} r={3.5} />
        <text x={lowX} y={HEIGHT - 14} textAnchor='start'>
          {formatConcentration(target.responseWindow.lowConcentrationM, concentrationUnit, locale)}
        </text>
        <text x={highX} y={HEIGHT - 14} textAnchor='end'>
          {formatConcentration(target.responseWindow.highConcentrationM, concentrationUnit, locale)}
        </text>
      </svg>
      {curves.length > 1 ? (
        <figcaption className='bfn-inverse-chart__legend'>
          {curves.map((curve, index) => (
            <span key={curve.id} data-curve={index + 1}>
              <i aria-hidden='true' />
              {curve.label}
            </span>
          ))}
        </figcaption>
      ) : null}
    </figure>
  );
}
