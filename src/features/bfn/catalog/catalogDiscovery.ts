import type {
  ReleaseCatalogLanguage,
  ReleaseCatalogLocalizedName,
  ReleaseCatalogPresentation,
  ReleaseCatalogUsageStatus,
  ReleaseComponentView,
  ReleaseResponseVariantView,
  ReleaseSignalView,
  ReleaseSourceView,
} from '../../modeling/catalog/releaseCatalogPresentation';
import type {
  BfnBiologicalComponentFamilyId,
  BfnFunctionalFamilyId,
} from '../../modeling/ontology/v1/ontologyTypes';
import {
  bfnSemanticProfileFamilyIdentity,
  bfnSemanticProfileSearchTerms,
  DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
  type BfnSemanticPresentationAdapter,
} from '../semantic/semanticPresentation';

export type BfnCatalogDiscoveryStatus =
  'runnable-demo' | 'needs-calibration' | 'qualitative-only' | 'reference-only' | 'unavailable';

export type BfnCatalogDiscoveryStatusFilter = Exclude<BfnCatalogDiscoveryStatus, 'unavailable'>;

export const BFN_CATALOG_DISCOVERY_STATUS_FILTERS: readonly BfnCatalogDiscoveryStatusFilter[] =
  Object.freeze(['runnable-demo', 'needs-calibration', 'qualitative-only', 'reference-only']);

export interface BfnCatalogDiscoverySourceSummary {
  authors: string;
  year: number | null;
  title: string;
}

interface BfnCatalogDiscoverySearchCorpus {
  componentNames: readonly string[];
  componentMetadata: readonly string[];
  signals: readonly string[];
  hosts: readonly string[];
  sources: readonly string[];
  semanticTerms: readonly string[];
}

export interface BfnCatalogDiscoverySemantic {
  functionalFamilyId: BfnFunctionalFamilyId;
  biologicalComponentFamilyId: BfnBiologicalComponentFamilyId;
}

export interface BfnCatalogDiscoveryResponse {
  id: string;
  order: number;
  inputSignalId: string;
  inputSignalNames: ReleaseCatalogLocalizedName;
  inputSignalCanonicalName: string;
  inputSignalAbbreviations: readonly string[];
  status: BfnCatalogDiscoveryStatus;
  runnable: boolean;
  hostSpecies: string | null;
  hostStrain: string | null;
  modelSummary: 'hill-response' | null;
  source: BfnCatalogDiscoverySourceSummary | null;
  additionalSourceCount: number;
  search: BfnCatalogDiscoverySearchCorpus;
}

export interface BfnCatalogDiscoveryGroup {
  id: string;
  order: number;
  names: ReleaseCatalogLocalizedName;
  aliases: readonly string[];
  role: 'receiver' | 'sender';
  status: BfnCatalogDiscoveryStatus;
  regulatorOrEnzyme: string | null;
  promoter: string | null;
  reporter: string | null;
  hostSpecies: string | null;
  hostStrain: string | null;
  source: BfnCatalogDiscoverySourceSummary | null;
  additionalSourceCount: number;
  semantic: BfnCatalogDiscoverySemantic | null;
  responses: readonly BfnCatalogDiscoveryResponse[];
  search: BfnCatalogDiscoverySearchCorpus;
}

export interface BfnCatalogDiscoverySignalFilter {
  id: string;
  names: ReleaseCatalogLocalizedName;
  canonicalName: string;
  abbreviations: readonly string[];
}

export interface BfnCatalogDiscoveryFunctionalFamilyFilter {
  id: BfnFunctionalFamilyId;
}

export interface BfnCatalogDiscoveryModel {
  catalogVersion: string;
  groups: readonly BfnCatalogDiscoveryGroup[];
  filterOptions: {
    statuses: readonly BfnCatalogDiscoveryStatusFilter[];
    functionalFamilies: readonly BfnCatalogDiscoveryFunctionalFamilyFilter[];
    inputSignals: readonly BfnCatalogDiscoverySignalFilter[];
    hosts: readonly string[];
  };
  counts: {
    components: number;
    responses: number;
    runnableResponses: number;
  };
}

