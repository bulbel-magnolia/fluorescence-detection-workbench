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
const STATIC_MODEL_FAMILIES = new Set([
  'hill_activation',
  'hill_repression',
  'linear_transfer',
  'identity',
  'independent_inputs',
]);
const EVIDENCE_GRADES = new Set([
  'measured_single_context',
  'measured_multiple_contexts',
  'externally_validated',
  'fitted_from_published_data',
  'mechanistic_model_only',
  'data_driven_prediction',
  'independent_assumption',
  'proposed_unbuilt_design',
]);

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

function hasValidPortAuthoring(value: unknown): boolean {
  return isRecord(value) && value.origin === 'user_defined' && isNonEmptyString(value.name);
}

function hasValidPort(value: unknown, allowAuthoring: boolean): boolean {
  if (!isRecord(value) || !hasValidOptionalDisplayName(value)) return false;
  const hasAuthoring = Object.prototype.hasOwnProperty.call(value, 'authoring');
  return allowAuthoring ? !hasAuthoring || hasValidPortAuthoring(value.authoring) : !hasAuthoring;
}

function hasValidNodePortMetadata(value: unknown, allowPortAuthoring: boolean): boolean {
  if (!isRecord(value) || !hasValidOptionalDisplayName(value)) return false;
  if (value.kind === 'input_source') return hasValidPort(value.outputPort, allowPortAuthoring);
  if (value.kind === 'output_monitor') return hasValidPort(value.inputPort, allowPortAuthoring);
  if (value.kind !== 'functional_module') return false;
  return (
    Array.isArray(value.inputPorts) &&
    value.inputPorts.every((port) => hasValidPort(port, allowPortAuthoring)) &&
    Array.isArray(value.outputPorts) &&
    value.outputPorts.every((port) => hasValidPort(port, allowPortAuthoring))
  );
}

function hasProjectEnvelope(
  value: unknown,
  version: '2.0' | '2.1' | '2.2' | '2.3',
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
  const allowPortAuthoring = version === '2.2' || version === '2.3';
  return (
    (value.network.mode === 'static' || value.network.mode === 'dynamic') &&
    Array.isArray(value.network.inputSources) &&
    value.network.inputSources.every((node) =>
      hasValidNodePortMetadata(node, allowPortAuthoring),
    ) &&
    Array.isArray(value.network.modules) &&
    value.network.modules.every((node) => hasValidNodePortMetadata(node, allowPortAuthoring)) &&
    Array.isArray(value.network.outputMonitors) &&
    value.network.outputMonitors.every((node) =>
      hasValidNodePortMetadata(node, allowPortAuthoring),
    ) &&
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

function hasValidParameterEstimate(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.value !== 'number' ||
    !Number.isFinite(value.value) ||
    !isNonEmptyString(value.unit)
  ) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'interval95')) return true;
  const interval = value.interval95;
  return (
    interval === undefined ||
    (Array.isArray(interval) &&
      interval.length === 2 &&
      interval.every((bound) => typeof bound === 'number' && Number.isFinite(bound)))
  );
}

function hasValidOptionalFiniteNumber(value: Record<string, unknown>, key: string): boolean {
  return (
    !Object.prototype.hasOwnProperty.call(value, key) ||
    value[key] === undefined ||
    (typeof value[key] === 'number' && Number.isFinite(value[key]))
  );
}

function hasValidStaticResponse(value: unknown): boolean {
  if (!isRecord(value) || typeof value.family !== 'string') return false;
  switch (value.family) {
    case 'hill_activation':
    case 'hill_repression':
      return (
        isNonEmptyString(value.inputPortId) &&
        hasValidParameterEstimate(value.ymin) &&
        hasValidParameterEstimate(value.ymax) &&
        hasValidParameterEstimate(value.k) &&
        hasValidParameterEstimate(value.n)
      );
    case 'linear_transfer':
      return (
        isNonEmptyString(value.inputPortId) &&
        hasValidParameterEstimate(value.scale) &&
        hasValidParameterEstimate(value.intercept) &&
        hasValidOptionalFiniteNumber(value, 'outputMinimum') &&
        hasValidOptionalFiniteNumber(value, 'outputMaximum')
      );
    case 'identity':
      return isNonEmptyString(value.inputPortId);
    case 'independent_inputs':
      return (
        Array.isArray(value.terms) &&
        value.terms.every(
          (term) =>
            isRecord(term) &&
            isNonEmptyString(term.inputPortId) &&
            (term.direction === 'activation' || term.direction === 'repression') &&
            hasValidParameterEstimate(term.k) &&
            hasValidParameterEstimate(term.n) &&
            hasValidParameterEstimate(term.contribution),
        ) &&
        hasValidParameterEstimate(value.basal) &&
        hasValidParameterEstimate(value.outputMaximum) &&
        (value.aggregation === 'bounded_sum' || value.aggregation === 'multiplicative') &&
        value.interactionAssumption === 'independent_unverified'
      );
    default:
      return false;
  }
}

function hasValidV23Model(value: Record<string, unknown>): boolean {
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.version) ||
    !isNonEmptyString(value.validityDomainId) ||
    typeof value.evidenceGrade !== 'string' ||
    !EVIDENCE_GRADES.has(value.evidenceGrade) ||
    typeof value.isDemo !== 'boolean'
  ) {
    return false;
  }
  if (value.mode === 'static') {
    return (
      typeof value.family === 'string' &&
      STATIC_MODEL_FAMILIES.has(value.family) &&
      hasValidStaticResponse(value.response) &&
      isRecord(value.response) &&
      value.response.family === value.family
    );
  }
  if (value.mode !== 'dynamic') return false;
  if (value.family === 'first_order') {
    return true;
  }
  if (value.family !== 'accumulator') return false;
  return (
    isNonEmptyString(value.inputPortId) &&
    isNonEmptyString(value.outputPortId) &&
    typeof value.initialState === 'number' &&
    Number.isFinite(value.initialState) &&
    !Object.prototype.hasOwnProperty.call(value, 'steadyStateResponse') &&
    !Object.prototype.hasOwnProperty.call(value, 'tau') &&
    !Object.prototype.hasOwnProperty.call(value, 'response')
  );
}

