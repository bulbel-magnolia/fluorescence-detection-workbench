import type {
  BfnApplicabilityState,
  BfnContextApplicabilityCheck,
} from './compatibility/compatibilityTypes';
import type {
  BfnTemporalEvidenceTier,
  BfnTemporalExecutionMode,
  BfnTemporalResolutionBasis,
} from './temporal/temporalTypes';

export type BfnNetworkMode = 'static' | 'dynamic';

export type BfnQuantityType =
  | 'concentration'
  | 'amount'
  | 'production_rate'
  | 'expression_level'
  | 'activity'
  | 'flux'
  | 'fraction'
  | 'cell_density';

export type BfnUnit =
  | 'M'
  | 'mM'
  | 'uM'
  | 'nM'
  | 'pM'
  | 'nM/h'
  | 'uM/h'
  | 'molecules/cell'
  | 'RPU'
  | 'dimensionless'
  | 'OD600';

export type BfnEvidenceGrade =
  | 'measured_single_context'
  | 'measured_multiple_contexts'
  | 'externally_validated'
  | 'fitted_from_published_data'
  | 'mechanistic_model_only'
  | 'data_driven_prediction'
  | 'independent_assumption'
  | 'proposed_unbuilt_design';

export type BfnModelFamily =
  | 'hill_activation'
  | 'hill_repression'
  | 'linear_transfer'
  | 'identity'
  | 'independent_inputs'
  | 'first_order'
  | 'accumulator';

export type BfnUncertaintyMethod =
  | 'parameter_interval_envelope'
  | 'posterior_samples'
  | 'bootstrap'
  | 'covariance'
  | 'none'
  | 'not_recorded';

export interface BfnUserAuthoredPortMetadata {
  origin: 'user_defined';
  name: string;
}

export interface BfnPort {
  id: string;
  displayName?: BfnLocalizedDisplayName;
  authoring?: BfnUserAuthoredPortMetadata;
  entity: string;
  quantityType: BfnQuantityType;
  unit: BfnUnit;
  direction: 'input' | 'output';
}

export interface BfnParameterEstimate {
  value: number;
  unit: BfnUnit | 'h' | 'dimensionless';
  interval95?: readonly [number, number];
}

export interface BfnHillResponse {
  family: 'hill_activation' | 'hill_repression';
  inputPortId: string;
  ymin: BfnParameterEstimate;
  ymax: BfnParameterEstimate;
  k: BfnParameterEstimate;
  n: BfnParameterEstimate;
}

export interface BfnLinearResponse {
  family: 'linear_transfer';
  inputPortId: string;
  scale: BfnParameterEstimate;
  intercept: BfnParameterEstimate;
  outputMinimum?: number;
  outputMaximum?: number;
}

export interface BfnIdentityResponse {
  family: 'identity';
  inputPortId: string;
}

export interface BfnIndependentInputTerm {
  inputPortId: string;
  direction: 'activation' | 'repression';
  k: BfnParameterEstimate;
  n: BfnParameterEstimate;
  contribution: BfnParameterEstimate;
}

export interface BfnIndependentResponse {
  family: 'independent_inputs';
  terms: BfnIndependentInputTerm[];
  basal: BfnParameterEstimate;
  outputMaximum: BfnParameterEstimate;
  aggregation: 'bounded_sum' | 'multiplicative';
  interactionAssumption: 'independent_unverified';
}

export type BfnStaticResponse =
  BfnHillResponse | BfnLinearResponse | BfnIdentityResponse | BfnIndependentResponse;

export interface BfnCatalogModelReference {
  kind: 'catalog_receiver_response';
  catalogId: string;
  releaseId: string;
  releaseVersion: string;
  responseId: string;
  componentId: string;
  inputSignalId: string;
  outputSignalId: string;
  parameterContextId: string;
  sourceIds: string[];
  sourceModelType: 'four_parameter_logistic' | 'hill_equation_n_fixed_1';
  biologicalDirection: 'activation' | 'derepression';
  runtimeImplementation: string;
  sourceParameters: {
    basal: number | null;
    maximum: number | null;
    ec50: number;
    ec50Unit: 'M';
    hillCoefficient: number;
    workingRange: {
      min: number;
      max: number;
      unit: 'M';
    };
  };
}

export interface BfnModelVariantBase {
  id: string;
  version: string;
  contextId: string | null;
  validityDomainId: string;
  sourceDatasetIds: string[];
  provenanceIds: string[];
  evidenceGrade: BfnEvidenceGrade;
  isDemo: boolean;
}

