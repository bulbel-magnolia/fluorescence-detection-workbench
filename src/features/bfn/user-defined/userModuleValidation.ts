import {
  USER_DEFINED_MODULE_ORIGIN,
  USER_MODULE_AUTHORABLE_MODEL_FAMILIES,
  USER_MODULE_EVIDENCE_BASES,
  USER_MODULE_QUANTITY_TYPES,
  USER_MODULE_UNITS,
} from './userModuleContract';
import type {
  UserDefinedFunctionalModuleAssessment,
  UserDefinedFunctionalModuleDraft,
  UserModuleAssessmentAxis,
  UserModuleContractIssue,
  UserModuleContractIssueCode,
  UserModuleImplementationState,
  UserModuleModelDraft,
  UserModuleParameterDraft,
  UserModulePortDraft,
} from './userModuleContract';

const quantityTypes = new Set<string>(USER_MODULE_QUANTITY_TYPES);
const units = new Set<string>(USER_MODULE_UNITS);
const evidenceBases = new Set<string>(USER_MODULE_EVIDENCE_BASES);
const authorableModelFamilies = new Set<string>(USER_MODULE_AUTHORABLE_MODEL_FAMILIES);
const reportedUncertaintyMethods = new Set<string>([
  'parameter_interval_envelope',
  'posterior_samples',
  'bootstrap',
  'covariance',
]);
const provenanceRequiredEvidence = new Set<string>([
  'measured_single_context',
  'measured_multiple_contexts',
  'externally_validated',
  'fitted_from_published_data',
]);
const provenanceKinds = new Set<string>([
  'dataset',
  'publication',
  'repository_record',
  'user_note',
]);
const runtimeBlockingSemanticIssues = new Set<UserModuleContractIssueCode>([
  'port_id_missing',
  'unsupported_quantity_type',
  'unsupported_unit',
  'duplicate_port_id',
  'duplicate_model_port_reference',
  'model_port_unknown',
  'model_input_direction_invalid',
  'model_output_direction_invalid',
  'model_input_arity_unsupported',
  'model_output_arity_unsupported',
  'input_port_not_modeled',
  'output_port_not_modeled',
  'parameter_non_finite',
  'hill_parameter_missing',
  'hill_parameter_not_positive',
  'hill_k_unit_mismatch',
  'hill_n_unit_invalid',
  'hill_output_unit_mismatch',
  'hill_output_bounds_invalid',
  'linear_parameter_missing',
  'linear_scale_unit_invalid',
  'linear_intercept_unit_mismatch',
  'linear_dimension_mismatch',
  'independent_input_arity_invalid',
  'independent_input_term_coverage_invalid',
  'independent_term_parameter_invalid',
  'independent_term_unit_mismatch',
  'independent_aggregation_invalid',
  'independent_interaction_assumption_invalid',
  'independent_output_parameter_missing',
  'independent_output_parameter_invalid',
  'independent_output_unit_mismatch',
  'validity_domain_missing',
  'validity_domain_duplicate',
  'validity_domain_port_unknown',
  'validity_domain_bounds_invalid',
  'validity_domain_unit_mismatch',
]);

export function assessUserDefinedFunctionalModule(
  draft: UserDefinedFunctionalModuleDraft,
): UserDefinedFunctionalModuleAssessment {
  const semanticIssues: UserModuleContractIssue[] = [];
  const representationIssues: UserModuleContractIssue[] = [];
  const runtimeIssues: UserModuleContractIssue[] = [];
  const evidenceIssues: UserModuleContractIssue[] = [];
  const implementationIssues: UserModuleContractIssue[] = [];

  validateIdentity(draft, semanticIssues);
  const ports = validatePorts(draft.ports, semanticIssues);
  validateModelPorts(draft, ports, semanticIssues);
  validateModelMathematics(draft, ports, semanticIssues);
  validateValidityDomains(draft, ports, semanticIssues);
  validateContextAndUncertainty(draft, semanticIssues);

  const evidence = validateEvidence(draft, evidenceIssues);
  const implementation = validateImplementation(draft, implementationIssues);
  auditRepresentation(draft, ports, representationIssues);

  if (!authorableModelFamilies.has(draft.model.family)) {
    runtimeIssues.push(issue('runtime', 'model_family_not_executable', 'model.family'));
  } else if (semanticIssues.some((item) => runtimeBlockingSemanticIssues.has(item.code))) {
    runtimeIssues.push(issue('runtime', 'mathematical_contract_incomplete', 'model'));
  }

  return deepFreeze({
    moduleId: draft.id,
    semantic: {
      state: semanticIssues.length === 0 ? 'valid' : 'invalid',
      issues: semanticIssues,
    },
    representation: {
      state: representationIssues.length === 0 ? 'lossless' : 'requires_ir_extension',
      issues: representationIssues,
    },
    runtime: {
      state: runtimeIssues.length === 0 ? 'supported' : 'unsupported',
      issues: runtimeIssues,
    },
    evidence: {
      basis: draft.evidence.basis,
      provenanceState: evidence.provenanceState,
      issues: evidenceIssues,
    },
    implementation: {
      state: implementation.state,
      issues: implementationIssues,
    },
  });
}

