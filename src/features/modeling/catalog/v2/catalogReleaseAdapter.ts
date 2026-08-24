import { COMPONENT_CATALOG_V2_SCHEMA_VERSION } from './catalogTypes';
import { isAhlHslRuntimeDemoResponseExecutable } from './catalogRuntimeDemoWhitelist';
import type {
  CatalogV2Admission,
  CatalogV2CompatibilityRelation,
  CatalogV2Component,
  CatalogV2ContextDetails,
  CatalogV2DemoBoundary,
  CatalogV2EffectivePair,
  CatalogV2Parameter,
  CatalogV2ParameterContext,
  CatalogV2RecordProvenance,
  CatalogV2ReceiverResponse,
  CatalogV2Signal,
  CatalogV2Source,
  CatalogV2SourceProvenance,
  CatalogV2SourceResponse,
  ComponentCatalogV2,
} from './catalogTypes';
import type {
  AhlHslComponentCatalogRelease,
  AhlHslComponentRecord,
  AhlHslCompatibilityRelationRecord,
  AhlHslEffectivePairRecord,
  AhlHslParameterContextRecord,
  AhlHslReceiverResponseRecord,
  AhlHslSourceRecord,
} from './releaseTypes';

export function adaptCatalogReleaseToV2(
  release: AhlHslComponentCatalogRelease,
): ComponentCatalogV2 {
  const componentById = new Map(release.components.map((component) => [component.id, component]));
  const responseIdsByComponent = new Map<string, string[]>();
  const inputSignalIdsByComponent = new Map<string, string[]>();
  for (const response of release.receiver_responses) {
    const ids = inputSignalIdsByComponent.get(response.receiver_component_id) ?? [];
    ids.push(response.input_signal_id);
    inputSignalIdsByComponent.set(response.receiver_component_id, unique(ids));
    const responseIds = responseIdsByComponent.get(response.receiver_component_id) ?? [];
    responseIds.push(response.id);
    responseIdsByComponent.set(response.receiver_component_id, responseIds);
  }

  const runtimeContextIds = new Set(
    release.receiver_responses
      .filter((response) => response.software_status === 'runtime_demo')
      .map((response) => response.parameter_context_id),
  );
  for (const component of release.components)
    if (component.software_status === 'runtime_demo')
      runtimeContextIds.add(component.parameter_context_id);

  const sources = release.sources.map(toSource);
  const sourceIds = new Set(sources.map((source) => source.id));
  const contexts = release.parameter_contexts.map((context) =>
    toContext(context, runtimeContextIds),
  );
  const signals = release.signals.map((signal) =>
    toSignal(signal.id, signal.display_name_en, signal.signal_class, signal.source_ids, release),
  );
  const components = release.components.map((component) =>
    toComponent(component, inputSignalIdsByComponent, signals),
  );
  const receiverResponses = release.receiver_responses.map((response) =>
    toResponse(response, componentById, sourceIds),
  );
  const effectivePairs = release.effective_pairs.map((pair) => toEffectivePair(pair));
  const compatibilityRelations = release.compatibility_relations.map((relation) =>
    toCompatibilityRelation(relation),
  );

  return {
    releaseManifest: {
      schemaVersion: COMPONENT_CATALOG_V2_SCHEMA_VERSION,
      catalogId: 'ahl-hsl-component-database',
      releaseId: 'ahl-hsl-component-database-v1.1',
      releaseVersion: release.release_metadata.release_version,
      generatedAt: release.release_metadata.revision_date,
      status: 'released',
      counts: {
        signals: signals.length,
        components: components.length,
        parameterContexts: contexts.length,
        receiverResponses: receiverResponses.length,
        senderOutputs: 0,
        effectivePairs: effectivePairs.length,
        compatibilityRelations: compatibilityRelations.length,
        sources: sources.length,
      },
      notes: [
        'Canonical V2 adaptation of the reconstructed AHL/HSL V1.1 release.',
        'The source release is evidence metadata; no sender output or fixed weight is inferred.',
      ],
    },
    signals,
    components,
    parameterContexts: contexts,
    receiverResponses,
    senderOutputs: [],
    effectivePairs,
    compatibilityRelations,
    sources,
  };
}

export const adaptAhlHslReleaseToV2 = adaptCatalogReleaseToV2;

