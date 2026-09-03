import type { TFunction } from 'i18next';
import { bfnQuantityLabel, bfnUnitLabel } from '../presentation';
import type { BfnParameterEstimate, BfnUnit } from '../types';
import type {
  BfnReusableModulePayloadV1,
  BfnTemplateEntityV1,
  BfnTemplateModelBaseV1,
  BfnTemplatePortV1,
  BfnTemplateStaticResponseV1,
} from './template';

export interface ModuleLibraryPortPresentation {
  readonly key: string;
  readonly direction: 'input' | 'output';
  readonly role: string;
  readonly entity: string;
  readonly measurement: string;
}

export interface ModuleLibraryParameterPresentation {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly interval95: readonly [number, number] | null;
  readonly unit: string;
}

export interface ModuleLibraryPropertyPresentation {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface ModuleLibraryScientificPresentation {
  readonly moduleType: string;
  readonly modelName: string;
  readonly modelDetail: string | null;
  readonly modelVersion: string;
  readonly ports: readonly ModuleLibraryPortPresentation[];
  readonly parameters: readonly ModuleLibraryParameterPresentation[];
  readonly applicability: readonly ModuleLibraryPropertyPresentation[];
  readonly evidenceBasis: string;
  readonly evidenceSources: readonly string[];
  readonly uncertainty: string;
}

export function createModuleLibraryScientificPresentation(
  payload: BfnReusableModulePayloadV1,
  t: TFunction,
  language: string,
): ModuleLibraryScientificPresentation {
  const entities = new Map(payload.entities.map((entity) => [entity.key, entity]));
  const ports = payload.ports.map((port) =>
    presentPort(port, entities.get(port.entityKey), t, language),
  );
  const model = primaryModel(payload);
  const response = staticResponse(payload);
  const outputUnit = payload.ports.find((port) => port.direction === 'output')?.unit;
  const parameters = [
    ...(response ? presentStaticParameters(response, payload.ports, entities, outputUnit, t) : []),
    ...presentDynamicParameters(payload, outputUnit, t),
  ];
  const modelName = t(`bfn.moduleLibrary.modelFamilies.${modelFamily(payload)}`);
  const modelDetail =
    payload.moduleClass === 'first_order' && response
      ? t('bfn.moduleLibrary.modelDetail', {
          response: t(`bfn.moduleLibrary.modelFamilies.${response.family}`),
        })
      : null;
  return {
    moduleType: t(`bfn.moduleLibrary.moduleTypes.${payload.moduleClass}`),
    modelName,
    modelDetail,
    modelVersion: model.version,
    ports,
    parameters,
    applicability: presentApplicability(payload, model, entities, t),
    evidenceBasis: t(`bfn.moduleLibrary.evidence.${model.evidenceGrade}`),
    evidenceSources: payload.provenance.map((record) => record.reference),
    uncertainty: t(`bfn.moduleLibrary.uncertainty.${model.uncertaintyMethod}`),
  };
}

function primaryModel(payload: BfnReusableModulePayloadV1): BfnTemplateModelBaseV1 {
  return payload.moduleClass === 'static' ? payload.models.static : payload.models.dynamic;
}

function staticResponse(payload: BfnReusableModulePayloadV1): BfnTemplateStaticResponseV1 | null {
  if (payload.moduleClass === 'static') return payload.models.static.response;
  if (payload.moduleClass === 'first_order') return payload.models.dynamic.steadyStateResponse;
  return null;
}

function modelFamily(payload: BfnReusableModulePayloadV1): string {
  if (payload.moduleClass === 'first_order') return 'first_order';
  if (payload.moduleClass === 'accumulator') return 'accumulator';
  return payload.models.static.family;
}

function presentPort(
  port: BfnTemplatePortV1,
  entity: BfnTemplateEntityV1 | undefined,
  t: TFunction,
  language: string,
): ModuleLibraryPortPresentation {
  const localizedName = language.toLocaleLowerCase().startsWith('zh')
    ? port.displayName?.zh
    : port.displayName?.en;
  return {
    key: port.key,
    direction: port.direction,
    role:
      port.authoringName ??
      localizedName ??
      t(`bfn.moduleLibrary.portDirections.${port.direction}`),
    entity: safeEntityName(entity, t),
    measurement: `${bfnQuantityLabel(port.quantityType, t)} · ${bfnUnitLabel(port.unit, t)}`,
  };
}

function safeEntityName(entity: BfnTemplateEntityV1 | undefined, t: TFunction): string {
  if (!entity) return t('bfn.moduleLibrary.unknownEntity');
  if (entity.mode === 'slot' && entity.displayName === entity.sourceEntityId) {
    return t('bfn.moduleLibrary.unknownEntity');
  }
  return entity.displayName;
}

function presentStaticParameters(
  response: BfnTemplateStaticResponseV1,
  ports: readonly BfnTemplatePortV1[],
  entities: ReadonlyMap<string, BfnTemplateEntityV1>,
  outputUnit: BfnUnit | undefined,
  t: TFunction,
): ModuleLibraryParameterPresentation[] {
  if ('ymin' in response) {
    return [
      estimateRow('minimumOutput', response.ymin, t),
      estimateRow('maximumOutput', response.ymax, t),
      estimateRow('halfResponse', response.k, t),
      estimateRow('hillCoefficient', response.n, t),
    ];
  }
  if ('scale' in response) {
    const rows = [
      estimateRow('responseCoefficient', response.scale, t),
      estimateRow('baseOutput', response.intercept, t),
    ];
    if (response.outputMinimum !== undefined && outputUnit) {
      rows.push(numberRow('outputMinimum', response.outputMinimum, outputUnit, t));
    }
    if (response.outputMaximum !== undefined && outputUnit) {
      rows.push(numberRow('outputMaximum', response.outputMaximum, outputUnit, t));
    }
    return rows;
  }
  if (!('terms' in response)) return [];
  const rows = [
    estimateRow('baseOutput', response.basal, t),
    estimateRow('outputMaximum', response.outputMaximum, t),
  ];
  response.terms.forEach((term, index) => {
    const port = ports.find((candidate) => candidate.key === term.inputPortKey);
    const entity = port ? entities.get(port.entityKey) : undefined;
    const input = safeEntityName(entity, t);
    rows.push(
      namedEstimateRow(
        `term-${index + 1}-k`,
        t('bfn.moduleLibrary.parameters.termHalfResponse', { input }),
        term.k,
        t,
      ),
      namedEstimateRow(
        `term-${index + 1}-n`,
        t('bfn.moduleLibrary.parameters.termHillCoefficient', { input }),
        term.n,
        t,
      ),
      namedEstimateRow(
        `term-${index + 1}-contribution`,
        t('bfn.moduleLibrary.parameters.termContribution', { input }),
        term.contribution,
        t,
      ),
    );
  });
  return rows;
}

function presentDynamicParameters(
  payload: BfnReusableModulePayloadV1,
  outputUnit: BfnUnit | undefined,
  t: TFunction,
): ModuleLibraryParameterPresentation[] {
  if (payload.moduleClass === 'first_order') {
    return [
      estimateRow('timeConstant', payload.models.dynamic.tau, t),
      numberRow(
        'initialOutput',
        payload.models.dynamic.initialState,
        outputUnit ?? 'dimensionless',
        t,
      ),
    ];
  }
  if (payload.moduleClass === 'accumulator') {
    return [
      numberRow(
        'initialConcentration',
        payload.models.dynamic.initialState,
        outputUnit ?? 'dimensionless',
        t,
      ),
    ];
  }
  return [];
}

function estimateRow(
  key: string,
  estimate: BfnParameterEstimate,
  t: TFunction,
): ModuleLibraryParameterPresentation {
  return namedEstimateRow(key, t(`bfn.moduleLibrary.parameters.${key}`), estimate, t);
}

function namedEstimateRow(
  key: string,
  label: string,
  estimate: BfnParameterEstimate,
  t: TFunction,
): ModuleLibraryParameterPresentation {
  return {
    key,
    label,
    value: estimate.value,
    interval95: estimate.interval95 ?? null,
    unit: bfnUnitLabel(estimate.unit, t),
  };
}

function numberRow(
  key: string,
  value: number,
  unit: BfnUnit,
  t: TFunction,
): ModuleLibraryParameterPresentation {
  return {
    key,
    label: t(`bfn.moduleLibrary.parameters.${key}`),
    value,
    interval95: null,
    unit: bfnUnitLabel(unit, t),
  };
}

function presentApplicability(
  payload: BfnReusableModulePayloadV1,
  model: BfnTemplateModelBaseV1,
  entities: ReadonlyMap<string, BfnTemplateEntityV1>,
  t: TFunction,
): ModuleLibraryPropertyPresentation[] {
  const context = model.contextKey
    ? payload.contexts.find((candidate) => candidate.key === model.contextKey)
    : undefined;
  const domain = payload.validityDomains.find(
    (candidate) => candidate.key === model.validityDomainKey,
  );
  const properties: ModuleLibraryPropertyPresentation[] = [];
  const contextValues = [
    ['host', context?.host],
    ['strain', context?.strain],
    ['medium', context?.medium],
    [
      'temperature',
      context?.temperatureCelsius === null || context?.temperatureCelsius === undefined
        ? null
        : `${context.temperatureCelsius} °C`,
    ],
    ['ph', context?.ph === null || context?.ph === undefined ? null : `${context.ph}`],
    ['oxygenation', context?.oxygenation],
    ['growthPhase', context?.growthPhase],
  ] as const;
  for (const [key, value] of contextValues) {
    if (value) {
      properties.push({ key, label: t(`bfn.moduleLibrary.applicability.${key}`), value });
    }
  }
  if (!contextValues.some((entry) => Boolean(entry[1]))) {
    properties.push({
      key: 'conditions',
      label: t('bfn.moduleLibrary.applicability.conditions'),
      value: t('bfn.moduleLibrary.notRecorded'),
    });
  }
  domain?.inputRanges.forEach((range, index) => {
    const port = payload.ports.find((candidate) => candidate.key === range.portKey);
    properties.push({
      key: `range-${index + 1}`,
      label: t('bfn.moduleLibrary.applicability.inputRange', {
        entity: port
          ? safeEntityName(entities.get(port.entityKey), t)
          : t('bfn.moduleLibrary.unknownEntity'),
      }),
      value: `${range.minimum}–${range.maximum} ${bfnUnitLabel(range.unit, t)}`,
    });
  });
  if (domain?.timeRangeHours) {
    properties.push({
      key: 'time-range',
      label: t('bfn.moduleLibrary.applicability.timeRange'),
      value: `${domain.timeRangeHours[0]}–${domain.timeRangeHours[1]} h`,
    });
  }
  return properties;
}