export interface BfnCatalogDiscoveryFilters {
  query?: string;
  status?: BfnCatalogDiscoveryStatusFilter | 'all';
  functionalFamilyId?: BfnFunctionalFamilyId | 'all';
  inputSignalId?: string;
  host?: string;
}

export interface BfnCatalogDiscoveryQueryResult {
  groups: readonly BfnCatalogDiscoveryGroup[];
  componentCount: number;
  responseCount: number;
}

export function bfnCatalogSignalDisplayName(
  names: ReleaseCatalogLocalizedName,
  abbreviations: readonly string[],
  language: ReleaseCatalogLanguage,
): string {
  const localized = language === 'zh-CN' ? names.zh : names.en;
  const abbreviation = abbreviations[0]?.trim();
  if (!abbreviation || language === 'en-US') return localized;
  if (hasQualifiedAbbreviation(localized, abbreviation)) return localized;

  const qualifier = extractIdentityQualifier(names.en, abbreviation);
  return qualifier === 'L' || qualifier === 'D' || qualifier === 'DL'
    ? `${abbreviation}（${qualifier}）`
    : localized;
}

interface SearchMatch {
  score: number;
}

export function buildBfnCatalogDiscoveryModel(
  presentation: ReleaseCatalogPresentation,
  semanticAdapter: BfnSemanticPresentationAdapter = DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
): BfnCatalogDiscoveryModel {
  const responseOrder = new Map(
    presentation.responseVariants.map((response, index) => [response.id, index]),
  );
  const groups = presentation.components.map((component, order) =>
    buildDiscoveryGroup(component, order, responseOrder, presentation, semanticAdapter),
  );
  const functionalFamilies = uniqueFunctionalFamilies(groups);
  const inputSignals = uniqueById(
    presentation.responseVariants.map((response) => response.inputMolecule),
  ).map(toSignalFilter);
  const hosts = uniqueNormalized(
    presentation.components.flatMap((component) => [
      component.hostSpecies,
      ...component.responseVariants.map((response) => response.parameterContext.hostSpecies),
    ]),
  );
  const responses = groups.flatMap((group) => group.responses);

  return deepFreeze({
    catalogVersion: presentation.catalog.releaseManifest.releaseVersion,
    groups,
    filterOptions: {
      statuses: BFN_CATALOG_DISCOVERY_STATUS_FILTERS,
      functionalFamilies,
      inputSignals,
      hosts,
    },
    counts: {
      components: groups.length,
      responses: responses.length,
      runnableResponses: responses.filter((response) => response.runnable).length,
    },
  });
}