export interface BfnStaticModel extends BfnModelVariantBase {
  mode: 'static';
  catalogReference?: BfnCatalogModelReference;
  family: Exclude<BfnModelFamily, 'first_order' | 'accumulator'>;
  response: BfnStaticResponse;
  uncertaintyMethod: BfnUncertaintyMethod;
}

export interface BfnDynamicModel extends BfnModelVariantBase {
  mode: 'dynamic';
  family: 'first_order';
  steadyStateResponse: BfnStaticResponse;
  tau: BfnParameterEstimate;
  initialState: number;
  uncertaintyMethod: BfnUncertaintyMethod;
}

export interface BfnAccumulatorDynamicModel extends BfnModelVariantBase {
  mode: 'dynamic';
  family: 'accumulator';
  inputPortId: string;
  outputPortId: string;
  initialState: number;
  uncertaintyMethod: BfnUncertaintyMethod;
}

export type BfnDynamicModelVariant = BfnDynamicModel | BfnAccumulatorDynamicModel;

export type BfnModelVariant = BfnStaticModel | BfnDynamicModelVariant;

export type BfnImplementationMaturity =
  'not_recorded' | 'designed' | 'candidate' | 'reported' | 'validated';

export type BfnModuleImplementationState = 'unspecified' | BfnImplementationMaturity;

export interface BfnBiologicalImplementation {
  id: string;
  labelKey: string;
  promoter: string;
  operator: string | null;
  rbs: string;
  codingSequence: string;
  degradationTag: string;
  plasmidBackbone: string;
  host: string;
  strainComposition: string | null;
  evidenceGrade: BfnEvidenceGrade;
  maturity: BfnImplementationMaturity;
  provenanceIds: string[];
  isDemo: boolean;
}

export interface BfnCanvasPosition {
  x: number;
  y: number;
}

export interface BfnLocalizedDisplayName {
  en: string;
  zh: string;
}

export interface BfnUserAuthoredModuleMetadata {
  origin: 'user_defined';
  name: string;
  description: string | null;
}

export type BfnActiveModelIds =
  | {
      static: string;
      dynamic?: string;
    }
  | {
      static?: never;
      dynamic: string;
    };

export interface BfnFunctionalModule {
  kind: 'functional_module';
  id: string;
  labelKey: string;
  displayName?: BfnLocalizedDisplayName;
  authoring?: BfnUserAuthoredModuleMetadata;
  descriptionKey: string;
  inputPorts: BfnPort[];
  outputPorts: BfnPort[];
  modelVariants: BfnModelVariant[];
  activeModelIds: BfnActiveModelIds;
  implementationIds: string[];
  implementationState: BfnModuleImplementationState;
  evidenceGrade: BfnEvidenceGrade;
  position: BfnCanvasPosition;
  isDemo: boolean;
}

export interface BfnFixedInputSpecification {
  type: 'fixed_value';
  value: number;
  unit: BfnUnit;
}

export interface BfnWorkingRangeSpecification {
  type: 'working_range';
  minimum: number;
  maximum: number;
  points: number;
  unit: BfnUnit;
}

export interface BfnConstantInputSpecification {
  type: 'constant';
  value: number;
  unit: BfnUnit;
}

export interface BfnStepInputSpecification {
  type: 'step';
  before: number;
  after: number;
  atHours: number;
  unit: BfnUnit;
}

export interface BfnPulseInputSpecification {
  type: 'pulse';
  baseline: number;
  amplitude: number;
  startHours: number;
  durationHours: number;
  unit: BfnUnit;
}

export interface BfnPeriodicInputSpecification {
  type: 'periodic';
  baseline: number;
  amplitude: number;
  periodHours: number;
  phaseRadians: number;
  unit: BfnUnit;
}

export interface BfnCustomSeriesInputSpecification {
  type: 'custom_time_series';
  points: Array<{ timeHours: number; value: number }>;
  unit: BfnUnit;
}

export type BfnStaticInputSpecification = BfnFixedInputSpecification | BfnWorkingRangeSpecification;

export type BfnDynamicInputSpecification =
  | BfnConstantInputSpecification
  | BfnStepInputSpecification
  | BfnPulseInputSpecification
  | BfnPeriodicInputSpecification
  | BfnCustomSeriesInputSpecification;

