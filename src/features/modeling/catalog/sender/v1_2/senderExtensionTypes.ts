export type SenderExtensionJsonPrimitive = string | number | boolean | null;
export type SenderExtensionJsonValue =
  | SenderExtensionJsonPrimitive
  | readonly SenderExtensionJsonValue[]
  | { readonly [key: string]: SenderExtensionJsonValue };

export type SenderExtensionSoftwareStatus =
  'calibration_candidate' | 'effective_pair_only' | 'reference_only';

export type SenderEvidenceScope =
  | 'endpoint_concentration'
  | 'fixed_condition_time_course'
  | 'production_rate'
  | 'enzyme_kinetics'
  | 'effective_pair_only'
  | 'non_detection'
  | 'other_quantitative_evidence';

export interface SenderExtensionReleaseMetadata {
  release_name: string;
  version: string;
  release_date: string;
  release_type: string;
  base_release: string;
  base_sha256: string;
  base_records_immutable: boolean;
  attachment_context: {
    requested_report: string;
    materialized_report: string;
    note: string;
  };
  id_policy: string;
  last_verified_at: string;
}

export interface SenderOutputsReleaseMetadata {
  release_name: string;
  version: string;
  release_date: string;
  base_sha256: string;
  runtime_quantitative_count: number;
  runtime_demo_count: number;
  policy: string;
}

export interface SenderExtensionSignalRecord {
  id: string;
  canonical_name: string;
  display_name_en: string;
  display_name_zh: string;
  common_abbreviations: readonly string[];
  signal_class: string;
  acyl_chain: string;
  substitution: string;
  unsaturation: boolean;
  stereochemistry: string;
  molecular_formula: string | null;
  pubchem_cid: number | null;
  chemical_identity_status: string;
  quantitative_use_allowed: boolean;
  source_ids: readonly string[];
  reconstruction_status: string;
  notes: string | null;
  usage_scope: string;
  identity_resolution_notes: readonly string[];
  revision_status: string;
  last_verified_at: string;
  verification_basis: readonly string[];
  change_reason: string;
}

export interface SenderExtensionParameterContextRecord {
  id: string;
  source_id: string;
  host_species: string | null;
  host_strain: string | null;
  vector_system: string | null;
  promoter_configuration: string | null;
  reporter: string | null;
  culture_medium: string | null;
  temperature: string | null;
  induction_conditions: string | null;
  exposure_time: string | null;
  measurement_platform: string | null;
  measurement_unit: string | null;
  normalization_method: string | null;
  background_subtraction: string | null;
  biological_replicates: number | null;
  technical_replicates: number | null;
  applicable_component_ids: readonly string[];
  notes: string | null;
  measurement_details: Readonly<Record<string, SenderExtensionJsonValue>>;
  revision_status: string;
  last_verified_at: string;
  verification_basis: readonly string[];
  change_reason: string;
}

export interface SenderExtensionComponentRecord {
  id: string;
  component_type: 'sender';
  display_name_en: string;
  display_name_zh: string;
  regulator_or_enzyme: string | null;
  promoter: string | null;
  reporter: string | null;
  host_species: string | null;
  host_strain: string | null;
  vector_or_backbone: string | null;
  copy_number_or_replication_context: string | null;
  expression_configuration: string | null;
  sequence_status: string;
  sequence_reference: string | null;
  parameter_context_id: string;
  software_status: SenderExtensionSoftwareStatus;
  construction_ready: boolean;
  simulation_ready: boolean;
  input_port: string | null;
  output_port: string | null;
  output_signal_id: string | null;
  source_ids: readonly string[];
  reconstruction_status: string;
  evidence_gap: readonly string[];
  notes: string | null;
  sequence_metadata: SenderExtensionJsonValue;
  revision_status: string;
  last_verified_at: string;
  verification_basis: readonly string[];
  change_reason: string;
}

export interface SenderExtensionExistingComponentLink {
  sender_component_id: string;
  new_sender_output_id: string;
  base_record_modified: false;
}

export interface SenderExtensionComponentsDocument {
  release_metadata: SenderExtensionReleaseMetadata;
  new_signals: readonly SenderExtensionSignalRecord[];
  new_parameter_contexts: readonly SenderExtensionParameterContextRecord[];
  new_sender_components: readonly SenderExtensionComponentRecord[];
  existing_v1_1_sender_component_links: readonly SenderExtensionExistingComponentLink[];
}

export type SenderInputKind =
  | 'constitutive_endpoint'
  | 'discrete_construct'
  | 'inducer_concentration'
  | 'substrate_concentration';

export interface SenderInputDefinition {
  kind: SenderInputKind;
  signal_id: string | null;
  name: string;
  unit: string | null;
  working_range: readonly [number | null, number | null];
}

export type SenderOutputQuantity =
  'extracellular_concentration' | 'normalized_output' | 'production_rate' | 'titer';

export interface SenderOutputDefinition {
  kind: SenderOutputQuantity;
  unit: string | null;
  compartment: string | null;
  normalization_basis: string | null;
  timepoint: string | null;
  steady_state_definition: string | null;
}

export interface SenderProductProfileEntry {
  signal_id: string;
  identity_status: string;
  fraction: number | null;
  fraction_unit: string | null;
}

export interface SenderOutputModel {
  model_type: 'none' | 'lookup_table' | 'endpoint_constant' | 'reported';
  formula: string | null;
  parameters: Readonly<Record<string, SenderExtensionJsonValue>>;
  valid_input_range: readonly [number | null, number | null];
  valid_output_range: readonly [number | null, number | null];
  r_squared: number | null;
  rmse: number | null;
  fit_method: string | null;
  reported_or_refit: string;
}