export function queryBfnCatalogDiscovery(
  model: BfnCatalogDiscoveryModel,
  filters: BfnCatalogDiscoveryFilters = {},
): BfnCatalogDiscoveryQueryResult {
  const tokens = tokenize(filters.query ?? '');
  const status = filters.status ?? 'all';
  const functionalFamilyId = filters.functionalFamilyId ?? 'all';
  const inputSignalId = filters.inputSignalId ?? 'all';
  const host = filters.host ?? 'all';
  const matches: Array<{ group: BfnCatalogDiscoveryGroup; score: number }> = [];

  for (const group of model.groups) {
    if (functionalFamilyId !== 'all' && group.semantic?.functionalFamilyId !== functionalFamilyId)
      continue;
    if (group.role === 'sender') {
      if (inputSignalId !== 'all') continue;
      if (status !== 'all' && group.status !== status) continue;
      if (host !== 'all' && !matchesHost(host, group.hostSpecies)) continue;
      const match = matchSearchCorpus(group.search, tokens);
      if (match === null) continue;
      matches.push({ group, score: match.score });
      continue;
    }

    if (group.responses.length === 0) {
      if (inputSignalId !== 'all') continue;
      if (status !== 'all' && group.status !== status) continue;
      if (host !== 'all' && !matchesHost(host, group.hostSpecies)) continue;
      const match = matchSearchCorpus(group.search, tokens);
      if (match === null) continue;
      matches.push({ group, score: match.score });
      continue;
    }

    const structuredResponses = group.responses.filter((response) => {
      if (status !== 'all' && response.status !== status) return false;
      if (inputSignalId !== 'all' && response.inputSignalId !== inputSignalId) return false;
      if (
        host !== 'all' &&
        !matchesHost(host, response.hostSpecies) &&
        !matchesHost(host, group.hostSpecies)
      )
        return false;
      return true;
    });
    if (structuredResponses.length === 0) continue;

    const componentMatch = matchSearchCorpus(group.search, tokens);
    const responseMatches = structuredResponses
      .map((response) => ({ response, match: matchSearchCorpus(response.search, tokens) }))
      .filter(
        (entry): entry is { response: BfnCatalogDiscoveryResponse; match: SearchMatch } =>
          entry.match !== null,
      );
    const visibleResponses =
      tokens.length === 0 || componentMatch !== null
        ? structuredResponses
        : responseMatches.map((entry) => entry.response);
    if (visibleResponses.length === 0) continue;
    const responseScore =
      responseMatches.length > 0
        ? Math.min(...responseMatches.map((entry) => entry.match.score))
        : Number.POSITIVE_INFINITY;
    matches.push({
      group: {
        ...group,
        responses: Object.freeze(visibleResponses),
      },
      score: Math.min(componentMatch?.score ?? Number.POSITIVE_INFINITY, responseScore),
    });
  }

  if (tokens.length > 0)
    matches.sort((left, right) => left.score - right.score || left.group.order - right.group.order);

  const groups = matches.map((entry) => entry.group);
  return deepFreeze({
    groups,
    componentCount: groups.length,
    responseCount: groups.reduce((count, group) => count + group.responses.length, 0),
  });
}

export function bfnCatalogDiscoveryStatus(
  response: Pick<ReleaseResponseVariantView, 'runnable' | 'usageStatus'>,
): BfnCatalogDiscoveryStatus {
  if (response.runnable) return 'runnable-demo';
  return response.usageStatus === 'runtime-demo'
    ? 'unavailable'
    : statusFromUsage(response.usageStatus);
}

function buildDiscoveryGroup(
  component: ReleaseComponentView,
  order: number,
  responseOrder: ReadonlyMap<string, number>,
  presentation: ReleaseCatalogPresentation,
  semanticAdapter: BfnSemanticPresentationAdapter,
): BfnCatalogDiscoveryGroup {
  const semanticProjection = projectDiscoverySemantic(component.id, presentation, semanticAdapter);
  const componentSearch = componentSearchCorpus(component, semanticProjection.searchTerms);
  const sourceSummary = summarizeSources(component.sources);
  const responses = component.responseVariants.map((response) => {
    const responseSources = response.sources.length > 0 ? response.sources : component.sources;
    const responseSourceSummary = summarizeSources(responseSources);
    const hostSpecies = response.parameterContext.hostSpecies ?? component.hostSpecies;
    const hostStrain = response.parameterContext.hostStrain ?? component.hostStrain;
    return {
      id: response.id,
      order: responseOrder.get(response.id) ?? Number.MAX_SAFE_INTEGER,
      inputSignalId: response.inputMolecule.id,
      inputSignalNames: response.inputMolecule.names,
      inputSignalCanonicalName: response.inputMolecule.canonicalName,
      inputSignalAbbreviations: response.inputMolecule.abbreviations,
      status: bfnCatalogDiscoveryStatus(response),
      runnable: response.runnable,
      hostSpecies,
      hostStrain,
      modelSummary: response.runnable ? ('hill-response' as const) : null,
      source: responseSourceSummary.source,
      additionalSourceCount: responseSourceSummary.additionalCount,
      search: mergeSearchCorpus(componentSearch, {
        componentNames: [],
        componentMetadata: [],
        signals: signalSearchTerms(response.inputMolecule),
        hosts: compact([hostSpecies, hostStrain]),
        sources: sourceSearchTerms(responseSources),
        semanticTerms: [],
      }),
    };
  });

  return {
    id: component.id,
    order,
    names: component.names,
    aliases: component.aliases,
    role: component.role,
    status:
      component.role === 'sender'
        ? senderStatus(component.usageStatus)
        : statusFromUsage(component.usageStatus),
    regulatorOrEnzyme: component.regulatorOrEnzyme,
    promoter: component.promoter,
    reporter: component.reporter,
    hostSpecies: component.hostSpecies,
    hostStrain: component.hostStrain,
    source: sourceSummary.source,
    additionalSourceCount: sourceSummary.additionalCount,
    semantic: semanticProjection.semantic,
    responses,
    search: componentSearch,
  };
}

