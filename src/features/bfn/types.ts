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
  | 'first_order';

export interface BfnPort {
  id: string;
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

interface BfnModelVariantBase {
  id: string;
  version: string;
  contextId: string;
  validityDomainId: string;
  sourceDatasetIds: string[];
  evidenceGrade: BfnEvidenceGrade;
  isDemo: boolean;
}

export interface BfnStaticModel extends BfnModelVariantBase {
  mode: 'static';
  catalogReference?: BfnCatalogModelReference;
  family: Exclude<BfnModelFamily, 'first_order'>;
  response: BfnStaticResponse;
  uncertaintyMethod:
    'parameter_interval_envelope' | 'posterior_samples' | 'bootstrap' | 'covariance';
}

export interface BfnDynamicModel extends BfnModelVariantBase {
  mode: 'dynamic';
  family: 'first_order';
  steadyStateResponse: BfnStaticResponse;
  tau: BfnParameterEstimate;
  initialState: number;
  uncertaintyMethod:
    'parameter_interval_envelope' | 'posterior_samples' | 'bootstrap' | 'covariance';
}

export type BfnModelVariant = BfnStaticModel | BfnDynamicModel;

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
  isDemo: boolean;
}

export interface BfnCanvasPosition {
  x: number;
  y: number;
}

export interface BfnFunctionalModule {
  kind: 'functional_module';
  id: string;
  labelKey: string;
  descriptionKey: string;
  inputPorts: BfnPort[];
  outputPorts: BfnPort[];
  modelVariants: BfnModelVariant[];
  activeModelIds: {
    static: string;
    dynamic?: string;
  };
  implementationIds: string[];
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
  outputPort: BfnPort;
  staticSpecification: BfnStaticInputSpecification;
  dynamicSpecification: BfnDynamicInputSpecification;
  position: BfnCanvasPosition;
}

export interface BfnOutputMonitor {
  kind: 'output_monitor';
  id: string;
  labelKey: string;
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

export interface BfnContext {
  id: string;
  labelKey: string;
  host: string;
  strain: string;
  medium: string;
  temperatureCelsius: number;
  ph: number | null;
  oxygenation: string;
  growthPhase: string;
  plasmidBackbone: string;
  copyNumberRegime: string;
  inductionProtocol: string;
  measurementTimeHours: number | null;
  batch: string;
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
  contextId: string;
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
  schemaVersion: '2.0';
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
  | 'outside_validity_domain'
  | 'invalid_input_specification'
  | 'catalog_model_reference_invalid'
  | 'catalog_release_unavailable'
  | 'catalog_model_mismatch'
  | 'catalog_required_input_unconnected'
  | 'catalog_input_out_of_range'
  | 'catalog_execution_unavailable';

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
  lower: number;
  upper: number;
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
    predictionIntervalCoverage: number;
  };
  thresholds: {
    minimumR2: number;
    maximumNrmse: number;
  };
  status: 'accepted' | 'rejected';
  representation: 'ann_affine_approximation' | 'full_nonlinear_model';
}

export interface BfnDynamicMetrics {
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

export interface BfnSimulationResult {
  id: string;
  engineVersion: 'BFN-SIM-2.0';
  networkId: string;
  mode: BfnNetworkMode;
  points: BfnSimulationPoint[];
  primaryInputSourceId: string;
  outputMonitorId: string;
  signalSnapshot?: BfnRunSignalSnapshot;
  annApproximation: BfnAnnApproximation | null;
  dynamicMetrics: BfnDynamicMetrics | null;
  validationIssues: BfnValidationIssue[];
  modelVersions: string[];
  contextIds: string[];
  extrapolated: boolean;
  uncertaintyMethod: 'parameter_interval_envelope';
  completedAt: string;
  isDemo: boolean;
  experimentalValidity: 'not_validated';
}

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
