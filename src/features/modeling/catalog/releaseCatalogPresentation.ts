import type { LiteratureCandidateReference } from './catalogTypes';
import {
  isTrustedLoadedCatalogRelease,
  loadAhlHslCatalogRelease,
  type LoadedCatalogRelease,
} from './v2/catalogReleaseLoader';
import { buildReceiverResponseBinding } from '../receiverResponseEvaluator';
import type {
  CatalogV2AdmissionStatus,
  CatalogV2CompatibilityRelation,
  CatalogV2Component,
  CatalogV2EffectivePair,
  CatalogV2ParameterContext,
  CatalogV2ReceiverResponse,
  CatalogV2Signal,
  CatalogV2Source,
  ComponentCatalogV2,
} from './v2/catalogTypes';
import type { AhlHslComponentCatalogRelease, AhlHslSequenceMetadata } from './v2/releaseTypes';

export type ReleaseCatalogLanguage = 'zh-CN' | 'en-US';

export type ReleaseCatalogUsageStatus =
  'runtime-demo' | 'calibration-candidate' | 'compatibility-only' | 'reference-only';

export interface ReleaseCatalogLocalizedName {
  en: string;
  zh: string;
}

export interface ReleaseSignalView {
  id: string;
  names: ReleaseCatalogLocalizedName;
  canonicalName: string;
  abbreviations: readonly string[];
  signalClass: string;
  chemicalIdentityStatus: string;
  canonical: CatalogV2Signal;
}

export interface ReleaseSourceView {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  primaryUrl: string | null;
  canonical: CatalogV2Source;
}

export interface ReleaseParameterContextView {
  id: string;
  hostSpecies: string | null;
  hostStrain: string | null;
  measurementUnit: string | null;
  canonical: CatalogV2ParameterContext;
}

export interface ReleaseResponseVariantView {
  id: string;
  componentId: string;
  usageStatus: ReleaseCatalogUsageStatus;
  runnable: boolean;
  inputMolecule: ReleaseSignalView;
  outputMolecule: ReleaseSignalView | null;
  parameterContext: ReleaseParameterContextView;
  sources: readonly ReleaseSourceView[];
  response: CatalogV2ReceiverResponse;
}

export interface ReleaseObservedPairView {
  id: string;
  senderComponentId: string | null;
  receiverComponentId: string | null;
  parameterContextId: string | null;
  observedEffect: string;
  responseClass: string;
  decompositionProhibited: true;
  sources: readonly ReleaseSourceView[];
  pair: CatalogV2EffectivePair;
}

export interface ReleaseCompatibilityView {
  id: string;
  subjectComponentId: string | null;
  targetComponentId: string | null;
  inputMolecule: ReleaseSignalView | null;
  parameterContext: ReleaseParameterContextView;
  qualitativeOutcome: string;
  relationType: string;
  numericUseAllowed: false;
  sources: readonly ReleaseSourceView[];
  relation: CatalogV2CompatibilityRelation;
}

export interface ReleaseComponentView {
  id: string;
  names: ReleaseCatalogLocalizedName;
  aliases: readonly string[];
  role: 'receiver' | 'sender';
  usageStatus: ReleaseCatalogUsageStatus;
  hostSpecies: string | null;
  hostStrain: string | null;
  sequenceStatus: string;
  sequenceReference: string | null;
  sequenceMetadata: AhlHslSequenceMetadata | null;
  evidenceGaps: readonly string[];
  inputPortDescription: string | null;
  outputPortDescription: string | null;
  regulatorOrEnzyme: string | null;
  promoter: string | null;
  reporter: string | null;
  simulationReady: boolean;
  constructionReady: boolean;
  inputMolecules: readonly ReleaseSignalView[];
  outputMolecules: readonly ReleaseSignalView[];
  parameterContexts: readonly ReleaseParameterContextView[];
  sources: readonly ReleaseSourceView[];
  responseVariants: readonly ReleaseResponseVariantView[];
  observedPairs: readonly ReleaseObservedPairView[];
  compatibilityRelations: readonly ReleaseCompatibilityView[];
  component: CatalogV2Component;
  searchTerms: readonly string[];
}

export interface ReleaseCatalogPresentation {
  release: AhlHslComponentCatalogRelease;
  catalog: ComponentCatalogV2;
  components: readonly ReleaseComponentView[];
  signals: readonly ReleaseSignalView[];
  parameterContexts: readonly ReleaseParameterContextView[];
  responseVariants: readonly ReleaseResponseVariantView[];
  observedPairs: readonly ReleaseObservedPairView[];
  compatibilityRelations: readonly ReleaseCompatibilityView[];
  sources: readonly ReleaseSourceView[];
  warnings: LoadedCatalogRelease['warnings'];
}

