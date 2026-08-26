import { nearestPointIndex, validateChartCoordinates } from './chartMath';
import type { BfnSimulationPoint, BfnSimulationResult } from './types';

export interface BfnNearestComparisonPoint {
  index: number;
  point: BfnSimulationPoint;
}

export type BfnRunComparisonBasis = 'semantic-snapshot' | 'legacy-identifiers';

export type BfnRunCompatibility =
  { compatible: true; basis: BfnRunComparisonBasis } | { compatible: false; basis: null };

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
      return (
        String(completedDate.getHours()).padStart(2, '0') +
        ':' +
        String(completedDate.getMinutes()).padStart(2, '0')
      );
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

function sameSnapshotSemantics(
  current: BfnSimulationResult,
  candidate: BfnSimulationResult,
): boolean {
  const left = current.signalSnapshot;
  const right = candidate.signalSnapshot;
  if (!left || !right) return true;
  return (
    left.primaryInput.entity === right.primaryInput.entity &&
    left.primaryInput.quantityType === right.primaryInput.quantityType &&
    left.primaryInput.unit === right.primaryInput.unit &&
    left.output.entity === right.output.entity &&
    left.output.quantityType === right.output.quantityType &&
    left.output.unit === right.output.unit
  );
}

/** Apply the four-ID legacy contract and exact recorded signal semantics when both exist. */
export function assessBfnRunCompatibility(
  current: BfnSimulationResult,
  candidate: BfnSimulationResult,
): BfnRunCompatibility {
  const identifiersMatch =
    candidate.id !== current.id &&
    candidate.networkId === current.networkId &&
    candidate.mode === current.mode &&
    candidate.primaryInputSourceId === current.primaryInputSourceId &&
    candidate.outputMonitorId === current.outputMonitorId;
  if (!identifiersMatch || !sameSnapshotSemantics(current, candidate)) {
    return { compatible: false, basis: null };
  }
  return {
    compatible: true,
    basis:
      current.signalSnapshot && candidate.signalSnapshot
        ? 'semantic-snapshot'
        : 'legacy-identifiers',
  };
}

/** Preserve repository recency order while applying the scientific identity contract. */
export function compatibleBfnRuns(
  current: BfnSimulationResult,
  runs: readonly BfnSimulationResult[],
): BfnSimulationResult[] {
  return runs.filter((run) => assessBfnRunCompatibility(current, run).compatible);
}

/** Read a historical run on its own point grid; no interpolation is performed. */
export function nearestBfnComparisonPoint(
  result: BfnSimulationResult,
  coordinate: number,
): BfnNearestComparisonPoint | null {
  if (!validateChartCoordinates(result.points).valid) return null;
  return nearestBfnPointOnValidatedGrid(result.points, coordinate);
}
