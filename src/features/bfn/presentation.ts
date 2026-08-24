import type { TFunction } from 'i18next';
import type { BfnPort } from './types';

const entityKeys: Record<string, string> = {
  normalized_promoter_activity: 'bfn.entities.normalizedPromoterActivity',
  normalized_reporter_expression: 'bfn.entities.normalizedReporterExpression',
};

const quantityKeys: Record<string, string> = {
  concentration: 'bfn.quantities.concentration',
  activity: 'bfn.quantities.activity',
  expression_level: 'bfn.quantities.expressionLevel',
};

const designVariableKeys: Record<string, string> = {
  P_DEMO_STABLE: 'bfn.designVariables.promoterLow',
  P_DEMO_BALANCED: 'bfn.designVariables.promoterMedium',
  P_DEMO_FAST: 'bfn.designVariables.promoterHigh',
  RBS_DEMO_WEAK: 'bfn.designVariables.rbsWeak',
  RBS_DEMO_MEDIUM: 'bfn.designVariables.rbsMedium',
  RBS_DEMO_STRONG: 'bfn.designVariables.rbsStrong',
  LOW_COPY_DEMO: 'bfn.designVariables.copyLow',
  MEDIUM_COPY_DEMO: 'bfn.designVariables.copyMedium',
  NONE_DEMO: 'bfn.designVariables.degradationNone',
  TAG_DEMO_MEDIUM: 'bfn.designVariables.degradationMedium',
  TAG_DEMO_FAST: 'bfn.designVariables.degradationFast',
  LOW_DEMO: 'bfn.designVariables.levelLow',
  MEDIUM_DEMO: 'bfn.designVariables.levelMedium',
  HIGH_DEMO: 'bfn.designVariables.levelHigh',
};

export function bfnEntityLabel(entity: string, t: TFunction): string {
  const key = entityKeys[entity];
  return key ? t(key) : entity;
}

export function bfnQuantityLabel(quantityType: string, t: TFunction): string {
  const key = quantityKeys[quantityType];
  return key ? t(key) : quantityType;
}

export function bfnUnitLabel(unit: string, t: TFunction): string {
  return unit === 'dimensionless' ? t('bfn.units.relativeValue') : unit;
}

export function bfnPortLabel(port: BfnPort, t: TFunction): string {
  const entity = bfnEntityLabel(port.entity, t);
  const quantity = bfnQuantityLabel(port.quantityType, t);
  const subject = entityKeys[port.entity] ? entity : entity + ' ' + quantity;
  return subject + ' · ' + bfnUnitLabel(port.unit, t);
}

export function bfnDesignVariableLabel(value: string, t: TFunction): string {
  const key = designVariableKeys[value];
  return key ? t(key) : value;
}

export function bfnContextValueLabel(value: string, t: TFunction): string {
  if (value === 'DEMO-STRAIN') return t('bfn.context.demoStrain');
  if (value === 'DEMO-MEDIUM') return t('bfn.context.demoMedium');
  return value;
}
