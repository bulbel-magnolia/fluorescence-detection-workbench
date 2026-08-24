import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import { defaultBfnReverseTarget, runBfnReverseDesign } from './reverseDesign';

describe('BFN-IR dual-space inverse design', () => {
  it('returns an explained candidate set instead of an opaque unique optimum', () => {
    const candidates = runBfnReverseDesign(
      createDemoBfnProject(),
      structuredClone(defaultBfnReverseTarget),
    );

    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.scores.total)).toEqual(
      [...candidates.map((candidate) => candidate.scores.total)].sort(
        (left, right) => left - right,
      ),
    );
    expect(
      candidates.every((candidate) => candidate.evidenceGrade === 'proposed_unbuilt_design'),
    ).toBe(true);
    expect(candidates.every((candidate) => candidate.predictedResponse.length === 41)).toBe(true);
    expect(candidates[0]?.designVariables).toHaveProperty('promoter');
    expect(candidates[0]?.recommendedValidationKey).toBe('bfn.reverse.recommendedValidation');
  });

  it('keeps functional and biological parameter spaces separate in every candidate', () => {
    const [candidate] = runBfnReverseDesign(
      createDemoBfnProject(),
      structuredClone(defaultBfnReverseTarget),
    );

    if (!candidate) throw new Error('Expected at least one reverse-design candidate');
    expect(
      Object.values(candidate.predictedParameters).every((value) => Number.isFinite(value)),
    ).toBe(true);
    const { promoter, rbs, copyNumber, degradationTag, receptorLevel, strainRatio } =
      candidate.designVariables;
    expect(
      [promoter, rbs, copyNumber, degradationTag, receptorLevel].every((value) => value.length > 0),
    ).toBe(true);
    expect(strainRatio).toBeNull();
    expect(Object.keys(candidate.predictedParameters)).toEqual(
      expect.arrayContaining(['ymin', 'ymax', 'k', 'n', 'tauHours']),
    );
    expect(Object.keys(candidate.designVariables)).toEqual(
      expect.arrayContaining(['promoter', 'rbs', 'copyNumber', 'degradationTag']),
    );
  });
});
