import type { BfnEvidenceGrade, BfnModelFamily, BfnQuantityType, BfnUnit } from '../types';

export const USER_DEFINED_MODULE_ORIGIN = 'user_defined' as const;

export const USER_MODULE_QUANTITY_TYPES = Object.freeze([
  'concentration',
  'amount',
  'production_rate',
  'expression_level',
  'activity',
  'flux',
  'fraction',
  'cell_density',
] as const satisfies readonly BfnQuantityType[]);

export const USER_MODULE_UNITS = Object.freeze([
  'M',
  'mM',
  'uM',
  'nM',
  'pM',
  'nM/h',
  'uM/h',
  'molecules/cell',
  'RPU',
  'dimensionless',
  'OD600',
] as const satisfies readonly BfnUnit[]);

export const USER_MODULE_EVIDENCE_BASES = Object.freeze([
  'measured_single_context',
  'measured_multiple_contexts',
  'externally_validated',
  'fitted_from_published_data',
  'mechanistic_model_only',
  'data_driven_prediction',
  'independent_assumption',
  'proposed_unbuilt_design',
] as const satisfies readonly BfnEvidenceGrade[]);

export const USER_MODULE_AUTHORABLE_MODEL_FAMILIES = Object.freeze([
  'hill_activation',
  'hill_repression',
  'linear_transfer',
  'independent_inputs',
] as const satisfies readonly BfnModelFamily[]);

export type UserModuleAuthorableModelFamily =
  (typeof USER_MODULE_AUTHORABLE_MODEL_FAMILIES)[number];

export interface UserModuleEntityDraft {
  readonly id: string;
  readonly displayName: string;
}

export interface UserModulePortDraft {
  readonly id: string;
  readonly name: string;
  readonly entity: UserModuleEntityDraft;
  readonly quantityType: string;
  readonly unit: string;
  readonly direction: 'input' | 'output';
}

export interface UserModuleParameterDraft {
  readonly value: number;
  readonly unit: string;
  readonly interval95?: readonly [number, number];
}

export interface UserModuleIndependentTermDraft {
  readonly inputPortId: string;
  readonly mode: string;
  readonly k: UserModuleParameterDraft;
  readonly n: UserModuleParameterDraft;
  readonly weight: UserModuleParameterDraft;
}

/**
 * Serialized authoring input is intentionally wider than the supported model
 * union. The validator rejects unknown families and incomplete parameters
 * without requiring unsafe casts at the import boundary.
 */
export interface UserModuleModelDraft {
  readonly family: string;
  readonly inputPortIds: readonly string[];
  readonly outputPortIds: readonly string[];
  readonly parameters: Readonly<Record<string, UserModuleParameterDraft | undefined>>;
  readonly terms?: readonly UserModuleIndependentTermDraft[];
  readonly aggregation?: string;
  readonly interactionAssumption?: string;
  readonly expression?: string;
}

export interface UserModuleValidityDomainDraft {
  readonly portId: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly unit: string;
}

export interface UserModuleContextFactsDraft {
  readonly hostSpecies?: string;
  readonly hostStrain?: string;
  readonly medium?: string;
  readonly temperatureCelsius?: number;
  readonly ph?: number;
}

export type UserModuleContextDraft =
  | { readonly state: 'not_recorded' }
  | { readonly state: 'defined'; readonly facts: UserModuleContextFactsDraft };

export type UserModuleReportedUncertaintyMethod =
  'parameter_interval_envelope' | 'posterior_samples' | 'bootstrap' | 'covariance';

export type UserModuleUncertaintyDraft =
  | { readonly state: 'not_recorded' }
  | { readonly state: 'none' }
  | {
      readonly state: 'reported';
      readonly method: string;
    };

export interface UserModuleProvenanceDraft {
  readonly id: string;
  readonly kind: string;
  readonly reference: string;
}

export interface UserModuleEvidenceDraft {
  readonly basis: string;
  readonly provenance: readonly UserModuleProvenanceDraft[];
}

export type UserModuleImplementationState =
  'unspecified' | 'designed' | 'candidate' | 'reported' | 'validated';

export interface UserModuleImplementationDraft {
  readonly state: string;
  readonly implementationIds: readonly string[];
}

export interface UserDefinedFunctionalModuleDraft {
  readonly id: string;
  readonly origin: string;
  readonly name: string;
  readonly description: string | null;
  readonly ports: readonly UserModulePortDraft[];
  readonly model: UserModuleModelDraft;
  readonly validityDomains: readonly UserModuleValidityDomainDraft[];
  readonly context: UserModuleContextDraft;
  readonly uncertainty: UserModuleUncertaintyDraft;
  readonly evidence: UserModuleEvidenceDraft;
  readonly implementation: UserModuleImplementationDraft;
}

