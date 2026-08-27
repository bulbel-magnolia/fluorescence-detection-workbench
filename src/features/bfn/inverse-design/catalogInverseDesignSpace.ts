import {
  buildReceiverResponseBinding,
  isTrustedReceiverResponseBinding,
} from '../../modeling/receiverResponseEvaluator';
import {
  buildReleaseCatalogPresentation,
  isTrustedReleaseCatalogPresentation,
  type ReleaseCatalogPresentation,
  type ReleaseResponseVariantView,
} from '../../modeling/catalog/releaseCatalogPresentation';
import {
  isTrustedLoadedCatalogRelease,
  loadAhlHslCatalogRelease,
  type LoadedCatalogRelease,
} from '../../modeling/catalog/v2/catalogReleaseLoader';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import type { ComponentCatalogV2 } from '../../modeling/catalog/v2/catalogTypes';
import type { ReceiverResponseBinding } from '../../modeling/types';
import {
  buildBfnCatalogRuntimeCandidate,
  isTrustedBfnCatalogRuntimeCandidate,
} from '../catalog/catalogBfnAdapter';
import type { BfnCatalogRuntimeCandidate } from '../catalog/catalogBfnTypes';
import type {
  BfnCatalogInverseCandidate,
  BfnCatalogInverseContextOption,
  BfnCatalogInverseSearchSpace,
  BfnCatalogInverseSignalOption,
  BfnCatalogInverseSignalProfile,
  BfnCatalogInverseWorkingRange,
} from './catalogInverseDesignTypes';

export interface CatalogInverseRuntimeAdapter {
  readonly responseIds: readonly string[];
  loadRelease(): LoadedCatalogRelease;
  isTrustedLoadedRelease(value: unknown): value is LoadedCatalogRelease;
  buildPresentation(loaded: LoadedCatalogRelease): ReleaseCatalogPresentation;
  isTrustedPresentation(value: unknown): value is ReleaseCatalogPresentation;
  buildRuntimeCandidate(responseId: string): BfnCatalogRuntimeCandidate;
  isTrustedRuntimeCandidate(value: unknown): value is BfnCatalogRuntimeCandidate;
  buildBinding(catalog: ComponentCatalogV2, responseId: string): ReceiverResponseBinding;
  isTrustedBinding(value: unknown): value is ReceiverResponseBinding;
}

export const defaultCatalogInverseRuntimeAdapter: CatalogInverseRuntimeAdapter = Object.freeze({
  responseIds: Object.freeze(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.map((entry) => entry.id)),
  loadRelease: loadAhlHslCatalogRelease,
  isTrustedLoadedRelease: isTrustedLoadedCatalogRelease,
  buildPresentation: buildReleaseCatalogPresentation,
  isTrustedPresentation: isTrustedReleaseCatalogPresentation,
  buildRuntimeCandidate: buildBfnCatalogRuntimeCandidate,
  isTrustedRuntimeCandidate: isTrustedBfnCatalogRuntimeCandidate,
  buildBinding: buildReceiverResponseBinding,
  isTrustedBinding: isTrustedReceiverResponseBinding,
});

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function byCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNullableText(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return byCodePoint(left, right);
}

function validWorkingRange(binding: ReceiverResponseBinding): boolean {
  return (
    Number.isFinite(binding.workingRange.min) &&
    Number.isFinite(binding.workingRange.max) &&
    binding.workingRange.min >= 0 &&
    binding.workingRange.max > 0 &&
    binding.workingRange.min <= binding.workingRange.max
  );
}

