import { bfnCatalogReferencePresence } from '../catalog/catalogBfnTypes';
import { verifyBfnCatalogModel } from '../catalog/catalogBfnVerification';
import type {
  BfnFunctionalModule,
  BfnParameterEstimate,
  BfnPort,
  BfnProject,
  BfnStaticModel,
  BfnStaticResponse,
} from '../types';
import { areUnitsCompatible, convertUnit, isBfnUnit } from '../unitSystem';
import {
  BFN_INTERPRETATION_CONTRACT_VERSION,
  type BfnInterpretationApplicabilityState,
  type BfnInterpretationCatalogReferenceV1,
  type BfnInterpretationContextReferenceV1,
  type BfnLocalInfluenceAdmissionV1,
  type BfnLocalInfluenceIssueCode,
  type BfnLocalInfluenceIssueV1,
  type BfnLocalInfluenceRequestV1,
  type BfnOperatingPointInputV1,
  type BfnResolvedLocalInfluenceTargetV1,
  type BfnStaticInterpretationBasisV1,
} from './interpretationTypes';

const evidenceGrades = new Set([
  'measured_single_context',
  'measured_multiple_contexts',
  'externally_validated',
  'fitted_from_published_data',
  'mechanistic_model_only',
  'data_driven_prediction',
  'independent_assumption',
  'proposed_unbuilt_design',
]);

const uncertaintyMethods = new Set([
  'parameter_interval_envelope',
  'posterior_samples',
  'bootstrap',
  'covariance',
  'none',
  'not_recorded',
]);

const quantityTypes = new Set([
  'concentration',
  'amount',
  'production_rate',
  'expression_level',
  'activity',
  'flux',
  'fraction',
  'cell_density',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function sameStructuredValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameStructuredValue(entry, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && sameStructuredValue(left[key], right[key]),
    )
  );
}

function addIssue(
  issues: BfnLocalInfluenceIssueV1[],
  code: BfnLocalInfluenceIssueCode,
  severity: BfnLocalInfluenceIssueV1['severity'],
  subjectId: string,
  details?: Readonly<Record<string, string | number>>,
): void {
  issues.push(Object.freeze({ code, severity, subjectId, ...(details ? { details } : {}) }));
}

function finishAdmission(
  issues: readonly BfnLocalInfluenceIssueV1[],
  applicability: BfnInterpretationApplicabilityState | null,
  target: BfnResolvedLocalInfluenceTargetV1 | null,
): BfnLocalInfluenceAdmissionV1 {
  return Object.freeze({
    status: issues.some((issue) => issue.severity === 'error') ? 'unsupported' : 'supported',
    applicability,
    issues: Object.freeze([...issues]),
    target,
  });
}

function validPort(value: unknown, direction: BfnPort['direction']): value is BfnPort {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.entity) &&
    value.direction === direction &&
    typeof value.quantityType === 'string' &&
    quantityTypes.has(value.quantityType) &&
    isBfnUnit(value.unit)
  );
}

function validParameter(
  value: unknown,
  unit: BfnParameterEstimate['unit'],
  valueRule: (value: number) => boolean = () => true,
): value is BfnParameterEstimate {
  if (
    !isRecord(value) ||
    typeof value.value !== 'number' ||
    !Number.isFinite(value.value) ||
    value.unit !== unit ||
    !valueRule(value.value)
  ) {
    return false;
  }
  if (value.interval95 === undefined) return true;
  const interval = value.interval95;
  return (
    Array.isArray(interval) &&
    interval.length === 2 &&
    typeof interval[0] === 'number' &&
    typeof interval[1] === 'number' &&
    Number.isFinite(interval[0]) &&
    Number.isFinite(interval[1]) &&
    interval[0] <= value.value &&
    value.value <= interval[1]
  );
}

function inputPort(module: BfnFunctionalModule, portId: unknown): BfnPort | null {
  if (!isNonEmptyString(portId)) return null;
  return module.inputPorts.find((port) => port.id === portId) ?? null;
}

