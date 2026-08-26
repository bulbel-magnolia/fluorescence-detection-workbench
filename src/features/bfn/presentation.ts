import type { TFunction } from 'i18next';
import type {
  BfnContext,
  BfnEvidenceGrade,
  BfnFunctionalModule,
  BfnInputSource,
  BfnModelVariant,
  BfnOutputMonitor,
  BfnParameterEstimate,
  BfnPort,
} from './types';

export type BfnEvidenceTone = 'evidence' | 'validated' | 'warning';
export type BfnLabelTranslate = (key: string) => string;

export type BfnDisplayNode = BfnFunctionalModule | BfnInputSource | BfnOutputMonitor;

export function bfnNodeDisplayName(
  node: BfnDisplayNode,
  language: string,
  t: BfnLabelTranslate,
): string {
  const localized = node.displayName;
  if (localized) {
    const value = language.toLocaleLowerCase().startsWith('zh') ? localized.zh : localized.en;
    if (value.trim().length > 0) return value;
  }
  return t(node.labelKey);
}

export function bfnEvidenceTone(grade: BfnEvidenceGrade): BfnEvidenceTone {
  if (grade === 'externally_validated') return 'validated';
  if (grade === 'independent_assumption' || grade === 'proposed_unbuilt_design') {
    return 'warning';
  }
  return 'evidence';
}

export interface BfnParameterPresentation {
  id: string;
  label: string;
  symbol?: string;
  showSymbolInSummary?: boolean;
  description: string;
  estimate: BfnParameterEstimate;
}

