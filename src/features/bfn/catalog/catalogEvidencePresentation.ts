export type BfnCatalogEvidenceCategory =
  | 'evidence-gap'
  | 'response-class'
  | 'observed-effect'
  | 'compatibility-relation'
  | 'qualitative-outcome'
  | 'source-model'
  | 'fit-status'
  | 'approximation-qualifier'
  | 'sequence-status'
  | 'sequence-source-type'
  | 'sequence-verification-status'
  | 'missing-sequence-element'
  | 'measurement-detail-key';

export type BfnCatalogEvidenceTranslate = (key: string) => string;

const evidenceGapKeys: Readonly<Record<string, string>> = {
  absolute_hsl_calibration_unavailable: 'absoluteHslCalibrationUnavailable',
  complete_product_spectrum_unavailable: 'completeProductSpectrumUnavailable',
  complete_sequence_not_embedded_in_release: 'completeSequenceNotEmbedded',
  datasheet_numeric_values_not_reingested: 'datasheetNumericValuesNotReingested',
  direct_hsl_concentration_unavailable: 'directHslConcentrationUnavailable',
  direct_intermediate_ahl_concentration_unavailable:
    'directIntermediateAhlConcentrationUnavailable',
  full_pair_sequence_checksum_not_revalidated: 'fullPairSequenceChecksumNotRevalidated',
  full_sequence_not_embedded_in_release: 'fullSequenceNotEmbedded',
};

const responseClassKeys: Readonly<Record<string, string>> = {
  activation_partial: 'activationPartial',
  activation_strong: 'activationStrong',
  end_to_end_effective: 'endToEndEffective',
  no_response_in_liquid_assay: 'noResponseInLiquidAssay',
};

const observedEffectKeys: Readonly<Record<string, string>> = {
  '3-methylbenzoate-induced sender produced a cognate receiver GFP response in one-strain and/or two-strain configurations':
    'methylbenzoateCognateGfpResponse',
  'above background but below constitutive EGFP control': 'aboveBackgroundBelowControl',
  'did not activate F2620_EGFP above background in the liquid supernatant assay':
    'noF2620ActivationAboveBackground',
  'full response at 25% and 50% supernatant': 'fullResponseAtFractions',
  'reached control-level response across tested supernatant fractions':
    'controlLevelAcrossFractions',
};

const compatibilityRelationKeys: Readonly<Record<string, string>> = {
  activation: 'activation',
  ambiguous_fit: 'ambiguousFit',
  anomalous_parameter: 'anomalousParameter',
  complete_orthogonality: 'completeOrthogonality',
  constraint_hit: 'constraintHit',
  construction_failure_in_context: 'constructionFailureInContext',
  end_to_end_qualitative_communication: 'endToEndQualitativeCommunication',
  high_basal_leakage: 'highBasalLeakage',
  no_response_or_nonconvergent: 'noResponseOrNonconvergent',
  promoter_crosstalk: 'promoterCrosstalk',
  promoter_orthogonal_signal_crosstalk: 'promoterOrthogonalSignalCrosstalk',
  signal_crosstalk: 'signalCrosstalk',
  signal_orthogonality: 'signalOrthogonality',
};

const qualitativeOutcomeKeys: Readonly<Record<string, string>> = {
  'activated LasR can activate Plux': 'activatedLasRActivatesPlux',
  activation_partial: 'activationPartial',
  activation_strong: 'activationStrong',
  'dose-dependent cognate activation': 'doseDependentCognateActivation',
  'high basal/leaky output at 8 h': 'highBasalOutputAtEightHours',
  'Las and Tra were promoter-orthogonal but showed two-way signal crosstalk':
    'lasTraPromoterOrthogonalSignalCrosstalk',
  'Lux and Rpa are signal-orthogonal in the tested modules': 'luxRpaSignalOrthogonal',
  'LuxR responds to Las-system signal 3OC12-HSL': 'luxRRespondsToLasSignal',
  'no induction at tested cognate concentrations': 'noInductionAtTestedConcentrations',
  no_response_in_liquid_assay: 'noResponseInLiquidAssay',
  'not admitted for numerical runtime': 'notUsedForNumericalSimulation',
  'Rpa and Tra showed neither signal nor promoter crosstalk': 'rpaTraNoCrosstalk',
};

const sourceModelKeys: Readonly<Record<string, string>> = {
  approximate_half_maximum: 'approximateHalfMaximum',
  dose_response: 'doseResponse',
  four_parameter_logistic: 'fourParameterLogistic',
  hill_activation: 'hillActivation',
  hill_equation_n_fixed_1: 'hillEquationNFixedOne',
  historical_datasheet: 'historicalDatasheet',
};

const fitStatusKeys: Readonly<Record<string, string>> = {
  approximate_reported: 'approximateReported',
  converged_positive_response: 'convergedPositiveResponse',
  converged_reported: 'convergedReported',
  curve_reported_without_reingested_fit: 'curveReportedWithoutReingestedFit',
  excluded_from_runtime_fit: 'excludedFromRuntimeFit',
  fitted_reported: 'fittedReported',
  parameter_unavailable: 'parameterUnavailable',
  reported_range_conflict: 'reportedRangeConflict',
  source_curve_available: 'sourceCurveAvailable',
};

