import type { BfnModelVariant, BfnProject, BfnStaticResponse } from '../../types';
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
  isDataArray,
  isFiniteNumber,
  isNonEmptyString,
  isNullableString,
  isPlainDataRecord,
} from './templateInternals';

/**
 * Checks every BFN-IR runtime shape read by Template 1.0 adapters. This is a
 * template-local guard and intentionally does not alter the frozen IR parser.
 */
export function isTemplateProjectRuntimeSafe(value: unknown): value is BfnProject {
  try {
    if (!isSafeRuntimeTree(value) || !isPlainDataRecord(value)) return false;
    const network = value.network;
    const registry = value.registry;
    if (
      value.schema !== 'BFN-IR' ||
      value.schemaVersion !== '2.3' ||
      !isNonEmptyString(value.id) ||
      typeof value.labelKey !== 'string' ||
      !isNonEmptyString(value.createdAt) ||
      !isNonEmptyString(value.updatedAt) ||
      typeof value.isDemo !== 'boolean' ||
      !isPlainDataRecord(network) ||
      !isPlainDataRecord(registry) ||
      !isPlainDataRecord(value.analysis) ||
      !isNonEmptyString(network.id) ||
      typeof network.labelKey !== 'string' ||
      (network.mode !== 'static' && network.mode !== 'dynamic') ||
      !isDataArray(network.inputSources) ||
      !isDataArray(network.modules) ||
      !isDataArray(network.outputMonitors) ||
      !isDataArray(network.edges) ||
      !isDataArray(registry.entities) ||
      !isDataArray(registry.provenanceRecords) ||
      !isDataArray(registry.contexts) ||
      !isDataArray(registry.validityDomains) ||
      !isDataArray(registry.datasets) ||
      !isDataArray(registry.implementations) ||
      !isDataArray(registry.calibrationMaps)
    ) {
      return false;
    }
    return (
      network.inputSources.every(isRuntimeInputSource) &&
      network.modules.every(isRuntimeModule) &&
      network.outputMonitors.every(isRuntimeOutputMonitor) &&
      network.edges.every(isRuntimeEdge) &&
      registry.entities.every(isRuntimeEntity) &&
      registry.provenanceRecords.every(isRuntimeProvenance) &&
      registry.contexts.every(isRuntimeContext) &&
      registry.validityDomains.every(isRuntimeValidityDomain) &&
      registry.datasets.every(isRuntimeDataset) &&
      registry.implementations.every(isRuntimeImplementation) &&
      registry.calibrationMaps.every(isRuntimeCalibrationMap)
    );
  } catch {
    return false;
  }
}

/** Collects project-local references that must remain unresolved if they were unresolved. */
export function collectTemplateProjectReferenceIds(project: BfnProject): ReadonlySet<string> {
  const references = new Set<string>();
  const add = (value: string | null | undefined): void => {
    if (typeof value === 'string') references.add(value);
  };
  const addResponse = (response: BfnStaticResponse): void => {
    if (response.family === 'independent_inputs') {
      for (const term of response.terms) add(term.inputPortId);
    } else {
      add(response.inputPortId);
    }
  };

  for (const edge of project.network.edges) {
    add(edge.source.nodeId);
    add(edge.source.portId);
    add(edge.target.nodeId);
    add(edge.target.portId);
  }
  for (const source of project.network.inputSources) add(source.outputPort.entity);
  for (const monitor of project.network.outputMonitors) add(monitor.inputPort.entity);
  for (const module of project.network.modules) {
    for (const port of [...module.inputPorts, ...module.outputPorts]) add(port.entity);
    add(module.activeModelIds.static);
    add(module.activeModelIds.dynamic);
    for (const id of module.implementationIds) add(id);
    for (const model of module.modelVariants) {
      add(model.contextId);
      add(model.validityDomainId);
      for (const id of model.sourceDatasetIds) add(id);
      for (const id of model.provenanceIds) add(id);
      collectModelPortReferences(model, addResponse, add);
    }
  }
  for (const domain of project.registry.validityDomains) {
    add(domain.contextId);
    for (const range of domain.inputRanges) add(range.portId);
  }
  for (const implementation of project.registry.implementations) {
    for (const id of implementation.provenanceIds) add(id);
  }
  for (const dataset of project.registry.datasets) {
    for (const id of dataset.inputEntities) add(id);
    for (const id of dataset.outputEntities) add(id);
    add(dataset.contextId);
    add(dataset.calibrationId);
  }
  for (const calibrationMap of project.registry.calibrationMaps) {
    add(calibrationMap.targetModuleId);
    add(calibrationMap.contextId);
    for (const id of calibrationMap.sourceDatasetIds) add(id);
  }
  return references;
}

