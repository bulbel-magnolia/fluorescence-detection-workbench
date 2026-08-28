import type { ReceiverResponseBinding } from '../../modeling/types';

/**
 * A catalog inverse-design target is a query over the audited response catalog.
 * It is deliberately independent from a BFN project, registry, workspace, or run.
 */
export type BfnCatalogInverseBiologicalDirection = 'any' | 'activation' | 'derepression';

export interface BfnCatalogInverseResponseWindow {
  lowConcentrationM: number;
  lowResponseMaximum: number;
  highConcentrationM: number;
  highResponseMinimum: number;
}

export interface BfnCatalogInversePositiveRange {
  minimum: number;
  maximum: number;
}

export interface BfnCatalogInverseContextFilter {
  hostSpecies?: string;
  hostStrain?: string;
}

export interface BfnCatalogInverseTarget {
  inputSignalId: string;
  responseWindow: BfnCatalogInverseResponseWindow;
  ec50RangeM?: BfnCatalogInversePositiveRange;
  hillCoefficientRange?: BfnCatalogInversePositiveRange;
  biologicalDirection: BfnCatalogInverseBiologicalDirection;
  contextFilter?: BfnCatalogInverseContextFilter;
}

export interface BfnCatalogInverseSignalOption {
  signalId: string;
  responseCount: number;
}

export interface BfnCatalogInverseContextOption {
  signalId: string;
  hostSpecies: string | null;
  hostStrain: string | null;
  candidateCount: number;
}

export interface BfnCatalogInverseReleaseIdentity {
  readonly catalogId: string;
  readonly releaseId: string;
  readonly releaseVersion: string;
}

export interface BfnCatalogInverseWorkingRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface BfnCatalogInverseCandidate {
  readonly responseId: string;
  readonly componentId: string;
  readonly inputSignalId: string;
  readonly parameterContextId: string;
  readonly sourceIds: readonly string[];
  readonly biologicalDirection: Exclude<BfnCatalogInverseBiologicalDirection, 'any'>;
  readonly context: {
    readonly hostSpecies: string | null;
    readonly hostStrain: string | null;
  };
  readonly model: {
    readonly ec50M: number;
    readonly hillCoefficient: number;
    readonly workingRangeM: BfnCatalogInverseWorkingRange;
  };
  /** Fresh binding admitted through the frozen receiver-response trust chain. */
  readonly binding: ReceiverResponseBinding;
}

export interface BfnCatalogInverseUnavailableResponse {
  readonly responseId: string;
  readonly inputSignalId: string;
}

export interface BfnCatalogInverseSearchSpace {
  readonly release: BfnCatalogInverseReleaseIdentity;
  readonly candidates: readonly BfnCatalogInverseCandidate[];
  readonly searchableSignals: readonly BfnCatalogInverseSignalOption[];
  readonly contextOptions: readonly BfnCatalogInverseContextOption[];
  /** Release-wide admission failures with canonical exact-signal identity. */
  readonly unavailableResponses: readonly BfnCatalogInverseUnavailableResponse[];
  /** Release-wide response IDs retained for audit compatibility. */
  readonly unavailableResponseIds: readonly string[];
}

export interface BfnCatalogInverseSignalProfile {
  readonly signalId: string;
  readonly candidateCount: number;
  readonly commonTrustedRangeM: BfnCatalogInverseWorkingRange | null;
}

export type BfnCatalogInverseEligibilityKind =
  'trust' | 'signal' | 'working-range' | 'biological-direction' | 'host' | 'strain';

export type BfnCatalogInverseExclusionReason =
  | 'trust-unavailable'
  | 'evaluation-unavailable'
  | 'signal-mismatch'
  | 'target-outside-working-range'
  | 'mechanism-mismatch'
  | 'host-mismatch'
  | 'host-unrecorded'
  | 'strain-mismatch'
  | 'strain-unrecorded';

export type BfnCatalogInverseEligibilityResult =
  | {
      readonly kind: BfnCatalogInverseEligibilityKind;
      readonly passed: true;
    }
  | {
      readonly kind: BfnCatalogInverseEligibilityKind;
      readonly passed: false;
      readonly reason: BfnCatalogInverseExclusionReason;
    };

export interface BfnCatalogInverseLowResponseCriterion {
  readonly kind: 'low-response-maximum';
  readonly actual: number;
  readonly requiredMaximum: number;
  readonly passed: boolean;
  readonly deviation: number;
}

export interface BfnCatalogInverseHighResponseCriterion {
  readonly kind: 'high-response-minimum';
  readonly actual: number;
  readonly requiredMinimum: number;
  readonly passed: boolean;
  readonly deviation: number;
}

export interface BfnCatalogInverseEc50Criterion {
  readonly kind: 'ec50-range';
  readonly actualM: number;
  readonly requiredRangeM: BfnCatalogInversePositiveRange;
  readonly passed: boolean;
  readonly deviation: number;
}

