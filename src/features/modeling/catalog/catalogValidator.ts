import { isCatalogValue, isUnknownValue } from './catalogTypes';
import type {
  CatalogCategory,
  CatalogEntry,
  CatalogFile,
  CatalogManifest,
  CatalogNodeKind,
  CatalogRole,
  CatalogValue,
  EffectDirection,
  EvidenceGrade,
  ModelingCompatibility,
  QuantitativeForbiddenMapping,
  ReviewStatus,
  SequenceStatus,
} from './catalogTypes';

export const CATALOG_ID = 'evidence-backed-components' as const;
export const CATALOG_VERSION = 'evidence-backed-components@2026-08-02.1' as const;
export const EXPECTED_ENTRY_IDS = {
  'qs-system': ['qs.cin', 'qs.tra', 'qs.rhl', 'qs.esa', 'qs.aub'],
  'pollutant-sensor': [
    'sensor.cadr',
    'sensor.chrb',
    'sensor.merr',
    'sensor.cuer',
    'sensor.narx-narl',
    'sensor.nahr',
    'sensor.xyls',
    'sensor.dmpr',
    'sensor.phnr',
  ],
  'control-output': [
    'control.mutalik-bcd-library',
    'control.anderson-j231-library',
    'control.phlf',
    'control.srpr',
    'control.bm3r1',
    'control.qacr',
    'control.amtr',
    'control.star',
    'control.toehold-switch',
    'control.ssra-asv-aav-family',
    'control.riboj',
    'output.sfgfp',
    'output.mneongreen',
  ],
} as const satisfies Record<CatalogCategory, readonly string[]>;

const CATEGORIES: readonly CatalogCategory[] = ['qs-system', 'pollutant-sensor', 'control-output'];
const EXPECTED_COUNTS: Record<CatalogCategory | 'total', number> = {
  'qs-system': 5,
  'pollutant-sensor': 9,
  'control-output': 13,
  total: 27,
};
const EXPECTED_FILE_KEYS = ['qsSystems', 'pollutantSensors', 'controlOutputParts'] as const;
const EXPECTED_FILE_NAMES: Record<(typeof EXPECTED_FILE_KEYS)[number], string> = {
  qsSystems: 'qsSystems.json',
  pollutantSensors: 'pollutantSensors.json',
  controlOutputParts: 'controlOutputParts.json',
};
const NODE_KINDS: readonly CatalogNodeKind[] = [
  'sensor',
  'signal',
  'response',
  'memory',
  'reporter',
];
const ROLES: readonly CatalogRole[] = [
  'quorum-sensing',
  'pollutant-sensor',
  'regulator',
  'promoter',
  'output',
  'control',
  'translation',
  'degradation',
  'insulator',
  'rna-regulator',
];
const ENTITY_TYPES = ['part', 'device', 'system', 'library', 'family'] as const;
const EVIDENCE_GRADES: readonly EvidenceGrade[] = ['A', 'B', 'C', 'D', 'unknown'];
const REVIEW_STATUSES: readonly ReviewStatus[] = ['passed', 'needs-review', 'withdrawn'];
const SEQUENCE_STATUSES: readonly SequenceStatus[] = [
  'available-public-accession',
  'partial-public',
  'not-reported',
  'restricted',
  'unknown',
];
const MODELING_COMPATIBILITIES: readonly ModelingCompatibility[] = [
  'qualitative-only',
  'parameterizable-after-calibration',
  'normalized-demo-only',
  'not-compatible',
  'unknown',
];
const DIRECTIONS: readonly EffectDirection[] = ['positive', 'negative', 'mixed', 'unknown'];
const FORBIDDEN_MAPPINGS: readonly QuantitativeForbiddenMapping[] = [
  'edge-weight',
  'km',
  'hill',
  'gain',
  'threshold',
];
const SOURCE_TYPES = ['primary-paper', 'database', 'registry', 'supplement'] as const;
const SEQUENCE_KINDS = ['GenBank', 'NCBI', 'Registry', 'Addgene'] as const;
const SEQUENCE_TYPES = ['part', 'promoter', 'regulator', 'system', 'library', 'family'] as const;
const QUANTITATIVE_BOUNDARY_APPLICATION = 'display-only' as const;

export interface CatalogValidationError {
  path: string;
  message: string;
  code: string;
}
export type CatalogValidationResult<T> =
  { ok: true; value: T } | { ok: false; errors: CatalogValidationError[] };

export function validateCatalogManifest(value: unknown): CatalogValidationResult<CatalogManifest> {
  const errors: CatalogValidationError[] = [];
  if (!isRecord(value)) return failure('manifest', 'must be an object', 'type');
  if (value.schemaVersion !== 'evidence-backed-components.schema.v1')
    addError(
      errors,
      'manifest.schemaVersion',
      'must equal evidence-backed-components.schema.v1',
      'version',
    );
  if (value.catalogId !== CATALOG_ID)
    addError(errors, 'manifest.catalogId', `must equal ${CATALOG_ID}`, 'catalog-id');
  if (value.catalogVersion !== CATALOG_VERSION)
    addError(errors, 'manifest.catalogVersion', `must equal ${CATALOG_VERSION}`, 'version');
  if (value.generatedAt !== '2026-08-02')
    addError(errors, 'manifest.generatedAt', 'must equal 2026-08-02', 'date');
  validateManifestFiles(value.files, errors);
  validateManifestCounts(value.counts, errors);
  if (errors.length > 0) return { ok: false, errors };
  if (!isCatalogManifestValue(value))
    return failure('manifest', 'validated value has an unexpected shape', 'internal');
  return { ok: true, value };
}