function collectModelPortReferences(
  model: BfnModelVariant,
  addResponse: (response: BfnStaticResponse) => void,
  add: (value: string | null | undefined) => void,
): void {
  if (model.mode === 'static') {
    addResponse(model.response);
    return;
  }
  if (model.family === 'first_order') {
    addResponse(model.steadyStateResponse);
    return;
  }
  add(model.inputPortId);
  add(model.outputPortId);
}

function isSafeRuntimeTree(value: unknown, ancestors = new Set<object>()): boolean {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    isFiniteNumber(value)
  ) {
    return true;
  }
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!isDataArray(value) && !isPlainDataRecord(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((child) => isSafeRuntimeTree(child, ancestors));
  ancestors.delete(value);
  return valid;
}

function isRuntimeInputSource(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    value.kind === 'input_source' &&
    isNonEmptyString(value.id) &&
    isRuntimePort(value.outputPort, 'output') &&
    isRuntimePosition(value.position)
  );
}

function isRuntimeOutputMonitor(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    value.kind === 'output_monitor' &&
    isNonEmptyString(value.id) &&
    isRuntimePort(value.inputPort, 'input') &&
    isRuntimePosition(value.position)
  );
}

function isRuntimeModule(value: unknown): boolean {
  if (
    !isPlainDataRecord(value) ||
    value.kind !== 'functional_module' ||
    !isNonEmptyString(value.id) ||
    !isDataArray(value.inputPorts) ||
    !value.inputPorts.every((port) => isRuntimePort(port, 'input')) ||
    !isDataArray(value.outputPorts) ||
    !value.outputPorts.every((port) => isRuntimePort(port, 'output')) ||
    !isDataArray(value.modelVariants) ||
    !value.modelVariants.every(isRuntimeModel) ||
    !isRuntimeActiveModelIds(value.activeModelIds) ||
    !isStringArray(value.implementationIds) ||
    !bfnTemplateImplementationStates.has(String(value.implementationState)) ||
    !bfnTemplateEvidenceGrades.has(String(value.evidenceGrade)) ||
    !isRuntimePosition(value.position) ||
    typeof value.isDemo !== 'boolean'
  ) {
    return false;
  }
  return (
    value.authoring === undefined ||
    (isPlainDataRecord(value.authoring) &&
      value.authoring.origin === 'user_defined' &&
      isNonEmptyString(value.authoring.name) &&
      isNullableString(value.authoring.description))
  );
}

function isRuntimeActiveModelIds(value: unknown): boolean {
  if (!isPlainDataRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => key !== 'static' && key !== 'dynamic')) return false;
  return (
    (value.static === undefined || isNonEmptyString(value.static)) &&
    (value.dynamic === undefined || isNonEmptyString(value.dynamic))
  );
}

function isRuntimePort(value: unknown, direction: 'input' | 'output'): boolean {
  return (
    isPlainDataRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.entity) &&
    bfnTemplateQuantityTypes.has(String(value.quantityType)) &&
    bfnTemplateUnits.has(String(value.unit)) &&
    value.direction === direction
  );
}

function isRuntimeModel(value: unknown): boolean {
  if (
    !isPlainDataRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.version) ||
    (value.mode !== 'static' && value.mode !== 'dynamic') ||
    !isNonEmptyString(value.family) ||
    (value.contextId !== null && !isNonEmptyString(value.contextId)) ||
    !isNonEmptyString(value.validityDomainId) ||
    !isStringArray(value.sourceDatasetIds) ||
    !isStringArray(value.provenanceIds) ||
    !bfnTemplateEvidenceGrades.has(String(value.evidenceGrade)) ||
    !bfnTemplateUncertaintyMethods.has(String(value.uncertaintyMethod)) ||
    typeof value.isDemo !== 'boolean'
  ) {
    return false;
  }
  if (value.mode === 'static') {
    return isRuntimeStaticResponse(value.response);
  }
  if (value.family === 'first_order') {
    return (
      isRuntimeStaticResponse(value.steadyStateResponse) &&
      isRuntimeParameter(value.tau) &&
      isFiniteNumber(value.initialState)
    );
  }
  if (value.family === 'accumulator') {
    return (
      isNonEmptyString(value.inputPortId) &&
      isNonEmptyString(value.outputPortId) &&
      isFiniteNumber(value.initialState)
    );
  }
  return true;
}

