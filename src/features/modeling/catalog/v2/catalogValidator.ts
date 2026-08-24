import { COMPONENT_CATALOG_V2_SCHEMA_VERSION, isCatalogV2AdmissionStatus } from './catalogTypes';
import type {
  CatalogV2ValidationError,
  CatalogV2ValidationResult,
  ComponentCatalogV2,
} from './catalogTypes';

const NODE_TYPES = ['input', 'processing', 'output'] as const;
const SIGNAL_DIRECTIONS = ['input', 'output', 'intermediate', 'bidirectional'] as const;
const SIGNAL_KINDS = [
  'fluorescence',
  'analyte',
  'regulatory',
  'control',
  'quality',
  'state',
  'unknown',
] as const;
const MEASUREMENT_KINDS = ['continuous', 'discrete', 'categorical', 'unknown'] as const;
const SOURCE_KINDS = [
  'primary-paper',
  'database',
  'registry',
  'supplement',
  'legacy-catalog',
  'development-fixture',
] as const;
const COMPATIBILITY_KINDS = [
  'compatible',
  'no-response',
  'requires-calibration',
  'incompatible',
] as const;
const RELEASE_STATUSES = ['development-fixture', 'draft', 'candidate', 'released'] as const;
const EVIDENCE_GRADES = ['A', 'B', 'C', 'D', 'unknown'] as const;
const REVIEW_STATUSES = ['passed', 'needs-review', 'withdrawn'] as const;

type RecordMap = Map<string, Record<string, unknown>>;
type Index = {
  signals: Set<string>;
  components: Set<string>;
  contexts: Set<string>;
  responses: Set<string>;
  senders: Set<string>;
  sources: Set<string>;
  sourceRecords: RecordMap;
  contextRecords: RecordMap;
  componentRecords: RecordMap;
  responseRecords: RecordMap;
  senderRecords: RecordMap;
};

export function validateCatalogV2(value: unknown): CatalogV2ValidationResult<ComponentCatalogV2> {
  const errors: CatalogV2ValidationError[] = [];
  if (!record(value)) return fail('catalog', 'must be an object', 'type');
  keys(
    value,
    [
      'releaseManifest',
      'signals',
      'components',
      'parameterContexts',
      'receiverResponses',
      'senderOutputs',
      'effectivePairs',
      'compatibilityRelations',
      'sources',
    ],
    'catalog',
    errors,
  );
  validateManifest(value.releaseManifest, errors);
  const signals = array(value.signals, 'catalog.signals', errors);
  const components = array(value.components, 'catalog.components', errors);
  const contexts = array(value.parameterContexts, 'catalog.parameterContexts', errors);
  const responses = array(value.receiverResponses, 'catalog.receiverResponses', errors);
  const senders = array(value.senderOutputs, 'catalog.senderOutputs', errors);
  const pairs = array(value.effectivePairs, 'catalog.effectivePairs', errors);
  const relations = array(value.compatibilityRelations, 'catalog.compatibilityRelations', errors);
  const sources = array(value.sources, 'catalog.sources', errors);
  const index = makeIndex({ signals, components, contexts, responses, senders, sources });
  for (const [name, items] of [
    ['signals', signals],
    ['components', components],
    ['parameterContexts', contexts],
    ['receiverResponses', responses],
    ['senderOutputs', senders],
    ['effectivePairs', pairs],
    ['compatibilityRelations', relations],
    ['sources', sources],
  ] as const)
    duplicateIds(items, `catalog.${name}`, errors);
  sources.forEach((item, i) => validateSource(item, `catalog.sources[${i}]`, index, errors));
  contexts.forEach((item, i) =>
    validateContext(item, `catalog.parameterContexts[${i}]`, index, errors),
  );
  signals.forEach((item, i) => validateSignal(item, `catalog.signals[${i}]`, index, errors));
  components.forEach((item, i) =>
    validateComponent(item, `catalog.components[${i}]`, index, errors),
  );
  responses.forEach((item, i) =>
    validateResponse(item, `catalog.receiverResponses[${i}]`, index, errors),
  );
  senders.forEach((item, i) => validateSender(item, `catalog.senderOutputs[${i}]`, index, errors));
  pairs.forEach((item, i) => validatePair(item, `catalog.effectivePairs[${i}]`, index, errors));
  relations.forEach((item, i) =>
    validateRelation(item, `catalog.compatibilityRelations[${i}]`, index, errors),
  );
  crossCheck(components, responses, senders, pairs, relations, index, errors);
  checkCounts(
    value.releaseManifest,
    {
      signals,
      components,
      parameterContexts: contexts,
      receiverResponses: responses,
      senderOutputs: senders,
      effectivePairs: pairs,
      compatibilityRelations: relations,
      sources,
    },
    errors,
  );
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: value as unknown as ComponentCatalogV2 };
}

export const validateCatalogBundleV2 = validateCatalogV2;
export const validateComponentCatalogV2 = validateCatalogV2;
export const isCatalogV2 = (value: unknown): value is ComponentCatalogV2 =>
  validateCatalogV2(value).ok;