export function validateCatalogEntry(
  value: unknown,
  manifest: CatalogManifest,
): CatalogValidationResult<CatalogEntry> {
  const errors: CatalogValidationError[] = [];
  if (!isRecord(value)) return failure('entry', 'must be an object', 'type');
  validateEntryIdentity(value, manifest, errors);
  validateName(value.name, errors);
  validateCategoryAndRoles(value, errors);
  validateMechanism(value.mechanism, errors);
  validateContext(value.context, errors);
  validateEvidence(value.evidence, errors);
  const literatureIds = validateLiterature(value.literature, errors);
  validateSignals(value.signals, literatureIds, errors);
  validateObservations(value.quantitativeObservations, literatureIds, errors);
  validateSequence(value.sequence, value.entityType, literatureIds, errors);
  validateModeling(value.modeling, errors);
  validateCuration(value.curation, manifest, errors);
  validateCadR(value, errors);
  if (errors.length > 0) return { ok: false, errors };
  if (!isCatalogEntryValue(value))
    return failure('entry', 'validated value has an unexpected shape', 'internal');
  return { ok: true, value };
}

export function validateCatalogFile(
  value: unknown,
  category: CatalogCategory,
  manifest: CatalogManifest,
): CatalogValidationResult<CatalogFile> {
  const errors: CatalogValidationError[] = [];
  if (!isRecord(value)) return failure('file', 'must be an object', 'type');
  validateFileHeader(value, category, manifest, errors);
  if (!Array.isArray(value.entries))
    addError(errors, 'file.entries', 'must be an array', 'required');
  else {
    if (value.entries.length !== EXPECTED_COUNTS[category])
      addError(
        errors,
        'file.entries',
        `must contain exactly ${EXPECTED_COUNTS[category]} entries`,
        'count',
      );
    const seen = new Set<string>();
    for (const [index, entry] of value.entries.entries()) {
      const result = validateCatalogEntry(entry, manifest);
      if (!result.ok) appendErrors(errors, result.errors, `file.entries[${index}]`);
      else {
        if (result.value.category !== category)
          addError(
            errors,
            `file.entries[${index}].category`,
            'must match the file category',
            'cross-category',
          );
        if (seen.has(result.value.id))
          addError(errors, `file.entries[${index}].id`, 'duplicate ID in file', 'duplicate');
        seen.add(result.value.id);
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  if (!isCatalogFileValue(value))
    return failure('file', 'validated value has an unexpected shape', 'internal');
  return { ok: true, value };
}

export function validateCatalogBundle(value: unknown): CatalogValidationResult<{
  manifest: CatalogManifest;
  files: Record<CatalogCategory, CatalogFile>;
}> {
  const errors: CatalogValidationError[] = [];
  if (!isRecord(value)) return failure('bundle', 'must be an object', 'type');
  const manifestResult = validateCatalogManifest(value.manifest);
  if (!manifestResult.ok)
    return {
      ok: false,
      errors: manifestResult.errors.map((error) => ({ ...error, path: `bundle.${error.path}` })),
    };
  if (!isRecord(value.files))
    return failure('bundle.files', 'must be an object with three canonical files', 'type');
  for (const key of EXPECTED_FILE_KEYS)
    if (!(key in value.files)) addError(errors, `bundle.files.${key}`, 'is required', 'required');
  const files: Partial<Record<CatalogCategory, CatalogFile>> = {};
  const inputs: Array<[CatalogCategory, string]> = [
    ['qs-system', 'qsSystems'],
    ['pollutant-sensor', 'pollutantSensors'],
    ['control-output', 'controlOutputParts'],
  ];
  for (const [category, key] of inputs) {
    if (!(key in value.files)) continue;
    const result = validateCatalogFile(value.files[key], category, manifestResult.value);
    if (!result.ok) appendErrors(errors, result.errors, `bundle.files.${key}`);
    else files[category] = result.value;
  }
  validateBundleIds(files, errors);
  if (
    errors.length > 0 ||
    !files['qs-system'] ||
    !files['pollutant-sensor'] ||
    !files['control-output']
  )
    return {
      ok: false,
      errors:
        errors.length > 0
          ? errors
          : [
              {
                path: 'bundle.files',
                message: 'all canonical files are required',
                code: 'required',
              },
            ],
    };
  return {
    ok: true,
    value: {
      manifest: manifestResult.value,
      files: {
        'qs-system': files['qs-system'],
        'pollutant-sensor': files['pollutant-sensor'],
        'control-output': files['control-output'],
      },
    },
  };
}

function validateManifestFiles(value: unknown, errors: CatalogValidationError[]): void {
  if (!isRecord(value)) {
    addError(errors, 'manifest.files', 'must be an object', 'type');
    return;
  }
  for (const key of EXPECTED_FILE_KEYS)
    if (value[key] !== EXPECTED_FILE_NAMES[key])
      addError(
        errors,
        `manifest.files.${key}`,
        `must equal ${EXPECTED_FILE_NAMES[key]}`,
        'file-name',
      );
  for (const key of Object.keys(value))
    if (!EXPECTED_FILE_KEYS.some((expected) => expected === key))
      addError(errors, `manifest.files.${key}`, 'is not a canonical file mapping', 'file-name');
}

function validateManifestCounts(value: unknown, errors: CatalogValidationError[]): void {
  if (!isRecord(value)) {
    addError(errors, 'manifest.counts', 'must be an object', 'required');
    return;
  }
  for (const category of CATEGORIES)
    if (value[category] !== EXPECTED_COUNTS[category])
      addError(
        errors,
        `manifest.counts.${category}`,
        `must equal ${EXPECTED_COUNTS[category]}`,
        'count',
      );
  if (value.total !== EXPECTED_COUNTS.total)
    addError(errors, 'manifest.counts.total', 'must equal 27', 'count');
  for (const key of Object.keys(value))
    if (![...CATEGORIES, 'total'].some((expected) => expected === key))
      addError(errors, `manifest.counts.${key}`, 'is not a canonical count mapping', 'count');
}

function validateFileHeader(
  value: Record<string, unknown>,
  category: CatalogCategory,
  manifest: CatalogManifest,
  errors: CatalogValidationError[],
): void {
  if (value.schemaVersion !== manifest.schemaVersion)
    addError(errors, 'file.schemaVersion', 'must match manifest schemaVersion', 'version');
  if (value.catalogId !== manifest.catalogId)
    addError(errors, 'file.catalogId', 'must match manifest catalogId', 'catalog-id');
  if (value.catalogVersion !== manifest.catalogVersion)
    addError(errors, 'file.catalogVersion', 'must match manifest catalogVersion', 'version');
  if (value.category !== category)
    addError(errors, 'file.category', 'must match the canonical category argument', 'category');
}

function validateEntryIdentity(
  value: Record<string, unknown>,
  manifest: CatalogManifest,
  errors: CatalogValidationError[],
): void {
  const id = value.id;
  const category = value.category;
  if (!isNonEmptyString(id)) addError(errors, 'entry.id', 'must be a non-empty string', 'required');
  else {
    if (id !== id.toLowerCase() || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id))
      addError(errors, 'entry.id', 'must be lowercase stable ID', 'id-format');
    if (isCategory(category) && !EXPECTED_ENTRY_IDS[category].some((expected) => expected === id))
      addError(errors, 'entry.id', 'is not a fixed ID for its category', 'unknown-id');
  }
  if (value.catalogId !== manifest.catalogId || value.catalogId !== CATALOG_ID)
    addError(errors, 'entry.catalogId', 'must match manifest catalogId', 'catalog-id');
  if (value.catalogVersion !== manifest.catalogVersion || value.catalogVersion !== CATALOG_VERSION)
    addError(errors, 'entry.catalogVersion', 'must match manifest catalogVersion', 'version');
  if (!isEntityType(value.entityType))
    addError(errors, 'entry.entityType', 'must be a controlled entity type', 'entity-type');
}

function validateName(value: unknown, errors: CatalogValidationError[]): void {
  if (!isRecord(value)) {
    addError(errors, 'entry.name', 'must be an object', 'required');
    return;
  }
  if (!isNonEmptyString(value.zh))
    addError(errors, 'entry.name.zh', 'must be non-empty', 'required');
  if (!isNonEmptyString(value.en))
    addError(errors, 'entry.name.en', 'must be non-empty', 'required');
  if (!isStringArray(value.aliases))
    addError(errors, 'entry.name.aliases', 'must be string[]', 'type');
}

function validateCategoryAndRoles(
  value: Record<string, unknown>,
  errors: CatalogValidationError[],
): void {
  if (!isCategory(value.category))
    addError(errors, 'entry.category', 'must be controlled category', 'category');
  if (!Array.isArray(value.roles) || value.roles.length === 0)
    addError(errors, 'entry.roles', 'must be non-empty CatalogRole[]', 'required');
  else
    for (const [index, role] of value.roles.entries())
      if (!isRole(role)) addError(errors, `entry.roles[${index}]`, 'is not approved', 'role');
}

function validateMechanism(value: unknown, errors: CatalogValidationError[]): void {
  if (!isRecord(value)) {
    addError(errors, 'entry.mechanism', 'must be an object', 'required');
    return;
  }
  if (!isNonEmptyString(value.summary))
    addError(errors, 'entry.mechanism.summary', 'must be non-empty', 'required');
  if (!isStringArray(value.steps) || value.steps.length === 0)
    addError(errors, 'entry.mechanism.steps', 'must be non-empty string[]', 'required');
  if (!isStringArray(value.requiredPartners))
    addError(errors, 'entry.mechanism.requiredPartners', 'must be string[]', 'type');
}

function validateContext(value: unknown, errors: CatalogValidationError[]): void {
  if (!isRecord(value)) {
    addError(errors, 'entry.context', 'must be an object', 'required');
    return;
  }
  for (const key of [
    'host',
    'strain',
    'vector',
    'culture',
    'temperature',
    'induction',
    'growthPhase',
    'readout',
    'other',
  ] as const)
    if (!isCatalogString(value[key]))
      addError(errors, `entry.context.${key}`, 'must be CatalogValue<string>', 'context');
}

function validateEvidence(value: unknown, errors: CatalogValidationError[]): void {
  if (!isRecord(value)) {
    addError(errors, 'entry.evidence', 'must be an object', 'required');
    return;
  }
  if (!isEvidenceGrade(value.grade))
    addError(errors, 'entry.evidence.grade', 'must be controlled grade', 'grade');
  if (!isReviewStatus(value.reviewStatus))
    addError(
      errors,
      'entry.evidence.reviewStatus',
      'must be controlled review status',
      'review-status',
    );
  if (!isNonEmptyString(value.scope))
    addError(errors, 'entry.evidence.scope', 'must be non-empty', 'required');
  if (typeof value.directInEColi !== 'boolean')
    addError(errors, 'entry.evidence.directInEColi', 'must be boolean', 'type');
  if (!isStringArray(value.reviewNotes))
    addError(errors, 'entry.evidence.reviewNotes', 'must be string[]', 'type');
  if (!isStringArray(value.boundaryNotes))
    addError(errors, 'entry.evidence.boundaryNotes', 'must be string[]', 'type');
}

function validateLiterature(value: unknown, errors: CatalogValidationError[]): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, 'entry.literature', 'must contain at least one source', 'required');
    return ids;
  }
  for (const [index, item] of value.entries()) {
    const path = `entry.literature[${index}]`;
    if (!isRecord(item)) {
      addError(errors, path, 'must be object', 'type');
      continue;
    }
    if (!isNonEmptyString(item.id)) addError(errors, `${path}.id`, 'must be non-empty', 'required');
    else if (ids.has(item.id)) addError(errors, `${path}.id`, 'duplicate source ID', 'duplicate');
    else ids.add(item.id);
    if (!isNonEmptyString(item.title))
      addError(errors, `${path}.title`, 'must be non-empty', 'required');
    if (!isNonEmptyString(item.authors))
      addError(errors, `${path}.authors`, 'must be non-empty string', 'type');
    if (!isCatalogNumber(item.year))
      addError(errors, `${path}.year`, 'must be CatalogValue<number>', 'type');
    if (!isCatalogString(item.doi))
      addError(errors, `${path}.doi`, 'must be CatalogValue<string>', 'type');
    if (!isCatalogString(item.pmid))
      addError(errors, `${path}.pmid`, 'must be CatalogValue<string>', 'type');
    if (!isNonEmptyString(item.url))
      addError(errors, `${path}.url`, 'must be non-empty string', 'type');
    if (!isSourceType(item.sourceType))
      addError(errors, `${path}.sourceType`, 'must be controlled sourceType', 'source-type');
    if (!isStringArray(item.supports))
      addError(errors, `${path}.supports`, 'must be string[]', 'type');
  }
  return ids;
}

