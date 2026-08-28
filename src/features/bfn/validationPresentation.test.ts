import { describe, expect, it } from 'vitest';
import type { BfnValidationIssue } from './types';
import { prioritizeBfnValidationIssues } from './validationPresentation';

function issue(subjectId: string, severity: BfnValidationIssue['severity']): BfnValidationIssue {
  return {
    code:
      severity === 'error'
        ? 'temporal_execution_unsupported'
        : severity === 'warning'
          ? 'context_applicability_mismatch'
          : 'context_applicability_uncertain',
    severity,
    subjectId,
  };
}

describe('BFN validation issue presentation', () => {
  it('orders errors before warnings before info while preserving order within each severity', () => {
    const issues = [
      issue('info-1', 'info'),
      issue('warning-1', 'warning'),
      issue('error-1', 'error'),
      issue('warning-2', 'warning'),
      issue('error-2', 'error'),
      issue('info-2', 'info'),
    ];

    expect(prioritizeBfnValidationIssues(issues).map((candidate) => candidate.subjectId)).toEqual([
      'error-1',
      'error-2',
      'warning-1',
      'warning-2',
      'info-1',
      'info-2',
    ]);
  });

  it('returns a new array without modifying the input', () => {
    const issues = [issue('info', 'info'), issue('error', 'error')];
    const before = [...issues];

    const prioritized = prioritizeBfnValidationIssues(issues);

    expect(prioritized).not.toBe(issues);
    expect(issues).toEqual(before);
  });

  it('keeps a blocking temporal error inside the five visible issues after five context infos', () => {
    const issues = [
      ...Array.from({ length: 5 }, (_, index) => issue(`context-${index + 1}`, 'info')),
      issue('unsupported-module', 'error'),
    ];

    const visible = prioritizeBfnValidationIssues(issues).slice(0, 5);

    expect(visible[0]).toMatchObject({
      code: 'temporal_execution_unsupported',
      severity: 'error',
      subjectId: 'unsupported-module',
    });
    expect(visible).toHaveLength(5);
  });
});