function validateManifest(value: unknown, errors: CatalogV2ValidationError[]): void {
  const path = 'catalog.releaseManifest';
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    [
      'schemaVersion',
      'catalogId',
      'releaseId',
      'releaseVersion',
      'generatedAt',
      'status',
      'counts',
      'derivedFrom',
      'notes',
      'fixtureLabel',
    ],
    path,
    errors,
  );
  if (value.schemaVersion !== COMPONENT_CATALOG_V2_SCHEMA_VERSION)
    addError(
      errors,
      `${path}.schemaVersion`,
      `must equal ${COMPONENT_CATALOG_V2_SCHEMA_VERSION}`,
      'version',
    );
  for (const field of ['catalogId', 'releaseId', 'releaseVersion', 'generatedAt'] as const)
    if (!nonEmpty(value[field]))
      addError(errors, `${path}.${field}`, 'must be non-empty', 'required');
  if (!oneOf(value.status, RELEASE_STATUSES))
    addError(errors, `${path}.status`, 'invalid release status', 'enum');
  if (!record(value.counts)) addError(errors, `${path}.counts`, 'must be an object', 'type');
  else {
    const fields = [
      'signals',
      'components',
      'parameterContexts',
      'receiverResponses',
      'senderOutputs',
      'effectivePairs',
      'compatibilityRelations',
      'sources',
    ] as const;
    keys(value.counts, fields, `${path}.counts`, errors);
    for (const field of fields)
      if (!nonNegativeInteger(value.counts[field]))
        addError(errors, `${path}.counts.${field}`, 'must be a non-negative integer', 'number');
  }
  strings(value.notes, `${path}.notes`, errors, false);
  if (value.fixtureLabel !== undefined && value.fixtureLabel !== 'development-fixture')
    addError(errors, `${path}.fixtureLabel`, 'must equal development-fixture', 'fixture');
  if (value.status === 'development-fixture' && value.fixtureLabel !== 'development-fixture')
    addError(
      errors,
      `${path}.fixtureLabel`,
      'development-fixture releases must be labelled',
      'fixture',
    );
  if (value.status !== 'development-fixture' && value.fixtureLabel !== undefined)
    addError(
      errors,
      `${path}.fixtureLabel`,
      'fixture label requires development-fixture status',
      'fixture',
    );
  if (value.derivedFrom !== undefined) {
    if (!record(value.derivedFrom))
      addError(errors, `${path}.derivedFrom`, 'must be an object', 'type');
    else {
      keys(value.derivedFrom, ['catalogId', 'catalogVersion'], `${path}.derivedFrom`, errors);
      if (!nonEmpty(value.derivedFrom.catalogId))
        addError(errors, `${path}.derivedFrom.catalogId`, 'must be non-empty', 'required');
      if (!nonEmpty(value.derivedFrom.catalogVersion))
        addError(errors, `${path}.derivedFrom.catalogVersion`, 'must be non-empty', 'required');
    }
  }
}

function validateSource(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    ['id', 'kind', 'label', 'citation', 'locator', 'isDemo', 'supports', 'provenance', 'notes'],
    path,
    errors,
  );
  id(value.id, `${path}.id`, errors);
  if (!oneOf(value.kind, SOURCE_KINDS))
    addError(errors, `${path}.kind`, 'invalid source kind', 'enum');
  if (!nonEmpty(value.label)) addError(errors, `${path}.label`, 'must be non-empty', 'required');
  if (value.citation !== undefined && typeof value.citation !== 'string')
    addError(errors, `${path}.citation`, 'must be a string', 'type');
  if (value.locator !== undefined && typeof value.locator !== 'string')
    addError(errors, `${path}.locator`, 'must be a string', 'type');
  if (typeof value.isDemo !== 'boolean')
    addError(errors, `${path}.isDemo`, 'must be boolean', 'type');
  strings(value.supports, `${path}.supports`, errors, false);
  if (value.provenance !== undefined)
    validateSourceProvenance(value.provenance, `${path}.provenance`, index, errors);
  strings(value.notes, `${path}.notes`, errors, false);
  void index;
}

function validateSignal(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    [
      'id',
      'label',
      'unit',
      'direction',
      'kind',
      'precision',
      'sourceIds',
      'legacySourceRefs',
      'notes',
    ],
    path,
    errors,
  );
  id(value.id, `${path}.id`, errors);
  if (!nonEmpty(value.label)) addError(errors, `${path}.label`, 'must be non-empty', 'required');
  if (!nonEmpty(value.unit)) addError(errors, `${path}.unit`, 'must be non-empty', 'required');
  if (!oneOf(value.direction, SIGNAL_DIRECTIONS))
    addError(errors, `${path}.direction`, 'invalid signal direction', 'enum');
  if (!oneOf(value.kind, SIGNAL_KINDS))
    addError(errors, `${path}.kind`, 'invalid signal kind', 'enum');
  validatePrecision(value.precision, `${path}.precision`, errors);
  refs(value.sourceIds, `${path}.sourceIds`, index.sources, errors, true);
  if (value.legacySourceRefs !== undefined)
    strings(value.legacySourceRefs, `${path}.legacySourceRefs`, errors, false);
  strings(value.notes, `${path}.notes`, errors, false);
}

function validatePrecision(value: unknown, path: string, errors: CatalogV2ValidationError[]): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(value, ['measurementKind', 'statement', 'resolution', 'workingRange'], path, errors);
  if (!oneOf(value.measurementKind, MEASUREMENT_KINDS))
    addError(errors, `${path}.measurementKind`, 'invalid measurement kind', 'enum');
  if (!nonEmpty(value.statement))
    addError(errors, `${path}.statement`, 'must be non-empty', 'required');
  if (value.resolution !== undefined && (!finite(value.resolution) || value.resolution < 0))
    addError(errors, `${path}.resolution`, 'must be finite and non-negative', 'number');
  if (value.workingRange !== undefined)
    validateRange(value.workingRange, `${path}.workingRange`, errors);
}

function validateContext(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    ['id', 'label', 'parameters', 'sourceIds', 'certainty', 'demoBoundary', 'details', 'notes'],
    path,
    errors,
  );
  id(value.id, `${path}.id`, errors);
  if (!nonEmpty(value.label)) addError(errors, `${path}.label`, 'must be non-empty', 'required');
  if (!Array.isArray(value.parameters))
    addError(errors, `${path}.parameters`, 'must be an array', 'type');
  else
    value.parameters.forEach((item, i) =>
      validateParameter(item, `${path}.parameters[${i}]`, errors),
    );
  refs(value.sourceIds, `${path}.sourceIds`, index.sources, errors, true);
  if (!oneOf(value.certainty, ['documented', 'partially-documented', 'unknown'] as const))
    addError(errors, `${path}.certainty`, 'invalid certainty', 'enum');
  boundary(value.demoBoundary, `${path}.demoBoundary`, errors);
  if (value.details !== undefined)
    validateContextDetails(value.details, `${path}.details`, errors);
  strings(value.notes, `${path}.notes`, errors, false);
}