function toSignal(
  id: string,
  label: string,
  signalClass: string,
  sourceIds: string[],
  release: AhlHslComponentCatalogRelease,
): CatalogV2Signal {
  const usedAsInput = release.receiver_responses.some((response) => response.input_signal_id === id);
  const usedAsOutput = release.components.some((component) => component.output_signal_id === id);
  const direction =
    usedAsInput && usedAsOutput
      ? 'bidirectional'
      : usedAsInput || signalClass === 'AHL/HSL'
        ? 'input'
        : usedAsOutput || signalClass === 'reporter_output'
          ? 'output'
          : 'intermediate';
  const isFluorescence = signalClass === 'reporter_output';
  return {
    id,
    label,
    unit: isFluorescence ? 'arbitrary' : 'M',
    direction,
    kind: isFluorescence ? 'fluorescence' : 'analyte',
    precision: {
      measurementKind: 'continuous',
      statement: isFluorescence
        ? 'Reporter output retained as a within-context observation.'
        : 'Chemical identity retained as a controlled signal; no cross-context value is inferred.',
    },
    sourceIds: unique(sourceIds),
    notes: [
      'Signal identity is preserved exactly; L, DL and stereo-unspecified records remain separate.',
    ],
  };
}

function toContext(
  context: AhlHslParameterContextRecord,
  runtimeContextIds: Set<string>,
): CatalogV2ParameterContext {
  const details: CatalogV2ContextDetails = {
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
    applicableComponentIds: [...context.applicable_component_ids],
    measurementDetails:
      context.measurement_details === null ? null : { ...context.measurement_details },
  };
  return {
    id: context.id,
    label: context.id,
    parameters: contextParameters(context),
    sourceIds: [context.source_id],
    certainty: 'documented',
    demoBoundary: boundary(
      runtimeContextIds.has(context.id),
      runtimeContextIds.has(context.id)
        ? 'Runtime demo values are valid only within this source parameter context.'
        : 'Context conditions are retained for evidence review and future calibration.',
    ),
    details,
    notes: compact([
      context.notes,
      'Context details are retained without transferring parameters across hosts or assays.',
    ]),
  };
}

function contextParameters(context: AhlHslParameterContextRecord): CatalogV2Parameter[] {
  const values: Array<[string, string | number | null]> = [
    ['hostSpecies', context.host_species],
    ['hostStrain', context.host_strain],
    ['vectorSystem', context.vector_system],
    ['promoterConfiguration', context.promoter_configuration],
    ['reporter', context.reporter],
    ['cultureMedium', context.culture_medium],
    ['temperature', context.temperature],
    ['measurementPlatform', context.measurement_platform],
    ['measurementUnit', context.measurement_unit],
    ['biologicalReplicates', context.biological_replicates],
    ['technicalReplicates', context.technical_replicates],
  ];
  return values
    .filter(([, value]) => value !== null)
    .map(([name, value]) => ({ name, value: String(value) }));
}

function toComponent(
  component: AhlHslComponentRecord,
  inputSignalIdsByComponent: Map<string, string[]>,
  signals: CatalogV2Signal[],
): CatalogV2Component {
  const status = canonicalStatus(component.software_status);
  const inputSignalIds =
    component.component_type === 'receiver'
      ? [...(inputSignalIdsByComponent.get(component.id) ?? [])]
      : [];
  const outputSignalIds =
    component.component_type === 'receiver' && component.output_signal_id !== null
      ? [component.output_signal_id]
      : [];
  const sourceIds = unique(component.source_ids);
  const label = component.display_name_en;
  return {
    id: component.id,
    label,
    nodeType: 'processing',
    componentType: component.component_type === 'sender' ? 'sender' : 'receiver',
    mechanismLabels: compact([
      component.component_type,
      component.regulator_or_enzyme,
      component.promoter,
      component.reporter,
    ]),
    inputSignalIds,
    outputSignalIds,
    parameterContextIds: [component.parameter_context_id],
    sourceIds,
    evidence: {
      grade: 'B',
      reviewStatus: 'passed',
      scope: component.reconstruction_status,
      directInEColi: /escherichia coli/i.test(component.host_species ?? ''),
      sourceIds,
      notes: compact([component.notes, ...component.evidence_gap]),
      boundaryNotes: [
        'Sequence metadata and source references are retained without embedding a construct sequence.',
      ],
    },
    admission: admission(
      status,
      component.simulation_ready,
      component.construction_ready,
      sourceIds,
      component.parameter_context_id,
      status === 'runtime-demo'
        ? 'Runtime demo component; execution remains within its documented parameter context.'
        : status === 'calibration-candidate'
          ? 'Calibration candidate; no executable cross-context parameter is inferred.'
          : status === 'compatibility-only'
            ? 'Compatibility evidence only; excluded from numerical execution.'
            : 'Reference metadata only; no runtime parameter is supplied.',
    ),
    notes: compact([
      component.notes,
      component.sequence_reference,
      ...component.evidence_gap,
      signals.length > 0 ? 'Canonical signal references were derived from exact release IDs.' : null,
    ]),
  };
}

