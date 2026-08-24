export interface UnknownValue {
  state: 'unknown';
  reason?: string;
}

export interface Known<T> {
  state: 'known';
  value: T;
}

export type CatalogValue<T> = Known<T> | UnknownValue;

export function isUnknownValue(value: unknown): value is UnknownValue {
  if (!isRecord(value) || value.state !== 'unknown') {
    return false;
  }
  return value.reason === undefined || typeof value.reason === 'string';
}

export function isCatalogValue(value: unknown): value is CatalogValue<unknown> {
  return isUnknownValue(value) || (isRecord(value) && value.state === 'known' && 'value' in value);
}

export type CatalogEntityType = 'part' | 'device' | 'system' | 'library' | 'family';
export type CatalogCategory = 'qs-system' | 'pollutant-sensor' | 'control-output';
export type EvidenceGrade = 'A' | 'B' | 'C' | 'D' | 'unknown';
export type ReviewStatus = 'passed' | 'needs-review' | 'withdrawn';
export type SequenceStatus =
  'available-public-accession' | 'partial-public' | 'not-reported' | 'restricted' | 'unknown';
export type ModelingCompatibility =
  | 'qualitative-only'
  | 'parameterizable-after-calibration'
  | 'normalized-demo-only'
  | 'not-compatible'
  | 'unknown';

/** The role an entry can occupy in the editable network. */
export type CatalogNetworkRole = 'input' | 'processing' | 'output';

/** User-facing parameter availability, independent of evidence grade. */
export type CatalogParameterStatus =
  | 'quantitative-available'
  | 'normalized-demo-only'
  | 'parameterizable-after-calibration'
  | 'compatibility-information'
  | 'reference-only';

export type CatalogApplicationMode =
  'quantitative' | 'demo' | 'calibration' | 'candidate' | 'reference';

export type CatalogApplicationReason =
  | 'ready'
  | 'demo-only'
  | 'requires-calibration'
  | 'reference-only'
  | 'compatibility-only'
  | 'incompatible-network-role'
  | 'review-required'
  | 'catalog-read-only'
  | 'no-target-role';

export interface CatalogApplicationAssessment {
  targetNetworkRole: CatalogNetworkRole | null;
  applicationMode: CatalogApplicationMode;
  allowed: boolean;
  reason: CatalogApplicationReason;
  parameterStatus: CatalogParameterStatus;
}
export type EffectDirection = 'positive' | 'negative' | 'mixed' | 'unknown';
export type CatalogNodeKind = 'sensor' | 'signal' | 'response' | 'memory' | 'reporter';
export type CatalogRole =
  | 'quorum-sensing'
  | 'pollutant-sensor'
  | 'regulator'
  | 'promoter'
  | 'output'
  | 'control'
  | 'translation'
  | 'degradation'
  | 'insulator'
  | 'rna-regulator';

export interface CatalogName {
  zh: string;
  en: string;
  aliases: string[];
}

export interface CatalogMechanism {
  summary: string;
  steps: string[];
  requiredPartners: string[];
}

export interface CatalogSignal {
  id: string;
  name: CatalogValue<string>;
  direction: EffectDirection;
  unit: CatalogValue<string>;
  directObservation: boolean;
  sourceRefs: string[];
}

export interface CatalogSignals {
  inputs: CatalogSignal[] | UnknownValue;
  outputs: CatalogSignal[] | UnknownValue;
}

export interface CatalogContext {
  host: CatalogValue<string>;
  strain: CatalogValue<string>;
  vector: CatalogValue<string>;
  culture: CatalogValue<string>;
  temperature: CatalogValue<string>;
  induction: CatalogValue<string>;
  growthPhase: CatalogValue<string>;
  readout: CatalogValue<string>;
  other: CatalogValue<string>;
}

export interface CatalogEvidence {
  grade: EvidenceGrade;
  reviewStatus: ReviewStatus;
  scope: string;
  directInEColi: boolean;
  reviewNotes: string[];
  boundaryNotes: string[];
}

export type CatalogLiteratureSourceType = 'primary-paper' | 'database' | 'registry' | 'supplement';

export interface CatalogLiterature {
  id: string;
  title: string;
  authors: string;
  year: CatalogValue<number>;
  doi: CatalogValue<string>;
  pmid: CatalogValue<string>;
  url: string;
  sourceType: CatalogLiteratureSourceType;
  supports: string[];
}

