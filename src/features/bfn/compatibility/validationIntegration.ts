import type { BfnPort, BfnValidationIssue } from '../types';
import type { BfnIntegratedContextApplicabilityAssessment } from './contextIntegration';
import { assessBfnPortCompatibility } from './portCompatibility';

export function createBfnPortCompatibilityIssues(
  sourcePort: BfnPort,
  targetPort: BfnPort,
  edgeId: string,
): BfnValidationIssue[] {
  const assessment = assessBfnPortCompatibility(sourcePort, targetPort);
  const issues: BfnValidationIssue[] = [];
  if (sourcePort.direction !== 'output') {
    issues.push({ code: 'source_port_direction', severity: 'error', subjectId: sourcePort.id });
  }
  if (targetPort.direction !== 'input') {
    issues.push({ code: 'target_port_direction', severity: 'error', subjectId: targetPort.id });
  }
  for (const check of assessment.checks) {
    if (check.state !== 'incompatible' || check.kind === 'direction') continue;
    const code =
      check.kind === 'entity'
        ? 'entity_mismatch'
        : check.kind === 'quantity_type'
          ? 'quantity_mismatch'
          : 'unit_dimension_mismatch';
    issues.push({
      code,
      severity: 'error',
      subjectId: edgeId,
      details: { source: check.sourceValue, target: check.targetValue },
    });
  }
  return issues;
}

export function createBfnContextApplicabilityIssues(
  assessment: BfnIntegratedContextApplicabilityAssessment,
  edgeId: string,
): BfnValidationIssue[] {
  if (assessment.overall === 'not_applicable' || assessment.overall === 'matched') return [];
  if (assessment.overall === 'mismatched') {
    return [{ code: 'context_applicability_mismatch', severity: 'warning', subjectId: edgeId }];
  }
  return [
    {
      code:
        assessment.overall === 'unavailable'
          ? 'context_applicability_unavailable'
          : 'context_applicability_uncertain',
      severity: 'info',
      subjectId: edgeId,
    },
  ];
}