export interface ReleaseCatalogFilters {
  query?: string;
  usageStatus?: ReleaseCatalogUsageStatus | 'all';
  inputMolecule?: string;
  host?: string;
}

export interface ReleaseCatalogFilterOptions {
  usageStatuses: readonly ReleaseCatalogUsageStatus[];
  inputMolecules: readonly ReleaseSignalView[];
  hosts: readonly string[];
}

export const RELEASE_CATALOG_USAGE_STATUSES: readonly ReleaseCatalogUsageStatus[] = Object.freeze([
  'runtime-demo',
  'calibration-candidate',
  'compatibility-only',
  'reference-only',
]);

const RELEASE_CATALOG_ID = 'ahl-hsl-component-database';
const RELEASE_ID = 'ahl-hsl-component-database-v1.1';
const RELEASE_VERSION = '1.1';

let cachedPresentation: ReleaseCatalogPresentation | undefined;

export function loadReleaseCatalogPresentation(): ReleaseCatalogPresentation {
  if (cachedPresentation === undefined)
    cachedPresentation = buildReleaseCatalogPresentation(loadAhlHslCatalogRelease());
  return cachedPresentation;
}

export function buildReleaseCatalogPresentation(
  loaded: LoadedCatalogRelease,
): ReleaseCatalogPresentation {
  assertReleaseIdentity(loaded);
  const { release, catalog } = loaded;

  const canonicalSignals = byId(catalog.signals);
  const signalViews = release.signals.map((signal) => ({
    id: signal.id,
    names: {
      en: signal.display_name_en,
      zh: signal.display_name_zh,
    },
    canonicalName: signal.canonical_name,
    abbreviations: [...signal.common_abbreviations],
    signalClass: signal.signal_class,
    chemicalIdentityStatus: signal.chemical_identity_status,
    canonical: required(canonicalSignals, signal.id, 'signal'),
  }));
  const signalViewsById = byId(signalViews);

  const canonicalSources = byId(catalog.sources);
  const sourceViews = release.sources.map((source) => ({
    id: source.source_id,
    title: source.title,
    authors: source.authors,
    year: source.year ?? source.publication_year,
    doi: source.doi,
    pmid: source.pmid,
    pmcid: source.pmcid,
    primaryUrl: source.primary_url,
    canonical: required(canonicalSources, source.source_id, 'source'),
  }));
  const sourceViewsById = byId(sourceViews);

  const canonicalContexts = byId(catalog.parameterContexts);
  const contextViews = release.parameter_contexts.map((context) => ({
    id: context.id,
    hostSpecies: context.host_species,
    hostStrain: context.host_strain,
    measurementUnit: context.measurement_unit,
    canonical: required(canonicalContexts, context.id, 'parameter context'),
  }));
  const contextViewsById = byId(contextViews);

  const responseViews = catalog.receiverResponses.map((response) => {
    return {
      id: response.id,
      componentId: response.receiverComponentId,
      usageStatus: releaseUsageStatus(response.admission.status),
      runnable: isCanonicalRunnableReleaseResponse(catalog, response),
      inputMolecule: required(signalViewsById, response.inputSignalId, 'input signal'),
      outputMolecule:
        response.outputSignalId === null
          ? null
          : required(signalViewsById, response.outputSignalId, 'output signal'),
      parameterContext: required(
        contextViewsById,
        response.parameterContextId,
        'parameter context',
      ),
      sources: response.sourceIds.map((sourceId) => required(sourceViewsById, sourceId, 'source')),
      response,
    };
  });

  const pairViews = catalog.effectivePairs.map((pair) => {
    const observed = pair.observed;
    if (observed === undefined || observed.decompositionProhibited !== true)
      throw new Error('RELEASE_EFFECTIVE_PAIR_BOUNDARY_INVALID:' + pair.id);
    return {
      id: pair.id,
      senderComponentId: pair.senderComponentId,
      receiverComponentId: pair.receiverComponentId,
      parameterContextId: pair.parameterContextId,
      observedEffect: observed.observedEffect,
      responseClass: observed.responseClass,
      decompositionProhibited: true as const,
      sources: pair.sourceIds.map((sourceId) => required(sourceViewsById, sourceId, 'source')),
      pair,
    };
  });

  const compatibilityViews = catalog.compatibilityRelations.map((relation) => {
    if (relation.numericUseAllowed !== false)
      throw new Error('RELEASE_COMPATIBILITY_NUMERIC_BOUNDARY_INVALID:' + relation.id);
    return {
      id: relation.id,
      subjectComponentId: relation.subjectComponentId ?? relation.receiverComponentId,
      targetComponentId: relation.targetComponentId ?? relation.senderComponentId,
      inputMolecule:
        relation.inputSignalId === null || relation.inputSignalId === undefined
          ? null
          : required(signalViewsById, relation.inputSignalId, 'input signal'),
      parameterContext: required(
        contextViewsById,
        relation.parameterContextId,
        'parameter context',
      ),
      qualitativeOutcome: relation.qualitativeOutcome ?? '',
      relationType: relation.relationType ?? relation.kind,
      numericUseAllowed: false as const,
      sources: relation.sourceIds.map((sourceId) => required(sourceViewsById, sourceId, 'source')),
      relation,
    };
  });

  const rawComponents = byId(release.components);
  const responseViewsByComponent = groupBy(responseViews, (view) => view.componentId);
  const componentViews = catalog.components.map((component) => {
    const raw = required(rawComponents, component.id, 'component');
    const responses = responseViewsByComponent.get(component.id) ?? [];
    const pairs = pairViews.filter(
      (pair) =>
        pair.senderComponentId === component.id || pair.receiverComponentId === component.id,
    );
    const compatibility = compatibilityViews.filter(
      (relation) =>
        relation.subjectComponentId === component.id || relation.targetComponentId === component.id,
    );
    const inputMolecules = uniqueViews(responses.map((response) => response.inputMolecule));
    const outputMolecules = component.outputSignalIds.map((signalId) =>
      required(signalViewsById, signalId, 'output signal'),
    );
    const contextIds = unique([
      ...component.parameterContextIds,
      ...responses.map((response) => response.parameterContext.id),
    ]);
    const sourceIds = unique([
      ...component.sourceIds,
      ...responses.flatMap((response) => response.sources.map((source) => source.id)),
      ...pairs.flatMap((pair) => pair.sources.map((source) => source.id)),
      ...compatibility.flatMap((relation) => relation.sources.map((source) => source.id)),
    ]);
    const aliases = unique(
      compact([raw.regulator_or_enzyme, raw.promoter, raw.reporter, ...component.mechanismLabels]),
    );
    const sources = sourceIds.map((sourceId) => required(sourceViewsById, sourceId, 'source'));
    const parameterContexts = contextIds.map((contextId) =>
      required(contextViewsById, contextId, 'parameter context'),
    );
    const usageStatus = releaseUsageStatus(component.admission.status);
    const view: ReleaseComponentView = {
      id: component.id,
      names: {
        en: raw.display_name_en,
        zh: raw.display_name_zh,
      },
      aliases,
      role: raw.component_type === 'sender' ? 'sender' : 'receiver',
      usageStatus,
      hostSpecies: raw.host_species,
      hostStrain: raw.host_strain,
      sequenceStatus: raw.sequence_status,
      sequenceReference: raw.sequence_reference,
      sequenceMetadata: raw.sequence_metadata,
      evidenceGaps: [...raw.evidence_gap],
      inputPortDescription: raw.input_port,
      outputPortDescription: raw.output_port,
      regulatorOrEnzyme: raw.regulator_or_enzyme,
      promoter: raw.promoter,
      reporter: raw.reporter,
      simulationReady: raw.simulation_ready,
      constructionReady: raw.construction_ready,
      inputMolecules,
      outputMolecules,
      parameterContexts,
      sources,
      responseVariants: responses,
      observedPairs: pairs,
      compatibilityRelations: compatibility,
      component,
      searchTerms: [],
    };
    view.searchTerms = componentSearchTerms(view);
    return view;
  });

  return deepFreeze({
    release,
    catalog,
    components: componentViews,
    signals: signalViews,
    parameterContexts: contextViews,
    responseVariants: responseViews,
    observedPairs: pairViews,
    compatibilityRelations: compatibilityViews,
    sources: sourceViews,
    warnings: loaded.warnings,
  });
}

