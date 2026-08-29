import Papa from 'papaparse';
import type {
  SenderDetectionStatus,
  SenderEvidenceTraceRecord,
  SenderExtensionJsonValue,
  SenderExtensionValidationIssue,
  SenderFunctionParameterRecord,
  SenderInputKind,
  SenderRawPointRecord,
  SenderRejectedCandidateRecord,
  SenderSourceRecord,
} from './senderExtensionTypes';
import {
  addSenderExtensionIssue,
  isSenderExtensionJsonValue,
  isSenderExtensionRecord,
  requireSenderString,
  requireSenderStringArray,
} from './senderExtensionValidationUtils';

const RAW_POINT_HEADERS = [
  'raw_point_id',
  'sender_output_id',
  'sender_component_id',
  'parameter_context_id',
  'signal_id',
  'input_kind',
  'input_name',
  'input_value',
  'input_unit',
  'input_label',
  'output_value',
  'output_unit',
  'output_lower_bound',
  'output_upper_bound',
  'replicate_count',
  'replicate_index',
  'error_type',
  'error_value',
  'detection_status',
  'compartment',
  'timepoint_h',
  'od600',
  'fit_eligible',
  'source_id',
  'evidence_location',
  'data_file',
  'digitized',
  'notes',
] as const;

const FUNCTION_PARAMETER_HEADERS = [
  'sender_output_id',
  'sender_component_id',
  'parameter_context_id',
  'model_type',
  'formula',
  'parameter_json',
  'input_unit',
  'output_unit',
  'valid_input_min',
  'valid_input_max',
  'valid_output_min',
  'valid_output_max',
  'fit_method',
  'reported_or_refit',
  'r_squared',
  'rmse',
  'data_point_count',
  'source_id',
  'evidence_location',
  'runtime_allowed',
  'notes',
] as const;

const SOURCE_HEADERS = [
  'source_id',
  'authors',
  'title',
  'year',
  'journal',
  'doi',
  'pmid',
  'pmcid',
  'primary_url',
  'supplementary_url',
  'data_repository_url',
  'source_type',
  'accessed_at',
  'verification_status',
  'verified_location',
  'notes',
] as const;

const TRACE_HEADERS = [
  'trace_id',
  'record_id',
  'field_path',
  'value_summary',
  'source_id',
  'evidence_location',
  'evidence_type',
  'verification_method',
  'verified_at',
  'notes',
] as const;

const INPUT_KINDS: readonly SenderInputKind[] = Object.freeze([
  'constitutive_endpoint',
  'discrete_construct',
  'inducer_concentration',
  'substrate_concentration',
]);
const DETECTION_STATUSES: readonly SenderDetectionStatus[] = Object.freeze([
  'quantified',
  'ND',
  'reported_range',
]);

export interface ParsedSenderExtensionTables {
  rawPoints: SenderRawPointRecord[];
  functionParameters: SenderFunctionParameterRecord[];
  sources: SenderSourceRecord[];
  evidenceTrace: SenderEvidenceTraceRecord[];
  rejectedCandidates: SenderRejectedCandidateRecord[];
}

export function parseSenderExtensionTables(
  input: {
    rawPointsCsv: string;
    functionParametersCsv: string;
    sourcesCsv: string;
    evidenceTraceCsv: string;
    rejectedCandidatesJsonl: string;
  },
  errors: SenderExtensionValidationIssue[],
): ParsedSenderExtensionTables {
  return {
    rawPoints: parseCsv(input.rawPointsCsv, RAW_POINT_HEADERS, 'sender_raw_points.csv', errors).map(
      (row, index) => parseRawPoint(row, 'sender_raw_points.csv[' + index + ']', errors),
    ),
    functionParameters: parseCsv(
      input.functionParametersCsv,
      FUNCTION_PARAMETER_HEADERS,
      'sender_function_parameters.csv',
      errors,
    ).map((row, index) =>
      parseFunctionParameter(row, 'sender_function_parameters.csv[' + index + ']', errors),
    ),
    sources: parseCsv(input.sourcesCsv, SOURCE_HEADERS, 'sender_sources.csv', errors).map(
      (row, index) => parseSource(row, 'sender_sources.csv[' + index + ']', errors),
    ),
    evidenceTrace: parseCsv(
      input.evidenceTraceCsv,
      TRACE_HEADERS,
      'sender_evidence_trace.csv',
      errors,
    ).map((row, index) => parseTrace(row, 'sender_evidence_trace.csv[' + index + ']', errors)),
    rejectedCandidates: parseRejectedCandidates(input.rejectedCandidatesJsonl, errors),
  };
}