function projectDiscoverySemantic(
  componentId: string,
  presentation: ReleaseCatalogPresentation,
  semanticAdapter: BfnSemanticPresentationAdapter,
): {
  semantic: BfnCatalogDiscoverySemantic | null;
  searchTerms: readonly string[];
} {
  try {
    const profile = semanticAdapter.resolveCatalogComponent(componentId, presentation);
    const identity = bfnSemanticProfileFamilyIdentity(profile);
    const functionalFamilyId = identity.functionalFamilyIds[0];
    const biologicalComponentFamilyId = identity.biologicalFamilyIds[0];
    if (
      identity.functionalFamilyIds.length !== 1 ||
      identity.biologicalFamilyIds.length !== 1 ||
      functionalFamilyId === undefined ||
      biologicalComponentFamilyId === undefined
    ) {
      return { semantic: null, searchTerms: Object.freeze([]) };
    }
    return {
      semantic: { functionalFamilyId, biologicalComponentFamilyId },
      searchTerms: bfnSemanticProfileSearchTerms(profile),
    };
  } catch {
    return { semantic: null, searchTerms: Object.freeze([]) };
  }
}

function uniqueFunctionalFamilies(
  groups: readonly BfnCatalogDiscoveryGroup[],
): BfnCatalogDiscoveryFunctionalFamilyFilter[] {
  const seen = new Set<BfnFunctionalFamilyId>();
  const result: BfnCatalogDiscoveryFunctionalFamilyFilter[] = [];
  for (const group of groups) {
    const id = group.semantic?.functionalFamilyId;
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    result.push({ id });
  }
  return result;
}

function componentSearchCorpus(
  component: ReleaseComponentView,
  semanticTerms: readonly string[],
): BfnCatalogDiscoverySearchCorpus {
  return {
    componentNames: compact([component.names.en, component.names.zh]),
    componentMetadata: compact([
      ...component.aliases,
      component.regulatorOrEnzyme,
      component.promoter,
      component.reporter,
    ]),
    signals: [],
    hosts: compact([component.hostSpecies, component.hostStrain]),
    sources: sourceSearchTerms(component.sources),
    semanticTerms,
  };
}

function signalSearchTerms(signal: ReleaseSignalView): string[] {
  return compact([signal.names.en, signal.names.zh, signal.canonicalName, ...signal.abbreviations]);
}

function sourceSearchTerms(sources: readonly ReleaseSourceView[]): string[] {
  return compact(
    sources.flatMap((source) => [
      source.authors,
      source.title,
      source.year === null ? null : String(source.year),
      source.doi,
      source.pmid,
    ]),
  );
}