export interface BfnCatalogInverseHillCriterion {
  readonly kind: 'hill-range';
  readonly actual: number;
  readonly requiredRange: BfnCatalogInversePositiveRange;
  readonly passed: boolean;
  readonly deviation: number;
}

export type BfnCatalogInverseCriterionResult =
  | BfnCatalogInverseLowResponseCriterion
  | BfnCatalogInverseHighResponseCriterion
  | BfnCatalogInverseEc50Criterion
  | BfnCatalogInverseHillCriterion;

export interface BfnCatalogInverseCurvePoint {
  readonly concentrationM: number;
  readonly response: number;
}

export interface BfnCatalogInverseEvaluation {
  readonly lowResponse: number;
  readonly highResponse: number;
  readonly curve: readonly BfnCatalogInverseCurvePoint[];
}

export interface BfnCatalogInverseCandidateResultBase {
  readonly responseId: string;
  readonly componentId: string;
  readonly inputSignalId: string;
  readonly parameterContextId: string;
  readonly sourceIds: readonly string[];
  readonly biologicalDirection: Exclude<BfnCatalogInverseBiologicalDirection, 'any'>;
  readonly context: {
    readonly hostSpecies: string | null;
    readonly hostStrain: string | null;
  };
  readonly model: {
    readonly ec50M: number;
    readonly hillCoefficient: number;
    readonly workingRangeM: BfnCatalogInverseWorkingRange;
  };
  readonly eligibility: readonly BfnCatalogInverseEligibilityResult[];
}

export interface BfnCatalogInverseMatchedResult extends BfnCatalogInverseCandidateResultBase {
  readonly status: 'matched';
  readonly criteria: readonly BfnCatalogInverseCriterionResult[];
  readonly evaluation: BfnCatalogInverseEvaluation;
  readonly exclusionReasons: readonly [];
}

export interface BfnCatalogInverseNearMatchResult extends BfnCatalogInverseCandidateResultBase {
  readonly status: 'near-match';
  readonly criteria: readonly BfnCatalogInverseCriterionResult[];
  readonly evaluation: BfnCatalogInverseEvaluation;
  readonly exclusionReasons: readonly [];
}

export interface BfnCatalogInverseNotApplicableResult extends BfnCatalogInverseCandidateResultBase {
  readonly status: 'not-applicable';
  readonly criteria: readonly [];
  readonly evaluation: null;
  readonly exclusionReasons: readonly [
    BfnCatalogInverseExclusionReason,
    ...BfnCatalogInverseExclusionReason[],
  ];
}

export type BfnCatalogInverseCandidateResult =
  | BfnCatalogInverseMatchedResult
  | BfnCatalogInverseNearMatchResult
  | BfnCatalogInverseNotApplicableResult;

export interface BfnCatalogInverseSearchResult {
  readonly target: BfnCatalogInverseTarget;
  readonly release: BfnCatalogInverseReleaseIdentity;
  readonly searchedResponseCount: number;
  readonly matched: readonly BfnCatalogInverseMatchedResult[];
  readonly nearMatches: readonly BfnCatalogInverseNearMatchResult[];
  readonly notApplicable: readonly BfnCatalogInverseNotApplicableResult[];
  readonly unavailableResponseIds: readonly string[];
}

export interface BfnCatalogInverseValidationContext {
  searchableSignals: readonly BfnCatalogInverseSignalOption[];
  contextOptions: readonly BfnCatalogInverseContextOption[];
}

export type BfnCatalogInverseValidationIssueSeverity = 'error' | 'warning';

export type BfnCatalogInverseValidationIssueCode =
  | 'missing-signal'
  | 'signal-not-searchable'
  | 'low-concentration-invalid'
  | 'high-concentration-invalid'
  | 'concentration-order-invalid'
  | 'low-response-invalid'
  | 'high-response-invalid'
  | 'ec50-range-invalid'
  | 'hill-range-invalid'
  | 'direction-invalid'
  | 'host-strain-invalid-combination'
  | 'weak-response-separation'
  | 'target-invalid';

export interface BfnCatalogInverseValidationIssue {
  code: BfnCatalogInverseValidationIssueCode;
  severity: BfnCatalogInverseValidationIssueSeverity;
}

export type BfnCatalogInverseValidationResult =
  | {
      valid: true;
      target: BfnCatalogInverseTarget;
      issues: readonly BfnCatalogInverseValidationIssue[];
    }
  | {
      valid: false;
      target: null;
      issues: readonly BfnCatalogInverseValidationIssue[];
    };

/**
 * Builds the initial target controls without inventing concentration values.
 * The response defaults are UI starting points, not scientific thresholds.
 */
export function createDefaultCatalogInverseTarget(
  inputSignalId: string,
  lowConcentrationM: number,
  highConcentrationM: number,
): BfnCatalogInverseTarget {
  return {
    inputSignalId,
    responseWindow: {
      lowConcentrationM,
      lowResponseMaximum: 0.2,
      highConcentrationM,
      highResponseMinimum: 0.8,
    },
    biologicalDirection: 'any',
  };
}
