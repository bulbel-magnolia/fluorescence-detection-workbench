import type { ReceiverResponseBinding } from '../../modeling/types';
import type { BfnCatalogModelReference, BfnValidityDomain } from '../types';

export const BFN_CATALOG_OUTPUT_ENTITY = 'normalized_reporter_expression' as const;

export type BfnCatalogContractErrorCode =
  | 'catalog_model_reference_invalid'
  | 'catalog_release_unavailable'
  | 'catalog_model_mismatch'
  | 'catalog_input_out_of_range'
  | 'catalog_execution_unavailable';

export class BfnCatalogContractError extends Error {
  readonly code: BfnCatalogContractErrorCode;
  readonly details?: Readonly<Record<string, string | number>>;

  constructor(
    code: BfnCatalogContractErrorCode,
    details?: Readonly<Record<string, string | number>>,
  ) {
    super(code);
    this.name = 'BfnCatalogContractError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export interface BfnCatalogRuntimeCandidate {
  kind: 'catalog_receiver_response_candidate';
  responseId: string;
  catalogReference: BfnCatalogModelReference;
  inputEntity: string;
  outputEntity: typeof BFN_CATALOG_OUTPUT_ENTITY;
  contextId: string;
  modelVersion: string;
}

export interface VerifiedBfnCatalogModel {
  candidate: BfnCatalogRuntimeCandidate;
  catalogReference: BfnCatalogModelReference;
  binding: ReceiverResponseBinding;
  domain: BfnValidityDomain;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

export function isBfnCatalogModelReference(value: unknown): value is BfnCatalogModelReference {
  if (!isRecord(value) || value.kind !== 'catalog_receiver_response') return false;
  const stringFields = [
    'catalogId',
    'releaseId',
    'releaseVersion',
    'responseId',
    'componentId',
    'inputSignalId',
    'outputSignalId',
    'parameterContextId',
    'runtimeImplementation',
  ];
  if (stringFields.some((field) => !isNonEmptyString(value[field]))) return false;
  if (
    !Array.isArray(value.sourceIds) ||
    value.sourceIds.length === 0 ||
    !value.sourceIds.every(isNonEmptyString) ||
    new Set(value.sourceIds).size !== value.sourceIds.length
  ) {
    return false;
  }
  if (
    value.sourceModelType !== 'four_parameter_logistic' &&
    value.sourceModelType !== 'hill_equation_n_fixed_1'
  ) {
    return false;
  }
  if (value.biologicalDirection !== 'activation' && value.biologicalDirection !== 'derepression') {
    return false;
  }
  if (!isRecord(value.sourceParameters)) return false;
  const parameters = value.sourceParameters;
  if (
    !isNullableFiniteNumber(parameters.basal) ||
    !isNullableFiniteNumber(parameters.maximum) ||
    !isFiniteNumber(parameters.ec50) ||
    parameters.ec50 <= 0 ||
    parameters.ec50Unit !== 'M' ||
    !isFiniteNumber(parameters.hillCoefficient) ||
    parameters.hillCoefficient <= 0 ||
    !isRecord(parameters.workingRange)
  ) {
    return false;
  }
  const range = parameters.workingRange;
  return (
    isFiniteNumber(range.min) &&
    isFiniteNumber(range.max) &&
    range.min >= 0 &&
    range.max > 0 &&
    range.min <= range.max &&
    range.unit === 'M'
  );
}

export interface BfnCatalogReferencePresence {
  present: boolean;
  value: unknown;
}

export function bfnCatalogReferencePresence(model: unknown): BfnCatalogReferencePresence {
  if (!isRecord(model) || !Object.prototype.hasOwnProperty.call(model, 'catalogReference')) {
    return { present: false, value: undefined };
  }
  return { present: model.catalogReference !== undefined, value: model.catalogReference };
}