/** A presentation is trusted only when it is the bundled frozen presentation or an exact frozen clone. */
export function isTrustedReleaseCatalogPresentation(
  value: unknown,
): value is ReleaseCatalogPresentation {
  try {
    const trusted = loadReleaseCatalogPresentation();
    return value === trusted || (isDeepFrozen(value) && deepEqual(value, trusted));
  } catch {
    return false;
  }
}

export function isCanonicalRunnableReleaseResponse(
  catalog: ComponentCatalogV2,
  response: CatalogV2ReceiverResponse,
): boolean {
  if (
    catalog.releaseManifest.catalogId !== RELEASE_CATALOG_ID ||
    catalog.releaseManifest.releaseId !== RELEASE_ID ||
    catalog.releaseManifest.releaseVersion !== RELEASE_VERSION ||
    !catalog.receiverResponses.includes(response)
  )
    return false;
  try {
    // The trusted builder verifies source parameters, context, signal/source
    // references, model implementation, and all runtime flags against V1.1.
    buildReceiverResponseBinding(catalog, response.id);
    return response.admission.status === 'runtime-demo' && response.outputSignalId !== null;
  } catch {
    return false;
  }
}

export function filterReleaseCatalogComponents(
  presentation: ReleaseCatalogPresentation,
  filters: ReleaseCatalogFilters = {},
): readonly ReleaseComponentView[] {
  const queryTokens = normalized(filters.query ?? '')
    .split(/\s+/u)
    .filter(Boolean);
  const status = filters.usageStatus ?? 'all';
  const inputMolecule = filters.inputMolecule ?? 'all';
  const host = normalized(filters.host ?? 'all');
  const matches = presentation.components.filter((component) => {
    if (status !== 'all' && component.usageStatus !== status) return false;
    if (
      inputMolecule !== 'all' &&
      !component.inputMolecules.some((signal) => signal.id === inputMolecule)
    )
      return false;
    if (
      host !== 'all' &&
      ![component.hostSpecies, component.hostStrain]
        .filter((value): value is string => value !== null)
        .some((value) => normalized(value).includes(host))
    )
      return false;
    if (queryTokens.length === 0) return true;
    const haystack = normalized(component.searchTerms.join('\u001f'));
    return queryTokens.every((token) => haystack.includes(token));
  });
  return Object.freeze(matches);
}

