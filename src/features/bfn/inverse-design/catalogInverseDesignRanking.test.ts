import { describe, expect, it } from 'vitest';
import type {
  BfnCatalogInverseCandidateResult,
  BfnCatalogInverseMatchedResult,
  BfnCatalogInverseNearMatchResult,
  BfnCatalogInverseNotApplicableResult,
} from './catalogInverseDesignTypes';
import {
  sortCatalogInverseMatched,
  sortCatalogInverseNearMatches,
  sortCatalogInverseNotApplicable,
} from './catalogInverseDesignRanking';

const ELIGIBLE = [
  { kind: 'trust', passed: true },
  { kind: 'signal', passed: true },
  { kind: 'working-range', passed: true },
  { kind: 'biological-direction', passed: true },
  { kind: 'host', passed: true },
  { kind: 'strain', passed: true },
] as const;

function baseResult(responseId: string, componentId: string) {
  return {
    responseId,
    componentId,
    inputSignalId: 'ahl.3oc6.l',
    parameterContextId: 'ctx.test',
    sourceIds: ['src.test'],
    biologicalDirection: 'activation' as const,
    context: {
      hostSpecies: 'Escherichia coli',
      hostStrain: 'TOP10',
    },
    model: {
      ec50M: 1e-7,
      hillCoefficient: 1,
      workingRangeM: { minimum: 1e-10, maximum: 1e-4 },
    },
    eligibility: ELIGIBLE,
  };
}

function matched(responseId: string, componentId: string): BfnCatalogInverseMatchedResult {
  return {
    ...baseResult(responseId, componentId),
    status: 'matched',
    criteria: [
      {
        kind: 'low-response-maximum',
        actual: 0.1,
        requiredMaximum: 0.2,
        passed: true,
        deviation: 0,
      },
    ],
    evaluation: {
      lowResponse: 0.1,
      highResponse: 0.9,
      curve: [
        { concentrationM: 1e-9, response: 0.1 },
        { concentrationM: 1e-6, response: 0.9 },
      ],
    },
    exclusionReasons: [],
  };
}

function near(responseId: string, deviations: readonly number[]): BfnCatalogInverseNearMatchResult {
  const criteria: BfnCatalogInverseNearMatchResult['criteria'] = [
    {
      kind: 'low-response-maximum',
      actual: 0.2 + deviations[0]!,
      requiredMaximum: 0.2,
      passed: false,
      deviation: deviations[0]!,
    },
    ...(deviations.length < 2
      ? []
      : [
          {
            kind: 'high-response-minimum' as const,
            actual: 0.8 - deviations[1]!,
            requiredMinimum: 0.8,
            passed: false,
            deviation: deviations[1]!,
          },
        ]),
  ];
  return {
    ...baseResult(responseId, 'component.same'),
    status: 'near-match',
    criteria,
    evaluation: {
      lowResponse: 0.2 + deviations[0]!,
      highResponse: 0.8 - (deviations[1] ?? 0),
      curve: [
        { concentrationM: 1e-9, response: 0.2 + deviations[0]! },
        { concentrationM: 1e-6, response: 0.8 - (deviations[1] ?? 0) },
      ],
    },
    exclusionReasons: [],
  };
}

function notApplicable(
  responseId: string,
  componentId: string,
): BfnCatalogInverseNotApplicableResult {
  return {
    ...baseResult(responseId, componentId),
    status: 'not-applicable',
    eligibility: [
      { kind: 'trust', passed: true },
      { kind: 'signal', passed: true },
      {
        kind: 'working-range',
        passed: false,
        reason: 'target-outside-working-range',
      },
      { kind: 'biological-direction', passed: true },
      { kind: 'host', passed: true },
      { kind: 'strain', passed: true },
    ],
    criteria: [],
    evaluation: null,
    exclusionReasons: ['target-outside-working-range'],
  };
}

describe('catalog inverse design deterministic ranking', () => {
  it('orders matched candidates only by stable component and response IDs', () => {
    const input = [
      matched('response.z', 'component.b'),
      matched('response.b', 'component.a'),
      matched('response.a', 'component.a'),
    ];

    const sorted = sortCatalogInverseMatched(input);

    expect(sorted.map((candidate) => candidate.responseId)).toEqual([
      'response.a',
      'response.b',
      'response.z',
    ]);
    expect(input.map((candidate) => candidate.responseId)).toEqual([
      'response.z',
      'response.b',
      'response.a',
    ]);
    expect(sorted.every((candidate) => !('score' in candidate))).toBe(true);
  });

  it('orders near matches by failed count, maximum deviation, sum deviation, then response ID', () => {
    const oneSmall = near('response.a', [0.1]);
    const twoTiny = near('response.b', [0.01, 0.01]);
    const oneLarge = near('response.c', [0.3]);

    const sorted = sortCatalogInverseNearMatches([twoTiny, oneLarge, oneSmall]);

    expect(sorted.map((candidate) => candidate.responseId)).toEqual([
      'response.a',
      'response.c',
      'response.b',
    ]);
    expect(sorted.every((candidate) => !('score' in candidate))).toBe(true);
    expect(sorted.every((candidate) => !('total' in candidate))).toBe(true);
  });

  it('uses response ID as the final near-match tie breaker', () => {
    const sorted = sortCatalogInverseNearMatches([
      near('response.z', [0.1]),
      near('response.a', [0.1]),
    ]);

    expect(sorted.map((candidate) => candidate.responseId)).toEqual(['response.a', 'response.z']);
  });

  it('orders not-applicable results by the same non-value stable scientific key', () => {
    const sorted = sortCatalogInverseNotApplicable([
      notApplicable('response.z', 'component.b'),
      notApplicable('response.b', 'component.a'),
      notApplicable('response.a', 'component.a'),
    ]);

    expect(sorted.map((candidate) => candidate.responseId)).toEqual([
      'response.a',
      'response.b',
      'response.z',
    ]);
  });

  it('is deterministic across repeated calls and never adds an aggregate score', () => {
    const candidates = [
      near('response.c', [0.3]),
      near('response.b', [0.01, 0.01]),
      near('response.a', [0.1]),
    ];
    const expected = ['response.a', 'response.c', 'response.b'];

    for (let iteration = 0; iteration < 25; iteration += 1) {
      const sorted: readonly BfnCatalogInverseCandidateResult[] =
        sortCatalogInverseNearMatches(candidates);
      expect(sorted.map((candidate) => candidate.responseId)).toEqual(expected);
      expect(
        sorted.every(
          (candidate) =>
            !('score' in candidate) &&
            !('total' in candidate) &&
            !('burden' in candidate) &&
            !('noise' in candidate),
        ),
      ).toBe(true);
    }
  });
});
