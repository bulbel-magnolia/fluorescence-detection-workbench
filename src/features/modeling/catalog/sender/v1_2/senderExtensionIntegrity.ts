import type { AhlHslComponentCatalogRelease } from '../../v2/releaseTypes';
import type {
  SenderEvidenceExtension,
  SenderExtensionValidationIssue,
} from './senderExtensionTypes';
import { addSenderExtensionIssue, requireSenderReferences } from './senderExtensionValidationUtils';

export function validateSenderExtensionIntegrity(
  extension: SenderEvidenceExtension,
  base: AhlHslComponentCatalogRelease,
  errors: SenderExtensionValidationIssue[],
): void {
  validateReferences(extension, base, errors);
  validateScientificNullAndRuntimeBoundaries(extension, errors);
  validateEmbeddedRawPoints(extension, errors);
  validateEvidenceTrace(extension, base, errors);
}

function validateReferences(
  extension: SenderEvidenceExtension,
  base: AhlHslComponentCatalogRelease,
  errors: SenderExtensionValidationIssue[],
): void {
  const signalIds = new Set([
    ...base.signals.map((item) => item.id),
    ...extension.componentsDocument.new_signals.map((item) => item.id),
  ]);
  const componentIds = new Set([
    ...base.components.map((item) => item.id),
    ...extension.componentsDocument.new_sender_components.map((item) => item.id),
  ]);
  const contextIds = new Set([
    ...base.parameter_contexts.map((item) => item.id),
    ...extension.componentsDocument.new_parameter_contexts.map((item) => item.id),
  ]);
  const sourceIds = new Set([
    ...base.sources.map((item) => item.source_id),
    ...extension.sources.map((item) => item.source_id),
  ]);
  const outputIds = new Set(extension.outputsDocument.sender_outputs.map((item) => item.id));
  const outputsById = new Map(
    extension.outputsDocument.sender_outputs.map((item) => [item.id, item]),
  );

  for (const signal of extension.componentsDocument.new_signals)
    requireSenderReferences(errors, signal.id, 'source', signal.source_ids, sourceIds);
  for (const context of extension.componentsDocument.new_parameter_contexts) {
    requireSenderReferences(errors, context.id, 'source', [context.source_id], sourceIds);
    requireSenderReferences(
      errors,
      context.id,
      'component',
      context.applicable_component_ids,
      componentIds,
    );
    requireSenderReferences(
      errors,
      context.id,
      'verification source',
      context.verification_basis,
      sourceIds,
    );
  }
  for (const component of extension.componentsDocument.new_sender_components) {
    requireSenderReferences(
      errors,
      component.id,
      'context',
      [component.parameter_context_id],
      contextIds,
    );
    requireSenderReferences(errors, component.id, 'source', component.source_ids, sourceIds);
    requireSenderReferences(
      errors,
      component.id,
      'verification source',
      component.verification_basis,
      sourceIds,
    );
    if (component.output_signal_id !== null)
      requireSenderReferences(
        errors,
        component.id,
        'signal',
        [component.output_signal_id],
        signalIds,
      );
  }
  for (const output of extension.outputsDocument.sender_outputs) {
    requireSenderReferences(
      errors,
      output.id,
      'component',
      [output.sender_component_id],
      componentIds,
    );
    requireSenderReferences(
      errors,
      output.id,
      'context',
      [output.parameter_context_id],
      contextIds,
    );
    requireSenderReferences(errors, output.id, 'source', output.source_ids, sourceIds);
    requireSenderReferences(
      errors,
      output.id,
      'verification source',
      output.verification_basis,
      sourceIds,
    );
    if (output.output_signal_id !== null)
      requireSenderReferences(
        errors,
        output.id,
        'output signal',
        [output.output_signal_id],
        signalIds,
      );
    if (output.input_definition.signal_id !== null)
      requireSenderReferences(
        errors,
        output.id,
        'input signal',
        [output.input_definition.signal_id],
        signalIds,
      );
    requireSenderReferences(
      errors,
      output.id,
      'product signal',
      output.product_profile.map((item) => item.signal_id),
      signalIds,
    );
  }
  for (const raw of extension.rawPoints) {
    const output = outputsById.get(raw.sender_output_id);
    if (!output)
      addSenderExtensionIssue(
        errors,
        raw.raw_point_id,
        'unknown-output',
        'raw point sender output is unresolved',
      );
    if (output && output.sender_component_id !== raw.sender_component_id)
      addSenderExtensionIssue(
        errors,
        raw.raw_point_id,
        'component-mismatch',
        'raw point component differs from output',
      );
    if (output && output.parameter_context_id !== raw.parameter_context_id)
      addSenderExtensionIssue(
        errors,
        raw.raw_point_id,
        'context-mismatch',
        'raw point context differs from output',
      );
    if (output && output.input_definition.kind !== raw.input_kind)
      addSenderExtensionIssue(
        errors,
        raw.raw_point_id,
        'input-kind-mismatch',
        'raw point input kind differs from output evidence',
      );
    requireSenderReferences(
      errors,
      raw.raw_point_id,
      'component',
      [raw.sender_component_id],
      componentIds,
    );
    requireSenderReferences(
      errors,
      raw.raw_point_id,
      'context',
      [raw.parameter_context_id],
      contextIds,
    );
    if (raw.signal_id !== null)
      requireSenderReferences(errors, raw.raw_point_id, 'signal', [raw.signal_id], signalIds);
    if (raw.source_id !== null)
      requireSenderReferences(errors, raw.raw_point_id, 'source', [raw.source_id], sourceIds);
  }
  for (const parameter of extension.functionParameters) {
    requireSenderReferences(
      errors,
      parameter.sender_output_id,
      'output',
      [parameter.sender_output_id],
      outputIds,
    );
    requireSenderReferences(
      errors,
      parameter.sender_output_id,
      'component',
      [parameter.sender_component_id],
      componentIds,
    );
    requireSenderReferences(
      errors,
      parameter.sender_output_id,
      'context',
      [parameter.parameter_context_id],
      contextIds,
    );
    requireSenderReferences(
      errors,
      parameter.sender_output_id,
      'source',
      [parameter.source_id],
      sourceIds,
    );
    const output = outputsById.get(parameter.sender_output_id);
    if (
      output &&
      (output.sender_component_id !== parameter.sender_component_id ||
        output.parameter_context_id !== parameter.parameter_context_id)
    )
      addSenderExtensionIssue(
        errors,
        parameter.sender_output_id,
        'parameter-scope-mismatch',
        'function parameter scope differs from the sender output',
      );
  }
  for (const rejected of extension.rejectedCandidates)
    requireSenderReferences(errors, rejected.id, 'source', rejected.source_ids, sourceIds);
}

