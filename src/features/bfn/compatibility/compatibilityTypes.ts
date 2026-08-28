export type BfnCompatibilityState = 'compatible' | 'uncertain' | 'incompatible';

export type BfnPortCompatibilityCheckKind =
  'direction' | 'entity' | 'quantity_type' | 'unit_dimension';

export interface BfnPortCompatibilityCheck {
  readonly kind: BfnPortCompatibilityCheckKind;
  readonly state: BfnCompatibilityState;
  readonly sourceValue: string;
  readonly targetValue: string;
}

export interface BfnPortCompatibilityAssessment {
  readonly state: BfnCompatibilityState;
  readonly requiresUnitNormalization: boolean;
  readonly checks: readonly BfnPortCompatibilityCheck[];
}

export type BfnApplicabilityState = 'matched' | 'uncertain' | 'mismatched';

export type BfnContextComparisonBasis = 'canonical' | 'reported_text';

export interface BfnTextContextFact {
  readonly value: string | null;
  readonly comparisonBasis: BfnContextComparisonBasis;
}

export interface BfnTemperatureContextFact {
  readonly value: number | null;
  readonly comparisonBasis: 'canonical';
}

export interface BfnComparableContextFacts {
  readonly hostSpecies: BfnTextContextFact;
  readonly hostStrain: BfnTextContextFact;
  readonly medium: BfnTextContextFact;
  readonly temperatureCelsius: BfnTemperatureContextFact;
}

export type BfnContextApplicabilityField =
  'hostSpecies' | 'hostStrain' | 'medium' | 'temperatureCelsius';

export interface BfnContextApplicabilityCheck {
  readonly field: BfnContextApplicabilityField;
  readonly state: BfnApplicabilityState;
  readonly evidenceValue: string | number | null;
  readonly projectValue: string | number | null;
  readonly evidenceBasis: BfnContextComparisonBasis;
  readonly projectBasis: BfnContextComparisonBasis;
}

export interface BfnContextApplicabilityAssessment {
  readonly overall: BfnApplicabilityState;
  readonly checks: readonly BfnContextApplicabilityCheck[];
}
