import { describe, expect, it, vi } from 'vitest';
import { evaluateReceiverResponse } from '../../modeling/receiverResponseEvaluator';
import type { ReceiverResponseBinding } from '../../modeling/types';
import {
  buildCatalogInverseSearchSpace,
  defaultCatalogInverseRuntimeAdapter,
  type CatalogInverseRuntimeAdapter,
} from './catalogInverseDesignSpace';
import type {
  BfnCatalogInverseCandidate,
  BfnCatalogInverseCandidateResult,
  BfnCatalogInverseExclusionReason,
  BfnCatalogInverseTarget,
} from './catalogInverseDesignTypes';
import {
  BfnCatalogInverseDesignError,
  defaultCatalogInverseEvaluationAdapter,
  evaluateCatalogInverseCandidate,
  evaluateCatalogInverseEligibility,
  runCatalogInverseDesign,
  type CatalogInverseEvaluationAdapter,
} from './catalogInverseDesignEvaluation';

const KYLILIS_RESPONSE_ID = 'resp.kylilis2018.rhl.3oc6';
const SHONG_RESPONSE_ID = 'resp.shong2013.esar-wt-pesar.3oc6';
const L_3OC6_SIGNAL_ID = 'ahl.3oc6.l';
const C4_SIGNAL_ID = 'ahl.c4.dl';

function requiredCandidate(responseId: string): BfnCatalogInverseCandidate {
  const candidate = buildCatalogInverseSearchSpace().candidates.find(
    (entry) => entry.responseId === responseId,
  );
  if (candidate === undefined) throw new Error('missing real candidate: ' + responseId);
  return candidate;
}

interface TargetOptions {
  lowConcentrationM?: number;
  lowResponseMaximum?: number;
  highConcentrationM?: number;
  highResponseMinimum?: number;
  biologicalDirection?: BfnCatalogInverseTarget['biologicalDirection'];
  ec50RangeM?: BfnCatalogInverseTarget['ec50RangeM'];
  hillCoefficientRange?: BfnCatalogInverseTarget['hillCoefficientRange'];
  contextFilter?: BfnCatalogInverseTarget['contextFilter'];
}

function targetFor(
  candidate: BfnCatalogInverseCandidate,
  options: TargetOptions = {},
): BfnCatalogInverseTarget {
  return {
    inputSignalId: candidate.inputSignalId,
    responseWindow: {
      lowConcentrationM: options.lowConcentrationM ?? Math.max(candidate.model.ec50M / 10, 1e-15),
      lowResponseMaximum: options.lowResponseMaximum ?? 1,
      highConcentrationM: options.highConcentrationM ?? candidate.model.ec50M,
      highResponseMinimum: options.highResponseMinimum ?? 0,
    },
    biologicalDirection: options.biologicalDirection ?? 'any',
    ...(options.ec50RangeM === undefined ? {} : { ec50RangeM: options.ec50RangeM }),
    ...(options.hillCoefficientRange === undefined
      ? {}
      : { hillCoefficientRange: options.hillCoefficientRange }),
    ...(options.contextFilter === undefined ? {} : { contextFilter: options.contextFilter }),
  };
}

function expectNotApplicable(
  result: BfnCatalogInverseCandidateResult,
  reason: BfnCatalogInverseExclusionReason,
): void {
  expect(result.status).toBe('not-applicable');
  if (result.status !== 'not-applicable') throw new Error('expected not-applicable');
  expect(result.evaluation).toBeNull();
  expect(result.criteria).toEqual([]);
  expect(result.exclusionReasons).toContain(reason);
}

