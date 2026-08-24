/**
 * Component catalog schema v2.
 *
 * This module contains the data contract only.  The values in this schema are
 * evidence and integration metadata; they are not a claim that a component is
 * quantitatively validated for a new assay.
 */

export const COMPONENT_CATALOG_V2_SCHEMA_VERSION = 'component-catalog.schema.v2' as const;

export type ComponentCatalogV2SchemaVersion = typeof COMPONENT_CATALOG_V2_SCHEMA_VERSION;

/** The only graph node types that can be constructed from this catalog. */
export type CatalogV2NodeType = 'input' | 'processing' | 'output';

export type CatalogV2AdmissionStatus =
  | 'runtime-quantitative'
  | 'runtime-demo'
  | 'compatibility-only'
  | 'calibration-candidate'
  | 'reference-only'
  | 'rejected';

export type CatalogV2ReleaseStatus = 'development-fixture' | 'draft' | 'candidate' | 'released';

export type CatalogV2SourceKind =
  | 'primary-paper'
  | 'database'
  | 'registry'
  | 'supplement'
  | 'legacy-catalog'
  | 'development-fixture';

export type CatalogV2SignalDirection = 'input' | 'output' | 'intermediate' | 'bidirectional';

export type CatalogV2SignalKind =
  'fluorescence' | 'analyte' | 'regulatory' | 'control' | 'quality' | 'state' | 'unknown';

export type CatalogV2MeasurementKind = 'continuous' | 'discrete' | 'categorical' | 'unknown';

export type CatalogV2CompatibilityKind =
  'compatible' | 'no-response' | 'requires-calibration' | 'incompatible';

export interface CatalogV2Counts {
  signals: number;
  components: number;
  parameterContexts: number;
  receiverResponses: number;
  senderOutputs: number;
  effectivePairs: number;
  compatibilityRelations: number;
  sources: number;
}

export interface CatalogV2ReleaseManifest {
  schemaVersion: ComponentCatalogV2SchemaVersion;
  catalogId: string;
  releaseId: string;
  releaseVersion: string;
  generatedAt: string;
  status: CatalogV2ReleaseStatus;
  counts: CatalogV2Counts;
  /** Optional provenance for a migration or a derived release. */
  derivedFrom?: {
    catalogId: string;
    catalogVersion: string;
  };
  notes: string[];
  /** This marker is required for fixtures and prevents them being mistaken for data. */
  fixtureLabel?: 'development-fixture';
}

export interface CatalogV2NumericRange {
  min: number;
  max: number;
  unit?: string;
}

export interface CatalogV2SignalPrecision {
  measurementKind: CatalogV2MeasurementKind;
  /** Describes what precision information is available, without inventing a value. */
  statement: string;
  resolution?: number;
  workingRange?: CatalogV2NumericRange;
}

export interface CatalogV2Signal {
  id: string;
  label: string;
  unit: string;
  direction: CatalogV2SignalDirection;
  kind: CatalogV2SignalKind;
  precision: CatalogV2SignalPrecision;
  sourceIds: string[];
  /** Original references are retained when a legacy entry is migrated. */
  legacySourceRefs?: string[];
  notes: string[];
}

export interface CatalogV2Parameter {
  name: string;
  value: string;
  unit?: string;
}

export interface CatalogV2ParameterContext {
  id: string;
  label: string;
  parameters: CatalogV2Parameter[];
  sourceIds: string[];
  /** A context can be unknown without being a demonstration context. */
  certainty: 'documented' | 'partially-documented' | 'unknown';
  demoBoundary: CatalogV2DemoBoundary;
  /** Full context-specific conditions retained from a release record. */
  details?: CatalogV2ContextDetails;
  notes: string[];
}

