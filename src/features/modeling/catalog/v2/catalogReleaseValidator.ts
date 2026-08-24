import type { AhlHslComponentCatalogRelease } from './releaseTypes';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from './catalogRuntimeDemoWhitelist';

export interface CatalogReleaseValidationIssue {
  path: string;
  message: string;
  code: string;
}

export type CatalogReleaseValidationResult =
  | {
      ok: true;
      value: AhlHslComponentCatalogRelease;
      fatalErrors: readonly [];
      warnings: readonly CatalogReleaseValidationIssue[];
    }
  | {
      ok: false;
      value?: AhlHslComponentCatalogRelease;
      fatalErrors: readonly CatalogReleaseValidationIssue[];
      warnings: readonly CatalogReleaseValidationIssue[];
    };

const ROOT_ARRAYS = [
  'signals',
  'components',
  'parameter_contexts',
  'receiver_responses',
  'sender_outputs',
  'effective_pairs',
  'compatibility_relations',
  'sources',
] as const;

/** Frozen V1.1 release dimensions; self-reported counts cannot redefine them. */
export const AHL_HSL_V1_1_EXPECTED_COUNTS: Readonly<Record<(typeof ROOT_ARRAYS)[number], number>> =
  Object.freeze({
    signals: 29,
    components: 42,
    parameter_contexts: 7,
    receiver_responses: 52,
    sender_outputs: 0,
    effective_pairs: 13,
    compatibility_relations: 39,
    sources: 22,
  });

export const AHL_HSL_V1_1_EXPECTED_COMPONENT_STATUS_COUNTS: Readonly<Record<string, number>> =
  Object.freeze({
    runtime_demo: 7,
    calibration_candidate: 26,
    compatibility_only: 3,
    reference_only: 6,
  });

export const AHL_HSL_V1_1_EXPECTED_RESPONSE_STATUS_COUNTS: Readonly<Record<string, number>> =
  Object.freeze({
    runtime_demo: 20,
    calibration_candidate: 15,
    compatibility_only: 17,
  });

const COMPONENT_STATUSES = [
  'runtime_demo',
  'calibration_candidate',
  'compatibility_only',
  'reference_only',
  'runtime_quantitative',
  'rejected',
] as const;

const RESPONSE_STATUSES = [
  'runtime_demo',
  'calibration_candidate',
  'compatibility_only',
  'reference_only',
  'runtime_quantitative',
  'rejected',
] as const;

const STATUS_ASSERTION_PATTERN =
  /^(component_status|receiver_status)\.([a-z_]+)\s*==\s*(\d+)$/u;

/**
 * Validate the reconstructed release before the snake_case-to-canonical
 * boundary. Self-authored assertions are advisory and never replace the
 * recalculated arrays or statistics.after_revision values.
 */