function validateSignals(
  value: unknown,
  literatureIds: Set<string>,
  errors: CatalogValidationError[],
): void {
  if (!isRecord(value)) {
    addError(errors, 'entry.signals', 'must be object', 'required');
    return;
  }
  for (const key of ['inputs', 'outputs'] as const) {
    const list = value[key];
    if (isUnknownValue(list)) continue;
    if (!Array.isArray(list)) {
      addError(errors, `entry.signals.${key}`, 'must be CatalogSignal[] or UnknownValue', 'type');
      continue;
    }
    if (list.length === 0) {
      addError(
        errors,
        `entry.signals.${key}`,
        'must contain at least one signal or use UnknownValue',
        'required',
      );
      continue;
    }
    for (const [index, signal] of list.entries())
      validateSignal(signal, `entry.signals.${key}[${index}]`, literatureIds, errors);
  }
}

function validateSignal(
  value: unknown,
  path: string,
  literatureIds: Set<string>,
  errors: CatalogValidationError[],
): void {
  if (!isRecord(value)) {
    addError(errors, path, 'must be object', 'type');
    return;
  }
  if (!isNonEmptyString(value.id)) addError(errors, `${path}.id`, 'must be non-empty', 'required');
  if (!isCatalogString(value.name))
    addError(errors, `${path}.name`, 'must be CatalogValue<string>', 'type');
  if (!isDirection(value.direction))
    addError(errors, `${path}.direction`, 'must be EffectDirection', 'direction');
  if (!isCatalogString(value.unit))
    addError(errors, `${path}.unit`, 'must be CatalogValue<string>', 'type');
  if (typeof value.directObservation !== 'boolean')
    addError(errors, `${path}.directObservation`, 'must be boolean', 'type');
  validateSourceRefs(value.sourceRefs, literatureIds, `${path}.sourceRefs`, errors);
}