export function getReleaseCatalogFilterOptions(
  presentation: ReleaseCatalogPresentation,
): ReleaseCatalogFilterOptions {
  const inputSignalIds = new Set(
    presentation.components.flatMap((component) =>
      component.inputMolecules.map((signal) => signal.id),
    ),
  );
  return Object.freeze({
    usageStatuses: RELEASE_CATALOG_USAGE_STATUSES,
    inputMolecules: Object.freeze(
      presentation.signals.filter((signal) => inputSignalIds.has(signal.id)),
    ),
    hosts: Object.freeze(
      unique(
        presentation.components
          .map((component) => component.hostSpecies)
          .filter((value): value is string => value !== null && value.trim().length > 0),
      ).sort((left, right) => left.localeCompare(right)),
    ),
  });
}

export function getReleaseComponentName(
  component: ReleaseComponentView,
  language: ReleaseCatalogLanguage,
): string {
  return language === 'zh-CN' ? component.names.zh : component.names.en;
}

export function getReleaseResponseNodeName(
  component: ReleaseComponentView,
  response: ReleaseResponseVariantView,
  language: ReleaseCatalogLanguage,
): string {
  const abbreviation = response.inputMolecule.abbreviations[0]?.trim();
  const inputName =
    abbreviation && abbreviation.length > 0
      ? abbreviation
      : language === 'zh-CN'
        ? response.inputMolecule.names.zh
        : response.inputMolecule.names.en;
  return inputName + ' · ' + getReleaseComponentName(component, language);
}

/** Function-first title used on the canvas and in compact catalog cards. */
export function getReleaseResponseFunctionTitle(
  component: ReleaseComponentView,
  response: ReleaseResponseVariantView,
  language: ReleaseCatalogLanguage,
): string {
  const abbreviation = response.inputMolecule.abbreviations[0]?.trim();
  const inputName =
    abbreviation && abbreviation.length > 0
      ? abbreviation
      : language === 'zh-CN'
        ? response.inputMolecule.names.zh
        : response.inputMolecule.names.en;
  return `${inputName} · ${getReleaseComponentName(component, language)}`;
}

export function getReleaseResponseRouteLabel(
  response: ReleaseResponseVariantView,
  language: ReleaseCatalogLanguage,
): string {
  const input =
    response.inputMolecule.abbreviations[0]?.trim() ||
    (language === 'zh-CN' ? response.inputMolecule.names.zh : response.inputMolecule.names.en);
  const output = response.outputMolecule
    ? response.outputMolecule.abbreviations[0]?.trim() ||
      (language === 'zh-CN' ? response.outputMolecule.names.zh : response.outputMolecule.names.en)
    : '—';
  return `${input} → ${output}`;
}