function toResponse(
  response: AhlHslReceiverResponseRecord,
  componentById: Map<string, AhlHslComponentRecord>,
  sourceIds: Set<string>,
): CatalogV2ReceiverResponse {
  const status = canonicalStatus(response.software_status);
  const component = componentById.get(response.receiver_component_id);
  const outputSignalId = component?.output_signal_id ?? null;
  const responseSourceIds = unique(response.source_ids.filter((sourceId) => sourceIds.has(sourceId)));
  const statement = response.notes ?? 'Source response retained without parameter transformation.';
  const simulationReady =
    status === 'runtime-demo' &&
    isAhlHslRuntimeDemoResponseExecutable({
      id: response.id,
      softwareStatus: response.software_status,
      demoImplementation: response.demo_implementation,
      modelType: response.model_type,
      numericalExecutionAllowed: response.numerical_execution_allowed,
      normalizedDemoOnly: response.normalized_demo_only,
      fixedWeightCandidate: response.fixed_weight_candidate,
    });
  return {
    id: response.id,
    receiverComponentId: response.receiver_component_id,
    inputSignalId: response.input_signal_id,
    outputSignalId,
    parameterContextId: response.parameter_context_id,
    sourceIds: responseSourceIds,
    admission: admission(
      status,
      simulationReady,
      false,
      responseSourceIds,
      response.parameter_context_id,
      status === 'runtime-demo'
        ? 'Runtime demo response; numerical execution is restricted to the documented context.'
        : status === 'calibration-candidate'
          ? 'Calibration candidate response; values are retained for review only.'
          : 'Compatibility response; values are not admitted for numerical execution.',
    ),
    demoBoundary: boundary(
      status === 'runtime-demo',
      status === 'runtime-demo'
        ? 'Normalized within-context demo response; no absolute calibration is asserted.'
        : 'Response metadata is retained outside numerical runtime.',
    ),
    sourceResponse: toSourceResponse(response),
    sourceProvenance: [
      recordProvenance(
        responseSourceIds,
        response.parameter_context_id,
        statement,
        status === 'runtime-demo',
        response.evidence_location,
        response.reconstruction_status,
        response.revision_status,
        response.last_verified_at,
        response.verification_basis,
      ),
    ],
    notes: compact([
      response.notes,
      response.evidence_location,
      response.demo_implementation,
      response.runtime_scope,
    ]),
  };
}

function toSourceResponse(response: AhlHslReceiverResponseRecord): CatalogV2SourceResponse {
  const result: CatalogV2SourceResponse = {
    direction: response.direction,
    softwareStatus: canonicalStatus(response.software_status),
    evidenceType: response.evidence_type,
    fitStatus: response.fit_status,
    modelType: response.model_type,
    basal: response.basal,
    maximum: response.maximum,
    ec50: response.ec50,
    ec50Unit: response.ec50_unit,
    hillCoefficient: response.hill_coefficient,
    foldActivation: response.fold_activation,
    workingRange: toWorkingRange(response.working_range),
    approximateValue: response.approximate_value,
    approximationQualifier: response.approximation_qualifier,
    fitConstraints: [...response.fit_constraints],
    qualityLevel: response.quality_level,
    evidenceLocation: response.evidence_location,
    reconstructionStatus: response.reconstruction_status,
    fixedWeightCandidate: response.fixed_weight_candidate,
    normalizedDemoOnly: response.normalized_demo_only,
    notes: response.notes ?? null,
    ec50OriginalValue: response.ec50_original_value ?? null,
    ec50OriginalUnit: response.ec50_original_unit ?? null,
    parameterSourceLocation: response.parameter_source_location ?? null,
    demoImplementation: response.demo_implementation ?? null,
    numericalExecutionAllowed: response.numerical_execution_allowed,
    statusOverride: response.status_override,
    overrideReason: response.override_reason,
    runtimeScope: response.runtime_scope,
    revisionStatus: response.revision_status,
    lastVerifiedAt: response.last_verified_at,
    verificationBasis: [...response.verification_basis],
    changeReason: response.change_reason,
    reportedModelParameters:
      response.reported_model_parameters === null || response.reported_model_parameters === undefined
        ? null
        : { ...response.reported_model_parameters },
    parameterUncertainty: response.parameter_uncertainty ?? null,
  };
  if (response.workbook_ingestion_status !== undefined)
    result.workbookIngestionStatus = response.workbook_ingestion_status;
  if (response.reported_parameter_symbol !== undefined)
    result.reportedParameterSymbol = response.reported_parameter_symbol;
  if (response.parameter_precision_policy !== undefined)
    result.parameterPrecisionPolicy = response.parameter_precision_policy;
  return result;
}

