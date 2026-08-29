import type {
  CatalogV2ContextDetails,
  CatalogV2SourceResponse,
} from '../../modeling/catalog/v2/catalogTypes';
import type { AhlHslSequenceMetadata } from '../../modeling/catalog/v2/releaseTypes';
import {
  assessSenderExtensionRuntimeAdmissions,
  isTrustedSenderEvidenceExtension,
  loadSenderEvidenceExtension,
  senderEvidenceScopes,
  type BfnSenderRuntimeAdmission,
  type SenderEvidenceExtension,
  type SenderEvidenceScope,
  type SenderEvidenceTraceRecord,
  type SenderExtensionComponentRecord,
  type SenderExtensionParameterContextRecord,
  type SenderExtensionSignalRecord,
  type SenderFunctionParameterRecord,
  type SenderOutputRecord,
  type SenderRawPointRecord,
  type SenderSourceRecord,
} from '../../modeling/catalog/sender/v1_2';
import {
  isTrustedReleaseCatalogPresentation,
  type ReleaseCatalogLanguage,
  type ReleaseCatalogLocalizedName,
  type ReleaseCatalogPresentation,
  type ReleaseComponentView,
  type ReleaseParameterContextView,
  type ReleaseResponseVariantView,
  type ReleaseSourceView,
} from '../../modeling/catalog/releaseCatalogPresentation';
import {
  buildBfnCatalogRuntimeCandidate,
  isTrustedBfnCatalogRuntimeCandidate,
} from './catalogBfnAdapter';
import type { BfnCatalogRuntimeCandidate } from './catalogBfnTypes';
import {
  bfnCatalogDiscoveryStatus,
  bfnCatalogSignalDisplayName,
  type BfnCatalogDiscoveryStatus,
} from './catalogDiscovery';

export type BfnCatalogDetailTarget =
  | { kind: 'response'; responseId: string }
  | { kind: 'component'; componentId: string }
  | { kind: 'sender_output'; senderOutputId: string };

export type BfnCatalogRuntimeCandidateBuilder = (responseId: string) => BfnCatalogRuntimeCandidate;

export interface BfnCatalogDetailSource {
  id: string;
  authors: string;
  year: number | null;
  title: string;
  journalOrRepository: string | null;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  primaryUrl: string | null;
  primary: boolean;
}

export interface BfnCatalogDetailContext {
  id: string;
  hostSpecies: string | null;
  hostStrain: string | null;
  vectorSystem: string | null;
  promoterConfiguration: string | null;
  reporter: string | null;
  cultureMedium: string | null;
  temperature: string | null;
  inductionConditions: string | null;
  exposureTime: string | null;
  measurementPlatform: string | null;
  measurementUnit: string | null;
  normalizationMethod: string | null;
  backgroundSubtraction: string | null;
  biologicalReplicates: number | null;
  technicalReplicates: number | null;
  measurementDetails: Readonly<Record<string, unknown>> | null;
}

export interface BfnCatalogDetailComponent {
  id: string;
  names: ReleaseCatalogLocalizedName;
  displayNames: ReleaseCatalogLocalizedName;
  aliases: readonly string[];
  role: 'receiver' | 'sender';
  status: BfnCatalogDiscoveryStatus;
  regulatorOrEnzyme: string | null;
  promoter: string | null;
  reporter: string | null;
  vectorOrBackbone: string | null;
  copyNumberContext: string | null;
  expressionConfiguration: string | null;
  inputDescription: string | null;
  outputDescription: string | null;
  sequenceStatus: string;
  sequenceReference: string | null;
  sequenceMetadata: AhlHslSequenceMetadata | null;
  constructionReady: boolean;
  evidenceGaps: readonly string[];
  notes: string | null;
  revisionStatus: string;
  lastVerifiedAt: string;
}

export interface BfnCatalogDetailRuntimeModel {
  model: 'hill-response';
  inputNames: ReleaseCatalogLocalizedName;
  minimumResponse: 0;
  maximumResponse: 1;
  halfResponseConcentration: number;
  halfResponseUnit: 'M';
  hillCoefficient: number;
  workingRange: { min: number; max: number; unit: 'M' };
  biologicalDirection: 'activation' | 'derepression';
  mathematicalDirection: 'increasing';
}

