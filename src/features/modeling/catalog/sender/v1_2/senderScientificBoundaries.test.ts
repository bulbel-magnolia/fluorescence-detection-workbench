import { describe, expect, it } from 'vitest';
import { loadAhlHslCatalogRelease } from '../../v2/catalogReleaseLoader';
import { senderEvidenceScopes } from './senderEvidencePresentation';
import { loadSenderEvidenceExtension } from './senderExtensionLoader';
import {
  assessSenderExtensionRuntimeAdmissions,
  type BfnSenderRuntimeAdmission,
} from './senderRuntimeAdmission';

describe('Sender V1.2 scientific evidence boundaries', () => {
  const extension = loadSenderEvidenceExtension();
  const assessments = assessSenderExtensionRuntimeAdmissions(
    extension,
    loadAhlHslCatalogRelease().release,
  );

  it('does not instantiate cell-free enzyme kinetics as a cellular sender', () => {
    const id = 'sout.christensen2014.bjai.ivcoa.kinetics.v1';
    const output = requiredOutput(id);
    expect(scopesFor(id)).toContain('enzyme_kinetics');
    expect(output.output_definition.kind).toBe('production_rate');
    expect(requiredAdmission(id).reasons).toEqual(
      expect.arrayContaining([
        'enzyme_kinetics_scope_mismatch',
        'missing_required_parameter',
        'missing_model_validation',
      ]),
    );
  });

  it('does not decompose whole-system sender-receiver evidence', () => {
    const id = 'sout.daer2018.aubi.v1.end-to-end.v1';
    const output = requiredOutput(id);
    expect(scopesFor(id)).toContain('effective_pair_only');
    expect(output.output_signal_id).toBeNull();
    expect(requiredAdmission(id).reasons).toEqual(
      expect.arrayContaining([
        'missing_output_signal',
        'effective_pair_only',
        'decomposition_prohibited',
      ]),
    );
  });

  it('retains mixed non-detections as evidence states, never numeric zeroes', () => {
    const output = extension.outputsDocument.sender_outputs.find((candidate) =>
      extension.rawPoints.some(
        (point) => point.sender_output_id === candidate.id && point.detection_status === 'ND',
      ),
    );
    if (!output) throw new Error('Expected a real output containing ND evidence.');
    const points = extension.rawPoints.filter((point) => point.sender_output_id === output.id);
    expect(senderEvidenceScopes(output, points, [])).toContain('non_detection');
    expect(
      points
        .filter((point) => point.detection_status === 'ND')
        .every((point) => point.output_value === null),
    ).toBe(true);
  });

  function requiredOutput(id: string) {
    const output = extension.outputsDocument.sender_outputs.find((item) => item.id === id);
    if (!output) throw new Error('Missing real Sender V1.2 fixture: ' + id);
    return output;
  }

  function requiredAdmission(id: string): BfnSenderRuntimeAdmission {
    const admission = assessments.find((item) => item.senderOutputId === id)?.admission;
    if (!admission) throw new Error('Missing admission assessment: ' + id);
    return admission;
  }

  function scopesFor(id: string) {
    const output = requiredOutput(id);
    return senderEvidenceScopes(
      output,
      extension.rawPoints.filter((point) => point.sender_output_id === id),
      extension.functionParameters.filter((parameter) => parameter.sender_output_id === id),
    );
  }
});