function toWorkingRange(value: unknown): { min: number; max: number } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const range = value as unknown[];
  const min = range[0];
  const max = range[1];
  if (typeof min !== 'number' || !Number.isFinite(min)) return null;
  if (typeof max !== 'number' || !Number.isFinite(max)) return null;
  return { min, max };
}

function toEffectivePair(pair: AhlHslEffectivePairRecord): CatalogV2EffectivePair {
  const sourceIds = unique(pair.source_ids);
  const observed = {
    senderComponentId: pair.sender_component_id,
    receiverComponentId: pair.receiver_component_id,
    assayContextId: pair.assay_context_id,
    observedEffect: pair.observed_effect,
    responseClass: pair.response_class,
    supernatantFractionOrCondition: pair.supernatant_fraction_or_condition,
    intermediateSignalMeasured: pair.intermediate_signal_measured,
    decompositionProhibited: pair.decomposition_prohibited,
    sourceIds,
    evidenceLocation: pair.evidence_location,
    reconstructionStatus: pair.reconstruction_status,
    notes: compact([pair.notes]),
    assayDetails: pair.assay_details === null ? null : { ...pair.assay_details },
    revisionStatus: pair.revision_status,
    lastVerifiedAt: pair.last_verified_at,
    verificationBasis: [...pair.verification_basis],
    changeReason: pair.change_reason,
  };
  return {
    id: pair.id,
    receiverResponseId: null,
    senderOutputId: null,
    receiverComponentId: pair.receiver_component_id,
    senderComponentId: pair.sender_component_id,
    inputSignalId: null,
    outputSignalId: null,
    parameterContextId: pair.assay_context_id,
    sourceIds,
    admission: admission(
      'compatibility-only',
      false,
      false,
      sourceIds,
      pair.assay_context_id,
      'Observed sender-receiver pair retained as a non-decomposable qualitative observation.',
    ),
    demoBoundary: boundary(false, 'Observed pair is not a numerical transfer function.'),
    observed,
    sourceProvenance: [
      recordProvenance(
        sourceIds,
        pair.assay_context_id,
        'Observed pair retained without decomposition into sender production or receiver weight.',
        false,
        pair.evidence_location,
        pair.reconstruction_status,
        pair.revision_status,
        pair.last_verified_at,
        pair.verification_basis,
      ),
    ],
    notes: compact([pair.notes, pair.evidence_location]),
  };
}

function toCompatibilityRelation(
  relation: AhlHslCompatibilityRelationRecord,
): CatalogV2CompatibilityRelation {
  const sourceIds = unique(relation.source_ids);
  return {
    id: relation.id,
    receiverComponentId: relation.subject_component_id,
    senderComponentId: relation.target_component_id,
    receiverResponseId: null,
    senderOutputId: null,
    kind: compatibilityKind(relation.relation_type),
    parameterContextId: relation.parameter_context_id,
    sourceIds,
    admission: admission(
      'compatibility-only',
      false,
      false,
      sourceIds,
      relation.parameter_context_id,
      'Qualitative compatibility evidence retained outside numerical execution.',
    ),
    demoBoundary: boundary(false, 'Compatibility relation is qualitative evidence only.'),
    subjectComponentId: relation.subject_component_id,
    targetComponentId: relation.target_component_id,
    inputSignalId: relation.input_signal_id,
    relationType: relation.relation_type,
    direction: relation.direction,
    qualitativeOutcome: relation.qualitative_outcome,
    numericUseAllowed: false,
    sourceProvenance: [
      recordProvenance(
        sourceIds,
        relation.parameter_context_id,
        relation.qualitative_outcome,
        false,
        relation.evidence_location,
        relation.reconstruction_status,
        relation.revision_status,
        relation.last_verified_at,
        relation.verification_basis,
      ),
    ],
    notes: compact([relation.notes, relation.evidence_location]),
  };
}

