import { getDesignedSenderSignalCatalog } from '../../user-defined/designed-sender/designedSenderSignalCatalog';
import type {
  BfnModuleTemplateMetadata,
  BfnModuleTemplateVersionV1,
  BfnReusableModulePayloadV1,
  BfnTemplateContextV1,
  BfnTemplateEntityV1,
  BfnTemplateImplementationV1,
  BfnTemplatePortV1,
  BfnTemplateProvenanceV1,
  BfnTemplateStaticModelV1,
  BfnTemplateStaticResponseV1,
  BfnTemplateValidityDomainV1,
} from './templateTypes';
import { BFN_MODULE_TEMPLATE_SCHEMA, BFN_MODULE_TEMPLATE_SCHEMA_VERSION } from './templateTypes';
import {
  bfnTemplateContextDocumentationStates,
  bfnTemplateEvidenceGrades,
  bfnTemplateImplementationMaturities,
  bfnTemplateImplementationStates,
  bfnTemplateParameterUnits,
  bfnTemplateProvenanceKinds,
  bfnTemplateQuantityTypes,
  bfnTemplateUncertaintyMethods,
  bfnTemplateUnits,
  cloneData,
  deepFreezeData,
  isDataArray,
  isDeepDataTree,
  isFiniteNumber,
  isNonEmptyString,
  isNullableString,
  isPlainDataRecord,
  isValidTimestamp,
  hasOnlyKeys,
} from './templateInternals';
import { createBfnModuleTemplatePayloadSignature } from './templateSignature';
import { validateReusableModulePayload } from './templateValidation';

export const BFN_MODULE_TEMPLATE_SCHEMA_INVALID = 'BFN_MODULE_TEMPLATE_SCHEMA_INVALID' as const;

export class BfnModuleTemplateSchemaError extends Error {
  readonly code = BFN_MODULE_TEMPLATE_SCHEMA_INVALID;

  constructor() {
    super(BFN_MODULE_TEMPLATE_SCHEMA_INVALID);
    this.name = 'BfnModuleTemplateSchemaError';
  }
}

export function isBfnModuleTemplateMetadata(value: unknown): value is BfnModuleTemplateMetadata {
  if (!isDeepDataTree(value) || !isPlainDataRecord(value)) return false;
  return (
    hasOnlyKeys(value, ['id', 'name', 'description', 'createdAt', 'updatedAt', 'latestRevision']) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNullableString(value.description) &&
    isValidTimestamp(value.createdAt) &&
    isValidTimestamp(value.updatedAt) &&
    Number.isInteger(value.latestRevision) &&
    Number(value.latestRevision) > 0
  );
}

export function parseBfnModuleTemplateMetadata(value: unknown): BfnModuleTemplateMetadata {
  if (!isBfnModuleTemplateMetadata(value)) throw new BfnModuleTemplateSchemaError();
  return cloneData(value);
}

export function isBfnModuleTemplateVersionV1(value: unknown): value is BfnModuleTemplateVersionV1 {
  if (!isDeepDataTree(value) || !isPlainDataRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      'schema',
      'schemaVersion',
      'id',
      'templateId',
      'revision',
      'createdAt',
      'note',
      'payload',
      'payloadSignature',
    ]) ||
    value.schema !== BFN_MODULE_TEMPLATE_SCHEMA ||
    value.schemaVersion !== BFN_MODULE_TEMPLATE_SCHEMA_VERSION ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.templateId) ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) <= 0 ||
    value.id !== `${value.templateId}:version:${String(value.revision)}` ||
    !isValidTimestamp(value.createdAt) ||
    !isNullableString(value.note) ||
    !isReusablePayload(value.payload) ||
    !isNonEmptyString(value.payloadSignature)
  ) {
    return false;
  }
  if (validateReusableModulePayload(value.payload).length > 0) return false;
  if (!canonicalEntitiesResolve(value.payload.entities)) return false;
  return value.payloadSignature === createBfnModuleTemplatePayloadSignature(value.payload);
}

export function parseBfnModuleTemplateVersion(value: unknown): BfnModuleTemplateVersionV1 {
  if (!isBfnModuleTemplateVersionV1(value)) throw new BfnModuleTemplateSchemaError();
  return deepFreezeData(cloneData(value));
}

export interface CreateBfnModuleTemplateVersionV1Input {
  readonly templateId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly note: string | null;
  readonly payload: BfnReusableModulePayloadV1;
}

