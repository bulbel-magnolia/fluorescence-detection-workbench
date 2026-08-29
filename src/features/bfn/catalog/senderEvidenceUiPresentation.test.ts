import { describe, expect, it } from 'vitest';
import {
  loadSenderEvidenceExtension,
  type SenderRawPointRecord,
} from '../../modeling/catalog/sender/v1_2';
import {
  presentSenderKineticModel,
  presentSenderKineticParameters,
  presentSenderRawInput,
} from './senderEvidenceUiPresentation';

const extension = loadSenderEvidenceExtension();

describe('Sender evidence UI presentation', () => {
  it.each([
    {
      id: 'rp.0013',
      primary: '100 nM',
      secondary: 'peak near 13 h',
    },
    {
      id: 'rp.0001',
      primary: '0 g/L',
      secondary: 'no methionine',
    },
    {
      id: 'rp.0003',
      primary: '1 g/L',
      secondary: '1 g/L methionine',
    },
  ])('keeps the structured numeric input authoritative for $id', ({ id, primary, secondary }) => {
    const point = rawPoint(id);
    const before = structuredClone(point);

    expect(presentSenderRawInput(point)).toEqual({ primary, secondary });
    expect(point).toEqual(before);
  });

  it('uses labels and then input names only when the structured value is absent', () => {
    const source = rawPoint('rp.0013');
    const labelOnly: SenderRawPointRecord = {
      ...source,
      input_value: null,
      input_unit: null,
      input_label: 'fixed induction',
    };
    const nameOnly: SenderRawPointRecord = {
      ...labelOnly,
      input_label: null,
      input_name: 'reported condition',
    };

    expect(presentSenderRawInput(labelOnly)).toEqual({ primary: 'fixed induction' });
    expect(presentSenderRawInput(nameOnly)).toEqual({ primary: 'reported condition' });
  });

  it('maps real kinetic model codes without exposing unknown snake-case codes in primary UI', () => {
    expect(presentSenderKineticModel('reported_michaelis_menten')).toBe('michaelisMenten');
    expect(presentSenderKineticModel('reported_partial_substrate_inhibition')).toBe(
      'substrateInhibition',
    );
    expect(presentSenderKineticModel('some_new_internal_model')).toBe('reported');
  });

  it('structures the real Christensen parameters without mutating their raw evidence', () => {
    const record = extension.functionParameters.find(
      (value) => value.sender_output_id === 'sout.christensen2014.bjai.ivcoa.kinetics.v1',
    );
    if (!record) throw new Error('Expected the Christensen BjaI IV-CoA kinetics record.');
    const before = structuredClone(record.parameter_json);

    expect(presentSenderKineticParameters(record.parameter_json)).toEqual([
      { key: 'Km', symbol: 'Kₘ', value: '7', unit: 'µM', error: '0.5' },
      { key: 'kcat', symbol: 'kcat', value: '0.021', unit: 's⁻¹', error: '0.03' },
      {
        key: 'kcat_over_Km',
        symbol: 'kcat/Kₘ',
        value: '3000',
        unit: 'M⁻¹ s⁻¹',
        error: null,
      },
    ]);
    expect(record.parameter_json).toEqual(before);
  });

  it('retains unknown parameter identifiers and safely ignores unsupported nested shapes', () => {
    expect(
      presentSenderKineticParameters({
        SAM_fixed: { value: 1, unit: 'mM', source_note: 'reported condition' },
        future_parameter: { nested: { value: 2 } },
      }),
    ).toEqual([
      { key: 'SAM_fixed', symbol: 'SAM_fixed', value: '1', unit: 'mM', error: null },
      {
        key: 'future_parameter',
        symbol: 'future_parameter',
        value: null,
        unit: null,
        error: null,
      },
    ]);
  });
});

function rawPoint(id: string): SenderRawPointRecord {
  const point = extension.rawPoints.find((value) => value.raw_point_id === id);
  if (!point) throw new Error(`Expected Sender raw point ${id}.`);
  return point;
}