function validateParameter(value: unknown, path: string, errors: CatalogV2ValidationError[]): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(value, ['name', 'value', 'unit'], path, errors);
  if (!nonEmpty(value.name)) addError(errors, `${path}.name`, 'must be non-empty', 'required');
  if (!nonEmpty(value.value)) addError(errors, `${path}.value`, 'must be non-empty', 'required');
  if (value.unit !== undefined && typeof value.unit !== 'string')
    addError(errors, `${path}.unit`, 'must be a string', 'type');
}

function validateContextDetails(
  value: unknown,
  path: string,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  for (const field of [
    'hostSpecies',
    'hostStrain',
    'vectorSystem',
    'promoterConfiguration',
    'reporter',
    'cultureMedium',
    'temperature',
    'inductionConditions',
    'exposureTime',
    'measurementPlatform',
    'measurementUnit',
    'normalizationMethod',
    'backgroundSubtraction',
  ] as const)
    if (value[field] !== null && typeof value[field] !== 'string')
      addError(errors, `${path}.${field}`, 'must be a string or null', 'type');
  for (const field of ['biologicalReplicates', 'technicalReplicates'] as const)
    if (value[field] !== null && (typeof value[field] !== 'number' || !Number.isFinite(value[field])))
      addError(errors, `${path}.${field}`, 'must be a finite number or null', 'type');
  strings(value.applicableComponentIds, `${path}.applicableComponentIds`, errors, false);
  if (value.measurementDetails !== null && !record(value.measurementDetails))
    addError(errors, `${path}.measurementDetails`, 'must be an object or null', 'type');
}

function validateSourceResponse(
  value: unknown,
  path: string,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  for (const field of [
    'direction',
    'softwareStatus',
    'evidenceType',
    'fitStatus',
    'modelType',
    'ec50Unit',
    'approximationQualifier',
    'qualityLevel',
    'evidenceLocation',
    'reconstructionStatus',
    'notes',
    'ec50OriginalUnit',
    'parameterSourceLocation',
    'demoImplementation',
    'overrideReason',
    'runtimeScope',
  ] as const)
    if (value[field] !== null && typeof value[field] !== 'string')
      addError(errors, `${path}.${field}`, 'must be a string or null', 'type');
  for (const field of [
    'basal',
    'maximum',
    'ec50',
    'hillCoefficient',
    'foldActivation',
    'ec50OriginalValue',
  ] as const)
    if (value[field] !== null && (typeof value[field] !== 'number' || !Number.isFinite(value[field])))
      addError(errors, `${path}.${field}`, 'must be a finite number or null', 'type');
  for (const field of [
    'approximateValue',
    'fixedWeightCandidate',
    'normalizedDemoOnly',
    'numericalExecutionAllowed',
    'statusOverride',
  ] as const)
    if (typeof value[field] !== 'boolean')
      addError(errors, `${path}.${field}`, 'must be boolean', 'type');
  strings(value.fitConstraints, `${path}.fitConstraints`, errors, false);
  strings(value.verificationBasis, `${path}.verificationBasis`, errors, false);
  if (value.workingRange !== null) validateRange(value.workingRange, `${path}.workingRange`, errors);
  if (value.reportedModelParameters !== null && value.reportedModelParameters !== undefined) {
    if (!record(value.reportedModelParameters))
      addError(errors, `${path}.reportedModelParameters`, 'must be an object or null', 'type');
    else
      for (const [key, parameter] of Object.entries(value.reportedModelParameters))
        if (!finite(parameter))
          addError(errors, `${path}.reportedModelParameters.${key}`, 'must be finite', 'number');
  }
}

function validateRecordProvenance(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!Array.isArray(value)) return addError(errors, path, 'must be an array', 'type');
  value.forEach((item, itemIndex) => {
    const itemPath = `${path}[${itemIndex}]`;
    if (!record(item)) return addError(errors, itemPath, 'must be an object', 'type');
    refs(item.sourceIds, `${itemPath}.sourceIds`, index.sources, errors, true);
    if (item.parameterContextId !== null)
      nullableRef(item.parameterContextId, `${itemPath}.parameterContextId`, index.contexts, errors);
    if (!nonEmpty(item.statement))
      addError(errors, `${itemPath}.statement`, 'must be non-empty', 'required');
    if (typeof item.isDemo !== 'boolean')
      addError(errors, `${itemPath}.isDemo`, 'must be boolean', 'type');
    for (const field of ['evidenceLocation', 'reconstructionStatus', 'revisionStatus', 'lastVerifiedAt'] as const)
      if (item[field] !== undefined && typeof item[field] !== 'string')
        addError(errors, `${itemPath}.${field}`, 'must be a string', 'type');
    if (item.verificationBasis !== undefined)
      strings(item.verificationBasis, `${itemPath}.verificationBasis`, errors, false);
  });
}

function validateSourceProvenance(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  if (!nonEmpty(value.sourceId)) addError(errors, `${path}.sourceId`, 'must be non-empty', 'required');
  else if (!index.sources.has(value.sourceId))
    addError(errors, `${path}.sourceId`, `unknown reference ${value.sourceId}`, 'reference');
  for (const field of ['sourceType', 'authors', 'title', 'verificationStatus', 'revisionStatus', 'lastVerifiedAt', 'changeReason'] as const)
    if (!nonEmpty(value[field]))
      addError(errors, `${path}.${field}`, 'must be non-empty', 'required');
  for (const field of ['mappedSignalIds', 'mappedComponentIds', 'mappedRelationIds', 'mappedRejectedIds', 'verificationBasis'] as const)
    if (value[field] !== undefined) strings(value[field], `${path}.${field}`, errors, false);
}

