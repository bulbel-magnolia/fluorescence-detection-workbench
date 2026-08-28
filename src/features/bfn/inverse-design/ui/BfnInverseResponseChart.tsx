import { useTranslation } from 'react-i18next';
import type {
  BfnCatalogInverseCurvePoint,
  BfnCatalogInverseTarget,
} from '../catalogInverseDesignTypes';
import {
  formatConcentrationValue,
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
const HEIGHT = 280;
const LEFT = 70;
const RIGHT = 22;
const TOP = 18;
const BOTTOM = 62;
const CONSTRAINT_SEGMENT_RATIO = 0.08;

export function BfnInverseResponseChart({
  curves,
  target,
  concentrationUnit,
  ariaLabel,
}: BfnInverseResponseChartProps) {
  const { t } = useTranslation();
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
  const plotRight = WIDTH - RIGHT;
  const plotBottom = HEIGHT - BOTTOM;
  const plotWidth = plotRight - LEFT;
  const x = (concentrationM: number) =>
    LEFT + ((Math.log10(concentrationM) - minimumLog) / logSpan) * plotWidth;
  const y = (response: number) => TOP + (1 - response) * (plotBottom - TOP);
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
  const segmentLength = plotWidth * CONSTRAINT_SEGMENT_RATIO;
  const [lowSegmentStart, lowSegmentEnd] = centeredSegment(
    lowX,
    LEFT,
    plotRight,
    segmentLength,
  );
  const [highSegmentStart, highSegmentEnd] = centeredSegment(
    highX,
    LEFT,
    plotRight,
    segmentLength,
  );
  const xTicks = createReadableLogTicks(minimumLog, maximumLog);

  return (
    <figure className='bfn-inverse-chart'>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role='img' aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        <line className='bfn-inverse-chart__axis' x1={LEFT} x2={LEFT} y1={TOP} y2={plotBottom} />
        <line
          className='bfn-inverse-chart__axis'
          x1={LEFT}
          x2={plotRight}
          y1={plotBottom}
          y2={plotBottom}
        />
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line
              className='bfn-inverse-chart__grid'
              x1={LEFT}
              x2={plotRight}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text x={LEFT - 10} y={y(tick) + 4} textAnchor='end'>
              {tick.toString()}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => {
          const tickX = x(tick);
          return (
            <g key={tick}>
              <line
                className='bfn-inverse-chart__grid bfn-inverse-chart__grid--vertical'
                x1={tickX}
                x2={tickX}
                y1={TOP}
                y2={plotBottom}
              />
              <line
                className='bfn-inverse-chart__axis'
                x1={tickX}
                x2={tickX}
                y1={plotBottom}
                y2={plotBottom + 5}
              />
              <text x={tickX} y={plotBottom + 20} textAnchor='middle'>
                {formatConcentrationValue(tick, concentrationUnit)}
              </text>
            </g>
          );
        })}
        <line
          className='bfn-inverse-chart__constraint bfn-inverse-chart__constraint--low'
          data-constraint='low'
          data-testid='bfn-inverse-low-constraint'
          x1={lowSegmentStart}
          x2={lowSegmentEnd}
          y1={lowY}
          y2={lowY}
        />
        <line
          className='bfn-inverse-chart__constraint bfn-inverse-chart__constraint--high'
          data-constraint='high'
          data-testid='bfn-inverse-high-constraint'
          x1={highSegmentStart}
          x2={highSegmentEnd}
          y1={highY}
          y2={highY}
        />
        <text
          className='bfn-inverse-chart__constraint-label'
          x={(lowSegmentStart + lowSegmentEnd) / 2}
          y={constraintLabelY(lowY)}
          textAnchor='middle'
        >
          {`≤ ${formatResponseThreshold(target.responseWindow.lowResponseMaximum)}`}
        </text>
        <text
          className='bfn-inverse-chart__constraint-label'
          x={(highSegmentStart + highSegmentEnd) / 2}
          y={constraintLabelY(highY)}
          textAnchor='middle'
        >
          {`≥ ${formatResponseThreshold(target.responseWindow.highResponseMinimum)}`}
        </text>
        <line
          className='bfn-inverse-chart__marker'
          x1={lowX}
          x2={lowX}
          y1={TOP}
          y2={plotBottom}
        />
        <line
          className='bfn-inverse-chart__marker'
          x1={highX}
          x2={highX}
          y1={TOP}
          y2={plotBottom}
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
        <text
          className='bfn-inverse-chart__axis-title'
          x={(LEFT + plotRight) / 2}
          y={HEIGHT - 11}
          textAnchor='middle'
        >
          {t('bfn.inverseDesign.chart.concentrationAxis', { unit: concentrationUnit })}
        </text>
        <text
          className='bfn-inverse-chart__axis-title'
          transform={`translate(18 ${(TOP + plotBottom) / 2}) rotate(-90)`}
          textAnchor='middle'
        >
          {t('bfn.inverseDesign.chart.responseAxis')}
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

function centeredSegment(
  center: number,
  minimum: number,
  maximum: number,
  length: number,
): readonly [number, number] {
  const boundedLength = Math.min(length, maximum - minimum);
  const start = Math.min(Math.max(center - boundedLength / 2, minimum), maximum - boundedLength);
  return [start, start + boundedLength];
}

function createReadableLogTicks(minimumLog: number, maximumLog: number): readonly number[] {
  const endpointAndDecadeLogs = [
    minimumLog,
    ...Array.from(
      { length: Math.max(0, Math.floor(maximumLog) - Math.ceil(minimumLog) + 1) },
      (_, index) => Math.ceil(minimumLog) + index,
    ).filter((value) => value > minimumLog && value < maximumLog),
    maximumLog,
  ];
  const uniqueLogs = endpointAndDecadeLogs.filter(
    (value, index, values) => index === 0 || Math.abs(value - values[index - 1]!) > 1e-10,
  );
  if (uniqueLogs.length >= 3 && uniqueLogs.length <= 5)
    return uniqueLogs.map((value) => 10 ** value);
  if (uniqueLogs.length > 5)
    return Array.from({ length: 5 }, (_, index) => {
      const sampledIndex = Math.round((index * (uniqueLogs.length - 1)) / 4);
      return 10 ** uniqueLogs[sampledIndex]!;
    });
  return Array.from(
    { length: 3 },
    (_, index) => 10 ** (minimumLog + ((maximumLog - minimumLog) * index) / 2),
  );
}

function constraintLabelY(valueY: number): number {
  return Math.max(TOP + 12, valueY - 8);
}

function formatResponseThreshold(value: number): string {
  const fixed = value.toFixed(2);
  return Math.abs(Number(fixed) - value) < 1e-10
    ? fixed
    : Number(value.toPrecision(4)).toString();
}