export type QuantitativeForbiddenMapping = 'edge-weight' | 'km' | 'hill' | 'gain' | 'threshold';
export type QuantitativeBoundaryApplication = 'display-only';

export interface QuantitativeModelingBoundary {
  application: QuantitativeBoundaryApplication;
  forbiddenMappings: QuantitativeForbiddenMapping[];
}

export interface QuantitativeContext {
  host: CatalogValue<string>;
  strain: CatalogValue<string>;
  vector: CatalogValue<string>;
  culture: CatalogValue<string>;
}

export interface QuantitativeObservation {
  metric: string;
  value: CatalogValue<number>;
  unit: CatalogValue<string>;
  sourceRef: string;
  context: QuantitativeContext;
  originalMeaning: string;
  transferability: string;
  modelingBoundary: QuantitativeModelingBoundary;
}

export type SequenceRecordKind = 'GenBank' | 'NCBI' | 'Registry' | 'Addgene';
export type SequenceType = 'part' | 'promoter' | 'regulator' | 'system' | 'library' | 'family';

export interface SequenceRecord {
  kind: SequenceRecordKind;
  accession: string;
  sequenceType: SequenceType;
  version: CatalogValue<string>;
  orientation: 'forward' | 'reverse' | 'unknown';
  sourceRef: string;
  complete: boolean;
}

export interface CatalogSequence {
  status: SequenceStatus;
  records: SequenceRecord[] | UnknownValue;
  isCompleteSingleSequence: boolean;
}

export interface CatalogModelingBoundary {
  compatibility: ModelingCompatibility;
  allowedRepresentations: string[];
  signalMappings: string[];
  compatibleNodeKinds: CatalogNodeKind[];
  forbiddenAutomaticMappings: string[];
  requiredMeasurements: string[];
  calibrationRequirements: string[];
}

export interface CatalogCuration {
  catalogVersion: string;
  reviewedAt: string;
  reviewedBy: string[];
  changeNotes: string[];
  withdrawalReason: CatalogValue<string>;
  auditChecks: {
    cadRSupplementChecked: boolean;
  };
}

export interface CatalogEntry {
  id: string;
  catalogId: string;
  catalogVersion: string;
  entityType: CatalogEntityType;
  name: CatalogName;
  category: CatalogCategory;
  roles: CatalogRole[];
  mechanism: CatalogMechanism;
  signals: CatalogSignals;
  context: CatalogContext;
  evidence: CatalogEvidence;
  literature: CatalogLiterature[];
  quantitativeObservations: QuantitativeObservation[] | UnknownValue;
  sequence: CatalogSequence;
  modeling: CatalogModelingBoundary;
  curation: CatalogCuration;
}

export type CatalogManifestSchemaVersion = 'evidence-backed-components.schema.v1';

export interface CatalogManifestCounts {
  'qs-system': 5;
  'pollutant-sensor': 9;
  'control-output': 13;
  total: 27;
}

export interface CatalogManifest {
  schemaVersion: CatalogManifestSchemaVersion;
  catalogId: string;
  catalogVersion: string;
  generatedAt: '2026-08-02';
  files: {
    qsSystems: 'qsSystems.json';
    pollutantSensors: 'pollutantSensors.json';
    controlOutputParts: 'controlOutputParts.json';
  };
  counts: CatalogManifestCounts;
}

export interface CatalogFile {
  schemaVersion: CatalogManifestSchemaVersion;
  catalogId: string;
  catalogVersion: string;
  category: CatalogCategory;
  entries: CatalogEntry[];
}

export interface CatalogSearchFilters {
  query: string;
  nodeKind: CatalogNodeKind | 'all';
  /** New default filter vocabulary. Optional keeps persisted filters readable. */
  networkRole?: CatalogNetworkRole | 'all';
  inputMolecule?: string;
  outputMolecule?: string;
  parameterStatus?: CatalogParameterStatus | 'all';
  category: CatalogCategory | 'all';
  entityType: CatalogEntityType | 'all';
  host: string;
  strain: string;
  evidenceGrade: EvidenceGrade | 'all';
  sequenceStatus: SequenceStatus | 'all';
  modelingCompatibility: ModelingCompatibility | 'all';
}

export type LiteratureCandidateReference = {
  catalogId: string;
  catalogVersion: string;
  entryId: string;
  displayNameSnapshot: string;
  sourceStatus?: ReviewStatus;
  boundaryNote?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
