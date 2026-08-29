import type { BfnProject } from './types';

const LEGACY_UNCERTAINTY_METHODS = new Set([
  'parameter_interval_envelope',
  'posterior_samples',
  'bootstrap',
  'covariance',
]);
const CURRENT_UNCERTAINTY_METHODS = new Set([
  ...LEGACY_UNCERTAINTY_METHODS,
  'none',
  'not_recorded',
]);
const CONTEXT_DOCUMENTATION_STATES = new Set(['recorded', 'partial', 'not_recorded']);
const PROVENANCE_KINDS = new Set(['dataset', 'publication', 'repository_record', 'user_note']);
const IMPLEMENTATION_MATURITIES = new Set([
  'not_recorded',
  'designed',
  'candidate',
  'reported',
  'validated',
]);
const MODULE_IMPLEMENTATION_STATES = new Set(['unspecified', ...IMPLEMENTATION_MATURITIES]);
const SCIENTIFIC_CONTEXT_PLACEHOLDERS = new Set(['unknown', 'n/a', 'not recorded', 'unspecified']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isScientificContextString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !SCIENTIFIC_CONTEXT_PLACEHOLDERS.has(value.trim().toLowerCase())
  );
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function hasUniqueIds(values: readonly Record<string, unknown>[]): boolean {
  const ids = values.map((value) => value.id);
  return ids.every(isNonEmptyString) && new Set(ids).size === ids.length;
}

function hasValidOptionalDisplayName(value: unknown): boolean {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, 'displayName')) return true;
  const displayName = value.displayName;
  return (
    displayName === undefined ||
    (isRecord(displayName) && isNonEmptyString(displayName.en) && isNonEmptyString(displayName.zh))
  );
}

function hasValidPortDisplayNames(value: unknown): boolean {
  if (!isRecord(value) || !hasValidOptionalDisplayName(value)) return false;
  if (value.kind === 'input_source') return hasValidOptionalDisplayName(value.outputPort);
  if (value.kind === 'output_monitor') return hasValidOptionalDisplayName(value.inputPort);
  if (value.kind !== 'functional_module') return false;
  return (
    Array.isArray(value.inputPorts) &&
    value.inputPorts.every(hasValidOptionalDisplayName) &&
    Array.isArray(value.outputPorts) &&
    value.outputPorts.every(hasValidOptionalDisplayName)
  );
}

function hasProjectEnvelope(
  value: unknown,
  version: '2.0' | '2.1',
): value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    value.schema !== 'BFN-IR' ||
    value.schemaVersion !== version ||
    !isNonEmptyString(value.id) ||
    typeof value.labelKey !== 'string' ||
    !isRecord(value.network) ||
    !isRecord(value.registry) ||
    !isRecord(value.analysis) ||
    !isNonEmptyString(value.createdAt) ||
    !isNonEmptyString(value.updatedAt) ||
    typeof value.isDemo !== 'boolean'
  ) {
    return false;
  }
  return (
    (value.network.mode === 'static' || value.network.mode === 'dynamic') &&
    Array.isArray(value.network.inputSources) &&
    value.network.inputSources.every(hasValidPortDisplayNames) &&
    Array.isArray(value.network.modules) &&
    value.network.modules.every(hasValidPortDisplayNames) &&
    Array.isArray(value.network.outputMonitors) &&
    value.network.outputMonitors.every(hasValidPortDisplayNames) &&
    Array.isArray(value.network.edges) &&
    Array.isArray(value.registry.contexts) &&
    Array.isArray(value.registry.validityDomains) &&
    Array.isArray(value.registry.datasets) &&
    Array.isArray(value.registry.implementations) &&
    Array.isArray(value.registry.calibrationMaps)
  );
}

function isLegacyContext(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.labelKey) &&
    typeof value.host === 'string' &&
    typeof value.strain === 'string' &&
    typeof value.medium === 'string' &&
    typeof value.temperatureCelsius === 'number' &&
    Number.isFinite(value.temperatureCelsius) &&
    isNullableFiniteNumber(value.ph) &&
    typeof value.oxygenation === 'string' &&
    typeof value.growthPhase === 'string' &&
    typeof value.plasmidBackbone === 'string' &&
    typeof value.copyNumberRegime === 'string' &&
    typeof value.inductionProtocol === 'string' &&
    isNullableFiniteNumber(value.measurementTimeHours) &&
    typeof value.batch === 'string' &&
    typeof value.isDemo === 'boolean'
  );
}

