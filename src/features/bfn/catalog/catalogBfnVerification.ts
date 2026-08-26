import {
  buildReceiverResponseBinding,
  isTrustedReceiverResponseBinding,
} from '../../modeling/receiverResponseEvaluator';
import { getTrustedAhlHslCatalogRelease } from '../../modeling/catalog/v2/catalogReleaseLoader';
import type { BfnFunctionalModule, BfnModelVariant, BfnProject } from '../types';
import {
  buildBfnCatalogRuntimeCandidate,
  buildBfnCatalogStaticResponse,
} from './catalogBfnAdapter';
import {
  BFN_CATALOG_OUTPUT_ENTITY,
  BfnCatalogContractError,
  bfnCatalogReferencePresence,
  isBfnCatalogModelReference,
  type VerifiedBfnCatalogModel,
} from './catalogBfnTypes';

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

function mismatch(subjectId: string): never {
  throw new BfnCatalogContractError('catalog_model_mismatch', { subjectId });
}

export function verifyBfnCatalogModel(
  project: BfnProject,
  module: BfnFunctionalModule,
  model: BfnModelVariant,
): VerifiedBfnCatalogModel {
  const presence = bfnCatalogReferencePresence(model);
  if (!presence.present || !isBfnCatalogModelReference(presence.value)) {
    throw new BfnCatalogContractError('catalog_model_reference_invalid', {
      subjectId: model.id,
    });
  }
  const catalogReference = presence.value;
  const trusted = getTrustedAhlHslCatalogRelease();
  const manifest = trusted.catalog.releaseManifest;
  if (
    catalogReference.catalogId !== manifest.catalogId ||
    catalogReference.releaseId !== manifest.releaseId ||
    catalogReference.releaseVersion !== manifest.releaseVersion
  ) {
    throw new BfnCatalogContractError('catalog_release_unavailable', {
      subjectId: model.id,
    });
  }

  let candidate;
  try {
    candidate = buildBfnCatalogRuntimeCandidate(catalogReference.responseId);
  } catch {
    throw new BfnCatalogContractError('catalog_execution_unavailable', {
      subjectId: model.id,
    });
  }
  if (!deepEqual(catalogReference, candidate.catalogReference)) return mismatch(model.id);

  let binding;
  try {
    binding = buildReceiverResponseBinding(trusted.catalog, catalogReference.responseId);
  } catch {
    throw new BfnCatalogContractError('catalog_execution_unavailable', {
      subjectId: model.id,
    });
  }
  if (!isTrustedReceiverResponseBinding(binding)) {
    throw new BfnCatalogContractError('catalog_execution_unavailable', {
      subjectId: model.id,
    });
  }

  if (
    model.mode !== 'static' ||
    model.family !== 'hill_activation' ||
    model.version !== candidate.modelVersion ||
    model.contextId !== candidate.contextId ||
    !Array.isArray(model.sourceDatasetIds) ||
    model.sourceDatasetIds.length !== 0 ||
    model.evidenceGrade !== 'fitted_from_published_data' ||
    model.isDemo !== true ||
    model.uncertaintyMethod !== 'parameter_interval_envelope' ||
    !isRecord(module.activeModelIds) ||
    module.activeModelIds.static !== model.id ||
    !Array.isArray(module.implementationIds) ||
    module.implementationIds.length !== 0 ||
    module.evidenceGrade !== 'fitted_from_published_data' ||
    module.isDemo !== true ||
    !Array.isArray(module.inputPorts) ||
    module.inputPorts.length !== 1 ||
    !Array.isArray(module.outputPorts) ||
    module.outputPorts.length !== 1 ||
    !Array.isArray(module.modelVariants)
  ) {
    return mismatch(model.id);
  }
  const moduleModel = module.modelVariants.filter(
    (candidateModel) => candidateModel.id === model.id && candidateModel.mode === model.mode,
  );
  if (moduleModel.length !== 1 || !deepEqual(moduleModel[0], model)) return mismatch(model.id);

  const inputPort = module.inputPorts[0];
  const outputPort = module.outputPorts[0];
  if (
    inputPort === undefined ||
    outputPort === undefined ||
    inputPort.entity !== candidate.inputEntity ||
    inputPort.quantityType !== 'concentration' ||
    inputPort.unit !== 'M' ||
    inputPort.direction !== 'input' ||
    outputPort.entity !== BFN_CATALOG_OUTPUT_ENTITY ||
    outputPort.quantityType !== 'expression_level' ||
    outputPort.unit !== 'dimensionless' ||
    outputPort.direction !== 'output'
  ) {
    return mismatch(model.id);
  }
  const expectedResponse = buildBfnCatalogStaticResponse(candidate, inputPort.id);
  if (!deepEqual(model.response, expectedResponse)) return mismatch(model.id);

  const domains = project.registry.validityDomains.filter(
    (domain) => domain.id === model.validityDomainId,
  );
  const domain = domains[0];
  const range = Array.isArray(domain?.inputRanges) ? domain.inputRanges[0] : undefined;
  const expectedRange = candidate.catalogReference.sourceParameters.workingRange;
  if (
    domains.length !== 1 ||
    domain === undefined ||
    domain.contextId !== candidate.contextId ||
    !Array.isArray(domain.inputRanges) ||
    domain.inputRanges.length !== 1 ||
    domain.timeRangeHours !== undefined ||
    range === undefined ||
    range.portId !== inputPort.id ||
    range.minimum !== expectedRange.min ||
    range.maximum !== expectedRange.max ||
    range.unit !== 'M'
  ) {
    return mismatch(model.id);
  }

  return { candidate, catalogReference, binding, domain };
}
