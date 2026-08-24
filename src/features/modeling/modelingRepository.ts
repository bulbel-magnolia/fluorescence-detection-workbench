import type {
  DetectionRecordReference,
  ModelingRun,
  NetworkModel,
  SimulationResult,
} from './types';
import {
  isDetectionModelingReference,
  type NetworkValidationModelingReference,
  type ReverseTargetModelingReference,
} from './detectionModeling';
import { migrateNetworkModel, sanitizeCatalogReferences, simulateNetwork } from './modelingCore';

const projectKey = 'fluorescence-desktop.modeling-project.v1';
const runsKey = 'fluorescence-desktop.modeling-runs.v1';
const maximumRuns = 25;

export interface ModelingLoadDiagnostics {
  projectDroppedNodeIds: string[];
  runDrops: Array<{ runId: string; nodeIds: string[] }>;
}

export interface ModelingRunContext {
  reverseTargetReference?: ReverseTargetModelingReference | null;
  validationReference?: NetworkValidationModelingReference | null;
}

let loadDiagnostics: ModelingLoadDiagnostics = {
  projectDroppedNodeIds: [],
  runDrops: [],
};

export function getModelingLoadDiagnostics(): ModelingLoadDiagnostics {
  return {
    projectDroppedNodeIds: [...loadDiagnostics.projectDroppedNodeIds],
    runDrops: loadDiagnostics.runDrops.map((drop) => ({
      runId: drop.runId,
      nodeIds: [...drop.nodeIds],
    })),
  };
}