function responseMatchesTrustedPaths(
  loaded: LoadedCatalogRelease,
  presentation: ReleaseCatalogPresentation,
  response: ReleaseResponseVariantView,
  runtimeCandidate: BfnCatalogRuntimeCandidate,
  binding: ReceiverResponseBinding,
): boolean {
  const reference = runtimeCandidate.catalogReference;
  const source = response.response.sourceResponse;
  const manifest = loaded.catalog.releaseManifest;
  const component = presentation.components.find((entry) => entry.id === response.componentId);
  const signal = presentation.signals.find((entry) => entry.id === response.inputMolecule.id);
  const context = presentation.parameterContexts.find(
    (entry) => entry.id === response.parameterContext.id,
  );
  if (
    response.usageStatus !== 'runtime-demo' ||
    response.runnable !== true ||
    response.response.admission.status !== 'runtime-demo' ||
    component?.role !== 'receiver' ||
    signal === undefined ||
    context === undefined ||
    source === undefined ||
    runtimeCandidate.responseId !== response.id ||
    reference.responseId !== response.id ||
    binding.receiverResponseId !== response.id ||
    reference.catalogId !== manifest.catalogId ||
    binding.catalogId !== manifest.catalogId ||
    reference.releaseId !== manifest.releaseId ||
    binding.releaseId !== manifest.releaseId ||
    reference.releaseVersion !== manifest.releaseVersion ||
    binding.releaseVersion !== manifest.releaseVersion ||
    reference.componentId !== response.componentId ||
    binding.componentId !== response.componentId ||
    response.response.receiverComponentId !== response.componentId ||
    reference.inputSignalId !== response.inputMolecule.id ||
    binding.inputSignalId !== response.inputMolecule.id ||
    response.response.inputSignalId !== response.inputMolecule.id ||
    reference.outputSignalId !== response.response.outputSignalId ||
    binding.outputSignalId !== response.response.outputSignalId ||
    reference.parameterContextId !== response.parameterContext.id ||
    binding.parameterContextId !== response.parameterContext.id ||
    response.response.parameterContextId !== response.parameterContext.id ||
    !sameStrings(reference.sourceIds, response.response.sourceIds) ||
    !sameStrings(binding.sourceIds, response.response.sourceIds) ||
    !sameStrings(
      response.sources.map((entry) => entry.id),
      response.response.sourceIds,
    ) ||
    reference.biologicalDirection !== binding.direction ||
    reference.biologicalDirection !== source.direction ||
    reference.runtimeImplementation !== binding.demoImplementation ||
    reference.runtimeImplementation !== source.demoImplementation ||
    reference.sourceModelType !== binding.modelType ||
    reference.sourceModelType !== source.modelType ||
    source.softwareStatus !== 'runtime-demo' ||
    source.numericalExecutionAllowed !== true ||
    source.normalizedDemoOnly !== true ||
    source.fixedWeightCandidate !== false ||
    binding.softwareStatus !== 'runtime-demo' ||
    binding.numericalExecutionAllowed !== true ||
    binding.normalizedDemoOnly !== true ||
    binding.fixedWeightCandidate !== false ||
    !validWorkingRange(binding)
  ) {
    return false;
  }

  const parameters = reference.sourceParameters;
  return (
    parameters.ec50 === binding.originalParameters.ec50 &&
    parameters.ec50 === source.ec50 &&
    parameters.ec50Unit === 'M' &&
    binding.originalParameters.ec50Unit === 'M' &&
    source.ec50Unit === 'M' &&
    parameters.hillCoefficient === binding.originalParameters.hillCoefficient &&
    parameters.hillCoefficient === source.hillCoefficient &&
    parameters.basal === binding.originalParameters.basal &&
    parameters.basal === source.basal &&
    parameters.maximum === binding.originalParameters.maximum &&
    parameters.maximum === source.maximum &&
    parameters.workingRange.unit === 'M' &&
    parameters.workingRange.min === binding.workingRange.min &&
    parameters.workingRange.min === source.workingRange?.min &&
    parameters.workingRange.max === binding.workingRange.max &&
    parameters.workingRange.max === source.workingRange?.max
  );
}

function admitCandidate(
  loaded: LoadedCatalogRelease,
  presentation: ReleaseCatalogPresentation,
  responseId: string,
  adapter: CatalogInverseRuntimeAdapter,
): BfnCatalogInverseCandidate {
  const response = presentation.responseVariants.find((entry) => entry.id === responseId);
  if (response === undefined) throw new Error('CATALOG_INVERSE_RESPONSE_UNAVAILABLE');

  const runtimeCandidate = adapter.buildRuntimeCandidate(responseId);
  if (
    runtimeCandidate.responseId !== responseId ||
    !isTrustedBfnCatalogRuntimeCandidate(runtimeCandidate) ||
    !adapter.isTrustedRuntimeCandidate(runtimeCandidate)
  ) {
    throw new Error('CATALOG_INVERSE_RUNTIME_CANDIDATE_UNTRUSTED');
  }

  const binding = adapter.buildBinding(loaded.catalog, responseId);
  if (
    binding.receiverResponseId !== responseId ||
    !isTrustedReceiverResponseBinding(binding) ||
    !adapter.isTrustedBinding(binding) ||
    !responseMatchesTrustedPaths(loaded, presentation, response, runtimeCandidate, binding)
  ) {
    throw new Error('CATALOG_INVERSE_BINDING_UNTRUSTED');
  }

  const reference = runtimeCandidate.catalogReference;
  return deepFreeze({
    responseId,
    componentId: reference.componentId,
    inputSignalId: reference.inputSignalId,
    parameterContextId: reference.parameterContextId,
    sourceIds: [...reference.sourceIds],
    biologicalDirection: reference.biologicalDirection,
    context: {
      hostSpecies: response.parameterContext.hostSpecies,
      hostStrain: response.parameterContext.hostStrain,
    },
    model: {
      ec50M: reference.sourceParameters.ec50,
      hillCoefficient: reference.sourceParameters.hillCoefficient,
      workingRangeM: {
        minimum: reference.sourceParameters.workingRange.min,
        maximum: reference.sourceParameters.workingRange.max,
      },
    },
    binding,
  });
}

function buildSignalOptions(
  candidates: readonly BfnCatalogInverseCandidate[],
): readonly BfnCatalogInverseSignalOption[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    counts.set(candidate.inputSignalId, (counts.get(candidate.inputSignalId) ?? 0) + 1);
  }
  return deepFreeze(
    [...counts]
      .sort(([left], [right]) => byCodePoint(left, right))
      .map(([signalId, responseCount]) => ({ signalId, responseCount })),
  );
}