function validateSourceRefs(
  value: unknown,
  literatureIds: Set<string>,
  path: string,
  errors: CatalogValidationError[],
): void {
  if (!isStringArray(value) || value.length === 0) {
    addError(errors, path, 'must contain at least one source reference', 'required');
    return;
  }
  for (const [index, sourceRef] of value.entries())
    if (!literatureIds.has(sourceRef))
      addError(errors, `${path}[${index}]`, 'must refer to literature in this entry', 'source-ref');
}

function validateObservations(
  value: unknown,
  literatureIds: Set<string>,
  errors: CatalogValidationError[],
): void {
  if (isUnknownValue(value)) return;
  if (!Array.isArray(value)) {
    addError(errors, 'entry.quantitativeObservations', 'must be array or UnknownValue', 'type');
    return;
  }
  if (value.length === 0) {
    addError(
      errors,
      'entry.quantitativeObservations',
      'must contain at least one observation or use UnknownValue',
      'required',
    );
    return;
  }
  for (const [index, item] of value.entries()) {
    const path = `entry.quantitativeObservations[${index}]`;
    if (!isRecord(item)) {
      addError(errors, path, 'must be object', 'type');
      continue;
    }
    if (!isNonEmptyString(item.metric))
      addError(errors, `${path}.metric`, 'must be non-empty', 'required');
    const numberValue = item.value;
    const unit = item.unit;
    if (!isCatalogNumber(numberValue))
      addError(errors, `${path}.value`, 'must be CatalogValue<number>', 'type');
    if (!isCatalogString(unit))
      addError(errors, `${path}.unit`, 'must be CatalogValue<string>', 'type');
    if (isCatalogKnown(numberValue) && !isCatalogKnown(unit))
      addError(errors, `${path}.unit`, 'known values require known unit', 'boundary');
    if (!isNonEmptyString(item.sourceRef))
      addError(errors, `${path}.sourceRef`, 'must be non-empty', 'required');
    else if (!literatureIds.has(item.sourceRef))
      addError(errors, `${path}.sourceRef`, 'must refer to literature in this entry', 'source-ref');
    validateObservationContext(item.context, path, errors);
    if (!isNonEmptyString(item.originalMeaning))
      addError(errors, `${path}.originalMeaning`, 'must be non-empty', 'required');
    if (!isNonEmptyString(item.transferability))
      addError(errors, `${path}.transferability`, 'must be non-empty', 'required');
    validateObservationBoundary(item.modelingBoundary, path, errors);
  }
}

