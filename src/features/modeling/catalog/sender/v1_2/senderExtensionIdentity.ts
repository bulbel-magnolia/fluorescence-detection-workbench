import type { AhlHslComponentCatalogRelease } from '../../v2/releaseTypes';
import {
  SENDER_EXTENSION_EXPECTED_COUNTS,
  SENDER_EXTENSION_RELEASE_IDENTITY,
} from './senderExtensionManifest';
import type {
  SenderEvidenceExtension,
  SenderExtensionValidationIssue,
  SenderSourceRecord,
} from './senderExtensionTypes';
import { addSenderExtensionIssue, uniqueSenderIds } from './senderExtensionValidationUtils';

export function validateSenderExtensionIdentityAndBase(
  extension: SenderEvidenceExtension,
  base: AhlHslComponentCatalogRelease,
  errors: SenderExtensionValidationIssue[],
): void {
  validateReleaseIdentity(extension, errors);
  validateCounts(extension, errors);
  validateUniqueness(extension, errors);
  validateBaseBoundary(extension, base, errors);
  validateSourceReport(extension, errors);
}

function validateReleaseIdentity(
  extension: SenderEvidenceExtension,
  errors: SenderExtensionValidationIssue[],
): void {
  const componentMetadata = extension.componentsDocument.release_metadata;
  const outputMetadata = extension.outputsDocument.release_metadata;
  const expected = SENDER_EXTENSION_RELEASE_IDENTITY;
  equal(errors, 'release.release_name', componentMetadata.release_name, expected.releaseName);
  equal(errors, 'release.version', componentMetadata.version, expected.version);
  equal(errors, 'release.release_date', componentMetadata.release_date, expected.releaseDate);
  equal(errors, 'release.release_type', componentMetadata.release_type, expected.releaseType);
  equal(errors, 'release.base_release', componentMetadata.base_release, expected.baseRelease);
  equal(errors, 'release.base_sha256', componentMetadata.base_sha256, expected.baseSha256);
  if (componentMetadata.base_records_immutable !== true)
    addSenderExtensionIssue(
      errors,
      'release.base_records_immutable',
      'base-mutable',
      'must be true',
    );
  equal(errors, 'outputs.release_name', outputMetadata.release_name, expected.outputsReleaseName);
  equal(errors, 'outputs.version', outputMetadata.version, expected.version);
  equal(errors, 'outputs.release_date', outputMetadata.release_date, expected.releaseDate);
  equal(errors, 'outputs.base_sha256', outputMetadata.base_sha256, expected.baseSha256);
  if (outputMetadata.runtime_quantitative_count !== 0 || outputMetadata.runtime_demo_count !== 0)
    addSenderExtensionIssue(
      errors,
      'outputs.release_metadata',
      'unexpected-runtime-count',
      'current V1.2 release must declare zero runtime sender outputs',
    );
}

function validateCounts(
  extension: SenderEvidenceExtension,
  errors: SenderExtensionValidationIssue[],
): void {
  const counts = SENDER_EXTENSION_EXPECTED_COUNTS;
  count(errors, 'new_signals', extension.componentsDocument.new_signals.length, counts.newSignals);
  count(
    errors,
    'new_sender_components',
    extension.componentsDocument.new_sender_components.length,
    counts.newComponents,
  );
  count(
    errors,
    'new_parameter_contexts',
    extension.componentsDocument.new_parameter_contexts.length,
    counts.newParameterContexts,
  );
  count(
    errors,
    'existing_v1_1_sender_component_links',
    extension.componentsDocument.existing_v1_1_sender_component_links.length,
    counts.existingV1_1ComponentLinks,
  );
  count(
    errors,
    'sender_outputs',
    extension.outputsDocument.sender_outputs.length,
    counts.senderOutputs,
  );
  count(errors, 'raw_points', extension.rawPoints.length, counts.rawPoints);
  count(
    errors,
    'function_parameters',
    extension.functionParameters.length,
    counts.functionParameterRows,
  );
  count(errors, 'sources', extension.sources.length, counts.sources);
  count(
    errors,
    'rejected_candidates',
    extension.rejectedCandidates.length,
    counts.rejectedCandidates,
  );
  count(errors, 'evidence_trace', extension.evidenceTrace.length, counts.evidenceTraceRows);
}

