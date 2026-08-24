import type { BfnProject, BfnSimulationResult } from './types';

export const BFN_PROJECT_STORAGE_KEY = 'fluorescence-desktop.bfn-ir-project.v2';
export const BFN_RUN_STORAGE_KEY = 'fluorescence-desktop.bfn-ir-runs.v2';
export const LEGACY_MODELING_PROJECT_KEY = 'fluorescence-desktop.modeling-project.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBfnProject(value: unknown): value is BfnProject {
  if (!isRecord(value) || value.schema !== 'BFN-IR' || value.schemaVersion !== '2.0') {
    return false;
  }
  if (!isRecord(value.network) || !isRecord(value.registry) || !isRecord(value.analysis)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.labelKey === 'string' &&
    (value.network.mode === 'static' || value.network.mode === 'dynamic') &&
    Array.isArray(value.network.inputSources) &&
    Array.isArray(value.network.modules) &&
    Array.isArray(value.network.outputMonitors) &&
    Array.isArray(value.network.edges) &&
    Array.isArray(value.registry.contexts) &&
    Array.isArray(value.registry.validityDomains) &&
    Array.isArray(value.registry.datasets) &&
    Array.isArray(value.registry.implementations) &&
    Array.isArray(value.registry.calibrationMaps) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.isDemo === 'boolean'
  );
}

function isBfnSimulationResult(value: unknown): value is BfnSimulationResult {
  return (
    isRecord(value) &&
    value.engineVersion === 'BFN-SIM-2.0' &&
    typeof value.id === 'string' &&
    typeof value.networkId === 'string' &&
    (value.mode === 'static' || value.mode === 'dynamic') &&
    Array.isArray(value.points) &&
    Array.isArray(value.validationIssues) &&
    typeof value.completedAt === 'string'
  );
}

export function parseBfnProject(raw: string): BfnProject {
  const parsed: unknown = JSON.parse(raw);
  if (!isBfnProject(parsed)) throw new Error('BFN_IMPORT_SCHEMA_INVALID');
  return structuredClone(parsed);
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
