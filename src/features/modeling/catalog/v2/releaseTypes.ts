/** Runtime contract for the reconstructed AHL/HSL V1.1 release.
 *
 * The release is intentionally kept in its original snake_case vocabulary.
 * The adapter is the only boundary that converts this contract to the
 * canonical catalog vocabulary.  Nullable values are meaningful evidence
 * boundaries and must not be coerced to zero or an empty string.
 */

export type ReleaseNullable<T> = T | null;

export type ReleaseJsonValue =
  | string
  | number
  | boolean
  | null
  | ReleaseJsonValue[]
  | { readonly [key: string]: ReleaseJsonValue };

export interface AhlHslReleaseMetadata {
  release_name: string;
  release_version: string;
  release_status: string;
  count_reconciliation: string;
  reconstruction_type: string;
  exact_binary_recovery: boolean;
  basis_report: string;
  database_freeze_date: string;
  reconstruction_date: string;
  reconstruction_scope: string;
  reconstruction_notes: string;
  license_note: string;
  revision_type: string;
  revision_date: string;
  previous_release_version: string;
}

export interface AhlHslSignalRecord {
  id: string;
  canonical_name: string;
  display_name_en: string;
  display_name_zh: string;
  common_abbreviations: string[];
  signal_class: string;
  acyl_chain: string;
  substitution: string;
  unsaturation: boolean;
  stereochemistry: string;
  molecular_formula: string;
  pubchem_cid: ReleaseNullable<number>;
  chemical_identity_status: string;
  quantitative_use_allowed: boolean;
  source_ids: string[];
  reconstruction_status: string;
  notes: ReleaseNullable<string>;
  usage_scope: string;
  identity_resolution_notes: string[];
  pubchem_accessed_at: ReleaseNullable<string>;
  revision_status: string;
  last_verified_at: string;
  verification_basis: string[];
  change_reason: string;
  related_resolved_pubchem_candidate?: string;
}

export interface AhlHslSequenceMetadata {
  sequence_source_type: string;
  sequence_accession: ReleaseJsonValue;
  sequence_repository_url: ReleaseNullable<string>;
  exact_repository_location?: ReleaseNullable<string>;
  repository_file_size?: ReleaseNullable<string>;
  repository_checksum_md5?: ReleaseNullable<string>;
  sequence_checksum_sha256: ReleaseNullable<string>;
  sequence_length_bp: ReleaseNullable<number>;
  sequence_retrieval_date: string;
  sequence_verification_status: string;
  assembly_context: string;
  missing_sequence_elements: string[];
  [key: string]: ReleaseJsonValue;
}

export interface AhlHslComponentRecord {
  id: string;
  component_type: string;
  display_name_en: string;
  display_name_zh: string;
  regulator_or_enzyme: ReleaseNullable<string>;
  promoter: ReleaseNullable<string>;
  reporter: ReleaseNullable<string>;
  host_species: ReleaseNullable<string>;
  host_strain: ReleaseNullable<string>;
  vector_or_backbone: ReleaseNullable<string>;
  copy_number_or_replication_context: ReleaseNullable<string>;
  expression_configuration: ReleaseNullable<string>;
  sequence_status: string;
  sequence_reference: ReleaseNullable<string>;
  parameter_context_id: string;
  software_status: string;
  construction_ready: boolean;
  simulation_ready: boolean;
  input_port: ReleaseNullable<string>;
  output_port: ReleaseNullable<string>;
  output_signal_id: ReleaseNullable<string>;
  source_ids: string[];
  reconstruction_status: string;
  evidence_gap: string[];
  notes: ReleaseNullable<string>;
  sequence_metadata: ReleaseNullable<AhlHslSequenceMetadata>;
  revision_status: string;
  last_verified_at: string;
  verification_basis: string[];
  change_reason: string;
}

export interface AhlHslMeasurementDetails {
  [key: string]: ReleaseJsonValue;
}

