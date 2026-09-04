import type { BfnUnit } from '../types';
import type { BfnContextApplicabilityCheck } from '../compatibility/compatibilityTypes';
import type { BfnIntegratedContextApplicabilityState } from '../compatibility/contextIntegration';
import type {
  BfnDerivedGainUnit,
  BfnInterpretationApplicabilityState,
  BfnLocalDifferentialGainV1,
  BfnLocalInfluenceResultV1,
  BfnLogElasticityV1,
  BfnResolvedLocalInfluenceTargetV1,
} from './interpretationTypes';

export type BfnNetworkInfluenceAnalysisScopeV1 = 'network_static_output';

export interface BfnNetworkOperatingPointInputV1 {
  readonly inputSourceId: string;
  readonly value: number;
  readonly unit: BfnUnit;
}

export interface BfnNetworkInfluenceRequestV1 {
  readonly contractVersion: '1.0';
  readonly scope: BfnNetworkInfluenceAnalysisScopeV1;
  readonly outputMonitorId: string;
  readonly operatingPoint: readonly BfnNetworkOperatingPointInputV1[];
}

export type BfnNetworkInfluenceIssueCodeV1 =
  | 'output_monitor_not_found'
  | 'output_monitor_identity_conflict'
  | 'input_source_identity_conflict'
  | 'module_identity_conflict'
  | 'required_input_unconnected'
  | 'required_input_ambiguous'
  | 'edge_contract_invalid'
  | 'edge_endpoint_invalid'
  | 'edge_scientific_identity_mismatch'
  | 'edge_unit_incompatible'
  | 'upstream_feedback_unsupported'
  | 'upstream_accumulator_unsupported'
  | 'response_model_invalid'
  | 'input_source_value_missing'
  | 'input_source_value_duplicate'
  | 'unexpected_input_source'
  | 'input_source_invalid'
  | 'unit_mismatch'
  | 'value_non_finite'
  | 'value_negative'
  | 'request_contract_invalid';

export interface BfnNetworkInfluenceIssueV1 {
  readonly code: BfnNetworkInfluenceIssueCodeV1;
  readonly severity: 'error' | 'warning';
  readonly subjectId: string;
  readonly details?: Readonly<Record<string, string | number>>;
}

export interface BfnResolvedNetworkInputSourceV1 {
  readonly inputSourceId: string;
  readonly outputPortId: string;
  readonly unit: BfnUnit;
}

export interface BfnResolvedNetworkInfluenceTargetV1 {
  readonly contractVersion: '1.0';
  readonly scope: BfnNetworkInfluenceAnalysisScopeV1;
  readonly outputMonitorId: string;
  readonly outputPortId: string;
  readonly outputUnit: BfnUnit;
  readonly inputSources: readonly BfnResolvedNetworkInputSourceV1[];
  readonly moduleTargets: readonly BfnResolvedLocalInfluenceTargetV1[];
  readonly relevantEdgeIds: readonly string[];
  readonly includesFirstOrderSteadyState: boolean;
  readonly directTransmission: boolean;
}

export interface BfnNetworkInfluenceAdmissionV1 {
  readonly status: 'supported' | 'unsupported';
  readonly issues: readonly BfnNetworkInfluenceIssueV1[];
  readonly target: BfnResolvedNetworkInfluenceTargetV1 | null;
}

export type BfnNetworkInfluenceDirectionV1 =
  'enhancing' | 'inhibiting' | 'no_local_change' | 'unavailable';

export interface BfnNetworkSourceInfluenceV1 {
  readonly inputSourceId: string;
  readonly operatingValue: number;
  readonly operatingUnit: BfnUnit;
  readonly totalDifferentialGain: BfnLocalDifferentialGainV1;
  readonly logElasticity: BfnLogElasticityV1;
  readonly direction: BfnNetworkInfluenceDirectionV1;
}

export interface BfnNetworkModuleInterpretationV1 {
  readonly moduleId: string;
  readonly localInfluence: BfnLocalInfluenceResultV1;
}

export type BfnNetworkInterpretationContextSummaryV1 =
  'not_applicable' | 'matched' | 'mismatch_present' | 'uncertain_or_unavailable';

export interface BfnNetworkInterpretationContextEdgeV1 {
  readonly edgeId: string;
  readonly state: BfnIntegratedContextApplicabilityState;
  readonly checks: readonly BfnContextApplicabilityCheck[];
}

/** Scientific caveat snapshot for Module-to-Module edges in the selected target closure only. */
export interface BfnNetworkInterpretationContextSnapshotV1 {
  readonly scope: 'target_relevant_module_edges';
  readonly summary: BfnNetworkInterpretationContextSummaryV1;
  readonly edges: readonly BfnNetworkInterpretationContextEdgeV1[];
}

/** Ephemeral, target-scoped result calculated at one explicit external operating point. */
export interface BfnNetworkInfluenceResultV1 {
  readonly contractVersion: '1.0';
  readonly scope: BfnNetworkInfluenceAnalysisScopeV1;
  readonly target: BfnResolvedNetworkInfluenceTargetV1;
  readonly operatingPoint: readonly BfnNetworkOperatingPointInputV1[];
  readonly outputAtOperatingPoint: {
    readonly value: number;
    readonly unit: BfnUnit;
  };
  readonly perSource: readonly BfnNetworkSourceInfluenceV1[];
  readonly applicability: Exclude<BfnInterpretationApplicabilityState, 'outside_recorded_domain'>;
  readonly contextApplicability: BfnNetworkInterpretationContextSnapshotV1;
  readonly moduleInterpretations: readonly BfnNetworkModuleInterpretationV1[];
  readonly persistence: 'ephemeral';
}

export type BfnNetworkInfluenceCalculationIssueV1 =
  | {
      readonly code: 'outside_recorded_domain';
      readonly moduleId: string;
      readonly inputPortId: string;
      readonly currentValue: number;
      readonly currentUnit: BfnUnit;
      readonly minimum: number;
      readonly maximum: number;
      readonly rangeUnit: BfnUnit;
    }
  | {
      readonly code: 'module_calculation_failed';
      readonly moduleId: string;
    }
  | {
      readonly code: 'unit_conversion_failed' | 'output_non_finite';
      readonly subjectId: string;
    };

export type BfnNetworkInfluenceCalculationV1 =
  | {
      readonly ok: true;
      readonly admission: BfnNetworkInfluenceAdmissionV1;
      readonly result: BfnNetworkInfluenceResultV1;
    }
  | {
      readonly ok: false;
      readonly admission: BfnNetworkInfluenceAdmissionV1;
      readonly calculationIssue: BfnNetworkInfluenceCalculationIssueV1 | null;
    };

export type BfnNetworkSensitivityResolutionV1 =
  | {
      readonly availability: 'available';
      readonly value: number;
    }
  | {
      readonly availability: 'unavailable';
      readonly reason: Extract<
        BfnLocalDifferentialGainV1,
        { readonly availability: 'unavailable' }
      >['reason'];
    };

export function bfnNetworkGainUnit(outputUnit: BfnUnit, inputUnit: BfnUnit): BfnDerivedGainUnit {
  return Object.freeze({ outputUnit, inputUnit });
}
