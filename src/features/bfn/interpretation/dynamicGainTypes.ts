import type { BfnUnit } from '../types';
import type { BfnComplex } from './complexMath';
import type {
  BfnDerivedGainUnit,
  BfnInterpretationApplicabilityState,
  BfnInterpretationContextReferenceV1,
  BfnInterpretationEvidenceReferenceV1,
  BfnLocalDifferentialGainV1,
} from './interpretationTypes';
import type {
  BfnNetworkInfluenceAdmissionV1,
  BfnNetworkInfluenceCalculationV1,
  BfnNetworkInterpretationContextSnapshotV1,
  BfnNetworkOperatingPointInputV1,
  BfnResolvedNetworkInfluenceTargetV1,
} from './networkInfluenceTypes';

export type BfnDynamicGainAnalysisScopeV1 = 'network_dynamic_periodic_gain';

export interface BfnDynamicGainRequestV1 {
  readonly contractVersion: '1.0';
  readonly scope: BfnDynamicGainAnalysisScopeV1;
  readonly outputMonitorId: string;
  readonly operatingPoint: readonly BfnNetworkOperatingPointInputV1[];
  readonly perturbation: {
    readonly periodHours: number;
  };
}

export interface BfnFirstOrderDynamicModelReferenceV1 {
  readonly dynamicModelId: string;
  readonly dynamicModelVersion: string;
  readonly tauHours: number;
  readonly evidence: BfnInterpretationEvidenceReferenceV1;
  readonly contextReference: BfnInterpretationContextReferenceV1;
  readonly validityDomainId: string;
}

export interface BfnResolvedDynamicGainModuleV1 {
  readonly moduleId: string;
  readonly dynamicKind: 'quasi_static' | 'first_order';
  readonly staticModelId: string;
  readonly staticModelVersion: string;
  readonly analysisEvidence: BfnInterpretationEvidenceReferenceV1;
  readonly contextReference: BfnInterpretationContextReferenceV1;
  readonly validityDomainId: string;
  readonly dynamicModel: BfnFirstOrderDynamicModelReferenceV1 | null;
}

export interface BfnResolvedDynamicGainTargetV1 {
  readonly baselineTarget: BfnResolvedNetworkInfluenceTargetV1;
  readonly modules: readonly BfnResolvedDynamicGainModuleV1[];
}

export type BfnDynamicGainIssueCodeV1 =
  | 'request_contract_invalid'
  | 'dynamic_mode_required'
  | 'perturbation_period_invalid'
  | 'integrator_reference_state_unavailable'
  | 'feedback'
  | 'missing_input'
  | 'response_invalid'
  | 'baseline_operating_point_invalid'
  | 'dynamic_model_contract_invalid';

export interface BfnDynamicGainIssueV1 {
  readonly code: BfnDynamicGainIssueCodeV1;
  readonly severity: 'error';
  readonly subjectId: string;
  readonly details?: Readonly<Record<string, string | number>>;
}

export interface BfnDynamicGainAdmissionV1 {
  readonly status: 'supported' | 'unsupported';
  readonly issues: readonly BfnDynamicGainIssueV1[];
  readonly target: BfnResolvedDynamicGainTargetV1 | null;
  readonly baselineAdmission: BfnNetworkInfluenceAdmissionV1 | null;
}

export type BfnDynamicGainUnavailableReasonV1 =
  | Extract<BfnLocalDifferentialGainV1, { readonly availability: 'unavailable' }>['reason']
  | 'complex_non_finite';

export type BfnDynamicGainValueV1 =
  | {
      readonly availability: 'available';
      readonly complex: BfnComplex;
      readonly magnitude: number;
      readonly unit: BfnDerivedGainUnit;
    }
  | {
      readonly availability: 'unavailable';
      readonly reason: BfnDynamicGainUnavailableReasonV1;
      readonly unit: BfnDerivedGainUnit;
    };

export type BfnDynamicPhaseV1 =
  | {
      readonly availability: 'available';
      readonly degrees: number;
    }
  | {
      readonly availability: 'unavailable';
      readonly reason: 'zero_magnitude' | 'derivative_unavailable' | 'complex_non_finite';
    };

export interface BfnDynamicModuleInputTransferV1 {
  readonly inputPortId: string;
  readonly operatingValue: number;
  readonly operatingUnit: BfnUnit;
  readonly localStaticGain: BfnLocalDifferentialGainV1;
  readonly dynamicGain: BfnDynamicGainValueV1;
  readonly phase: BfnDynamicPhaseV1;
}

export interface BfnDynamicModuleTransferV1 extends BfnResolvedDynamicGainModuleV1 {
  readonly inputs: readonly BfnDynamicModuleInputTransferV1[];
}

export interface BfnDynamicSourceGainV1 {
  readonly inputSourceId: string;
  readonly operatingValue: number;
  readonly operatingUnit: BfnUnit;
  readonly dynamicGain: BfnDynamicGainValueV1;
  readonly phase: BfnDynamicPhaseV1;
}

export interface BfnDynamicGainResultV1 {
  readonly contractVersion: '1.0';
  readonly scope: BfnDynamicGainAnalysisScopeV1;
  readonly target: BfnResolvedDynamicGainTargetV1;
  readonly operatingPoint: readonly BfnNetworkOperatingPointInputV1[];
  readonly perturbationPeriodHours: number;
  readonly angularFrequencyRadPerHour: number;
  readonly baselineOutput: {
    readonly value: number;
    readonly unit: BfnUnit;
  };
  readonly perSource: readonly BfnDynamicSourceGainV1[];
  readonly moduleTransfers: readonly BfnDynamicModuleTransferV1[];
  readonly applicability: Exclude<BfnInterpretationApplicabilityState, 'outside_recorded_domain'>;
  readonly contextApplicability: BfnNetworkInterpretationContextSnapshotV1;
  readonly persistence: 'ephemeral';
}

export type BfnDynamicGainCalculationIssueV1 =
  | {
      readonly code: 'dynamic_propagation_failed';
      readonly subjectId: string;
    }
  | {
      readonly code: 'dynamic_model_resolution_failed';
      readonly subjectId: string;
    };

export type BfnDynamicGainCalculationV1 =
  | {
      readonly ok: true;
      readonly admission: BfnDynamicGainAdmissionV1;
      readonly networkInfluence: Extract<BfnNetworkInfluenceCalculationV1, { readonly ok: true }>;
      readonly result: BfnDynamicGainResultV1;
    }
  | {
      readonly ok: false;
      readonly admission: BfnDynamicGainAdmissionV1;
      readonly networkInfluence: BfnNetworkInfluenceCalculationV1 | null;
      readonly calculationIssue: BfnDynamicGainCalculationIssueV1 | null;
    };