function isCurrentContext(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.labelKey) ||
    typeof value.documentationState !== 'string' ||
    !CONTEXT_DOCUMENTATION_STATES.has(value.documentationState) ||
    !isNullableString(value.host) ||
    !isNullableString(value.strain) ||
    !isNullableString(value.medium) ||
    !isNullableFiniteNumber(value.temperatureCelsius) ||
    !isNullableFiniteNumber(value.ph) ||
    !isNullableString(value.oxygenation) ||
    !isNullableString(value.growthPhase) ||
    !isNullableString(value.plasmidBackbone) ||
    !isNullableString(value.copyNumberRegime) ||
    !isNullableString(value.inductionProtocol) ||
    !isNullableFiniteNumber(value.measurementTimeHours) ||
    !isNullableString(value.batch) ||
    typeof value.isDemo !== 'boolean'
  ) {
    return false;
  }

  const scientificFacts = [
    value.host,
    value.strain,
    value.medium,
    value.temperatureCelsius,
    value.ph,
    value.oxygenation,
    value.growthPhase,
    value.plasmidBackbone,
    value.copyNumberRegime,
    value.inductionProtocol,
    value.measurementTimeHours,
    value.batch,
  ];
  const scientificStringFacts = [
    value.host,
    value.strain,
    value.medium,
    value.oxygenation,
    value.growthPhase,
    value.plasmidBackbone,
    value.copyNumberRegime,
    value.inductionProtocol,
    value.batch,
  ];
  const comparableFacts = [value.host, value.strain, value.medium, value.temperatureCelsius];
  if (value.documentationState === 'not_recorded') {
    return scientificFacts.every((fact) => fact === null);
  }
  if (value.documentationState === 'partial') {
    return (
      scientificFacts.some((fact) => fact !== null) &&
      comparableFacts.some((fact) => fact === null) &&
      scientificStringFacts.every((fact) => fact === null || isScientificContextString(fact))
    );
  }
  return comparableFacts.every((fact) => fact !== null);
}

function hasValidModel(value: unknown, current: boolean): boolean {
  if (
    !isRecord(value) ||
    (value.mode !== 'static' && value.mode !== 'dynamic') ||
    !isStringArray(value.sourceDatasetIds) ||
    typeof value.uncertaintyMethod !== 'string' ||
    !(current ? CURRENT_UNCERTAINTY_METHODS : LEGACY_UNCERTAINTY_METHODS).has(
      value.uncertaintyMethod,
    )
  ) {
    return false;
  }
  if (current) {
    return (
      (value.contextId === null || isNonEmptyString(value.contextId)) &&
      isStringArray(value.provenanceIds)
    );
  }
  return isNonEmptyString(value.contextId);
}

function hasValidAuthoring(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.origin === 'user_defined' &&
    isNonEmptyString(value.name) &&
    isNullableString(value.description)
  );
}

function hasValidModule(value: unknown, current: boolean): boolean {
  if (
    !isRecord(value) ||
    !hasValidPortDisplayNames(value) ||
    !Array.isArray(value.modelVariants) ||
    !value.modelVariants.every((model) => hasValidModel(model, current)) ||
    !isStringArray(value.implementationIds)
  ) {
    return false;
  }
  if (!current) return true;
  if (
    typeof value.implementationState !== 'string' ||
    !MODULE_IMPLEMENTATION_STATES.has(value.implementationState) ||
    (value.implementationState === 'unspecified') !== (value.implementationIds.length === 0)
  ) {
    return false;
  }
  return (
    !Object.prototype.hasOwnProperty.call(value, 'authoring') || hasValidAuthoring(value.authoring)
  );
}

function isEntityDefinition(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    value.origin === 'user_defined' &&
    isNonEmptyString(value.displayName) &&
    isNullableString(value.description)
  );
}

function isProvenanceRecord(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.kind === 'string' &&
    PROVENANCE_KINDS.has(value.kind) &&
    isNonEmptyString(value.reference)
  );
}

function isImplementation(value: unknown, current: boolean): boolean {
  if (!isRecord(value)) return false;
  if (!current) return true;
  return (
    typeof value.maturity === 'string' &&
    IMPLEMENTATION_MATURITIES.has(value.maturity) &&
    isStringArray(value.provenanceIds)
  );
}