/** Creates an immutable envelope from caller-supplied identity and time data. */
export function createBfnModuleTemplateVersionV1(
  input: CreateBfnModuleTemplateVersionV1Input,
): BfnModuleTemplateVersionV1 {
  const candidate: unknown = {
    schema: BFN_MODULE_TEMPLATE_SCHEMA,
    schemaVersion: BFN_MODULE_TEMPLATE_SCHEMA_VERSION,
    id: `${input.templateId}:version:${String(input.revision)}`,
    templateId: input.templateId,
    revision: input.revision,
    createdAt: input.createdAt,
    note: input.note,
    payload: cloneData(input.payload),
    payloadSignature: createBfnModuleTemplatePayloadSignature(input.payload),
  };
  return parseBfnModuleTemplateVersion(candidate);
}

function isReusablePayload(value: unknown): value is BfnReusableModulePayloadV1 {
  if (!isPlainDataRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      'moduleClass',
      'ports',
      'entities',
      'contexts',
      'validityDomains',
      'provenance',
      'implementations',
      'implementationKeys',
      'moduleEvidenceGrade',
      'implementationState',
      'activeModels',
      'models',
    ]) ||
    !isDataArray(value.ports) ||
    !value.ports.every(isPort) ||
    !isDataArray(value.entities) ||
    !value.entities.every(isEntity) ||
    !isDataArray(value.contexts) ||
    !value.contexts.every(isContext) ||
    !isDataArray(value.validityDomains) ||
    !value.validityDomains.every(isValidityDomain) ||
    !isDataArray(value.provenance) ||
    !value.provenance.every(isProvenance) ||
    !isDataArray(value.implementations) ||
    !value.implementations.every(isImplementation) ||
    !isStringArray(value.implementationKeys) ||
    !bfnTemplateEvidenceGrades.has(String(value.moduleEvidenceGrade)) ||
    !bfnTemplateImplementationStates.has(String(value.implementationState)) ||
    !isPlainDataRecord(value.activeModels) ||
    !isPlainDataRecord(value.models)
  ) {
    return false;
  }

  if (value.moduleClass === 'static') {
    return (
      hasOnlyKeys(value.activeModels, ['static']) &&
      isNonEmptyString(value.activeModels.static) &&
      hasOnlyKeys(value.models, ['static']) &&
      isStaticModel(value.models.static)
    );
  }
  if (value.moduleClass === 'first_order') {
    return (
      hasOnlyKeys(value.activeModels, ['static', 'dynamic']) &&
      isNonEmptyString(value.activeModels.static) &&
      isNonEmptyString(value.activeModels.dynamic) &&
      hasOnlyKeys(value.models, ['static', 'dynamic']) &&
      isStaticModel(value.models.static) &&
      isFirstOrderModel(value.models.dynamic)
    );
  }
  if (value.moduleClass === 'accumulator') {
    return (
      hasOnlyKeys(value.activeModels, ['dynamic']) &&
      isNonEmptyString(value.activeModels.dynamic) &&
      hasOnlyKeys(value.models, ['dynamic']) &&
      isAccumulatorModel(value.models.dynamic)
    );
  }
  return false;
}

function isPort(value: unknown): value is BfnTemplatePortV1 {
  if (!isPlainDataRecord(value)) return false;
  return (
    hasOnlyKeys(
      value,
      ['key', 'entityKey', 'quantityType', 'unit', 'direction'],
      ['displayName', 'authoringName'],
    ) &&
    isNonEmptyString(value.key) &&
    isNonEmptyString(value.entityKey) &&
    bfnTemplateQuantityTypes.has(String(value.quantityType)) &&
    bfnTemplateUnits.has(String(value.unit)) &&
    (value.direction === 'input' || value.direction === 'output') &&
    (value.displayName === undefined || isLocalizedDisplayName(value.displayName)) &&
    (value.authoringName === undefined || isNonEmptyString(value.authoringName))
  );
}

function isLocalizedDisplayName(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, ['en', 'zh']) &&
    isNonEmptyString(value.en) &&
    isNonEmptyString(value.zh)
  );
}

function isEntity(value: unknown): value is BfnTemplateEntityV1 {
  if (!isPlainDataRecord(value) || !isNonEmptyString(value.key)) return false;
  if (value.mode === 'canonical') {
    return (
      hasOnlyKeys(value, ['key', 'mode', 'authority', 'catalogId', 'entityId', 'displayName']) &&
      value.authority === 'ahl_hsl_catalog' &&
      isNonEmptyString(value.catalogId) &&
      isNonEmptyString(value.entityId) &&
      isNonEmptyString(value.displayName)
    );
  }
  if (value.mode === 'embedded') {
    return (
      hasOnlyKeys(value, ['key', 'mode', 'displayName', 'description']) &&
      isNonEmptyString(value.displayName) &&
      isNullableString(value.description)
    );
  }
  if (value.mode === 'slot') {
    return (
      hasOnlyKeys(value, [
        'key',
        'mode',
        'sourceEntityId',
        'displayName',
        'description',
        'requirements',
      ]) &&
      isNonEmptyString(value.sourceEntityId) &&
      isNonEmptyString(value.displayName) &&
      isNullableString(value.description) &&
      isDataArray(value.requirements) &&
      value.requirements.length > 0 &&
      value.requirements.every(isEntityRequirement)
    );
  }
  return false;
}

