import type {
  SenderExtensionComponentsDocument,
  SenderExtensionSourcePackageInput,
  SenderExtensionValidationIssue,
  SenderOutputsDocument,
  SenderValidationReport,
} from './senderExtensionTypes';
import {
  addSenderExtensionIssue,
  isSenderExtensionJsonValue,
  isSenderExtensionRecord,
  requireSenderBoolean,
  requireSenderNullableNumber,
  requireSenderNullableRange,
  requireSenderNullableString,
  requireSenderString,
  requireSenderStringArray,
} from './senderExtensionValidationUtils';

const SOFTWARE_STATUSES = new Set([
  'calibration_candidate',
  'effective_pair_only',
  'reference_only',
]);
const INPUT_KINDS = new Set([
  'constitutive_endpoint',
  'discrete_construct',
  'inducer_concentration',
  'substrate_concentration',
]);
const OUTPUT_QUANTITIES = new Set([
  'extracellular_concentration',
  'normalized_output',
  'production_rate',
  'titer',
]);
const MODEL_TYPES = new Set(['none', 'lookup_table', 'endpoint_constant', 'reported']);

export interface SenderExtensionJsonDocuments {
  componentsDocument: SenderExtensionComponentsDocument;
  outputsDocument: SenderOutputsDocument;
  validationReport: SenderValidationReport;
}

export function validateSenderExtensionJsonDocuments(
  input: Pick<
    SenderExtensionSourcePackageInput,
    'componentsDocument' | 'outputsDocument' | 'validationReport'
  >,
  errors: SenderExtensionValidationIssue[],
): SenderExtensionJsonDocuments | null {
  validateComponentsDocument(input.componentsDocument, errors);
  validateOutputsDocument(input.outputsDocument, errors);
  validateValidationReport(input.validationReport, errors);
  if (
    !isSenderExtensionRecord(input.componentsDocument) ||
    !isSenderExtensionRecord(input.outputsDocument) ||
    !isSenderExtensionRecord(input.validationReport)
  )
    return null;
  return {
    componentsDocument: input.componentsDocument as unknown as SenderExtensionComponentsDocument,
    outputsDocument: input.outputsDocument as unknown as SenderOutputsDocument,
    validationReport: input.validationReport as unknown as SenderValidationReport,
  };
}

function validateComponentsDocument(
  value: unknown,
  errors: SenderExtensionValidationIssue[],
): void {
  const path = 'sender_components_v1_2.json';
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  validateComponentReleaseMetadata(value.release_metadata, path + '.release_metadata', errors);
  const signals = requiredArray(value, 'new_signals', path, errors);
  const contexts = requiredArray(value, 'new_parameter_contexts', path, errors);
  const components = requiredArray(value, 'new_sender_components', path, errors);
  const links = requiredArray(value, 'existing_v1_1_sender_component_links', path, errors);
  signals.forEach((item, index) => validateSignal(item, 'new_signals[' + index + ']', errors));
  contexts.forEach((item, index) =>
    validateContext(item, 'new_parameter_contexts[' + index + ']', errors),
  );
  components.forEach((item, index) =>
    validateComponent(item, 'new_sender_components[' + index + ']', errors),
  );
  links.forEach((item, index) => {
    const itemPath = 'existing_v1_1_sender_component_links[' + index + ']';
    if (!isSenderExtensionRecord(item)) {
      addSenderExtensionIssue(errors, itemPath, 'schema', 'must be an object');
      return;
    }
    requireSenderString(item, 'sender_component_id', itemPath, errors);
    requireSenderString(item, 'new_sender_output_id', itemPath, errors);
    if (item.base_record_modified !== false)
      addSenderExtensionIssue(
        errors,
        itemPath + '.base_record_modified',
        'base-overwrite',
        'must be false',
      );
  });
}

function validateComponentReleaseMetadata(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  for (const field of [
    'release_name',
    'version',
    'release_date',
    'release_type',
    'base_release',
    'base_sha256',
    'id_policy',
    'last_verified_at',
  ])
    requireSenderString(value, field, path, errors);
  requireSenderBoolean(value, 'base_records_immutable', path, errors);
  if (!isSenderExtensionRecord(value.attachment_context))
    addSenderExtensionIssue(errors, path + '.attachment_context', 'schema', 'must be an object');
  else
    for (const field of ['requested_report', 'materialized_report', 'note'])
      requireSenderString(value.attachment_context, field, path + '.attachment_context', errors);
}

