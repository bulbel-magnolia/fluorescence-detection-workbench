import type { BfnProject } from '../../types';
import type { UserDefinedFunctionalModuleDraft } from '../userModuleContract';
import {
  buildUserDefinedModuleDraft,
  collectExistingEntityIds,
  type UserModuleAuthoringIssueCode,
  type UserModuleAuthoringState,
} from '../userModuleAuthoringDraft';
import { assessUserDefinedFunctionalModule } from '../userModuleValidation';
import {
  isDesignedSenderControlUnit,
  isDesignedSenderModelFamily,
  isDesignedSenderOutputUnit,
  isDesignedSenderUncertainty,
  type DesignedSenderAuthoringState,
} from './designedSenderContract';
import {
  getDesignedSenderSignalCatalog,
  type DesignedSenderSignalIdentity,
} from './designedSenderSignalCatalog';

export type DesignedSenderAuthoringIssueCode =
  | UserModuleAuthoringIssueCode
  | 'unsupported_model_family'
  | 'unsupported_control_unit'
  | 'unsupported_output_unit'
  | 'unsupported_signal_mode'
  | 'catalog_signal_required'
  | 'catalog_signal_unknown'
  | 'custom_signal_required'
  | 'unsupported_uncertainty'
  | 'generic_contract_invalid';

export interface DesignedSenderAuthoringIssue {
  readonly field: string;
  readonly code: DesignedSenderAuthoringIssueCode;
}

export type BuildDesignedSenderDraftResult =
  | {
      readonly ok: true;
      readonly draft: UserDefinedFunctionalModuleDraft;
      readonly authoritativeSignal: DesignedSenderSignalIdentity | null;
    }
  | { readonly ok: false; readonly issues: readonly DesignedSenderAuthoringIssue[] };

export function createInitialDesignedSenderAuthoringState(
  project: BfnProject,
  signals: readonly DesignedSenderSignalIdentity[] = getDesignedSenderSignalCatalog(),
): DesignedSenderAuthoringState {
  const existingEntityId = collectExistingEntityIds(project)[0] ?? '';
  return {
    name: '',
    description: '',
    family: 'hill_activation',
    controlInput: {
      name: '',
      entityMode: 'existing',
      existingEntityId,
      newEntityName: '',
      unit: 'nM',
      minimum: '0',
      maximum: '100',
    },
    output: {
      name: '',
      signalMode: 'known',
      catalogSignalId: signals[0]?.catalogSignalId ?? '',
      customSignalName: '',
      unit: 'nM/h',
    },
    hillK: parameter('10'),
    hillN: parameter('2'),
    minimumOutput: parameter('0'),
    maximumOutput: parameter('1'),
    context: {
      hostSpecies: '',
      hostStrain: '',
      medium: '',
      temperatureCelsius: '',
      ph: '',
    },
    evidenceBasis: 'proposed_unbuilt_design',
    provenanceKind: 'publication',
    provenanceReference: '',
    uncertainty: 'not_recorded',
  };
}

