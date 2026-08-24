import { expect, it } from 'vitest';

import controlOutputParts from './controlOutputParts.json';
import manifest from './catalogManifest.json';
import {
  EXPECTED_ENTRY_IDS,
  validateCatalogFile,
  validateCatalogManifest,
} from './catalogValidator';

const manifestResult = validateCatalogManifest(manifest);
if (!manifestResult.ok) {
  throw new Error(
    manifestResult.errors.map((error) => `${error.path}: ${error.message}`).join('; '),
  );
}
const validatedManifest = manifestResult.value;

it('contains exactly the thirteen approved control/output IDs', () => {
  const result = validateCatalogFile(controlOutputParts, 'control-output', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  expect(result.value.entries.map((entry) => entry.id)).toEqual(
    EXPECTED_ENTRY_IDS['control-output'],
  );
});

it('does not claim a family or library is one complete sequence', () => {
  const result = validateCatalogFile(controlOutputParts, 'control-output', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  expect(
    result.value.entries
      .filter((entry) => entry.entityType === 'family' || entry.entityType === 'library')
      .every((entry) => !entry.sequence.isCompleteSingleSequence),
  ).toBe(true);
});

it('preserves exact family and library entity boundaries', () => {
  const result = validateCatalogFile(controlOutputParts, 'control-output', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;

  expect(
    Object.fromEntries(
      result.value.entries
        .filter((entry) =>
          [
            'control.mutalik-bcd-library',
            'control.anderson-j231-library',
            'control.star',
            'control.toehold-switch',
            'control.ssra-asv-aav-family',
          ].includes(entry.id),
        )
        .map((entry) => [entry.id, entry.entityType]),
    ),
  ).toEqual({
    'control.mutalik-bcd-library': 'library',
    'control.anderson-j231-library': 'library',
    'control.star': 'family',
    'control.toehold-switch': 'family',
    'control.ssra-asv-aav-family': 'family',
  });
});

it('keeps exact sequence and reporter modeling boundaries', () => {
  const result = validateCatalogFile(controlOutputParts, 'control-output', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;

  const byId = new Map(result.value.entries.map((entry) => [entry.id, entry]));
  const anderson = byId.get('control.anderson-j231-library');
  const ssrA = byId.get('control.ssra-asv-aav-family');
  const sfGfp = byId.get('output.sfgfp');
  const mNeonGreen = byId.get('output.mneongreen');

  expect(anderson).toBeDefined();
  expect(ssrA).toBeDefined();
  expect(sfGfp).toBeDefined();
  expect(mNeonGreen).toBeDefined();
  if (!anderson || !ssrA || !sfGfp || !mNeonGreen) return;

  expect(Array.isArray(anderson.sequence.records)).toBe(true);
  if (!Array.isArray(anderson.sequence.records)) return;
  expect(anderson.sequence.records).toHaveLength(20);
  expect(anderson.sequence.records.every((record) => record.kind === 'Registry')).toBe(true);
  expect(anderson.sequence.records.map((record) => record.accession)).toEqual(
    Array.from({ length: 20 }, (_, index) => `BBa_J231${index.toString().padStart(2, '0')}`),
  );

  expect(ssrA.modeling.compatibleNodeKinds).toEqual(['response']);
  expect(sfGfp.modeling.compatibleNodeKinds).toEqual(['reporter']);
  expect(mNeonGreen.modeling.compatibleNodeKinds).toEqual(['reporter']);

  expect(sfGfp.evidence.boundaryNotes).toContain(
    'sfGFP is distinct from GFP-LVA and other degradation-tagged GFP variants.',
  );
  expect(Array.isArray(mNeonGreen.sequence.records)).toBe(true);
  if (!Array.isArray(mNeonGreen.sequence.records)) return;
  expect(mNeonGreen.sequence.records).toHaveLength(1);
  expect(mNeonGreen.sequence.records[0]).toMatchObject({
    kind: 'GenBank',
    accession: 'KC295282.1',
    complete: true,
  });
});

it('describes native AmtR as nitrogen responsive without unsupported GlnK detail', () => {
  const result = validateCatalogFile(controlOutputParts, 'control-output', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;

  const amtR = result.value.entries.find((entry) => entry.id === 'control.amtr');
  expect(amtR).toBeDefined();
  expect(JSON.stringify(amtR)).not.toContain('GlnK');
  expect(JSON.stringify(amtR)).toContain('nitrogen-responsive');
});