export interface AhlHslParameterContextRecord {
  id: string;
  source_id: string;
  host_species: ReleaseNullable<string>;
  host_strain: ReleaseNullable<string>;
  vector_system: ReleaseNullable<string>;
  promoter_configuration: ReleaseNullable<string>;
  reporter: ReleaseNullable<string>;
  culture_medium: ReleaseNullable<string>;
  temperature: ReleaseNullable<string>;
  induction_conditions: ReleaseNullable<string>;
  exposure_time: ReleaseNullable<string>;
  measurement_platform: ReleaseNullable<string>;
  measurement_unit: ReleaseNullable<string>;
  normalization_method: ReleaseNullable<string>;
  background_subtraction: ReleaseNullable<string>;
  biological_replicates: ReleaseNullable<number>;
  technical_replicates: ReleaseNullable<number>;
  applicable_component_ids: string[];
  notes: ReleaseNullable<string>;
  measurement_details: ReleaseNullable<AhlHslMeasurementDetails>;
  revision_status: string;
  last_verified_at: string;
  verification_basis: string[];
  change_reason: string;
}

export type AhlHslWorkingRange = readonly [number, number];

export interface AhlHslReceiverResponseRecord {
  id: string;
  receiver_component_id: string;
  input_signal_id: string;
  parameter_context_id: string;
  direction: string;
  software_status: string;
  evidence_type: string;
  fit_status: string;
  model_type: string;
  basal: ReleaseNullable<number>;
  maximum: ReleaseNullable<number>;
  ec50: ReleaseNullable<number>;
  ec50_unit: ReleaseNullable<string>;
  hill_coefficient: ReleaseNullable<number>;
  fold_activation: ReleaseNullable<number>;
  working_range: ReleaseNullable<AhlHslWorkingRange>;
  approximate_value: boolean;
  approximation_qualifier: ReleaseNullable<string>;
  fit_constraints: string[];
  quality_level: string;
  evidence_location: string;
  source_ids: string[];
  reconstruction_status: string;
  fixed_weight_candidate: boolean;
  normalized_demo_only: boolean;
  notes: ReleaseNullable<string>;
  ec50_original_value: ReleaseNullable<number>;
  ec50_original_unit: ReleaseNullable<string>;
  parameter_source_location: ReleaseNullable<string>;
  demo_implementation: ReleaseNullable<string>;
  numerical_execution_allowed: boolean;
  status_override: boolean;
  override_reason: ReleaseNullable<string>;
  runtime_scope: ReleaseNullable<string>;
  revision_status: string;
  last_verified_at: string;
  verification_basis: string[];
  change_reason: string;
  workbook_ingestion_status?: string;
  reported_parameter_symbol?: string;
  parameter_precision_policy?: string;
  reported_model_parameters?: ReleaseNullable<{ readonly [key: string]: number }>;
  parameter_uncertainty?: ReleaseNullable<ReleaseJsonValue>;
}

export interface AhlHslSenderOutputRecord {
  readonly [key: string]: ReleaseJsonValue;
}

export interface AhlHslEffectivePairRecord {
  id: string;
  sender_component_id: string;
  receiver_component_id: string;
  assay_context_id: string;
  observed_effect: string;
  response_class: string;
  supernatant_fraction_or_condition: ReleaseNullable<string>;
  intermediate_signal_measured: boolean;
  decomposition_prohibited: boolean;
  source_ids: string[];
  evidence_location: string;
  reconstruction_status: string;
  notes: ReleaseNullable<string>;
  assay_details: ReleaseNullable<{ readonly [key: string]: ReleaseJsonValue }>;
  revision_status: string;
  last_verified_at: string;
  verification_basis: string[];
  change_reason: string;
}

