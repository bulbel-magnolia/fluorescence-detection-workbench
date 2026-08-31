import type {
  UserModuleAssessmentAxis,
  UserModuleContractIssue,
  UserModuleContextDraft,
  UserModuleEvidenceDraft,
  UserModuleImplementationDraft,
  UserModuleModelDraft,
  UserModuleParameterDraft,
  UserModulePortDraft,
  UserModuleValidityDomainDraft,
} from './userModuleContract';

/**
 * First-order dynamic user authoring input. The steady-state response remains
 * the same serialized static model input used by the Batch 12.1 contract;
 * dynamic metadata is kept in this independent source contract until a later
 * materialization phase is explicitly introduced.
 */
export interface UserDefinedDynamicFunctionalModuleDraft {
  readonly id: string;
  readonly origin: string;
  readonly name: string;
  readonly description: string | null;
  readonly ports: readonly UserModulePortDraft[];
  readonly steadyStateResponse: UserModuleModelDraft;
  readonly validityDomains: readonly UserModuleValidityDomainDraft[];
  readonly dynamics: UserModuleDynamicParametersDraft;
  readonly timeRangeHours?: readonly [number, number];
  readonly context: UserModuleContextDraft;
  readonly uncertainty: UserModuleDynamicUncertaintyDraft;
  readonly evidence: UserModuleEvidenceDraft;
  readonly implementation: UserModuleImplementationDraft;
}

export interface UserModuleDynamicParametersDraft {
  readonly tau: UserModuleParameterDraft;
  readonly initialState: number;
}

/**
 * Dynamic authoring intentionally narrows reported uncertainty to interval
 * envelopes. The shorthand state is accepted at this boundary as a
 * convenience and normalized to the static contract's reported/method form.
 */
export type UserModuleDynamicUncertaintyDraft =
  | { readonly state: 'not_recorded' }
  | { readonly state: 'none' }
  | { readonly state: 'reported'; readonly method: 'parameter_interval_envelope' }
  | { readonly state: 'parameter_interval_envelope' };

export type UserModuleDynamicContractIssueCode =
  | UserModuleContractIssue['code']
  | 'dynamic_tau_missing'
  | 'dynamic_tau_non_finite'
  | 'dynamic_tau_non_positive'
  | 'dynamic_tau_unit_invalid'
  | 'dynamic_initial_state_non_finite'
  | 'dynamic_time_range_invalid'
  | 'dynamic_tau_interval_missing'
  | 'dynamic_tau_interval_invalid'
  | 'dynamic_tau_interval_estimate_outside'
  | 'dynamic_parameter_interval_missing'
  | 'dynamic_parameter_interval_invalid'
  | 'dynamic_uncertainty_method_invalid'
  | 'dynamic_steady_state_expression_unsupported';

export interface UserModuleDynamicContractIssue extends Omit<
  UserModuleContractIssue,
  'axis' | 'code'
> {
  readonly axis: UserModuleAssessmentAxis;
  readonly code: UserModuleDynamicContractIssueCode;
}

export interface UserDefinedDynamicFunctionalModuleAssessment {
  readonly moduleId: string;
  readonly semantic: {
    readonly state: 'valid' | 'invalid';
    readonly issues: readonly UserModuleDynamicContractIssue[];
  };
  readonly representation: {
    readonly state: 'lossless' | 'requires_ir_extension';
    readonly issues: readonly UserModuleDynamicContractIssue[];
  };
  readonly runtime: {
    readonly state: 'supported' | 'unsupported';
    readonly issues: readonly UserModuleDynamicContractIssue[];
  };
  readonly evidence: {
    readonly basis: string;
    readonly provenanceState: 'not_required' | 'provided' | 'missing';
    readonly issues: readonly UserModuleDynamicContractIssue[];
  };
  readonly implementation: {
    readonly state: string;
    readonly issues: readonly UserModuleDynamicContractIssue[];
  };
}
