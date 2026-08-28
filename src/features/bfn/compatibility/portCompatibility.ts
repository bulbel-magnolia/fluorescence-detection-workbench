import { areUnitsCompatible } from '../unitSystem';
import type { BfnPort } from '../types';
import type {
  BfnCompatibilityState,
  BfnPortCompatibilityAssessment,
  BfnPortCompatibilityCheck,
  BfnPortCompatibilityCheckKind,
} from './compatibilityTypes';

function check(
  kind: BfnPortCompatibilityCheckKind,
  compatible: boolean,
  sourceValue: string,
  targetValue: string,
): BfnPortCompatibilityCheck {
  return Object.freeze({
    kind,
    state: compatible ? 'compatible' : 'incompatible',
    sourceValue,
    targetValue,
  });
}

function overallState(checks: readonly BfnPortCompatibilityCheck[]): BfnCompatibilityState {
  if (checks.some((entry) => entry.state === 'incompatible')) return 'incompatible';
  if (checks.some((entry) => entry.state === 'uncertain')) return 'uncertain';
  return 'compatible';
}

export function assessBfnPortCompatibility(
  sourcePort: BfnPort,
  targetPort: BfnPort,
): BfnPortCompatibilityAssessment {
  const unitsCompatible = areUnitsCompatible(sourcePort.unit, targetPort.unit);
  const entitiesComparable =
    sourcePort.entity.trim().length > 0 &&
    targetPort.entity.trim().length > 0 &&
    sourcePort.entity === targetPort.entity;
  const checks = Object.freeze([
    check(
      'direction',
      sourcePort.direction === 'output' && targetPort.direction === 'input',
      sourcePort.direction,
      targetPort.direction,
    ),
    check('entity', entitiesComparable, sourcePort.entity, targetPort.entity),
    check(
      'quantity_type',
      sourcePort.quantityType === targetPort.quantityType,
      sourcePort.quantityType,
      targetPort.quantityType,
    ),
    check('unit_dimension', unitsCompatible, sourcePort.unit, targetPort.unit),
  ]);

  return Object.freeze({
    state: overallState(checks),
    requiresUnitNormalization: unitsCompatible && sourcePort.unit !== targetPort.unit,
    checks,
  });
}
