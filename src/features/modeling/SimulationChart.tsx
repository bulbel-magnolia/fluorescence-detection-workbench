import { useId } from 'react';
import type { SimulationResult } from './types';

export interface SimulationChartProps {
  result: SimulationResult | null;
  emptyLabel: string;
  outputLabel: string;
  /** Kept for callers that still provide the former time-axis label. It is not rendered as time. */
  timeLabel?: string;
  valueLabel: string;
  thresholds: readonly [number, number];
  revealProgress?: number;
  comparisons?: Array<{ id: string; label: string; result: SimulationResult }>;
  nodeLabel?: string;
  convergenceLabel?: string;
  nodeLabels?: Readonly<Record<string, string>>;
  concentrationNodeIds?: readonly string[];
  concentrationLabel?: string;
}

const width = 660;
const height = 230;
const padding = { left: 44, right: 18, top: 20, bottom: 48 };

interface FinalValueEntry {
  id: string;
  value: number;
}

function finalValueEntries(
  result: SimulationResult,
  excludedNodeIds: ReadonlySet<string> = new Set(),
): FinalValueEntry[] {
  return Object.entries(result.finalValues)
    .filter(([id]) => !excludedNodeIds.has(id))
    .map(([id, value]) => ({
      id,
      value: Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)),
    }));
}

function valueX(index: number, count: number): number {
  const innerWidth = width - padding.left - padding.right;
  if (count <= 1) return padding.left + innerWidth / 2;
  return padding.left + ((index + 0.5) / count) * innerWidth;
}

function valueY(value: number): number {
  const innerHeight = height - padding.top - padding.bottom;
  return padding.top + (1 - value) * innerHeight;
}

