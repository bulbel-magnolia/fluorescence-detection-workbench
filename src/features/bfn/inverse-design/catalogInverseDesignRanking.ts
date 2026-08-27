import type {
  BfnCatalogInverseMatchedResult,
  BfnCatalogInverseNearMatchResult,
  BfnCatalogInverseNotApplicableResult,
} from './catalogInverseDesignTypes';

function byCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableScientificIdentity(
  left: { readonly componentId: string; readonly responseId: string },
  right: { readonly componentId: string; readonly responseId: string },
): number {
  return (
    byCodePoint(left.componentId, right.componentId) ||
    byCodePoint(left.responseId, right.responseId)
  );
}

interface NearMatchTuple {
  readonly failedCriteriaCount: number;
  readonly maximumDeviation: number;
  readonly sumDeviation: number;
}

function nearMatchTuple(candidate: BfnCatalogInverseNearMatchResult): NearMatchTuple {
  const deviations = candidate.criteria
    .filter((criterion) => !criterion.passed)
    .map((criterion) =>
      Number.isFinite(criterion.deviation) && criterion.deviation >= 0
        ? criterion.deviation
        : Number.POSITIVE_INFINITY,
    );
  return {
    failedCriteriaCount: deviations.length,
    maximumDeviation: deviations.length === 0 ? 0 : Math.max(...deviations),
    sumDeviation: deviations.reduce((total, deviation) => total + deviation, 0),
  };
}

export function sortCatalogInverseMatched(
  candidates: readonly BfnCatalogInverseMatchedResult[],
): readonly BfnCatalogInverseMatchedResult[] {
  return Object.freeze([...candidates].sort(stableScientificIdentity));
}

export function sortCatalogInverseNearMatches(
  candidates: readonly BfnCatalogInverseNearMatchResult[],
): readonly BfnCatalogInverseNearMatchResult[] {
  return Object.freeze(
    [...candidates].sort((left, right) => {
      const leftTuple = nearMatchTuple(left);
      const rightTuple = nearMatchTuple(right);
      return (
        leftTuple.failedCriteriaCount - rightTuple.failedCriteriaCount ||
        leftTuple.maximumDeviation - rightTuple.maximumDeviation ||
        leftTuple.sumDeviation - rightTuple.sumDeviation ||
        byCodePoint(left.responseId, right.responseId)
      );
    }),
  );
}

export function sortCatalogInverseNotApplicable(
  candidates: readonly BfnCatalogInverseNotApplicableResult[],
): readonly BfnCatalogInverseNotApplicableResult[] {
  return Object.freeze([...candidates].sort(stableScientificIdentity));
}
