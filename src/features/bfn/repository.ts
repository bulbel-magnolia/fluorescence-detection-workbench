import type { BfnProject, BfnQuantityType, BfnSimulationResult, BfnUnit } from './types';
import { isBfnProjectV23, upgradeBfnProjectToCurrent } from './bfnIrMigration';

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

const BFN_UNCERTAINTY_METHODS: ReadonlySet<string> = new Set([
  'parameter_interval_envelope',
  'posterior_samples',
  'bootstrap',
  'covariance',
  'none',
  'not_recorded',
]);

const BFN_UNCERTAINTY_UNAVAILABLE_REASONS: ReadonlySet<string> = new Set([
  'none_declared',
  'not_recorded',
  'parameter_interval_incomplete',
  'method_not_executable',
]);

const BFN_UNCERTAINTY_PROPAGATION_MODES: ReadonlySet<string> = new Set([
  'parameter_interval',
  'deterministic_transform',
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

function hasValidUncertaintySnapshotV21(value: Record<string, unknown>): boolean {
  const snapshot = value.uncertaintySnapshot;
  if (
    !isRecord(snapshot) ||
    snapshot.scope !== 'output_reachable' ||
    (snapshot.status !== 'available' && snapshot.status !== 'unavailable') ||
    !Array.isArray(snapshot.modules)
  ) {
    return false;
  }
  const validModules = snapshot.modules.every((module) => {
    if (
      !isRecord(module) ||
      !isNonEmptyString(module.moduleId) ||
      (module.selectedModelId !== null && !isNonEmptyString(module.selectedModelId)) ||
      (module.method !== null &&
        (typeof module.method !== 'string' || !BFN_UNCERTAINTY_METHODS.has(module.method))) ||
      typeof module.intervalExecutable !== 'boolean' ||
      (module.reason !== null &&
        (typeof module.reason !== 'string' ||
          !BFN_UNCERTAINTY_UNAVAILABLE_REASONS.has(module.reason)))
    ) {
      return false;
    }
    return module.intervalExecutable
      ? module.method === 'parameter_interval_envelope' && module.reason === null
      : module.reason !== null;
  });
  if (!validModules) return false;
  const available =
    snapshot.modules.length > 0 &&
    snapshot.modules.every((module) => isRecord(module) && module.intervalExecutable === true);
  return snapshot.status === 'available'
    ? available && snapshot.method === 'parameter_interval_envelope'
    : !available && snapshot.method === null;
}

function hasValidUncertaintySnapshotV22(value: Record<string, unknown>): boolean {
  const snapshot = value.uncertaintySnapshot;
  if (
    !isRecord(snapshot) ||
    snapshot.scope !== 'output_reachable' ||
    (snapshot.status !== 'available' && snapshot.status !== 'unavailable') ||
    !Array.isArray(snapshot.modules)
  ) {
    return false;
  }
  const validModules = snapshot.modules.every((module) => {
    if (
      !isRecord(module) ||
      !isNonEmptyString(module.moduleId) ||
      (module.selectedModelId !== null && !isNonEmptyString(module.selectedModelId)) ||
      (module.method !== null &&
        (typeof module.method !== 'string' || !BFN_UNCERTAINTY_METHODS.has(module.method))) ||
      typeof module.intervalExecutable !== 'boolean' ||
      (module.reason !== null &&
        (typeof module.reason !== 'string' ||
          !BFN_UNCERTAINTY_UNAVAILABLE_REASONS.has(module.reason))) ||
      typeof module.propagationMode !== 'string' ||
      !BFN_UNCERTAINTY_PROPAGATION_MODES.has(module.propagationMode)
    ) {
      return false;
    }
    if (module.propagationMode === 'parameter_interval') {
      return (
        module.method === 'parameter_interval_envelope' &&
        module.intervalExecutable === true &&
        module.reason === null
      );
    }
    if (module.propagationMode === 'deterministic_transform') {
      return (
        (module.method === 'none' ||
          module.method === 'not_recorded' ||
          module.method === 'parameter_interval_envelope') &&
        module.intervalExecutable === true &&
        module.reason === null
      );
    }
    return module.intervalExecutable === false && module.reason !== null;
  });
  if (!validModules) return false;
  const propagationAvailable =
    snapshot.modules.length > 0 &&
    snapshot.modules.every(
      (module) => isRecord(module) && module.propagationMode !== 'unavailable',
    ) &&
    snapshot.modules.some(
      (module) => isRecord(module) && module.propagationMode === 'parameter_interval',
    );
  return snapshot.status === 'available'
    ? propagationAvailable && snapshot.method === 'parameter_interval_envelope'
    : !propagationAvailable && snapshot.method === null;
}

function isFiniteNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function hasValidFrequencyGain(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) && Number.isFinite(value.magnitude) && Number.isFinite(value.phaseDegrees))
  );
}