function contextKey(
  signalId: string,
  hostSpecies: string | null,
  hostStrain: string | null,
): string {
  return JSON.stringify([signalId, hostSpecies, hostStrain]);
}

function buildContextOptions(
  candidates: readonly BfnCatalogInverseCandidate[],
): readonly BfnCatalogInverseContextOption[] {
  const options = new Map<string, BfnCatalogInverseContextOption>();
  for (const candidate of candidates) {
    const key = contextKey(
      candidate.inputSignalId,
      candidate.context.hostSpecies,
      candidate.context.hostStrain,
    );
    const previous = options.get(key);
    options.set(key, {
      signalId: candidate.inputSignalId,
      hostSpecies: candidate.context.hostSpecies,
      hostStrain: candidate.context.hostStrain,
      candidateCount: (previous?.candidateCount ?? 0) + 1,
    });
  }
  return deepFreeze(
    [...options.values()].sort(
      (left, right) =>
        byCodePoint(left.signalId, right.signalId) ||
        compareNullableText(left.hostSpecies, right.hostSpecies) ||
        compareNullableText(left.hostStrain, right.hostStrain),
    ),
  );
}

export function buildCatalogInverseSearchSpace(
  adapter: CatalogInverseRuntimeAdapter = defaultCatalogInverseRuntimeAdapter,
): BfnCatalogInverseSearchSpace {
  const loaded = adapter.loadRelease();
  if (!isTrustedLoadedCatalogRelease(loaded) || !adapter.isTrustedLoadedRelease(loaded)) {
    throw new Error('CATALOG_INVERSE_RELEASE_UNTRUSTED');
  }
  const presentation = adapter.buildPresentation(loaded);
  if (
    !isTrustedReleaseCatalogPresentation(presentation) ||
    !adapter.isTrustedPresentation(presentation)
  ) {
    throw new Error('CATALOG_INVERSE_PRESENTATION_UNTRUSTED');
  }

  const candidates: BfnCatalogInverseCandidate[] = [];
  const unavailableResponseIds: string[] = [];
  for (const responseId of adapter.responseIds) {
    try {
      candidates.push(admitCandidate(loaded, presentation, responseId, adapter));
    } catch {
      unavailableResponseIds.push(responseId);
    }
  }

  const manifest = loaded.catalog.releaseManifest;
  return deepFreeze({
    release: {
      catalogId: manifest.catalogId,
      releaseId: manifest.releaseId,
      releaseVersion: manifest.releaseVersion,
    },
    candidates,
    searchableSignals: buildSignalOptions(candidates),
    contextOptions: buildContextOptions(candidates),
    unavailableResponseIds,
  });
}

export function listSearchableCatalogSignals(
  searchSpace: BfnCatalogInverseSearchSpace = buildCatalogInverseSearchSpace(),
): readonly BfnCatalogInverseSignalOption[] {
  return searchSpace.searchableSignals;
}

export function computeCommonTrustedRange(
  searchSpace: BfnCatalogInverseSearchSpace,
  signalId: string,
): BfnCatalogInverseWorkingRange | null {
  const candidates = searchSpace.candidates.filter(
    (candidate) => candidate.inputSignalId === signalId,
  );
  if (candidates.length === 0) return null;
  const minimum = Math.max(...candidates.map((candidate) => candidate.model.workingRangeM.minimum));
  const maximum = Math.min(...candidates.map((candidate) => candidate.model.workingRangeM.maximum));
  return minimum <= maximum ? deepFreeze({ minimum, maximum }) : null;
}

export function countCandidatesCoveringTargetRange(
  searchSpace: BfnCatalogInverseSearchSpace,
  signalId: string,
  targetRangeM: BfnCatalogInverseWorkingRange,
): number {
  if (
    !Number.isFinite(targetRangeM.minimum) ||
    !Number.isFinite(targetRangeM.maximum) ||
    targetRangeM.minimum <= 0 ||
    targetRangeM.maximum <= targetRangeM.minimum
  ) {
    return 0;
  }
  return searchSpace.candidates.filter(
    (candidate) =>
      candidate.inputSignalId === signalId &&
      candidate.model.workingRangeM.minimum <= targetRangeM.minimum &&
      targetRangeM.maximum <= candidate.model.workingRangeM.maximum,
  ).length;
}

export function listCatalogInverseContextOptions(
  searchSpace: BfnCatalogInverseSearchSpace,
  signalId: string,
): readonly BfnCatalogInverseContextOption[] {
  return deepFreeze(searchSpace.contextOptions.filter((option) => option.signalId === signalId));
}

export function listCatalogInverseSignalProfiles(
  searchSpace: BfnCatalogInverseSearchSpace = buildCatalogInverseSearchSpace(),
): readonly BfnCatalogInverseSignalProfile[] {
  return deepFreeze(
    searchSpace.searchableSignals.map((signal) => ({
      signalId: signal.signalId,
      candidateCount: signal.responseCount,
      commonTrustedRangeM: computeCommonTrustedRange(searchSpace, signal.signalId),
    })),
  );
}
