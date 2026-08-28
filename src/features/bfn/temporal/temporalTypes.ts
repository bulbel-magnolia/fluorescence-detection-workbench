export type BfnTemporalExecutionMode =
  'steady_state' | 'quasi_static' | 'stateful_dynamic' | 'unsupported';

export type BfnTemporalEvidenceTier =
  | 't0_steady_state'
  | 't1_time_resolved'
  | 't2_phenomenological_dynamic'
  | 't3_mechanistic_dynamic'
  | 'not_recorded';

export type BfnTemporalResolutionBasis =
  'active-static' | 'active-dynamic' | 'dynamic-static-fallback' | 'no-executable-model';

export interface BfnTemporalCapability {
  readonly executionMode: BfnTemporalExecutionMode;
  readonly evidenceTier: BfnTemporalEvidenceTier;
  readonly selectedModelId: string | null;
  readonly selectedModelMode: 'static' | 'dynamic' | null;
  readonly resolutionBasis: BfnTemporalResolutionBasis;
}