function validateObservedPair(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  nullableRef(value.senderComponentId, `${path}.senderComponentId`, index.components, errors);
  nullableRef(value.receiverComponentId, `${path}.receiverComponentId`, index.components, errors);
  nullableRef(value.assayContextId, `${path}.assayContextId`, index.contexts, errors);
  for (const field of [
    'observedEffect',
    'responseClass',
    'evidenceLocation',
    'reconstructionStatus',
    'revisionStatus',
    'lastVerifiedAt',
  ] as const)
    if (!nonEmpty(value[field]))
      addError(errors, `${path}.${field}`, 'must be non-empty', 'required');
  if (value.changeReason !== null && typeof value.changeReason !== 'string')
    addError(errors, `${path}.changeReason`, 'must be a string or null', 'type');
  if (value.supernatantFractionOrCondition !== null && typeof value.supernatantFractionOrCondition !== 'string')
    addError(errors, `${path}.supernatantFractionOrCondition`, 'must be a string or null', 'type');
  if (value.intermediateSignalMeasured !== false)
    addError(errors, `${path}.intermediateSignalMeasured`, 'must be false', 'pair-decomposition');
  if (value.decompositionProhibited !== true)
    addError(errors, `${path}.decompositionProhibited`, 'must be true', 'pair-decomposition');
  refs(value.sourceIds, `${path}.sourceIds`, index.sources, errors, true);
  strings(value.notes, `${path}.notes`, errors, false);
  strings(value.verificationBasis, `${path}.verificationBasis`, errors, false);
  if (value.assayDetails !== null && !record(value.assayDetails))
    addError(errors, `${path}.assayDetails`, 'must be an object or null', 'type');
}

function validateComponent(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    [
      'id',
      'label',
      'nodeType',
      'componentType',
      'mechanismLabels',
      'inputSignalIds',
      'outputSignalIds',
      'parameterContextIds',
      'sourceIds',
      'evidence',
      'admission',
      'notes',
      'legacy',
    ],
    path,
    errors,
  );
  id(value.id, `${path}.id`, errors);
  if (!nonEmpty(value.label)) addError(errors, `${path}.label`, 'must be non-empty', 'required');
  if (!oneOf(value.nodeType, NODE_TYPES))
    addError(errors, `${path}.nodeType`, 'invalid node type', 'enum');
  if (
    value.componentType !== undefined &&
    !oneOf(value.componentType, ['receiver', 'sender'] as const)
  )
    addError(errors, `${path}.componentType`, 'invalid component type', 'enum');
  strings(value.mechanismLabels, `${path}.mechanismLabels`, errors, true);
  refs(value.inputSignalIds, `${path}.inputSignalIds`, index.signals, errors, false);
  refs(value.outputSignalIds, `${path}.outputSignalIds`, index.signals, errors, false);
  refs(value.parameterContextIds, `${path}.parameterContextIds`, index.contexts, errors, false);
  refs(value.sourceIds, `${path}.sourceIds`, index.sources, errors, true);
  validateEvidence(value.evidence, `${path}.evidence`, index, errors);
  validateAdmission(value.admission, `${path}.admission`, index, errors);
  strings(value.notes, `${path}.notes`, errors, false);
  if (
    record(value.admission) &&
    typeof value.admission.parameterContextId === 'string' &&
    Array.isArray(value.parameterContextIds) &&
    !value.parameterContextIds.includes(value.admission.parameterContextId)
  )
    addError(
      errors,
      `${path}.admission.parameterContextId`,
      'must be listed in parameterContextIds',
      'reference',
    );
  if (value.legacy !== undefined) validateLegacy(value.legacy, `${path}.legacy`, errors);
}

function validateEvidence(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    ['grade', 'reviewStatus', 'scope', 'directInEColi', 'sourceIds', 'notes', 'boundaryNotes'],
    path,
    errors,
  );
  if (!oneOf(value.grade, EVIDENCE_GRADES))
    addError(errors, `${path}.grade`, 'invalid evidence grade', 'enum');
  if (!oneOf(value.reviewStatus, REVIEW_STATUSES))
    addError(errors, `${path}.reviewStatus`, 'invalid review status', 'enum');
  if (!nonEmpty(value.scope)) addError(errors, `${path}.scope`, 'must be non-empty', 'required');
  if (typeof value.directInEColi !== 'boolean')
    addError(errors, `${path}.directInEColi`, 'must be boolean', 'type');
  refs(value.sourceIds, `${path}.sourceIds`, index.sources, errors, true);
  strings(value.notes, `${path}.notes`, errors, false);
  strings(value.boundaryNotes, `${path}.boundaryNotes`, errors, false);
}

function validateLegacy(value: unknown, path: string, errors: CatalogV2ValidationError[]): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    ['catalogId', 'catalogVersion', 'entryId', 'category', 'entityType', 'signalEvidence'],
    path,
    errors,
  );
  for (const field of ['catalogId', 'catalogVersion', 'entryId', 'category', 'entityType'] as const)
    if (!nonEmpty(value[field]))
      addError(errors, `${path}.${field}`, 'must be non-empty', 'required');
  strings(value.signalEvidence, `${path}.signalEvidence`, errors, false);
}

