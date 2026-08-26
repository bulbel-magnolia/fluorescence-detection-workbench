import type { BfnUnit } from './types';

type UnitDimension =
  | 'concentration'
  | 'concentration_rate'
  | 'expression_per_cell'
  | 'normalized_activity'
  | 'cell_density';

interface UnitDefinition {
  dimension: UnitDimension;
  toCanonical: number;
}

const unitDefinitions: Record<BfnUnit, UnitDefinition> = {
  M: { dimension: 'concentration', toCanonical: 1 },
  mM: { dimension: 'concentration', toCanonical: 1e-3 },
  uM: { dimension: 'concentration', toCanonical: 1e-6 },
  nM: { dimension: 'concentration', toCanonical: 1e-9 },
  pM: { dimension: 'concentration', toCanonical: 1e-12 },
  'nM/h': { dimension: 'concentration_rate', toCanonical: 1e-9 },
  'uM/h': { dimension: 'concentration_rate', toCanonical: 1e-6 },
  'molecules/cell': { dimension: 'expression_per_cell', toCanonical: 1 },
  RPU: { dimension: 'normalized_activity', toCanonical: 1 },
  dimensionless: { dimension: 'normalized_activity', toCanonical: 1 },
  OD600: { dimension: 'cell_density', toCanonical: 1 },
};

export function isBfnUnit(value: unknown): value is BfnUnit {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(unitDefinitions, value);
}

export function unitDimension(unit: BfnUnit): UnitDimension {
  return unitDefinitions[unit].dimension;
}

export function areUnitsCompatible(source: BfnUnit, target: BfnUnit): boolean {
  return unitDimension(source) === unitDimension(target);
}

export function convertUnit(value: number, source: BfnUnit, target: BfnUnit): number {
  const sourceDefinition = unitDefinitions[source];
  const targetDefinition = unitDefinitions[target];
  if (sourceDefinition.dimension !== targetDefinition.dimension) {
    throw new Error(`BFN_UNIT_DIMENSION_MISMATCH:${source}:${target}`);
  }
  return (value * sourceDefinition.toCanonical) / targetDefinition.toCanonical;
}
