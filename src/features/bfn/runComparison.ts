import { nearestPointIndex, validateChartCoordinates } from './chartMath';
import type { BfnSimulationPoint, BfnSimulationResult } from './types';

export interface BfnNearestComparisonPoint {
  index: number;
  point: BfnSimulationPoint;
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
  const index = nearestPointIndex(result.points, coordinate);
  const point = result.points[index];
  return index >= 0 && point ? { index, point } : null;
}
