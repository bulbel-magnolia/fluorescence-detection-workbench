import {
  matchesAhlHslRuntimeDemoWhitelist,
} from './catalog/v2/catalogRuntimeDemoWhitelist';
import { loadAhlHslCatalogRelease } from './catalog/v2/catalogReleaseLoader';
import type {
  CatalogV2ReceiverResponse,
  ComponentCatalogV2,
} from './catalog/v2/catalogTypes';
import type {
  FourParameterLogisticReceiverResponseBinding,
  ModelInputDirection,
  ReceiverResponseBinding,
  ReceiverResponseWorkingRange,
} from './types';

const SHONG_EC50 = 2.1e-7;

/**
 * The release loader is deliberately lazy and cached.  Evaluation must never
 * use a caller-provided object as the source of model parameters: callers may
 * hold a mutable clone or an object assembled from untrusted input.
 */
let trustedCatalogCache: ComponentCatalogV2 | undefined;
let trustedResponseCache: Map<string, CatalogV2ReceiverResponse> | undefined;

function trustedCatalog(): ComponentCatalogV2 {
  if (trustedCatalogCache === undefined) {
    trustedCatalogCache = loadAhlHslCatalogRelease().catalog;
    trustedResponseCache = new Map(
      trustedCatalogCache.receiverResponses.map((response) => [response.id, response]),
    );
  }
  return trustedCatalogCache;
}

function trustedResponse(responseId: string): CatalogV2ReceiverResponse | undefined {
  trustedCatalog();
  return trustedResponseCache?.get(responseId);
}

export type ReceiverResponseEvaluationErrorCode =
  | 'RECEIVER_RESPONSE_BINDING_INVALID'
  | 'RECEIVER_RESPONSE_BINDING_NOT_WHITELISTED'
  | 'RECEIVER_RESPONSE_RESPONSE_NOT_FOUND'
  | 'RECEIVER_RESPONSE_COMPONENT_NOT_FOUND'
  | 'RECEIVER_RESPONSE_SOURCE_NOT_EXECUTABLE'
  | 'RECEIVER_RESPONSE_OUTPUT_SIGNAL_INVALID'
  | 'RECEIVER_RESPONSE_WORKING_RANGE_INVALID'
  | 'RECEIVER_RESPONSE_PARAMETER_INVALID'
  | 'RECEIVER_RESPONSE_INPUT_UNIT_INVALID'
  | 'RECEIVER_RESPONSE_INPUT_NOT_FINITE'
  | 'RECEIVER_RESPONSE_INPUT_NEGATIVE'
  | 'RECEIVER_RESPONSE_INPUT_OUT_OF_RANGE';

export class ReceiverResponseEvaluationError extends Error {
  readonly code: ReceiverResponseEvaluationErrorCode;

  constructor(code: ReceiverResponseEvaluationErrorCode) {
    super(code);
    this.name = 'ReceiverResponseEvaluationError';
    this.code = code;
  }
}

