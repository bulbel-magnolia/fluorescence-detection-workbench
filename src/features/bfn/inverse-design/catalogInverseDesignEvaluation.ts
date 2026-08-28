import {
  evaluateReceiverResponse,
  isTrustedReceiverResponseBinding,
} from '../../modeling/receiverResponseEvaluator';
import type { ReceiverResponseBinding } from '../../modeling/types';
import {
  isTrustedReleaseCatalogPresentation,
  loadReleaseCatalogPresentation,
} from '../../modeling/catalog/releaseCatalogPresentation';
import {
  sortCatalogInverseMatched,
  sortCatalogInverseNearMatches,
  sortCatalogInverseNotApplicable,
} from './catalogInverseDesignRanking';
import type {
  BfnCatalogInverseCandidate,
  BfnCatalogInverseCandidateResult,
  BfnCatalogInverseCriterionResult,
  BfnCatalogInverseEligibilityKind,
  BfnCatalogInverseEligibilityResult,
  BfnCatalogInverseEvaluation,
  BfnCatalogInverseExclusionReason,
  BfnCatalogInverseMatchedResult,
  BfnCatalogInverseNearMatchResult,
  BfnCatalogInverseNotApplicableResult,
  BfnCatalogInverseSearchResult,
  BfnCatalogInverseSearchSpace,
  BfnCatalogInverseTarget,
  BfnCatalogInverseValidationIssue,
} from './catalogInverseDesignTypes';
import { validateCatalogInverseTarget } from './catalogInverseDesignValidation';

const CURVE_INTERVAL_COUNT = 60;

export interface CatalogInverseEvaluationAdapter {
  evaluateResponse(
    binding: ReceiverResponseBinding,
    concentrationM: number,
    inputUnit: 'M',
  ): number;
}

export const defaultCatalogInverseEvaluationAdapter: CatalogInverseEvaluationAdapter =
  Object.freeze({
    evaluateResponse: evaluateReceiverResponse,
  });

export type BfnCatalogInverseDesignErrorCode = 'invalid-target';

export class BfnCatalogInverseDesignError extends Error {
  readonly code: BfnCatalogInverseDesignErrorCode;
  readonly issues: readonly BfnCatalogInverseValidationIssue[];

