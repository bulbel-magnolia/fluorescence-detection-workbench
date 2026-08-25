import { nearestPointIndex, validateChartCoordinates } from './chartMath';
import type { BfnSimulationPoint, BfnSimulationResult } from './types';

export interface BfnNearestComparisonPoint {
  index: number;
  point: BfnSimulationPoint;
}

const comparisonTimeOptions: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

/** Keep shared chart legends compact while respecting the active locale. */
export function formatBfnComparisonTime(
  completedAt: string,
  language: string,
  fallback = '--:--',
): string {
  const completedDate = new Date(completedAt);
  if (!Number.isFinite(completedDate.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat(language, comparisonTimeOptions).format(completedDate);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-GB', comparisonTimeOptions).format(completedDate);
    } catch {
      return String(completedDate.getHours()).padStart(2, '0') + ':' +
        String(completedDate.getMinutes()).padStart(2, '0');
    }
  }
}

/** Read a point from a coordinate grid that has already passed chart validation. */
export function nearestBfnPointOnValidatedGrid(
  points: readonly BfnSimulationPoint[],
  coordinate: number,
): BfnNearestComparisonPoint | null {
  const index = nearestPointIndex(points, coordinate);
  const point = points[index];
  return index >= 0 && point ? { index, point } : null;
}

/** Preserve repository recency order while applying the scientific identity contract. */
export function compatibleBfnRuns(
  current: BfnSimulationResult,
  runs: readonly BfnSimulationResult[],
): BfnSimulationResult[] {
  return runs.filter((run) =>
    run.id !== current.id &&
    run.networkId === current.networkId &&
    run.mode === current.mode &&
    run.primaryInputSourceId === current.primaryInputSourceId &&
    run.outputMonitorId === current.outputMonitorId,
  );
}

/** Read a historical run on its own point grid; no interpolation is performed. */
export function nearestBfnComparisonPoint(
  result: BfnSimulationResult,
  coordinate: number,
): BfnNearestComparisonPoint | null {
  if (!validateChartCoordinates(result.points).valid) return null;
  return nearestBfnPointOnValidatedGrid(result.points, coordinate);
}