function validateObservationContext(
  value: unknown,
  path: string,
  errors: CatalogValidationError[],
): void {
  if (!isRecord(value)) {
    addError(errors, `${path}.context`, 'must be object', 'required');
    return;
  }
  for (const key of ['host', 'strain', 'vector', 'culture'] as const)
    if (!isCatalogString(value[key]))
      addError(errors, `${path}.context.${key}`, 'must be CatalogValue<string>', 'context');
}

function validateObservationBoundary(
  value: unknown,
  path: string,
  errors: CatalogValidationError[],
): void {
  if (!isRecord(value)) {
    addError(errors, `${path}.modelingBoundary`, 'must be object', 'required');
    return;
  }
  if (value.application !== QUANTITATIVE_BOUNDARY_APPLICATION)
    addError(errors, `${path}.modelingBoundary.application`, 'must be display-only', 'boundary');
  validateForbiddenMappings(
    value.forbiddenMappings,
    `${path}.modelingBoundary.forbiddenMappings`,
    errors,
  );
}

function validateSequence(
  value: unknown,
  entityType: unknown,
  literatureIds: Set<string>,
  errors: CatalogValidationError[],
): void {
  if (!isRecord(value)) {
    addError(errors, 'entry.sequence', 'must be object', 'required');
    return;
  }
  if (!isSequenceStatus(value.status))
    addError(errors, 'entry.sequence.status', 'must be controlled status', 'sequence-status');
  const records = value.records;
  if (isUnknownValue(records)) {
    // Unknown sequence records are valid when the source does not report a sequence; CadR adds a stricter SI reason below.
  } else if (Array.isArray(records)) {
    if (records.length === 0)
      addError(
        errors,
        'entry.sequence.records',
        'must contain at least one record or use UnknownValue',
        'required',
      );
    for (const [index, record] of records.entries())
      validateSequenceRecord(record, `entry.sequence.records[${index}]`, literatureIds, errors);
    if (
      (value.status === 'available-public-accession' || value.status === 'partial-public') &&
      records.length === 0
    )
      addError(
        errors,
        'entry.sequence.records',
        'public sequence status requires non-empty records',
        'sequence-boundary',
      );
  } else {
    addError(errors, 'entry.sequence.records', 'must be SequenceRecord[] or UnknownValue', 'type');
  }
  if (typeof value.isCompleteSingleSequence !== 'boolean')
    addError(errors, 'entry.sequence.isCompleteSingleSequence', 'must be boolean', 'type');
  else if (
    (entityType === 'family' || entityType === 'library' || entityType === 'system') &&
    value.isCompleteSingleSequence
  )
    addError(
      errors,
      'entry.sequence.isCompleteSingleSequence',
      'family/library/system cannot claim one complete sequence',
      'sequence-boundary',
    );
  if (
    (value.status === 'available-public-accession' || value.status === 'partial-public') &&
    (isUnknownValue(records) || !Array.isArray(records) || records.length === 0)
  )
    addError(
      errors,
      'entry.sequence.records',
      'public sequence status requires a non-empty record array',
      'sequence-boundary',
    );
}

function validateSequenceRecord(
  value: unknown,
  path: string,
  literatureIds: Set<string>,
  errors: CatalogValidationError[],
): void {
  if (!isRecord(value)) {
    addError(errors, path, 'must be object', 'type');
    return;
  }
  if (!isSequenceKind(value.kind))
    addError(errors, `${path}.kind`, 'must be GenBank, NCBI, Registry, or Addgene', 'type');
  if (!isNonEmptyString(value.accession))
    addError(errors, `${path}.accession`, 'must be non-empty', 'required');
  if (!isSequenceType(value.sequenceType))
    addError(errors, `${path}.sequenceType`, 'must be a controlled sequence type', 'type');
  if (!isCatalogString(value.version))
    addError(errors, `${path}.version`, 'must be CatalogValue<string>', 'type');
  if (!['forward', 'reverse', 'unknown'].some((orientation) => orientation === value.orientation))
    addError(errors, `${path}.orientation`, 'must be controlled orientation', 'type');
  if (!isNonEmptyString(value.sourceRef))
    addError(errors, `${path}.sourceRef`, 'must be non-empty', 'required');
  else if (!literatureIds.has(value.sourceRef))
    addError(errors, `${path}.sourceRef`, 'must refer to literature in this entry', 'source-ref');
  if (typeof value.complete !== 'boolean')
    addError(errors, `${path}.complete`, 'must be boolean', 'type');
}

