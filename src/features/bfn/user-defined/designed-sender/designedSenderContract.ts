import type { BfnEvidenceGrade } from '../../types';
import type {
  UserModuleAuthoringContext,
  UserModuleAuthoringEntityMode,
  UserModuleAuthoringParameter,
} from '../userModuleAuthoringDraft';

export const DESIGNED_SENDER_MODEL_FAMILIES = Object.freeze([
  'hill_activation',
  'hill_repression',
] as const);

export const DESIGNED_SENDER_CONTROL_UNITS = Object.freeze(['M', 'mM', 'uM', 'nM', 'pM'] as const);

export const DESIGNED_SENDER_OUTPUT_UNITS = Object.freeze(['nM/h', 'uM/h'] as const);

export const DESIGNED_SENDER_UNCERTAINTY_OPTIONS = Object.freeze([
  'not_recorded',
  'none',
  'parameter_interval_envelope',
] as const);

export type DesignedSenderModelFamily = (typeof DESIGNED_SENDER_MODEL_FAMILIES)[number];
export type DesignedSenderControlUnit = (typeof DESIGNED_SENDER_CONTROL_UNITS)[number];
export type DesignedSenderOutputUnit = (typeof DESIGNED_SENDER_OUTPUT_UNITS)[number];
export type DesignedSenderUncertainty = (typeof DESIGNED_SENDER_UNCERTAINTY_OPTIONS)[number];
export type DesignedSenderSignalMode = 'known' | 'custom';

export interface DesignedSenderControlInputState {
  readonly name: string;
  readonly entityMode: UserModuleAuthoringEntityMode;
  readonly existingEntityId: string;
  readonly newEntityName: string;
  readonly unit: string;
  readonly minimum: string;
  readonly maximum: string;
}

export interface DesignedSenderOutputState {
  readonly name: string;
  readonly signalMode: string;
  readonly catalogSignalId: string;
  readonly customSignalName: string;
  readonly unit: string;
}

export interface DesignedSenderAuthoringState {
  readonly name: string;
  readonly description: string;
  readonly family: string;
  readonly controlInput: DesignedSenderControlInputState;
  readonly output: DesignedSenderOutputState;
  readonly hillK: UserModuleAuthoringParameter;
  readonly hillN: UserModuleAuthoringParameter;
  readonly minimumOutput: UserModuleAuthoringParameter;
  readonly maximumOutput: UserModuleAuthoringParameter;
  readonly context: UserModuleAuthoringContext;
  readonly evidenceBasis: BfnEvidenceGrade;
  readonly provenanceKind: 'dataset' | 'publication' | 'repository_record' | 'user_note';
  readonly provenanceReference: string;
  readonly uncertainty: string;
}

export function isDesignedSenderModelFamily(value: string): value is DesignedSenderModelFamily {
  return DESIGNED_SENDER_MODEL_FAMILIES.some((candidate) => candidate === value);
}

export function isDesignedSenderControlUnit(value: string): value is DesignedSenderControlUnit {
  return DESIGNED_SENDER_CONTROL_UNITS.some((candidate) => candidate === value);
}

export function isDesignedSenderOutputUnit(value: string): value is DesignedSenderOutputUnit {
  return DESIGNED_SENDER_OUTPUT_UNITS.some((candidate) => candidate === value);
}

export function isDesignedSenderUncertainty(value: string): value is DesignedSenderUncertainty {
  return DESIGNED_SENDER_UNCERTAINTY_OPTIONS.some((candidate) => candidate === value);
}