function validateIdentity(
  draft: UserDefinedFunctionalModuleDraft,
  issues: UserModuleContractIssue[],
): void {
  if (draft.origin !== USER_DEFINED_MODULE_ORIGIN) {
    issues.push(issue('semantic', 'authoring_origin_invalid', 'origin'));
  }
  if (!hasText(draft.id)) issues.push(issue('semantic', 'module_id_missing', 'id'));
  if (!hasText(draft.name)) issues.push(issue('semantic', 'module_name_missing', 'name'));
}

function validatePorts(
  draftPorts: readonly UserModulePortDraft[],
  issues: UserModuleContractIssue[],
): ReadonlyMap<string, UserModulePortDraft> {
  const ports = new Map<string, UserModulePortDraft>();
  for (const [index, port] of draftPorts.entries()) {
    const path = `ports[${index}]`;
    if (!hasText(port.id)) issues.push(issue('semantic', 'port_id_missing', `${path}.id`));
    if (!hasText(port.name)) issues.push(issue('semantic', 'port_name_missing', `${path}.name`));
    if (!hasText(port.entity.id)) {
      issues.push(issue('semantic', 'entity_id_missing', `${path}.entity.id`));
    }
    if (!hasText(port.entity.displayName)) {
      issues.push(issue('semantic', 'entity_name_missing', `${path}.entity.displayName`));
    }
    if (!quantityTypes.has(port.quantityType)) {
      issues.push(issue('semantic', 'unsupported_quantity_type', `${path}.quantityType`));
    }
    if (!units.has(port.unit)) {
      issues.push(issue('semantic', 'unsupported_unit', `${path}.unit`));
    }
    if (ports.has(port.id)) {
      issues.push(issue('semantic', 'duplicate_port_id', `${path}.id`));
    } else {
      ports.set(port.id, port);
    }
  }
  return ports;
}

function validateModelPorts(
  draft: UserDefinedFunctionalModuleDraft,
  ports: ReadonlyMap<string, UserModulePortDraft>,
  issues: UserModuleContractIssue[],
): void {
  const inputIds = new Set(draft.model.inputPortIds);
  const outputIds = new Set(draft.model.outputPortIds);
  if (
    inputIds.size !== draft.model.inputPortIds.length ||
    outputIds.size !== draft.model.outputPortIds.length
  ) {
    issues.push(issue('semantic', 'duplicate_model_port_reference', 'model'));
  }

  for (const [index, portId] of draft.model.inputPortIds.entries()) {
    const port = ports.get(portId);
    if (!port) {
      issues.push(issue('semantic', 'model_port_unknown', `model.inputPortIds[${index}]`));
    } else if (port.direction !== 'input') {
      issues.push(
        issue('semantic', 'model_input_direction_invalid', `model.inputPortIds[${index}]`),
      );
    }
  }
  for (const [index, portId] of draft.model.outputPortIds.entries()) {
    const port = ports.get(portId);
    if (!port) {
      issues.push(issue('semantic', 'model_port_unknown', `model.outputPortIds[${index}]`));
    } else if (port.direction !== 'output') {
      issues.push(
        issue('semantic', 'model_output_direction_invalid', `model.outputPortIds[${index}]`),
      );
    }
  }

  for (const [index, port] of draft.ports.entries()) {
    if (port.direction === 'input' && !inputIds.has(port.id)) {
      issues.push(issue('semantic', 'input_port_not_modeled', `ports[${index}].id`));
    }
    if (port.direction === 'output' && !outputIds.has(port.id)) {
      issues.push(issue('semantic', 'output_port_not_modeled', `ports[${index}].id`));
    }
  }

  if (draft.model.outputPortIds.length !== 1) {
    issues.push(issue('semantic', 'model_output_arity_unsupported', 'model.outputPortIds'));
  }
  if (
    draft.model.family !== 'independent_inputs' &&
    authorableModelFamilies.has(draft.model.family) &&
    draft.model.inputPortIds.length !== 1
  ) {
    issues.push(issue('semantic', 'model_input_arity_unsupported', 'model.inputPortIds'));
  }
}