export interface BfnCatalogDetailObservedPair {
  id: string;
  senderNames: ReleaseCatalogLocalizedName | null;
  receiverNames: ReleaseCatalogLocalizedName | null;
  observedEffect: string;
  responseClass: string;
  condition: string | null;
  context: BfnCatalogDetailContext | null;
  sources: readonly BfnCatalogDetailSource[];
  evidenceLocation: string;
  notes: readonly string[];
  decompositionProhibited: true;
}

export interface BfnCatalogDetailCompatibility {
  id: string;
  inputNames: ReleaseCatalogLocalizedName | null;
  relationType: string;
  qualitativeOutcome: string;
  context: BfnCatalogDetailContext;
  sources: readonly BfnCatalogDetailSource[];
  evidenceLocation: string | null;
  notes: readonly string[];
  numericUseAllowed: false;
}

interface BfnCatalogDetailBase {
  component: BfnCatalogDetailComponent;
  context: BfnCatalogDetailContext | null;
  sources: readonly BfnCatalogDetailSource[];
  observedPairs: readonly BfnCatalogDetailObservedPair[];
  compatibility: readonly BfnCatalogDetailCompatibility[];
  catalogVersion: string;
}

export interface BfnCatalogResponseDetail extends BfnCatalogDetailBase {
  kind: 'response';
  responseId: string;
  status: BfnCatalogDiscoveryStatus;
  inputSignalId: string;
  inputSignalNames: ReleaseCatalogLocalizedName;
  outputSignalNames: ReleaseCatalogLocalizedName | null;
  runtimeCandidate: BfnCatalogRuntimeCandidate | null;
  runtimeModel: BfnCatalogDetailRuntimeModel | null;
  sourceResponse: CatalogV2SourceResponse | null;
  canAddToNetwork: boolean;
  notes: readonly string[];
  advanced: {
    responseId: string;
    componentId: string;
    parameterContextId: string;
    qualityLevel: string | null;
    evidenceLocation: string | null;
    revisionStatus: string | null;
    lastVerifiedAt: string | null;
    verificationBasis: readonly string[];
  };
}

export interface BfnCatalogComponentDetail extends BfnCatalogDetailBase {
  kind: 'component';
  status: BfnCatalogDiscoveryStatus;
  currentNumericCapability: 'no-quantitative-sender-function' | 'reference-only';
}

export interface BfnCatalogSenderSignalDetail {
  id: string;
  names: ReleaseCatalogLocalizedName;
  canonicalName: string;
  abbreviations: readonly string[];
  extensionRecord: SenderExtensionSignalRecord | null;
}

export interface BfnCatalogSenderOutputDetail {
  kind: 'sender_output';
  senderOutputId: string;
  status: BfnCatalogDiscoveryStatus;
  component: BfnCatalogDetailComponent;
  extensionComponent: SenderExtensionComponentRecord | null;
  context: BfnCatalogDetailContext;
  extensionContext: SenderExtensionParameterContextRecord | null;
  sources: readonly SenderSourceRecord[];
  outputSignal: BfnCatalogSenderSignalDetail | null;
  output: SenderOutputRecord;
  rawPoints: readonly SenderRawPointRecord[];
  functionParameters: readonly SenderFunctionParameterRecord[];
  evidenceTrace: readonly SenderEvidenceTraceRecord[];
  evidenceScopes: readonly SenderEvidenceScope[];
  runtimeAdmission: BfnSenderRuntimeAdmission;
  catalogVersion: string;
  extensionName: string;
  extensionVersion: string;
  canAddToNetwork: false;
}

export type BfnCatalogDetail =
  BfnCatalogResponseDetail | BfnCatalogComponentDetail | BfnCatalogSenderOutputDetail;

export function bfnCatalogComponentDisplayName(
  component: Pick<ReleaseComponentView, 'names' | 'regulatorOrEnzyme' | 'promoter'>,
  language: ReleaseCatalogLanguage,
): string {
  const functionalName = [component.regulatorOrEnzyme, component.promoter]
    .filter((value): value is string => value !== null && value.trim().length > 0)
    .join(' / ');
  return functionalName || (language === 'zh-CN' ? component.names.zh : component.names.en);
}