export function validateCatalogRelease(value: unknown): CatalogReleaseValidationResult {
  const fatalErrors: CatalogReleaseValidationIssue[] = [];
  const warnings: CatalogReleaseValidationIssue[] = [];

  if (!isRecord(value))
    return failure([{ path: 'release', message: 'must be an object', code: 'type' }], warnings);

  const arrays = new Map<string, unknown[]>();
  for (const field of ROOT_ARRAYS) {
    const items = value[field];
    if (!Array.isArray(items)) {
      add(fatalErrors, `release.${field}`, 'must be an array', 'type');
      arrays.set(field, []);
    } else arrays.set(field, items);
  }

  for (const field of [
    'release_metadata',
    'statistics',
    'validation',
    'software_status_rules',
    'revision_metadata',
  ]) {
    if (!(field in value)) add(fatalErrors, `release.${field}`, 'is required', 'required');
  }

  const ids = new Map<string, Set<string>>();
  for (const field of ROOT_ARRAYS) {
    const seen = new Set<string>();
    ids.set(field, seen);
    for (const [index, item] of (arrays.get(field) ?? []).entries()) {
      if (!isRecord(item)) {
        add(fatalErrors, `release.${field}[${index}]`, 'must be an object', 'type');
        continue;
      }
      const itemId = field === 'sources' ? item.source_id : item.id;
      if (!nonEmptyString(itemId)) {
        add(fatalErrors, `release.${field}[${index}].id`, 'must be a non-empty string', 'id');
        continue;
      }
      if (seen.has(itemId))
        add(fatalErrors, `release.${field}[${index}]`, `duplicate id ${itemId}`, 'duplicate-id');
      seen.add(itemId);
    }
  }

  validateRootRecords(value, fatalErrors);
  validateAdapterConsumedShapes(
    arrays.get('signals') ?? [],
    arrays.get('components') ?? [],
    arrays.get('parameter_contexts') ?? [],
    arrays.get('receiver_responses') ?? [],
    arrays.get('sender_outputs') ?? [],
    arrays.get('effective_pairs') ?? [],
    arrays.get('compatibility_relations') ?? [],
    arrays.get('sources') ?? [],
    fatalErrors,
  );
  validateForeignKeys(
    arrays.get('signals') ?? [],
    arrays.get('components') ?? [],
    arrays.get('parameter_contexts') ?? [],
    arrays.get('receiver_responses') ?? [],
    arrays.get('sender_outputs') ?? [],
    arrays.get('effective_pairs') ?? [],
    arrays.get('compatibility_relations') ?? [],
    arrays.get('sources') ?? [],
    ids,
    fatalErrors,
  );
  validateCounts(value, arrays, fatalErrors);
  validateStatuses(
    value,
    arrays.get('components') ?? [],
    arrays.get('receiver_responses') ?? [],
    fatalErrors,
  );
  validateRuntimeDemoWhitelist(arrays.get('receiver_responses') ?? [], fatalErrors);
  validateScientificBoundaries(
    arrays.get('components') ?? [],
    arrays.get('receiver_responses') ?? [],
    arrays.get('effective_pairs') ?? [],
    arrays.get('compatibility_relations') ?? [],
    fatalErrors,
  );
  validateAssertions(value.validation, value.statistics, arrays, warnings);

  if (fatalErrors.length > 0) return failure(fatalErrors, warnings);
  return {
    ok: true,
    value: value as unknown as AhlHslComponentCatalogRelease,
    fatalErrors: [],
    warnings: freezeIssues(warnings),
  };
}

export const validateAhlHslCatalogRelease = validateCatalogRelease;

function validateRootRecords(
  release: Record<string, unknown>,
  errors: CatalogReleaseValidationIssue[],
): void {
  for (const [field, required] of [
    ['release_metadata', true],
    ['statistics', true],
    ['validation', true],
    ['software_status_rules', true],
    ['revision_metadata', true],
] as const) {
    if (required && !isRecord(release[field]))
      add(errors, `release.${field}`, 'must be an object', 'type');
  }
  if (isRecord(release.validation)) {
    if (typeof release.validation.all_checks_passed !== 'boolean')
      add(errors, 'release.validation.all_checks_passed', 'must be boolean', 'type');
    if (!Array.isArray(release.validation.assertions))
      add(errors, 'release.validation.assertions', 'must be an array', 'type');
  }
  if (isRecord(release.release_metadata)) {
    if (!nonEmptyString(release.release_metadata.release_version))
      add(errors, 'release.release_metadata.release_version', 'must be a non-empty string', 'type');
    if (!nonEmptyString(release.release_metadata.revision_date))
      add(errors, 'release.release_metadata.revision_date', 'must be a non-empty string', 'type');
  }
  if (
    isRecord(release.software_status_rules) &&
    !Array.isArray(release.software_status_rules.allowed_statuses)
  )
    add(errors, 'release.software_status_rules.allowed_statuses', 'must be an array', 'type');
}

