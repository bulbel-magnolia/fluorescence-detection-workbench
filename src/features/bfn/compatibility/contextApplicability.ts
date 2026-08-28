import type {
  BfnApplicabilityState,
  BfnComparableContextFacts,
  BfnContextApplicabilityAssessment,
  BfnContextApplicabilityCheck,
  BfnContextApplicabilityField,
  BfnContextComparisonBasis,
  BfnTemperatureContextFact,
  BfnTextContextFact,
} from './compatibilityTypes';

interface ComparedFact {
  readonly state: BfnApplicabilityState;
  readonly evidenceValue: string | number | null;
  readonly projectValue: string | number | null;
}

function textValue(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizedReportedText(value: string): string {
  return value.replace(/\s+/g, ' ').toLowerCase();
}

function compareTextFacts(evidence: BfnTextContextFact, project: BfnTextContextFact): ComparedFact {
  const evidenceValue = textValue(evidence.value);
  const projectValue = textValue(project.value);
  if (evidenceValue === null || projectValue === null) {
    return { state: 'uncertain', evidenceValue, projectValue };
  }

  if (evidence.comparisonBasis === 'canonical' && project.comparisonBasis === 'canonical') {
    return {
      state: evidenceValue === projectValue ? 'matched' : 'mismatched',
      evidenceValue,
      projectValue,
    };
  }

  return {
    state:
      normalizedReportedText(evidenceValue) === normalizedReportedText(projectValue)
        ? 'matched'
        : 'uncertain',
    evidenceValue,
    projectValue,
  };
}

function finiteTemperature(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function compareTemperatureFacts(
  evidence: BfnTemperatureContextFact,
  project: BfnTemperatureContextFact,
): ComparedFact {
  const evidenceValue = finiteTemperature(evidence.value);
  const projectValue = finiteTemperature(project.value);
  if (evidenceValue === null || projectValue === null) {
    return { state: 'uncertain', evidenceValue, projectValue };
  }
  return {
    state: evidenceValue === projectValue ? 'matched' : 'mismatched',
    evidenceValue,
    projectValue,
  };
}

function applicabilityCheck(
  field: BfnContextApplicabilityField,
  result: ComparedFact,
  evidenceBasis: BfnContextComparisonBasis,
  projectBasis: BfnContextComparisonBasis,
): BfnContextApplicabilityCheck {
  return Object.freeze({
    field,
    state: result.state,
    evidenceValue: result.evidenceValue,
    projectValue: result.projectValue,
    evidenceBasis,
    projectBasis,
  });
}

function overallState(checks: readonly BfnContextApplicabilityCheck[]): BfnApplicabilityState {
  if (checks.some((entry) => entry.state === 'mismatched')) return 'mismatched';
  if (checks.some((entry) => entry.state === 'uncertain')) return 'uncertain';
  return 'matched';
}

export function assessBfnContextApplicability(
  evidenceContext: BfnComparableContextFacts,
  projectContext: BfnComparableContextFacts,
): BfnContextApplicabilityAssessment {
  const checks = Object.freeze([
    applicabilityCheck(
      'hostSpecies',
      compareTextFacts(evidenceContext.hostSpecies, projectContext.hostSpecies),
      evidenceContext.hostSpecies.comparisonBasis,
      projectContext.hostSpecies.comparisonBasis,
    ),
    applicabilityCheck(
      'hostStrain',
      compareTextFacts(evidenceContext.hostStrain, projectContext.hostStrain),
      evidenceContext.hostStrain.comparisonBasis,
      projectContext.hostStrain.comparisonBasis,
    ),
    applicabilityCheck(
      'medium',
      compareTextFacts(evidenceContext.medium, projectContext.medium),
      evidenceContext.medium.comparisonBasis,
      projectContext.medium.comparisonBasis,
    ),
    applicabilityCheck(
      'temperatureCelsius',
      compareTemperatureFacts(
        evidenceContext.temperatureCelsius,
        projectContext.temperatureCelsius,
      ),
      evidenceContext.temperatureCelsius.comparisonBasis,
      projectContext.temperatureCelsius.comparisonBasis,
    ),
  ]);

  return Object.freeze({ overall: overallState(checks), checks });
}