function isEntityRequirement(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, ['portKey', 'direction', 'quantityType', 'unit']) &&
    isNonEmptyString(value.portKey) &&
    (value.direction === 'input' || value.direction === 'output') &&
    bfnTemplateQuantityTypes.has(String(value.quantityType)) &&
    bfnTemplateUnits.has(String(value.unit))
  );
}

function isParameter(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, ['value', 'unit'], ['interval95']) &&
    isFiniteNumber(value.value) &&
    bfnTemplateParameterUnits.has(String(value.unit)) &&
    (value.interval95 === undefined || isInterval(value.interval95))
  );
}

function isStaticResponse(value: unknown): value is BfnTemplateStaticResponseV1 {
  if (!isPlainDataRecord(value)) return false;
  if (value.family === 'hill_activation' || value.family === 'hill_repression') {
    return (
      hasOnlyKeys(value, ['family', 'inputPortKey', 'ymin', 'ymax', 'k', 'n']) &&
      isNonEmptyString(value.inputPortKey) &&
      isParameter(value.ymin) &&
      isParameter(value.ymax) &&
      isParameter(value.k) &&
      isParameter(value.n)
    );
  }
  if (value.family === 'linear_transfer') {
    return (
      hasOnlyKeys(
        value,
        ['family', 'inputPortKey', 'scale', 'intercept'],
        ['outputMinimum', 'outputMaximum'],
      ) &&
      isNonEmptyString(value.inputPortKey) &&
      isParameter(value.scale) &&
      isParameter(value.intercept) &&
      (value.outputMinimum === undefined || isFiniteNumber(value.outputMinimum)) &&
      (value.outputMaximum === undefined || isFiniteNumber(value.outputMaximum))
    );
  }
  if (value.family === 'identity') {
    return hasOnlyKeys(value, ['family', 'inputPortKey']) && isNonEmptyString(value.inputPortKey);
  }
  if (value.family === 'independent_inputs') {
    return (
      hasOnlyKeys(value, [
        'family',
        'terms',
        'basal',
        'outputMaximum',
        'aggregation',
        'interactionAssumption',
      ]) &&
      isDataArray(value.terms) &&
      value.terms.every(isIndependentTerm) &&
      isParameter(value.basal) &&
      isParameter(value.outputMaximum) &&
      (value.aggregation === 'bounded_sum' || value.aggregation === 'multiplicative') &&
      value.interactionAssumption === 'independent_unverified'
    );
  }
  return false;
}

function isIndependentTerm(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, ['inputPortKey', 'direction', 'k', 'n', 'contribution']) &&
    isNonEmptyString(value.inputPortKey) &&
    (value.direction === 'activation' || value.direction === 'repression') &&
    isParameter(value.k) &&
    isParameter(value.n) &&
    isParameter(value.contribution)
  );
}

const modelBaseKeys = [
  'key',
  'version',
  'contextKey',
  'validityDomainKey',
  'provenanceKeys',
  'evidenceGrade',
  'uncertaintyMethod',
] as const;

function hasModelBase(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.key) &&
    isNonEmptyString(value.version) &&
    (value.contextKey === null || isNonEmptyString(value.contextKey)) &&
    isNonEmptyString(value.validityDomainKey) &&
    isStringArray(value.provenanceKeys) &&
    bfnTemplateEvidenceGrades.has(String(value.evidenceGrade)) &&
    bfnTemplateUncertaintyMethods.has(String(value.uncertaintyMethod))
  );
}

function isStaticModel(value: unknown): value is BfnTemplateStaticModelV1 {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, [...modelBaseKeys, 'mode', 'family', 'response']) &&
    hasModelBase(value) &&
    value.mode === 'static' &&
    [
      'hill_activation',
      'hill_repression',
      'linear_transfer',
      'identity',
      'independent_inputs',
    ].includes(String(value.family)) &&
    isStaticResponse(value.response) &&
    value.family === value.response.family
  );
}

function isFirstOrderModel(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, [
      ...modelBaseKeys,
      'mode',
      'family',
      'steadyStateResponse',
      'tau',
      'initialState',
    ]) &&
    hasModelBase(value) &&
    value.mode === 'dynamic' &&
    value.family === 'first_order' &&
    isStaticResponse(value.steadyStateResponse) &&
    isParameter(value.tau) &&
    isFiniteNumber(value.initialState)
  );
}