function validateAdapterConsumedShapes(
  signals: unknown[],
  components: unknown[],
  contexts: unknown[],
  responses: unknown[],
  senders: unknown[],
  pairs: unknown[],
  relations: unknown[],
  sources: unknown[],
  errors: CatalogReleaseValidationIssue[],
): void {
  signals.forEach((item, index) => {
    if (!isRecord(item)) return;
    validateStringArrayShape(
      item.source_ids,
      'release.signals[' + index + '].source_ids',
      errors,
    );
  });
  components.forEach((item, index) => {
    if (!isRecord(item)) return;
    validateStringArrayShape(
      item.source_ids,
      'release.components[' + index + '].source_ids',
      errors,
    );
    validateStringArrayShape(
      item.evidence_gap,
      'release.components[' + index + '].evidence_gap',
      errors,
    );
  });
  contexts.forEach((item, index) => {
    if (!isRecord(item)) return;
    validateStringArrayShape(
      item.applicable_component_ids,
      'release.parameter_contexts[' + index + '].applicable_component_ids',
      errors,
    );
    validateNullableRecordShape(
      item.measurement_details,
      'release.parameter_contexts[' + index + '].measurement_details',
      errors,
      true,
    );
  });
  responses.forEach((item, index) => {
    if (!isRecord(item)) return;
    validateStringArrayShape(
      item.source_ids,
      'release.receiver_responses[' + index + '].source_ids',
      errors,
    );
    validateStringArrayShape(
      item.fit_constraints,
      'release.receiver_responses[' + index + '].fit_constraints',
      errors,
    );
    validateStringArrayShape(
      item.verification_basis,
      'release.receiver_responses[' + index + '].verification_basis',
      errors,
    );
    validateNullableRecordShape(
      item.reported_model_parameters,
      'release.receiver_responses[' + index + '].reported_model_parameters',
      errors,
      true,
    );
  });
  senders.forEach((item, index) => {
    if (!isRecord(item)) return;
    validateStringArrayShape(
      item.source_ids,
      'release.sender_outputs[' + index + '].source_ids',
      errors,
    );
  });
  pairs.forEach((item, index) => {
    if (!isRecord(item)) return;
    validateStringArrayShape(
      item.source_ids,
      'release.effective_pairs[' + index + '].source_ids',
      errors,
    );
    validateStringArrayShape(
      item.verification_basis,
      'release.effective_pairs[' + index + '].verification_basis',
      errors,
    );
    validateNullableRecordShape(
      item.assay_details,
      'release.effective_pairs[' + index + '].assay_details',
      errors,
      true,
    );
  });
  relations.forEach((item, index) => {
    if (!isRecord(item)) return;
    validateStringArrayShape(
      item.source_ids,
      'release.compatibility_relations[' + index + '].source_ids',
      errors,
    );
    validateStringArrayShape(
      item.verification_basis,
      'release.compatibility_relations[' + index + '].verification_basis',
      errors,
    );
  });
  sources.forEach((item, index) => {
    if (!isRecord(item)) return;
    const path = 'release.sources[' + index + ']';
    validateStringArrayShape(item.mapped_signal_ids, path + '.mapped_signal_ids', errors);
    validateStringArrayShape(item.mapped_component_ids, path + '.mapped_component_ids', errors);
    validateStringArrayShape(item.mapped_relation_ids, path + '.mapped_relation_ids', errors);
    validateStringArrayShape(item.mapped_rejected_ids, path + '.mapped_rejected_ids', errors);
    validateStringArrayShape(item.verification_basis, path + '.verification_basis', errors);
  });
}

function validateStringArrayShape(
  value: unknown,
  path: string,
  errors: CatalogReleaseValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    add(errors, path, 'must be an array', 'type');
    return;
  }
  for (const [index, item] of value.entries())
    if (typeof item !== 'string')
      add(errors, path + '[' + index + ']', 'must be a string', 'type');
}

function validateNullableRecordShape(
  value: unknown,
  path: string,
  errors: CatalogReleaseValidationIssue[],
  allowUndefined = false,
): void {
  if (allowUndefined && value === undefined) return;
  if (value !== null && !isRecord(value))
    add(errors, path, 'must be an object or null', 'type');
}