export interface BfnInputSource {
  kind: 'input_source';
  id: string;
  labelKey: string;
  displayName?: BfnLocalizedDisplayName;
  outputPort: BfnPort;
  staticSpecification: BfnStaticInputSpecification;
  dynamicSpecification: BfnDynamicInputSpecification;
  position: BfnCanvasPosition;
}

export interface BfnOutputMonitor {
  kind: 'output_monitor';
  id: string;
  labelKey: string;
  displayName?: BfnLocalizedDisplayName;
  inputPort: BfnPort;
  position: BfnCanvasPosition;
}

export interface BfnIdealEdgeEndpoint {
  nodeId: string;
  portId: string;
}

export interface BfnIdealEdge {
  id: string;
  source: BfnIdealEdgeEndpoint;
  target: BfnIdealEdgeEndpoint;
  mapping: 'identity';
  enabled: boolean;
}

export type BfnContextDocumentationState = 'recorded' | 'partial' | 'not_recorded';

export interface BfnContext {
  id: string;
  labelKey: string;
  documentationState: BfnContextDocumentationState;
  host: string | null;
  strain: string | null;
  medium: string | null;
  temperatureCelsius: number | null;
  ph: number | null;
  oxygenation: string | null;
  growthPhase: string | null;
  plasmidBackbone: string | null;
  copyNumberRegime: string | null;
  inductionProtocol: string | null;
  measurementTimeHours: number | null;
  batch: string | null;
  isDemo: boolean;
}

export interface BfnValidityDomainRange {
  portId: string;
  minimum: number;
  maximum: number;
  unit: BfnUnit;
}

export interface BfnValidityDomain {
  id: string;
  labelKey: string;
  inputRanges: BfnValidityDomainRange[];
  timeRangeHours?: readonly [number, number];
  contextId: string | null;
}

export interface BfnEntityDefinition {
  id: string;
  origin: 'user_defined';
  displayName: string;
  description: string | null;
}

export type BfnProvenanceKind = 'dataset' | 'publication' | 'repository_record' | 'user_note';

export interface BfnProvenanceRecord {
  id: string;
  kind: BfnProvenanceKind;
  reference: string;
}

export interface BfnExperimentalDataset {
  id: string;
  labelKey: string;
  dataType: 'dose_response' | 'multi_input' | 'time_series';
  inputEntities: string[];
  outputEntities: string[];
  replicates: number;
  contextId: string;
  rawFile: string | null;
  calibrationId: string | null;
  evidenceGrade: BfnEvidenceGrade;
  isDemo: boolean;
}

export interface BfnCalibrationCandidate {
  id: string;
  labelKey: string;
  designVariables: {
    promoter: string;
    rbs: string;
    copyNumber: string;
    degradationTag: string;
    receptorLevel: string;
    strainRatio: string | null;
  };
  predictedParameters: {
    ymin: number;
    ymax: number;
    k: number;
    n: number;
    tauHours: number;
  };
  burden: number;
  crosstalk: number;
  noise: number;
  geneticStability: number;
  uncertainty: number;
  sourceEvidenceGrade: BfnEvidenceGrade;
  isDemo: boolean;
}

export interface BfnCalibrationMap {
  id: string;
  labelKey: string;
  targetModuleId: string;
  modelType: 'lookup_table' | 'regression' | 'gaussian_process' | 'hierarchical' | 'mechanistic';
  contextId: string;
  sourceDatasetIds: string[];
  candidates: BfnCalibrationCandidate[];
  isDemo: boolean;
}

export interface BfnRegistry {
  entities: BfnEntityDefinition[];
  provenanceRecords: BfnProvenanceRecord[];
  contexts: BfnContext[];
  validityDomains: BfnValidityDomain[];
  datasets: BfnExperimentalDataset[];
  implementations: BfnBiologicalImplementation[];
  calibrationMaps: BfnCalibrationMap[];
}

export interface BfnAnalysisSettings {
  durationHours: number;
  timeStepHours: number;
  annThresholds: {
    minimumR2: number;
    maximumNrmse: number;
  };
}

export interface BfnNetwork {
  id: string;
  labelKey: string;
  mode: BfnNetworkMode;
  inputSources: BfnInputSource[];
  modules: BfnFunctionalModule[];
  outputMonitors: BfnOutputMonitor[];
  edges: BfnIdealEdge[];
}

export interface BfnProject {
  schema: 'BFN-IR';
  schemaVersion: '2.3';
  id: string;
  labelKey: string;
  network: BfnNetwork;
  registry: BfnRegistry;
  analysis: BfnAnalysisSettings;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}