export interface SenderEmbeddedRawPoint {
  input: number | null;
  output: number | null;
  replicate_count: number | null;
  error_type: string | null;
  error_value: number | null;
  input_label?: string | null;
}

export interface SenderMeasurementEvidence {
  method: string | null;
  instrument: string | null;
  standard: string | null;
  internal_standard: string | null;
  calibration_curve_reported: boolean;
  lod: SenderExtensionJsonValue;
  loq: SenderExtensionJsonValue;
  direct_signal_measurement: boolean;
}

export interface SenderOutputRecord {
  id: string;
  sender_component_id: string;
  output_signal_id: string | null;
  parameter_context_id: string;
  input_definition: SenderInputDefinition;
  output_definition: SenderOutputDefinition;
  product_profile: readonly SenderProductProfileEntry[];
  model: SenderOutputModel;
  raw_points: readonly SenderEmbeddedRawPoint[];
  measurement: SenderMeasurementEvidence;
  software_status: SenderExtensionSoftwareStatus;
  numerical_execution_allowed: boolean;
  normalized_demo_only: boolean;
  decomposition_prohibited: boolean;
  evidence_quality: 'B' | 'C' | 'D';
  evidence_location: string;
  source_ids: readonly string[];
  verification_basis: readonly string[];
  notes: readonly string[];
  missing_fields: readonly string[];
  last_verified_at: string;
}

export interface SenderOutputsDocument {
  release_metadata: SenderOutputsReleaseMetadata;
  sender_outputs: readonly SenderOutputRecord[];
}

export type SenderDetectionStatus = 'quantified' | 'ND' | 'reported_range';

export interface SenderRawPointRecord {
  raw_point_id: string;
  sender_output_id: string;
  sender_component_id: string;
  parameter_context_id: string;
  signal_id: string | null;
  input_kind: SenderInputKind;
  input_name: string;
  input_value: number | null;
  input_unit: string | null;
  input_label: string | null;
  output_value: number | null;
  output_unit: string | null;
  output_lower_bound: number | null;
  output_upper_bound: number | null;
  replicate_count: number | null;
  replicate_index: number | null;
  error_type: string | null;
  error_value: number | null;
  detection_status: SenderDetectionStatus;
  compartment: string | null;
  timepoint_h: number | null;
  od600: number | null;
  fit_eligible: boolean;
  source_id: string | null;
  evidence_location: string;
  data_file: string | null;
  digitized: boolean;
  notes: string | null;
}

export interface SenderFunctionParameterRecord {
  sender_output_id: string;
  sender_component_id: string;
  parameter_context_id: string;
  model_type: string;
  formula: string;
  parameter_json: Readonly<Record<string, SenderExtensionJsonValue>>;
  input_unit: string | null;
  output_unit: string | null;
  valid_input_min: number | null;
  valid_input_max: number | null;
  valid_output_min: number | null;
  valid_output_max: number | null;
  fit_method: string | null;
  reported_or_refit: string;
  r_squared: number | null;
  rmse: number | null;
  data_point_count: number | null;
  source_id: string;
  evidence_location: string;
  runtime_allowed: boolean;
  notes: string | null;
}

export interface SenderSourceRecord {
  source_id: string;
  authors: string;
  title: string;
  year: number;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  primary_url: string | null;
  supplementary_url: string | null;
  data_repository_url: string | null;
  source_type: string;
  accessed_at: string;
  verification_status: string;
  verified_location: string;
  notes: string | null;
}

export interface SenderEvidenceTraceRecord {
  trace_id: string;
  record_id: string;
  field_path: string;
  value_summary: string;
  source_id: string | null;
  evidence_location: string | null;
  evidence_type: string;
  verification_method: string;
  verified_at: string;
  notes: string | null;
}

export interface SenderRejectedCandidateRecord {
  id: string;
  candidate: string;
  decision: 'rejected';
  reason: string;
  source_ids: readonly string[];
  retained_as: string;
  missing: readonly string[];
  last_verified_at: string;
}

export interface SenderValidationCheck {
  name: string;
  passed: boolean;
  severity: string;
  details: SenderExtensionJsonValue;
}

export interface SenderValidationReport {
  release: string;
  validated_at: string;
  overall_status: string;
  base_release: {
    version: string;
    sha256: string;
    immutable: boolean;
  };
  counts: {
    new_signals: number;
    new_components: number;
    new_parameter_contexts: number;
    sender_outputs: number;
    raw_points: number;
    function_parameter_rows: number;
    sources: number;
    rejected_candidates: number;
    evidence_trace_rows: number;
  };
  software_status_counts: Readonly<Record<SenderExtensionSoftwareStatus, number>>;
  evidence_quality_counts: Readonly<Record<'B' | 'C' | 'D', number>>;
  checks: readonly SenderValidationCheck[];
  warnings: readonly string[];
}

export interface SenderExtensionSourcePackageInput {
  componentsDocument: unknown;
  outputsDocument: unknown;
  validationReport: unknown;
  rawPointsCsv: string;
  functionParametersCsv: string;
  sourcesCsv: string;
  evidenceTraceCsv: string;
  rejectedCandidatesJsonl: string;
}

export interface SenderEvidenceExtension {
  componentsDocument: SenderExtensionComponentsDocument;
  outputsDocument: SenderOutputsDocument;
  validationReport: SenderValidationReport;
  rawPoints: readonly SenderRawPointRecord[];
  functionParameters: readonly SenderFunctionParameterRecord[];
  sources: readonly SenderSourceRecord[];
  evidenceTrace: readonly SenderEvidenceTraceRecord[];
  rejectedCandidates: readonly SenderRejectedCandidateRecord[];
}

export interface SenderExtensionValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type SenderExtensionValidationResult =
  | { ok: true; value: SenderEvidenceExtension }
  | { ok: false; errors: readonly SenderExtensionValidationIssue[] };