function validateModelMathematics(
  draft: UserDefinedFunctionalModuleDraft,
  ports: ReadonlyMap<string, UserModulePortDraft>,
  issues: UserModuleContractIssue[],
): void {
  if (!authorableModelFamilies.has(draft.model.family)) {
    issues.push(issue('semantic', 'unsupported_model_family', 'model.family'));
    return;
  }
  if (draft.model.family === 'hill_activation' || draft.model.family === 'hill_repression') {
    validateHill(draft.model, ports, issues);
    return;
  }
  if (draft.model.family === 'linear_transfer') {
    validateLinear(draft.model, ports, issues);
    return;
  }
  validateIndependentInputs(draft.model, ports, issues);
}

function validateHill(
  model: UserModuleModelDraft,
  ports: ReadonlyMap<string, UserModulePortDraft>,
  issues: UserModuleContractIssue[],
): void {
  const input = ports.get(model.inputPortIds[0] ?? '');
  const output = ports.get(model.outputPortIds[0] ?? '');
  const k = requiredParameter(model, 'k', 'hill_parameter_missing', issues);
  const n = requiredParameter(model, 'n', 'hill_parameter_missing', issues);
  const ymin = requiredParameter(model, 'ymin', 'hill_parameter_missing', issues);
  const ymax = requiredParameter(model, 'ymax', 'hill_parameter_missing', issues);

  validateFiniteParameter(k, 'model.parameters.k', issues);
  validateFiniteParameter(n, 'model.parameters.n', issues);
  validateFiniteParameter(ymin, 'model.parameters.ymin', issues);
  validateFiniteParameter(ymax, 'model.parameters.ymax', issues);
  if (k && (!Number.isFinite(k.value) || k.value <= 0)) {
    issues.push(issue('semantic', 'hill_parameter_not_positive', 'model.parameters.k.value'));
  }
  if (n && (!Number.isFinite(n.value) || n.value <= 0)) {
    issues.push(issue('semantic', 'hill_parameter_not_positive', 'model.parameters.n.value'));
  }
  if (k && input && k.unit !== input.unit) {
    issues.push(issue('semantic', 'hill_k_unit_mismatch', 'model.parameters.k.unit'));
  }
  if (n && n.unit !== 'dimensionless') {
    issues.push(issue('semantic', 'hill_n_unit_invalid', 'model.parameters.n.unit'));
  }
  for (const [name, parameter] of [
    ['ymin', ymin],
    ['ymax', ymax],
  ] as const) {
    if (parameter && output && parameter.unit !== output.unit) {
      issues.push(issue('semantic', 'hill_output_unit_mismatch', `model.parameters.${name}.unit`));
    }
  }
  if (ymin && ymax && Number.isFinite(ymin.value) && Number.isFinite(ymax.value)) {
    if (ymax.value < ymin.value) {
      issues.push(issue('semantic', 'hill_output_bounds_invalid', 'model.parameters'));
    }
  }
}