function responseInputPorts(
  module: BfnFunctionalModule,
  outputPort: BfnPort,
  response: BfnStaticResponse,
): readonly BfnPort[] | null {
  switch (response.family) {
    case 'hill_activation':
    case 'hill_repression': {
      const input = inputPort(module, response.inputPortId);
      if (
        !input ||
        !validParameter(response.ymin, outputPort.unit) ||
        !validParameter(response.ymax, outputPort.unit) ||
        response.ymax.value < response.ymin.value ||
        !validParameter(response.k, input.unit, (value) => value > 0) ||
        !validParameter(response.n, 'dimensionless', (value) => value > 0)
      ) {
        return null;
      }
      return [input];
    }
    case 'linear_transfer': {
      const input = inputPort(module, response.inputPortId);
      const minimum = response.outputMinimum;
      const maximum = response.outputMaximum;
      if (
        !input ||
        input.unit !== outputPort.unit ||
        !validParameter(response.scale, 'dimensionless') ||
        !validParameter(response.intercept, outputPort.unit) ||
        (minimum !== undefined && !Number.isFinite(minimum)) ||
        (maximum !== undefined && !Number.isFinite(maximum)) ||
        (minimum !== undefined && maximum !== undefined && minimum > maximum)
      ) {
        return null;
      }
      return [input];
    }
    case 'identity': {
      const input = inputPort(module, response.inputPortId);
      return input && input.unit === outputPort.unit ? [input] : null;
    }
    case 'independent_inputs': {
      if (
        !Array.isArray(response.terms) ||
        response.terms.length < 2 ||
        (response.aggregation !== 'bounded_sum' && response.aggregation !== 'multiplicative') ||
        response.interactionAssumption !== 'independent_unverified' ||
        !validParameter(response.basal, outputPort.unit) ||
        !validParameter(response.outputMaximum, outputPort.unit) ||
        response.outputMaximum.value < response.basal.value
      ) {
        return null;
      }
      const inputs: BfnPort[] = [];
      for (const term of response.terms) {
        const input = inputPort(module, term.inputPortId);
        if (
          !input ||
          (term.direction !== 'activation' && term.direction !== 'repression') ||
          !validParameter(term.k, input.unit, (value) => value > 0) ||
          !validParameter(term.n, 'dimensionless', (value) => value > 0) ||
          !validParameter(term.contribution, 'dimensionless', (value) => value > 0)
        ) {
          return null;
        }
        inputs.push(input);
      }
      return hasUniqueStrings(inputs.map((input) => input.id)) ? inputs : null;
    }
  }
}

interface StaticResolution {
  readonly model: BfnStaticModel;
  readonly basis: BfnStaticInterpretationBasisV1;
}

function resolveStaticModel(
  module: BfnFunctionalModule,
  issues: BfnLocalInfluenceIssueV1[],
): StaticResolution | null {
  if (!isRecord(module.activeModelIds) || !Array.isArray(module.modelVariants)) {
    addIssue(issues, 'model_contract_invalid', 'error', module.id, {
      reason: 'active_model_structure_invalid',
    });
    return null;
  }
  const staticId = module.activeModelIds.static;
  const dynamicId = module.activeModelIds.dynamic;
  if (!isNonEmptyString(staticId)) {
    if (isNonEmptyString(dynamicId)) {
      const dynamicMatches = module.modelVariants.filter((candidate) => candidate.id === dynamicId);
      if (dynamicMatches.length !== 1 || dynamicMatches[0]?.mode !== 'dynamic') {
        addIssue(issues, 'model_contract_invalid', 'error', module.id, {
          reason: 'active_dynamic_model_invalid',
        });
      } else if (dynamicMatches[0].family === 'accumulator') {
        addIssue(issues, 'static_interpretation_unsupported', 'error', module.id, {
          reason: 'accumulator_has_no_static_response',
        });
      } else {
        addIssue(issues, 'dynamic_only_model', 'error', module.id);
      }
    } else {
      addIssue(issues, 'static_model_missing', 'error', module.id);
    }
    return null;
  }

  const staticMatches = module.modelVariants.filter((candidate) => candidate.id === staticId);
  if (staticMatches.length !== 1 || staticMatches[0]?.mode !== 'static') {
    addIssue(issues, 'model_contract_invalid', 'error', module.id, {
      reason: 'active_static_model_invalid',
    });
    return null;
  }
  const model = staticMatches[0];
  if (!isNonEmptyString(dynamicId)) {
    return { model, basis: 'active_static_response' };
  }

  const dynamicMatches = module.modelVariants.filter((candidate) => candidate.id === dynamicId);
  if (dynamicMatches.length !== 1 || dynamicMatches[0]?.mode !== 'dynamic') {
    addIssue(issues, 'model_contract_invalid', 'error', module.id, {
      reason: 'active_dynamic_model_invalid',
    });
    return null;
  }
  const dynamicModel = dynamicMatches[0];
  if (
    dynamicModel.family !== 'first_order' ||
    !sameStructuredValue(dynamicModel.steadyStateResponse, model.response)
  ) {
    addIssue(issues, 'model_contract_invalid', 'error', module.id, {
      reason: 'first_order_static_relation_invalid',
    });
    return null;
  }
  return { model, basis: 'first_order_steady_state_static_response' };
}