function validateForeignKeys(
  signals: unknown[],
  components: unknown[],
  contexts: unknown[],
  responses: unknown[],
  senders: unknown[],
  pairs: unknown[],
  relations: unknown[],
  sources: unknown[],
  ids: Map<string, Set<string>>,
  errors: CatalogReleaseValidationIssue[],
): void {
  const signalIds = ids.get('signals') ?? new Set<string>();
  const componentIds = ids.get('components') ?? new Set<string>();
  const contextIds = ids.get('parameter_contexts') ?? new Set<string>();
  const responseIds = ids.get('receiver_responses') ?? new Set<string>();
  const senderIds = ids.get('sender_outputs') ?? new Set<string>();
  const pairIds = ids.get('effective_pairs') ?? new Set<string>();
  const relationIds = ids.get('compatibility_relations') ?? new Set<string>();
  const sourceIds = ids.get('sources') ?? new Set<string>();

  contexts.forEach((item, index) => {
    if (!isRecord(item)) return;
    const path = `release.parameter_contexts[${index}]`;
    reference(item.source_id, sourceIds, `${path}.source_id`, errors);
    references(item.applicable_component_ids, componentIds, `${path}.applicable_component_ids`, errors);
  });

  components.forEach((item, index) => {
    if (!isRecord(item)) return;
    const path = `release.components[${index}]`;
    reference(item.parameter_context_id, contextIds, `${path}.parameter_context_id`, errors);
    references(item.source_ids, sourceIds, `${path}.source_ids`, errors, true);
    if (item.output_signal_id !== null && item.output_signal_id !== undefined)
      reference(item.output_signal_id, signalIds, `${path}.output_signal_id`, errors);
  });

  responses.forEach((item, index) => {
    if (!isRecord(item)) return;
    const path = `release.receiver_responses[${index}]`;
    reference(item.receiver_component_id, componentIds, `${path}.receiver_component_id`, errors);
    reference(item.input_signal_id, signalIds, `${path}.input_signal_id`, errors);
    reference(item.parameter_context_id, contextIds, `${path}.parameter_context_id`, errors);
    references(item.source_ids, sourceIds, `${path}.source_ids`, errors, true);
  });

  senders.forEach((item, index) => {
    if (!isRecord(item)) return;
    const path = `release.sender_outputs[${index}]`;
    if (item.sender_component_id !== undefined)
      reference(item.sender_component_id, componentIds, `${path}.sender_component_id`, errors);
    if (item.output_signal_id !== undefined && item.output_signal_id !== null)
      reference(item.output_signal_id, signalIds, `${path}.output_signal_id`, errors);
    references(item.source_ids, sourceIds, `${path}.source_ids`, errors, true);
  });

  pairs.forEach((item, index) => {
    if (!isRecord(item)) return;
    const path = `release.effective_pairs[${index}]`;
    reference(item.sender_component_id, componentIds, `${path}.sender_component_id`, errors);
    reference(item.receiver_component_id, componentIds, `${path}.receiver_component_id`, errors);
    reference(item.assay_context_id, contextIds, `${path}.assay_context_id`, errors);
    references(item.source_ids, sourceIds, `${path}.source_ids`, errors, true);
  });

  relations.forEach((item, index) => {
    if (!isRecord(item)) return;
    const path = `release.compatibility_relations[${index}]`;
    reference(item.subject_component_id, componentIds, `${path}.subject_component_id`, errors);
    nullableReference(item.target_component_id, componentIds, `${path}.target_component_id`, errors);
    nullableReference(item.input_signal_id, signalIds, `${path}.input_signal_id`, errors);
    reference(item.parameter_context_id, contextIds, `${path}.parameter_context_id`, errors);
    references(item.source_ids, sourceIds, `${path}.source_ids`, errors, true);
  });

  sources.forEach((item, index) => {
    if (!isRecord(item)) return;
    const path = `release.sources[${index}]`;
    references(item.mapped_signal_ids, signalIds, `${path}.mapped_signal_ids`, errors);
    references(item.mapped_component_ids, componentIds, `${path}.mapped_component_ids`, errors);
    references(
      item.mapped_relation_ids,
      new Set([...relationIds, ...responseIds, ...pairIds]),
      `${path}.mapped_relation_ids`,
      errors,
    );
  });

  for (const [index, item] of pairs.entries()) {
    if (!isRecord(item)) continue;
    if (item.sender_output_id !== undefined && senderIds.size > 0)
      nullableReference(item.sender_output_id, senderIds, `release.effective_pairs[${index}].sender_output_id`, errors);
  }
}