function validateModeling(value: unknown, errors: CatalogValidationError[]): void {
  if (!isRecord(value)) {
    addError(errors, 'entry.modeling', 'must be object', 'required');
    return;
  }
  if (!isModelingCompatibility(value.compatibility))
    addError(
      errors,
      'entry.modeling.compatibility',
      'must be controlled compatibility',
      'compatibility',
    );
  for (const key of [
    'allowedRepresentations',
    'signalMappings',
    'requiredMeasurements',
    'calibrationRequirements',
  ] as const)
    if (!isStringArray(value[key]))
      addError(errors, `entry.modeling.${key}`, 'must be string[]', 'type');
  validateForbiddenMappings(
    value.forbiddenAutomaticMappings,
    'entry.modeling.forbiddenAutomaticMappings',
    errors,
  );
  if (!Array.isArray(value.compatibleNodeKinds) || value.compatibleNodeKinds.length === 0)
    addError(
      errors,
      'entry.modeling.compatibleNodeKinds',
      'must be non-empty array',
      'compatibility',
    );
  else
    for (const [index, kind] of value.compatibleNodeKinds.entries())
      if (!isNodeKind(kind))
        addError(
          errors,
          `entry.modeling.compatibleNodeKinds[${index}]`,
          'is not a valid CatalogNodeKind',
          'compatibility',
        );
}

function validateCuration(
  value: unknown,
  manifest: CatalogManifest,
  errors: CatalogValidationError[],
): void {
  if (!isRecord(value)) {
    addError(errors, 'entry.curation', 'must be object', 'required');
    return;
  }
  if (value.catalogVersion !== manifest.catalogVersion)
    addError(errors, 'entry.curation.catalogVersion', 'must match manifest version', 'version');
  if (!isNonEmptyString(value.reviewedAt))
    addError(errors, 'entry.curation.reviewedAt', 'must be non-empty', 'required');
  if (!isStringArray(value.reviewedBy) || value.reviewedBy.length === 0)
    addError(errors, 'entry.curation.reviewedBy', 'must be non-empty string[]', 'required');
  if (!isStringArray(value.changeNotes))
    addError(errors, 'entry.curation.changeNotes', 'must be string[]', 'type');
  if (!isCatalogString(value.withdrawalReason))
    addError(errors, 'entry.curation.withdrawalReason', 'must be CatalogValue<string>', 'type');
  if (!isRecord(value.auditChecks) || typeof value.auditChecks.cadRSupplementChecked !== 'boolean')
    addError(
      errors,
      'entry.curation.auditChecks.cadRSupplementChecked',
      'must be boolean',
      'required',
    );
}

function validateCadR(value: Record<string, unknown>, errors: CatalogValidationError[]): void {
  if (value.id !== 'sensor.cadr') return;
  const curation = value.curation;
  if (
    !isRecord(curation) ||
    !isRecord(curation.auditChecks) ||
    curation.auditChecks.cadRSupplementChecked !== true
  )
    addError(
      errors,
      'entry.curation.auditChecks.cadRSupplementChecked',
      'CadR requires completed supplement audit',
      'cadr-audit',
    );
  const literature = value.literature;
  const supports = new Set<string>();
  let supplementFound = false;
  if (Array.isArray(literature))
    for (const item of literature) {
      if (!isRecord(item) || item.sourceType !== 'supplement') continue;
      supplementFound = true;
      if (isStringArray(item.supports)) for (const support of item.supports) supports.add(support);
    }
  if (!supplementFound)
    addError(errors, 'entry.literature', 'CadR requires a supplement source', 'cadr-audit');
  for (const required of ['homolog', 'promoter', 'operator'])
    if (!supports.has(required))
      addError(
        errors,
        'entry.literature',
        `CadR supplement must support ${required}`,
        'cadr-audit',
      );
  const sequence = value.sequence;
  if (
    isRecord(sequence) &&
    (sequence.status === 'unknown' || sequence.status === 'not-reported') &&
    (!isUnknownValue(sequence.records) || !isNonEmptyString(sequence.records.reason))
  )
    addError(
      errors,
      'entry.sequence.records.reason',
      'CadR sequence gap requires explicit SI/accession reason',
      'cadr-audit',
    );
  const candidateIdentity = normalizeCadRIdentityText([value.name, value.mechanism]);
  if (isCadRSubstituteIdentity(candidateIdentity))
    addError(
      errors,
      'entry.name',
      'CadR must not substitute Staphylococcus aureus CadC/PcadA',
      'cadr-substitution',
    );
}

function normalizeCadRIdentityText(value: unknown): string {
  const text: string[] = [];
  collectText(value, text);
  return text
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\bs\s+aureus\b/g, 'staphylococcus aureus')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectText(value: unknown, target: string[]): void {
  if (typeof value === 'string') {
    target.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, target);
    return;
  }
  if (isRecord(value)) for (const item of Object.values(value)) collectText(item, target);
}

function isCadRSubstituteIdentity(value: string): boolean {
  return (
    /\bstaphylococcus\s+aureus\b/.test(value) && (/\bcadc\b/.test(value) || /\bpcada\b/.test(value))
  );
}

function validateForbiddenMappings(
  value: unknown,
  path: string,
  errors: CatalogValidationError[],
): void {
  if (!Array.isArray(value)) {
    addError(errors, path, 'must contain all five forbidden mappings', 'boundary');
    return;
  }
  for (const mapping of FORBIDDEN_MAPPINGS)
    if (!value.some((candidate) => candidate === mapping))
      addError(errors, path, `missing forbidden mapping ${mapping}`, 'boundary');
  for (const [index, mapping] of value.entries())
    if (!isForbiddenMapping(mapping))
      addError(errors, `${path}[${index}]`, 'is not an approved forbidden mapping', 'boundary');
  if (
    new Set(value).size !== FORBIDDEN_MAPPINGS.length ||
    value.length !== FORBIDDEN_MAPPINGS.length
  )
    addError(errors, path, 'must contain exactly five unique forbidden mappings', 'boundary');
}

