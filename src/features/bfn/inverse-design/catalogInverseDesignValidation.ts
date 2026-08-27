import type {
  BfnCatalogInverseBiologicalDirection,
  BfnCatalogInverseContextFilter,
  BfnCatalogInversePositiveRange,
  BfnCatalogInverseTarget,
  BfnCatalogInverseValidationContext,
  BfnCatalogInverseValidationIssue,
  BfnCatalogInverseValidationIssueCode,
  BfnCatalogInverseValidationResult,
} from './catalogInverseDesignTypes';

const BIOLOGICAL_DIRECTIONS: readonly BfnCatalogInverseBiologicalDirection[] = [
  'any',
  'activation',
  'derepression',
];

type ParsedPositiveRange =
  | { valid: true; minimum: number; maximum: number }
  | { valid: false; minimum: null; maximum: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isResponseFraction(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isBiologicalDirection(value: unknown): value is BfnCatalogInverseBiologicalDirection {
  return (
    value === BIOLOGICAL_DIRECTIONS[0] ||
    value === BIOLOGICAL_DIRECTIONS[1] ||
    value === BIOLOGICAL_DIRECTIONS[2]
  );
}

function parsePositiveRange(value: unknown): ParsedPositiveRange {
  if (!isRecord(value)) return { valid: false, minimum: null, maximum: null };
  const minimum = value.minimum;
  const maximum = value.maximum;
  if (!isPositiveFiniteNumber(minimum) || !isPositiveFiniteNumber(maximum)) {
    return { valid: false, minimum: null, maximum: null };
  }
  if (minimum > maximum) return { valid: false, minimum: null, maximum: null };
  return { valid: true, minimum, maximum };
}

function issue(
  issues: BfnCatalogInverseValidationIssue[],
  code: BfnCatalogInverseValidationIssueCode,
  severity: BfnCatalogInverseValidationIssue['severity'],
): void {
  issues.push({ code, severity });
}

function hasValidationErrors(issues: readonly BfnCatalogInverseValidationIssue[]): boolean {
  return issues.some((candidate) => candidate.severity === 'error');
}

function isContextFilterMatch(
  targetSignalId: string,
  hostSpecies: string | null,
  hostStrain: string | null,
  context: BfnCatalogInverseValidationContext,
): boolean {
  return context.contextOptions.some(
    (option) =>
      option.signalId === targetSignalId &&
      (hostSpecies === null || option.hostSpecies === hostSpecies) &&
      (hostStrain === null || option.hostStrain === hostStrain),
  );
}

/**
 * Validates a catalog query without mutating or normalizing its input.
 * Signal, host, and strain identity checks intentionally use exact equality.
 */
export function validateCatalogInverseTarget(
  target: unknown,
  context: BfnCatalogInverseValidationContext,
): BfnCatalogInverseValidationResult {
  const issues: BfnCatalogInverseValidationIssue[] = [];
  if (!isRecord(target)) {
    issue(issues, 'target-invalid', 'error');
    return { valid: false, target: null, issues };
  }

  let inputSignalId: string | null = null;
  const inputSignalValue = target.inputSignalId;
  let signalSearchable = false;
  if (!isNonEmptyString(inputSignalValue)) {
    issue(issues, 'missing-signal', 'error');
  } else {
    inputSignalId = inputSignalValue;
    signalSearchable = context.searchableSignals.some(
      (option) => option.signalId === inputSignalValue,
    );
    if (!signalSearchable) issue(issues, 'signal-not-searchable', 'error');
  }

  const responseWindow = isRecord(target.responseWindow) ? target.responseWindow : null;
  const lowConcentration = isPositiveFiniteNumber(responseWindow?.lowConcentrationM)
    ? responseWindow.lowConcentrationM
    : null;
  const highConcentration = isPositiveFiniteNumber(responseWindow?.highConcentrationM)
    ? responseWindow.highConcentrationM
    : null;
  const lowResponse = isResponseFraction(responseWindow?.lowResponseMaximum)
    ? responseWindow.lowResponseMaximum
    : null;
  const highResponse = isResponseFraction(responseWindow?.highResponseMinimum)
    ? responseWindow.highResponseMinimum
    : null;

  if (lowConcentration === null) issue(issues, 'low-concentration-invalid', 'error');
  if (highConcentration === null) issue(issues, 'high-concentration-invalid', 'error');
  if (
    lowConcentration !== null &&
    highConcentration !== null &&
    highConcentration <= lowConcentration
  ) {
    issue(issues, 'concentration-order-invalid', 'error');
  }
  if (lowResponse === null) issue(issues, 'low-response-invalid', 'error');
  if (highResponse === null) issue(issues, 'high-response-invalid', 'error');
  if (lowResponse !== null && highResponse !== null && lowResponse >= highResponse) {
    issue(issues, 'weak-response-separation', 'warning');
  }

  const hasEc50Range = target.ec50RangeM !== undefined;
  let ec50Range: BfnCatalogInversePositiveRange | null = null;
  if (hasEc50Range) {
    const parsed = parsePositiveRange(target.ec50RangeM);
    if (!parsed.valid) {
      issue(issues, 'ec50-range-invalid', 'error');
    } else {
      ec50Range = { minimum: parsed.minimum, maximum: parsed.maximum };
    }
  }

  const hasHillRange = target.hillCoefficientRange !== undefined;
  let hillCoefficientRange: BfnCatalogInversePositiveRange | null = null;
  if (hasHillRange) {
    const parsed = parsePositiveRange(target.hillCoefficientRange);
    if (!parsed.valid) {
      issue(issues, 'hill-range-invalid', 'error');
    } else {
      hillCoefficientRange = { minimum: parsed.minimum, maximum: parsed.maximum };
    }
  }

  const biologicalDirection = isBiologicalDirection(target.biologicalDirection)
    ? target.biologicalDirection
    : null;
  if (biologicalDirection === null) issue(issues, 'direction-invalid', 'error');

  const hasContextFilter = target.contextFilter !== undefined;
  let contextFilter: BfnCatalogInverseContextFilter | null = null;
  if (hasContextFilter) {
    const contextFilterValue = target.contextFilter;
    if (!isRecord(contextFilterValue)) {
      issue(issues, 'host-strain-invalid-combination', 'error');
    } else {
      const hostSpeciesValue = contextFilterValue.hostSpecies;
      const hostStrainValue = contextFilterValue.hostStrain;
      const hasHostSpecies = hostSpeciesValue !== undefined;
      const hasHostStrain = hostStrainValue !== undefined;
      const hostSpecies = isNonEmptyString(hostSpeciesValue) ? hostSpeciesValue : null;
      const hostStrain = isNonEmptyString(hostStrainValue) ? hostStrainValue : null;
      const hostSpeciesValid = !hasHostSpecies || hostSpecies !== null;
      const hostStrainValid = !hasHostStrain || hostStrain !== null;

      if (!hostSpeciesValid || !hostStrainValid) {
        issue(issues, 'host-strain-invalid-combination', 'error');
      } else if (
        signalSearchable &&
        inputSignalId !== null &&
        (hostSpecies !== null || hostStrain !== null) &&
        !isContextFilterMatch(inputSignalId, hostSpecies, hostStrain, context)
      ) {
        issue(issues, 'host-strain-invalid-combination', 'error');
      }

      contextFilter = {
        ...(hostSpecies === null ? {} : { hostSpecies }),
        ...(hostStrain === null ? {} : { hostStrain }),
      };
    }
  }

  if (
    hasValidationErrors(issues) ||
    inputSignalId === null ||
    lowConcentration === null ||
    highConcentration === null ||
    lowResponse === null ||
    highResponse === null ||
    biologicalDirection === null
  ) {
    return { valid: false, target: null, issues };
  }

  const validatedTarget: BfnCatalogInverseTarget = {
    inputSignalId,
    responseWindow: {
      lowConcentrationM: lowConcentration,
      lowResponseMaximum: lowResponse,
      highConcentrationM: highConcentration,
      highResponseMinimum: highResponse,
    },
    biologicalDirection,
    ...(ec50Range === null ? {} : { ec50RangeM: ec50Range }),
    ...(hillCoefficientRange === null ? {} : { hillCoefficientRange }),
    ...(hasContextFilter && contextFilter !== null ? { contextFilter } : {}),
  };
  return { valid: true, target: validatedTarget, issues };
}