function isAccumulatorModel(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, [
      ...modelBaseKeys,
      'mode',
      'family',
      'inputPortKey',
      'outputPortKey',
      'initialState',
    ]) &&
    hasModelBase(value) &&
    value.mode === 'dynamic' &&
    value.family === 'accumulator' &&
    isNonEmptyString(value.inputPortKey) &&
    isNonEmptyString(value.outputPortKey) &&
    isFiniteNumber(value.initialState)
  );
}

function isContext(value: unknown): value is BfnTemplateContextV1 {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, [
      'key',
      'labelKey',
      'documentationState',
      'host',
      'strain',
      'medium',
      'temperatureCelsius',
      'ph',
      'oxygenation',
      'growthPhase',
      'plasmidBackbone',
      'copyNumberRegime',
      'inductionProtocol',
      'measurementTimeHours',
      'batch',
      'isDemo',
    ]) &&
    isNonEmptyString(value.key) &&
    isNonEmptyString(value.labelKey) &&
    bfnTemplateContextDocumentationStates.has(String(value.documentationState)) &&
    [
      value.host,
      value.strain,
      value.medium,
      value.oxygenation,
      value.growthPhase,
      value.plasmidBackbone,
      value.copyNumberRegime,
      value.inductionProtocol,
      value.batch,
    ].every(isNullableString) &&
    [value.temperatureCelsius, value.ph, value.measurementTimeHours].every(
      (item) => item === null || isFiniteNumber(item),
    ) &&
    typeof value.isDemo === 'boolean'
  );
}

function isValidityDomain(value: unknown): value is BfnTemplateValidityDomainV1 {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, ['key', 'labelKey', 'inputRanges', 'contextKey'], ['timeRangeHours']) &&
    isNonEmptyString(value.key) &&
    isNonEmptyString(value.labelKey) &&
    isDataArray(value.inputRanges) &&
    value.inputRanges.every(isValidityRange) &&
    (value.timeRangeHours === undefined || isInterval(value.timeRangeHours)) &&
    (value.contextKey === null || isNonEmptyString(value.contextKey))
  );
}

function isValidityRange(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, ['portKey', 'minimum', 'maximum', 'unit']) &&
    isNonEmptyString(value.portKey) &&
    isFiniteNumber(value.minimum) &&
    isFiniteNumber(value.maximum) &&
    bfnTemplateUnits.has(String(value.unit))
  );
}

function isProvenance(value: unknown): value is BfnTemplateProvenanceV1 {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, ['key', 'kind', 'reference']) &&
    isNonEmptyString(value.key) &&
    bfnTemplateProvenanceKinds.has(String(value.kind)) &&
    isNonEmptyString(value.reference)
  );
}

function isImplementation(value: unknown): value is BfnTemplateImplementationV1 {
  return (
    isPlainDataRecord(value) &&
    hasOnlyKeys(value, [
      'key',
      'labelKey',
      'promoter',
      'operator',
      'rbs',
      'codingSequence',
      'degradationTag',
      'plasmidBackbone',
      'host',
      'strainComposition',
      'evidenceGrade',
      'maturity',
      'provenanceKeys',
      'isDemo',
    ]) &&
    isNonEmptyString(value.key) &&
    isNonEmptyString(value.labelKey) &&
    isNonEmptyString(value.promoter) &&
    isNullableString(value.operator) &&
    isNonEmptyString(value.rbs) &&
    isNonEmptyString(value.codingSequence) &&
    isNonEmptyString(value.degradationTag) &&
    isNonEmptyString(value.plasmidBackbone) &&
    isNonEmptyString(value.host) &&
    isNullableString(value.strainComposition) &&
    bfnTemplateEvidenceGrades.has(String(value.evidenceGrade)) &&
    bfnTemplateImplementationMaturities.has(String(value.maturity)) &&
    isStringArray(value.provenanceKeys) &&
    typeof value.isDemo === 'boolean'
  );
}

function isInterval(value: unknown): value is [number, number] {
  return (
    isDataArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1])
  );
}

function isStringArray(value: unknown): value is string[] {
  return isDataArray(value) && value.every(isNonEmptyString);
}

function canonicalEntitiesResolve(entities: readonly BfnTemplateEntityV1[]): boolean {
  const catalog = getDesignedSenderSignalCatalog();
  return entities.every((entity) => {
    if (entity.mode !== 'canonical') return true;
    const resolved = catalog.find((candidate) => candidate.catalogSignalId === entity.catalogId);
    return resolved?.entityId === entity.entityId && resolved.displayName === entity.displayName;
  });
}