function validStaticModelBase(model: BfnStaticModel): boolean {
  return (
    isNonEmptyString(model.id) &&
    isNonEmptyString(model.version) &&
    model.mode === 'static' &&
    isNonEmptyString(model.validityDomainId) &&
    (model.contextId === null || isNonEmptyString(model.contextId)) &&
    Array.isArray(model.sourceDatasetIds) &&
    model.sourceDatasetIds.every(isNonEmptyString) &&
    Array.isArray(model.provenanceIds) &&
    model.provenanceIds.every(isNonEmptyString) &&
    hasUniqueStrings(model.provenanceIds) &&
    evidenceGrades.has(model.evidenceGrade) &&
    uncertaintyMethods.has(model.uncertaintyMethod) &&
    typeof model.isDemo === 'boolean'
  );
}

function catalogReference(model: BfnStaticModel): BfnInterpretationCatalogReferenceV1 | null {
  const reference = model.catalogReference;
  if (reference === undefined) return null;
  return Object.freeze({
    catalogId: reference.catalogId,
    releaseId: reference.releaseId,
    releaseVersion: reference.releaseVersion,
    responseId: reference.responseId,
    componentId: reference.componentId,
    inputSignalId: reference.inputSignalId,
    outputSignalId: reference.outputSignalId,
    parameterContextId: reference.parameterContextId,
    sourceIds: Object.freeze([...reference.sourceIds]),
    sourceModelType: reference.sourceModelType,
    biologicalDirection: reference.biologicalDirection,
    runtimeImplementation: reference.runtimeImplementation,
  });
}

function contextReference(
  project: BfnProject,
  model: BfnStaticModel,
  catalog: BfnInterpretationCatalogReferenceV1 | null,
): BfnInterpretationContextReferenceV1 | null {
  if (catalog !== null) {
    if (model.contextId === null) return null;
    return Object.freeze({
      kind: 'catalog_parameter_context',
      contextId: model.contextId,
      catalogId: catalog.catalogId,
      releaseId: catalog.releaseId,
      releaseVersion: catalog.releaseVersion,
      parameterContextId: catalog.parameterContextId,
    });
  }
  if (model.contextId === null) {
    return Object.freeze({ kind: 'not_recorded', contextId: null });
  }
  if (!Array.isArray(project.registry.contexts)) return null;
  const contexts = project.registry.contexts.filter((context) => context.id === model.contextId);
  return contexts.length === 1
    ? Object.freeze({ kind: 'project_context', contextId: model.contextId })
    : null;
}

function modelProvenanceIsResolvable(project: BfnProject, model: BfnStaticModel): boolean {
  if (!Array.isArray(project.registry.provenanceRecords)) return false;
  return model.provenanceIds.every(
    (id) => project.registry.provenanceRecords.filter((record) => record.id === id).length === 1,
  );
}

interface DomainResolution {
  readonly domain: BfnProject['registry']['validityDomains'][number];
  readonly rangesByPortId: ReadonlyMap<
    string,
    BfnProject['registry']['validityDomains'][number]['inputRanges'][number]
  >;
}