function fail(code: ReceiverResponseEvaluationErrorCode): never {
  throw new ReceiverResponseEvaluationError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isModelInputDirection(value: unknown): value is ModelInputDirection {
  return value === 'activation' || value === 'inhibition' || value === 'derepression';
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || finiteNumber(value);
}

function bindingMatchesWhitelist(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return matchesAhlHslRuntimeDemoWhitelist({
    id: typeof value.receiverResponseId === 'string' ? value.receiverResponseId : '',
    demoImplementation: value.demoImplementation,
    modelType: value.modelType,
    numericalExecutionAllowed: value.numericalExecutionAllowed,
    normalizedDemoOnly: value.normalizedDemoOnly,
    fixedWeightCandidate: value.fixedWeightCandidate,
  });
}

function validWorkingRange(value: unknown): value is ReceiverResponseWorkingRange {
  if (!isRecord(value)) return false;
  return (
    finiteNumber(value.min) &&
    finiteNumber(value.max) &&
    value.min >= 0 &&
    value.max > 0 &&
    value.min <= value.max &&
    value.unit === 'M'
  );
}

function validCommonBinding(value: Record<string, unknown>): boolean {
  const stringFields = [
    'catalogId',
    'catalogVersion',
    'releaseId',
    'releaseVersion',
    'componentId',
    'receiverResponseId',
    'parameterContextId',
    'inputSignalId',
    'outputSignalId',
  ];
  if (stringFields.some((field) => !nonEmptyString(value[field]))) return false;
  if (
    !Array.isArray(value.sourceIds) ||
    !value.sourceIds.every(nonEmptyString) ||
    new Set(value.sourceIds).size !== value.sourceIds.length
  )
    return false;
  return (
    isModelInputDirection(value.direction) &&
    value.inputUnit === 'M' &&
    validWorkingRange(value.workingRange) &&
    value.softwareStatus === 'runtime-demo' &&
    value.normalizedDemoOnly === true &&
    value.numericalExecutionAllowed === true &&
    value.fixedWeightCandidate === false &&
    bindingMatchesWhitelist(value)
  );
}

function validFourParameterBinding(
  value: Record<string, unknown>,
): boolean {
  if (
    value.kind !== 'four_parameter_logistic' ||
    value.modelType !== 'four_parameter_logistic' ||
    value.demoImplementation !==
      'four_parameter_logistic_then_within_context_clip_0_1' ||
    !isRecord(value.originalParameters)
  )
    return false;
  const parameters = value.originalParameters;
  return (
    value.direction === 'activation' &&
    finiteNumber(parameters.basal) &&
    finiteNumber(parameters.maximum) &&
    finiteNumber(parameters.ec50) &&
    finiteNumber(parameters.hillCoefficient) &&
    parameters.maximum > parameters.basal &&
    parameters.ec50 > 0 &&
    parameters.hillCoefficient > 0 &&
    parameters.ec50Unit === 'M'
  );
}

function validHillBinding(
  value: Record<string, unknown>,
): boolean {
  if (
    value.kind !== 'hill_equation_n_fixed_1' ||
    value.modelType !== 'hill_equation_n_fixed_1' ||
    value.demoImplementation !==
      'hill_derepression_n_fixed_1_then_within_context_normalization' ||
    !isRecord(value.originalParameters)
  )
    return false;
  const parameters = value.originalParameters;
  return (
    value.direction === 'derepression' &&
    isNullableFiniteNumber(parameters.basal) &&
    isNullableFiniteNumber(parameters.maximum) &&
    parameters.ec50 === SHONG_EC50 &&
    parameters.hillCoefficient === 1 &&
    parameters.ec50Unit === 'M'
  );
}

export function isReceiverResponseBinding(
  value: unknown,
): value is ReceiverResponseBinding {
  if (!isRecord(value) || !validCommonBinding(value)) return false;
  return value.kind === 'four_parameter_logistic'
    ? validFourParameterBinding(value)
    : value.kind === 'hill_equation_n_fixed_1'
      ? validHillBinding(value)
      : false;
}

function responseIsExecutable(
  response: CatalogV2ReceiverResponse,
): boolean {
  const source = response.sourceResponse;
  return (
    response.admission.status === 'runtime-demo' &&
    response.admission.simulationReady === true &&
    source !== undefined &&
    source.softwareStatus === 'runtime-demo' &&
    source.ec50Unit === 'M' &&
    matchesAhlHslRuntimeDemoWhitelist({
      id: response.id,
      demoImplementation: source.demoImplementation,
      modelType: source.modelType,
      numericalExecutionAllowed: source.numericalExecutionAllowed,
      normalizedDemoOnly: source.normalizedDemoOnly,
      fixedWeightCandidate: source.fixedWeightCandidate,
    })
  );
}

function catalogContainsResponseReferences(
  catalog: ComponentCatalogV2,
  response: CatalogV2ReceiverResponse,
): boolean {
  const component = catalog.components.find((candidate) => candidate.id === response.receiverComponentId);
  const context = catalog.parameterContexts.find(
    (candidate) => candidate.id === response.parameterContextId,
  );
  const inputSignal = catalog.signals.find((candidate) => candidate.id === response.inputSignalId);
  const outputSignal = response.outputSignalId === null
    ? undefined
    : catalog.signals.find((candidate) => candidate.id === response.outputSignalId);
  const sourceIds = new Set(catalog.sources.map((source) => source.id));
  return (
    component !== undefined &&
    context !== undefined &&
    inputSignal !== undefined &&
    outputSignal !== undefined &&
    response.sourceIds.length > 0 &&
    response.sourceIds.every((sourceId) => sourceIds.has(sourceId)) &&
    component.parameterContextIds.includes(response.parameterContextId) &&
    component.inputSignalIds.includes(response.inputSignalId) &&
    component.outputSignalIds.includes(response.outputSignalId ?? '') &&
    context.details?.applicableComponentIds.includes(response.receiverComponentId) === true
  );
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length)
      return false;
    return left.every((value, index) => deepEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!deepEqual(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

function sameIdSet<T extends { id: string }>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right.map((item) => item.id));
  return left.every((item) => rightIds.has(item.id));
}

/**
 * Verify every release object that can affect a response binding.  The
 * comparison is intentionally exact (including source order) so that a
 * catalog forged with a whitelisted response id cannot supply new parameters.
 */
function catalogMatchesTrustedSource(
  candidate: ComponentCatalogV2,
  trusted: ComponentCatalogV2,
  responseId: string,
): boolean {
  if (!deepEqual(candidate.releaseManifest, trusted.releaseManifest)) return false;
  if (
    !sameIdSet(candidate.signals, trusted.signals) ||
    !sameIdSet(candidate.components, trusted.components) ||
    !sameIdSet(candidate.parameterContexts, trusted.parameterContexts) ||
    !sameIdSet(candidate.receiverResponses, trusted.receiverResponses) ||
    !sameIdSet(candidate.sources, trusted.sources)
  )
    return false;

  const expected = trustedResponse(responseId);
  const actual = candidate.receiverResponses.find((response) => response.id === responseId);
  if (expected === undefined || actual === undefined || !deepEqual(actual, expected)) return false;

  const expectedComponent = trusted.components.find(
    (component) => component.id === expected.receiverComponentId,
  );
  const actualComponent = candidate.components.find(
    (component) => component.id === expected.receiverComponentId,
  );
  const expectedContext = trusted.parameterContexts.find(
    (context) => context.id === expected.parameterContextId,
  );
  const actualContext = candidate.parameterContexts.find(
    (context) => context.id === expected.parameterContextId,
  );
  const expectedInput = trusted.signals.find((signal) => signal.id === expected.inputSignalId);
  const actualInput = candidate.signals.find((signal) => signal.id === expected.inputSignalId);
  const expectedOutput = expected.outputSignalId
    ? trusted.signals.find((signal) => signal.id === expected.outputSignalId)
    : undefined;
  const actualOutput = expected.outputSignalId
    ? candidate.signals.find((signal) => signal.id === expected.outputSignalId)
    : undefined;
  if (
    expectedComponent === undefined ||
    actualComponent === undefined ||
    expectedContext === undefined ||
    actualContext === undefined ||
    expectedInput === undefined ||
    actualInput === undefined ||
    (expectedOutput !== undefined && actualOutput === undefined) ||
    !deepEqual(actualComponent, expectedComponent) ||
    !deepEqual(actualContext, expectedContext) ||
    !deepEqual(actualInput, expectedInput) ||
    !deepEqual(actualOutput, expectedOutput)
  )
    return false;

  const sourceById = new Map(trusted.sources.map((source) => [source.id, source]));
  const candidateSourceById = new Map(candidate.sources.map((source) => [source.id, source]));
  return expected.sourceIds.every((sourceId) => {
    const expectedSource = sourceById.get(sourceId);
    const actualSource = candidateSourceById.get(sourceId);
    return expectedSource !== undefined && actualSource !== undefined && deepEqual(actualSource, expectedSource);
  });
}

function sourceRange(response: CatalogV2ReceiverResponse): ReceiverResponseWorkingRange {
  const range = response.sourceResponse?.workingRange;
  if (
    range === null ||
    range === undefined ||
    !finiteNumber(range.min) ||
    !finiteNumber(range.max) ||
    range.min < 0 ||
    range.max <= 0 ||
    range.min > range.max
  )
    return fail('RECEIVER_RESPONSE_WORKING_RANGE_INVALID');
  return { min: range.min, max: range.max, unit: 'M' };
}

function commonBinding(
  catalog: ComponentCatalogV2,
  response: CatalogV2ReceiverResponse,
  direction: ModelInputDirection,
  workingRange: ReceiverResponseWorkingRange,
): Omit<FourParameterLogisticReceiverResponseBinding, 'kind' | 'modelType' | 'demoImplementation' | 'originalParameters'> {
  const source = response.sourceResponse;
  if (
    source === undefined ||
    !nonEmptyString(source.direction) ||
    response.outputSignalId === null ||
    !nonEmptyString(response.outputSignalId) ||
    response.sourceIds.length === 0 ||
    !response.sourceIds.every(nonEmptyString)
  )
    return fail('RECEIVER_RESPONSE_SOURCE_NOT_EXECUTABLE');
  return {
    catalogId: catalog.releaseManifest.catalogId,
    catalogVersion: catalog.releaseManifest.releaseVersion,
    releaseId: catalog.releaseManifest.releaseId,
    releaseVersion: catalog.releaseManifest.releaseVersion,
    componentId: response.receiverComponentId,
    receiverResponseId: response.id,
    parameterContextId: response.parameterContextId,
    inputSignalId: response.inputSignalId,
    outputSignalId: response.outputSignalId,
    sourceIds: [...response.sourceIds],
    direction,
    inputUnit: 'M',
    workingRange,
    softwareStatus: 'runtime-demo',
    normalizedDemoOnly: true,
    numericalExecutionAllowed: true,
    fixedWeightCandidate: false,
  };
}

function buildTrustedReceiverResponseBinding(
  catalog: ComponentCatalogV2,
  receiverResponseId: string,
): ReceiverResponseBinding {
  const response = catalog.receiverResponses.find(
    (candidate) => candidate.id === receiverResponseId,
  );
  if (response === undefined) return fail('RECEIVER_RESPONSE_RESPONSE_NOT_FOUND');
  if (!catalogContainsResponseReferences(catalog, response))
    return fail('RECEIVER_RESPONSE_COMPONENT_NOT_FOUND');
  if (!responseIsExecutable(response))
    return fail('RECEIVER_RESPONSE_SOURCE_NOT_EXECUTABLE');
  const source = response.sourceResponse;
  if (source === undefined || !isModelInputDirection(source.direction))
    return fail('RECEIVER_RESPONSE_SOURCE_NOT_EXECUTABLE');
  const workingRange = sourceRange(response);
  const common = commonBinding(catalog, response, source.direction, workingRange);
  let binding: ReceiverResponseBinding;
  if (source.modelType === 'four_parameter_logistic') {
    if (
      !finiteNumber(source.basal) ||
      !finiteNumber(source.maximum) ||
      !finiteNumber(source.ec50) ||
      !finiteNumber(source.hillCoefficient)
    )
      return fail('RECEIVER_RESPONSE_PARAMETER_INVALID');
    binding = {
      ...common,
      kind: 'four_parameter_logistic',
      modelType: 'four_parameter_logistic',
      demoImplementation: 'four_parameter_logistic_then_within_context_clip_0_1',
      originalParameters: {
        basal: source.basal,
        maximum: source.maximum,
        ec50: source.ec50,
        hillCoefficient: source.hillCoefficient,
        ec50Unit: 'M',
      },
    };
  } else if (source.modelType === 'hill_equation_n_fixed_1') {
    if (
      source.ec50 !== SHONG_EC50 ||
      source.hillCoefficient !== 1 ||
      !isNullableFiniteNumber(source.basal) ||
      !isNullableFiniteNumber(source.maximum)
    )
      return fail('RECEIVER_RESPONSE_PARAMETER_INVALID');
    binding = {
      ...common,
      kind: 'hill_equation_n_fixed_1',
      modelType: 'hill_equation_n_fixed_1',
      demoImplementation: 'hill_derepression_n_fixed_1_then_within_context_normalization',
      originalParameters: {
        basal: source.basal,
        maximum: source.maximum,
        ec50: SHONG_EC50,
        hillCoefficient: 1,
        ec50Unit: 'M',
      },
    };
  } else {
    return fail('RECEIVER_RESPONSE_SOURCE_NOT_EXECUTABLE');
  }
  if (!isReceiverResponseBinding(binding))
    return fail('RECEIVER_RESPONSE_BINDING_INVALID');
  return binding;
}

export function buildReceiverResponseBinding(
  catalog: ComponentCatalogV2,
  receiverResponseId: string,
): ReceiverResponseBinding {
  const trusted = trustedCatalog();
  if (trustedResponse(receiverResponseId) === undefined)
    return fail('RECEIVER_RESPONSE_RESPONSE_NOT_FOUND');
  if (!isRecord(catalog) || !catalogMatchesTrustedSource(catalog, trusted, receiverResponseId))
    return fail('RECEIVER_RESPONSE_BINDING_INVALID');
  // Build from the frozen canonical release, never from the caller's object.
  return buildTrustedReceiverResponseBinding(trusted, receiverResponseId);
}

export const createReceiverResponseBinding = buildReceiverResponseBinding;

function bindingMatchesTrustedSource(value: unknown): boolean {
  try {
    if (!isRecord(value) || typeof value.receiverResponseId !== 'string') return false;
    if (trustedResponse(value.receiverResponseId) === undefined) return false;
    const expected = buildTrustedReceiverResponseBinding(
      trustedCatalog(),
      value.receiverResponseId,
    );
    return deepEqual(value, expected);
  } catch {
    return false;
  }
}

/** Structural validity is not sufficient: only an exact frozen-release binding is trusted. */
export function isTrustedReceiverResponseBinding(
  value: unknown,
): value is ReceiverResponseBinding {
  return isReceiverResponseBinding(value) && bindingMatchesTrustedSource(value);
}

function fourParameterLogistic(
  basal: number,
  maximum: number,
  ec50: number,
  hillCoefficient: number,
  concentration: number,
): number {
  const logRatio = hillCoefficient * (Math.log(ec50) - Math.log(concentration));
  let fraction: number;
  if (logRatio >= 0) {
    const inverse = Math.exp(-logRatio);
    fraction = inverse / (1 + inverse);
  } else {
    const direct = Math.exp(logRatio);
    fraction = 1 / (1 + direct);
  }
  const signal = basal + (maximum - basal) * fraction;
  return (signal - basal) / (maximum - basal);
}

export function evaluateReceiverResponse(
  binding: ReceiverResponseBinding,
  concentration: number,
  inputUnit = 'M',
): number {
  if (!isRecord(binding)) return fail('RECEIVER_RESPONSE_BINDING_INVALID');
  if (!bindingMatchesWhitelist(binding))
    return fail('RECEIVER_RESPONSE_BINDING_NOT_WHITELISTED');
  if (!isReceiverResponseBinding(binding))
    return fail('RECEIVER_RESPONSE_BINDING_INVALID');
  if (!bindingMatchesTrustedSource(binding))
    return fail('RECEIVER_RESPONSE_BINDING_NOT_WHITELISTED');
  if (inputUnit !== 'M') return fail('RECEIVER_RESPONSE_INPUT_UNIT_INVALID');
  if (!finiteNumber(concentration)) return fail('RECEIVER_RESPONSE_INPUT_NOT_FINITE');
  if (concentration < 0) return fail('RECEIVER_RESPONSE_INPUT_NEGATIVE');
  if (concentration === 0) return 0;
  if (
    concentration < binding.workingRange.min ||
    concentration > binding.workingRange.max
  )
    return fail('RECEIVER_RESPONSE_INPUT_OUT_OF_RANGE');
  if (binding.kind === 'four_parameter_logistic') {
    return Math.min(
      1,
      Math.max(
        0,
        fourParameterLogistic(
          binding.originalParameters.basal,
          binding.originalParameters.maximum,
          binding.originalParameters.ec50,
          binding.originalParameters.hillCoefficient,
          concentration,
        ),
      ),
    );
  }
  const denominator = binding.originalParameters.ec50 + concentration;
  if (!Number.isFinite(denominator) || denominator <= 0)
    return fail('RECEIVER_RESPONSE_PARAMETER_INVALID');
  return Math.min(1, Math.max(0, concentration / denominator));
}

export const evaluateReceiverResponseBinding = evaluateReceiverResponse;