export type BfnValidationSeverity = 'error' | 'warning' | 'info';

export type BfnValidationCode =
  | 'missing_source_node'
  | 'missing_target_node'
  | 'missing_source_port'
  | 'missing_target_port'
  | 'source_port_direction'
  | 'target_port_direction'
  | 'entity_mismatch'
  | 'quantity_mismatch'
  | 'unit_dimension_mismatch'
  | 'target_already_connected'
  | 'duplicate_edge'
  | 'self_connection'
  | 'static_cycle'
  | 'missing_required_input'
  | 'context_mismatch'
  | 'context_applicability_uncertain'
  | 'context_applicability_mismatch'
  | 'context_applicability_unavailable'
  | 'temporal_execution_unsupported'
  | 'outside_validity_domain'
  | 'invalid_input_specification'
  | 'catalog_model_reference_invalid'
  | 'catalog_release_unavailable'
  | 'catalog_model_mismatch'
  | 'catalog_required_input_unconnected'
  | 'catalog_input_out_of_range'
  | 'catalog_execution_unavailable'
  | 'dynamic_model_contract_invalid'
  | 'accumulator_model_contract_invalid'
  | 'dynamic_process_runtime_unsupported'
  | 'dynamic_feedback_unsupported'
  | 'mixed_dynamic_process_ordering_unsupported';

export interface BfnValidationIssue {
  code: BfnValidationCode;
  severity: BfnValidationSeverity;
  subjectId: string;
  details?: Record<string, string | number>;
}

export interface BfnSimulationPoint {
  coordinate: number;
  timeHours?: number;
  inputs: Record<string, number>;
  moduleOutputs: Record<string, number>;
  output: number;
  lower: number | null;
  upper: number | null;
  extrapolated: boolean;
}

export interface BfnAnnApproximation {
  id: string;
  sourceNetworkId: string;
  workingDomain: Record<string, readonly [number, number]>;
  inputSourceIds: string[];
  weights: number[];
  effectiveIntercept: number;
  metrics: {
    r2: number;
    nrmse: number;
    maximumAbsoluteError: number;
    predictionIntervalCoverage: number | null;
  };
  thresholds: {
    minimumR2: number;
    maximumNrmse: number;
  };
  status: 'accepted' | 'rejected';
  representation: 'ann_affine_approximation' | 'full_nonlinear_model';
}

export interface BfnDynamicMetricsV20V21 {
  steadyValue: number;
  riseTimeHours: number | null;
  peakValue: number;
  peakTimeHours: number;
  overshootFraction: number;
  oscillatory: boolean;
  dcGain: number | null;
  frequencyGain: {
    magnitude: number;
    phaseDegrees: number;
  } | null;
}

export interface BfnDynamicMetricsV22 {
  terminalValue: number;
  steadyStateAvailable: boolean;
  steadyValue: number | null;
  riseTimeHours: number | null;
  peakValue: number;
  peakTimeHours: number;
  overshootFraction: number | null;
  oscillatory: boolean;
  dcGain: number | null;
  frequencyGain: {
    magnitude: number;
    phaseDegrees: number;
  } | null;
}

export type BfnDynamicMetrics = BfnDynamicMetricsV20V21 | BfnDynamicMetricsV22;

export type BfnUncertaintyUnavailableReason =
  'none_declared' | 'not_recorded' | 'parameter_interval_incomplete' | 'method_not_executable';

export interface BfnRunModuleUncertaintySnapshot {
  moduleId: string;
  selectedModelId: string | null;
  method: BfnUncertaintyMethod | null;
  intervalExecutable: boolean;
  reason: BfnUncertaintyUnavailableReason | null;
}

export interface BfnRunUncertaintySnapshot {
  scope: 'output_reachable';
  status: 'available' | 'unavailable';
  method: 'parameter_interval_envelope' | null;
  modules: BfnRunModuleUncertaintySnapshot[];
}

export type BfnUncertaintyPropagationMode =
  'parameter_interval' | 'deterministic_transform' | 'unavailable';

export interface BfnRunModuleUncertaintySnapshotV22 extends BfnRunModuleUncertaintySnapshot {
  propagationMode: BfnUncertaintyPropagationMode;
}

export interface BfnRunUncertaintySnapshotV22 {
  scope: 'output_reachable';
  status: 'available' | 'unavailable';
  method: 'parameter_interval_envelope' | null;
  modules: BfnRunModuleUncertaintySnapshotV22[];
}