function createId(): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `model-run-${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDetectionRecordReference(value: unknown): value is DetectionRecordReference {
  return (
    isRecord(value) &&
    value.mode === 'reference-only' &&
    typeof value.recordId === 'string' &&
    typeof value.sampleId === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.linkedAt === 'string' &&
    ['demo-live', 'real-live', 'json-import', 'csv-import'].includes(String(value.origin)) &&
    typeof value.isDemo === 'boolean' &&
    ['OK', 'PARTIAL', 'ERROR', 'RAW_ONLY'].includes(String(value.resultStatus))
  );
}

function migrateAndSanitizeModel(
  value: unknown,
): { model: NetworkModel; droppedNodeIds: string[]; migrated: boolean } | null {
  const legacy = !isRecord(value) || value.schemaVersion !== 2;
  const candidate = legacy ? migrateNetworkModel(value) : value;
  const sanitized = sanitizeCatalogReferences(candidate);
  if (!sanitized.model) return null;
  return {
    model: sanitized.model,
    droppedNodeIds: sanitized.droppedNodeIds,
    migrated: legacy,
  };
}
function isSteadyStateResult(value: unknown): value is SimulationResult {
  if (!isRecord(value)) return false;
  const convergence = value.convergence;
  return (
    (value.engineVersion === 'BIONET-SIM-STEADY-STATE-DEMO-1' ||
      value.engineVersion === 'BIONET-SIM-STEADY-STATE-2') &&
    value.simulationMode === 'steady-state' &&
    value.isSteadyState === true &&
    typeof value.outputNodeId === 'string' &&
    typeof value.outputValue === 'number' &&
    Number.isFinite(value.outputValue) &&
    isRecord(convergence) &&
    typeof convergence.converged === 'boolean' &&
    typeof convergence.iterations === 'number' &&
    typeof convergence.maxIterations === 'number' &&
    typeof convergence.tolerance === 'number' &&
    typeof convergence.maxDelta === 'number'
  );
}

export function loadModelingProject(): NetworkModel | null {
  loadDiagnostics = { ...loadDiagnostics, projectDroppedNodeIds: [] };
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(projectKey);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    const migrated = migrateAndSanitizeModel(value);
    if (!migrated) return null;
    loadDiagnostics = {
      ...loadDiagnostics,
      projectDroppedNodeIds: migrated.droppedNodeIds,
    };
    if (migrated.migrated) localStorage.setItem(projectKey, JSON.stringify(migrated.model));
    return migrated.model;
  } catch {
    return null;
  }
}

export function saveModelingProject(model: NetworkModel): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(projectKey, JSON.stringify(model));
}

export function loadModelingRuns(): ModelingRun[] {
  loadDiagnostics = { ...loadDiagnostics, runDrops: [] };
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(runsKey);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const runs: ModelingRun[] = [];
    const runDrops: ModelingLoadDiagnostics['runDrops'] = [];
    let migratedAny = false;
    for (const candidate of value) {
      const sanitized = sanitizeModelingRun(candidate);
      if (!sanitized) continue;
      runs.push(sanitized.run);
      migratedAny ||= sanitized.migrated;
      if (sanitized.droppedNodeIds.length > 0) {
        runDrops.push({ runId: sanitized.run.id, nodeIds: sanitized.droppedNodeIds });
      }
    }
    const bounded = runs.slice(0, maximumRuns);
    if (migratedAny) localStorage.setItem(runsKey, JSON.stringify(bounded));
    loadDiagnostics = { ...loadDiagnostics, runDrops };
    return bounded;
  } catch {
    return [];
  }
}

function sanitizeModelingRun(
  value: unknown,
): { run: ModelingRun; droppedNodeIds: string[]; migrated: boolean } | null {
  if (!isRecord(value) || !isRecord(value.modelSnapshot)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.modelName !== 'string' ||
    (value.note !== undefined && typeof value.note !== 'string')
  )
    return null;

  let migratedSnapshot: { model: NetworkModel; droppedNodeIds: string[]; migrated: boolean } | null;
  try {
    migratedSnapshot = migrateAndSanitizeModel(value.modelSnapshot);
  } catch {
    return null;
  }
  if (!migratedSnapshot) return null;
  const sanitized = migratedSnapshot.model;

  let result: SimulationResult;
  if (isSteadyStateResult(value.result)) {
    result = value.result;
  } else {
    try {
      result = simulateNetwork(sanitized, { now: value.createdAt });
    } catch {
      return null;
    }
  }
  const run: ModelingRun = {
    id: value.id,
    createdAt: value.createdAt,
    modelName: value.modelName,
    templateId: sanitized.templateId,
    nodeCount: typeof value.nodeCount === 'number' ? value.nodeCount : sanitized.nodes.length,
    edgeCount: typeof value.edgeCount === 'number' ? value.edgeCount : sanitized.edges.length,
    result,
    modelSnapshot: sanitized,
  };
  if (typeof value.note === 'string') run.note = value.note;
  if (value.recordReference !== undefined) {
    if (value.recordReference === null) run.recordReference = null;
    else if (isDetectionRecordReference(value.recordReference))
      run.recordReference = value.recordReference;
    else return null;
  }
  if (value.legacyRecordReference !== undefined) {
    if (value.legacyRecordReference === null) run.legacyRecordReference = null;
    else if (isDetectionRecordReference(value.legacyRecordReference))
      run.legacyRecordReference = value.legacyRecordReference;
    else return null;
  }
  if (value.reverseTargetReference !== undefined) {
    if (
      !isDetectionModelingReference(value.reverseTargetReference) ||
      value.reverseTargetReference.mode !== 'reverse-target'
    )
      return null;
    run.reverseTargetReference = structuredClone(value.reverseTargetReference);
  }
  if (value.validationReference !== undefined) {
    if (
      !isDetectionModelingReference(value.validationReference) ||
      value.validationReference.mode !== 'network-validation' ||
      value.validationReference.networkId !== sanitized.id
    )
      return null;
    run.validationReference = structuredClone(value.validationReference);
  }
  return {
    run,
    droppedNodeIds: migratedSnapshot.droppedNodeIds,
    migrated: migratedSnapshot.migrated,
  };
}

function persistModelingRuns(runs: ModelingRun[]): ModelingRun[] {
  const bounded = runs.slice(0, maximumRuns);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(runsKey, JSON.stringify(bounded));
  }
  return bounded;
}

export function saveModelingRun(
  model: NetworkModel,
  result: SimulationResult,
  context: ModelingRunContext = {},
): ModelingRun[] {
  const reverseTargetReference = context.reverseTargetReference;
  if (
    reverseTargetReference !== undefined &&
    reverseTargetReference !== null &&
    (!isDetectionModelingReference(reverseTargetReference) ||
      reverseTargetReference.mode !== 'reverse-target')
  )
    throw new Error('MODELING_RUN_REVERSE_TARGET_REFERENCE_INVALID');
  const validationReference = context.validationReference;
  if (
    validationReference !== undefined &&
    validationReference !== null &&
    (!isDetectionModelingReference(validationReference) ||
      validationReference.mode !== 'network-validation' ||
      validationReference.networkId !== model.id)
  )
    throw new Error('MODELING_RUN_VALIDATION_REFERENCE_INVALID');
  const run: ModelingRun = {
    id: createId(),
    createdAt: result.completedAt,
    modelName: model.name,
    templateId: model.templateId,
    nodeCount: model.nodes.length,
    edgeCount: model.edges.length,
    ...(model.recordReference === undefined ? {} : { recordReference: model.recordReference }),
    ...(model.legacyRecordReference === undefined
      ? {}
      : { legacyRecordReference: model.legacyRecordReference }),
    ...(reverseTargetReference
      ? { reverseTargetReference: structuredClone(reverseTargetReference) }
      : {}),
    ...(validationReference ? { validationReference: structuredClone(validationReference) } : {}),
    result,
    modelSnapshot: structuredClone(model),
    note: '',
  };
  return persistModelingRuns([run, ...loadModelingRuns()]);
}

export function updateModelingRunNote(runId: string, note: string): ModelingRun[] {
  return persistModelingRuns(
    loadModelingRuns().map((run) => (run.id === runId ? { ...run, note } : run)),
  );
}

export function clearModelingRuns(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(runsKey);
}