function hasValidModel(value: unknown, current: boolean, strictV23 = false): boolean {
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
    const currentFieldsValid =
      (value.contextId === null || isNonEmptyString(value.contextId)) &&
      isStringArray(value.provenanceIds);
    return currentFieldsValid && (!strictV23 || hasValidV23Model(value));
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

function hasValidV23ModuleRepresentation(value: Record<string, unknown>): boolean {
  const activeModelIds = value.activeModelIds;
  if (
    !Array.isArray(value.modelVariants) ||
    !value.modelVariants.every(isRecord) ||
    !hasUniqueIds(value.modelVariants) ||
    !isRecord(activeModelIds) ||
    !Array.isArray(value.inputPorts) ||
    !Array.isArray(value.outputPorts)
  ) {
    return false;
  }
  const activeKeys = Object.keys(activeModelIds);
  if (activeKeys.some((key) => key !== 'static' && key !== 'dynamic')) return false;
  const hasStatic = Object.prototype.hasOwnProperty.call(activeModelIds, 'static');
  const hasDynamic = Object.prototype.hasOwnProperty.call(activeModelIds, 'dynamic');
  if (!hasStatic && !hasDynamic) return false;
  if (hasStatic) {
    if (!isNonEmptyString(activeModelIds.static)) return false;
    const activeStatic = value.modelVariants.find((model) => model.id === activeModelIds.static);
    if (activeStatic?.mode !== 'static') return false;
  }
  if (hasDynamic) {
    if (!isNonEmptyString(activeModelIds.dynamic)) return false;
    const activeDynamic = value.modelVariants.find((model) => model.id === activeModelIds.dynamic);
    if (activeDynamic?.mode !== 'dynamic') return false;
  }

  const inputPorts = value.inputPorts.filter(isRecord);
  const outputPorts = value.outputPorts.filter(isRecord);
  const portIds = [...inputPorts, ...outputPorts].map((port) => port.id);
  if (!portIds.every(isNonEmptyString) || new Set(portIds).size !== portIds.length) return false;
  return value.modelVariants.every((model) => {
    if (model.mode !== 'dynamic' || model.family !== 'accumulator') return true;
    const inputPort = inputPorts.find((port) => port.id === model.inputPortId);
    const outputPort = outputPorts.find((port) => port.id === model.outputPortId);
    return inputPort?.direction === 'input' && outputPort?.direction === 'output';
  });
}

function hasValidModule(
  value: unknown,
  current: boolean,
  allowPortAuthoring: boolean,
  strictV23 = false,
): boolean {
  if (
    !isRecord(value) ||
    !hasValidNodePortMetadata(value, allowPortAuthoring) ||
    !Array.isArray(value.modelVariants) ||
    !value.modelVariants.every((model) => hasValidModel(model, current, strictV23)) ||
    (strictV23 && !hasValidV23ModuleRepresentation(value)) ||
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
    network.modules.every((module) => hasValidModule(module, false, false)) &&
    Array.isArray(registry.contexts) &&
    registry.contexts.every(isLegacyContext) &&
    Array.isArray(registry.validityDomains) &&
    registry.validityDomains.every((domain) => hasValidValidityDomain(domain, false))
  );
}

function isCurrentRepresentation(value: unknown, version: '2.1' | '2.2' | '2.3'): boolean {
  if (!hasProjectEnvelope(value, version)) return false;
  const network = value.network;
  const registry = value.registry;
  if (
    !isRecord(network) ||
    !isRecord(registry) ||
    !Array.isArray(network.modules) ||
    !network.modules.every((module) =>
      hasValidModule(module, true, version !== '2.1', version === '2.3'),
    ) ||
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

export function isBfnProjectV21(value: unknown): boolean {
  return isCurrentRepresentation(value, '2.1');
}

export function isBfnProjectV22(value: unknown): boolean {
  return isCurrentRepresentation(value, '2.2');
}

export function isBfnProjectV23(value: unknown): value is BfnProject {
  return isCurrentRepresentation(value, '2.3');
}

export function upgradeBfnProjectToCurrent(value: unknown): BfnProject {
  if (isBfnProjectV23(value)) return structuredClone(value);
  if (isBfnProjectV22(value)) {
    const migrated: unknown = structuredClone(value);
    if (!isRecord(migrated)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');
    migrated.schemaVersion = '2.3';
    if (!isBfnProjectV23(migrated)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');
    return migrated;
  }
  if (isBfnProjectV21(value)) {
    const migrated: unknown = structuredClone(value);
    if (!isRecord(migrated)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');
    migrated.schemaVersion = '2.2';
    if (!isBfnProjectV22(migrated)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');
    migrated.schemaVersion = '2.3';
    if (!isBfnProjectV23(migrated)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');
    return migrated;
  }
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
  migrated.schemaVersion = '2.2';
  if (!isBfnProjectV22(migrated)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');
  migrated.schemaVersion = '2.3';
  if (!isBfnProjectV23(migrated)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');
  return migrated;
}
