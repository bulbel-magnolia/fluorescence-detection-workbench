import { expect, it } from 'vitest';
import pollutantSensors from './pollutantSensors.json';
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

it('contains exactly the nine approved pollutant IDs', () => {
  const result = validateCatalogFile(pollutantSensors, 'pollutant-sensor', validatedManifest);
  expect(
    result,
    result.ok ? 'catalog valid' : JSON.stringify(result.errors, null, 2),
  ).toMatchObject({
    ok: true,
  });
  if (!result.ok) return;
  expect(result.value.entries.map((entry) => entry.id)).toEqual(
    EXPECTED_ENTRY_IDS['pollutant-sensor'],
  );
});

it('records the CadR native public accessions without claiming a complete build sequence', () => {
  const result = validateCatalogFile(pollutantSensors, 'pollutant-sensor', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  const cadr = result.value.entries.find((entry) => entry.id === 'sensor.cadr');
  expect(cadr?.sequence.status).toBe('partial-public');
  expect(cadr?.sequence.isCompleteSingleSequence).toBe(false);
  expect(cadr?.sequence.records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ accession: 'NZ_BDEP01000008.1' }),
      expect.objectContaining({
        accession: 'WP_064701589.1',
        sequenceType: 'regulator',
        complete: true,
      }),
    ]),
  );
});

it('marks source loci as partial context rather than complete catalog constructs', () => {
  const result = validateCatalogFile(pollutantSensors, 'pollutant-sensor', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;

  const cadr = result.value.entries.find((entry) => entry.id === 'sensor.cadr');
  const chrb = result.value.entries.find((entry) => entry.id === 'sensor.chrb');
  expect(cadr?.sequence.records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ accession: 'NZ_BDEP01000008.1', complete: false }),
      expect.objectContaining({ accession: 'WP_064701589.1', complete: true }),
    ]),
  );
  expect(cadr?.sequence.isCompleteSingleSequence).toBe(false);
  expect(chrb?.sequence.records).toEqual(
    expect.arrayContaining([expect.objectContaining({ accession: 'EF469735', complete: false })]),
  );
  expect(chrb?.sequence.isCompleteSingleSequence).toBe(false);
});

it('treats Cr(III) as a non-inducing control without inferring a negative response', () => {
  const result = validateCatalogFile(pollutantSensors, 'pollutant-sensor', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;

  const chrb = result.value.entries.find((entry) => entry.id === 'sensor.chrb');
  const inputs = chrb?.signals.inputs;
  expect(Array.isArray(inputs)).toBe(true);
  if (!Array.isArray(inputs)) return;
  expect(inputs.find((input) => input.id === 'chromium-iii')).toMatchObject({
    direction: 'unknown',
    directObservation: true,
  });
});

it('retains the exact reviewed NarX and NahR citation titles', () => {
  const result = validateCatalogFile(pollutantSensors, 'pollutant-sensor', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;

  const narx = result.value.entries.find((entry) => entry.id === 'sensor.narx-narl');
  const nahr = result.value.entries.find((entry) => entry.id === 'sensor.nahr');
  expect(
    narx?.literature.find((source) => source.id === 'lee-1999-narx-phosphorylation')?.title,
  ).toBe(
    'Signal-dependent phosphorylation of the membrane-bound NarX two-component sensor-transmitter protein of Escherichia coli: nitrate elicits a superior anion ligand response compared to nitrite.',
  );
  expect(nahr?.literature.find((source) => source.id === 'schell-poser-1989-psal')?.title).toBe(
    'Demonstration, characterization, and mutational analysis of NahR protein binding to nah and sal promoters.',
  );
});

it('does not pass CadR with the Staphylococcus aureus CadC/PcadA substitute', () => {
  const result = validateCatalogFile(pollutantSensors, 'pollutant-sensor', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  const cadr = result.value.entries.find((entry) => entry.id === 'sensor.cadr');
  expect(cadr?.curation.auditChecks.cadRSupplementChecked).toBe(true);
  expect(JSON.stringify(cadr)).not.toMatch(/Staphylococcus aureus CadC\/PcadA/i);
});