function validateLinear(
  model: UserModuleModelDraft,
  ports: ReadonlyMap<string, UserModulePortDraft>,
  issues: UserModuleContractIssue[],
): void {
  const input = ports.get(model.inputPortIds[0] ?? '');
  const output = ports.get(model.outputPortIds[0] ?? '');
  const scale = requiredParameter(model, 'scale', 'linear_parameter_missing', issues);
  const intercept = requiredParameter(model, 'intercept', 'linear_parameter_missing', issues);
  validateFiniteParameter(scale, 'model.parameters.scale', issues);
  validateFiniteParameter(intercept, 'model.parameters.intercept', issues);
  if (scale && scale.unit !== 'dimensionless') {
    issues.push(issue('semantic', 'linear_scale_unit_invalid', 'model.parameters.scale.unit'));
  }
  if (intercept && output && intercept.unit !== output.unit) {
    issues.push(
      issue('semantic', 'linear_intercept_unit_mismatch', 'model.parameters.intercept.unit'),
    );
  }
  if (input && output && input.unit !== output.unit) {
    issues.push(issue('semantic', 'linear_dimension_mismatch', 'model'));
  }
}

function validateIndependentInputs(
  model: UserModuleModelDraft,
  ports: ReadonlyMap<string, UserModulePortDraft>,
  issues: UserModuleContractIssue[],
): void {
  if (model.inputPortIds.length < 2) {
    issues.push(issue('semantic', 'independent_input_arity_invalid', 'model.inputPortIds'));
  }
  const terms = model.terms ?? [];
  const expectedIds = [...model.inputPortIds].sort();
  const termIds = terms.map((term) => term.inputPortId).sort();
  if (
    expectedIds.length !== termIds.length ||
    expectedIds.some((portId, index) => portId !== termIds[index])
  ) {
    issues.push(issue('semantic', 'independent_input_term_coverage_invalid', 'model.terms'));
  }

  for (const [index, term] of terms.entries()) {
    const path = `model.terms[${index}]`;
    const input = ports.get(term.inputPortId);
    const numericParameters = [term.k, term.n, term.weight];
    if (
      !['activation', 'repression'].includes(term.mode) ||
      numericParameters.some(
        (parameter) => !Number.isFinite(parameter.value) || parameter.value <= 0,
      )
    ) {
      issues.push(issue('semantic', 'independent_term_parameter_invalid', path));
    }
    if (
      (input && term.k.unit !== input.unit) ||
      term.n.unit !== 'dimensionless' ||
      term.weight.unit !== 'dimensionless'
    ) {
      issues.push(issue('semantic', 'independent_term_unit_mismatch', path));
    }
  }
  if (!['bounded_sum', 'multiplicative'].includes(model.aggregation ?? '')) {
    issues.push(issue('semantic', 'independent_aggregation_invalid', 'model.aggregation'));
  }
  if (model.interactionAssumption !== 'independent_unverified') {
    issues.push(
      issue(
        'semantic',
        'independent_interaction_assumption_invalid',
        'model.interactionAssumption',
      ),
    );
  }

  const output = ports.get(model.outputPortIds[0] ?? '');
  const basal = model.parameters.basal;
  const maximum = model.parameters.outputMaximum;
  if (!basal) {
    issues.push(
      issue('semantic', 'independent_output_parameter_missing', 'model.parameters.basal'),
    );
  }
  if (!maximum) {
    issues.push(
      issue('semantic', 'independent_output_parameter_missing', 'model.parameters.outputMaximum'),
    );
  }
  if (
    (basal && !Number.isFinite(basal.value)) ||
    (maximum && (!Number.isFinite(maximum.value) || maximum.value < (basal?.value ?? 0)))
  ) {
    issues.push(issue('semantic', 'independent_output_parameter_invalid', 'model.parameters'));
  }
  if (
    output &&
    ((basal && basal.unit !== output.unit) || (maximum && maximum.unit !== output.unit))
  ) {
    issues.push(issue('semantic', 'independent_output_unit_mismatch', 'model.parameters'));
  }
}