function mergeSearchCorpus(
  left: BfnCatalogDiscoverySearchCorpus,
  right: BfnCatalogDiscoverySearchCorpus,
): BfnCatalogDiscoverySearchCorpus {
  return {
    componentNames: [...left.componentNames, ...right.componentNames],
    componentMetadata: [...left.componentMetadata, ...right.componentMetadata],
    signals: [...left.signals, ...right.signals],
    hosts: [...left.hosts, ...right.hosts],
    sources: [...left.sources, ...right.sources],
    semanticTerms: [...left.semanticTerms, ...right.semanticTerms],
  };
}

function matchSearchCorpus(
  corpus: BfnCatalogDiscoverySearchCorpus,
  tokens: readonly string[],
): SearchMatch | null {
  if (tokens.length === 0) return { score: 0 };
  let score = 0;
  for (const token of tokens) {
    const rank = tokenRank(corpus, token);
    if (rank === null) return null;
    score += rank;
  }
  return { score };
}

function tokenRank(corpus: BfnCatalogDiscoverySearchCorpus, token: string): number | null {
  const names = corpus.componentNames.map(normalizeText);
  if (names.some((value) => value === token || value.startsWith(token))) return 0;
  if (names.some((value) => value.includes(token))) return 1;
  if (containsToken(corpus.componentMetadata, token)) return 2;
  if (containsToken(corpus.signals, token)) return 3;
  if (containsToken(corpus.hosts, token)) return 4;
  if (containsToken(corpus.sources, token)) return 5;
  if (containsToken(corpus.semanticTerms, token)) return 6;
  return null;
}

function containsToken(values: readonly string[], token: string): boolean {
  return values.some((value) => normalizeText(value).includes(token));
}

function tokenize(query: string): string[] {
  return normalizeText(query).split(' ').filter(Boolean);
}

function hasQualifiedAbbreviation(value: string, abbreviation: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith(`${abbreviation} (`) && trimmed.endsWith(')')) ||
    (trimmed.startsWith(`${abbreviation}（`) && trimmed.endsWith('）'))
  );
}

function extractIdentityQualifier(displayName: string, abbreviation: string): string | null {
  const trimmed = displayName.trim();
  const prefix = `${abbreviation} (`;
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(')')) return null;
  const qualifier = trimmed.slice(prefix.length, -1).trim();
  return qualifier.length > 0 && !qualifier.includes('(') && !qualifier.includes(')')
    ? qualifier
    : null;
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function matchesHost(filter: string, candidate: string | null): boolean {
  return candidate !== null && normalizeText(filter) === normalizeText(candidate);
}

function statusFromUsage(status: ReleaseCatalogUsageStatus): BfnCatalogDiscoveryStatus {
  switch (status) {
    case 'runtime-demo':
      return 'unavailable';
    case 'calibration-candidate':
      return 'needs-calibration';
    case 'compatibility-only':
      return 'qualitative-only';
    case 'reference-only':
      return 'reference-only';
  }
}

function senderStatus(status: ReleaseCatalogUsageStatus): BfnCatalogDiscoveryStatus {
  return status === 'runtime-demo' ? 'unavailable' : statusFromUsage(status);
}

function summarizeSources(sources: readonly ReleaseSourceView[]): {
  source: BfnCatalogDiscoverySourceSummary | null;
  additionalCount: number;
} {
  const first = sources[0];
  return {
    source: first
      ? {
          authors: first.authors,
          year: first.year,
          title: first.title,
        }
      : null,
    additionalCount: Math.max(0, sources.length - 1),
  };
}

function toSignalFilter(signal: ReleaseSignalView): BfnCatalogDiscoverySignalFilter {
  return {
    id: signal.id,
    names: signal.names,
    canonicalName: signal.canonicalName,
    abbreviations: signal.abbreviations,
  };
}

function uniqueById<T extends { id: string }>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function uniqueNormalized(values: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value === null || value.trim().length === 0) continue;
    const key = normalizeText(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function compact(values: readonly (string | null | undefined)[]): string[] {
  return values.filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