function isRuntimeStaticResponse(value: unknown): value is BfnStaticResponse {
  if (!isPlainDataRecord(value) || !isNonEmptyString(value.family)) return false;
  if (value.family === 'hill_activation' || value.family === 'hill_repression') {
    return (
      isNonEmptyString(value.inputPortId) &&
      isRuntimeParameter(value.ymin) &&
      isRuntimeParameter(value.ymax) &&
      isRuntimeParameter(value.k) &&
      isRuntimeParameter(value.n)
    );
  }
  if (value.family === 'linear_transfer') {
    return (
      isNonEmptyString(value.inputPortId) &&
      isRuntimeParameter(value.scale) &&
      isRuntimeParameter(value.intercept) &&
      (value.outputMinimum === undefined || isFiniteNumber(value.outputMinimum)) &&
      (value.outputMaximum === undefined || isFiniteNumber(value.outputMaximum))
    );
  }
  if (value.family === 'identity') return isNonEmptyString(value.inputPortId);
  if (value.family !== 'independent_inputs' || !isDataArray(value.terms)) return false;
  return (
    value.terms.every(
      (term) =>
        isPlainDataRecord(term) &&
        isNonEmptyString(term.inputPortId) &&
        (term.direction === 'activation' || term.direction === 'repression') &&
        isRuntimeParameter(term.k) &&
        isRuntimeParameter(term.n) &&
        isRuntimeParameter(term.contribution),
    ) &&
    isRuntimeParameter(value.basal) &&
    isRuntimeParameter(value.outputMaximum) &&
    (value.aggregation === 'bounded_sum' || value.aggregation === 'multiplicative') &&
    value.interactionAssumption === 'independent_unverified'
  );
}

function isRuntimeParameter(value: unknown): boolean {
  if (
    !isPlainDataRecord(value) ||
    !isFiniteNumber(value.value) ||
    !bfnTemplateParameterUnits.has(String(value.unit))
  ) {
    return false;
  }
  return (
    value.interval95 === undefined ||
    (isDataArray(value.interval95) &&
      value.interval95.length === 2 &&
      value.interval95.every(isFiniteNumber))
  );
}

function isRuntimePosition(value: unknown): boolean {
  return isPlainDataRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isRuntimeEdge(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    isNonEmptyString(value.id) &&
    isRuntimeEndpoint(value.source) &&
    isRuntimeEndpoint(value.target)
  );
}

function isRuntimeEndpoint(value: unknown): boolean {
  return (
    isPlainDataRecord(value) && isNonEmptyString(value.nodeId) && isNonEmptyString(value.portId)
  );
}

function isRuntimeEntity(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    isNonEmptyString(value.id) &&
    value.origin === 'user_defined' &&
    isNonEmptyString(value.displayName) &&
    isNullableString(value.description)
  );
}

function isRuntimeProvenance(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    isNonEmptyString(value.id) &&
    bfnTemplateProvenanceKinds.has(String(value.kind)) &&
    isNonEmptyString(value.reference)
  );
}

function isRuntimeContext(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.labelKey) &&
    bfnTemplateContextDocumentationStates.has(String(value.documentationState)) &&
    isNullableString(value.host) &&
    isNullableString(value.strain) &&
    isNullableString(value.medium) &&
    isNullableFinite(value.temperatureCelsius) &&
    isNullableFinite(value.ph) &&
    isNullableString(value.oxygenation) &&
    isNullableString(value.growthPhase) &&
    isNullableString(value.plasmidBackbone) &&
    isNullableString(value.copyNumberRegime) &&
    isNullableString(value.inductionProtocol) &&
    isNullableFinite(value.measurementTimeHours) &&
    isNullableString(value.batch) &&
    typeof value.isDemo === 'boolean'
  );
}

function isRuntimeValidityDomain(value: unknown): boolean {
  if (
    !isPlainDataRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.labelKey) ||
    !isDataArray(value.inputRanges) ||
    !value.inputRanges.every(isRuntimeValidityRange) ||
    (value.contextId !== null && !isNonEmptyString(value.contextId))
  ) {
    return false;
  }
  return (
    value.timeRangeHours === undefined ||
    (isDataArray(value.timeRangeHours) &&
      value.timeRangeHours.length === 2 &&
      value.timeRangeHours.every(isFiniteNumber))
  );
}

function isRuntimeValidityRange(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    isNonEmptyString(value.portId) &&
    isFiniteNumber(value.minimum) &&
    isFiniteNumber(value.maximum) &&
    bfnTemplateUnits.has(String(value.unit))
  );
}

function isRuntimeImplementation(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    isNonEmptyString(value.id) &&
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
    isStringArray(value.provenanceIds) &&
    typeof value.isDemo === 'boolean'
  );
}

function isRuntimeDataset(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    isNonEmptyString(value.id) &&
    isStringArray(value.inputEntities) &&
    isStringArray(value.outputEntities) &&
    isNonEmptyString(value.contextId) &&
    (value.calibrationId === null || isNonEmptyString(value.calibrationId))
  );
}

function isRuntimeCalibrationMap(value: unknown): boolean {
  return (
    isPlainDataRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.targetModuleId) &&
    isNonEmptyString(value.contextId) &&
    isStringArray(value.sourceDatasetIds) &&
    isDataArray(value.candidates)
  );
}

function isStringArray(value: unknown): value is string[] {
  return isDataArray(value) && value.every(isNonEmptyString);
}

function isNullableFinite(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}