export function buildDesignedSenderDraft(
  state: DesignedSenderAuthoringState,
  project: BfnProject,
  signals: readonly DesignedSenderSignalIdentity[] = getDesignedSenderSignalCatalog(),
): BuildDesignedSenderDraftResult {
  const issues: DesignedSenderAuthoringIssue[] = [];
  if (!isDesignedSenderModelFamily(state.family)) {
    issues.push(issue('family', 'unsupported_model_family'));
  }
  if (!isDesignedSenderControlUnit(state.controlInput.unit)) {
    issues.push(issue('controlInput.unit', 'unsupported_control_unit'));
  }
  if (!isDesignedSenderOutputUnit(state.output.unit)) {
    issues.push(issue('output.unit', 'unsupported_output_unit'));
  }
  if (!isDesignedSenderUncertainty(state.uncertainty)) {
    issues.push(issue('uncertainty', 'unsupported_uncertainty'));
  }

  let authoritativeSignal: DesignedSenderSignalIdentity | null = null;
  if (state.output.signalMode === 'known') {
    if (!hasText(state.output.catalogSignalId)) {
      issues.push(issue('output.catalogSignalId', 'catalog_signal_required'));
    } else {
      authoritativeSignal =
        signals.find((signal) => signal.catalogSignalId === state.output.catalogSignalId) ?? null;
      if (!authoritativeSignal) {
        issues.push(issue('output.catalogSignalId', 'catalog_signal_unknown'));
      }
    }
  } else if (state.output.signalMode === 'custom') {
    if (!hasText(state.output.customSignalName)) {
      issues.push(issue('output.customSignalName', 'custom_signal_required'));
    }
  } else {
    issues.push(issue('output.signalMode', 'unsupported_signal_mode'));
  }

  if (
    issues.length > 0 ||
    !isDesignedSenderModelFamily(state.family) ||
    !isDesignedSenderControlUnit(state.controlInput.unit) ||
    !isDesignedSenderOutputUnit(state.output.unit) ||
    !isDesignedSenderUncertainty(state.uncertainty)
  ) {
    return { ok: false, issues };
  }

  const genericState: UserModuleAuthoringState = {
    name: state.name,
    description: state.description,
    family: state.family,
    inputs: [
      {
        key: 1,
        name: state.controlInput.name,
        entityMode: state.controlInput.entityMode,
        existingEntityId: state.controlInput.existingEntityId,
        newEntityName: state.controlInput.newEntityName,
        quantityType: 'concentration',
        unit: state.controlInput.unit,
        minimum: state.controlInput.minimum,
        maximum: state.controlInput.maximum,
        effect: state.family === 'hill_repression' ? 'repression' : 'activation',
        k: state.hillK,
        n: state.hillN,
        weight: parameter('1'),
      },
    ],
    output: {
      name: state.output.name,
      entityMode: 'new',
      existingEntityId: '',
      newEntityName: authoritativeSignal?.displayName ?? state.output.customSignalName,
      quantityType: 'production_rate',
      unit: state.output.unit,
    },
    hillK: state.hillK,
    hillN: state.hillN,
    minimumOutput: state.minimumOutput,
    maximumOutput: state.maximumOutput,
    linearScale: parameter('1'),
    linearIntercept: parameter('0'),
    independentBasal: parameter('0'),
    independentMaximum: parameter('1'),
    aggregation: 'bounded_sum',
    context: state.context,
    evidenceBasis: state.evidenceBasis,
    provenanceKind: state.provenanceKind,
    provenanceReference: state.provenanceReference,
    uncertainty: state.uncertainty,
  };
  const genericResult = buildUserDefinedModuleDraft(genericState, project);
  if (!genericResult.ok) return { ok: false, issues: genericResult.issues };

  const draft = authoritativeSignal
    ? replaceOutputEntity(genericResult.draft, authoritativeSignal)
    : genericResult.draft;
  const assessment = assessUserDefinedFunctionalModule(draft);
  if (
    assessment.semantic.state !== 'valid' ||
    assessment.runtime.state !== 'supported' ||
    assessment.evidence.issues.length > 0 ||
    assessment.implementation.state === 'unrecognized' ||
    assessment.implementation.issues.length > 0
  ) {
    return { ok: false, issues: [issue('draft', 'generic_contract_invalid')] };
  }

  return deepFreeze({ ok: true, draft, authoritativeSignal });
}

function replaceOutputEntity(
  draft: UserDefinedFunctionalModuleDraft,
  identity: DesignedSenderSignalIdentity,
): UserDefinedFunctionalModuleDraft {
  return {
    ...draft,
    ports: draft.ports.map((port) =>
      port.direction === 'output'
        ? {
            ...port,
            entity: { id: identity.entityId, displayName: identity.displayName },
          }
        : port,
    ),
  };
}

function parameter(value: string) {
  return { value, lower: '', upper: '' } as const;
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function issue(
  field: string,
  code: DesignedSenderAuthoringIssueCode,
): DesignedSenderAuthoringIssue {
  return { field, code };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
