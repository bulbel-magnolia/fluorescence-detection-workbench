import type { BfnEvidenceGrade, BfnStaticResponse, BfnUncertaintyMethod, BfnUnit } from '../types';

export const BFN_INTERPRETATION_CONTRACT_VERSION = '1.0' as const;

export type BfnLocalInfluenceAnalysisScopeV1 = 'module_static_response';

export interface BfnOperatingPointInputV1 {
  readonly portId: string;
  readonly value: number;
  readonly unit: BfnUnit;
}

export interface BfnLocalInfluenceRequestV1 {
  readonly contractVersion: typeof BFN_INTERPRETATION_CONTRACT_VERSION;
  readonly scope: BfnLocalInfluenceAnalysisScopeV1;
  readonly moduleId: string;
  readonly outputPortId: string;
  readonly operatingPoint: readonly BfnOperatingPointInputV1[];
}

export type BfnInterpretationApplicabilityState =
  'within_recorded_domain' | 'applicability_not_recorded' | 'outside_recorded_domain';

export interface BfnDerivedGainUnit {
  readonly outputUnit: BfnUnit;
  readonly inputUnit: BfnUnit;
}

export type BfnLocalInfluenceIssueCode =
  | 'module_not_found'
  | 'module_identity_conflict'
  | 'static_model_missing'
  | 'static_interpretation_unsupported'
  | 'dynamic_only_model'
  | 'input_value_missing'
  | 'input_value_duplicate'
  | 'unexpected_input'
  | 'input_port_invalid'
  | 'output_port_invalid'
  | 'unit_mismatch'
  | 'value_non_finite'
  | 'value_negative'
  | 'outside_validity_domain'
  | 'applicability_not_recorded'
  | 'model_contract_invalid'
  | 'request_contract_invalid';

export interface BfnLocalInfluenceIssueV1 {
  readonly code: BfnLocalInfluenceIssueCode;
  readonly severity: 'error' | 'warning';
  readonly subjectId: string;
  readonly details?: Readonly<Record<string, string | number>>;
}

export type BfnStaticInterpretationBasisV1 =
  'active_static_response' | 'first_order_steady_state_static_response';

export type BfnInterpretationContextReferenceV1 =
  | {
      readonly kind: 'not_recorded';
      readonly contextId: null;
    }
  | {
      readonly kind: 'project_context';
      readonly contextId: string;
    }
  | {
      readonly kind: 'catalog_parameter_context';
      readonly contextId: string;
      readonly catalogId: string;
      readonly releaseId: string;
      readonly releaseVersion: string;
      readonly parameterContextId: string;
    };

/** Catalog identity only. Source parameters remain part of the active BFN model contract. */
export interface BfnInterpretationCatalogReferenceV1 {
  readonly catalogId: string;
  readonly releaseId: string;
  readonly releaseVersion: string;
  readonly responseId: string;
  readonly componentId: string;
  readonly inputSignalId: string;
  readonly outputSignalId: string;
  readonly parameterContextId: string;
  readonly sourceIds: readonly string[];
  readonly sourceModelType: 'four_parameter_logistic' | 'hill_equation_n_fixed_1';
  readonly biologicalDirection: 'activation' | 'derepression';
  readonly runtimeImplementation: string;
}

export interface BfnInterpretationEvidenceReferenceV1 {
  readonly evidenceGrade: BfnEvidenceGrade;
  readonly uncertaintyMethod: BfnUncertaintyMethod;
  readonly provenanceIds: readonly string[];
  readonly sourceDatasetIds: readonly string[];
  readonly catalogReference: BfnInterpretationCatalogReferenceV1 | null;
}

export interface BfnResolvedLocalInfluenceTargetV1 {
  readonly contractVersion: typeof BFN_INTERPRETATION_CONTRACT_VERSION;
  readonly scope: BfnLocalInfluenceAnalysisScopeV1;
  readonly moduleId: string;
  readonly staticModelId: string;
  readonly staticModelVersion: string;
  readonly responseFamily: BfnStaticResponse['family'];
  readonly outputPortId: string;
  readonly outputUnit: BfnUnit;
  readonly inputPorts: readonly {
    readonly portId: string;
    readonly unit: BfnUnit;
  }[];
  readonly interpretationBasis: BfnStaticInterpretationBasisV1;
  readonly interpretationSource: 'active_bfn_static_response';
  readonly parameterBasis: 'nominal';
  readonly evidence: BfnInterpretationEvidenceReferenceV1;
  readonly contextReference: BfnInterpretationContextReferenceV1;
  readonly validityDomainId: string;
}

export interface BfnLocalInfluenceAdmissionV1 {
  readonly status: 'supported' | 'unsupported';
  readonly applicability: BfnInterpretationApplicabilityState | null;
  readonly issues: readonly BfnLocalInfluenceIssueV1[];
  readonly target: BfnResolvedLocalInfluenceTargetV1 | null;
}

export type BfnLocalDifferentialGainV1 =
  | {
      readonly availability: 'available';
      readonly value: number;
      readonly unit: BfnDerivedGainUnit;
    }
  | {
      readonly availability: 'unavailable';
      readonly reason:
        | 'derivative_does_not_exist'
        | 'derivative_not_unique'
        | 'derivative_non_finite'
        | 'analytic_derivative_not_supported';
      readonly unit: BfnDerivedGainUnit;
    };

export type BfnLogElasticityV1 =
  | {
      readonly availability: 'available';
      readonly value: number;
      readonly unit: 'dimensionless';
    }
  | {
      readonly availability: 'unavailable';
      readonly reason: 'input_not_positive' | 'output_not_positive' | 'derivative_unavailable';
      readonly unit: 'dimensionless';
    };

export interface BfnLocalInputInfluenceV1 {
  readonly portId: string;
  readonly operatingValue: number;
  readonly operatingUnit: BfnUnit;
  readonly localDifferentialGain: BfnLocalDifferentialGainV1;
  readonly logElasticity: BfnLogElasticityV1;
}

/**
 * Future result envelope for Batch 13.1. Batch 13.0 defines this shape but does
 * not calculate or persist it.
 */
export interface BfnLocalInfluenceResultV1 {
  readonly contractVersion: typeof BFN_INTERPRETATION_CONTRACT_VERSION;
  readonly scope: BfnLocalInfluenceAnalysisScopeV1;
  readonly target: BfnResolvedLocalInfluenceTargetV1;
  readonly operatingPoint: readonly BfnOperatingPointInputV1[];
  readonly outputAtOperatingPoint: {
    readonly value: number;
    readonly unit: BfnUnit;
  };
  readonly perInput: readonly BfnLocalInputInfluenceV1[];
  readonly applicability: Exclude<BfnInterpretationApplicabilityState, 'outside_recorded_domain'>;
  readonly persistence: 'ephemeral';
}