describe('catalog inverse design eligibility', () => {
  it.each(['low', 'high'] as const)(
    'rejects a target whose %s endpoint is outside the closed trusted range without evaluating',
    (endpoint) => {
      const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
      const evaluateResponse = vi.fn(
        (binding: ReceiverResponseBinding, concentrationM: number, unit: 'M') =>
          defaultCatalogInverseEvaluationAdapter.evaluateResponse(binding, concentrationM, unit),
      );
      const adapter: CatalogInverseEvaluationAdapter = { evaluateResponse };
      const target =
        endpoint === 'low'
          ? targetFor(candidate, {
              lowConcentrationM: candidate.model.workingRangeM.minimum / 10,
              highConcentrationM: candidate.model.ec50M,
            })
          : targetFor(candidate, {
              lowConcentrationM: candidate.model.ec50M,
              highConcentrationM: candidate.model.workingRangeM.maximum * 10,
            });

      const result = evaluateCatalogInverseCandidate(candidate, target, adapter);

      expectNotApplicable(result, 'target-outside-working-range');
      expect(evaluateResponse).not.toHaveBeenCalled();
    },
  );

  it('treats working-range endpoints as eligible closed boundaries', () => {
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const target = targetFor(candidate, {
      lowConcentrationM: candidate.model.workingRangeM.minimum,
      highConcentrationM: candidate.model.workingRangeM.maximum,
    });

    const eligibility = evaluateCatalogInverseEligibility(candidate, target);

    expect(eligibility.every((criterion) => criterion.passed)).toBe(true);
  });

  it('keeps the selected-signal pool exact and rejects a direct signal mismatch', () => {
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const target = { ...targetFor(candidate), inputSignalId: 'ahl.3oc6.stereo-unspecified' };
    const evaluateResponse = vi.fn(evaluateReceiverResponse);

    const result = evaluateCatalogInverseCandidate(candidate, target, { evaluateResponse });

    expectNotApplicable(result, 'signal-mismatch');
    expect(evaluateResponse).not.toHaveBeenCalled();
  });

  it('applies biological direction as a hard mechanism filter', () => {
    const activation = requiredCandidate(KYLILIS_RESPONSE_ID);
    const derepression = requiredCandidate(SHONG_RESPONSE_ID);

    expect(
      evaluateCatalogInverseEligibility(
        activation,
        targetFor(activation, { biologicalDirection: 'any' }),
      ).every((criterion) => criterion.passed),
    ).toBe(true);
    expectNotApplicable(
      evaluateCatalogInverseCandidate(
        activation,
        targetFor(activation, { biologicalDirection: 'derepression' }),
      ),
      'mechanism-mismatch',
    );
    expectNotApplicable(
      evaluateCatalogInverseCandidate(
        derepression,
        targetFor(derepression, { biologicalDirection: 'activation' }),
      ),
      'mechanism-mismatch',
    );
  });

  it('uses exact host and strain filters and fails closed for missing context', () => {
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const exact = targetFor(candidate, {
      contextFilter: {
        ...(candidate.context.hostSpecies === null
          ? {}
          : { hostSpecies: candidate.context.hostSpecies }),
        ...(candidate.context.hostStrain === null
          ? {}
          : { hostStrain: candidate.context.hostStrain }),
      },
    });
    const hostMismatch = targetFor(candidate, {
      contextFilter: { hostSpecies: 'escherichia coli' },
    });
    const strainMismatch = targetFor(candidate, {
      contextFilter: { hostStrain: 'top10' },
    });
    const missingContextCandidate: BfnCatalogInverseCandidate = {
      ...candidate,
      context: { hostSpecies: null, hostStrain: null },
    };

    expect(evaluateCatalogInverseEligibility(candidate, exact).every((entry) => entry.passed)).toBe(
      true,
    );
    expectNotApplicable(evaluateCatalogInverseCandidate(candidate, hostMismatch), 'host-mismatch');
    expectNotApplicable(
      evaluateCatalogInverseCandidate(candidate, strainMismatch),
      'strain-mismatch',
    );
    expectNotApplicable(
      evaluateCatalogInverseCandidate(
        missingContextCandidate,
        targetFor(candidate, { contextFilter: { hostSpecies: 'Escherichia coli' } }),
      ),
      'host-unrecorded',
    );
    const missingStrain = evaluateCatalogInverseCandidate(
      missingContextCandidate,
      targetFor(candidate, { contextFilter: { hostStrain: 'TOP10' } }),
    );
    expectNotApplicable(missingStrain, 'strain-unrecorded');
    expectNotApplicable(missingStrain, 'trust-unavailable');
  });

  it.each([
    { hostSpecies: 'Fabricated host', hostStrain: 'TOP10' },
    { hostSpecies: 'Escherichia coli', hostStrain: 'Fabricated strain' },
    { hostSpecies: null, hostStrain: null },
  ])('rejects altered candidate context as untrusted before evaluation: %#', (context) => {
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const altered: BfnCatalogInverseCandidate = { ...candidate, context };
    const evaluateResponse = vi.fn(evaluateReceiverResponse);

    const result = evaluateCatalogInverseCandidate(altered, targetFor(candidate), {
      evaluateResponse,
    });

    expectNotApplicable(result, 'trust-unavailable');
    expect(evaluateResponse).not.toHaveBeenCalled();
  });
});