export function createReleaseComponentReference(
  presentation: ReleaseCatalogPresentation,
  component: ReleaseComponentView,
  language: ReleaseCatalogLanguage,
): LiteratureCandidateReference {
  if (
    !isTrustedReleaseCatalogPresentation(presentation) ||
    !presentation.components.includes(component)
  )
    throw new Error('RELEASE_COMPONENT_REFERENCE_NOT_CANONICAL');
  return {
    catalogId: presentation.catalog.releaseManifest.catalogId,
    catalogVersion: presentation.catalog.releaseManifest.releaseVersion,
    entryId: component.id,
    displayNameSnapshot: getReleaseComponentName(component, language),
    sourceStatus: 'passed',
    boundaryNote: referenceBoundary(
      presentation,
      component,
      component.sources.map((source) => source.id),
    ),
  };
}

export function createReleaseResponseReference(
  presentation: ReleaseCatalogPresentation,
  response: ReleaseResponseVariantView,
  language: ReleaseCatalogLanguage,
): LiteratureCandidateReference {
  if (
    !isTrustedReleaseCatalogPresentation(presentation) ||
    !presentation.responseVariants.includes(response)
  )
    throw new Error('RELEASE_RESPONSE_REFERENCE_NOT_CANONICAL');
  const component = presentation.components.find(
    (candidate) => candidate.id === response.componentId,
  );
  if (component === undefined) throw new Error('RELEASE_RESPONSE_COMPONENT_NOT_FOUND');
  return {
    catalogId: presentation.catalog.releaseManifest.catalogId,
    catalogVersion: presentation.catalog.releaseManifest.releaseVersion,
    entryId: component.id,
    displayNameSnapshot: getReleaseComponentName(component, language),
    sourceStatus: 'passed',
    boundaryNote:
      referenceBoundary(
        presentation,
        component,
        response.sources.map((source) => source.id),
      ) +
      '; response=' +
      response.id +
      '; context=' +
      response.parameterContext.id,
  };
}

function referenceBoundary(
  presentation: ReleaseCatalogPresentation,
  component: ReleaseComponentView,
  sourceIds: readonly string[],
): string {
  return [
    'release=' + presentation.catalog.releaseManifest.releaseId,
    'component=' + component.id,
    'usage=' + component.usageStatus,
    'sources=' + unique(sourceIds).join(','),
    'citation snapshot; numerical use follows response admission',
  ].join('; ');
}

function componentSearchTerms(component: Omit<ReleaseComponentView, 'searchTerms'>): string[] {
  return unique(
    compact([
      component.id,
      component.names.en,
      component.names.zh,
      component.hostSpecies,
      component.hostStrain,
      component.sequenceReference,
      component.regulatorOrEnzyme,
      component.promoter,
      component.reporter,
      ...component.aliases,
      ...component.inputMolecules.flatMap((signal) => [
        signal.id,
        signal.names.en,
        signal.names.zh,
        signal.canonicalName,
        ...signal.abbreviations,
      ]),
      ...component.outputMolecules.flatMap((signal) => [
        signal.id,
        signal.names.en,
        signal.names.zh,
        signal.canonicalName,
        ...signal.abbreviations,
      ]),
      ...component.parameterContexts.flatMap((context) => [
        context.id,
        context.hostSpecies,
        context.hostStrain,
      ]),
      ...component.sources.flatMap((source) => [
        source.id,
        source.title,
        source.authors,
        source.doi,
        source.pmid,
        source.pmcid,
      ]),
    ]),
  );
}

function assertReleaseIdentity(loaded: LoadedCatalogRelease): void {
  if (!isTrustedLoadedCatalogRelease(loaded))
    throw new Error('RELEASE_CATALOG_IDENTITY_OR_FREEZE_INVALID');
}

function releaseUsageStatus(status: CatalogV2AdmissionStatus): ReleaseCatalogUsageStatus {
  if (
    status === 'runtime-demo' ||
    status === 'calibration-candidate' ||
    status === 'compatibility-only' ||
    status === 'reference-only'
  )
    return status;
  throw new Error('RELEASE_COMPONENT_USAGE_STATUS_UNSUPPORTED:' + status);
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function compact(values: readonly (string | null | undefined)[]): string[] {
  return values.filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function uniqueViews<T extends { id: string }>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function byId<T extends { id: string }>(values: readonly T[]): Map<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

function required<T>(values: Map<string, T>, id: string, label: string): T {
  const value = values.get(id);
  if (value === undefined)
    throw new Error('RELEASE_' + label.toUpperCase().replace(/\s+/gu, '_') + '_NOT_FOUND:' + id);
  return value;
}

function groupBy<T>(values: readonly T[], getKey: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const key = getKey(value);
    const current = result.get(key) ?? [];
    current.push(value);
    result.set(key, current);
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!deepEqual(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