const approximationQualifierKeys: Readonly<Record<string, string>> = {
  'approximate Km; βmax 31.2 units/min': 'approximateKm31',
  'approximate Km; βmax 41.5 units/min': 'approximateKm41',
  'approximately 0.5 nM EC50 and approximately 28-fold response': 'approximateEc50AndFold',
  'approximately 1×10^-9 M': 'approximatelyOneNanomolar',
  'between 1×10^-7 and 1×10^-6 M for 3-oxo HSLs': 'threeOxoRange',
  'between 1×10^-9 and 1×10^-8 M': 'nanomolarRange',
  'KD(app) 210 ± 110 nM': 'apparentKd',
  'main text reports approximately 5×10^-7 M in one passage and 1×10^-7 M in another; preserved as a range':
    'conflictingMainTextRange',
};

const sequenceStatusKeys: Readonly<Record<string, string>> = {
  addgene_or_paper_construct_available:
    'bfn.catalogDetail.component.sequenceStatuses.addgene_or_paper_construct_available',
  formal_repository_file_verified:
    'bfn.catalogDetail.component.sequenceStatuses.formal_repository_file_verified',
  registry_construct_available:
    'bfn.catalogDetail.component.sequenceStatuses.registry_construct_available',
  registry_sequence_available:
    'bfn.catalogDetail.component.sequenceStatuses.registry_sequence_available',
  repository_available_not_embedded:
    'bfn.catalogDetail.component.sequenceStatuses.repository_available_not_embedded',
  supplement_metadata_available:
    'bfn.catalogDetail.component.sequenceStatuses.supplement_metadata_available',
};

const sequenceSourceTypeKeys: Readonly<Record<string, string>> = {
  'Addgene plasmid records': 'addgenePlasmidRecords',
  'iGEM Registry composite part': 'igemRegistryCompositePart',
  'iGEM Registry part record': 'igemRegistryPartRecord',
  'Zenodo GenBank file': 'zenodoGenbankFile',
};

const sequenceVerificationStatusKeys: Readonly<Record<string, string>> = {
  'plasmid identities and backbone pair verified; full sequence payload not re-hashed':
    'plasmidAndBackboneVerified',
  'plasmid identity and mutation mapping verified; full plasmid sequence not re-hashed':
    'plasmidAndMutationVerified',
  'Registry identifier verified from article Data Availability; nucleotide payload not re-hashed':
    'registryIdentifierVerified',
  'Registry identity and component composition verified; release-local checksum not computed':
    'registryCompositionVerified',
  'repository_file_identity_verified; nucleotide payload not embedded or re-hashed in this release':
    'repositoryFileIdentityVerified',
};

const missingSequenceElementKeys: Readonly<Record<string, string>> = {
  full_pair_sequence_checksum: 'fullPairSequenceChecksum',
  'historical datasheet raw numeric table': 'historicalDatasheetNumericTable',
  'release-local full plasmid checksum': 'releaseLocalFullPlasmidChecksum',
  'release-local sequence checksum': 'releaseLocalSequenceChecksum',
};

const measurementDetailKeyKeys: Readonly<Record<string, string>> = {
  acquisition_volume: 'acquisitionVolume',
  bl1_voltage: 'bl1Voltage',
  flow_rate: 'flowRate',
  fsc_threshold: 'fscThreshold',
  fsc_voltage: 'fscVoltage',
  population_gate: 'populationGate',
  sample_dilution: 'sampleDilution',
  ssc_threshold: 'sscThreshold',
  ssc_voltage: 'sscVoltage',
  target_events: 'targetEvents',
};

const translationMaps: Readonly<
  Record<BfnCatalogEvidenceCategory, Readonly<Record<string, string>>>
> = {
  'evidence-gap': prefixKeys('bfn.catalogEvidence.evidenceGaps', evidenceGapKeys),
  'response-class': prefixKeys('bfn.catalogEvidence.responseClasses', responseClassKeys),
  'observed-effect': prefixKeys('bfn.catalogEvidence.observedEffects', observedEffectKeys),
  'compatibility-relation': prefixKeys(
    'bfn.catalogEvidence.compatibilityRelations',
    compatibilityRelationKeys,
  ),
  'qualitative-outcome': prefixKeys(
    'bfn.catalogEvidence.qualitativeOutcomes',
    qualitativeOutcomeKeys,
  ),
  'source-model': prefixKeys('bfn.catalogEvidence.sourceModels', sourceModelKeys),
  'fit-status': prefixKeys('bfn.catalogEvidence.fitStatuses', fitStatusKeys),
  'approximation-qualifier': prefixKeys(
    'bfn.catalogEvidence.approximationQualifiers',
    approximationQualifierKeys,
  ),
  'sequence-status': sequenceStatusKeys,
  'sequence-source-type': prefixKeys(
    'bfn.catalogEvidence.sequenceSourceTypes',
    sequenceSourceTypeKeys,
  ),
  'sequence-verification-status': prefixKeys(
    'bfn.catalogEvidence.sequenceVerificationStatuses',
    sequenceVerificationStatusKeys,
  ),
  'missing-sequence-element': prefixKeys(
    'bfn.catalogEvidence.missingSequenceElements',
    missingSequenceElementKeys,
  ),
  'measurement-detail-key': prefixKeys(
    'bfn.catalogEvidence.measurementDetailKeys',
    measurementDetailKeyKeys,
  ),
};

export function hasBfnCatalogEvidencePresentation(
  category: BfnCatalogEvidenceCategory,
  rawValue: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(translationMaps[category], rawValue);
}

export function bfnCatalogEvidenceText(
  category: BfnCatalogEvidenceCategory,
  rawValue: string,
  t: BfnCatalogEvidenceTranslate,
): string {
  const translationKey = translationMaps[category][rawValue];
  return t(translationKey ?? 'bfn.catalogEvidence.additionalInformation');
}

function prefixKeys(
  prefix: string,
  values: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(values).map(([rawValue, suffix]) => [rawValue, `${prefix}.${suffix}`]),
  );
}
