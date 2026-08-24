import type { DataOrigin, HistoryRecord } from '../../domain/types';
import type { LiteratureCandidateReference } from './catalog/catalogTypes';
import type {
  NetworkValidationModelingReference,
  ReverseTargetModelingReference,
} from './detectionModeling';

export type { LiteratureCandidateReference };

export type ModelNodeKind = 'input' | 'processing' | 'output';
export type ModelTemplateId = 'licorice-quality' | 'signal-gate' | 'feedback-loop';
export type OutputBand = 'low' | 'intermediate' | 'high';

export type ModelParameterStatus =
  | 'team-calibrated'
  | 'literature-context'
  | 'normalized-demo'
  | 'calibration-required'
  | 'reference-only'
  | 'legacy-demo'
  | 'unvalidated'
  | 'experimental';
export type ModelParameterProvenance =
  'development-fixture' | 'legacy-demo' | 'catalog-reference' | 'user-specified' | 'unknown';
export type ModelInputDirection = 'activation' | 'inhibition' | 'derepression';

export interface ModelNodeParameters {
  baseline: number;
  gain: number;
  parameterStatus: ModelParameterStatus;
  provenance: ModelParameterProvenance;
}

export interface ReceiverResponseWorkingRange {
  min: number;
  max: number;
  unit: 'M';
}

export interface FourParameterLogisticOriginalParameters {
  basal: number;
  maximum: number;
  ec50: number;
  hillCoefficient: number;
  ec50Unit: 'M';
}

export interface HillDerepressionOriginalParameters {
  basal: number | null;
  maximum: number | null;
  ec50: number;
  hillCoefficient: 1;
  ec50Unit: 'M';
}

export interface ReceiverResponseBindingCommon {
  catalogId: string;
  catalogVersion: string;
  releaseId: string;
  releaseVersion: string;
  componentId: string;
  receiverResponseId: string;
  parameterContextId: string;
  inputSignalId: string;
  outputSignalId: string;
  sourceIds: string[];
  direction: ModelInputDirection;
  inputUnit: 'M';
  workingRange: ReceiverResponseWorkingRange;
  softwareStatus: 'runtime-demo';
  normalizedDemoOnly: true;
  numericalExecutionAllowed: true;
  fixedWeightCandidate: false;
}

export interface FourParameterLogisticReceiverResponseBinding extends ReceiverResponseBindingCommon {
  kind: 'four_parameter_logistic';
  modelType: 'four_parameter_logistic';
  demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1';
  originalParameters: FourParameterLogisticOriginalParameters;
}

export interface HillDerepressionReceiverResponseBinding extends ReceiverResponseBindingCommon {
  kind: 'hill_equation_n_fixed_1';
  modelType: 'hill_equation_n_fixed_1';
  demoImplementation: 'hill_derepression_n_fixed_1_then_within_context_normalization';
  originalParameters: HillDerepressionOriginalParameters;
}

export type ReceiverResponseBinding =
  FourParameterLogisticReceiverResponseBinding | HillDerepressionReceiverResponseBinding;

export interface ConcentrationInputBinding {
  targetNodeId: string;
  receiverResponseId: string;
  parameterContextId: string;
  inputSignalId: string;
  inputUnit: 'M';
  workingRange: ReceiverResponseWorkingRange;
}

export interface ModelInputPort {
  id: string;
  signalId: string;
  sensitivity: number;
  /** Import-only alias; generated v2 uses sensitivity. */
  weight?: number;
  direction: ModelInputDirection;
  parameterStatus: ModelParameterStatus;
  provenance: ModelParameterProvenance;
}

export interface ModelOutputPort {
  id: string;
  signalId: string;
  strength: number;
  parameterStatus: ModelParameterStatus;
  provenance: ModelParameterProvenance;
}