const entityKeys: Record<string, string> = {
  normalized_promoter_activity: 'bfn.entities.normalizedPromoterActivity',
  normalized_reporter_expression: 'bfn.entities.normalizedReporterExpression',
  normalized_signal_a: 'bfn.entities.normalizedSignalA',
  normalized_signal_b: 'bfn.entities.normalizedSignalB',
  normalized_gate_output: 'bfn.entities.normalizedGateOutput',
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

export function bfnEntityLabel(entity: string, t: BfnLabelTranslate): string {
  const key = entityKeys[entity];
  return key ? t(key) : entity;
}

export function bfnQuantityLabel(quantityType: string, t: BfnLabelTranslate): string {
  const key = quantityKeys[quantityType];
  return key ? t(key) : quantityType;
}

export function bfnUnitLabel(unit: string, t: BfnLabelTranslate): string {
  return unit === 'dimensionless' ? t('bfn.units.relativeValue') : unit;
}

export function bfnPortPrimaryLabel(
  port: BfnPort,
  t: BfnLabelTranslate,
  language?: string,
): string {
  if (port.displayName) {
    const localized = language?.toLocaleLowerCase().startsWith('zh')
      ? port.displayName.zh
      : port.displayName.en;
    if (localized.trim().length > 0) return localized;
  }
  const entity = bfnEntityLabel(port.entity, t);
  return entityKeys[port.entity] ? entity : entity + ' ' + bfnQuantityLabel(port.quantityType, t);
}

export function bfnPortMetaLabel(port: BfnPort, t: BfnLabelTranslate): string {
  if (port.unit === 'dimensionless') {
    return port.quantityType === 'expression_level'
      ? t('bfn.units.relativeExpressionLevel')
      : t('bfn.units.relativeValue');
  }
  return bfnQuantityLabel(port.quantityType, t) + ' · ' + bfnUnitLabel(port.unit, t);
}

export function bfnModuleFlowLabel(
  module: BfnFunctionalModule,
  t: BfnLabelTranslate,
  language?: string,
): string {
  const inputs = module.inputPorts.map((port) => bfnPortPrimaryLabel(port, t, language));
  const outputs = module.outputPorts.map((port) => bfnPortPrimaryLabel(port, t, language));
  return (inputs.length ? inputs.join(' + ') : '—') + ' → ' + (outputs[0] ?? '—');
}

export function bfnParameterPresentations(
  module: BfnFunctionalModule,
  model: BfnModelVariant | null,
  t: TFunction,
  language?: string,
): BfnParameterPresentation[] {
  if (!model) return [];
  const response = model.mode === 'static' ? model.response : model.steadyStateResponse;
  const input = module.inputPorts[0]
    ? bfnPortPrimaryLabel(module.inputPorts[0], t, language)
    : t('bfn.parameters.inputSignal');
  const output = module.outputPorts[0]
    ? bfnPortPrimaryLabel(module.outputPorts[0], t, language)
    : t('bfn.parameters.outputSignal');
  const rows: BfnParameterPresentation[] = [];

  if (response.family === 'hill_activation' || response.family === 'hill_repression') {
    rows.push(
      {
        id: 'minimum-response',
        label: t('bfn.parameters.minimumResponse'),
        description: t('bfn.parameters.minimumResponseDescription', { input, output }),
        estimate: response.ymin,
      },
      {
        id: 'maximum-response',
        label: t('bfn.parameters.maximumResponse'),
        description: t('bfn.parameters.maximumResponseDescription', { input, output }),
        estimate: response.ymax,
      },
      {
        id: 'half-response',
        label: t('bfn.parameters.halfResponse'),
        symbol: 'K',
        description: t('bfn.parameters.halfResponseDescription', { input }),
        estimate: response.k,
      },
      {
        id: 'hill-coefficient',
        label: t('bfn.parameters.hillCoefficient'),
        symbol: 'n',
        description: t('bfn.parameters.hillCoefficientDescription'),
        estimate: response.n,
      },
    );
  } else if (response.family === 'linear_transfer') {
    rows.push(
      {
        id: 'response-coefficient',
        label: t('bfn.parameters.responseCoefficient'),
        description: t('bfn.parameters.responseCoefficientDescription'),
        estimate: response.scale,
      },
      {
        id: 'base-output',
        label: t('bfn.parameters.baseOutput'),
        description: t('bfn.parameters.baseOutputDescription', { output }),
        estimate: response.intercept,
      },
    );
  } else if (response.family === 'independent_inputs') {
    rows.push(
      {
        id: 'base-output',
        label: t('bfn.parameters.baseOutput'),
        description: t('bfn.parameters.baseOutputDescription', { output }),
        estimate: response.basal,
      },
      {
        id: 'maximum-response',
        label: t('bfn.parameters.maximumResponse'),
        description: t('bfn.parameters.multiInputMaximumDescription', { output }),
        estimate: response.outputMaximum,
      },
      ...response.terms.flatMap((term, index): BfnParameterPresentation[] => {
        const inputIndex = index + 1;
        return [
          {
            id: 'input-' + inputIndex + '-half-response',
            label: t('bfn.parameters.inputHalfResponse', { index: inputIndex }),
            symbol: 'K' + inputIndex,
            showSymbolInSummary: false,
            description: t('bfn.parameters.inputHalfResponseDescription', {
              index: inputIndex,
            }),
            estimate: term.k,
          },
          {
            id: 'input-' + inputIndex + '-hill-coefficient',
            label: t('bfn.parameters.inputHillCoefficient', { index: inputIndex }),
            symbol: 'n' + inputIndex,
            showSymbolInSummary: false,
            description: t('bfn.parameters.hillCoefficientDescription'),
            estimate: term.n,
          },
          {
            id: 'input-' + inputIndex + '-contribution',
            label: t('bfn.parameters.inputContribution', { index: inputIndex }),
            symbol: 'α' + inputIndex,
            showSymbolInSummary: false,
            description: t('bfn.parameters.inputContributionDescription'),
            estimate: term.contribution,
          },
        ];
      }),
    );
  }

  if (model.mode === 'dynamic') {
    rows.push({
      id: 'response-time',
      label: t('bfn.parameters.responseTime'),
      symbol: 'τ',
      description: t('bfn.parameters.responseTimeDescription', { output }),
      estimate: model.tau,
    });
  }
  return rows;
}

export function bfnContextSectionTitle(context: BfnContext | null, t: TFunction): string {
  return context?.isDemo
    ? t('bfn.inspector.demoExperimentContext')
    : t('bfn.inspector.experimentContext');
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