describe('catalog inverse design trusted numerical evaluation', () => {
  it('classifies a real Kylilis response as matched from authoritative evaluator values', () => {
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const lowConcentrationM = candidate.model.ec50M / 10;
    const highConcentrationM = Math.min(
      candidate.model.ec50M * 4,
      candidate.model.workingRangeM.maximum,
    );
    const lowResponse = evaluateReceiverResponse(candidate.binding, lowConcentrationM, 'M');
    const highResponse = evaluateReceiverResponse(candidate.binding, highConcentrationM, 'M');
    const target = targetFor(candidate, {
      lowConcentrationM,
      lowResponseMaximum: lowResponse,
      highConcentrationM,
      highResponseMinimum: highResponse,
      biologicalDirection: 'activation',
      ec50RangeM: {
        minimum: candidate.model.ec50M,
        maximum: candidate.model.ec50M,
      },
      hillCoefficientRange: {
        minimum: candidate.model.hillCoefficient,
        maximum: candidate.model.hillCoefficient,
      },
      contextFilter: {
        ...(candidate.context.hostSpecies === null
          ? {}
          : { hostSpecies: candidate.context.hostSpecies }),
        ...(candidate.context.hostStrain === null
          ? {}
          : { hostStrain: candidate.context.hostStrain }),
      },
    });

    const result = evaluateCatalogInverseCandidate(candidate, target);

    expect(result.status).toBe('matched');
    if (result.status === 'not-applicable') throw new Error('expected an evaluated result');
    expect(result.evaluation.lowResponse).toBe(lowResponse);
    expect(result.evaluation.highResponse).toBe(highResponse);
    expect(result.criteria).toHaveLength(4);
    expect(result.criteria.every((criterion) => criterion.passed)).toBe(true);
    expect(result.exclusionReasons).toEqual([]);
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('total');
    expect(result).not.toHaveProperty('burden');
    expect(result).not.toHaveProperty('noise');
    expect(result).not.toHaveProperty('geneticRisk');
  });

  it('generates 61 finite, bounded, strictly increasing log-spaced trusted points with exact endpoints', () => {
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const lowConcentrationM = Math.max(
      candidate.model.ec50M / 100,
      candidate.model.workingRangeM.minimum,
    );
    const highConcentrationM = Math.min(
      candidate.model.ec50M * 5,
      candidate.model.workingRangeM.maximum,
    );
    const result = evaluateCatalogInverseCandidate(
      candidate,
      targetFor(candidate, { lowConcentrationM, highConcentrationM }),
    );

    expect(result.status).not.toBe('not-applicable');
    if (result.status === 'not-applicable') throw new Error('expected an evaluated result');
    const curve = result.evaluation.curve;
    expect(curve).toHaveLength(61);
    expect(curve[0]?.concentrationM).toBe(lowConcentrationM);
    expect(curve.at(-1)?.concentrationM).toBe(highConcentrationM);
    for (const point of curve) {
      expect(Number.isFinite(point.concentrationM)).toBe(true);
      expect(Number.isFinite(point.response)).toBe(true);
      expect(point.response).toBeGreaterThanOrEqual(0);
      expect(point.response).toBeLessThanOrEqual(1);
      expect(point.response).toBe(
        evaluateReceiverResponse(candidate.binding, point.concentrationM, 'M'),
      );
    }
    for (let index = 1; index < curve.length; index += 1) {
      expect(curve[index]!.concentrationM).toBeGreaterThan(curve[index - 1]!.concentrationM);
    }
    const logSteps = curve
      .slice(1)
      .map(
        (point, index) =>
          Math.log10(point.concentrationM) - Math.log10(curve[index]!.concentrationM),
      );
    expect(Math.max(...logSteps) - Math.min(...logSteps)).toBeLessThan(1e-12);
  });

  it('classifies an eligible candidate with only a failed high response as near-match', () => {
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const highConcentrationM = candidate.model.ec50M;
    const actualHigh = evaluateReceiverResponse(candidate.binding, highConcentrationM, 'M');
    const target = targetFor(candidate, {
      lowResponseMaximum: 1,
      highConcentrationM,
      highResponseMinimum: Math.min(1, actualHigh + 0.2),
    });

    const result = evaluateCatalogInverseCandidate(candidate, target);

    expect(result.status).toBe('near-match');
    if (result.status !== 'near-match') throw new Error('expected a near-match');
    const failed = result.criteria.filter((criterion) => !criterion.passed);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      kind: 'high-response-minimum',
      actual: actualHigh,
      requiredMinimum: Math.min(1, actualHigh + 0.2),
    });
    expect(failed[0]?.deviation).toBeCloseTo(0.2, 12);
  });

  it.each([
    ['below', 10, 20, 1],
    ['above', 1 / 20, 1 / 10, 1],
  ] as const)(
    'uses log-space EC50 deviation when the candidate is %s the target range',
    (_position, minimumFactor, maximumFactor, expectedDeviation) => {
      const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
      const result = evaluateCatalogInverseCandidate(
        candidate,
        targetFor(candidate, {
          ec50RangeM: {
            minimum: candidate.model.ec50M * minimumFactor,
            maximum: candidate.model.ec50M * maximumFactor,
          },
        }),
      );

      expect(result.status).toBe('near-match');
      if (result.status === 'not-applicable') throw new Error('expected an evaluated result');
      const criterion = result.criteria.find((entry) => entry.kind === 'ec50-range');
      expect(criterion).toMatchObject({ passed: false });
      expect(criterion?.deviation).toBeCloseTo(expectedDeviation, 12);
    },
  );

  it('uses the specified relative Hill deviation on both sides of the target range', () => {
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const belowRange = {
      minimum: candidate.model.hillCoefficient + 1,
      maximum: candidate.model.hillCoefficient + 2,
    };
    const aboveRange = {
      minimum: candidate.model.hillCoefficient / 4,
      maximum: candidate.model.hillCoefficient / 2,
    };
    const below = evaluateCatalogInverseCandidate(
      candidate,
      targetFor(candidate, { hillCoefficientRange: belowRange }),
    );
    const above = evaluateCatalogInverseCandidate(
      candidate,
      targetFor(candidate, { hillCoefficientRange: aboveRange }),
    );

    if (below.status === 'not-applicable' || above.status === 'not-applicable') {
      throw new Error('expected evaluated results');
    }
    const belowCriterion = below.criteria.find((criterion) => criterion.kind === 'hill-range');
    const aboveCriterion = above.criteria.find((criterion) => criterion.kind === 'hill-range');
    expect(belowCriterion?.deviation).toBeCloseTo(1 / Math.max(belowRange.minimum, 1), 12);
    expect(aboveCriterion?.deviation).toBeCloseTo(
      (candidate.model.hillCoefficient - aboveRange.maximum) / Math.max(aboveRange.maximum, 1),
      12,
    );
  });

  it('preserves Shong derepression semantics while its trusted response increases with input', () => {
    const candidate = requiredCandidate(SHONG_RESPONSE_ID);
    const lowConcentrationM = 1e-9;
    const highConcentrationM = 1e-6;
    const result = evaluateCatalogInverseCandidate(
      candidate,
      targetFor(candidate, {
        lowConcentrationM,
        highConcentrationM,
        biologicalDirection: 'derepression',
      }),
    );

    expect(candidate.biologicalDirection).toBe('derepression');
    expect(result.status).toBe('matched');
    if (result.status === 'not-applicable') throw new Error('expected an evaluated result');
    expect(result.evaluation.lowResponse).toBe(
      evaluateReceiverResponse(candidate.binding, lowConcentrationM, 'M'),
    );
    expect(result.evaluation.highResponse).toBe(
      evaluateReceiverResponse(candidate.binding, highConcentrationM, 'M'),
    );
    expect(result.evaluation.highResponse).toBeGreaterThan(result.evaluation.lowResponse);
    for (let index = 1; index < result.evaluation.curve.length; index += 1) {
      expect(result.evaluation.curve[index]!.response).toBeGreaterThan(
        result.evaluation.curve[index - 1]!.response,
      );
    }
  });
});