function validateScientificNullAndRuntimeBoundaries(
  extension: SenderEvidenceExtension,
  errors: SenderExtensionValidationIssue[],
): void {
  for (const output of extension.outputsDocument.sender_outputs) {
    if (output.numerical_execution_allowed !== false)
      addSenderExtensionIssue(
        errors,
        output.id,
        'unexpected-runtime-authorization',
        'the inspected V1.2 record is not authorized for numerical execution',
      );
    if (output.software_status === 'effective_pair_only') {
      if (!output.decomposition_prohibited)
        addSenderExtensionIssue(
          errors,
          output.id,
          'pair-decomposition',
          'effective-pair evidence must prohibit decomposition',
        );
      if (output.output_signal_id !== null)
        addSenderExtensionIssue(
          errors,
          output.id,
          'pair-signal-inference',
          'effective-pair output signal must remain unmeasured',
        );
    }
  }
  for (const parameter of extension.functionParameters)
    if (parameter.runtime_allowed !== false)
      addSenderExtensionIssue(
        errors,
        parameter.sender_output_id,
        'unexpected-runtime-authorization',
        'function parameter row must remain non-runtime',
      );
  for (const raw of extension.rawPoints) {
    if (raw.fit_eligible)
      addSenderExtensionIssue(
        errors,
        raw.raw_point_id,
        'fit-not-authorized',
        'raw point must not be auto-fitted',
      );
    if (raw.detection_status === 'quantified' && raw.output_value === null)
      addSenderExtensionIssue(
        errors,
        raw.raw_point_id,
        'missing-value',
        'quantified point requires a numeric value',
      );
    if (raw.detection_status === 'ND') {
      if (raw.output_value !== null)
        addSenderExtensionIssue(
          errors,
          raw.raw_point_id,
          'nd-as-number',
          'non-detection must preserve null output',
        );
      if (raw.output_lower_bound !== null || raw.output_upper_bound !== null)
        addSenderExtensionIssue(
          errors,
          raw.raw_point_id,
          'invented-lod',
          'non-detection has no numeric bound in V1.2',
        );
    }
    if (
      raw.detection_status === 'reported_range' &&
      (raw.output_value !== null ||
        raw.output_lower_bound === null ||
        raw.output_upper_bound === null)
    )
      addSenderExtensionIssue(
        errors,
        raw.raw_point_id,
        'range-semantics',
        'reported range must remain bounds with a null point value',
      );
  }
}