export function buildBfnCatalogDetail(
  presentation: ReleaseCatalogPresentation,
  target: BfnCatalogDetailTarget,
  candidateBuilder: BfnCatalogRuntimeCandidateBuilder = buildBfnCatalogRuntimeCandidate,
  senderExtension: SenderEvidenceExtension = loadSenderEvidenceExtension(),
): BfnCatalogDetail {
  if (!isTrustedReleaseCatalogPresentation(presentation)) {
    throw new Error('BFN_CATALOG_DETAIL_PRESENTATION_UNTRUSTED');
  }
  if (target.kind === 'sender_output') {
    if (!isTrustedSenderEvidenceExtension(senderExtension))
      throw new Error('BFN_CATALOG_SENDER_EXTENSION_UNTRUSTED');
    return deepFreeze(
      buildSenderOutputDetail(presentation, senderExtension, target.senderOutputId),
    );
  }
  if (target.kind === 'response') {
    const response = required(
      presentation.responseVariants.find((entry) => entry.id === target.responseId),
      'BFN_CATALOG_DETAIL_RESPONSE_NOT_FOUND',
    );
    const component = required(
      presentation.components.find((entry) => entry.id === response.componentId),
      'BFN_CATALOG_DETAIL_COMPONENT_NOT_FOUND',
    );
    return deepFreeze(buildResponseDetail(presentation, component, response, candidateBuilder));
  }
  const component = required(
    presentation.components.find((entry) => entry.id === target.componentId),
    'BFN_CATALOG_DETAIL_COMPONENT_NOT_FOUND',
  );
  return deepFreeze(buildComponentDetail(presentation, component));
}

function buildSenderOutputDetail(
  presentation: ReleaseCatalogPresentation,
  extension: SenderEvidenceExtension,
  senderOutputId: string,
): BfnCatalogSenderOutputDetail {
  const output = required(
    extension.outputsDocument.sender_outputs.find((item) => item.id === senderOutputId),
    'BFN_CATALOG_DETAIL_SENDER_OUTPUT_NOT_FOUND',
  );
  const baseComponent = presentation.components.find(
    (component) => component.id === output.sender_component_id,
  );
  const extensionComponent =
    extension.componentsDocument.new_sender_components.find(
      (component) => component.id === output.sender_component_id,
    ) ?? null;
  let component: BfnCatalogDetailComponent;
  if (baseComponent) component = componentDetail(presentation, baseComponent);
  else if (extensionComponent) component = extensionComponentDetail(extensionComponent);
  else throw new Error('BFN_CATALOG_DETAIL_SENDER_COMPONENT_NOT_FOUND');
  const extensionContext =
    extension.componentsDocument.new_parameter_contexts.find(
      (context) => context.id === output.parameter_context_id,
    ) ?? null;
  const baseContext = presentation.parameterContexts.find(
    (context) => context.id === output.parameter_context_id,
  );
  const context = extensionContext
    ? senderContextDetail(extensionContext)
    : contextDetail(required(baseContext, 'BFN_CATALOG_DETAIL_SENDER_CONTEXT_NOT_FOUND'));
  const sources = output.source_ids.map((sourceId) =>
    required(
      extension.sources.find((source) => source.source_id === sourceId),
      'BFN_CATALOG_DETAIL_SENDER_SOURCE_NOT_FOUND:' + sourceId,
    ),
  );
  const rawPoints = extension.rawPoints.filter((point) => point.sender_output_id === output.id);
  const functionParameters = extension.functionParameters.filter(
    (parameter) => parameter.sender_output_id === output.id,
  );
  const admission = required(
    assessSenderExtensionRuntimeAdmissions(extension, presentation.release).find(
      (assessment) => assessment.senderOutputId === output.id,
    )?.admission,
    'BFN_CATALOG_DETAIL_SENDER_ADMISSION_NOT_FOUND',
  );
  const relatedTraceIds = new Set([
    output.id,
    output.sender_component_id,
    output.parameter_context_id,
    ...output.source_ids,
    ...output.product_profile.map((profile) => profile.signal_id),
    ...rawPoints.map((point) => point.raw_point_id),
  ]);
  return {
    kind: 'sender_output',
    senderOutputId: output.id,
    status: senderEvidenceStatus(output.software_status),
    component,
    extensionComponent,
    context,
    extensionContext,
    sources,
    outputSignal: senderSignalDetail(output.output_signal_id, presentation, extension),
    output,
    rawPoints,
    functionParameters,
    evidenceTrace: extension.evidenceTrace.filter((trace) => relatedTraceIds.has(trace.record_id)),
    evidenceScopes: senderEvidenceScopes(output, rawPoints, functionParameters),
    runtimeAdmission: admission,
    catalogVersion: presentation.catalog.releaseManifest.releaseVersion,
    extensionName: extension.componentsDocument.release_metadata.release_name,
    extensionVersion: extension.componentsDocument.release_metadata.version,
    canAddToNetwork: false,
  };
}