function resolveValidityDomain(
  project: BfnProject,
  module: BfnFunctionalModule,
  model: BfnStaticModel,
  issues: BfnLocalInfluenceIssueV1[],
): DomainResolution | null {
  if (!Array.isArray(project.registry.validityDomains)) {
    addIssue(issues, 'model_contract_invalid', 'error', model.id, {
      reason: 'validity_domain_registry_invalid',
    });
    return null;
  }
  const matches = project.registry.validityDomains.filter(
    (domain) => domain.id === model.validityDomainId,
  );
  const domain = matches[0];
  if (
    matches.length !== 1 ||
    domain === undefined ||
    !Array.isArray(domain.inputRanges) ||
    domain.contextId !== model.contextId
  ) {
    addIssue(issues, 'model_contract_invalid', 'error', model.id, {
      reason: 'validity_domain_invalid',
    });
    return null;
  }

  const moduleInputUnits = new Map(module.inputPorts.map((port) => [port.id, port.unit] as const));
  const rangesByPortId = new Map<string, (typeof domain.inputRanges)[number]>();
  for (const range of domain.inputRanges) {
    const portUnit = moduleInputUnits.get(range.portId);
    if (
      !isNonEmptyString(range.portId) ||
      typeof range.minimum !== 'number' ||
      typeof range.maximum !== 'number' ||
      !Number.isFinite(range.minimum) ||
      !Number.isFinite(range.maximum) ||
      range.minimum > range.maximum ||
      !isBfnUnit(range.unit) ||
      portUnit === undefined ||
      !areUnitsCompatible(portUnit, range.unit) ||
      rangesByPortId.has(range.portId)
    ) {
      addIssue(issues, 'model_contract_invalid', 'error', model.id, {
        reason: 'validity_domain_range_invalid',
      });
      return null;
    }
    rangesByPortId.set(range.portId, range);
  }
  return { domain, rangesByPortId };
}

function validateRequestInputs(
  module: BfnFunctionalModule,
  requiredInputs: readonly BfnPort[],
  values: readonly BfnOperatingPointInputV1[],
  issues: BfnLocalInfluenceIssueV1[],
): ReadonlyMap<string, BfnOperatingPointInputV1> | null {
  const requiredIds = new Set(requiredInputs.map((port) => port.id));
  const moduleInputIds = new Set(module.inputPorts.map((port) => port.id));
  const moduleOutputIds = new Set(module.outputPorts.map((port) => port.id));
  const valuesByPortId = new Map<string, BfnOperatingPointInputV1>();
  const counts = new Map<string, number>();

  for (const [index, value] of values.entries()) {
    if (!isRecord(value) || !isNonEmptyString(value.portId)) {
      addIssue(issues, 'input_port_invalid', 'error', `operatingPoint[${index}]`, {
        reason: 'port_id_invalid',
      });
      continue;
    }
    const portId = value.portId;
    const count = (counts.get(portId) ?? 0) + 1;
    counts.set(portId, count);
    if (count > 1) {
      addIssue(issues, 'input_value_duplicate', 'error', portId);
      continue;
    }
    if (moduleOutputIds.has(portId) || !moduleInputIds.has(portId)) {
      addIssue(issues, 'input_port_invalid', 'error', portId, {
        reason: moduleOutputIds.has(portId) ? 'output_port' : 'unknown_port',
      });
      continue;
    }
    if (!requiredIds.has(portId)) {
      addIssue(issues, 'unexpected_input', 'error', portId);
      continue;
    }
    const port = requiredInputs.find((candidate) => candidate.id === portId)!;
    if (!isBfnUnit(value.unit) || value.unit !== port.unit) {
      addIssue(issues, 'unit_mismatch', 'error', portId, {
        expectedUnit: port.unit,
        actualUnit: typeof value.unit === 'string' ? value.unit : 'invalid',
      });
    }
    if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
      addIssue(issues, 'value_non_finite', 'error', portId);
    } else if (value.value < 0) {
      addIssue(issues, 'value_negative', 'error', portId);
    }
    valuesByPortId.set(portId, value);
  }

  for (const input of requiredInputs) {
    if ((counts.get(input.id) ?? 0) === 0) {
      addIssue(issues, 'input_value_missing', 'error', input.id);
    }
  }
  return issues.some((issue) => issue.severity === 'error') ? null : valuesByPortId;
}

