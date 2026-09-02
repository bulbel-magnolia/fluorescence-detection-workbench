import type { BfnPort, BfnProject } from '../../types';
import {
  getDesignedSenderSignalCatalog,
  type DesignedSenderSignalIdentity,
} from '../designed-sender/designedSenderSignalCatalog';
import {
  isSignalPoolConcentrationUnit,
  signalPoolUnitPair,
  type SignalPoolAuthoringState,
  type SignalPoolDraft,
  type SignalPoolSignalDraft,
} from './signalPoolContract';
import { collectSignalPoolEligibleEntityIds } from './signalPoolEntityEligibility';

export type SignalPoolAuthoringIssueCode =
  | 'module_name_required'
  | 'signal_required'
  | 'known_signal_required'
  | 'known_signal_unknown'
  | 'existing_entity_required'
  | 'existing_entity_unknown'
  | 'custom_signal_required'
  | 'unsupported_unit'
  | 'initial_concentration_required'
  | 'initial_concentration_non_finite'
  | 'initial_concentration_negative';

export interface SignalPoolAuthoringIssue {
  readonly field: string;
  readonly code: SignalPoolAuthoringIssueCode;
}

export type BuildSignalPoolDraftResult =
  | { readonly ok: true; readonly draft: SignalPoolDraft }
  | { readonly ok: false; readonly issues: readonly SignalPoolAuthoringIssue[] };

export function buildSignalPoolDraft(
  state: SignalPoolAuthoringState,
  project: BfnProject,
  signals: readonly DesignedSenderSignalIdentity[] = getDesignedSenderSignalCatalog(),
): BuildSignalPoolDraftResult {
  const issues: SignalPoolAuthoringIssue[] = [];
  if (!hasText(state.name)) issues.push(issue('name', 'module_name_required'));

  const moduleId = deriveAvailableSignalPoolId(state.name, project);
  const signal = resolveSignal(state, project, moduleId, signals, issues);
  const concentrationUnit = isSignalPoolConcentrationUnit(state.concentrationUnit)
    ? state.concentrationUnit
    : null;
  if (!concentrationUnit) issues.push(issue('concentrationUnit', 'unsupported_unit'));

  const initialConcentration = parseInitialConcentration(state.initialConcentration, issues);
  if (issues.length > 0 || !signal || !concentrationUnit || initialConcentration === null) {
    return { ok: false, issues: uniqueIssues(issues) };
  }

  const unitPair = signalPoolUnitPair(concentrationUnit);
  return deepFreeze({
    ok: true,
    draft: {
      id: moduleId,
      origin: 'user_defined',
      name: state.name,
      description: hasText(state.description) ? state.description : null,
      signal,
      inputPort: {
        id: `${moduleId}.port.input.production-rate`,
        entityId: signal.entityId,
        quantityType: 'production_rate',
        unit: unitPair.productionRate,
        direction: 'input',
      },
      outputPort: {
        id: `${moduleId}.port.output.concentration`,
        entityId: signal.entityId,
        quantityType: 'concentration',
        unit: unitPair.concentration,
        direction: 'output',
      },
      initialConcentration,
    },
  });
}

function resolveSignal(
  state: SignalPoolAuthoringState,
  project: BfnProject,
  moduleId: string,
  signals: readonly DesignedSenderSignalIdentity[],
  issues: SignalPoolAuthoringIssue[],
): SignalPoolSignalDraft | null {
  if (state.signalMode === 'known') {
    if (!hasText(state.knownCatalogSignalId)) {
      issues.push(issue('knownCatalogSignalId', 'known_signal_required'));
      return null;
    }
    const identity = signals.find(
      (candidate) => candidate.catalogSignalId === state.knownCatalogSignalId,
    );
    if (!identity) {
      issues.push(issue('knownCatalogSignalId', 'known_signal_unknown'));
      return null;
    }
    return {
      source: 'known',
      catalogSignalId: identity.catalogSignalId,
      entityId: identity.entityId,
      displayName: identity.displayName,
    };
  }

  if (state.signalMode === 'existing') {
    if (!hasText(state.existingEntityId)) {
      issues.push(issue('existingEntityId', 'existing_entity_required'));
      return null;
    }
    if (!collectSignalPoolEligibleEntityIds(project).includes(state.existingEntityId)) {
      issues.push(issue('existingEntityId', 'existing_entity_unknown'));
      return null;
    }
    return {
      source: 'existing',
      entityId: state.existingEntityId,
      displayName: existingEntityDisplayName(project, state.existingEntityId),
    };
  }

  if (state.signalMode === 'custom') {
    if (!hasText(state.customSignalName)) {
      issues.push(issue('customSignalName', 'custom_signal_required'));
      return null;
    }
    return {
      source: 'custom',
      entityId: `${moduleId}.entity.signal`,
      displayName: state.customSignalName,
    };
  }

  issues.push(issue('signalMode', 'signal_required'));
  return null;
}

function parseInitialConcentration(
  source: string,
  issues: SignalPoolAuthoringIssue[],
): number | null {
  if (!hasText(source)) {
    issues.push(issue('initialConcentration', 'initial_concentration_required'));
    return null;
  }
  const value = Number(source);
  if (!Number.isFinite(value)) {
    issues.push(issue('initialConcentration', 'initial_concentration_non_finite'));
    return null;
  }
  if (value < 0) {
    issues.push(issue('initialConcentration', 'initial_concentration_negative'));
    return null;
  }
  return value;
}

function deriveAvailableSignalPoolId(name: string, project: BfnProject): string {
  const normalized = name.trim().normalize('NFKD').toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  const stem = slug || `pool-${stableTextHash(normalized || 'signal-pool')}`;
  const existing = collectDefinedIds(project);
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const id = `user.signal-pool.${stem}${suffix === 1 ? '' : `-${suffix}`}`;
    const proposed = [
      id,
      `${id}.port.input.production-rate`,
      `${id}.port.output.concentration`,
      `${id}.model.accumulator.v1`,
      `${id}.domain.v1`,
      `${id}.entity.signal`,
    ];
    if (proposed.every((candidate) => !existing.has(candidate))) return id;
  }
  return `user.signal-pool.${stem}-unavailable`;
}

function existingEntityDisplayName(project: BfnProject, entityId: string): string {
  const registered = project.registry.entities.find((entity) => entity.id === entityId);
  if (registered) return registered.displayName;
  const port = allPorts(project).find((candidate) => candidate.entity === entityId);
  return port?.displayName?.en ?? entityId;
}

function allPorts(project: BfnProject): BfnPort[] {
  return [
    ...project.network.inputSources.map((source) => source.outputPort),
    ...project.network.modules.flatMap((module) => [...module.inputPorts, ...module.outputPorts]),
    ...project.network.outputMonitors.map((monitor) => monitor.inputPort),
  ];
}

function collectDefinedIds(value: unknown, ids = new Set<string>()): ReadonlySet<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectDefinedIds(item, ids);
    return ids;
  }
  if (!isRecord(value)) return ids;
  if (typeof value.id === 'string') ids.add(value.id);
  for (const child of Object.values(value)) collectDefinedIds(child, ids);
  return ids;
}

function stableTextHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function issue(field: string, code: SignalPoolAuthoringIssueCode): SignalPoolAuthoringIssue {
  return { field, code };
}

function uniqueIssues(
  issues: readonly SignalPoolAuthoringIssue[],
): readonly SignalPoolAuthoringIssue[] {
  return issues.filter(
    (candidate, index) =>
      issues.findIndex((item) => item.field === candidate.field && item.code === candidate.code) ===
      index,
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