function extensionComponentDetail(
  component: SenderExtensionComponentRecord,
): BfnCatalogDetailComponent {
  const names = {
    en: component.display_name_en,
    zh: component.display_name_zh,
  };
  return {
    id: component.id,
    names,
    displayNames: names,
    aliases: [],
    role: 'sender',
    status: senderEvidenceStatus(component.software_status),
    regulatorOrEnzyme: component.regulator_or_enzyme,
    promoter: component.promoter,
    reporter: component.reporter,
    vectorOrBackbone: component.vector_or_backbone,
    copyNumberContext: component.copy_number_or_replication_context,
    expressionConfiguration: component.expression_configuration,
    inputDescription: component.input_port,
    outputDescription: component.output_port,
    sequenceStatus: component.sequence_status,
    sequenceReference: component.sequence_reference,
    sequenceMetadata: null,
    constructionReady: component.construction_ready,
    evidenceGaps: [...component.evidence_gap],
    notes: component.notes,
    revisionStatus: component.revision_status,
    lastVerifiedAt: component.last_verified_at,
  };
}

function senderContextDetail(
  context: SenderExtensionParameterContextRecord,
): BfnCatalogDetailContext {
  return {
    id: context.id,
    hostSpecies: context.host_species,
    hostStrain: context.host_strain,
    vectorSystem: context.vector_system,
    promoterConfiguration: context.promoter_configuration,
    reporter: context.reporter,
    cultureMedium: context.culture_medium,
    temperature: context.temperature,
    inductionConditions: context.induction_conditions,
    exposureTime: context.exposure_time,
    measurementPlatform: context.measurement_platform,
    measurementUnit: context.measurement_unit,
    normalizationMethod: context.normalization_method,
    backgroundSubtraction: context.background_subtraction,
    biologicalReplicates: context.biological_replicates,
    technicalReplicates: context.technical_replicates,
    measurementDetails: structuredClone(context.measurement_details),
  };
}

function senderSignalDetail(
  signalId: string | null,
  presentation: ReleaseCatalogPresentation,
  extension: SenderEvidenceExtension,
): BfnCatalogSenderSignalDetail | null {
  if (signalId === null) return null;
  const baseSignal = presentation.signals.find((signal) => signal.id === signalId);
  if (baseSignal)
    return {
      id: baseSignal.id,
      names: { ...baseSignal.names },
      canonicalName: baseSignal.canonicalName,
      abbreviations: [...baseSignal.abbreviations],
      extensionRecord: null,
    };
  const extensionSignal = required(
    extension.componentsDocument.new_signals.find((signal) => signal.id === signalId),
    'BFN_CATALOG_DETAIL_SENDER_SIGNAL_NOT_FOUND',
  );
  return {
    id: extensionSignal.id,
    names: {
      en: extensionSignal.display_name_en,
      zh: extensionSignal.display_name_zh,
    },
    canonicalName: extensionSignal.canonical_name,
    abbreviations: [...extensionSignal.common_abbreviations],
    extensionRecord: extensionSignal,
  };
}

