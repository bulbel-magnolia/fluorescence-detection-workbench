import type { BfnValidationIssue } from './types';

const BFN_VALIDATION_SEVERITY_ORDER = ['error', 'warning', 'info'] as const;

export function prioritizeBfnValidationIssues(
  issues: readonly BfnValidationIssue[],
): BfnValidationIssue[] {
  return BFN_VALIDATION_SEVERITY_ORDER.flatMap((severity) =>
    issues.filter((issue) => issue.severity === severity),
  );
}