function validateValidityDomains(
  draft: UserDefinedFunctionalModuleDraft,
  ports: ReadonlyMap<string, UserModulePortDraft>,
  issues: UserModuleContractIssue[],
): void {
  const inputIds = new Set(draft.model.inputPortIds);
  for (const [index, portId] of draft.model.inputPortIds.entries()) {
    const matches = draft.validityDomains.filter((domain) => domain.portId === portId);
    if (matches.length === 0) {
      issues.push(issue('semantic', 'validity_domain_missing', `model.inputPortIds[${index}]`));
    } else if (matches.length > 1) {
      issues.push(issue('semantic', 'validity_domain_duplicate', 'validityDomains'));
    }
  }
  for (const [index, domain] of draft.validityDomains.entries()) {
    const path = `validityDomains[${index}]`;
    const port = ports.get(domain.portId);
    if (!port || !inputIds.has(domain.portId)) {
      issues.push(issue('semantic', 'validity_domain_port_unknown', `${path}.portId`));
    }
    if (
      !Number.isFinite(domain.minimum) ||
      !Number.isFinite(domain.maximum) ||
      domain.minimum >= domain.maximum
    ) {
      issues.push(issue('semantic', 'validity_domain_bounds_invalid', path));
    }
    if (port && domain.unit !== port.unit) {
      issues.push(issue('semantic', 'validity_domain_unit_mismatch', `${path}.unit`));
    }
  }
}

function validateContextAndUncertainty(
  draft: UserDefinedFunctionalModuleDraft,
  issues: UserModuleContractIssue[],
): void {
  if (draft.context.state === 'defined') {
    const { hostSpecies, hostStrain, medium, temperatureCelsius, ph } = draft.context.facts;
    if (
      [hostSpecies, hostStrain, medium].some((value) => value !== undefined && !hasText(value)) ||
      (temperatureCelsius !== undefined && !Number.isFinite(temperatureCelsius)) ||
      (ph !== undefined && (!Number.isFinite(ph) || ph < 0 || ph > 14))
    ) {
      issues.push(issue('semantic', 'context_fact_invalid', 'context.facts'));
    }
  }
  if (
    draft.uncertainty.state === 'reported' &&
    !reportedUncertaintyMethods.has(draft.uncertainty.method)
  ) {
    issues.push(issue('semantic', 'uncertainty_method_invalid', 'uncertainty.method'));
  }
}

function validateEvidence(
  draft: UserDefinedFunctionalModuleDraft,
  issues: UserModuleContractIssue[],
): { readonly provenanceState: 'not_required' | 'sufficient' | 'missing' } {
  if (!evidenceBases.has(draft.evidence.basis)) {
    issues.push(issue('evidence', 'unsupported_evidence_basis', 'evidence.basis'));
  }
  const validProvenance = draft.evidence.provenance.filter(
    (entry) => hasText(entry.id) && provenanceKinds.has(entry.kind) && hasText(entry.reference),
  );
  if (validProvenance.length !== draft.evidence.provenance.length) {
    issues.push(issue('evidence', 'provenance_record_invalid', 'evidence.provenance'));
  }
  const provenanceRequired = provenanceRequiredEvidence.has(draft.evidence.basis);
  if (provenanceRequired && validProvenance.length === 0) {
    issues.push(issue('evidence', 'measured_evidence_provenance_missing', 'evidence.provenance'));
  }
  if (
    draft.model.family === 'independent_inputs' &&
    draft.evidence.basis !== 'independent_assumption'
  ) {
    issues.push(issue('evidence', 'independent_assumption_evidence_missing', 'evidence.basis'));
  }
  if (draft.evidence.provenance.length === 0 && !provenanceRequired) {
    return { provenanceState: 'not_required' };
  }
  return {
    provenanceState:
      validProvenance.length > 0 && validProvenance.length === draft.evidence.provenance.length
        ? 'sufficient'
        : 'missing',
  };
}

function validateImplementation(
  draft: UserDefinedFunctionalModuleDraft,
  issues: UserModuleContractIssue[],
): { readonly state: UserModuleImplementationState | 'unrecognized' } {
  const state = isImplementationState(draft.implementation.state)
    ? draft.implementation.state
    : 'unrecognized';
  if (state === 'unrecognized') {
    issues.push(issue('implementation', 'implementation_state_invalid', 'implementation.state'));
  } else if (state === 'unspecified' && draft.implementation.implementationIds.length > 0) {
    issues.push(
      issue(
        'implementation',
        'unspecified_implementation_has_ids',
        'implementation.implementationIds',
      ),
    );
  } else if (
    state !== 'unspecified' &&
    !draft.implementation.implementationIds.some((id) => hasText(id))
  ) {
    issues.push(
      issue(
        'implementation',
        'specified_implementation_ids_missing',
        'implementation.implementationIds',
      ),
    );
  }
  return { state };
}