function senderEvidenceStatus(
  status: SenderOutputRecord['software_status'],
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

function buildResponseDetail(
  presentation: ReleaseCatalogPresentation,
  component: ReleaseComponentView,
  response: ReleaseResponseVariantView,
  candidateBuilder: BfnCatalogRuntimeCandidateBuilder,
): BfnCatalogResponseDetail {
  const runtimeCandidate = freshRuntimeCandidate(response, candidateBuilder);
  const sourceResponse = response.response.sourceResponse ?? null;
  const status =
    response.runnable && runtimeCandidate === null
      ? 'unavailable'
      : bfnCatalogDiscoveryStatus(response);
  return {
    kind: 'response',
    responseId: response.id,
    status,
    component: componentDetail(presentation, component),
    inputSignalId: response.inputMolecule.id,
    inputSignalNames: signalDisplayNames(response.inputMolecule),
    outputSignalNames: response.outputMolecule ? signalDisplayNames(response.outputMolecule) : null,
    context: contextDetail(response.parameterContext),
    sources: sourcesDetail(response.sources.length > 0 ? response.sources : component.sources),
    observedPairs: observedPairDetails(presentation, component),
    compatibility: compatibilityDetails(component),
    catalogVersion: presentation.catalog.releaseManifest.releaseVersion,
    runtimeCandidate,
    runtimeModel: runtimeCandidate ? runtimeModel(runtimeCandidate, response) : null,
    sourceResponse,
    canAddToNetwork: response.runnable && runtimeCandidate !== null,
    notes: [...response.response.notes],
    advanced: {
      responseId: response.id,
      componentId: component.id,
      parameterContextId: response.parameterContext.id,
      qualityLevel: sourceResponse?.qualityLevel ?? null,
      evidenceLocation:
        sourceResponse?.evidenceLocation ??
        response.response.sourceProvenance?.[0]?.evidenceLocation ??
        null,
      revisionStatus: sourceResponse?.revisionStatus ?? null,
      lastVerifiedAt: sourceResponse?.lastVerifiedAt ?? null,
      verificationBasis: sourceResponse ? [...sourceResponse.verificationBasis] : [],
    },
  };
}

function buildComponentDetail(
  presentation: ReleaseCatalogPresentation,
  component: ReleaseComponentView,
): BfnCatalogComponentDetail {
  const status = componentStatus(component);
  return {
    kind: 'component',
    status,
    component: componentDetail(presentation, component),
    context: component.parameterContexts[0] ? contextDetail(component.parameterContexts[0]) : null,
    sources: sourcesDetail(component.sources),
    observedPairs: observedPairDetails(presentation, component),
    compatibility: compatibilityDetails(component),
    catalogVersion: presentation.catalog.releaseManifest.releaseVersion,
    currentNumericCapability:
      component.role === 'sender' ? 'no-quantitative-sender-function' : 'reference-only',
  };
}

function freshRuntimeCandidate(
  response: ReleaseResponseVariantView,
  candidateBuilder: BfnCatalogRuntimeCandidateBuilder,
): BfnCatalogRuntimeCandidate | null {
  if (!response.runnable) return null;
  try {
    const candidate = candidateBuilder(response.id);
    return candidate.responseId === response.id && isTrustedBfnCatalogRuntimeCandidate(candidate)
      ? candidate
      : null;
  } catch {
    return null;
  }
}

function runtimeModel(
  candidate: BfnCatalogRuntimeCandidate,
  response: ReleaseResponseVariantView,
): BfnCatalogDetailRuntimeModel {
  const source = candidate.catalogReference.sourceParameters;
  return {
    model: 'hill-response',
    inputNames: signalDisplayNames(response.inputMolecule),
    minimumResponse: 0,
    maximumResponse: 1,
    halfResponseConcentration: source.ec50,
    halfResponseUnit: source.ec50Unit,
    hillCoefficient: source.hillCoefficient,
    workingRange: { ...source.workingRange },
    biologicalDirection: candidate.catalogReference.biologicalDirection,
    mathematicalDirection: 'increasing',
  };
}

function componentDetail(
  presentation: ReleaseCatalogPresentation,
  component: ReleaseComponentView,
): BfnCatalogDetailComponent {
  const raw = required(
    presentation.release.components.find((entry) => entry.id === component.id),
    'BFN_CATALOG_DETAIL_RELEASE_COMPONENT_NOT_FOUND',
  );
  return {
    id: component.id,
    names: { ...component.names },
    displayNames: {
      en: bfnCatalogComponentDisplayName(component, 'en-US'),
      zh: bfnCatalogComponentDisplayName(component, 'zh-CN'),
    },
    aliases: [...component.aliases],
    role: component.role,
    status: componentStatus(component),
    regulatorOrEnzyme: component.regulatorOrEnzyme,
    promoter: component.promoter,
    reporter: component.reporter,
    vectorOrBackbone: raw.vector_or_backbone,
    copyNumberContext: raw.copy_number_or_replication_context,
    expressionConfiguration: raw.expression_configuration,
    inputDescription: component.inputPortDescription,
    outputDescription: component.outputPortDescription,
    sequenceStatus: component.sequenceStatus,
    sequenceReference: component.sequenceReference,
    sequenceMetadata: component.sequenceMetadata
      ? structuredClone(component.sequenceMetadata)
      : null,
    constructionReady: component.constructionReady,
    evidenceGaps: [...component.evidenceGaps],
    notes: raw.notes,
    revisionStatus: raw.revision_status,
    lastVerifiedAt: raw.last_verified_at,
  };
}

function contextDetail(context: ReleaseParameterContextView): BfnCatalogDetailContext {
  const details: CatalogV2ContextDetails | undefined = context.canonical.details;
  return {
    id: context.id,
    hostSpecies: details?.hostSpecies ?? context.hostSpecies,
    hostStrain: details?.hostStrain ?? context.hostStrain,
    vectorSystem: details?.vectorSystem ?? null,
    promoterConfiguration: details?.promoterConfiguration ?? null,
    reporter: details?.reporter ?? null,
    cultureMedium: details?.cultureMedium ?? null,
    temperature: details?.temperature ?? null,
    inductionConditions: details?.inductionConditions ?? null,
    exposureTime: details?.exposureTime ?? null,
    measurementPlatform: details?.measurementPlatform ?? null,
    measurementUnit: details?.measurementUnit ?? context.measurementUnit,
    normalizationMethod: details?.normalizationMethod ?? null,
    backgroundSubtraction: details?.backgroundSubtraction ?? null,
    biologicalReplicates: details?.biologicalReplicates ?? null,
    technicalReplicates: details?.technicalReplicates ?? null,
    measurementDetails: details?.measurementDetails
      ? structuredClone(details.measurementDetails)
      : null,
  };
}

function sourcesDetail(sources: readonly ReleaseSourceView[]): BfnCatalogDetailSource[] {
  return sources.map((source) => {
    const provenance = source.canonical.provenance;
    return {
      id: source.id,
      authors: source.authors,
      year: source.year,
      title: source.title,
      journalOrRepository: provenance?.journalOrRepository ?? null,
      doi: source.doi,
      pmid: source.pmid,
      pmcid: source.pmcid,
      primaryUrl: source.primaryUrl,
      primary:
        source.canonical.kind === 'primary-paper' || provenance?.sourceType === 'primary-paper',
    };
  });
}

function observedPairDetails(
  presentation: ReleaseCatalogPresentation,
  component: ReleaseComponentView,
): BfnCatalogDetailObservedPair[] {
  return component.observedPairs.map((entry) => ({
    id: entry.id,
    senderNames: componentNames(presentation, entry.senderComponentId),
    receiverNames: componentNames(presentation, entry.receiverComponentId),
    observedEffect: entry.observedEffect,
    responseClass: entry.responseClass,
    condition: entry.pair.observed?.supernatantFractionOrCondition ?? null,
    context: entry.parameterContextId ? contextById(presentation, entry.parameterContextId) : null,
    sources: sourcesDetail(entry.sources),
    evidenceLocation: entry.pair.observed?.evidenceLocation ?? '',
    notes: [...(entry.pair.observed?.notes ?? [])],
    decompositionProhibited: true,
  }));
}

function compatibilityDetails(component: ReleaseComponentView): BfnCatalogDetailCompatibility[] {
  return component.compatibilityRelations.map((entry) => ({
    id: entry.id,
    inputNames: entry.inputMolecule ? signalDisplayNames(entry.inputMolecule) : null,
    relationType: entry.relationType,
    qualitativeOutcome: entry.qualitativeOutcome,
    context: contextDetail(entry.parameterContext),
    sources: sourcesDetail(entry.sources),
    evidenceLocation: entry.relation.sourceProvenance?.[0]?.evidenceLocation ?? null,
    notes: [...entry.relation.notes],
    numericUseAllowed: false,
  }));
}

function contextById(
  presentation: ReleaseCatalogPresentation,
  contextId: string,
): BfnCatalogDetailContext | null {
  const context = presentation.parameterContexts.find((entry) => entry.id === contextId);
  return context ? contextDetail(context) : null;
}

function componentNames(
  presentation: ReleaseCatalogPresentation,
  componentId: string | null,
): ReleaseCatalogLocalizedName | null {
  if (componentId === null) return null;
  const component = presentation.components.find((entry) => entry.id === componentId);
  return component ? { ...component.names } : null;
}

function signalDisplayNames(signal: {
  names: ReleaseCatalogLocalizedName;
  abbreviations: readonly string[];
}): ReleaseCatalogLocalizedName {
  return {
    en: bfnCatalogSignalDisplayName(signal.names, signal.abbreviations, 'en-US'),
    zh: bfnCatalogSignalDisplayName(signal.names, signal.abbreviations, 'zh-CN'),
  };
}

function componentStatus(component: ReleaseComponentView): BfnCatalogDiscoveryStatus {
  if (component.role === 'sender' && component.usageStatus === 'runtime-demo') return 'unavailable';
  switch (component.usageStatus) {
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

function required<T>(value: T | undefined, code: string): T {
  if (value === undefined) throw new Error(code);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