function validateBundleIds(
  files: Partial<Record<CatalogCategory, CatalogFile>>,
  errors: CatalogValidationError[],
): void {
  const seen = new Set<string>();
  for (const category of CATEGORIES) {
    const entries = files[category]?.entries ?? [];
    const expected = EXPECTED_ENTRY_IDS[category];
    for (const entry of entries) {
      if (seen.has(entry.id))
        addError(errors, 'bundle.files', `duplicate entry ID ${entry.id}`, 'duplicate');
      seen.add(entry.id);
      if (!expected.some((id) => id === entry.id))
        addError(
          errors,
          `bundle.files.${category}`,
          `non-fixed entry ID ${entry.id}`,
          'unknown-id',
        );
    }
    for (const id of expected)
      if (!entries.some((entry) => entry.id === id))
        addError(errors, `bundle.files.${category}`, `missing fixed entry ID ${id}`, 'missing');
  }
  if (seen.size !== EXPECTED_COUNTS.total)
    addError(errors, 'bundle.files', 'must contain exactly 27 unique entries', 'count');
}

function isCatalogManifestValue(value: unknown): value is CatalogManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 'evidence-backed-components.schema.v1' ||
    value.catalogId !== CATALOG_ID ||
    value.catalogVersion !== CATALOG_VERSION ||
    value.generatedAt !== '2026-08-02'
  )
    return false;
  const files = value.files;
  const counts = value.counts;
  return (
    isRecord(files) &&
    files.qsSystems === 'qsSystems.json' &&
    files.pollutantSensors === 'pollutantSensors.json' &&
    files.controlOutputParts === 'controlOutputParts.json' &&
    Object.keys(files).length === EXPECTED_FILE_KEYS.length &&
    isRecord(counts) &&
    counts['qs-system'] === 5 &&
    counts['pollutant-sensor'] === 9 &&
    counts['control-output'] === 13 &&
    counts.total === 27 &&
    Object.keys(counts).length === 4
  );
}

function isCatalogFileValue(value: unknown): value is CatalogFile {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.schemaVersion) ||
    !isNonEmptyString(value.catalogId) ||
    !isNonEmptyString(value.catalogVersion) ||
    !isCategory(value.category) ||
    !Array.isArray(value.entries)
  )
    return false;
  return value.entries.every((entry) => isCatalogEntryValue(entry));
}

function isCatalogEntryValue(value: unknown): value is CatalogEntry {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.catalogId) &&
    isNonEmptyString(value.catalogVersion) &&
    isEntityType(value.entityType) &&
    isCatalogNameValue(value.name) &&
    isCategory(value.category) &&
    isRoleArray(value.roles) &&
    isCatalogMechanismValue(value.mechanism) &&
    isCatalogSignalsValue(value.signals) &&
    isCatalogContextValue(value.context) &&
    isCatalogEvidenceValue(value.evidence) &&
    isLiteratureArray(value.literature) &&
    (isUnknownValue(value.quantitativeObservations) ||
      isQuantitativeObservationArray(value.quantitativeObservations)) &&
    isCatalogSequenceValue(value.sequence) &&
    isCatalogModelingValue(value.modeling) &&
    isCatalogCurationValue(value.curation)
  );
}

function isCatalogNameValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.zh) &&
    isNonEmptyString(value.en) &&
    isStringArray(value.aliases)
  );
}

function isCatalogMechanismValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.summary) &&
    isStringArray(value.steps) &&
    isStringArray(value.requiredPartners)
  );
}

function isCatalogSignalsValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isCatalogSignalList(value.inputs) && isCatalogSignalList(value.outputs);
}

function isCatalogSignalList(value: unknown): boolean {
  return (
    isUnknownValue(value) ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every((signal) => isCatalogSignalValue(signal)))
  );
}

function isCatalogSignalValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isCatalogString(value.name) &&
    isDirection(value.direction) &&
    isCatalogString(value.unit) &&
    typeof value.directObservation === 'boolean' &&
    isStringArray(value.sourceRefs)
  );
}

function isCatalogContextValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [
    'host',
    'strain',
    'vector',
    'culture',
    'temperature',
    'induction',
    'growthPhase',
    'readout',
    'other',
  ].every((key) => isCatalogString(value[key]));
}

function isCatalogEvidenceValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    isEvidenceGrade(value.grade) &&
    isReviewStatus(value.reviewStatus) &&
    isNonEmptyString(value.scope) &&
    typeof value.directInEColi === 'boolean' &&
    isStringArray(value.reviewNotes) &&
    isStringArray(value.boundaryNotes)
  );
}

function isLiteratureArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isCatalogLiteratureValue(item))
  );
}

function isCatalogLiteratureValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.authors) &&
    isCatalogNumber(value.year) &&
    isCatalogString(value.doi) &&
    isCatalogString(value.pmid) &&
    isNonEmptyString(value.url) &&
    isSourceType(value.sourceType) &&
    isStringArray(value.supports)
  );
}

function isQuantitativeObservationArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isQuantitativeObservationValue(item))
  );
}

function isQuantitativeObservationValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.metric) &&
    isCatalogNumber(value.value) &&
    isCatalogString(value.unit) &&
    isNonEmptyString(value.sourceRef) &&
    isQuantitativeContextValue(value.context) &&
    isNonEmptyString(value.originalMeaning) &&
    isNonEmptyString(value.transferability) &&
    isQuantitativeBoundaryValue(value.modelingBoundary)
  );
}

function isQuantitativeContextValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['host', 'strain', 'vector', 'culture'].every((key) => isCatalogString(value[key]));
}

function isQuantitativeBoundaryValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.application === QUANTITATIVE_BOUNDARY_APPLICATION &&
    isForbiddenMappingArray(value.forbiddenMappings)
  );
}

function isForbiddenMappingArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === FORBIDDEN_MAPPINGS.length &&
    new Set(value).size === FORBIDDEN_MAPPINGS.length &&
    value.every((mapping) => isForbiddenMapping(mapping))
  );
}

function isCatalogSequenceValue(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isSequenceStatus(value.status) ||
    typeof value.isCompleteSingleSequence !== 'boolean'
  )
    return false;
  return (
    isUnknownValue(value.records) ||
    (Array.isArray(value.records) &&
      value.records.length > 0 &&
      value.records.every((record) => isSequenceRecordValue(record)))
  );
}

function isSequenceRecordValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    isSequenceKind(value.kind) &&
    isNonEmptyString(value.accession) &&
    isSequenceType(value.sequenceType) &&
    isCatalogString(value.version) &&
    ['forward', 'reverse', 'unknown'].some((orientation) => orientation === value.orientation) &&
    isNonEmptyString(value.sourceRef) &&
    typeof value.complete === 'boolean'
  );
}

function isCatalogModelingValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    isModelingCompatibility(value.compatibility) &&
    isStringArray(value.allowedRepresentations) &&
    isStringArray(value.signalMappings) &&
    isNodeKindArray(value.compatibleNodeKinds) &&
    isForbiddenMappingArray(value.forbiddenAutomaticMappings) &&
    isStringArray(value.requiredMeasurements) &&
    isStringArray(value.calibrationRequirements)
  );
}

function isNodeKindArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((kind) => isNodeKind(kind));
}

function isCatalogCurationValue(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.catalogVersion) ||
    !isNonEmptyString(value.reviewedAt) ||
    !isStringArray(value.reviewedBy) ||
    value.reviewedBy.length === 0 ||
    !isStringArray(value.changeNotes) ||
    !isCatalogString(value.withdrawalReason)
  )
    return false;
  return (
    isRecord(value.auditChecks) && typeof value.auditChecks.cadRSupplementChecked === 'boolean'
  );
}

function isRoleArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((role) => isRole(role));
}

function isCatalogKnown(value: unknown): value is { state: 'known'; value: unknown } {
  return isRecord(value) && value.state === 'known' && 'value' in value;
}

function isCatalogString(value: unknown): value is CatalogValue<string> {
  return isCatalogValue(value) && (value.state === 'unknown' || isNonEmptyString(value.value));
}

function isCatalogNumber(value: unknown): value is CatalogValue<number> {
  return (
    isCatalogValue(value) &&
    (value.state === 'unknown' || (typeof value.value === 'number' && Number.isFinite(value.value)))
  );
}

function isCategory(value: unknown): value is CatalogCategory {
  return typeof value === 'string' && CATEGORIES.some((category) => category === value);
}

function isEntityType(value: unknown): value is CatalogEntry['entityType'] {
  return typeof value === 'string' && ENTITY_TYPES.some((entityType) => entityType === value);
}

function isRole(value: unknown): value is CatalogRole {
  return typeof value === 'string' && ROLES.some((role) => role === value);
}

function isEvidenceGrade(value: unknown): value is EvidenceGrade {
  return typeof value === 'string' && EVIDENCE_GRADES.some((grade) => grade === value);
}

function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && REVIEW_STATUSES.some((status) => status === value);
}

function isSequenceStatus(value: unknown): value is SequenceStatus {
  return typeof value === 'string' && SEQUENCE_STATUSES.some((status) => status === value);
}

function isModelingCompatibility(value: unknown): value is ModelingCompatibility {
  return (
    typeof value === 'string' &&
    MODELING_COMPATIBILITIES.some((compatibility) => compatibility === value)
  );
}

function isDirection(value: unknown): value is EffectDirection {
  return typeof value === 'string' && DIRECTIONS.some((direction) => direction === value);
}

function isNodeKind(value: unknown): value is CatalogNodeKind {
  return typeof value === 'string' && NODE_KINDS.some((kind) => kind === value);
}

function isForbiddenMapping(value: unknown): value is QuantitativeForbiddenMapping {
  return typeof value === 'string' && FORBIDDEN_MAPPINGS.some((mapping) => mapping === value);
}

function isSourceType(value: unknown): boolean {
  return typeof value === 'string' && SOURCE_TYPES.some((sourceType) => sourceType === value);
}

function isSequenceKind(value: unknown): boolean {
  return typeof value === 'string' && SEQUENCE_KINDS.some((kind) => kind === value);
}

function isSequenceType(value: unknown): boolean {
  return typeof value === 'string' && SEQUENCE_TYPES.some((sequenceType) => sequenceType === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === Object.keys(value).length &&
    value.every((item) => isNonEmptyString(item))
  );
}

function addError(
  errors: CatalogValidationError[],
  path: string,
  message: string,
  code: string,
): void {
  errors.push({ path, message, code });
}

function appendErrors(
  errors: CatalogValidationError[],
  source: CatalogValidationError[],
  prefix: string,
): void {
  for (const error of source) {
    const nestedPath = stripContainerPrefix(error.path);
    errors.push({ ...error, path: nestedPath.length > 0 ? `${prefix}.${nestedPath}` : prefix });
  }
}

function stripContainerPrefix(path: string): string {
  if (path === 'entry' || path === 'file') return '';
  if (path.startsWith('entry.')) return path.slice('entry.'.length);
  if (path.startsWith('file.')) return path.slice('file.'.length);
  return path;
}

function failure(path: string, message: string, code: string): CatalogValidationResult<never> {
  return { ok: false, errors: [{ path, message, code }] };
}
