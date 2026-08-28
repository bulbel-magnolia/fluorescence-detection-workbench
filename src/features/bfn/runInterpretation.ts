import type {
  BfnRunContextApplicabilitySnapshot,
  BfnRunTemporalSnapshot,
  BfnSimulationResult,
} from './types';

export interface BfnTemporalExecutionCounts {
  steadyState: number;
  quasiStatic: number;
  statefulDynamic: number;
  unsupported: number;
}

export interface BfnTemporalEvidenceCounts {
  t0SteadyState: number;
  t1TimeResolved: number;
  t2PhenomenologicalDynamic: number;
  t3MechanisticDynamic: number;
  notRecorded: number;
}

export type BfnDynamicTimeInterpretation =
  | 'not_recorded'
  | 'all_quasi_static'
  | 'mixed_quasi_static'
  | 'all_stateful_dynamic'
  | 'recorded_other';

export type BfnContextApplicabilitySummary =
  'known_differences' | 'partially_unverified' | 'consistent' | 'no_comparable_module_context';

export function countBfnTemporalExecution(
  snapshot: BfnRunTemporalSnapshot,
): BfnTemporalExecutionCounts {
  const counts: BfnTemporalExecutionCounts = {
    steadyState: 0,
    quasiStatic: 0,
    statefulDynamic: 0,
    unsupported: 0,
  };
  for (const module of snapshot.modules) {
    if (module.executionMode === 'steady_state') counts.steadyState += 1;
    else if (module.executionMode === 'quasi_static') counts.quasiStatic += 1;
    else if (module.executionMode === 'stateful_dynamic') counts.statefulDynamic += 1;
    else counts.unsupported += 1;
  }
  return counts;
}

export function countBfnTemporalEvidence(
  snapshot: BfnRunTemporalSnapshot,
): BfnTemporalEvidenceCounts {
  const counts: BfnTemporalEvidenceCounts = {
    t0SteadyState: 0,
    t1TimeResolved: 0,
    t2PhenomenologicalDynamic: 0,
    t3MechanisticDynamic: 0,
    notRecorded: 0,
  };
  for (const module of snapshot.modules) {
    if (module.evidenceTier === 't0_steady_state') counts.t0SteadyState += 1;
    else if (module.evidenceTier === 't1_time_resolved') counts.t1TimeResolved += 1;
    else if (module.evidenceTier === 't2_phenomenological_dynamic') {
      counts.t2PhenomenologicalDynamic += 1;
    } else if (module.evidenceTier === 't3_mechanistic_dynamic') {
      counts.t3MechanisticDynamic += 1;
    } else counts.notRecorded += 1;
  }
  return counts;
}

export function interpretBfnDynamicTimeHandling(
  result: BfnSimulationResult,
): BfnDynamicTimeInterpretation {
  const modules = result.temporalSnapshot?.modules;
  if (!modules) return 'not_recorded';
  if (modules.length > 0 && modules.every((module) => module.executionMode === 'quasi_static')) {
    return 'all_quasi_static';
  }
  if (modules.some((module) => module.executionMode === 'quasi_static')) {
    return 'mixed_quasi_static';
  }
  if (
    modules.length > 0 &&
    modules.every((module) => module.executionMode === 'stateful_dynamic')
  ) {
    return 'all_stateful_dynamic';
  }
  return 'recorded_other';
}

export function summarizeBfnContextApplicability(
  snapshot: BfnRunContextApplicabilitySnapshot,
): BfnContextApplicabilitySummary {
  if (snapshot.edges.length === 0) return 'no_comparable_module_context';
  if (snapshot.edges.some((edge) => edge.state === 'mismatched')) return 'known_differences';
  if (snapshot.edges.some((edge) => edge.state === 'uncertain' || edge.state === 'unavailable')) {
    return 'partially_unverified';
  }
  return 'consistent';
}

export function bfnTemporalExecutionExportSummary(snapshot: BfnRunTemporalSnapshot): string {
  const counts = countBfnTemporalExecution(snapshot);
  return `Steady-state: ${counts.steadyState}; Quasi-static: ${counts.quasiStatic}; Stateful dynamic: ${counts.statefulDynamic}; Unsupported: ${counts.unsupported}`;
}

export function bfnTemporalEvidenceExportSummary(snapshot: BfnRunTemporalSnapshot): string {
  const counts = countBfnTemporalEvidence(snapshot);
  return `T0 steady-state: ${counts.t0SteadyState}; T1 time-resolved: ${counts.t1TimeResolved}; T2 phenomenological dynamic: ${counts.t2PhenomenologicalDynamic}; T3 mechanistic dynamic: ${counts.t3MechanisticDynamic}; Not recorded: ${counts.notRecorded}`;
}

export function bfnContextApplicabilityExportSummary(
  snapshot: BfnRunContextApplicabilitySnapshot,
): string {
  const summary = summarizeBfnContextApplicability(snapshot);
  if (summary === 'known_differences') return 'Known context differences';
  if (summary === 'partially_unverified') return 'Context partially unverified';
  if (summary === 'consistent') return 'Compared module contexts consistent';
  return 'No comparable module context';
}

export function bfnTemporalExecutionSummariesDiffer(
  current: BfnSimulationResult,
  comparison: BfnSimulationResult,
): boolean | null {
  if (!current.temporalSnapshot || !comparison.temporalSnapshot) return null;
  return (
    bfnTemporalExecutionExportSummary(current.temporalSnapshot) !==
    bfnTemporalExecutionExportSummary(comparison.temporalSnapshot)
  );
}
