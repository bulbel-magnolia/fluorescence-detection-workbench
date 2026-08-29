import { describe, expect, it } from 'vitest';
import { loadAhlHslCatalogRelease } from '../../v2/catalogReleaseLoader';
import { senderEvidenceScopes } from './senderEvidencePresentation';
import { loadSenderEvidenceExtension } from './senderExtensionLoader';
import type { SenderOutputRecord, SenderRawPointRecord } from './senderExtensionTypes';
import {
  assessBfnSenderRuntimeAdmission,
  assessSenderExtensionRuntimeAdmissions,
} from './senderRuntimeAdmission';

describe('Sender Runtime Admission V1.2 contract', () => {
  const base = loadAhlHslCatalogRelease().release;
  const extension = loadSenderEvidenceExtension();
  const assessments = assessSenderExtensionRuntimeAdmissions(extension, base);

  it('hard-regresses the inspected release to zero admitted sender outputs', () => {
    expect(assessments).toHaveLength(53);
    expect(assessments.filter((item) => item.admission.admitted)).toHaveLength(0);
    expect(
      assessments.every((item) => item.admission.reasons.includes('execution_not_authorized')),
    ).toBe(true);
  });

  it('uses evidence rules rather than a release-version rejection shortcut', () => {
    const source = requiredOutput('sout.vanaalst2025.aaa063.cepi.v1.c8hsl.v1');
    const output: SenderOutputRecord = {
      ...source,
      numerical_execution_allowed: true,
      input_definition: {
        kind: 'inducer_concentration',
        signal_id: null,
        name: 'documented control input',
        unit: 'nM',
        working_range: [0, 2],
      },
      model: {
        ...source.model,
        model_type: 'lookup_table',
        valid_input_range: [0, 2],
      },
      measurement: { ...source.measurement, direct_signal_measurement: true },
      missing_fields: [],
      notes: [],
    };
    const rawPoints = [0, 1, 2].map((inputValue, index): SenderRawPointRecord => ({
      ...extension.rawPoints[0]!,
      raw_point_id: 'admission-proof-' + index,
      sender_output_id: output.id,
      sender_component_id: output.sender_component_id,
      parameter_context_id: output.parameter_context_id,
      signal_id: output.output_signal_id,
      input_kind: 'inducer_concentration',
      input_name: output.input_definition.name,
      input_value: inputValue,
      input_unit: 'nM',
      output_value: index + 1,
      output_unit: 'nM',
      detection_status: 'quantified',
      output_lower_bound: null,
      output_upper_bound: null,
      fit_eligible: false,
    }));
    const admission = assessBfnSenderRuntimeAdmission({
      output,
      senderComponentResolved: true,
      outputSignalResolved: true,
      parameterContextResolved: true,
      provenanceResolved: true,
      rawPoints,
      functionParameters: [],
    });
    expect(admission).toEqual({
      admitted: true,
      reasons: [],
      outputPort: {
        entityId: 'ahl.c8.stereo-unspecified',
        quantityType: 'concentration',
        unit: 'nM',
      },
    });
    expect(admission).not.toHaveProperty('score');
  });

  it('does not infer a continuous curve from a two-level endpoint record', () => {
    const admission = requiredAssessment('sout.vanaalst2025.aaa063.cepi.v1.c8hsl.v1');
    expect(admission.reasons).toEqual(
      expect.arrayContaining([
        'execution_not_authorized',
        'missing_executable_model',
        'endpoint_only',
      ]),
    );
  });

  it('keeps fixed-induction time course evidence separate from input response', () => {
    const id = 'sout.kokarakis2023.1017ec.luxi.v1.concentration.v1';
    const output = requiredOutput(id);
    expect(scopesFor(output)).toContain('fixed_condition_time_course');
    expect(requiredAssessment(id).reasons).toContain('time_course_not_input_response');
  });

  it('keeps production rate distinct from concentration and rejects its unsupported unit', () => {
    const id = 'sout.kokarakis2023.1017ec.luxi.v1.productivity.v1';
    const output = requiredOutput(id);
    expect(scopesFor(output)).toContain('production_rate');
    expect(output.output_definition.unit).toBe('nmol gDW^-1 h^-1');
    expect(requiredAssessment(id).reasons).toContain('unsupported_output_unit');
  });

  function requiredOutput(id: string): SenderOutputRecord {
    const output = extension.outputsDocument.sender_outputs.find((item) => item.id === id);
    if (!output) throw new Error('Missing real Sender V1.2 fixture: ' + id);
    return output;
  }

  function requiredAssessment(id: string) {
    const admission = assessments.find((item) => item.senderOutputId === id)?.admission;
    if (!admission) throw new Error('Missing admission assessment: ' + id);
    return admission;
  }

  function scopesFor(output: SenderOutputRecord) {
    return senderEvidenceScopes(
      output,
      extension.rawPoints.filter((point) => point.sender_output_id === output.id),
      extension.functionParameters.filter((parameter) => parameter.sender_output_id === output.id),
    );
  }
});