function validateResponse(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    [
      'id',
      'receiverComponentId',
      'inputSignalId',
      'outputSignalId',
      'parameterContextId',
      'sourceIds',
      'admission',
      'fixedWeightCandidate',
      'demoBoundary',
      'sourceResponse',
      'sourceProvenance',
      'notes',
    ],
    path,
    errors,
  );
  id(value.id, `${path}.id`, errors);
  ref(value.receiverComponentId, `${path}.receiverComponentId`, index.components, errors);
  ref(value.inputSignalId, `${path}.inputSignalId`, index.signals, errors);
  nullableRef(value.outputSignalId, `${path}.outputSignalId`, index.signals, errors);
  ref(value.parameterContextId, `${path}.parameterContextId`, index.contexts, errors);
  refs(value.sourceIds, `${path}.sourceIds`, index.sources, errors, true);
  relationAdmission(
    value.admission,
    value.parameterContextId,
    value.demoBoundary,
    `${path}`,
    index,
    errors,
  );
  if (value.fixedWeightCandidate !== undefined)
    fixed(value.fixedWeightCandidate, `${path}.fixedWeightCandidate`, index, errors);
  requireCandidate(
    value.admission,
    value.fixedWeightCandidate,
    `${path}.fixedWeightCandidate`,
    errors,
  );
  boundary(value.demoBoundary, `${path}.demoBoundary`, errors);
  if (value.sourceResponse !== undefined)
    validateSourceResponse(value.sourceResponse, `${path}.sourceResponse`, errors);
  if (value.sourceProvenance !== undefined)
    validateRecordProvenance(value.sourceProvenance, `${path}.sourceProvenance`, index, errors);
  strings(value.notes, `${path}.notes`, errors, false);
}

function validateSender(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    [
      'id',
      'senderComponentId',
      'inputSignalId',
      'outputSignalId',
      'outputOrdinal',
      'parameterContextId',
      'sourceIds',
      'admission',
      'fixedWeightCandidate',
      'demoBoundary',
      'notes',
    ],
    path,
    errors,
  );
  id(value.id, `${path}.id`, errors);
  ref(value.senderComponentId, `${path}.senderComponentId`, index.components, errors);
  if (value.inputSignalId !== null)
    ref(value.inputSignalId, `${path}.inputSignalId`, index.signals, errors);
  ref(value.outputSignalId, `${path}.outputSignalId`, index.signals, errors);
  if (
    !finite(value.outputOrdinal) ||
    !Number.isInteger(value.outputOrdinal) ||
    value.outputOrdinal < 1
  )
    addError(errors, `${path}.outputOrdinal`, 'must be a positive integer', 'number');
  ref(value.parameterContextId, `${path}.parameterContextId`, index.contexts, errors);
  refs(value.sourceIds, `${path}.sourceIds`, index.sources, errors, true);
  relationAdmission(
    value.admission,
    value.parameterContextId,
    value.demoBoundary,
    `${path}`,
    index,
    errors,
  );
  if (value.fixedWeightCandidate !== undefined)
    fixed(value.fixedWeightCandidate, `${path}.fixedWeightCandidate`, index, errors);
  requireCandidate(
    value.admission,
    value.fixedWeightCandidate,
    `${path}.fixedWeightCandidate`,
    errors,
  );
  boundary(value.demoBoundary, `${path}.demoBoundary`, errors);
  strings(value.notes, `${path}.notes`, errors, false);
}

function validatePair(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    [
      'id',
      'receiverResponseId',
      'senderOutputId',
      'receiverComponentId',
      'senderComponentId',
      'inputSignalId',
      'outputSignalId',
      'parameterContextId',
      'sourceIds',
      'admission',
      'fixedWeightCandidate',
      'demoBoundary',
      'observed',
      'sourceProvenance',
      'notes',
    ],
    path,
    errors,
  );
  id(value.id, `${path}.id`, errors);
  nullableRef(value.receiverResponseId, `${path}.receiverResponseId`, index.responses, errors);
  nullableRef(value.senderOutputId, `${path}.senderOutputId`, index.senders, errors);
  nullableRef(value.receiverComponentId, `${path}.receiverComponentId`, index.components, errors);
  nullableRef(value.senderComponentId, `${path}.senderComponentId`, index.components, errors);
  nullableRef(value.inputSignalId, `${path}.inputSignalId`, index.signals, errors);
  nullableRef(value.outputSignalId, `${path}.outputSignalId`, index.signals, errors);
  nullableRef(value.parameterContextId, `${path}.parameterContextId`, index.contexts, errors);
  refs(value.sourceIds, `${path}.sourceIds`, index.sources, errors, true);
  relationAdmission(
    value.admission,
    value.parameterContextId,
    value.demoBoundary,
    `${path}`,
    index,
    errors,
  );
  if (value.fixedWeightCandidate !== undefined)
    fixed(value.fixedWeightCandidate, `${path}.fixedWeightCandidate`, index, errors);
  requireCandidate(
    value.admission,
    value.fixedWeightCandidate,
    `${path}.fixedWeightCandidate`,
    errors,
  );
  boundary(value.demoBoundary, `${path}.demoBoundary`, errors);
  if (value.observed !== undefined)
    validateObservedPair(value.observed, `${path}.observed`, index, errors);
  if (value.sourceProvenance !== undefined)
    validateRecordProvenance(value.sourceProvenance, `${path}.sourceProvenance`, index, errors);
  strings(value.notes, `${path}.notes`, errors, false);
}