function validateCounts(
  release: Record<string, unknown>,
  arrays: Map<string, unknown[]>,
  errors: CatalogReleaseValidationIssue[],
): void {
  const statistics = release.statistics;
  const after = isRecord(statistics) && isRecord(statistics.after_revision)
    ? statistics.after_revision
    : undefined;
  if (!after) {
    add(errors, 'release.statistics.after_revision', 'must be an object', 'type');
    return;
  }
  const counts = after.array_counts;
  if (!isRecord(counts)) {
    add(errors, 'release.statistics.after_revision.array_counts', 'must be an object', 'type');
    return;
  }
  const fields = ROOT_ARRAYS;
  for (const field of fields) {
    const actual = arrays.get(field)?.length ?? 0;
    if (field !== 'sources' && counts[field] !== actual)
      add(
        errors,
        `release.statistics.after_revision.array_counts.${field}`,
        `must equal recalculated count ${actual}`,
        'count',
      );
    if (actual !== AHL_HSL_V1_1_EXPECTED_COUNTS[field])
      add(
        errors,
        `release.${field}`,
        `must equal frozen V1.1 count ${AHL_HSL_V1_1_EXPECTED_COUNTS[field]}, got ${actual}`,
        'release-count',
      );
  }
  if ((arrays.get('sender_outputs')?.length ?? 0) !== 0)
    add(
      errors,
      'release.sender_outputs',
      'must remain empty; sender outputs are not reconstructed',
      'sender-output-boundary',
    );
}

function validateStatuses(
  release: Record<string, unknown>,
  components: unknown[],
  responses: unknown[],
  errors: CatalogReleaseValidationIssue[],
): void {
  for (const [index, item] of components.entries()) {
    if (!isRecord(item)) continue;
    if (!oneOf(item.software_status, COMPONENT_STATUSES))
      add(errors, `release.components[${index}].software_status`, 'invalid status', 'status');
  }
  for (const [index, item] of responses.entries()) {
    if (!isRecord(item)) continue;
    if (!oneOf(item.software_status, RESPONSE_STATUSES))
      add(errors, `release.receiver_responses[${index}].software_status`, 'invalid status', 'status');
  }

  const componentCounts = countStatuses(components);
  const responseCounts = countStatuses(responses);
  const statistics = release.statistics;
  const after = isRecord(statistics) && isRecord(statistics.after_revision)
    ? statistics.after_revision
    : undefined;
  if (!after || !isRecord(after.component_status))
    add(errors, 'release.statistics.after_revision.component_status', 'must be an object', 'type');
  else compareStatusCounts(after.component_status, componentCounts, 'component_status', errors);
  if (!after || !isRecord(after.receiver_status))
    add(errors, 'release.statistics.after_revision.receiver_status', 'must be an object', 'type');
  else compareStatusCounts(after.receiver_status, responseCounts, 'receiver_status', errors);

  if (isRecord(statistics) && statistics.fixed_weight_candidate !== 0)
    add(
      errors,
      'release.statistics.fixed_weight_candidate',
      'must be zero for this release',
      'fixed-weight-boundary',
    );
  const allowed = isRecord(release.software_status_rules)
    ? release.software_status_rules.allowed_statuses
    : undefined;
  if (Array.isArray(allowed)) {
    for (const status of [...componentCounts.keys(), ...responseCounts.keys()])
      if (!allowed.includes(status))
        add(
          errors,
          'release.software_status_rules.allowed_statuses',
          `does not include observed status ${status}`,
         'status-rules',
        );
  }
  compareFixedStatusCounts(
    componentCounts,
    AHL_HSL_V1_1_EXPECTED_COMPONENT_STATUS_COUNTS,
    'component_status',
    errors,
  );
  compareFixedStatusCounts(
    responseCounts,
    AHL_HSL_V1_1_EXPECTED_RESPONSE_STATUS_COUNTS,
    'receiver_status',
    errors,
  );
}

