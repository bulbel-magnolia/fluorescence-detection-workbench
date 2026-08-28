export type BfnCatalogInverseConcentrationUnit = 'pM' | 'nM' | 'µM' | 'mM' | 'M';

const CONCENTRATION_FACTORS_M: Readonly<Record<BfnCatalogInverseConcentrationUnit, number>> = {
  pM: 1e-12,
  nM: 1e-9,
  'µM': 1e-6,
  mM: 1e-3,
  M: 1,
};

export function toM(value: number, unit: BfnCatalogInverseConcentrationUnit): number {
  const converted = value * CONCENTRATION_FACTORS_M[unit];
  return Number.isFinite(converted) && converted !== 0
    ? Number(converted.toPrecision(15))
    : converted;
}

export function fromM(valueM: number, unit: BfnCatalogInverseConcentrationUnit): number {
  return valueM / CONCENTRATION_FACTORS_M[unit];
}

export function formatConcentrationValue(
  valueM: number,
  unit: BfnCatalogInverseConcentrationUnit,
): string {
  const converted = fromM(valueM, unit);
  if (!Number.isFinite(converted)) return '';
  return Number(converted.toPrecision(12)).toString();
}

export function formatConcentration(
  valueM: number,
  unit: BfnCatalogInverseConcentrationUnit,
  locale: string,
): string {
  void locale;
  return `${formatConcentrationValue(valueM, unit)} ${unit}`;
}

export function chooseReadableConcentrationUnit(
  valuesM: readonly number[],
): BfnCatalogInverseConcentrationUnit {
  const finitePositive = valuesM
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (finitePositive.length === 0) return 'nM';

  const middle = Math.floor(finitePositive.length / 2);
  const median =
    finitePositive.length % 2 === 0
      ? (finitePositive[middle - 1]! + finitePositive[middle]!) / 2
      : finitePositive[middle]!;
  if (median >= 1) return 'M';
  if (median >= 1e-3) return 'mM';
  if (median >= 1e-6) return 'µM';
  if (median >= 1e-9) return 'nM';
  return 'pM';
}