  constructor(
    code: BfnCatalogInverseDesignErrorCode,
    issues: readonly BfnCatalogInverseValidationIssue[],
  ) {
    super(code);
    this.name = 'BfnCatalogInverseDesignError';
    this.code = code;
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function candidateContextMatchesCanonical(candidate: BfnCatalogInverseCandidate): boolean {
  try {
    const presentation = loadReleaseCatalogPresentation();
    if (!isTrustedReleaseCatalogPresentation(presentation)) return false;
    const response = presentation.responseVariants.find(
      (entry) => entry.id === candidate.responseId,
    );
    return (
      response !== undefined &&
      response.parameterContext.id === candidate.parameterContextId &&
      response.parameterContext.hostSpecies === candidate.context.hostSpecies &&
      response.parameterContext.hostStrain === candidate.context.hostStrain
    );
  } catch {
    return false;
  }
}

function candidateBindingMatches(candidate: BfnCatalogInverseCandidate): boolean {
  const binding = candidate.binding;
  return (
    isTrustedReceiverResponseBinding(binding) &&
    candidateContextMatchesCanonical(candidate) &&
    binding.receiverResponseId === candidate.responseId &&
    binding.componentId === candidate.componentId &&
    binding.inputSignalId === candidate.inputSignalId &&
    binding.parameterContextId === candidate.parameterContextId &&
    sameStrings(binding.sourceIds, candidate.sourceIds) &&
    binding.direction === candidate.biologicalDirection &&
    binding.originalParameters.ec50 === candidate.model.ec50M &&
    binding.originalParameters.hillCoefficient === candidate.model.hillCoefficient &&
    binding.workingRange.min === candidate.model.workingRangeM.minimum &&
    binding.workingRange.max === candidate.model.workingRangeM.maximum
  );
}

function passed(kind: BfnCatalogInverseEligibilityKind): BfnCatalogInverseEligibilityResult {
  return { kind, passed: true };
}

function failed(
  kind: BfnCatalogInverseEligibilityKind,
  reason: BfnCatalogInverseExclusionReason,
): BfnCatalogInverseEligibilityResult {
  return { kind, passed: false, reason };
}

function hostEligibility(
  candidate: BfnCatalogInverseCandidate,
  target: BfnCatalogInverseTarget,
): BfnCatalogInverseEligibilityResult {
  const required = target.contextFilter?.hostSpecies;
  if (required === undefined) return passed('host');
  if (candidate.context.hostSpecies === null) return failed('host', 'host-unrecorded');
  return candidate.context.hostSpecies === required
    ? passed('host')
    : failed('host', 'host-mismatch');
}

function strainEligibility(
  candidate: BfnCatalogInverseCandidate,
  target: BfnCatalogInverseTarget,
): BfnCatalogInverseEligibilityResult {
  const required = target.contextFilter?.hostStrain;
  if (required === undefined) return passed('strain');
  if (candidate.context.hostStrain === null) return failed('strain', 'strain-unrecorded');
  return candidate.context.hostStrain === required
    ? passed('strain')
    : failed('strain', 'strain-mismatch');
}

export function evaluateCatalogInverseEligibility(
  candidate: BfnCatalogInverseCandidate,
  target: BfnCatalogInverseTarget,
): readonly BfnCatalogInverseEligibilityResult[] {
  const range = candidate.model.workingRangeM;
  const window = target.responseWindow;
  return deepFreeze([
    candidateBindingMatches(candidate) ? passed('trust') : failed('trust', 'trust-unavailable'),
    candidate.inputSignalId === target.inputSignalId
      ? passed('signal')
      : failed('signal', 'signal-mismatch'),
    range.minimum <= window.lowConcentrationM && window.highConcentrationM <= range.maximum
      ? passed('working-range')
      : failed('working-range', 'target-outside-working-range'),
    target.biologicalDirection === 'any' ||
    target.biologicalDirection === candidate.biologicalDirection
      ? passed('biological-direction')
      : failed('biological-direction', 'mechanism-mismatch'),
    hostEligibility(candidate, target),
    strainEligibility(candidate, target),
  ]);
}

function candidateResultBase(
  candidate: BfnCatalogInverseCandidate,
  eligibility: readonly BfnCatalogInverseEligibilityResult[],
) {
  return {
    responseId: candidate.responseId,
    componentId: candidate.componentId,
    inputSignalId: candidate.inputSignalId,
    parameterContextId: candidate.parameterContextId,
    sourceIds: [...candidate.sourceIds],
    biologicalDirection: candidate.biologicalDirection,
    context: {
      hostSpecies: candidate.context.hostSpecies,
      hostStrain: candidate.context.hostStrain,
    },
    model: {
      ec50M: candidate.model.ec50M,
      hillCoefficient: candidate.model.hillCoefficient,
      workingRangeM: {
        minimum: candidate.model.workingRangeM.minimum,
        maximum: candidate.model.workingRangeM.maximum,
      },
    },
    eligibility,
  };
}

function notApplicableResult(
  candidate: BfnCatalogInverseCandidate,
  eligibility: readonly BfnCatalogInverseEligibilityResult[],
): BfnCatalogInverseNotApplicableResult {
  const reasons = eligibility.flatMap((entry) => (entry.passed ? [] : [entry.reason]));
  const first = reasons[0];
  if (first === undefined) throw new Error('CATALOG_INVERSE_EXCLUSION_REASON_MISSING');
  return deepFreeze({
    ...candidateResultBase(candidate, eligibility),
    status: 'not-applicable',
    criteria: [],
    evaluation: null,
    exclusionReasons: [first, ...reasons.slice(1)],
  });
}

function evaluateTrustedPoint(
  candidate: BfnCatalogInverseCandidate,
  concentrationM: number,
  adapter: CatalogInverseEvaluationAdapter,
): number {
  // The injected seam may reject or corroborate a canonical value, never replace it.
  const canonical = evaluateReceiverResponse(candidate.binding, concentrationM, 'M');
  if (adapter !== defaultCatalogInverseEvaluationAdapter) {
    const corroborated = adapter.evaluateResponse(candidate.binding, concentrationM, 'M');
    if (!Object.is(corroborated, canonical)) {
      throw new Error('CATALOG_INVERSE_NONCANONICAL_EVALUATION');
    }
  }
  if (!Number.isFinite(canonical) || canonical < 0 || canonical > 1) {
    throw new Error('CATALOG_INVERSE_EVALUATION_INVALID');
  }
  return canonical;
}

function buildTrustedEvaluation(
  candidate: BfnCatalogInverseCandidate,
  target: BfnCatalogInverseTarget,
  adapter: CatalogInverseEvaluationAdapter,
): BfnCatalogInverseEvaluation {
  const low = target.responseWindow.lowConcentrationM;
  const high = target.responseWindow.highConcentrationM;
  const logLow = Math.log10(low);
  const logHigh = Math.log10(high);
  const curve = Array.from({ length: CURVE_INTERVAL_COUNT + 1 }, (_unused, index) => {
    const concentrationM =
      index === 0
        ? low
        : index === CURVE_INTERVAL_COUNT
          ? high
          : 10 ** (logLow + (index / CURVE_INTERVAL_COUNT) * (logHigh - logLow));
    return {
      concentrationM,
      response: evaluateTrustedPoint(candidate, concentrationM, adapter),
    };
  });
  const lowResponse = curve[0]?.response;
  const highResponse = curve[CURVE_INTERVAL_COUNT]?.response;
  if (lowResponse === undefined || highResponse === undefined) {
    throw new Error('CATALOG_INVERSE_EVALUATION_INCOMPLETE');
  }
  return deepFreeze({ lowResponse, highResponse, curve });
}

function buildCriteria(
  candidate: BfnCatalogInverseCandidate,
  target: BfnCatalogInverseTarget,
  evaluation: BfnCatalogInverseEvaluation,
): readonly BfnCatalogInverseCriterionResult[] {
  const lowMaximum = target.responseWindow.lowResponseMaximum;
  const highMinimum = target.responseWindow.highResponseMinimum;
  const criteria: BfnCatalogInverseCriterionResult[] = [
    {
      kind: 'low-response-maximum',
      actual: evaluation.lowResponse,
      requiredMaximum: lowMaximum,
      passed: evaluation.lowResponse <= lowMaximum,
      deviation: Math.max(0, evaluation.lowResponse - lowMaximum),
    },
    {
      kind: 'high-response-minimum',
      actual: evaluation.highResponse,
      requiredMinimum: highMinimum,
      passed: evaluation.highResponse >= highMinimum,
      deviation: Math.max(0, highMinimum - evaluation.highResponse),
    },
  ];

  if (target.ec50RangeM !== undefined) {
    const range = target.ec50RangeM;
    const actual = candidate.model.ec50M;
    const deviation =
      actual < range.minimum
        ? Math.log10(range.minimum / actual)
        : actual > range.maximum
          ? Math.log10(actual / range.maximum)
          : 0;
    criteria.push({
      kind: 'ec50-range',
      actualM: actual,
      requiredRangeM: { minimum: range.minimum, maximum: range.maximum },
      passed: deviation === 0,
      deviation,
    });
  }

  if (target.hillCoefficientRange !== undefined) {
    const range = target.hillCoefficientRange;
    const actual = candidate.model.hillCoefficient;
    const deviation =
      actual < range.minimum
        ? (range.minimum - actual) / Math.max(range.minimum, 1)
        : actual > range.maximum
          ? (actual - range.maximum) / Math.max(range.maximum, 1)
          : 0;
    criteria.push({
      kind: 'hill-range',
      actual,
      requiredRange: { minimum: range.minimum, maximum: range.maximum },
      passed: deviation === 0,
      deviation,
    });
  }
  return deepFreeze(criteria);
}

function evaluationUnavailableEligibility(
  eligibility: readonly BfnCatalogInverseEligibilityResult[],
): readonly BfnCatalogInverseEligibilityResult[] {
  return deepFreeze(
    eligibility.map((entry) =>
      entry.kind === 'trust' ? failed('trust', 'evaluation-unavailable') : entry,
    ),
  );
}

export function evaluateCatalogInverseCandidate(
  candidate: BfnCatalogInverseCandidate,
  target: BfnCatalogInverseTarget,
  adapter: CatalogInverseEvaluationAdapter = defaultCatalogInverseEvaluationAdapter,
): BfnCatalogInverseCandidateResult {
  const eligibility = evaluateCatalogInverseEligibility(candidate, target);
  if (eligibility.some((entry) => !entry.passed)) {
    return notApplicableResult(candidate, eligibility);
  }

  let evaluation: BfnCatalogInverseEvaluation;
  try {
    evaluation = buildTrustedEvaluation(candidate, target, adapter);
  } catch {
    return notApplicableResult(candidate, evaluationUnavailableEligibility(eligibility));
  }

  const criteria = buildCriteria(candidate, target, evaluation);
  const base = candidateResultBase(candidate, eligibility);
  if (criteria.every((criterion) => criterion.passed)) {
    const result: BfnCatalogInverseMatchedResult = {
      ...base,
      status: 'matched',
      criteria,
      evaluation,
      exclusionReasons: [],
    };
    return deepFreeze(result);
  }
  const result: BfnCatalogInverseNearMatchResult = {
    ...base,
    status: 'near-match',
    criteria,
    evaluation,
    exclusionReasons: [],
  };
  return deepFreeze(result);
}

function uniqueStable(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

export function runCatalogInverseDesign(
  searchSpace: BfnCatalogInverseSearchSpace,
  target: BfnCatalogInverseTarget,
  adapter: CatalogInverseEvaluationAdapter = defaultCatalogInverseEvaluationAdapter,
): BfnCatalogInverseSearchResult {
  const validation = validateCatalogInverseTarget(target, {
    searchableSignals: searchSpace.searchableSignals,
    contextOptions: searchSpace.contextOptions,
  });
  if (!validation.valid) {
    throw new BfnCatalogInverseDesignError('invalid-target', validation.issues);
  }

  const selected = searchSpace.candidates.filter(
    (candidate) => candidate.inputSignalId === validation.target.inputSignalId,
  );
  const matched: BfnCatalogInverseMatchedResult[] = [];
  const nearMatches: BfnCatalogInverseNearMatchResult[] = [];
  const notApplicable: BfnCatalogInverseNotApplicableResult[] = [];
  const unavailable = searchSpace.unavailableResponses
    .filter((response) => response.inputSignalId === validation.target.inputSignalId)
    .map((response) => response.responseId);

  for (const candidate of selected) {
    const result = evaluateCatalogInverseCandidate(candidate, validation.target, adapter);
    if (result.status === 'matched') matched.push(result);
    else if (result.status === 'near-match') nearMatches.push(result);
    else {
      notApplicable.push(result);
      if (
        result.exclusionReasons.includes('trust-unavailable') ||
        result.exclusionReasons.includes('evaluation-unavailable')
      ) {
        unavailable.push(result.responseId);
      }
    }
  }

  return deepFreeze({
    target: validation.target,
    release: { ...searchSpace.release },
    searchedResponseCount: selected.length,
    matched: sortCatalogInverseMatched(matched),
    nearMatches: sortCatalogInverseNearMatches(nearMatches),
    notApplicable: sortCatalogInverseNotApplicable(notApplicable),
    unavailableResponseIds: uniqueStable(unavailable),
  });
}