function auditRepresentation(
  draft: UserDefinedFunctionalModuleDraft,
  ports: ReadonlyMap<string, UserModulePortDraft>,
  issues: UserModuleContractIssue[],
): void {
  issues.push(issue('representation', 'authoring_origin_not_representable', 'origin'));
  if (hasText(draft.name)) {
    issues.push(issue('representation', 'user_name_not_representable', 'name'));
  }
  if (hasText(draft.description ?? '')) {
    issues.push(issue('representation', 'free_description_not_representable', 'description'));
  }
  if (draft.ports.length > 0) {
    issues.push(issue('representation', 'custom_entity_registry_missing', 'ports'));
  }
  if (draft.context.state === 'not_recorded') {
    issues.push(issue('representation', 'unrecorded_context_not_representable', 'context'));
  } else if (!hasCompleteContext(draft.context.facts)) {
    issues.push(issue('representation', 'partial_context_not_representable', 'context'));
  }
  if (draft.uncertainty.state === 'not_recorded') {
    issues.push(issue('representation', 'unrecorded_uncertainty_not_representable', 'uncertainty'));
  } else if (draft.uncertainty.state === 'none') {
    issues.push(issue('representation', 'no_uncertainty_not_representable', 'uncertainty'));
  }
  if (draft.evidence.provenance.length > 0) {
    issues.push(
      issue('representation', 'generic_provenance_not_representable', 'evidence.provenance'),
    );
  }
  issues.push(
    issue('representation', 'implementation_maturity_not_explicit', 'implementation.state'),
  );
  if (draft.model.outputPortIds.length !== 1) {
    issues.push(
      issue('representation', 'model_output_binding_not_representable', 'model.outputPortIds'),
    );
  }
  if (draft.model.family === 'linear_transfer') {
    const input = ports.get(draft.model.inputPortIds[0] ?? '');
    const output = ports.get(draft.model.outputPortIds[0] ?? '');
    if (input && output && input.unit !== output.unit) {
      issues.push(
        issue('representation', 'compound_linear_scale_unit_missing', 'model.parameters.scale'),
      );
    }
  } else if (!authorableModelFamilies.has(draft.model.family)) {
    issues.push(issue('representation', 'model_family_not_representable', 'model.family'));
  }
}

function requiredParameter(
  model: UserModuleModelDraft,
  name: string,
  missingCode: 'hill_parameter_missing' | 'linear_parameter_missing',
  issues: UserModuleContractIssue[],
): UserModuleParameterDraft | undefined {
  const parameter = model.parameters[name];
  if (!parameter) {
    issues.push(issue('semantic', missingCode, `model.parameters.${name}`));
  }
  return parameter;
}

function validateFiniteParameter(
  parameter: UserModuleParameterDraft | undefined,
  path: string,
  issues: UserModuleContractIssue[],
): void {
  if (!parameter) return;
  const interval = parameter.interval95;
  if (
    !Number.isFinite(parameter.value) ||
    (interval !== undefined &&
      (!Number.isFinite(interval[0]) || !Number.isFinite(interval[1]) || interval[0] > interval[1]))
  ) {
    issues.push(issue('semantic', 'parameter_non_finite', path));
  }
}

function hasCompleteContext(facts: {
  readonly hostSpecies?: string;
  readonly hostStrain?: string;
  readonly medium?: string;
  readonly temperatureCelsius?: number;
}): boolean {
  return (
    hasText(facts.hostSpecies ?? '') &&
    hasText(facts.hostStrain ?? '') &&
    hasText(facts.medium ?? '') &&
    Number.isFinite(facts.temperatureCelsius)
  );
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function isImplementationState(value: string): value is UserModuleImplementationState {
  return (
    value === 'unspecified' ||
    value === 'designed' ||
    value === 'candidate' ||
    value === 'reported' ||
    value === 'validated'
  );
}

function issue(
  axis: UserModuleAssessmentAxis,
  code: UserModuleContractIssueCode,
  path: string,
): UserModuleContractIssue {
  return { axis, code, path };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