function toSource(source: AhlHslSourceRecord): CatalogV2Source {
  const locator = source.primary_url ?? source.supplementary_url ?? source.repository_url;
  const citation = source.authors + '. ' + source.title + ' (' + String(source.year ?? source.publication_year ?? 'n.d.') + ').';
  const provenance: CatalogV2SourceProvenance = {
    sourceId: source.source_id,
    sourceType: source.source_type,
    authors: source.authors,
    title: source.title,
    year: source.year,
    journalOrRepository: source.journal_or_repository,
    doi: source.doi,
    pmid: source.pmid,
    pmcid: source.pmcid,
    primaryUrl: source.primary_url,
    supplementaryUrl: source.supplementary_url,
    repositoryUrl: source.repository_url,
    verificationStatus: source.verification_status,
    verifiedLocation: source.verified_location,
    mappedSignalIds: [...source.mapped_signal_ids],
    mappedComponentIds: [...source.mapped_component_ids],
    mappedRelationIds: [...source.mapped_relation_ids],
    mappedRejectedIds: [...source.mapped_rejected_ids],
    accessedAt: source.accessed_at,
    revisionStatus: source.revision_status,
    lastVerifiedAt: source.last_verified_at,
    verificationBasis: [...source.verification_basis],
    changeReason: source.change_reason,
  };
  return {
    id: source.source_id,
    kind: sourceKind(source.source_type),
    label: source.title,
    citation,
    ...(locator === null ? {} : { locator }),
    isDemo: false,
    supports: unique([
      ...source.mapped_signal_ids,
      ...source.mapped_component_ids,
      ...source.mapped_relation_ids,
    ]),
    provenance,
    notes: compact([source.notes, source.verification_status, source.verified_location]),
  };
}

function admission(
  status: CatalogV2Admission['status'],
  simulationReady: boolean,
  constructionReady: boolean,
  sourceIds: string[],
  parameterContextId: string | null,
  rationale: string,
): CatalogV2Admission {
  const isDemo = status === 'runtime-demo';
  return {
    status,
    simulationReady,
    constructionReady,
    parameterSourceIds: unique(sourceIds),
    parameterContextId,
    demoBoundary: boundary(isDemo, isDemo ? 'Within-context normalized demo use only.' : 'No numerical runtime use is asserted.'),
    rationale,
  };
}

function recordProvenance(
  sourceIds: string[],
  parameterContextId: string | null,
  statement: string,
  isDemo: boolean,
  evidenceLocation: string,
  reconstructionStatus: string,
  revisionStatus: string,
  lastVerifiedAt: string,
  verificationBasis: string[],
): CatalogV2RecordProvenance {
  return {
    sourceIds: unique(sourceIds),
    parameterContextId,
    statement,
    isDemo,
    evidenceLocation,
    reconstructionStatus,
    revisionStatus,
    lastVerifiedAt,
    verificationBasis: [...verificationBasis],
  };
}

function boundary(isDemo: boolean, description: string): CatalogV2DemoBoundary {
  return {
    isDemo,
    description,
    permittedUses: isDemo ? ['within documented parameter context', 'normalized demo visualization'] : ['evidence review', 'calibration planning'],
    forbiddenUses: isDemo ? ['cross-context comparison', 'absolute calibration', 'automatic sender decomposition'] : ['numerical execution before calibration'],
  };
}

function compatibilityKind(
  relationType: string,
): 'compatible' | 'no-response' | 'requires-calibration' | 'incompatible' {
  if (relationType.includes('no_response')) return 'no-response';
  if (relationType.includes('construction_failure') || relationType.includes('incompatible'))
    return 'incompatible';
  if (
    relationType === 'activation' ||
    relationType.includes('orthogonality') ||
    relationType.includes('communication')
  )
    return 'compatible';
  return 'requires-calibration';
}

function sourceKind(
  sourceType: string,
): 'primary-paper' | 'database' | 'registry' | 'supplement' | 'legacy-catalog' | 'development-fixture' {
  if (sourceType === 'primary_research_article') return 'primary-paper';
  if (sourceType === 'publisher_supplement') return 'supplement';
  if (sourceType === 'plasmid_repository' || sourceType === 'part_repository') return 'registry';
  if (sourceType === 'chemical_database') return 'database';
  return 'database';
}

function canonicalStatus(
  value: string,
): 'runtime-quantitative' | 'runtime-demo' | 'compatibility-only' | 'calibration-candidate' | 'reference-only' | 'rejected' {
  const status = value.replace(/_/gu, '-');
  if (
    status === 'runtime-quantitative' ||
    status === 'runtime-demo' ||
    status === 'compatibility-only' ||
    status === 'calibration-candidate' ||
    status === 'reference-only' ||
    status === 'rejected'
  )
    return status;
  return 'reference-only';
}

function compact(values: readonly (string | null | undefined)[]): string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
