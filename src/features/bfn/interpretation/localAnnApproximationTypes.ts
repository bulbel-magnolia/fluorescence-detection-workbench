import type { BfnUnit } from '../types';
import type {
  BfnInterpretationApplicabilityState,
  BfnInterpretationContextReferenceV1,
  BfnInterpretationEvidenceReferenceV1,
  BfnLocalDifferentialGainV1,
  BfnStaticInterpretationBasisV1,
} from './interpretationTypes';
import type {
  BfnNetworkInfluenceCalculationV1,
  BfnNetworkInterpretationContextSnapshotV1,
  BfnNetworkOperatingPointInputV1,
  BfnResolvedNetworkInfluenceTargetV1,
} from './networkInfluenceTypes';

export type BfnLocalAnnApproximationScopeV1 = 'network_local_ann_approximation';

export interface BfnLocalAnnApproximationRequestV1 {
  readonly contractVersion: '1.0';
  readonly scope: BfnLocalAnnApproximationScopeV1;
  readonly outputMonitorId: string;
  readonly operatingPoint: readonly BfnNetworkOperatingPointInputV1[];
}

export type BfnAvailableLocalAnnWeightV1 = Extract<
  BfnLocalDifferentialGainV1,
  { readonly availability: 'available' }
>;

export interface BfnLocalAnnModuleInputWeightV1 {
  readonly inputPortId: string;
  readonly operatingValue: number;
  readonly operatingUnit: BfnUnit;
  readonly weight: BfnAvailableLocalAnnWeightV1;
}

export interface BfnLocalAnnModuleApproximationV1 {
  readonly moduleId: string;
  readonly staticModelId: string;
  readonly staticModelVersion: string;
  readonly interpretationBasis: BfnStaticInterpretationBasisV1;
  readonly outputAtOperatingPoint: {
    readonly value: number;
    readonly unit: BfnUnit;
  };
  readonly inputWeights: readonly BfnLocalAnnModuleInputWeightV1[];
  readonly bias: {
    readonly value: number;
    readonly unit: BfnUnit;
  };
  readonly evidence: BfnInterpretationEvidenceReferenceV1;
  readonly contextReference: BfnInterpretationContextReferenceV1;
}

export interface BfnLocalAnnNetworkSourceWeightV1 {
  readonly inputSourceId: string;
  readonly operatingValue: number;
  readonly operatingUnit: BfnUnit;
  readonly weight: BfnAvailableLocalAnnWeightV1;
}

export interface BfnLocalAnnNetworkApproximationV1 {
  readonly outputMonitorId: string;
  readonly sourceWeights: readonly BfnLocalAnnNetworkSourceWeightV1[];
  readonly bias: {
    readonly value: number;
    readonly unit: BfnUnit;
  };
}

/** Complete local affine view derived from one explicit, admitted operating point. */
export interface BfnLocalAnnApproximationResultV1 {
  readonly contractVersion: '1.0';
  readonly scope: BfnLocalAnnApproximationScopeV1;
  readonly target: BfnResolvedNetworkInfluenceTargetV1;
  readonly operatingPoint: readonly BfnNetworkOperatingPointInputV1[];
  readonly outputAtOperatingPoint: {
    readonly value: number;
    readonly unit: BfnUnit;
  };
  readonly moduleApproximations: readonly BfnLocalAnnModuleApproximationV1[];
  readonly networkApproximation: BfnLocalAnnNetworkApproximationV1;
  readonly applicability: Exclude<BfnInterpretationApplicabilityState, 'outside_recorded_domain'>;
  readonly contextApplicability: BfnNetworkInterpretationContextSnapshotV1;
  readonly persistence: 'ephemeral';
}

export type BfnLocalAnnApproximationIssueV1 =
  | {
      readonly code: 'request_contract_invalid';
      readonly subjectId: 'request';
    }
  | {
      readonly code: 'incomplete_local_linearization';
      readonly moduleId: string;
      readonly inputPortId: string;
      readonly reason: Extract<
        BfnLocalDifferentialGainV1,
        { readonly availability: 'unavailable' }
      >['reason'];
    }
  | {
      readonly code: 'incomplete_network_linearization';
      readonly inputSourceId: string;
      readonly reason: Extract<
        BfnLocalDifferentialGainV1,
        { readonly availability: 'unavailable' }
      >['reason'];
    }
  | {
      readonly code: 'bias_non_finite';
      readonly subjectId: string;
    };

export type BfnLocalAnnApproximationCalculationV1 =
  | {
      readonly ok: true;
      readonly networkInfluence: Extract<BfnNetworkInfluenceCalculationV1, { readonly ok: true }>;
      readonly result: BfnLocalAnnApproximationResultV1;
    }
  | {
      readonly ok: false;
      readonly networkInfluence: BfnNetworkInfluenceCalculationV1 | null;
      readonly issue: BfnLocalAnnApproximationIssueV1 | null;
    };