function compareFixedStatusCounts(
  actual: Map<string, number>,
  expected: Readonly<Record<string, number>>,
  path: string,
  errors: CatalogReleaseValidationIssue[],
): void {
  for (const [status, count] of Object.entries(expected))
    if ((actual.get(status) ?? 0) !== count)
      add(
        errors,
        `release.${path}.${status}`,
        `must equal frozen V1.1 count ${count}, got ${actual.get(status) ?? 0}`,
        'release-status-count',
      );
  for (const [status, count] of actual)
    if (!(status in expected) && count !== 0)
      add(
        errors,
        `release.${path}.${status}`,
        `unexpected frozen V1.1 status count ${count}`,
        'release-status-count',
      );
}

function validateRuntimeDemoWhitelist(
  responses: unknown[],
  errors: CatalogReleaseValidationIssue[],
): void {
  const expectedIds = new Set(
    AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.map((entry) => entry.id),
  );
  const actualRuntimeIds = new Set<string>();
  for (const item of responses) {
    if (isRecord(item) && item.software_status === 'runtime_demo' && nonEmptyString(item.id))
      actualRuntimeIds.add(item.id);
  }

  for (const entry of AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST)
    if (!actualRuntimeIds.has(entry.id))
      add(
        errors,
        'release.receiver_responses',
        'runtime_demo whitelist entry ' + entry.id + ' is missing',
        'runtime-demo-whitelist-missing',
      );
  for (const responseId of actualRuntimeIds)
    if (!expectedIds.has(responseId))
      add(
        errors,
        'release.receiver_responses',
        'runtime_demo response ' + responseId + ' is not in the release whitelist',
        'runtime-demo-whitelist-extra',
      );

  for (const entry of AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST) {
    const index = responses.findIndex(
      (item) => isRecord(item) && item.id === entry.id,
    );
    if (index < 0) continue;
    const item = responses[index];
    if (!isRecord(item)) continue;
    const path = 'release.receiver_responses[' + index + ']';
    if (item.software_status !== 'runtime_demo')
      add(
        errors,
        path + '.software_status',
        'whitelist entry ' + entry.id + ' must have runtime_demo status',
        'runtime-demo-whitelist-status',
      );
    if (item.demo_implementation !== entry.demoImplementation)
      add(
        errors,
        path + '.demo_implementation',
        'must equal whitelisted implementation ' + entry.demoImplementation,
        'runtime-demo-whitelist-implementation',
      );
    if (item.model_type !== entry.modelType)
      add(
        errors,
        path + '.model_type',
        'must equal whitelisted model ' + entry.modelType,
        'runtime-demo-whitelist-model',
      );
    if (item.numerical_execution_allowed !== true)
      add(
        errors,
        path + '.numerical_execution_allowed',
        'whitelisted runtime_demo response must allow numerical execution',
        'runtime-demo-whitelist-execution',
      );
    if (item.normalized_demo_only !== true)
      add(
        errors,
        path + '.normalized_demo_only',
        'whitelisted runtime_demo response must be normalized demo only',
        'runtime-demo-whitelist-normalized',
      );
    if (item.fixed_weight_candidate !== false)
      add(
        errors,
        path + '.fixed_weight_candidate',
        'whitelisted runtime_demo response cannot be a fixed-weight candidate',
        'runtime-demo-whitelist-fixed-weight',
      );
  }
}