interface BfnSimulationResultBase<TDynamicMetrics extends BfnDynamicMetrics> {
  id: string;
  networkId: string;
  mode: BfnNetworkMode;
  points: BfnSimulationPoint[];
  primaryInputSourceId: string;
  outputMonitorId: string;
  signalSnapshot?: BfnRunSignalSnapshot;
  temporalSnapshot?: BfnRunTemporalSnapshot;
  contextApplicabilitySnapshot?: BfnRunContextApplicabilitySnapshot;
  annApproximation: BfnAnnApproximation | null;
  dynamicMetrics: TDynamicMetrics | null;
  validationIssues: BfnValidationIssue[];
  modelVersions: string[];
  contextIds: string[];
  extrapolated: boolean;
  completedAt: string;
  isDemo: boolean;
  experimentalValidity: 'not_validated';
}

export interface BfnSimulationResultV20 extends BfnSimulationResultBase<BfnDynamicMetricsV20V21> {
  engineVersion: 'BFN-SIM-2.0';
  uncertaintyMethod: 'parameter_interval_envelope';
  uncertaintySnapshot?: never;
}

export interface BfnSimulationResultV21 extends BfnSimulationResultBase<BfnDynamicMetricsV20V21> {
  engineVersion: 'BFN-SIM-2.1';
  uncertaintyMethod: 'parameter_interval_envelope' | null;
  uncertaintySnapshot: BfnRunUncertaintySnapshot;
}

export interface BfnSimulationResultV22 extends BfnSimulationResultBase<BfnDynamicMetricsV22> {
  engineVersion: 'BFN-SIM-2.2';
  uncertaintyMethod: 'parameter_interval_envelope' | null;
  uncertaintySnapshot: BfnRunUncertaintySnapshotV22;
}

export type BfnSimulationResult =
  BfnSimulationResultV20 | BfnSimulationResultV21 | BfnSimulationResultV22;

export interface BfnRunInputSignalSnapshot {
  sourceId: string;
  labelKey: string;
  entity: string;
  quantityType: BfnQuantityType;
  unit: BfnUnit;
}

export interface BfnRunOutputSignalSnapshot {
  monitorId: string;
  labelKey: string;
  entity: string;
  quantityType: BfnQuantityType;
  unit: BfnUnit;
}

export interface BfnRunSignalSnapshot {
  primaryInput: BfnRunInputSignalSnapshot;
  output: BfnRunOutputSignalSnapshot;
}

export interface BfnRunTemporalModuleSnapshot {
  moduleId: string;
  selectedModelId: string | null;
  executionMode: BfnTemporalExecutionMode;
  evidenceTier: BfnTemporalEvidenceTier;
  resolutionBasis: BfnTemporalResolutionBasis;
}

export interface BfnRunTemporalSnapshot {
  scope: 'output_reachable';
  modules: BfnRunTemporalModuleSnapshot[];
}

export interface BfnRunContextApplicabilityEdgeSnapshot {
  edgeId: string;
  state: BfnApplicabilityState | 'unavailable';
  checks?: readonly BfnContextApplicabilityCheck[];
}

export interface BfnRunContextApplicabilitySnapshot {
  scope: 'output_reachable_module_edges';
  edges: BfnRunContextApplicabilityEdgeSnapshot[];
}

export interface BfnReverseTarget {
  inputMinimum: number;
  inputMaximum: number;
  thresholdTarget: number;
  basalMaximum: number;
  maximumMinimum: number;
  responseTimeMaximumHours: number;
  burdenMaximum: number;
  noiseMaximum: number;
  stabilityPriority: number;
  weights: {
    functionMatch: number;
    burden: number;
    crosstalk: number;
    noise: number;
    uncertainty: number;
    geneticRisk: number;
  };
}

export interface BfnReverseDesignCandidate {
  id: string;
  calibrationCandidateId: string;
  labelKey: string;
  designVariables: BfnCalibrationCandidate['designVariables'];
  predictedParameters: BfnCalibrationCandidate['predictedParameters'];
  predictedResponse: Array<{ input: number; output: number }>;
  scores: {
    total: number;
    functionMatch: number;
    burden: number;
    crosstalk: number;
    noise: number;
    uncertainty: number;
    geneticRisk: number;
  };
  evidenceGrade: 'proposed_unbuilt_design';
  sourceEvidenceGrade: BfnEvidenceGrade;
  recommendedValidationKey: string;
  isDemo: boolean;
}