function validateRelation(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    [
      'id',
      'receiverComponentId',
      'senderComponentId',
      'receiverResponseId',
      'senderOutputId',
      'kind',
      'parameterContextId',
      'sourceIds',
      'admission',
      'demoBoundary',
      'subjectComponentId',
      'targetComponentId',
      'inputSignalId',
      'relationType',
      'direction',
      'qualitativeOutcome',
      'numericUseAllowed',
      'sourceProvenance',
      'notes',
    ],
    path,
    errors,
  );
  id(value.id, `${path}.id`, errors);
  nullableRef(value.receiverComponentId, `${path}.receiverComponentId`, index.components, errors);
  nullableRef(value.senderComponentId, `${path}.senderComponentId`, index.components, errors);
  if (value.receiverResponseId !== null)
    ref(value.receiverResponseId, `${path}.receiverResponseId`, index.responses, errors);
  if (value.senderOutputId !== null)
    ref(value.senderOutputId, `${path}.senderOutputId`, index.senders, errors);
  if (value.subjectComponentId !== undefined)
    nullableRef(value.subjectComponentId, `${path}.subjectComponentId`, index.components, errors);
  if (value.targetComponentId !== undefined)
    nullableRef(value.targetComponentId, `${path}.targetComponentId`, index.components, errors);
  if (value.inputSignalId !== undefined)
    nullableRef(value.inputSignalId, `${path}.inputSignalId`, index.signals, errors);
  for (const field of ['relationType', 'direction', 'qualitativeOutcome'] as const)
    if (value[field] !== undefined && typeof value[field] !== 'string')
      addError(errors, `${path}.${field}`, 'must be a string', 'type');
  if (value.numericUseAllowed !== undefined && value.numericUseAllowed !== false)
    addError(errors, `${path}.numericUseAllowed`, 'must be false', 'compatibility');
  if (!oneOf(value.kind, COMPATIBILITY_KINDS))
    addError(errors, `${path}.kind`, 'invalid compatibility kind', 'enum');
  if (value.kind === 'no-response' && value.receiverResponseId !== null)
    addError(
      errors,
      `${path}.receiverResponseId`,
      'no-response requires null receiverResponseId',
      'compatibility',
    );
  if (
    value.kind === 'no-response' &&
    record(value.admission) &&
    value.admission.status === 'runtime-quantitative'
  )
    addError(
      errors,
      `${path}.admission.status`,
      'no-response cannot be runtime-quantitative',
      'compatibility',
    );
  ref(value.parameterContextId, `${path}.parameterContextId`, index.contexts, errors);
  refs(value.sourceIds, `${path}.sourceIds`, index.sources, errors, true);
  relationAdmission(
    value.admission,
    value.parameterContextId,
    value.demoBoundary,
    `${path}`,
    index,
    errors,
  );
  boundary(value.demoBoundary, `${path}.demoBoundary`, errors);
  if (value.sourceProvenance !== undefined)
    validateRecordProvenance(value.sourceProvenance, `${path}.sourceProvenance`, index, errors);
  strings(value.notes, `${path}.notes`, errors, false);
}

function relationAdmission(
  admission: unknown,
  contextId: unknown,
  demo: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  validateAdmission(admission, `${path}.admission`, index, errors);
  if (record(admission) && admission.parameterContextId !== contextId)
    addError(
      errors,
      `${path}.admission.parameterContextId`,
      'must match relation context',
      'reference',
    );
  if (
    record(admission) &&
    record(admission.demoBoundary) &&
    record(demo) &&
    admission.demoBoundary.isDemo !== demo.isDemo
  )
    addError(errors, `${path}.demoBoundary.isDemo`, 'must match admission boundary', 'boundary');
}

function validateAdmission(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    [
      'status',
      'simulationReady',
      'constructionReady',
      'parameterSourceIds',
      'parameterContextId',
      'demoBoundary',
      'rationale',
    ],
    path,
    errors,
  );
  if (!isCatalogV2AdmissionStatus(value.status))
    addError(errors, `${path}.status`, 'invalid admission status', 'enum');
  if (typeof value.simulationReady !== 'boolean')
    addError(errors, `${path}.simulationReady`, 'must be boolean', 'type');
  if (typeof value.constructionReady !== 'boolean')
    addError(errors, `${path}.constructionReady`, 'must be boolean', 'type');
  refs(value.parameterSourceIds, `${path}.parameterSourceIds`, index.sources, errors, false);
  if (value.parameterContextId !== null)
    ref(value.parameterContextId, `${path}.parameterContextId`, index.contexts, errors);
  boundary(value.demoBoundary, `${path}.demoBoundary`, errors);
  if (!nonEmpty(value.rationale))
    addError(errors, `${path}.rationale`, 'must be non-empty', 'required');
  if (value.status === 'runtime-quantitative') {
    if (!Array.isArray(value.parameterSourceIds) || value.parameterSourceIds.length === 0)
      addError(
        errors,
        `${path}.parameterSourceIds`,
        'quantitative admission requires explicit sources',
        'quantitative-boundary',
      );
    if (value.parameterContextId === null)
      addError(
        errors,
        `${path}.parameterContextId`,
        'quantitative admission requires context',
        'quantitative-boundary',
      );
    if (record(value.demoBoundary) && value.demoBoundary.isDemo === true)
      addError(
        errors,
        `${path}.demoBoundary.isDemo`,
        'quantitative admission cannot be demo',
        'quantitative-boundary',
      );
    if (Array.isArray(value.parameterSourceIds))
      value.parameterSourceIds.forEach((sourceId, i) => {
        if (typeof sourceId === 'string' && index.sourceRecords.get(sourceId)?.isDemo === true)
          addError(
            errors,
            `${path}.parameterSourceIds[${i}]`,
            'quantitative admission cannot use demo source',
            'quantitative-boundary',
          );
      });
    if (typeof value.parameterContextId === 'string') {
      const context = index.contextRecords.get(value.parameterContextId);
      if (record(context?.demoBoundary) && context.demoBoundary.isDemo === true)
        addError(
          errors,
          `${path}.parameterContextId`,
          'quantitative admission cannot use demo context',
          'quantitative-boundary',
        );
    }
    if (value.simulationReady === false && value.constructionReady === false)
      addError(
        errors,
        path,
        'quantitative admission must be runtime-ready',
        'quantitative-boundary',
      );
  }
  if (
    value.status === 'runtime-demo' &&
    record(value.demoBoundary) &&
    value.demoBoundary.isDemo !== true
  )
    addError(
      errors,
      `${path}.demoBoundary.isDemo`,
      'runtime-demo requires demo boundary',
      'demo-boundary',
    );
  if (
    value.status === 'rejected' &&
    (value.simulationReady === true || value.constructionReady === true)
  )
    addError(errors, path, 'rejected records cannot be ready', 'admission');
}

function requireCandidate(
  admission: unknown,
  candidate: unknown,
  path: string,
  errors: CatalogV2ValidationError[],
): void {
  if (record(admission) && admission.status === 'runtime-quantitative' && candidate === undefined)
    addError(
      errors,
      path,
      'quantitative relation requires fixedWeightCandidate',
      'quantitative-boundary',
    );
}