function validateUniqueness(
  extension: SenderEvidenceExtension,
  errors: SenderExtensionValidationIssue[],
): void {
  uniqueSenderIds(
    errors,
    'new_signals',
    extension.componentsDocument.new_signals.map((item) => item.id),
  );
  uniqueSenderIds(
    errors,
    'new_sender_components',
    extension.componentsDocument.new_sender_components.map((item) => item.id),
  );
  uniqueSenderIds(
    errors,
    'new_parameter_contexts',
    extension.componentsDocument.new_parameter_contexts.map((item) => item.id),
  );
  uniqueSenderIds(
    errors,
    'sender_outputs',
    extension.outputsDocument.sender_outputs.map((item) => item.id),
  );
  uniqueSenderIds(
    errors,
    'raw_points',
    extension.rawPoints.map((item) => item.raw_point_id),
  );
  uniqueSenderIds(
    errors,
    'sources',
    extension.sources.map((item) => item.source_id),
  );
  uniqueSenderIds(
    errors,
    'evidence_trace',
    extension.evidenceTrace.map((item) => item.trace_id),
  );
  uniqueSenderIds(
    errors,
    'rejected_candidates',
    extension.rejectedCandidates.map((item) => item.id),
  );
  uniqueSenderIds(
    errors,
    'existing_component_links.output',
    extension.componentsDocument.existing_v1_1_sender_component_links.map(
      (item) => item.new_sender_output_id,
    ),
  );
}

function validateBaseBoundary(
  extension: SenderEvidenceExtension,
  base: AhlHslComponentCatalogRelease,
  errors: SenderExtensionValidationIssue[],
): void {
  const baseSignalIds = new Set(base.signals.map((item) => item.id));
  const baseComponentIds = new Set(base.components.map((item) => item.id));
  const baseContextIds = new Set(base.parameter_contexts.map((item) => item.id));
  for (const signal of extension.componentsDocument.new_signals)
    if (baseSignalIds.has(signal.id))
      addSenderExtensionIssue(
        errors,
        signal.id,
        'base-overwrite',
        'new signal ID already exists in frozen V1.1',
      );
  for (const component of extension.componentsDocument.new_sender_components)
    if (baseComponentIds.has(component.id))
      addSenderExtensionIssue(
        errors,
        component.id,
        'base-overwrite',
        'new component ID already exists in frozen V1.1',
      );
  for (const context of extension.componentsDocument.new_parameter_contexts)
    if (baseContextIds.has(context.id))
      addSenderExtensionIssue(
        errors,
        context.id,
        'base-overwrite',
        'new context ID already exists in frozen V1.1',
      );

  const outputsById = new Map(
    extension.outputsDocument.sender_outputs.map((output) => [output.id, output]),
  );
  const linkedOutputIds = new Set<string>();
  for (const link of extension.componentsDocument.existing_v1_1_sender_component_links) {
    const baseComponent = base.components.find((item) => item.id === link.sender_component_id);
    if (!baseComponent || baseComponent.component_type !== 'sender')
      addSenderExtensionIssue(
        errors,
        link.sender_component_id,
        'unknown-base-sender',
        'link must reference a frozen V1.1 sender component',
      );
    if (link.base_record_modified !== false)
      addSenderExtensionIssue(
        errors,
        link.sender_component_id,
        'base-overwrite',
        'base record modification is forbidden',
      );
    const output = outputsById.get(link.new_sender_output_id);
    if (!output || output.sender_component_id !== link.sender_component_id)
      addSenderExtensionIssue(
        errors,
        link.new_sender_output_id,
        'broken-link',
        'linked output must resolve to the same frozen sender',
      );
    linkedOutputIds.add(link.new_sender_output_id);
  }
  for (const output of extension.outputsDocument.sender_outputs)
    if (baseComponentIds.has(output.sender_component_id) && !linkedOutputIds.has(output.id))
      addSenderExtensionIssue(
        errors,
        output.id,
        'missing-base-reference-link',
        'an output referencing V1.1 requires an explicit immutable link',
      );

  const baseSources = new Map(base.sources.map((source) => [source.source_id, source]));
  let reusedSourceCount = 0;
  for (const source of extension.sources) {
    const baseSource = baseSources.get(source.source_id);
    if (!baseSource) continue;
    reusedSourceCount += 1;
    if (
      source.verification_status !== 'verified_from_v1_1' ||
      !sameSourceCitation(source, baseSource)
    )
      addSenderExtensionIssue(
        errors,
        source.source_id,
        'base-source-overwrite',
        'reused source must retain the frozen V1.1 citation identity',
      );
  }
  count(
    errors,
    'reused_v1_1_sources',
    reusedSourceCount,
    SENDER_EXTENSION_EXPECTED_COUNTS.reusedV1_1Sources,
  );
  count(
    errors,
    'new_sources',
    extension.sources.length - reusedSourceCount,
    SENDER_EXTENSION_EXPECTED_COUNTS.newSources,
  );
}

