import { describe, expect, it } from 'vitest';
import type {
  BfnComparableContextFacts,
  BfnContextApplicabilityField,
  BfnTextContextFact,
} from './compatibilityTypes';
import { assessBfnContextApplicability } from './contextApplicability';

function canonical(value: string | null): BfnTextContextFact {
  return { value, comparisonBasis: 'canonical' };
}

function reported(value: string | null): BfnTextContextFact {
  return { value, comparisonBasis: 'reported_text' };
}

function context(overrides: Partial<BfnComparableContextFacts> = {}): BfnComparableContextFacts {
  return {
    hostSpecies: canonical('Escherichia coli'),
    hostStrain: canonical('TOP10'),
    medium: canonical('LB'),
    temperatureCelsius: { value: 37, comparisonBasis: 'canonical' },
    ...overrides,
  };
}

function stateFor(
  assessment: ReturnType<typeof assessBfnContextApplicability>,
  field: BfnContextApplicabilityField,
) {
  return assessment.checks.find((check) => check.field === field)?.state;
}

describe('BFN scientific context applicability', () => {
  it('matches known identical canonical facts', () => {
    const assessment = assessBfnContextApplicability(context(), context());

    expect(assessment.overall).toBe('matched');
    expect(assessment.checks.map((check) => check.state)).toEqual([
      'matched',
      'matched',
      'matched',
      'matched',
    ]);
  });

  it('treats a missing fact on either side as uncertain', () => {
    const missingEvidence = assessBfnContextApplicability(
      context({ medium: canonical(null) }),
      context(),
    );
    const missingProject = assessBfnContextApplicability(
      context(),
      context({ medium: canonical('   ') }),
    );

    expect(stateFor(missingEvidence, 'medium')).toBe('uncertain');
    expect(missingEvidence.overall).toBe('uncertain');
    expect(stateFor(missingProject, 'medium')).toBe('uncertain');
    expect(missingProject.overall).toBe('uncertain');
  });

  it('marks a known canonical host conflict as mismatched', () => {
    const assessment = assessBfnContextApplicability(
      context({ hostSpecies: canonical('Escherichia coli') }),
      context({ hostSpecies: canonical('Saccharomyces cerevisiae') }),
    );

    expect(stateFor(assessment, 'hostSpecies')).toBe('mismatched');
    expect(assessment.overall).toBe('mismatched');
  });

  it('keeps different reported text uncertain instead of declaring a conflict', () => {
    const assessment = assessBfnContextApplicability(
      context({ hostSpecies: reported('E. coli') }),
      context({ hostSpecies: reported('Escherichia coli') }),
    );

    expect(stateFor(assessment, 'hostSpecies')).toBe('uncertain');
    expect(assessment.overall).toBe('uncertain');
  });

  it('matches reported text after trim, case, and whitespace normalization', () => {
    const assessment = assessBfnContextApplicability(
      context({ hostStrain: reported('  TOP10  ') }),
      context({ hostStrain: reported('top10') }),
    );

    expect(stateFor(assessment, 'hostStrain')).toBe('matched');
    expect(assessment.overall).toBe('matched');
  });

  it('returns uncertain for matched facts plus missing medium', () => {
    const assessment = assessBfnContextApplicability(
      context({ medium: reported(null) }),
      context({ medium: reported('LB') }),
    );

    expect(stateFor(assessment, 'hostSpecies')).toBe('matched');
    expect(stateFor(assessment, 'hostStrain')).toBe('matched');
    expect(stateFor(assessment, 'medium')).toBe('uncertain');
    expect(stateFor(assessment, 'temperatureCelsius')).toBe('matched');
    expect(assessment.overall).toBe('uncertain');
  });

  it('lets one reliable mismatch dominate other uncertain fields', () => {
    const assessment = assessBfnContextApplicability(
      context({ hostSpecies: canonical('Escherichia coli'), medium: reported(null) }),
      context({ hostSpecies: canonical('Saccharomyces cerevisiae'), medium: reported('YPD') }),
    );

    expect(stateFor(assessment, 'hostSpecies')).toBe('mismatched');
    expect(stateFor(assessment, 'medium')).toBe('uncertain');
    expect(assessment.overall).toBe('mismatched');
  });

  it('keeps missing strain and medium computationally descriptive without an error', () => {
    const assessment = assessBfnContextApplicability(
      context({ hostStrain: canonical(null), medium: reported(null) }),
      context(),
    );

    expect(assessment.overall).toBe('uncertain');
    expect(assessment.checks.some((check) => check.state === 'mismatched')).toBe(false);
    expect(assessment).not.toHaveProperty('runtimeEligible');
  });

  it('compares explicit numeric Celsius values canonically', () => {
    const matched = assessBfnContextApplicability(context(), context());
    const mismatched = assessBfnContextApplicability(
      context({ temperatureCelsius: { value: 30, comparisonBasis: 'canonical' } }),
      context({ temperatureCelsius: { value: 37, comparisonBasis: 'canonical' } }),
    );

    expect(stateFor(matched, 'temperatureCelsius')).toBe('matched');
    expect(stateFor(mismatched, 'temperatureCelsius')).toBe('mismatched');
    expect(mismatched.overall).toBe('mismatched');
  });

  it('is deterministic, immutable, score-free, and does not mutate facts', () => {
    const evidence = context({ medium: reported(null) });
    const project = context({ medium: reported('LB') });
    const evidenceBefore = structuredClone(evidence);
    const projectBefore = structuredClone(project);

    const first = assessBfnContextApplicability(evidence, project);
    const second = assessBfnContextApplicability(evidence, project);

    expect(second).toEqual(first);
    expect(evidence).toEqual(evidenceBefore);
    expect(project).toEqual(projectBefore);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.checks)).toBe(true);
    expect(first.checks.every(Object.isFrozen)).toBe(true);
    expect(first).not.toHaveProperty('score');
  });
});