function compactNodeId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 11)}…` : id;
}

function thresholdY(value: number): number {
  const innerHeight = height - padding.top - padding.bottom;
  return padding.top + (1 - value) * innerHeight;
}

export function SimulationChart({
  result,
  emptyLabel,
  outputLabel,
  valueLabel,
  thresholds,
  revealProgress = 1,
  comparisons = [],
  nodeLabel,
  convergenceLabel,
  nodeLabels = {},
  concentrationNodeIds = [],
  concentrationLabel,
}: SimulationChartProps) {
  const clipId = useId().replaceAll(':', '');
  if (!result) {
    return (
      <div className="simulation-chart simulation-chart--empty">
        <span className="simulation-chart__scanner" />
        <p>{emptyLabel}</p>
      </div>
    );
  }

  const concentrationIds = new Set(concentrationNodeIds);
  const entries = finalValueEntries(result, concentrationIds);
  const concentrationEntries = concentrationNodeIds.flatMap((id) => {
    const value = result.finalValues[id];
    return typeof value === 'number' && Number.isFinite(value) ? [{ id, value }] : [];
  });
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const reveal = Math.max(0, Math.min(1, revealProgress));
  const comparisonSeries = comparisons.slice(0, 2).map((comparison) => ({
    ...comparison,
    values: new Map(
      finalValueEntries(comparison.result, concentrationIds).map((entry) => [
        entry.id,
        entry.value,
      ]),
    ),
  }));
  const seriesCount = 1 + comparisonSeries.length;
  const groupWidth = innerWidth / Math.max(entries.length, 1);
  const totalBarWidth = Math.min(48, groupWidth * 0.72);
  const barGap = seriesCount > 1 ? 2 : 0;
  const singleBarWidth = Math.max(3, (totalBarWidth - barGap * (seriesCount - 1)) / seriesCount);
  const outputIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === result.outputNodeId),
  );
  const convergenceText = `${result.convergence.iterations}/${result.convergence.maxIterations}`;
  const chartLabel = `${outputLabel} ${result.outputValue.toFixed(3)} ${convergenceText}`;

  return (
    <div
      className="simulation-chart"
      data-simulation-mode={result.simulationMode}
      data-converged={String(result.convergence.converged)}
      data-iterations={result.convergence.iterations}
    >
      <div className="simulation-chart__steady-state" data-testid="simulation-convergence">
        {convergenceLabel ? `${convergenceLabel}: ` : null}
        {convergenceText}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chartLabel}>
        <defs>
          <clipPath id={clipId}>
            <rect
              x={padding.left}
              y={padding.top}
              width={innerWidth * reveal}
              height={innerHeight}
            />
          </clipPath>
        </defs>
        {Array.from({ length: 6 }, (_, index) => {
          const y = padding.top + (index / 5) * innerHeight;
          return (
            <line
              key={`horizontal-${index}`}
              className="simulation-chart__grid"
              x1={padding.left}
              x2={padding.left + innerWidth}
              y1={y}
              y2={y}
            />
          );
        })}
        {Array.from({ length: 7 }, (_, index) => {
          const x = padding.left + (index / 6) * innerWidth;
          return (
            <line
              key={`vertical-${index}`}
              className="simulation-chart__grid"
              x1={x}
              x2={x}
              y1={padding.top}
              y2={padding.top + innerHeight}
            />
          );
        })}
        {thresholds.map((threshold) => (
          <line
            key={threshold}
            className="simulation-chart__threshold"
            x1={padding.left}
            x2={padding.left + innerWidth}
            y1={thresholdY(threshold)}
            y2={thresholdY(threshold)}
          />
        ))}
        {entries.map((entry, index) => {
          const displayLabel = nodeLabels[entry.id] ?? entry.id;
          const center = valueX(index, entries.length);
          const firstBarX = center - totalBarWidth / 2;
          const baselineY = height - padding.bottom;
          return (
            <g key={entry.id}>
              <g clipPath={`url(#${clipId})`}>
                <rect
                  className={`simulation-chart__bar simulation-chart__bar--current${entry.id === result.outputNodeId ? ' is-output' : ''}`}
                  data-node-id={entry.id}
                  x={firstBarX}
                  y={valueY(entry.value)}
                  width={singleBarWidth}
                  height={Math.max(0, baselineY - valueY(entry.value))}
                  rx={1.5}
                >
                  <title>{`${displayLabel}: ${entry.value.toFixed(3)}`}</title>
                </rect>
                {comparisonSeries.map((comparison, comparisonIndex) => {
                  const comparisonValue = comparison.values.get(entry.id);
                  if (comparisonValue === undefined) return null;
                  return (
                    <rect
                      key={comparison.id}
                      className={`simulation-chart__bar simulation-chart__bar--comparison simulation-chart__bar--comparison-${comparisonIndex + 1}`}
                      data-comparison-id={comparison.id}
                      x={firstBarX + (comparisonIndex + 1) * (singleBarWidth + barGap)}
                      y={valueY(comparisonValue)}
                      width={singleBarWidth}
                      height={Math.max(0, baselineY - valueY(comparisonValue))}
                      rx={1.5}
                    >
                      <title>{`${comparison.label} · ${displayLabel}: ${comparisonValue.toFixed(3)}`}</title>
                    </rect>
                  );
                })}
              </g>
              {nodeLabel ? (
                <text
                  className="simulation-chart__axis"
                  x={center}
                  y={height - 25}
                  textAnchor="middle"
                >
                  {compactNodeId(displayLabel)}
                </text>
              ) : null}
            </g>
          );
        })}
        <text className="simulation-chart__axis" x={padding.left - 8} y={padding.top + 4}>
          1.0
        </text>
        <text
          className="simulation-chart__axis"
          x={padding.left - 8}
          y={padding.top + innerHeight + 4}
        >
          0.0
        </text>
        {nodeLabel ? (
          <text
            className="simulation-chart__axis-label"
            x={padding.left + innerWidth / 2}
            y={height - 6}
            textAnchor="middle"
          >
            {nodeLabel}
          </text>
        ) : null}
        <text
          className="simulation-chart__axis-label"
          x={13}
          y={padding.top + innerHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 13 ${padding.top + innerHeight / 2})`}
        >
          {valueLabel}
        </text>
      </svg>
      {concentrationEntries.length ? (
        <section className="simulation-chart__concentrations" aria-label={concentrationLabel}>
          {concentrationLabel ? <strong>{concentrationLabel}</strong> : null}
          <dl>
            {concentrationEntries.map((entry) => (
              <div key={entry.id} data-concentration-node-id={entry.id}>
                <dt title={nodeLabels[entry.id] ?? entry.id}>{nodeLabels[entry.id] ?? entry.id}</dt>
                <dd>{entry.value === 0 ? '0 M' : `${entry.value.toExponential(2)} M`}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <span hidden data-output-index={outputIndex} data-output-value={result.outputValue} />
    </div>
  );
}
