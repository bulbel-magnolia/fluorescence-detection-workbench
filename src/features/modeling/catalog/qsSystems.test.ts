import { expect, it } from 'vitest';

import qsSystems from './qsSystems.json';
import manifest from './catalogManifest.json';
import {
  CATALOG_ID,
  CATALOG_VERSION,
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

it('contains exactly the five approved QS IDs and passes the file guard', () => {
  const result = validateCatalogFile(qsSystems, 'qs-system', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  expect(result.value.entries.map((entry) => entry.id)).toEqual(EXPECTED_ENTRY_IDS['qs-system']);
  expect(
    result.value.entries.every(
      (entry) => entry.catalogId === CATALOG_ID && entry.catalogVersion === CATALOG_VERSION,
    ),
  ).toBe(true);
});