function validateEmbeddedRawPoints(
  extension: SenderEvidenceExtension,
  errors: SenderExtensionValidationIssue[],
): void {
  for (const output of extension.outputsDocument.sender_outputs) {
    const rows = extension.rawPoints.filter((row) => row.sender_output_id === output.id);
    if (rows.length !== output.raw_points.length) {
      addSenderExtensionIssue(
        errors,
        output.id,
        'raw-point-count',
        'embedded raw-point count differs from sender_raw_points.csv',
      );
      continue;
    }
    output.raw_points.forEach((embedded, index) => {
      const row = rows[index];
      if (
        !row ||
        embedded.input !== row.input_value ||
        embedded.output !== row.output_value ||
        embedded.replicate_count !== row.replicate_count ||
        embedded.error_type !== row.error_type ||
        embedded.error_value !== row.error_value ||
        ('input_label' in embedded && embedded.input_label !== row.input_label)
      )
        addSenderExtensionIssue(
          errors,
          output.id + '.raw_points[' + index + ']',
          'raw-point-round-trip',
          'embedded point does not exactly resolve to the CSV evidence row',
        );
    });
  }
}

function validateEvidenceTrace(
  extension: SenderEvidenceExtension,
  base: AhlHslComponentCatalogRelease,
  errors: SenderExtensionValidationIssue[],
): void {
  const existingLinkIds = extension.componentsDocument.existing_v1_1_sender_component_links.map(
    (item) => item.sender_component_id,
  );
  const knownRecordIds = new Set([
    ...extension.componentsDocument.new_signals.map((item) => item.id),
    ...extension.componentsDocument.new_parameter_contexts.map((item) => item.id),
    ...extension.componentsDocument.new_sender_components.map((item) => item.id),
    ...existingLinkIds,
    ...extension.outputsDocument.sender_outputs.map((item) => item.id),
    ...extension.rawPoints.map((item) => item.raw_point_id),
    ...extension.sources.map((item) => item.source_id),
    ...extension.rejectedCandidates.map((item) => item.id),
  ]);
  const sourceIds = new Set([
    ...base.sources.map((item) => item.source_id),
    ...extension.sources.map((item) => item.source_id),
  ]);
  const rejectedWithoutSource = new Set(
    extension.rejectedCandidates
      .filter((item) => item.source_ids.length === 0)
      .map((item) => item.id),
  );
  const existingLinks = new Set(existingLinkIds);
  for (const trace of extension.evidenceTrace) {
    if (!knownRecordIds.has(trace.record_id))
      addSenderExtensionIssue(
        errors,
        trace.trace_id,
        'unknown-trace-record',
        'trace record ID is unresolved',
      );
    if (trace.source_id !== null && !sourceIds.has(trace.source_id))
      addSenderExtensionIssue(
        errors,
        trace.trace_id,
        'unknown-trace-source',
        'trace source ID is unresolved',
      );
    if (
      trace.source_id === null &&
      !existingLinks.has(trace.record_id) &&
      !rejectedWithoutSource.has(trace.record_id)
    )
      addSenderExtensionIssue(
        errors,
        trace.trace_id,
        'missing-trace-source',
        'source-less trace is not an explicit V1.1-link or source-less rejection record',
      );
  }
}