function validateSignal(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  for (const field of [
    'id',
    'canonical_name',
    'display_name_en',
    'display_name_zh',
    'signal_class',
    'acyl_chain',
    'substitution',
    'stereochemistry',
    'chemical_identity_status',
    'reconstruction_status',
    'usage_scope',
    'revision_status',
    'last_verified_at',
    'change_reason',
  ])
    requireSenderString(value, field, path, errors);
  for (const field of [
    'common_abbreviations',
    'source_ids',
    'identity_resolution_notes',
    'verification_basis',
  ])
    requireSenderStringArray(value, field, path, errors);
  requireSenderNullableString(value, 'molecular_formula', path, errors);
  requireSenderNullableString(value, 'notes', path, errors);
  requireSenderNullableNumber(value, 'pubchem_cid', path, errors);
  requireSenderBoolean(value, 'unsaturation', path, errors);
  requireSenderBoolean(value, 'quantitative_use_allowed', path, errors);
}

function validateContext(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  for (const field of ['id', 'source_id', 'revision_status', 'last_verified_at', 'change_reason'])
    requireSenderString(value, field, path, errors);
  for (const field of [
    'host_species',
    'host_strain',
    'vector_system',
    'promoter_configuration',
    'reporter',
    'culture_medium',
    'temperature',
    'induction_conditions',
    'exposure_time',
    'measurement_platform',
    'measurement_unit',
    'normalization_method',
    'background_subtraction',
    'notes',
  ])
    requireSenderNullableString(value, field, path, errors);
  requireSenderNullableNumber(value, 'biological_replicates', path, errors);
  requireSenderNullableNumber(value, 'technical_replicates', path, errors);
  requireSenderStringArray(value, 'applicable_component_ids', path, errors);
  requireSenderStringArray(value, 'verification_basis', path, errors);
  if (!isSenderExtensionRecord(value.measurement_details))
    addSenderExtensionIssue(errors, path + '.measurement_details', 'schema', 'must be an object');
  else if (!isSenderExtensionJsonValue(value.measurement_details))
    addSenderExtensionIssue(
      errors,
      path + '.measurement_details',
      'schema',
      'must contain JSON values',
    );
}

function validateComponent(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  for (const field of [
    'id',
    'display_name_en',
    'display_name_zh',
    'parameter_context_id',
    'sequence_status',
    'software_status',
    'reconstruction_status',
    'revision_status',
    'last_verified_at',
    'change_reason',
  ])
    requireSenderString(value, field, path, errors);
  if (value.component_type !== 'sender')
    addSenderExtensionIssue(errors, path + '.component_type', 'schema', 'must equal sender');
  if (!SOFTWARE_STATUSES.has(String(value.software_status)))
    addSenderExtensionIssue(
      errors,
      path + '.software_status',
      'schema',
      'contains an unsupported status',
    );
  for (const field of [
    'regulator_or_enzyme',
    'promoter',
    'reporter',
    'host_species',
    'host_strain',
    'vector_or_backbone',
    'copy_number_or_replication_context',
    'expression_configuration',
    'sequence_reference',
    'input_port',
    'output_port',
    'output_signal_id',
    'notes',
  ])
    requireSenderNullableString(value, field, path, errors);
  requireSenderBoolean(value, 'construction_ready', path, errors);
  requireSenderBoolean(value, 'simulation_ready', path, errors);
  for (const field of ['source_ids', 'evidence_gap', 'verification_basis'])
    requireSenderStringArray(value, field, path, errors);
  if (!isSenderExtensionJsonValue(value.sequence_metadata))
    addSenderExtensionIssue(errors, path + '.sequence_metadata', 'schema', 'must be JSON data');
}

function validateOutputsDocument(value: unknown, errors: SenderExtensionValidationIssue[]): void {
  const path = 'sender_outputs_v1_2.json';
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  validateOutputsReleaseMetadata(value.release_metadata, path + '.release_metadata', errors);
  const outputs = requiredArray(value, 'sender_outputs', path, errors);
  outputs.forEach((item, index) => validateOutput(item, 'sender_outputs[' + index + ']', errors));
}

