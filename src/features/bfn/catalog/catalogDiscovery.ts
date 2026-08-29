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
import {
  assessSenderExtensionRuntimeAdmissions,
  loadSenderEvidenceExtension,
  senderEvidenceScopes,
  type BfnSenderRuntimeAdmission,
  type SenderEvidenceExtension,
  type SenderEvidenceScope,
  type SenderExtensionComponentRecord,
  type SenderOutputRecord,
} from '../../modeling/catalog/sender/v1_2';
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

export interface BfnCatalogDiscoverySenderOutput {
  id: string;
  order: number;
  componentId: string;
  outputSignalId: string | null;
  outputSignalNames: ReleaseCatalogLocalizedName | null;
  outputSignalCanonicalName: string | null;
  outputSignalAbbreviations: readonly string[];
  evidenceScopes: readonly SenderEvidenceScope[];
  outputQuantity: string;
  outputUnit: string | null;
  measurementMethod: string | null;
  status: BfnCatalogDiscoveryStatus;
  runtimeAdmission: BfnSenderRuntimeAdmission;
  hostSpecies: string | null;
  hostStrain: string | null;
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
  senderOutputs: readonly BfnCatalogDiscoverySenderOutput[];
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
  baseReleaseName: string;
  senderExtensionVersion: string;
  senderExtensionName: string;
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
    receiverResponses: number;
    runnableReceivers: number;
    senderEvidenceRecords: number;
    runnableSenders: number;
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
  senderEvidenceCount: number;
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
  senderExtension: SenderEvidenceExtension = loadSenderEvidenceExtension(),
): BfnCatalogDiscoveryModel {
  const admissionByOutputId = new Map(
    assessSenderExtensionRuntimeAdmissions(senderExtension, presentation.release).map(
      (assessment) => [assessment.senderOutputId, assessment.admission],
    ),
  );
  const responseOrder = new Map(
    presentation.responseVariants.map((response, index) => [response.id, index]),
  );
  const outputsByComponent = groupSenderOutputsByComponent(senderExtension);
  const baseGroups = presentation.components.map((component, order) => {
    const group = buildDiscoveryGroup(
      component,
      order,
      responseOrder,
      presentation,
      semanticAdapter,
    );
    return {
      ...group,
      senderOutputs: buildSenderOutputDiscoveryRecords(
        outputsByComponent.get(component.id) ?? [],
        group.search,
        presentation,
        senderExtension,
        admissionByOutputId,
      ),
    };
  });
  const extensionGroups = senderExtension.componentsDocument.new_sender_components.map(
    (component, index) =>
      buildExtensionSenderGroup(
        component,
        presentation.components.length + index,
        outputsByComponent.get(component.id) ?? [],
        presentation,
        senderExtension,
        admissionByOutputId,
      ),
  );
  const groups = [...baseGroups, ...extensionGroups];
  const functionalFamilies = uniqueFunctionalFamilies(groups);
  const inputSignals = uniqueById(
    presentation.responseVariants.map((response) => response.inputMolecule),
  ).map(toSignalFilter);
  const hosts = uniqueNormalized([
    ...presentation.components.flatMap((component) => [
      component.hostSpecies,
      ...component.responseVariants.map((response) => response.parameterContext.hostSpecies),
    ]),
    ...senderExtension.componentsDocument.new_sender_components.flatMap((component) => [
      component.host_species,
      component.host_strain,
    ]),
    ...senderExtension.componentsDocument.new_parameter_contexts.flatMap((context) => [
      context.host_species,
      context.host_strain,
    ]),
  ]);
  const responses = groups.flatMap((group) => group.responses);
  const senderOutputs = groups.flatMap((group) => group.senderOutputs);
  const runnableReceivers = responses.filter((response) => response.runnable).length;
  const runnableSenders = senderOutputs.filter((output) => output.runtimeAdmission.admitted).length;

  return deepFreeze({
    catalogVersion: presentation.catalog.releaseManifest.releaseVersion,
    baseReleaseName: presentation.release.release_metadata.release_name,
    senderExtensionVersion: senderExtension.componentsDocument.release_metadata.version,
    senderExtensionName: senderExtension.componentsDocument.release_metadata.release_name,
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
      runnableResponses: runnableReceivers,
      receiverResponses: responses.length,
      runnableReceivers,
      senderEvidenceRecords: senderOutputs.length,
      runnableSenders,
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
      if (group.senderOutputs.length === 0) {
        if (status !== 'all' && group.status !== status) continue;
        if (host !== 'all' && !matchesHost(host, group.hostSpecies)) continue;
        const match = matchSearchCorpus(group.search, tokens);
        if (match === null) continue;
        matches.push({ group, score: match.score });
        continue;
      }
      const structuredOutputs = group.senderOutputs.filter((output) => {
        if (status !== 'all' && output.status !== status) return false;
        if (
          host !== 'all' &&
          !matchesHost(host, output.hostSpecies) &&
          !matchesHost(host, group.hostSpecies)
        )
          return false;
        return true;
      });
      if (structuredOutputs.length === 0) continue;
      const componentMatch = matchSearchCorpus(group.search, tokens);
      const outputMatches = structuredOutputs
        .map((output) => ({ output, match: matchSearchCorpus(output.search, tokens) }))
        .filter(
          (
            entry,
          ): entry is {
            output: BfnCatalogDiscoverySenderOutput;
            match: SearchMatch;
          } => entry.match !== null,
        );
      const visibleOutputs =
        tokens.length === 0 || componentMatch !== null
          ? structuredOutputs
          : outputMatches.map((entry) => entry.output);
      if (visibleOutputs.length === 0) continue;
      const outputScore =
        outputMatches.length > 0
          ? Math.min(...outputMatches.map((entry) => entry.match.score))
          : Number.POSITIVE_INFINITY;
      matches.push({
        group: { ...group, senderOutputs: Object.freeze(visibleOutputs) },
        score: Math.min(componentMatch?.score ?? Number.POSITIVE_INFINITY, outputScore),
      });
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
    senderEvidenceCount: groups.reduce((count, group) => count + group.senderOutputs.length, 0),
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
    senderOutputs: [],
    search: componentSearch,
  };
}

interface SenderDiscoverySignalIdentity {
  names: ReleaseCatalogLocalizedName;
  canonicalName: string;
  abbreviations: readonly string[];
}

interface SenderDiscoverySource {
  authors: string;
  title: string;
  year: number | null;
  doi: string | null;
  pmid: string | null;
}

function groupSenderOutputsByComponent(
  extension: SenderEvidenceExtension,
): Map<string, SenderOutputRecord[]> {
  const result = new Map<string, SenderOutputRecord[]>();
  for (const output of extension.outputsDocument.sender_outputs) {
    const records = result.get(output.sender_component_id) ?? [];
    records.push(output);
    result.set(output.sender_component_id, records);
  }
  return result;
}

function buildSenderOutputDiscoveryRecords(
  outputs: readonly SenderOutputRecord[],
  componentSearch: BfnCatalogDiscoverySearchCorpus,
  presentation: ReleaseCatalogPresentation,
  extension: SenderEvidenceExtension,
  admissionByOutputId: ReadonlyMap<string, BfnSenderRuntimeAdmission>,
): BfnCatalogDiscoverySenderOutput[] {
  return outputs.map((output) => {
    const outputSignal = senderSignalIdentity(output.output_signal_id, presentation, extension);
    const context =
      extension.componentsDocument.new_parameter_contexts.find(
        (item) => item.id === output.parameter_context_id,
      ) ??
      presentation.parameterContexts.find((item) => item.id === output.parameter_context_id) ??
      null;
    const hostSpecies =
      context && 'host_species' in context ? context.host_species : (context?.hostSpecies ?? null);
    const hostStrain =
      context && 'host_strain' in context ? context.host_strain : (context?.hostStrain ?? null);
    const sources = senderDiscoverySources(output.source_ids, presentation, extension);
    const sourceSummary = summarizeSenderDiscoverySources(sources);
    const rawPoints = extension.rawPoints.filter((point) => point.sender_output_id === output.id);
    const functionParameters = extension.functionParameters.filter(
      (parameter) => parameter.sender_output_id === output.id,
    );
    const evidenceScopes = senderEvidenceScopes(output, rawPoints, functionParameters);
    const admission = admissionByOutputId.get(output.id);
    if (!admission) throw new Error('BFN_SENDER_DISCOVERY_ADMISSION_MISSING:' + output.id);
    return {
      id: output.id,
      order: extension.outputsDocument.sender_outputs.indexOf(output),
      componentId: output.sender_component_id,
      outputSignalId: output.output_signal_id,
      outputSignalNames: outputSignal?.names ?? null,
      outputSignalCanonicalName: outputSignal?.canonicalName ?? null,
      outputSignalAbbreviations: outputSignal?.abbreviations ?? [],
      evidenceScopes,
      outputQuantity: output.output_definition.kind,
      outputUnit: output.output_definition.unit,
      measurementMethod: output.measurement.method,
      status: senderExtensionStatus(output.software_status),
      runtimeAdmission: admission,
      hostSpecies,
      hostStrain,
      source: sourceSummary.source,
      additionalSourceCount: sourceSummary.additionalCount,
      search: mergeSearchCorpus(componentSearch, {
        componentNames: [],
        componentMetadata: compact([
          output.input_definition.name,
          output.output_definition.kind,
          output.measurement.method,
          ...evidenceScopes.flatMap(senderEvidenceScopeSearchTerms),
        ]),
        signals: outputSignal
          ? compact([
              outputSignal.names.en,
              outputSignal.names.zh,
              outputSignal.canonicalName,
              ...outputSignal.abbreviations,
            ])
          : [],
        hosts: compact([hostSpecies, hostStrain]),
        sources: senderDiscoverySourceSearchTerms(sources),
        semanticTerms: [],
      }),
    };
  });
}

function buildExtensionSenderGroup(
  component: SenderExtensionComponentRecord,
  order: number,
  outputs: readonly SenderOutputRecord[],
  presentation: ReleaseCatalogPresentation,
  extension: SenderEvidenceExtension,
  admissionByOutputId: ReadonlyMap<string, BfnSenderRuntimeAdmission>,
): BfnCatalogDiscoveryGroup {
  const sources = senderDiscoverySources(component.source_ids, presentation, extension);
  const sourceSummary = summarizeSenderDiscoverySources(sources);
  const search: BfnCatalogDiscoverySearchCorpus = {
    componentNames: compact([component.display_name_en, component.display_name_zh]),
    componentMetadata: compact([
      component.regulator_or_enzyme,
      component.promoter,
      component.reporter,
      component.expression_configuration,
    ]),
    signals: [],
    hosts: compact([component.host_species, component.host_strain]),
    sources: senderDiscoverySourceSearchTerms(sources),
    semanticTerms: [],
  };
  return {
    id: component.id,
    order,
    names: { en: component.display_name_en, zh: component.display_name_zh },
    aliases: [],
    role: 'sender',
    status: senderExtensionStatus(component.software_status),
    regulatorOrEnzyme: component.regulator_or_enzyme,
    promoter: component.promoter,
    reporter: component.reporter,
    hostSpecies: component.host_species,
    hostStrain: component.host_strain,
    source: sourceSummary.source,
    additionalSourceCount: sourceSummary.additionalCount,
    semantic: null,
    responses: [],
    senderOutputs: buildSenderOutputDiscoveryRecords(
      outputs,
      search,
      presentation,
      extension,
      admissionByOutputId,
    ),
    search,
  };
}

function senderSignalIdentity(
  signalId: string | null,
  presentation: ReleaseCatalogPresentation,
  extension: SenderEvidenceExtension,
): SenderDiscoverySignalIdentity | null {
  if (signalId === null) return null;
  const baseSignal = presentation.signals.find((signal) => signal.id === signalId);
  if (baseSignal)
    return {
      names: baseSignal.names,
      canonicalName: baseSignal.canonicalName,
      abbreviations: baseSignal.abbreviations,
    };
  const extensionSignal = extension.componentsDocument.new_signals.find(
    (signal) => signal.id === signalId,
  );
  if (!extensionSignal) return null;
  return {
    names: {
      en: extensionSignal.display_name_en,
      zh: extensionSignal.display_name_zh,
    },
    canonicalName: extensionSignal.canonical_name,
    abbreviations: extensionSignal.common_abbreviations,
  };
}

function senderDiscoverySources(
  sourceIds: readonly string[],
  presentation: ReleaseCatalogPresentation,
  extension: SenderEvidenceExtension,
): SenderDiscoverySource[] {
  return sourceIds.map((sourceId) => {
    const extensionSource = extension.sources.find((source) => source.source_id === sourceId);
    if (extensionSource) return extensionSource;
    const baseSource = presentation.sources.find((source) => source.id === sourceId);
    if (!baseSource) throw new Error('BFN_SENDER_DISCOVERY_SOURCE_MISSING:' + sourceId);
    return {
      authors: baseSource.authors,
      title: baseSource.title,
      year: baseSource.year,
      doi: baseSource.doi,
      pmid: baseSource.pmid,
    };
  });
}

function summarizeSenderDiscoverySources(sources: readonly SenderDiscoverySource[]): {
  source: BfnCatalogDiscoverySourceSummary | null;
  additionalCount: number;
} {
  const first = sources[0];
  return {
    source: first ? { authors: first.authors, year: first.year, title: first.title } : null,
    additionalCount: Math.max(0, sources.length - 1),
  };
}

function senderDiscoverySourceSearchTerms(sources: readonly SenderDiscoverySource[]): string[] {
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

function senderEvidenceScopeSearchTerms(scope: SenderEvidenceScope): readonly string[] {
  switch (scope) {
    case 'endpoint_concentration':
      return ['endpoint concentration', '端点浓度', '定量发送证据'];
    case 'fixed_condition_time_course':
      return ['fixed condition time course', 'time series', '固定条件时间序列'];
    case 'production_rate':
      return ['production rate', '产生速率'];
    case 'enzyme_kinetics':
      return ['enzyme kinetics', 'Michaelis-Menten', '酶动力学'];
    case 'effective_pair_only':
      return ['end-to-end evidence', 'effective pair', '端到端证据'];
    case 'non_detection':
      return ['non-detection', 'not detected', '未检出'];
    case 'other_quantitative_evidence':
      return ['quantitative sender evidence', '发送端定量证据'];
  }
}

function senderExtensionStatus(
  status: SenderExtensionComponentRecord['software_status'],
): BfnCatalogDiscoveryStatus {
  switch (status) {
    case 'calibration_candidate':
      return 'needs-calibration';
    case 'effective_pair_only':
      return 'qualitative-only';
    case 'reference_only':
      return 'reference-only';
  }
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