function validateScientificBoundaries(
  components: unknown[],
  responses: unknown[],
  pairs: unknown[],
  relations: unknown[],
  errors: CatalogReleaseValidationIssue[],
): void {
  for (const [index, item] of components.entries()) {
    if (!isRecord(item)) continue;
    const path = `release.components[${index}]`;
    if (typeof item.simulation_ready !== 'boolean')
      add(errors, `${path}.simulation_ready`, 'must be boolean', 'type');
    if (typeof item.construction_ready !== 'boolean')
      add(errors, `${path}.construction_ready`, 'must be boolean', 'type');
    if (item.software_status === 'runtime_demo' && item.simulation_ready !== true)
      add(errors, path, 'runtime_demo component must be simulation-ready', 'runtime-demo-boundary');
    if (item.software_status === 'compatibility_only' && item.simulation_ready === true)
      add(
        errors,
        `${path}.simulation_ready`,
        'compatibility_only component cannot be simulation-ready',
        'compatibility-boundary',
      );
  }
  for (const [index, item] of responses.entries()) {
    if (!isRecord(item)) continue;
    const path = `release.receiver_responses[${index}]`;
    if (item.software_status === 'runtime_demo') {
      if (item.numerical_execution_allowed !== true)
        add(errors, `${path}.numerical_execution_allowed`, 'runtime_demo response must be executable', 'runtime-demo-execution');
      if (item.normalized_demo_only !== true)
        add(errors, `${path}.normalized_demo_only`, 'runtime_demo response must be normalized demo only', 'runtime-demo-boundary');
      if (!finiteNumber(item.ec50) || !finiteNumber(item.hill_coefficient))
        add(errors, path, 'runtime_demo response requires finite EC50 and Hill coefficient', 'runtime-demo-parameters');
    } else if (item.numerical_execution_allowed === true)
      add(errors, `${path}.numerical_execution_allowed`, 'non-runtime response cannot be executable', 'execution-boundary');
    if (item.fixed_weight_candidate === true)
      add(errors, `${path}.fixed_weight_candidate`, 'fixed-weight candidates are not admitted', 'fixed-weight-boundary');
  }
  for (const [index, item] of pairs.entries()) {
    if (!isRecord(item)) continue;
    if (item.intermediate_signal_measured !== false)
      add(errors, `release.effective_pairs[${index}].intermediate_signal_measured`, 'must be false; the pair is not decomposable', 'pair-decomposition');
    if (item.decomposition_prohibited !== true)
      add(errors, `release.effective_pairs[${index}].decomposition_prohibited`, 'must be true', 'pair-decomposition');
  }
  for (const [index, item] of relations.entries()) {
    if (!isRecord(item)) continue;
    if (item.numeric_use_allowed !== false || item.numerical_execution_allowed !== false)
      add(errors, `release.compatibility_relations[${index}]`, 'compatibility relation cannot be used numerically', 'compatibility-numeric');
  }
}