export interface AhlHslCompatibilityRelationRecord {
  id: string;
  subject_component_id: string;
  target_component_id: ReleaseNullable<string>;
  input_signal_id: ReleaseNullable<string>;
  parameter_context_id: string;
  relation_type: string;
  direction: string;
  qualitative_outcome: string;
  numeric_use_allowed: boolean;
  source_ids: string[];
  evidence_location: string;
  reconstruction_status: string;
  notes: ReleaseNullable<string>;
  numerical_execution_allowed: boolean;
  revision_status: string;
  last_verified_at: string;
  verification_basis: string[];
  change_reason: string;
}

export interface AhlHslSourceRecord {
  source_id: string;
  authors: string;
  title: string;
  year: ReleaseNullable<number>;
  journal_or_repository: ReleaseNullable<string>;
  doi: ReleaseNullable<string>;
  pmid: ReleaseNullable<string>;
  pmcid: ReleaseNullable<string>;
  zenodo_doi: ReleaseNullable<string>;
  addgene_id: ReleaseNullable<string>;
  registry_id: ReleaseNullable<string>;
  primary_url: ReleaseNullable<string>;
  supplementary_url: ReleaseNullable<string>;
  repository_url: ReleaseNullable<string>;
  source_type: string;
  verification_status: string;
  verified_location: ReleaseNullable<string>;
  notes: ReleaseNullable<string>;
  mapped_signal_ids: string[];
  mapped_component_ids: string[];
  mapped_relation_ids: string[];
  publication_year: ReleaseNullable<number>;
  accessed_at: ReleaseNullable<string>;
  mapped_rejected_ids: string[];
  revision_status: string;
  last_verified_at: string;
  verification_basis: string[];
  change_reason: string;
  access_status?: string;
  database_version_or_release?: ReleaseNullable<string>;
}

export interface AhlHslArrayCounts {
  signals: number;
  components: number;
  parameter_contexts: number;
  receiver_responses: number;
  sender_outputs: number;
  effective_pairs: number;
  compatibility_relations: number;
}

export interface AhlHslStatistics {
  before_revision: { array_counts: AhlHslArrayCounts; [key: string]: unknown };
  after_revision: { array_counts: AhlHslArrayCounts; [key: string]: unknown };
  difference: { array_counts: AhlHslArrayCounts; [key: string]: unknown };
  fixed_weight_candidate: number;
  revision_status_counts: { readonly [key: string]: number };
}

export interface AhlHslValidationReport {
  validation_date: string;
  all_checks_passed: boolean;
  checks: { readonly [key: string]: string };
  assertions: string[];
  limitations: string;
}

export interface AhlHslSoftwareStatusRules {
  allowed_statuses: string[];
  component_relation_inheritance: { readonly [key: string]: string };
  runtime_demo_requirements: string[];
  fixed_weight_rule: string;
}

export interface AhlHslRevisionMetadata {
  revision_version: string;
  revision_date: string;
  previous_release_version: string;
  revision_type: string;
  records_checked: number;
  records_modified: number;
  records_added: number;
  records_removed: number;
  ids_changed: number;
  revision_status_counts: { readonly [key: string]: number };
  primary_revision_groups: string[];
  evidence_boundary: string;
}

export interface AhlHslComponentCatalogRelease {
  release_metadata: AhlHslReleaseMetadata;
  signals: AhlHslSignalRecord[];
  components: AhlHslComponentRecord[];
  parameter_contexts: AhlHslParameterContextRecord[];
  receiver_responses: AhlHslReceiverResponseRecord[];
  sender_outputs: AhlHslSenderOutputRecord[];
  effective_pairs: AhlHslEffectivePairRecord[];
  compatibility_relations: AhlHslCompatibilityRelationRecord[];
  sources: AhlHslSourceRecord[];
  statistics: AhlHslStatistics;
  validation: AhlHslValidationReport;
  software_status_rules: AhlHslSoftwareStatusRules;
  revision_metadata: AhlHslRevisionMetadata;
}

export type RawAhlHslRelease = AhlHslComponentCatalogRelease;