function validateOutputsReleaseMetadata(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  for (const field of ['release_name', 'version', 'release_date', 'base_sha256', 'policy'])
    requireSenderString(value, field, path, errors);
  for (const field of ['runtime_quantitative_count', 'runtime_demo_count'])
    requireSenderNullableNumber(value, field, path, errors);
}

function validateOutput(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  for (const field of [
    'id',
    'sender_component_id',
    'parameter_context_id',
    'software_status',
    'evidence_quality',
    'evidence_location',
    'last_verified_at',
  ])
    requireSenderString(value, field, path, errors);
  if (!SOFTWARE_STATUSES.has(String(value.software_status)))
    addSenderExtensionIssue(
      errors,
      path + '.software_status',
      'schema',
      'contains an unsupported status',
    );
  if (!['B', 'C', 'D'].includes(String(value.evidence_quality)))
    addSenderExtensionIssue(
      errors,
      path + '.evidence_quality',
      'schema',
      'contains an unsupported grade',
    );
  requireSenderNullableString(value, 'output_signal_id', path, errors);
  for (const field of [
    'numerical_execution_allowed',
    'normalized_demo_only',
    'decomposition_prohibited',
  ])
    requireSenderBoolean(value, field, path, errors);
  for (const field of ['source_ids', 'verification_basis', 'notes', 'missing_fields'])
    requireSenderStringArray(value, field, path, errors);
  validateInput(value.input_definition, path + '.input_definition', errors);
  validateOutputDefinition(value.output_definition, path + '.output_definition', errors);
  validateModel(value.model, path + '.model', errors);
  validateMeasurement(value.measurement, path + '.measurement', errors);
  const profile = arrayValue(value.product_profile, path + '.product_profile', errors);
  profile.forEach((item, index) =>
    validateProductProfile(item, path + '.product_profile[' + index + ']', errors),
  );
  const rawPoints = arrayValue(value.raw_points, path + '.raw_points', errors);
  rawPoints.forEach((item, index) =>
    validateEmbeddedRaw(item, path + '.raw_points[' + index + ']', errors),
  );
}

function validateInput(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  requireSenderString(value, 'kind', path, errors);
  if (!INPUT_KINDS.has(String(value.kind)))
    addSenderExtensionIssue(errors, path + '.kind', 'schema', 'contains an unsupported kind');
  requireSenderNullableString(value, 'signal_id', path, errors);
  requireSenderString(value, 'name', path, errors);
  requireSenderNullableString(value, 'unit', path, errors);
  requireSenderNullableRange(value.working_range, path + '.working_range', errors);
}

function validateOutputDefinition(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  requireSenderString(value, 'kind', path, errors);
  if (!OUTPUT_QUANTITIES.has(String(value.kind)))
    addSenderExtensionIssue(errors, path + '.kind', 'schema', 'contains an unsupported quantity');
  for (const field of [
    'unit',
    'compartment',
    'normalization_basis',
    'timepoint',
    'steady_state_definition',
  ])
    requireSenderNullableString(value, field, path, errors);
}

function validateProductProfile(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  requireSenderString(value, 'signal_id', path, errors);
  requireSenderString(value, 'identity_status', path, errors);
  requireSenderNullableNumber(value, 'fraction', path, errors);
  requireSenderNullableString(value, 'fraction_unit', path, errors);
}

function validateModel(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  requireSenderString(value, 'model_type', path, errors);
  if (!MODEL_TYPES.has(String(value.model_type)))
    addSenderExtensionIssue(
      errors,
      path + '.model_type',
      'schema',
      'contains an unsupported model type',
    );
  requireSenderNullableString(value, 'formula', path, errors);
  if (!isSenderExtensionRecord(value.parameters) || !isSenderExtensionJsonValue(value.parameters))
    addSenderExtensionIssue(errors, path + '.parameters', 'schema', 'must be a JSON object');
  requireSenderNullableRange(value.valid_input_range, path + '.valid_input_range', errors);
  requireSenderNullableRange(value.valid_output_range, path + '.valid_output_range', errors);
  requireSenderNullableNumber(value, 'r_squared', path, errors);
  requireSenderNullableNumber(value, 'rmse', path, errors);
  requireSenderNullableString(value, 'fit_method', path, errors);
  requireSenderString(value, 'reported_or_refit', path, errors);
}

