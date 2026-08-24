import { evaluateHill } from './responseMath';
import type {
  BfnCalibrationCandidate,
  BfnProject,
  BfnReverseDesignCandidate,
  BfnReverseTarget,
} from './types';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function range(start: number, end: number, count: number): number[] {
  if (count <= 1) return [start];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
}

function functionalMismatch(candidate: BfnCalibrationCandidate, target: BfnReverseTarget): number {
  const parameters = candidate.predictedParameters;
  const inputSpan = Math.max(Number.EPSILON, target.inputMaximum - target.inputMinimum);
  const thresholdError = Math.abs(parameters.k - target.thresholdTarget) / inputSpan;
  const basalViolation =
    Math.max(0, parameters.ymin - target.basalMaximum) / Math.max(target.basalMaximum, 0.05);
  const maximumViolation =
    Math.max(0, target.maximumMinimum - parameters.ymax) / Math.max(target.maximumMinimum, 0.05);
  const timingViolation =
    Math.max(0, parameters.tauHours - target.responseTimeMaximumHours) /
    Math.max(target.responseTimeMaximumHours, 0.1);
  return clamp01((thresholdError + basalViolation + maximumViolation + timingViolation) / 4);
}

function weightedScore(
  candidate: BfnCalibrationCandidate,
  target: BfnReverseTarget,
): BfnReverseDesignCandidate['scores'] {
  const functionMatch = functionalMismatch(candidate, target);
  const burden = clamp01(candidate.burden);
  const crosstalk = clamp01(candidate.crosstalk);
  const noise = clamp01(candidate.noise);
  const uncertainty = clamp01(candidate.uncertainty);
  const geneticRisk = clamp01(1 - candidate.geneticStability);
  const weights = target.weights;
  const weighted =
    weights.functionMatch * functionMatch +
    weights.burden * burden +
    weights.crosstalk * crosstalk +
    weights.noise * noise +
    weights.uncertainty * uncertainty +
    weights.geneticRisk * geneticRisk * Math.max(0.1, target.stabilityPriority);
  const denominator =
    weights.functionMatch +
    weights.burden +
    weights.crosstalk +
    weights.noise +
    weights.uncertainty +
    weights.geneticRisk * Math.max(0.1, target.stabilityPriority);
  return {
    total: denominator > 0 ? weighted / denominator : weighted,
    functionMatch,
    burden,
    crosstalk,
    noise,
    uncertainty,
    geneticRisk,
  };
}

export const defaultBfnReverseTarget: BfnReverseTarget = {
  inputMinimum: 0,
  inputMaximum: 50,
  thresholdTarget: 10,
  basalMaximum: 0.05,
  maximumMinimum: 0.9,
  responseTimeMaximumHours: 2,
  burdenMaximum: 0.5,
  noiseMaximum: 0.3,
  stabilityPriority: 0.8,
  weights: {
    functionMatch: 1,
    burden: 0.55,
    crosstalk: 0.45,
    noise: 0.5,
    uncertainty: 0.65,
    geneticRisk: 0.7,
  },
};

export function runBfnReverseDesign(
  project: BfnProject,
  target: BfnReverseTarget,
): BfnReverseDesignCandidate[] {
  const calibrationMap = project.registry.calibrationMaps[0];
  if (!calibrationMap) return [];
  return calibrationMap.candidates
    .map((candidate) => ({
      id: `reverse-${candidate.id}`,
      calibrationCandidateId: candidate.id,
      labelKey: candidate.labelKey,
      designVariables: structuredClone(candidate.designVariables),
      predictedParameters: { ...candidate.predictedParameters },
      predictedResponse: range(target.inputMinimum, target.inputMaximum, 41).map((input) => ({
        input,
        output: evaluateHill(
          input,
          candidate.predictedParameters.ymin,
          candidate.predictedParameters.ymax,
          candidate.predictedParameters.k,
          candidate.predictedParameters.n,
          'activation',
        ),
      })),
      scores: weightedScore(candidate, target),
      evidenceGrade: 'proposed_unbuilt_design' as const,
      sourceEvidenceGrade: candidate.sourceEvidenceGrade,
      recommendedValidationKey: 'bfn.reverse.recommendedValidation',
      isDemo: true,
    }))
    .filter(
      (candidate) =>
        candidate.scores.burden <= Math.max(target.burdenMaximum, 0) + 0.5 &&
        candidate.scores.noise <= Math.max(target.noiseMaximum, 0) + 0.5,
    )
    .sort((left, right) => left.scores.total - right.scores.total);
}