function fixed(
  value: unknown,
  path: string,
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(
    value,
    ['kind', 'weight', 'workingRange', 'method', 'rmse', 'rSquared', 'provenance'],
    path,
    errors,
  );
  if (value.kind !== 'fixed-weight')
    addError(errors, `${path}.kind`, 'must equal fixed-weight', 'enum');
  if (!finite(value.weight) || value.weight < 0 || value.weight > 1)
    addError(errors, `${path}.weight`, 'must be finite and within [0, 1]', 'range');
  validateRange(value.workingRange, `${path}.workingRange`, errors);
  if (!nonEmpty(value.method)) addError(errors, `${path}.method`, 'must be non-empty', 'required');
  if (!finite(value.rmse) || value.rmse < 0)
    addError(errors, `${path}.rmse`, 'must be finite and non-negative', 'range');
  if (!finite(value.rSquared) || value.rSquared < 0 || value.rSquared > 1)
    addError(errors, `${path}.rSquared`, 'must be finite and within [0, 1]', 'range');
  if (!record(value.provenance))
    return addError(errors, `${path}.provenance`, 'must be an object', 'type');
  keys(
    value.provenance,
    ['sourceIds', 'parameterContextId', 'statement', 'isDemo'],
    `${path}.provenance`,
    errors,
  );
  refs(value.provenance.sourceIds, `${path}.provenance.sourceIds`, index.sources, errors, true);
  ref(
    value.provenance.parameterContextId,
    `${path}.provenance.parameterContextId`,
    index.contexts,
    errors,
  );
  if (!nonEmpty(value.provenance.statement))
    addError(errors, `${path}.provenance.statement`, 'must be non-empty', 'required');
  if (typeof value.provenance.isDemo !== 'boolean')
    addError(errors, `${path}.provenance.isDemo`, 'must be boolean', 'type');
  if (value.provenance.isDemo === false && Array.isArray(value.provenance.sourceIds))
    value.provenance.sourceIds.forEach((sourceId, i) => {
      if (typeof sourceId === 'string' && index.sourceRecords.get(sourceId)?.isDemo === true)
        addError(
          errors,
          `${path}.provenance.sourceIds[${i}]`,
          'non-demo provenance cannot use demo source',
          'quantitative-boundary',
        );
    });
}

function validateRange(value: unknown, path: string, errors: CatalogV2ValidationError[]): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(value, ['min', 'max', 'unit'], path, errors);
  if (!finite(value.min)) addError(errors, `${path}.min`, 'must be finite', 'number');
  if (!finite(value.max)) addError(errors, `${path}.max`, 'must be finite', 'number');
  if (finite(value.min) && finite(value.max) && value.min > value.max)
    addError(errors, path, 'min must not exceed max', 'range');
  if (value.unit !== undefined && typeof value.unit !== 'string')
    addError(errors, `${path}.unit`, 'must be a string', 'type');
}

function boundary(value: unknown, path: string, errors: CatalogV2ValidationError[]): void {
  if (!record(value)) return addError(errors, path, 'must be an object', 'type');
  keys(value, ['isDemo', 'description', 'permittedUses', 'forbiddenUses'], path, errors);
  if (typeof value.isDemo !== 'boolean')
    addError(errors, `${path}.isDemo`, 'must be boolean', 'type');
  if (!nonEmpty(value.description))
    addError(errors, `${path}.description`, 'must be non-empty', 'required');
  strings(value.permittedUses, `${path}.permittedUses`, errors, false);
  strings(value.forbiddenUses, `${path}.forbiddenUses`, errors, false);
}

function crossCheck(
  components: unknown[],
  responses: unknown[],
  senders: unknown[],
  pairs: unknown[],
  relations: unknown[],
  index: Index,
  errors: CatalogV2ValidationError[],
): void {
  for (const [i, item] of responses.entries()) {
    if (!record(item)) continue;
    const component =
      typeof item.receiverComponentId === 'string'
        ? index.componentRecords.get(item.receiverComponentId)
        : undefined;
    if (
      component &&
      Array.isArray(component.inputSignalIds) &&
      !component.inputSignalIds.includes(item.inputSignalId)
    )
      addError(
        errors,
        `catalog.receiverResponses[${i}].inputSignalId`,
        'not listed on receiver component',
        'cross-reference',
      );
    if (
      component &&
      Array.isArray(component.outputSignalIds) &&
      item.outputSignalId !== null &&
      !component.outputSignalIds.includes(item.outputSignalId)
    )
      addError(
        errors,
        `catalog.receiverResponses[${i}].outputSignalId`,
        'not listed on receiver component',
        'cross-reference',
      );
  }
  for (const [i, item] of senders.entries()) {
    if (!record(item)) continue;
    const component =
      typeof item.senderComponentId === 'string'
        ? index.componentRecords.get(item.senderComponentId)
        : undefined;
    if (
      component &&
      Array.isArray(component.outputSignalIds) &&
      !component.outputSignalIds.includes(item.outputSignalId)
    )
      addError(
        errors,
        `catalog.senderOutputs[${i}].outputSignalId`,
        'not listed on sender component',
        'cross-reference',
      );
    if (
      item.inputSignalId !== null &&
      component &&
      Array.isArray(component.inputSignalIds) &&
      !component.inputSignalIds.includes(item.inputSignalId)
    )
      addError(
        errors,
        `catalog.senderOutputs[${i}].inputSignalId`,
        'not listed on sender component',
        'cross-reference',
      );
  }
  for (const [i, item] of pairs.entries()) {
    if (!record(item)) continue;
    const response =
      typeof item.receiverResponseId === 'string'
        ? index.responseRecords.get(item.receiverResponseId)
        : undefined;
    const sender =
      typeof item.senderOutputId === 'string'
        ? index.senderRecords.get(item.senderOutputId)
        : undefined;
    if (
      response &&
      (response.receiverComponentId !== item.receiverComponentId ||
        response.inputSignalId !== item.inputSignalId ||
        response.parameterContextId !== item.parameterContextId)
    )
      addError(
        errors,
        `catalog.effectivePairs[${i}]`,
        'does not agree with receiver response',
        'cross-reference',
      );
    if (
      sender &&
      (sender.senderComponentId !== item.senderComponentId ||
        sender.outputSignalId !== item.outputSignalId ||
        sender.parameterContextId !== item.parameterContextId)
    )
      addError(
        errors,
        `catalog.effectivePairs[${i}]`,
        'does not agree with sender output',
        'cross-reference',
      );
  }
  for (const [i, item] of relations.entries()) {
    if (!record(item)) continue;
    if (item.receiverResponseId !== null) {
      const response =
        typeof item.receiverResponseId === 'string'
          ? index.responseRecords.get(item.receiverResponseId)
          : undefined;
      if (
        response &&
        item.receiverComponentId !== null &&
        response.receiverComponentId !== item.receiverComponentId
      )
        addError(
          errors,
          `catalog.compatibilityRelations[${i}].receiverComponentId`,
          'does not agree with receiver response',
          'cross-reference',
        );
    }
    if (item.senderOutputId !== null) {
      const sender =
        typeof item.senderOutputId === 'string'
          ? index.senderRecords.get(item.senderOutputId)
          : undefined;
      if (
        sender &&
        item.senderComponentId !== null &&
        sender.senderComponentId !== item.senderComponentId
      )
        addError(
          errors,
          `catalog.compatibilityRelations[${i}].senderComponentId`,
          'does not agree with sender output',
          'cross-reference',
        );
    }
  }
  void components;
}