function hasValidDynamicMetricsV22(value: Record<string, unknown>): boolean {
  if (value.mode === 'static') return value.dynamicMetrics === null;
  const metrics = value.dynamicMetrics;
  if (
    !isRecord(metrics) ||
    !Number.isFinite(metrics.terminalValue) ||
    typeof metrics.steadyStateAvailable !== 'boolean' ||
    !isFiniteNumberOrNull(metrics.steadyValue) ||
    !isFiniteNumberOrNull(metrics.riseTimeHours) ||
    !Number.isFinite(metrics.peakValue) ||
    !Number.isFinite(metrics.peakTimeHours) ||
    !isFiniteNumberOrNull(metrics.overshootFraction) ||
    typeof metrics.oscillatory !== 'boolean' ||
    !isFiniteNumberOrNull(metrics.dcGain) ||
    !hasValidFrequencyGain(metrics.frequencyGain)
  ) {
    return false;
  }
  return metrics.steadyStateAvailable
    ? typeof metrics.steadyValue === 'number' && typeof metrics.overshootFraction === 'number'
    : metrics.steadyValue === null &&
        metrics.riseTimeHours === null &&
        metrics.overshootFraction === null &&
        metrics.dcGain === null &&
        metrics.frequencyGain === null;
}

function hasValidSimulationPoints(
  value: Record<string, unknown>,
  intervalsAvailable: boolean,
): boolean {
  if (!Array.isArray(value.points)) return false;
  return value.points.every((point) => {
    if (!isRecord(point) || !Number.isFinite(point.output)) return false;
    if (intervalsAvailable) {
      return Number.isFinite(point.lower) && Number.isFinite(point.upper);
    }
    return point.lower === null && point.upper === null;
  });
}

export function isBfnProject(value: unknown): value is BfnProject {
  return isBfnProjectV23(value);
}

function isBfnSimulationResult(value: unknown): value is BfnSimulationResult {
  if (
    !isRecord(value) ||
    (value.engineVersion !== 'BFN-SIM-2.0' &&
      value.engineVersion !== 'BFN-SIM-2.1' &&
      value.engineVersion !== 'BFN-SIM-2.2') ||
    !isNonEmptyString(value.id)
  ) {
    return false;
  }
  if (
    typeof value.networkId !== 'string' ||
    (value.mode !== 'static' && value.mode !== 'dynamic') ||
    !isNonEmptyString(value.primaryInputSourceId) ||
    !isNonEmptyString(value.outputMonitorId) ||
    !Array.isArray(value.validationIssues) ||
    typeof value.completedAt !== 'string' ||
    !hasValidSignalSnapshot(value) ||
    !hasValidTemporalSnapshot(value) ||
    !hasValidContextApplicabilitySnapshot(value)
  ) {
    return false;
  }
  if (value.engineVersion === 'BFN-SIM-2.0') {
    return (
      value.uncertaintyMethod === 'parameter_interval_envelope' &&
      hasValidSimulationPoints(value, true)
    );
  }
  const versionedSnapshotValid =
    value.engineVersion === 'BFN-SIM-2.1'
      ? hasValidUncertaintySnapshotV21(value)
      : hasValidUncertaintySnapshotV22(value) && hasValidDynamicMetricsV22(value);
  if (!versionedSnapshotValid) return false;
  const snapshot = value.uncertaintySnapshot;
  if (!isRecord(snapshot)) return false;
  const intervalsAvailable = snapshot.status === 'available';
  return (
    value.uncertaintyMethod === (intervalsAvailable ? 'parameter_interval_envelope' : null) &&
    hasValidSimulationPoints(value, intervalsAvailable)
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
  if (!isBfnProjectV23(project)) throw new Error('BFN_EXPORT_SCHEMA_INVALID');
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
