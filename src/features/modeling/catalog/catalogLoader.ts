import manifestJson from './catalogManifest.json';
import controlOutputPartsJson from './controlOutputParts.json';
import pollutantSensorsJson from './pollutantSensors.json';
import qsSystemsJson from './qsSystems.json';
import { buildCatalogIndex } from './catalogIndex';
import type { CatalogIndex } from './catalogIndex';
import { validateCatalogBundle } from './catalogValidator';

export type CatalogLoadResult =
  | { status: 'ready'; index: CatalogIndex }
  | {
      status: 'unavailable';
      message: string;
      errors: readonly { path: string; message: string }[];
    };

export function loadEvidenceCatalog(): CatalogLoadResult {
  const result = validateCatalogBundle({
    manifest: manifestJson,
    files: {
      qsSystems: qsSystemsJson,
      pollutantSensors: pollutantSensorsJson,
      controlOutputParts: controlOutputPartsJson,
    },
  });
  if (!result.ok) {
    return {
      status: 'unavailable',
      message: 'Evidence-backed catalog unavailable',
      errors: result.errors,
    };
  }

  const indexed = buildCatalogIndex(result.value);
  if (indexed.status !== 'ready') {
    return {
      status: 'unavailable',
      message: 'Evidence-backed catalog unavailable',
      errors: indexed.errors,
    };
  }

  return { status: 'ready', index: indexed.index };
}