function assessApplicability(
  requiredInputs: readonly BfnPort[],
  valuesByPortId: ReadonlyMap<string, BfnOperatingPointInputV1>,
  domain: DomainResolution,
  issues: BfnLocalInfluenceIssueV1[],
): BfnInterpretationApplicabilityState {
  let missingRange = false;
  let outside = false;
  for (const input of requiredInputs) {
    const range = domain.rangesByPortId.get(input.id);
    if (range === undefined) {
      missingRange = true;
      continue;
    }
    const operatingValue = valuesByPortId.get(input.id)!;
    const comparable = convertUnit(operatingValue.value, operatingValue.unit, range.unit);
    if (comparable < range.minimum || comparable > range.maximum) {
      outside = true;
      addIssue(issues, 'outside_validity_domain', 'error', input.id, {
        minimum: range.minimum,
        maximum: range.maximum,
        rangeUnit: range.unit,
      });
    }
  }
  if (outside) return 'outside_recorded_domain';
  if (missingRange) {
    addIssue(issues, 'applicability_not_recorded', 'warning', domain.domain.id);
    return 'applicability_not_recorded';
  }
  return 'within_recorded_domain';
}

function assessLocalInfluenceRequest(
  project: BfnProject,
  request: BfnLocalInfluenceRequestV1,
): BfnLocalInfluenceAdmissionV1 {
  const issues: BfnLocalInfluenceIssueV1[] = [];
  if (
    !isRecord(request) ||
    request.contractVersion !== BFN_INTERPRETATION_CONTRACT_VERSION ||
    request.scope !== 'module_static_response' ||
    !isNonEmptyString(request.moduleId) ||
    !isNonEmptyString(request.outputPortId) ||
    !Array.isArray(request.operatingPoint)
  ) {
    addIssue(issues, 'request_contract_invalid', 'error', 'request');
    return finishAdmission(issues, null, null);
  }
  if (
    !isRecord(project) ||
    !isRecord(project.network) ||
    !Array.isArray(project.network.modules) ||
    !isRecord(project.registry)
  ) {
    addIssue(issues, 'model_contract_invalid', 'error', request.moduleId, {
      reason: 'project_structure_invalid',
    });
    return finishAdmission(issues, null, null);
  }

  const moduleMatches = project.network.modules.filter((module) => module.id === request.moduleId);
  if (moduleMatches.length === 0) {
    addIssue(issues, 'module_not_found', 'error', request.moduleId);
    return finishAdmission(issues, null, null);
  }
  if (moduleMatches.length !== 1) {
    addIssue(issues, 'module_identity_conflict', 'error', request.moduleId);
    return finishAdmission(issues, null, null);
  }
  const module = moduleMatches[0]!;
  if (!Array.isArray(module.inputPorts) || !Array.isArray(module.outputPorts)) {
    addIssue(issues, 'model_contract_invalid', 'error', module.id, {
      reason: 'module_ports_invalid',
    });
    return finishAdmission(issues, null, null);
  }
  const ports = [...module.inputPorts, ...module.outputPorts];
  if (
    !module.inputPorts.every((port) => validPort(port, 'input')) ||
    !module.outputPorts.every((port) => validPort(port, 'output')) ||
    !hasUniqueStrings(ports.map((port) => port.id))
  ) {
    addIssue(issues, 'model_contract_invalid', 'error', module.id, {
      reason: 'module_ports_invalid',
    });
    return finishAdmission(issues, null, null);
  }
  const outputMatches = module.outputPorts.filter((port) => port.id === request.outputPortId);
  if (outputMatches.length !== 1) {
    addIssue(issues, 'output_port_invalid', 'error', request.outputPortId);
    return finishAdmission(issues, null, null);
  }
  const outputPort = outputMatches[0]!;

  const resolution = resolveStaticModel(module, issues);
  if (!resolution) return finishAdmission(issues, null, null);
  const model = resolution.model;
  if (!validStaticModelBase(model) || !isRecord(model.response)) {
    addIssue(issues, 'model_contract_invalid', 'error', model.id, {
      reason: 'static_model_invalid',
    });
    return finishAdmission(issues, null, null);
  }
  if (
    model.response.family !== 'hill_activation' &&
    model.response.family !== 'hill_repression' &&
    model.response.family !== 'linear_transfer' &&
    model.response.family !== 'identity' &&
    model.response.family !== 'independent_inputs'
  ) {
    addIssue(issues, 'static_interpretation_unsupported', 'error', model.id);
    return finishAdmission(issues, null, null);
  }
  if (model.family !== model.response.family) {
    addIssue(issues, 'model_contract_invalid', 'error', model.id, {
      reason: 'response_family_mismatch',
    });
    return finishAdmission(issues, null, null);
  }
  const requiredInputs = responseInputPorts(module, outputPort, model.response);
  if (!requiredInputs) {
    addIssue(issues, 'model_contract_invalid', 'error', model.id, {
      reason: 'static_response_invalid',
    });
    return finishAdmission(issues, null, null);
  }
  if (!modelProvenanceIsResolvable(project, model)) {
    addIssue(issues, 'model_contract_invalid', 'error', model.id, {
      reason: 'model_provenance_invalid',
    });
    return finishAdmission(issues, null, null);
  }

  const catalogPresence = bfnCatalogReferencePresence(model);
  if (catalogPresence.present) {
    try {
      verifyBfnCatalogModel(project, module, model);
    } catch {
      addIssue(issues, 'model_contract_invalid', 'error', model.id, {
        reason: 'catalog_model_invalid',
      });
      return finishAdmission(issues, null, null);
    }
  }
  const catalog = catalogReference(model);
  const context = contextReference(project, model, catalog);
  if (!context) {
    addIssue(issues, 'model_contract_invalid', 'error', model.id, {
      reason: 'model_context_invalid',
    });
    return finishAdmission(issues, null, null);
  }
  const domain = resolveValidityDomain(project, module, model, issues);
  if (!domain) return finishAdmission(issues, null, null);

  const target: BfnResolvedLocalInfluenceTargetV1 = Object.freeze({
    contractVersion: BFN_INTERPRETATION_CONTRACT_VERSION,
    scope: 'module_static_response',
    moduleId: module.id,
    staticModelId: model.id,
    staticModelVersion: model.version,
    responseFamily: model.response.family,
    outputPortId: outputPort.id,
    outputUnit: outputPort.unit,
    inputPorts: Object.freeze(
      requiredInputs.map((input) => Object.freeze({ portId: input.id, unit: input.unit })),
    ),
    interpretationBasis: resolution.basis,
    interpretationSource: 'active_bfn_static_response',
    parameterBasis: 'nominal',
    evidence: Object.freeze({
      evidenceGrade: model.evidenceGrade,
      uncertaintyMethod: model.uncertaintyMethod,
      provenanceIds: Object.freeze([...model.provenanceIds]),
      sourceDatasetIds: Object.freeze([...model.sourceDatasetIds]),
      catalogReference: catalog,
    }),
    contextReference: context,
    validityDomainId: domain.domain.id,
  });

  const valuesByPortId = validateRequestInputs(
    module,
    requiredInputs,
    request.operatingPoint,
    issues,
  );
  if (!valuesByPortId) return finishAdmission(issues, null, target);
  const applicability = assessApplicability(requiredInputs, valuesByPortId, domain, issues);
  return finishAdmission(issues, applicability, target);
}

/**
 * Pure Batch 13.0 semantic admission. It resolves one active static response,
 * validates a complete operating point, and never evaluates a derivative.
 */
export function assessBfnLocalInfluenceRequest(
  project: BfnProject,
  request: BfnLocalInfluenceRequestV1,
): BfnLocalInfluenceAdmissionV1 {
  try {
    return assessLocalInfluenceRequest(project, request);
  } catch {
    const issues: BfnLocalInfluenceIssueV1[] = [];
    addIssue(issues, 'model_contract_invalid', 'error', request?.moduleId ?? 'request', {
      reason: 'unexpected_runtime_shape',
    });
    return finishAdmission(issues, null, null);
  }
}