export type UserModuleAssessmentAxis =
  'semantic' | 'representation' | 'runtime' | 'evidence' | 'implementation';

export type UserModuleContractIssueCode =
  | 'authoring_origin_invalid'
  | 'module_id_missing'
  | 'module_name_missing'
  | 'port_id_missing'
  | 'port_name_missing'
  | 'entity_id_missing'
  | 'entity_name_missing'
  | 'unsupported_quantity_type'
  | 'unsupported_unit'
  | 'duplicate_port_id'
  | 'duplicate_model_port_reference'
  | 'model_port_unknown'
  | 'model_input_direction_invalid'
  | 'model_output_direction_invalid'
  | 'model_input_arity_unsupported'
  | 'model_output_arity_unsupported'
  | 'input_port_not_modeled'
  | 'output_port_not_modeled'
  | 'unsupported_model_family'
  | 'parameter_non_finite'
  | 'hill_parameter_missing'
  | 'hill_parameter_not_positive'
  | 'hill_k_unit_mismatch'
  | 'hill_n_unit_invalid'
  | 'hill_output_unit_mismatch'
  | 'hill_output_bounds_invalid'
  | 'linear_parameter_missing'
  | 'linear_scale_unit_invalid'
  | 'linear_intercept_unit_mismatch'
  | 'linear_dimension_mismatch'
  | 'independent_input_arity_invalid'
  | 'independent_input_term_coverage_invalid'
  | 'independent_term_parameter_invalid'
  | 'independent_term_unit_mismatch'
  | 'independent_aggregation_invalid'
  | 'independent_interaction_assumption_invalid'
  | 'independent_output_parameter_missing'
  | 'independent_output_parameter_invalid'
  | 'independent_output_unit_mismatch'
  | 'validity_domain_missing'
  | 'validity_domain_duplicate'
  | 'validity_domain_port_unknown'
  | 'validity_domain_bounds_invalid'
  | 'validity_domain_unit_mismatch'
  | 'context_fact_invalid'
  | 'uncertainty_method_invalid'
  | 'mathematical_contract_incomplete'
  | 'model_family_not_executable'
  | 'unsupported_evidence_basis'
  | 'measured_evidence_provenance_missing'
  | 'provenance_record_invalid'
  | 'implementation_state_invalid'
  | 'unspecified_implementation_has_ids'
  | 'specified_implementation_ids_missing'
  | 'authoring_origin_not_representable'
  | 'user_name_not_representable'
  | 'free_description_not_representable'
  | 'custom_entity_registry_missing'
  | 'unrecorded_context_not_representable'
  | 'partial_context_not_representable'
  | 'unrecorded_uncertainty_not_representable'
  | 'no_uncertainty_not_representable'
  | 'generic_provenance_not_representable'
  | 'implementation_maturity_not_explicit'
  | 'model_output_binding_not_representable'
  | 'compound_linear_scale_unit_missing'
  | 'model_family_not_representable';

export interface UserModuleContractIssue {
  readonly axis: UserModuleAssessmentAxis;
  readonly code: UserModuleContractIssueCode;
  readonly path: string;
}

export interface UserModuleSemanticAssessment {
  readonly state: 'valid' | 'invalid';
  readonly issues: readonly UserModuleContractIssue[];
}

export interface UserModuleRepresentationAssessment {
  readonly state: 'lossless' | 'requires_ir_extension';
  readonly issues: readonly UserModuleContractIssue[];
}

export interface UserModuleRuntimeAssessment {
  readonly state: 'supported' | 'unsupported';
  readonly issues: readonly UserModuleContractIssue[];
}

export interface UserModuleEvidenceAssessment {
  readonly basis: string;
  readonly provenanceState: 'not_required' | 'provided' | 'missing';
  readonly issues: readonly UserModuleContractIssue[];
}

export interface UserModuleImplementationAssessment {
  readonly state: UserModuleImplementationState | 'unrecognized';
  readonly issues: readonly UserModuleContractIssue[];
}

export interface UserDefinedFunctionalModuleAssessment {
  readonly moduleId: string;
  readonly semantic: UserModuleSemanticAssessment;
  readonly representation: UserModuleRepresentationAssessment;
  readonly runtime: UserModuleRuntimeAssessment;
  readonly evidence: UserModuleEvidenceAssessment;
  readonly implementation: UserModuleImplementationAssessment;
}