export interface ModelNode {
  id: string;
  name: string;
  kind: ModelNodeKind;
  x: number;
  y: number;
  parameters: ModelNodeParameters;
  inputPorts: ModelInputPort[];
  outputPorts: ModelOutputPort[];
  part?: {
    id: string;
    sourceKey: string;
    evidenceStatus: 'documented-pattern' | 'illustrative';
  };
  catalogReference?: LiteratureCandidateReference;
  receiverResponseBinding?: ReceiverResponseBinding;
  concentrationInputBinding?: ConcentrationInputBinding;
}

export interface ModelEdge {
  id: string;
  source: string;
  sourcePortId: string;
  target: string;
  targetPortId: string;
  signalId: string;
  enabled: boolean;
}

export interface ModelPortCapabilities {
  input: boolean;
  output: boolean;
}

export type ModelConnectionIssue =
  | 'missing-source'
  | 'missing-target'
  | 'source-has-no-output'
  | 'target-has-no-input'
  | 'missing-source-port'
  | 'missing-target-port'
  | 'source-port-not-output'
  | 'target-port-not-input'
  | 'source-port-direction'
  | 'target-port-direction'
  | 'signal-mismatch'
  | 'bound-response-requires-concentration-input'
  | 'bound-response-input-occupied'
  | 'parameter-context-conflict'
  | 'no-compatible-port'
  | 'ambiguous-compatible-port'
  | 'self-connection'
  | 'duplicate-connection';

export interface ModelConnectionRequest {
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId?: string | undefined;
  targetPortId?: string | undefined;
  edgeId?: string | undefined;
}

export interface CompatiblePortPair {
  sourcePortId: string;
  targetPortId: string;
  signalId: string;
}

export interface DetectionRecordReference {
  mode: 'reference-only';
  recordId: string;
  sampleId: string;
  createdAt: string;
  linkedAt: string;
  origin: DataOrigin;
  isDemo: boolean;
  resultStatus: HistoryRecord['resultStatus'];
}

export type LegacyReference = Record<string, unknown>;

export interface NetworkModel {
  schemaVersion: 2;
  id: string;
  templateId: ModelTemplateId;
  name: string;
  description: string;
  nodes: ModelNode[];
  edges: ModelEdge[];
  outputNodeId: string;
  thresholds: readonly [number, number];
  /** Legacy/reference-only link retained for compatibility; it never changes node parameters. */
  recordReference?: DetectionRecordReference | null | undefined;
  legacyRecordReference?: DetectionRecordReference | null;
  legacyReference?: LegacyReference | null;
  updatedAt: string;
  isDemo: boolean;
}

export interface SimulationConvergence {
  converged: boolean;
  iterations: number;
  maxIterations: number;
  tolerance: number;
  maxDelta: number;
}

export interface SimulationResult {
  engineVersion: 'BIONET-SIM-STEADY-STATE-DEMO-1' | 'BIONET-SIM-STEADY-STATE-2';
  simulationMode: 'steady-state';
  isSteadyState: true;
  parameterStatus: ModelParameterStatus | 'mixed';
  parameterProvenance: ModelParameterProvenance | 'mixed';
  convergence: SimulationConvergence;
  startedAt: string;
  completedAt: string;
  finalValues: Record<string, number>;
  outputNodeId: string;
  outputValue: number;
  outputBand: OutputBand;
  isDemo: boolean;
  experimentalValidity: 'not-validated';
  disclaimer: string;
}

export interface ModelingRun {
  id: string;
  createdAt: string;
  modelName: string;
  templateId: ModelTemplateId;
  nodeCount: number;
  edgeCount: number;
  /** Legacy/reference-only link retained for compatibility; it never changes node parameters. */
  recordReference?: DetectionRecordReference | null | undefined;
  legacyRecordReference?: DetectionRecordReference | null;
  reverseTargetReference?: ReverseTargetModelingReference;
  validationReference?: NetworkValidationModelingReference;
  result: SimulationResult;
  modelSnapshot?: NetworkModel;
  note?: string;
}

export interface TemplateLabels {
  modelName: string;
  description: string;
  nodes: {
    sensorA: string;
    sensorB: string;
    sensorC: string;
    integration: string;
    gate: string;
    memory: string;
    response: string;
    reporter: string;
  };
}