function hasValidValidityDomain(value: unknown, current: boolean): boolean {
  if (!isRecord(value) || !Array.isArray(value.inputRanges)) return false;
  return current
    ? value.contextId === null || isNonEmptyString(value.contextId)
    : isNonEmptyString(value.contextId);
}

function referencesKnownProvenance(project: Record<string, unknown>): boolean {
  const registry = project.registry;
  const network = project.network;
  if (!isRecord(registry) || !isRecord(network) || !Array.isArray(registry.provenanceRecords)) {
    return false;
  }
  const known = new Set(
    registry.provenanceRecords
      .filter(isProvenanceRecord)
      .map((record) => record.id)
      .filter(isNonEmptyString),
  );
  const referenceLists: unknown[] = [];
  if (Array.isArray(network.modules)) {
    for (const module of network.modules) {
      if (!isRecord(module) || !Array.isArray(module.modelVariants)) return false;
      for (const model of module.modelVariants) {
        if (!isRecord(model)) return false;
        referenceLists.push(model.provenanceIds);
      }
    }
  }
  if (Array.isArray(registry.implementations)) {
    for (const implementation of registry.implementations) {
      if (!isRecord(implementation)) return false;
      referenceLists.push(implementation.provenanceIds);
    }
  }
  return referenceLists.every(
    (references) => isStringArray(references) && references.every((id) => known.has(id)),
  );
}

export function isBfnProjectV20(value: unknown): boolean {
  if (!hasProjectEnvelope(value, '2.0')) return false;
  const network = value.network;
  const registry = value.registry;
  return (
    isRecord(network) &&
    isRecord(registry) &&
    Array.isArray(network.modules) &&
    network.modules.every((module) => hasValidModule(module, false)) &&
    Array.isArray(registry.contexts) &&
    registry.contexts.every(isLegacyContext) &&
    Array.isArray(registry.validityDomains) &&
    registry.validityDomains.every((domain) => hasValidValidityDomain(domain, false))
  );
}

export function isBfnProjectV21(value: unknown): value is BfnProject {
  if (!hasProjectEnvelope(value, '2.1')) return false;
  const network = value.network;
  const registry = value.registry;
  if (
    !isRecord(network) ||
    !isRecord(registry) ||
    !Array.isArray(network.modules) ||
    !network.modules.every((module) => hasValidModule(module, true)) ||
    !Array.isArray(registry.entities) ||
    !registry.entities.every(isEntityDefinition) ||
    !hasUniqueIds(registry.entities) ||
    !Array.isArray(registry.provenanceRecords) ||
    !registry.provenanceRecords.every(isProvenanceRecord) ||
    !hasUniqueIds(registry.provenanceRecords) ||
    !Array.isArray(registry.contexts) ||
    !registry.contexts.every(isCurrentContext) ||
    !Array.isArray(registry.validityDomains) ||
    !registry.validityDomains.every((domain) => hasValidValidityDomain(domain, true)) ||
    !Array.isArray(registry.implementations) ||
    !registry.implementations.every((implementation) => isImplementation(implementation, true))
  ) {
    return false;
  }
  return referencesKnownProvenance(value);
}

export function upgradeBfnProjectToCurrent(value: unknown): BfnProject {
  if (isBfnProjectV21(value)) return structuredClone(value);
  if (!isBfnProjectV20(value)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');

  const migrated: unknown = structuredClone(value);
  if (!isRecord(migrated) || !isRecord(migrated.registry) || !isRecord(migrated.network)) {
    throw new Error('BFN_IMPORT_SCHEMA_INVALID');
  }
  migrated.schemaVersion = '2.1';
  migrated.registry.entities = [];
  migrated.registry.provenanceRecords = [];

  for (const context of migrated.registry.contexts as Record<string, unknown>[]) {
    context.documentationState = 'recorded';
  }
  for (const implementation of migrated.registry.implementations as Record<string, unknown>[]) {
    implementation.maturity = 'not_recorded';
    implementation.provenanceIds = [];
  }
  for (const module of migrated.network.modules as Record<string, unknown>[]) {
    const implementationIds = module.implementationIds as unknown[];
    delete module.authoring;
    module.implementationState = implementationIds.length === 0 ? 'unspecified' : 'not_recorded';
    for (const model of module.modelVariants as Record<string, unknown>[]) {
      model.provenanceIds = [];
    }
  }

  if (!isBfnProjectV21(migrated)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');
  return migrated;
}