function checkCounts(
  manifest: unknown,
  values: Record<string, unknown[]>,
  errors: CatalogV2ValidationError[],
): void {
  if (!record(manifest) || !record(manifest.counts)) return;
  for (const [name, list] of Object.entries(values))
    if (manifest.counts[name] !== list.length)
      addError(
        errors,
        `catalog.releaseManifest.counts.${name}`,
        `must equal ${list.length}`,
        'count',
      );
}

function makeIndex(values: {
  signals: unknown[];
  components: unknown[];
  contexts: unknown[];
  responses: unknown[];
  senders: unknown[];
  sources: unknown[];
}): Index {
  const toSet = (items: unknown[]) =>
    new Set(
      items.flatMap((item) => (record(item) && typeof item.id === 'string' ? [item.id] : [])),
    );
  const records = (items: unknown[]) =>
    new Map(
      items.flatMap((item) =>
        record(item) && typeof item.id === 'string' ? [[item.id, item] as const] : [],
      ),
    );
  return {
    signals: toSet(values.signals),
    components: toSet(values.components),
    contexts: toSet(values.contexts),
    responses: toSet(values.responses),
    senders: toSet(values.senders),
    sources: toSet(values.sources),
    sourceRecords: records(values.sources),
    contextRecords: records(values.contexts),
    componentRecords: records(values.components),
    responseRecords: records(values.responses),
    senderRecords: records(values.senders),
  };
}
function array(value: unknown, path: string, errors: CatalogV2ValidationError[]): unknown[] {
  if (!Array.isArray(value)) {
    addError(errors, path, 'must be an array', 'type');
    return [];
  }
  return value;
}
function duplicateIds(items: unknown[], path: string, errors: CatalogV2ValidationError[]): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (!record(item) || typeof item.id !== 'string') return;
    if (seen.has(item.id))
      addError(errors, `${path}[${i}].id`, `duplicate id ${item.id}`, 'duplicate');
    seen.add(item.id);
  });
}
function refs(
  value: unknown,
  path: string,
  known: Set<string>,
  errors: CatalogV2ValidationError[],
  required: boolean,
): void {
  if (!Array.isArray(value)) return addError(errors, path, 'must be an array', 'type');
  if (required && value.length === 0)
    addError(errors, path, 'must contain at least one reference', 'required');
  value.forEach((item, i) => {
    if (!nonEmpty(item)) addError(errors, `${path}[${i}]`, 'must be a non-empty string', 'type');
    else if (!known.has(item))
      addError(errors, `${path}[${i}]`, `unknown reference ${item}`, 'reference');
  });
}
function ref(
  value: unknown,
  path: string,
  known: Set<string>,
  errors: CatalogV2ValidationError[],
): void {
  if (!nonEmpty(value)) addError(errors, path, 'must be a non-empty string', 'type');
  else if (!known.has(value)) addError(errors, path, `unknown reference ${value}`, 'reference');
}

function nullableRef(
  value: unknown,
  path: string,
  known: Set<string>,
  errors: CatalogV2ValidationError[],
): void {
  if (value === null) return;
  ref(value, path, known, errors);
}
function id(value: unknown, path: string, errors: CatalogV2ValidationError[]): void {
  if (!nonEmpty(value)) addError(errors, path, 'must be a non-empty string', 'required');
}
function strings(
  value: unknown,
  path: string,
  errors: CatalogV2ValidationError[],
  required: boolean,
): void {
  if (!Array.isArray(value)) return addError(errors, path, 'must be an array', 'type');
  if (required && value.length === 0)
    addError(errors, path, 'must contain at least one item', 'required');
  value.forEach((item, i) => {
    if (!nonEmpty(item)) addError(errors, `${path}[${i}]`, 'must be a non-empty string', 'type');
  });
}
function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: CatalogV2ValidationError[],
): void {
  const set = new Set(allowed);
  Object.keys(value).forEach((key) => {
    if (!set.has(key))
      addError(errors, `${path}.${key}`, 'is not allowed by schema', 'unknown-key');
  });
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function nonNegativeInteger(value: unknown): value is number {
  return finite(value) && Number.isInteger(value) && value >= 0;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}
function addError(
  errors: CatalogV2ValidationError[],
  path: string,
  message: string,
  code: string,
): void {
  errors.push({ path, message, code });
}
function fail(path: string, message: string, code: string): CatalogV2ValidationResult<never> {
  return { ok: false, errors: [{ path, message, code }] };
}