describe('catalog inverse design search orchestration', () => {
  it('searches only candidates with the exact selected signal and snapshots the target', () => {
    const searchSpace = buildCatalogInverseSearchSpace();
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const target = targetFor(candidate, {
      lowConcentrationM: 1e-9,
      lowResponseMaximum: 1,
      highConcentrationM: 1e-6,
      highResponseMinimum: 0,
    });
    const expectedCount = searchSpace.candidates.filter(
      (entry) => entry.inputSignalId === L_3OC6_SIGNAL_ID,
    ).length;

    const result = runCatalogInverseDesign(searchSpace, target);
    target.responseWindow.lowResponseMaximum = 0;

    expect(result.searchedResponseCount).toBe(expectedCount);
    expect(result.matched).toHaveLength(expectedCount);
    expect(result.nearMatches).toEqual([]);
    expect(result.notApplicable).toEqual([]);
    expect(
      [...result.matched, ...result.nearMatches, ...result.notApplicable].every(
        (entry) => entry.inputSignalId === L_3OC6_SIGNAL_ID,
      ),
    ).toBe(true);
    expect(result.target.responseWindow.lowResponseMaximum).toBe(1);
    expect(result.target).not.toBe(target);
    expect(result.target.responseWindow).not.toBe(target.responseWindow);
    expect(result.release).toEqual(searchSpace.release);
  });

  it('rejects an invalid or unavailable target with a typed design error', () => {
    const searchSpace = buildCatalogInverseSearchSpace();
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const target = {
      ...targetFor(candidate),
      inputSignalId: 'ahl.3oc6.stereo-unspecified',
    };

    expect(() => runCatalogInverseDesign(searchSpace, target)).toThrowError(
      BfnCatalogInverseDesignError,
    );
    try {
      runCatalogInverseDesign(searchSpace, target);
      throw new Error('expected inverse design validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BfnCatalogInverseDesignError);
      if (!(error instanceof BfnCatalogInverseDesignError)) throw error;
      expect(error.code).toBe('invalid-target');
      expect(error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'signal-not-searchable', severity: 'error' }),
        ]),
      );
    }
  });

  it('isolates one trusted evaluator failure and continues all sibling responses', () => {
    const searchSpace = buildCatalogInverseSearchSpace();
    const failedResponseId = KYLILIS_RESPONSE_ID;
    const candidate = requiredCandidate(failedResponseId);
    const target = targetFor(candidate, {
      lowConcentrationM: 1e-9,
      lowResponseMaximum: 1,
      highConcentrationM: 1e-6,
      highResponseMinimum: 0,
    });
    const adapter: CatalogInverseEvaluationAdapter = {
      evaluateResponse(binding, concentrationM, unit) {
        if (binding.receiverResponseId === failedResponseId) {
          throw new Error('injected trusted evaluator failure');
        }
        return defaultCatalogInverseEvaluationAdapter.evaluateResponse(
          binding,
          concentrationM,
          unit,
        );
      },
    };

    const result = runCatalogInverseDesign(searchSpace, target, adapter);
    const failed = result.notApplicable.find((entry) => entry.responseId === failedResponseId);

    expect(failed).toBeDefined();
    if (failed === undefined) throw new Error('expected failed candidate result');
    expectNotApplicable(failed, 'evaluation-unavailable');
    expect(result.unavailableResponseIds).toContain(failedResponseId);
    expect(result.matched.length + result.nearMatches.length + result.notApplicable.length).toBe(
      result.searchedResponseCount,
    );
    expect(result.matched.length).toBeGreaterThan(0);
  });

  it('rejects a finite noncanonical adapter value instead of replacing scientific output', () => {
    const candidate = requiredCandidate(KYLILIS_RESPONSE_ID);
    const adapter: CatalogInverseEvaluationAdapter = {
      evaluateResponse(binding, concentrationM, unit) {
        return Math.min(
          1,
          defaultCatalogInverseEvaluationAdapter.evaluateResponse(binding, concentrationM, unit) +
            0.001,
        );
      },
    };

    const result = evaluateCatalogInverseCandidate(candidate, targetFor(candidate), adapter);

    expectNotApplicable(result, 'evaluation-unavailable');
    expect(result.evaluation).toBeNull();
  });

  it('carries isolated build failures without changing exact-signal search counts', () => {
    const failedResponseId = KYLILIS_RESPONSE_ID;
    const runtimeAdapter: CatalogInverseRuntimeAdapter = {
      ...defaultCatalogInverseRuntimeAdapter,
      buildRuntimeCandidate(responseId) {
        if (responseId === failedResponseId) throw new Error('injected build failure');
        return defaultCatalogInverseRuntimeAdapter.buildRuntimeCandidate(responseId);
      },
    };
    const searchSpace = buildCatalogInverseSearchSpace(runtimeAdapter);
    const remaining = searchSpace.candidates.find(
      (candidate) => candidate.inputSignalId === L_3OC6_SIGNAL_ID,
    );
    if (remaining === undefined) throw new Error('expected a remaining exact-signal candidate');

    const result = runCatalogInverseDesign(
      searchSpace,
      targetFor(remaining, {
        lowConcentrationM: 1e-9,
        lowResponseMaximum: 1,
        highConcentrationM: 1e-6,
        highResponseMinimum: 0,
      }),
    );

    expect(result.unavailableResponseIds).toContain(failedResponseId);
    expect(result.searchedResponseCount).toBe(
      searchSpace.candidates.filter((candidate) => candidate.inputSignalId === L_3OC6_SIGNAL_ID)
        .length,
    );
  });

  it('scopes release-wide admission diagnostics to the exact searched signal', () => {
    const failedResponseId = 'resp.kylilis2018.rhl.c4';
    const runtimeAdapter: CatalogInverseRuntimeAdapter = {
      ...defaultCatalogInverseRuntimeAdapter,
      buildRuntimeCandidate(responseId) {
        if (responseId === failedResponseId) throw new Error('injected C4 admission failure');
        return defaultCatalogInverseRuntimeAdapter.buildRuntimeCandidate(responseId);
      },
    };
    const searchSpace = buildCatalogInverseSearchSpace(runtimeAdapter);
    const threeOc6Candidate = searchSpace.candidates.find(
      (candidate) => candidate.inputSignalId === L_3OC6_SIGNAL_ID,
    );
    const c4Candidate = searchSpace.candidates.find(
      (candidate) => candidate.inputSignalId === C4_SIGNAL_ID,
    );
    if (threeOc6Candidate === undefined || c4Candidate === undefined) {
      throw new Error('expected remaining trusted candidates for both exact signals');
    }

    const threeOc6Result = runCatalogInverseDesign(
      searchSpace,
      targetFor(threeOc6Candidate),
    );
    const c4Result = runCatalogInverseDesign(searchSpace, targetFor(c4Candidate));

    expect(threeOc6Result.unavailableResponseIds).not.toContain(failedResponseId);
    expect(c4Result.unavailableResponseIds).toEqual([failedResponseId]);
  });
});