function validateMeasurement(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  for (const field of ['method', 'instrument', 'standard', 'internal_standard'])
    requireSenderNullableString(value, field, path, errors);
  requireSenderBoolean(value, 'calibration_curve_reported', path, errors);
  if (!isSenderExtensionJsonValue(value.lod))
    addSenderExtensionIssue(errors, path + '.lod', 'schema', 'must preserve JSON evidence');
  if (!isSenderExtensionJsonValue(value.loq))
    addSenderExtensionIssue(errors, path + '.loq', 'schema', 'must preserve JSON evidence');
  requireSenderBoolean(value, 'direct_signal_measurement', path, errors);
}

function validateEmbeddedRaw(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  for (const field of ['input', 'output', 'replicate_count', 'error_value'])
    requireSenderNullableNumber(value, field, path, errors);
  requireSenderNullableString(value, 'error_type', path, errors);
  if ('input_label' in value) requireSenderNullableString(value, 'input_label', path, errors);
}

function validateValidationReport(value: unknown, errors: SenderExtensionValidationIssue[]): void {
  const path = 'sender_validation_report.json';
  if (!isSenderExtensionRecord(value)) {
    addSenderExtensionIssue(errors, path, 'schema', 'must be an object');
    return;
  }
  for (const field of ['release', 'validated_at', 'overall_status'])
    requireSenderString(value, field, path, errors);
  if (!isSenderExtensionRecord(value.base_release))
    addSenderExtensionIssue(errors, path + '.base_release', 'schema', 'must be an object');
  else {
    requireSenderString(value.base_release, 'version', path + '.base_release', errors);
    requireSenderString(value.base_release, 'sha256', path + '.base_release', errors);
    requireSenderBoolean(value.base_release, 'immutable', path + '.base_release', errors);
  }
  if (!isSenderExtensionRecord(value.counts))
    addSenderExtensionIssue(errors, path + '.counts', 'schema', 'must be an object');
  else
    for (const field of [
      'new_signals',
      'new_components',
      'new_parameter_contexts',
      'sender_outputs',
      'raw_points',
      'function_parameter_rows',
      'sources',
      'rejected_candidates',
      'evidence_trace_rows',
    ])
      requireFiniteNumber(value.counts, field, path + '.counts', errors);
  for (const field of ['software_status_counts', 'evidence_quality_counts'])
    if (!isSenderExtensionRecord(value[field]))
      addSenderExtensionIssue(errors, path + '.' + field, 'schema', 'must be an object');
  const checks = arrayValue(value.checks, path + '.checks', errors);
  checks.forEach((item, index) => {
    const checkPath = path + '.checks[' + index + ']';
    if (!isSenderExtensionRecord(item)) {
      addSenderExtensionIssue(errors, checkPath, 'schema', 'must be an object');
      return;
    }
    for (const field of ['name', 'severity']) requireSenderString(item, field, checkPath, errors);
    requireSenderBoolean(item, 'passed', checkPath, errors);
    if (!isSenderExtensionJsonValue(item.details))
      addSenderExtensionIssue(
        errors,
        checkPath + '.details',
        'schema',
        'must preserve JSON evidence',
      );
  });
  requireSenderStringArray(value, 'warnings', path, errors);
}

function requiredArray(
  value: Record<string, unknown>,
  field: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): unknown[] {
  return arrayValue(value[field], path + '.' + field, errors);
}

function arrayValue(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): unknown[] {
  if (Array.isArray(value)) return value;
  addSenderExtensionIssue(errors, path, 'schema', 'must be an array');
  return [];
}

function requireFiniteNumber(
  value: Record<string, unknown>,
  field: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (typeof value[field] !== 'number' || !Number.isFinite(value[field]))
    addSenderExtensionIssue(errors, path + '.' + field, 'schema', 'must be a finite number');
}