function sameSourceCitation(
  source: SenderSourceRecord,
  base: AhlHslComponentCatalogRelease['sources'][number],
): boolean {
  return (
    source.authors === base.authors &&
    source.title === base.title &&
    source.year === (base.year ?? base.publication_year) &&
    source.journal === base.journal_or_repository &&
    source.doi === base.doi &&
    source.pmid === base.pmid &&
    source.pmcid === base.pmcid &&
    source.primary_url === base.primary_url &&
    source.supplementary_url === base.supplementary_url &&
    source.source_type === base.source_type
  );
}

function validateSourceReport(
  extension: SenderEvidenceExtension,
  errors: SenderExtensionValidationIssue[],
): void {
  const report = extension.validationReport;
  if (report.overall_status !== 'pass')
    addSenderExtensionIssue(
      errors,
      'validation.overall_status',
      'source-validation',
      'source report must pass',
    );
  if (report.checks.some((check) => !check.passed))
    addSenderExtensionIssue(
      errors,
      'validation.checks',
      'source-validation',
      'all source-package checks must pass',
    );
  equal(
    errors,
    'validation.base_release.sha256',
    report.base_release.sha256,
    SENDER_EXTENSION_RELEASE_IDENTITY.baseSha256,
  );
  if (!report.base_release.immutable)
    addSenderExtensionIssue(
      errors,
      'validation.base_release.immutable',
      'base-mutable',
      'must be true',
    );
  const expected = SENDER_EXTENSION_EXPECTED_COUNTS;
  const counts = report.counts;
  const comparisons: Array<readonly [string, number, number]> = [
    ['new_signals', counts.new_signals, expected.newSignals],
    ['new_components', counts.new_components, expected.newComponents],
    ['new_parameter_contexts', counts.new_parameter_contexts, expected.newParameterContexts],
    ['sender_outputs', counts.sender_outputs, expected.senderOutputs],
    ['raw_points', counts.raw_points, expected.rawPoints],
    ['function_parameter_rows', counts.function_parameter_rows, expected.functionParameterRows],
    ['sources', counts.sources, expected.sources],
    ['rejected_candidates', counts.rejected_candidates, expected.rejectedCandidates],
    ['evidence_trace_rows', counts.evidence_trace_rows, expected.evidenceTraceRows],
  ];
  for (const [name, actual, expectedCount] of comparisons)
    count(errors, 'validation.' + name, actual, expectedCount);
}

function equal(
  errors: SenderExtensionValidationIssue[],
  path: string,
  actual: unknown,
  expected: unknown,
): void {
  if (actual !== expected)
    addSenderExtensionIssue(errors, path, 'release-identity', 'must equal ' + String(expected));
}

function count(
  errors: SenderExtensionValidationIssue[],
  path: string,
  actual: number,
  expected: number,
): void {
  if (actual !== expected)
    addSenderExtensionIssue(
      errors,
      path,
      'record-count',
      'expected ' + expected + ', received ' + actual,
    );
}