function parseCsv(
  text: string,
  expectedHeaders: readonly string[],
  path: string,
  errors: SenderExtensionValidationIssue[],
): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  for (const error of parsed.errors)
    addSenderExtensionIssue(errors, path + ':row:' + error.row, 'csv-parse', error.message);
  const fields = parsed.meta.fields ?? [];
  if (
    fields.length !== expectedHeaders.length ||
    fields.some((field, index) => field !== expectedHeaders[index])
  )
    addSenderExtensionIssue(
      errors,
      path,
      'csv-header',
      'header does not match the V1.2 source schema',
    );
  return parsed.data;
}

function parseRawPoint(
  row: Record<string, string>,
  path: string,
  errors: SenderExtensionValidationIssue[],
): SenderRawPointRecord {
  return {
    raw_point_id: required(row, 'raw_point_id', path, errors),
    sender_output_id: required(row, 'sender_output_id', path, errors),
    sender_component_id: required(row, 'sender_component_id', path, errors),
    parameter_context_id: required(row, 'parameter_context_id', path, errors),
    signal_id: nullable(row, 'signal_id'),
    input_kind: enumValue(row, 'input_kind', INPUT_KINDS, path, errors),
    input_name: required(row, 'input_name', path, errors),
    input_value: nullableNumber(row, 'input_value', path, errors),
    input_unit: nullable(row, 'input_unit'),
    input_label: nullable(row, 'input_label'),
    output_value: nullableNumber(row, 'output_value', path, errors),
    output_unit: nullable(row, 'output_unit'),
    output_lower_bound: nullableNumber(row, 'output_lower_bound', path, errors),
    output_upper_bound: nullableNumber(row, 'output_upper_bound', path, errors),
    replicate_count: nullableInteger(row, 'replicate_count', path, errors),
    replicate_index: nullableInteger(row, 'replicate_index', path, errors),
    error_type: nullable(row, 'error_type'),
    error_value: nullableNumber(row, 'error_value', path, errors),
    detection_status: enumValue(row, 'detection_status', DETECTION_STATUSES, path, errors),
    compartment: nullable(row, 'compartment'),
    timepoint_h: nullableNumber(row, 'timepoint_h', path, errors),
    od600: nullableNumber(row, 'od600', path, errors),
    fit_eligible: booleanValue(row, 'fit_eligible', path, errors),
    source_id: nullable(row, 'source_id'),
    evidence_location: required(row, 'evidence_location', path, errors),
    data_file: nullable(row, 'data_file'),
    digitized: booleanValue(row, 'digitized', path, errors),
    notes: nullable(row, 'notes'),
  };
}

function parseFunctionParameter(
  row: Record<string, string>,
  path: string,
  errors: SenderExtensionValidationIssue[],
): SenderFunctionParameterRecord {
  return {
    sender_output_id: required(row, 'sender_output_id', path, errors),
    sender_component_id: required(row, 'sender_component_id', path, errors),
    parameter_context_id: required(row, 'parameter_context_id', path, errors),
    model_type: required(row, 'model_type', path, errors),
    formula: required(row, 'formula', path, errors),
    parameter_json: jsonObject(row, 'parameter_json', path, errors),
    input_unit: nullable(row, 'input_unit'),
    output_unit: nullable(row, 'output_unit'),
    valid_input_min: nullableNumber(row, 'valid_input_min', path, errors),
    valid_input_max: nullableNumber(row, 'valid_input_max', path, errors),
    valid_output_min: nullableNumber(row, 'valid_output_min', path, errors),
    valid_output_max: nullableNumber(row, 'valid_output_max', path, errors),
    fit_method: nullable(row, 'fit_method'),
    reported_or_refit: required(row, 'reported_or_refit', path, errors),
    r_squared: nullableNumber(row, 'r_squared', path, errors),
    rmse: nullableNumber(row, 'rmse', path, errors),
    data_point_count: nullableInteger(row, 'data_point_count', path, errors),
    source_id: required(row, 'source_id', path, errors),
    evidence_location: required(row, 'evidence_location', path, errors),
    runtime_allowed: booleanValue(row, 'runtime_allowed', path, errors),
    notes: nullable(row, 'notes'),
  };
}

function parseSource(
  row: Record<string, string>,
  path: string,
  errors: SenderExtensionValidationIssue[],
): SenderSourceRecord {
  return {
    source_id: required(row, 'source_id', path, errors),
    authors: required(row, 'authors', path, errors),
    title: required(row, 'title', path, errors),
    year: requiredInteger(row, 'year', path, errors),
    journal: nullable(row, 'journal'),
    doi: nullable(row, 'doi'),
    pmid: nullable(row, 'pmid'),
    pmcid: nullable(row, 'pmcid'),
    primary_url: nullable(row, 'primary_url'),
    supplementary_url: nullable(row, 'supplementary_url'),
    data_repository_url: nullable(row, 'data_repository_url'),
    source_type: required(row, 'source_type', path, errors),
    accessed_at: required(row, 'accessed_at', path, errors),
    verification_status: required(row, 'verification_status', path, errors),
    verified_location: required(row, 'verified_location', path, errors),
    notes: nullable(row, 'notes'),
  };
}