export interface CatalogV2ContextDetails {
  hostSpecies: string | null;
  hostStrain: string | null;
  vectorSystem: string | null;
  promoterConfiguration: string | null;
  reporter: string | null;
  cultureMedium: string | null;
  temperature: string | null;
  inductionConditions: string | null;
  exposureTime: string | null;
  measurementPlatform: string | null;
  measurementUnit: string | null;
  normalizationMethod: string | null;
  backgroundSubtraction: string | null;
  biologicalReplicates: number | null;
  technicalReplicates: number | null;
  applicableComponentIds: string[];
  measurementDetails: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface CatalogV2DemoBoundary {
  isDemo: boolean;
  description: string;
  permittedUses: string[];
  forbiddenUses: string[];
}

export interface CatalogV2EvidenceSummary {
  grade: 'A' | 'B' | 'C' | 'D' | 'unknown';
  reviewStatus: 'passed' | 'needs-review' | 'withdrawn';
  scope: string;
  directInEColi: boolean;
  sourceIds: string[];
  notes: string[];
  boundaryNotes: string[];
}

export interface CatalogV2Admission {
  status: CatalogV2AdmissionStatus;
  simulationReady: boolean;
  constructionReady: boolean;
  /** Explicit parameter provenance; an empty list means no quantitative source is claimed. */
  parameterSourceIds: string[];
  /** Explicit parameter context; null means the context is not established. */
  parameterContextId: string | null;
  demoBoundary: CatalogV2DemoBoundary;
  rationale: string;
}

export interface CatalogV2Provenance {
  sourceIds: string[];
  parameterContextId: string;
  statement: string;
  isDemo: boolean;
}

export interface CatalogV2RecordProvenance {
  sourceIds: string[];
  parameterContextId: string | null;
  statement: string;
  isDemo: boolean;
  evidenceLocation?: string;
  reconstructionStatus?: string;
  revisionStatus?: string;
  lastVerifiedAt?: string;
  verificationBasis?: string[];
}

export interface CatalogV2SourceProvenance {
  sourceId: string;
  sourceType: string;
  authors: string;
  title: string;
  year: number | null;
  journalOrRepository: string | null;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  primaryUrl: string | null;
  supplementaryUrl: string | null;
  repositoryUrl: string | null;
  verificationStatus: string;
  verifiedLocation: string | null;
  mappedSignalIds: string[];
  mappedComponentIds: string[];
  mappedRelationIds: string[];
  mappedRejectedIds: string[];
  accessedAt: string | null;
  revisionStatus: string;
  lastVerifiedAt: string;
  verificationBasis: string[];
  changeReason: string | null;
  [key: string]: unknown;
}

export interface CatalogV2SourceResponse {
  direction: string;
  softwareStatus: string;
  evidenceType: string;
  fitStatus: string;
  modelType: string;
  basal: number | null;
  maximum: number | null;
  ec50: number | null;
  ec50Unit: string | null;
  hillCoefficient: number | null;
  foldActivation: number | null;
  workingRange: CatalogV2NumericRange | null;
  approximateValue: boolean;
  approximationQualifier: string | null;
  fitConstraints: string[];
  qualityLevel: string;
  evidenceLocation: string;
  reconstructionStatus: string;
  fixedWeightCandidate: boolean;
  normalizedDemoOnly: boolean;
  notes: string | null;
  ec50OriginalValue: number | null;
  ec50OriginalUnit: string | null;
  parameterSourceLocation: string | null;
  demoImplementation: string | null;
  numericalExecutionAllowed: boolean;
  statusOverride: boolean;
  overrideReason: string | null;
  runtimeScope: string | null;
  revisionStatus: string;
  lastVerifiedAt: string;
  verificationBasis: string[];
  changeReason: string;
  workbookIngestionStatus?: string;
  reportedParameterSymbol?: string;
  parameterPrecisionPolicy?: string;
  reportedModelParameters?: Record<string, number> | null;
  parameterUncertainty?: unknown;
  [key: string]: unknown;
}

export interface CatalogV2ObservedEffectivePair {
  senderComponentId: string | null;
  receiverComponentId: string | null;
  assayContextId: string | null;
  observedEffect: string;
  responseClass: string;
  supernatantFractionOrCondition: string | null;
  intermediateSignalMeasured: boolean;
  decompositionProhibited: boolean;
  sourceIds: string[];
  evidenceLocation: string;
  reconstructionStatus: string;
  notes: string[];
  assayDetails: Record<string, unknown> | null;
  revisionStatus: string;
  lastVerifiedAt: string;
  verificationBasis: string[];
  changeReason: string;
}

export interface CatalogV2FixedWeightCandidate {
  kind: 'fixed-weight';
  weight: number;
  workingRange: CatalogV2NumericRange;
  method: string;
  rmse: number;
  rSquared: number;
  provenance: CatalogV2Provenance;
}

export interface CatalogV2Component {
  id: string;
  label: string;
  nodeType: CatalogV2NodeType;
  /** Original release role; nodeType remains processing for released nodes. */
  componentType?: 'receiver' | 'sender';
  /** Mechanism labels are descriptive tags; they are not node classifications. */
  mechanismLabels: string[];
  inputSignalIds: string[];
  outputSignalIds: string[];
  parameterContextIds: string[];
  sourceIds: string[];
  evidence: CatalogV2EvidenceSummary;
  admission: CatalogV2Admission;
  notes: string[];
  /** Migration-only metadata, absent from native v2 records. */
  legacy?: {
    catalogId: string;
    catalogVersion: string;
    entryId: string;
    category: string;
    entityType: string;
    signalEvidence: string[];
  };
}

export interface CatalogV2ReceiverResponse {
  id: string;
  receiverComponentId: string;
  inputSignalId: string;
  outputSignalId: string | null;
  parameterContextId: string;
  sourceIds: string[];
  admission: CatalogV2Admission;
  fixedWeightCandidate?: CatalogV2FixedWeightCandidate;
  demoBoundary: CatalogV2DemoBoundary;
  sourceResponse?: CatalogV2SourceResponse;
  sourceProvenance?: CatalogV2RecordProvenance[];
  notes: string[];
}

export interface CatalogV2SenderOutput {
  id: string;
  senderComponentId: string;
  inputSignalId: string | null;
  outputSignalId: string;
  outputOrdinal: number;
  parameterContextId: string;
  sourceIds: string[];
  admission: CatalogV2Admission;
  fixedWeightCandidate?: CatalogV2FixedWeightCandidate;
  demoBoundary: CatalogV2DemoBoundary;
  notes: string[];
}

export interface CatalogV2EffectivePair {
  id: string;
  receiverResponseId: string | null;
  senderOutputId: string | null;
  receiverComponentId: string | null;
  senderComponentId: string | null;
  inputSignalId: string | null;
  outputSignalId: string | null;
  parameterContextId: string | null;
  sourceIds: string[];
  admission: CatalogV2Admission;
  fixedWeightCandidate?: CatalogV2FixedWeightCandidate;
  demoBoundary: CatalogV2DemoBoundary;
  observed?: CatalogV2ObservedEffectivePair;
  sourceProvenance?: CatalogV2RecordProvenance[];
  notes: string[];
}

export interface CatalogV2CompatibilityRelation {
  id: string;
  receiverComponentId: string | null;
  senderComponentId: string | null;
  receiverResponseId: string | null;
  senderOutputId: string | null;
  kind: CatalogV2CompatibilityKind;
  parameterContextId: string;
  sourceIds: string[];
  admission: CatalogV2Admission;
  demoBoundary: CatalogV2DemoBoundary;
  /** Raw relation vocabulary retained alongside legacy receiver/sender aliases. */
  subjectComponentId?: string | null;
  targetComponentId?: string | null;
  inputSignalId?: string | null;
  relationType?: string;
  direction?: string;
  qualitativeOutcome?: string;
  numericUseAllowed?: boolean;
  sourceProvenance?: CatalogV2RecordProvenance[];
  notes: string[];
}

export interface CatalogV2Source {
  id: string;
  kind: CatalogV2SourceKind;
  label: string;
  citation?: string;
  locator?: string;
  isDemo: boolean;
  supports: string[];
  provenance?: CatalogV2SourceProvenance;
  notes: string[];
}

export interface ComponentCatalogV2 {
  releaseManifest: CatalogV2ReleaseManifest;
  signals: CatalogV2Signal[];
  components: CatalogV2Component[];
  parameterContexts: CatalogV2ParameterContext[];
  receiverResponses: CatalogV2ReceiverResponse[];
  senderOutputs: CatalogV2SenderOutput[];
  effectivePairs: CatalogV2EffectivePair[];
  compatibilityRelations: CatalogV2CompatibilityRelation[];
  sources: CatalogV2Source[];
}

export type CatalogV2ValidationError = {
  path: string;
  message: string;
  code: string;
};

export type CatalogV2ValidationResult<T> =
  { ok: true; value: T } | { ok: false; errors: CatalogV2ValidationError[] };

export function isCatalogV2AdmissionStatus(value: unknown): value is CatalogV2AdmissionStatus {
  return (
    value === 'runtime-quantitative' ||
    value === 'runtime-demo' ||
    value === 'compatibility-only' ||
    value === 'calibration-candidate' ||
    value === 'reference-only' ||
    value === 'rejected'
  );
}
