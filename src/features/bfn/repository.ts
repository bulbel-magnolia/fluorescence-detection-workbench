import type { BfnProject, BfnQuantityType, BfnSimulationResult, BfnUnit } from './types';
import { isBfnProjectV22, upgradeBfnProjectToCurrent } from './bfnIrMigration';

export const BFN_PROJECT_STORAGE_KEY = 'fluorescence-desktop.bfn-ir-project.v2';
export const BFN_RUN_STORAGE_KEY = 'fluorescence-desktop.bfn-ir-runs.v2';
export const LEGACY_MODELING_PROJECT_KEY = 'fluorescence-desktop.modeling-project.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const BFN_QUANTITY_TYPES: ReadonlySet<string> = new Set([
  'concentration',
  'amount',
  'production_rate',
  'expression_level',
  'activity',
  'flux',
  'fraction',
  'cell_density',
]);

const BFN_UNITS: ReadonlySet<string> = new Set([
  'M',
  'mM',
  'uM',
  'nM',
  'pM',
  'nM/h',
  'uM/h',
  'molecules/cell',
  'RPU',
  'dimensionless',
  'OD600',
]);

const BFN_TEMPORAL_EXECUTION_MODES: ReadonlySet<string> = new Set([
  'steady_state',
  'quasi_static',
  'stateful_dynamic',
  'unsupported',
]);

const BFN_TEMPORAL_EVIDENCE_TIERS: ReadonlySet<string> = new Set([
  't0_steady_state',
  't1_time_resolved',
  't2_phenomenological_dynamic',
  't3_mechanistic_dynamic',
  'not_recorded',
]);

const BFN_TEMPORAL_RESOLUTION_BASES: ReadonlySet<string> = new Set([
  'active-static',
  'active-dynamic',
  'dynamic-static-fallback',
  'no-executable-model',
]);

const BFN_CONTEXT_APPLICABILITY_STATES: ReadonlySet<string> = new Set([
  'matched',
  'uncertain',
  'mismatched',
  'unavailable',
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isQuantityType(value: unknown): value is BfnQuantityType {
  return typeof value === 'string' && BFN_QUANTITY_TYPES.has(value);
}

function isUnit(value: unknown): value is BfnUnit {
  return typeof value === 'string' && BFN_UNITS.has(value);
}

function hasValidSignalSnapshot(value: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(value, 'signalSnapshot')) return true;
  const snapshot = value.signalSnapshot;
  if (!isRecord(snapshot) || !isRecord(snapshot.primaryInput) || !isRecord(snapshot.output)) {
    return false;
  }
  const input = snapshot.primaryInput;
  const output = snapshot.output;
  return (
    isNonEmptyString(input.sourceId) &&
    input.sourceId === value.primaryInputSourceId &&
    isNonEmptyString(input.labelKey) &&
    isNonEmptyString(input.entity) &&
    isQuantityType(input.quantityType) &&
    isUnit(input.unit) &&
    isNonEmptyString(output.monitorId) &&
    output.monitorId === value.outputMonitorId &&
    isNonEmptyString(output.labelKey) &&
    isNonEmptyString(output.entity) &&
    isQuantityType(output.quantityType) &&
    isUnit(output.unit)
  );
}

function hasValidTemporalSnapshot(value: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(value, 'temporalSnapshot')) return true;
  const snapshot = value.temporalSnapshot;
  if (
    !isRecord(snapshot) ||
    snapshot.scope !== 'output_reachable' ||
    !Array.isArray(snapshot.modules)
  ) {
    return false;
  }
  return snapshot.modules.every(
    (module) =>
      isRecord(module) &&
      isNonEmptyString(module.moduleId) &&
      (module.selectedModelId === null || isNonEmptyString(module.selectedModelId)) &&
      typeof module.executionMode === 'string' &&
      BFN_TEMPORAL_EXECUTION_MODES.has(module.executionMode) &&
      typeof module.evidenceTier === 'string' &&
      BFN_TEMPORAL_EVIDENCE_TIERS.has(module.evidenceTier) &&
      typeof module.resolutionBasis === 'string' &&
      BFN_TEMPORAL_RESOLUTION_BASES.has(module.resolutionBasis),
  );
}

function hasValidContextApplicabilitySnapshot(value: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(value, 'contextApplicabilitySnapshot')) return true;
  const snapshot = value.contextApplicabilitySnapshot;
  if (
    !isRecord(snapshot) ||
    snapshot.scope !== 'output_reachable_module_edges' ||
    !Array.isArray(snapshot.edges)
  ) {
    return false;
  }
  return snapshot.edges.every(
    (edge) =>
      isRecord(edge) &&
      isNonEmptyString(edge.edgeId) &&
      typeof edge.state === 'string' &&
      BFN_CONTEXT_APPLICABILITY_STATES.has(edge.state) &&
      (!Object.prototype.hasOwnProperty.call(edge, 'checks') || Array.isArray(edge.checks)),
  );
}

export function isBfnProject(value: unknown): value is BfnProject {
  return isBfnProjectV22(value);
}

function isBfnSimulationResult(value: unknown): value is BfnSimulationResult {
  return (
    isRecord(value) &&
    value.engineVersion === 'BFN-SIM-2.0' &&
    typeof value.id === 'string' &&
    typeof value.networkId === 'string' &&
    (value.mode === 'static' || value.mode === 'dynamic') &&
    Array.isArray(value.points) &&
    isNonEmptyString(value.primaryInputSourceId) &&
    isNonEmptyString(value.outputMonitorId) &&
    Array.isArray(value.validationIssues) &&
    typeof value.completedAt === 'string' &&
    hasValidSignalSnapshot(value) &&
    hasValidTemporalSnapshot(value) &&
    hasValidContextApplicabilitySnapshot(value)
  );
}

export function parseBfnProject(raw: string): BfnProject {
  const parsed: unknown = JSON.parse(raw);
  return upgradeBfnProjectToCurrent(parsed);
}

export function loadBfnProject(): BfnProject | null {
  const raw = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return parseBfnProject(raw);
  } catch {
    return null;
  }
}

export function saveBfnProject(project: BfnProject): void {
  if (!isBfnProjectV22(project)) throw new Error('BFN_EXPORT_SCHEMA_INVALID');
  localStorage.setItem(BFN_PROJECT_STORAGE_KEY, JSON.stringify(project));
}

export function loadBfnRuns(): BfnSimulationResult[] {
  const raw = localStorage.getItem(BFN_RUN_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isBfnSimulationResult).map((result) => structuredClone(result))
      : [];
  } catch {
    return [];
  }
}

export function saveBfnRun(result: BfnSimulationResult): BfnSimulationResult[] {
  const next = [structuredClone(result), ...loadBfnRuns()].slice(0, 20);
  localStorage.setItem(BFN_RUN_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearBfnRuns(): void {
  localStorage.removeItem(BFN_RUN_STORAGE_KEY);
}

export function legacyModelingProjectExists(): boolean {
  return localStorage.getItem(LEGACY_MODELING_PROJECT_KEY) !== null;
}