function parseTrace(
  row: Record<string, string>,
  path: string,
  errors: SenderExtensionValidationIssue[],
): SenderEvidenceTraceRecord {
  return {
    trace_id: required(row, 'trace_id', path, errors),
    record_id: required(row, 'record_id', path, errors),
    field_path: required(row, 'field_path', path, errors),
    value_summary: required(row, 'value_summary', path, errors),
    source_id: nullable(row, 'source_id'),
    evidence_location: nullable(row, 'evidence_location'),
    evidence_type: required(row, 'evidence_type', path, errors),
    verification_method: required(row, 'verification_method', path, errors),
    verified_at: required(row, 'verified_at', path, errors),
    notes: nullable(row, 'notes'),
  };
}

function parseRejectedCandidates(
  text: string,
  errors: SenderExtensionValidationIssue[],
): SenderRejectedCandidateRecord[] {
  const records: SenderRejectedCandidateRecord[] = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (line.trim().length === 0) continue;
    const path = 'sender_rejected_candidates.jsonl[' + index + ']';
    try {
      const value: unknown = JSON.parse(line);
      if (!isSenderExtensionRecord(value)) {
        addSenderExtensionIssue(errors, path, 'jsonl-schema', 'must be an object');
        continue;
      }
      for (const field of ['id', 'candidate', 'reason', 'retained_as', 'last_verified_at'])
        requireSenderString(value, field, path, errors);
      if (value.decision !== 'rejected')
        addSenderExtensionIssue(errors, path + '.decision', 'jsonl-schema', 'must equal rejected');
      requireSenderStringArray(value, 'source_ids', path, errors);
      requireSenderStringArray(value, 'missing', path, errors);
      records.push(value as unknown as SenderRejectedCandidateRecord);
    } catch {
      addSenderExtensionIssue(errors, path, 'jsonl-parse', 'invalid JSON');
    }
  }
  return records;
}

function required(
  row: Record<string, string>,
  key: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): string {
  const value = row[key] ?? '';
  if (value.length === 0)
    addSenderExtensionIssue(errors, path + '.' + key, 'csv-required', 'must not be blank');
  return value;
}

function nullable(row: Record<string, string>, key: string): string | null {
  const value = row[key] ?? '';
  return value.length === 0 ? null : value;
}

function nullableNumber(
  row: Record<string, string>,
  key: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): number | null {
  const value = nullable(row, key);
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    addSenderExtensionIssue(
      errors,
      path + '.' + key,
      'csv-number',
      'must be a finite number or blank',
    );
    return null;
  }
  return number;
}

function nullableInteger(
  row: Record<string, string>,
  key: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): number | null {
  const value = nullableNumber(row, key, path, errors);
  if (value !== null && !Number.isInteger(value))
    addSenderExtensionIssue(errors, path + '.' + key, 'csv-integer', 'must be an integer or blank');
  return value;
}

function requiredInteger(
  row: Record<string, string>,
  key: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): number {
  const value = nullableInteger(row, key, path, errors);
  if (value === null)
    addSenderExtensionIssue(errors, path + '.' + key, 'csv-required', 'must not be blank');
  return value ?? 0;
}

function booleanValue(
  row: Record<string, string>,
  key: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): boolean {
  const value = row[key];
  if (value === 'true') return true;
  if (value === 'false') return false;
  addSenderExtensionIssue(errors, path + '.' + key, 'csv-boolean', 'must equal true or false');
  return false;
}

function enumValue<T extends string>(
  row: Record<string, string>,
  key: string,
  allowed: readonly T[],
  path: string,
  errors: SenderExtensionValidationIssue[],
): T {
  const value = required(row, key, path, errors);
  if (allowed.includes(value as T)) return value as T;
  addSenderExtensionIssue(errors, path + '.' + key, 'csv-enum', 'contains an unsupported value');
  const fallback = allowed[0];
  if (fallback === undefined) throw new Error('Sender CSV enum requires at least one value.');
  return fallback;
}

function jsonObject(
  row: Record<string, string>,
  key: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): Readonly<Record<string, SenderExtensionJsonValue>> {
  const value = required(row, key, path, errors);
  try {
    const parsed: unknown = JSON.parse(value);
    if (isSenderExtensionRecord(parsed) && isSenderExtensionJsonValue(parsed)) return parsed;
  } catch {
    // Report the stable schema error below.
  }
  addSenderExtensionIssue(errors, path + '.' + key, 'csv-json', 'must contain a JSON object');
  return {};
}