function validateAssertions(
  validationValue: unknown,
  statisticsValue: unknown,
  arrays: Map<string, unknown[]>,
  warnings: CatalogReleaseValidationIssue[],
): void {
  if (!isRecord(validationValue) || !Array.isArray(validationValue.assertions)) return;
  const componentCounts = countStatuses(arrays.get('components') ?? []);
  const responseCounts = countStatuses(arrays.get('receiver_responses') ?? []);
  const arrayCounts: Record<string, number> = {};
  for (const field of ROOT_ARRAYS) arrayCounts[field] = arrays.get(field)?.length ?? 0;
  const statistics = isRecord(statisticsValue) ? statisticsValue : undefined;
  for (const [index, assertion] of validationValue.assertions.entries()) {
    if (typeof assertion !== 'string') {
      warn(warnings, `release.validation.assertions[${index}]`, 'is not a string', 'stale-self-assertion');
      continue;
    }
    const lengthMatch = /^len\(([^)]+)\)\s*==\s*(\d+)$/u.exec(assertion);
    const statusMatch = STATUS_ASSERTION_PATTERN.exec(assertion);
    let expected: number | undefined;
    let actual: number | undefined;
    if (lengthMatch) {
      expected = Number(lengthMatch[2]);
      actual = arrayCounts[lengthMatch[1]!];
    } else if (statusMatch) {
      expected = Number(statusMatch[3]);
      actual = (statusMatch[1] === 'component_status' ? componentCounts : responseCounts).get(statusMatch[2]!);
    } else if (assertion === 'fixed_weight_candidate == 0') {
      expected = 0;
      actual = statistics && typeof statistics.fixed_weight_candidate === 'number'
        ? statistics.fixed_weight_candidate
        : undefined;
    }
    if (actual !== undefined && expected !== actual)
      warn(
        warnings,
        `release.validation.assertions[${index}]`,
        `self-assertion says ${expected}, recalculated value is ${actual}`,
        'stale-self-assertion',
      );
  }
}

function compareStatusCounts(
  reported: Record<string, unknown>,
  actual: Map<string, number>,
  path: string,
  errors: CatalogReleaseValidationIssue[],
): void {
  for (const [status, count] of actual)
    if (reported[status] !== count)
      add(errors, `release.statistics.after_revision.${path}.${status}`, `must equal recalculated count ${count}`, 'status-count');
  for (const [status, count] of Object.entries(reported)) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0)
      add(errors, `release.statistics.after_revision.${path}.${status}`, 'must be a non-negative integer', 'number');
    else if (!actual.has(status) && count !== 0)
      add(errors, `release.statistics.after_revision.${path}.${status}`, 'contains an unobserved non-zero status', 'status-count');
  }
}

function countStatuses(items: unknown[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!isRecord(item) || typeof item.software_status !== 'string') continue;
    counts.set(item.software_status, (counts.get(item.software_status) ?? 0) + 1);
  }
  return counts;
}

function references(
  value: unknown,
  known: Set<string>,
  path: string,
  errors: CatalogReleaseValidationIssue[],
  required = false,
): void {
  if (!Array.isArray(value)) {
    add(errors, path, 'must be an array', 'type');
    return;
  }
  if (required && value.length === 0) add(errors, path, 'must not be empty', 'required');
  for (const [index, item] of value.entries())
    reference(item, known, `${path}[${index}]`, errors);
}

function reference(
  value: unknown,
  known: Set<string>,
  path: string,
  errors: CatalogReleaseValidationIssue[],
): void {
  if (!nonEmptyString(value)) add(errors, path, 'must be a non-empty string', 'foreign-key');
  else if (!known.has(value)) add(errors, path, `unknown reference ${value}`, 'foreign-key');
}

function nullableReference(
  value: unknown,
  known: Set<string>,
  path: string,
  errors: CatalogReleaseValidationIssue[],
): void {
  if (value !== null && value !== undefined) reference(value, known, path, errors);
}

function failure(
  fatalErrors: readonly CatalogReleaseValidationIssue[],
  warnings: readonly CatalogReleaseValidationIssue[],
): CatalogReleaseValidationResult {
  return { ok: false, fatalErrors: freezeIssues(fatalErrors), warnings: freezeIssues(warnings) };
}

function add(
  issues: CatalogReleaseValidationIssue[],
  path: string,
  message: string,
  code: string,
): void {
  issues.push({ path, message, code });
}

function warn(
  issues: CatalogReleaseValidationIssue[],
  path: string,
  message: string,
  code: string,
): void {
  issues.push({ path, message, code });
}

function freezeIssues(
  issues: readonly CatalogReleaseValidationIssue[],
): readonly CatalogReleaseValidationIssue[] {
  return Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type { AhlHslComponentCatalogRelease } from './releaseTypes';
export {
  AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST,
  CATALOG_RELEASE_RUNTIME_DEMO_WHITELIST,
} from './catalogRuntimeDemoWhitelist';
