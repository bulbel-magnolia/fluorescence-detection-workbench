import {
  buildReceiverResponseBinding,
  isTrustedReceiverResponseBinding,
} from '../../modeling/receiverResponseEvaluator';
import { getTrustedAhlHslCatalogRelease } from '../../modeling/catalog/v2/catalogReleaseLoader';
import {
  AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST,
  getAhlHslRuntimeDemoWhitelistEntry,
} from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import type { ReceiverResponseBinding } from '../../modeling/types';
import type {
  BfnCanvasPosition,
  BfnFunctionalModule,
  BfnHillResponse,
  BfnInputSource,
  BfnPort,
  BfnProject,
  BfnStaticInputSpecification,
  BfnStaticModel,
  BfnValidityDomain,
} from '../types';
import {
  BFN_CATALOG_OUTPUT_ENTITY,
  BfnCatalogContractError,
  type BfnCatalogRuntimeCandidate,
} from './catalogBfnTypes';
import {
  findCompatibleBfnSignalSources,
  type BfnCatalogInputResolution,
} from './catalogInputResolution';

const CATALOG_MODULE_LABEL_KEY = 'bfn.catalog.receiverResponseModule';
const CATALOG_MODULE_DESCRIPTION_KEY = 'bfn.catalog.receiverResponseDescription';
const CATALOG_DOMAIN_LABEL_KEY = 'bfn.catalog.validityDomain';
const CATALOG_INPUT_SOURCE_LABEL_KEY = 'bfn.catalog.inputSource';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => deepEqual(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!deepEqual(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function unsupported(responseId: string): never {
  throw new BfnCatalogContractError('catalog_execution_unavailable', { responseId });
}

function candidateFromBinding(binding: ReceiverResponseBinding): BfnCatalogRuntimeCandidate {
  const trusted = getTrustedAhlHslCatalogRelease();
  const canonicalSignal = trusted.release.signals.find(
    (signal) => signal.id === binding.inputSignalId,
  );
  if (
    canonicalSignal === undefined ||
    typeof canonicalSignal.canonical_name !== 'string' ||
    canonicalSignal.canonical_name.trim().length === 0
  ) {
    return unsupported(binding.receiverResponseId);
  }

  let biologicalDirection: 'activation' | 'derepression';
  if (binding.kind === 'four_parameter_logistic') {
    if (binding.direction !== 'activation') return unsupported(binding.receiverResponseId);
    biologicalDirection = 'activation';
  } else {
    if (binding.direction !== 'derepression') return unsupported(binding.receiverResponseId);
    biologicalDirection = 'derepression';
  }

  const reference = {
    kind: 'catalog_receiver_response' as const,
    catalogId: binding.catalogId,
    releaseId: binding.releaseId,
    releaseVersion: binding.releaseVersion,
    responseId: binding.receiverResponseId,
    componentId: binding.componentId,
    inputSignalId: binding.inputSignalId,
    outputSignalId: binding.outputSignalId,
    parameterContextId: binding.parameterContextId,
    sourceIds: [...binding.sourceIds],
    sourceModelType: binding.modelType,
    biologicalDirection,
    runtimeImplementation: binding.demoImplementation,
    sourceParameters: {
      basal: binding.originalParameters.basal,
      maximum: binding.originalParameters.maximum,
      ec50: binding.originalParameters.ec50,
      ec50Unit: 'M' as const,
      hillCoefficient: binding.originalParameters.hillCoefficient,
      workingRange: {
        min: binding.workingRange.min,
        max: binding.workingRange.max,
        unit: 'M' as const,
      },
    },
  };
  return deepFreeze({
    kind: 'catalog_receiver_response_candidate',
    responseId: binding.receiverResponseId,
    catalogReference: reference,
    inputEntity: canonicalSignal.canonical_name,
    outputEntity: BFN_CATALOG_OUTPUT_ENTITY,
    contextId: `catalog:${binding.catalogId}@${binding.releaseVersion}:${binding.parameterContextId}`,
    modelVersion: `${binding.catalogId}@${binding.releaseVersion}:${binding.receiverResponseId}`,
  });
}

export function buildBfnCatalogRuntimeCandidate(responseId: string): BfnCatalogRuntimeCandidate {
  if (getAhlHslRuntimeDemoWhitelistEntry(responseId) === undefined) return unsupported(responseId);
  try {
    const trusted = getTrustedAhlHslCatalogRelease();
    const binding = buildReceiverResponseBinding(trusted.catalog, responseId);
    if (!isTrustedReceiverResponseBinding(binding)) return unsupported(responseId);
    return candidateFromBinding(binding);
  } catch {
    return unsupported(responseId);
  }
}

export function buildAllBfnCatalogRuntimeCandidates(): BfnCatalogRuntimeCandidate[] {
  return AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.map((entry) =>
    buildBfnCatalogRuntimeCandidate(entry.id),
  );
}

export function isTrustedBfnCatalogRuntimeCandidate(
  candidate: unknown,
): candidate is BfnCatalogRuntimeCandidate {
  if (!isRecord(candidate) || typeof candidate.responseId !== 'string') return false;
  try {
    return deepEqual(candidate, buildBfnCatalogRuntimeCandidate(candidate.responseId));
  } catch {
    return false;
  }
}

export function buildBfnCatalogStaticResponse(
  candidate: BfnCatalogRuntimeCandidate,
  inputPortId: string,
): BfnHillResponse {
  if (!isTrustedBfnCatalogRuntimeCandidate(candidate) || inputPortId.trim().length === 0) {
    throw new BfnCatalogContractError('catalog_model_mismatch');
  }
  return {
    family: 'hill_activation',
    inputPortId,
    ymin: { value: 0, unit: 'dimensionless' },
    ymax: { value: 1, unit: 'dimensionless' },
    k: { value: candidate.catalogReference.sourceParameters.ec50, unit: 'M' },
    n: {
      value: candidate.catalogReference.sourceParameters.hillCoefficient,
      unit: 'dimensionless',
    },
  };
}

export interface CreateCatalogInputSourceOptions {
  inputSourceId: string;
  outputPortId: string;
  position: BfnCanvasPosition;
}

export function createBfnInputSourceForCatalogResponse(
  candidate: BfnCatalogRuntimeCandidate,
  options: CreateCatalogInputSourceOptions,
): BfnInputSource {
  if (!isTrustedBfnCatalogRuntimeCandidate(candidate)) {
    throw new BfnCatalogContractError('catalog_model_mismatch');
  }
  const range = candidate.catalogReference.sourceParameters.workingRange;
  const staticSpecification: BfnStaticInputSpecification =
    range.min < range.max
      ? {
          type: 'working_range',
          minimum: range.min,
          maximum: range.max,
          points: 33,
          unit: 'M',
        }
      : { type: 'fixed_value', value: range.min, unit: 'M' };
  return {
    kind: 'input_source',
    id: options.inputSourceId,
    labelKey: CATALOG_INPUT_SOURCE_LABEL_KEY,
    outputPort: {
      id: options.outputPortId,
      entity: candidate.inputEntity,
      quantityType: 'concentration',
      unit: 'M',
      direction: 'output',
    },
    staticSpecification,
    dynamicSpecification: { type: 'constant', value: range.min, unit: 'M' },
    position: { ...options.position },
  };
}

interface CatalogInstantiationBaseOptions {
  moduleId: string;
  modulePosition: BfnCanvasPosition;
  inputPortId?: string;
  outputPortId?: string;
  modelId?: string;
  validityDomainId?: string;
}

export type CatalogInstantiationOptions = CatalogInstantiationBaseOptions &
  (
    | { createInputSource: false }
    | {
        createInputSource: true;
        inputSourceId: string;
        inputSourcePosition: BfnCanvasPosition;
        inputSourceOutputPortId?: string;
      }
  );

export type BfnCatalogInstantiationConflictKind =
  'module_id' | 'input_source_id' | 'port_id' | 'model_id' | 'validity_domain_id';

export type BfnCatalogInstantiationResult =
  | {
      ok: true;
      nextProject: BfnProject;
      addedModuleId: string;
      addedInputSourceId?: string;
      inputResolution: BfnCatalogInputResolution;
    }
  | {
      ok: false;
      error:
        | { code: 'catalog_candidate_invalid' }
        | {
            code: 'catalog_id_conflict';
            kind: BfnCatalogInstantiationConflictKind;
            id: string;
          };
    };

function allNodeIds(project: BfnProject): Set<string> {
  return new Set([
    ...project.network.inputSources.map((node) => node.id),
    ...project.network.modules.map((node) => node.id),
    ...project.network.outputMonitors.map((node) => node.id),
  ]);
}

function allPortIds(project: BfnProject): Set<string> {
  return new Set([
    ...project.network.inputSources.map((node) => node.outputPort.id),
    ...project.network.modules.flatMap((node) => [
      ...node.inputPorts.map((port) => port.id),
      ...node.outputPorts.map((port) => port.id),
    ]),
    ...project.network.outputMonitors.map((node) => node.inputPort.id),
  ]);
}

function conflict(
  kind: BfnCatalogInstantiationConflictKind,
  id: string,
): BfnCatalogInstantiationResult {
  return { ok: false, error: { code: 'catalog_id_conflict', kind, id } };
}

export function instantiateCatalogResponseInBfnProject(
  project: BfnProject,
  candidate: BfnCatalogRuntimeCandidate,
  options: CatalogInstantiationOptions,
): BfnCatalogInstantiationResult {
  if (!isTrustedBfnCatalogRuntimeCandidate(candidate)) {
    return { ok: false, error: { code: 'catalog_candidate_invalid' } };
  }
  const inputPortId = options.inputPortId ?? `${options.moduleId}:input:catalog`;
  const outputPortId = options.outputPortId ?? `${options.moduleId}:output:catalog`;
  const modelId = options.modelId ?? `${options.moduleId}:model:static`;
  const validityDomainId = options.validityDomainId ?? `${options.moduleId}:domain:catalog`;
  const inputSourceOutputPortId = options.createInputSource
    ? (options.inputSourceOutputPortId ?? `${options.inputSourceId}:output:catalog`)
    : null;
  const nodeIds = allNodeIds(project);
  if (nodeIds.has(options.moduleId)) return conflict('module_id', options.moduleId);
  if (
    options.createInputSource &&
    (nodeIds.has(options.inputSourceId) || options.inputSourceId === options.moduleId)
  ) {
    return conflict('input_source_id', options.inputSourceId);
  }
  const newPortIds = [inputPortId, outputPortId];
  if (inputSourceOutputPortId !== null) newPortIds.push(inputSourceOutputPortId);
  const portIds = allPortIds(project);
  const duplicateNewPort = newPortIds.find((id, index) => newPortIds.indexOf(id) !== index);
  const conflictingPort = newPortIds.find((id) => portIds.has(id)) ?? duplicateNewPort;
  if (conflictingPort !== undefined) return conflict('port_id', conflictingPort);
  if (
    project.network.modules.some((module) =>
      module.modelVariants.some((model) => model.id === modelId),
    )
  ) {
    return conflict('model_id', modelId);
  }
  if (project.registry.validityDomains.some((domain) => domain.id === validityDomainId)) {
    return conflict('validity_domain_id', validityDomainId);
  }

  const inputPort: BfnPort = {
    id: inputPortId,
    entity: candidate.inputEntity,
    quantityType: 'concentration',
    unit: 'M',
    direction: 'input',
  };
  const outputPort: BfnPort = {
    id: outputPortId,
    entity: candidate.outputEntity,
    quantityType: 'expression_level',
    unit: 'dimensionless',
    direction: 'output',
  };
  const model: BfnStaticModel = {
    id: modelId,
    version: candidate.modelVersion,
    contextId: candidate.contextId,
    validityDomainId,
    sourceDatasetIds: [],
    evidenceGrade: 'fitted_from_published_data',
    isDemo: true,
    catalogReference: structuredClone(candidate.catalogReference),
    mode: 'static',
    family: 'hill_activation',
    response: buildBfnCatalogStaticResponse(candidate, inputPortId),
    uncertaintyMethod: 'parameter_interval_envelope',
  };
  const module: BfnFunctionalModule = {
    kind: 'functional_module',
    id: options.moduleId,
    labelKey: CATALOG_MODULE_LABEL_KEY,
    descriptionKey: CATALOG_MODULE_DESCRIPTION_KEY,
    inputPorts: [inputPort],
    outputPorts: [outputPort],
    modelVariants: [model],
    activeModelIds: { static: modelId },
    implementationIds: [],
    evidenceGrade: 'fitted_from_published_data',
    position: { ...options.modulePosition },
    isDemo: true,
  };
  const range = candidate.catalogReference.sourceParameters.workingRange;
  const domain: BfnValidityDomain = {
    id: validityDomainId,
    labelKey: CATALOG_DOMAIN_LABEL_KEY,
    inputRanges: [
      {
        portId: inputPortId,
        minimum: range.min,
        maximum: range.max,
        unit: 'M',
      },
    ],
    contextId: candidate.contextId,
  };
  const inputResolution = findCompatibleBfnSignalSources(project, inputPort);
  const inputSource =
    options.createInputSource && inputSourceOutputPortId !== null
      ? createBfnInputSourceForCatalogResponse(candidate, {
          inputSourceId: options.inputSourceId,
          outputPortId: inputSourceOutputPortId,
          position: options.inputSourcePosition,
        })
      : null;
  const nextProject: BfnProject = {
    ...project,
    network: {
      ...project.network,
      inputSources:
        inputSource === null
          ? [...project.network.inputSources]
          : [...project.network.inputSources, inputSource],
      modules: [...project.network.modules, module],
      outputMonitors: [...project.network.outputMonitors],
      edges: [...project.network.edges],
    },
    registry: {
      ...project.registry,
      contexts: [...project.registry.contexts],
      validityDomains: [...project.registry.validityDomains, domain],
      datasets: [...project.registry.datasets],
      implementations: [...project.registry.implementations],
      calibrationMaps: [...project.registry.calibrationMaps],
    },
  };
  return {
    ok: true,
    nextProject,
    addedModuleId: module.id,
    ...(inputSource === null ? {} : { addedInputSourceId: inputSource.id }),
    inputResolution,
  };
}
