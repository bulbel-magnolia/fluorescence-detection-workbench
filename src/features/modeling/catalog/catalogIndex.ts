import { EXPECTED_ENTRY_IDS, validateCatalogBundle } from './catalogValidator';
import {
  getCatalogInputMolecules,
  getCatalogNetworkRoles,
  getCatalogOutputMolecules,
  getCatalogParameterStatus,
} from './catalogPresentation';
import type {
  CatalogCategory,
  CatalogEntry,
  CatalogManifest,
  CatalogSearchFilters,
  CatalogValue,
} from './catalogTypes';

export interface CatalogIndex {
  catalogId: string;
  catalogVersion: string;
  manifest: CatalogManifest;
  entries: readonly CatalogEntry[];
  byId: ReadonlyMap<string, CatalogEntry>;
  tokensById: ReadonlyMap<string, readonly string[]>;
}

export interface CatalogBundleInput {
  manifest: unknown;
  files: Array<{ category: CatalogCategory; value: unknown }> | Record<string, never>;
}

export type CatalogIndexBuildResult =
  | { status: 'ready'; index: CatalogIndex }
  | {
      status: 'unavailable';
      errors: readonly { path: string; message: string }[];
    };

type ValidatedBundleInput = {
  manifest: CatalogManifest;
  files: Record<CatalogCategory, { entries: CatalogEntry[] }>;
};

const CATEGORY_ORDER: readonly CatalogCategory[] = [
  'qs-system',
  'pollutant-sensor',
  'control-output',
];

const FILE_KEY_BY_CATEGORY: Record<CatalogCategory, string> = {
  'qs-system': 'qsSystems',
  'pollutant-sensor': 'pollutantSensors',
  'control-output': 'controlOutputParts',
};

class ImmutableMapView<K, V> implements ReadonlyMap<K, V> {
  readonly #values: Map<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#values = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  get(key: K): V | undefined {
    return this.#values.get(key);
  }

  has(key: K): boolean {
    return this.#values.has(key);
  }

  entries(): MapIterator<[K, V]> {
    return this.#values.entries();
  }

  keys(): MapIterator<K> {
    return this.#values.keys();
  }

  values(): MapIterator<V> {
    return this.#values.values();
  }

  forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#values) callback.call(thisArg, value, key, this);
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
}

export function buildCatalogIndex(
  bundle: ValidatedBundleInput | CatalogBundleInput,
): CatalogIndexBuildResult {
  const canonical = toCanonicalBundle(bundle);
  if (!canonical.ok) return { status: 'unavailable', errors: canonical.errors };

  const validated = validateCatalogBundle(canonical.value);
  if (!validated.ok) {
    return {
      status: 'unavailable',
      errors: freezeErrors(validated.errors),
    };
  }

  const immutableBundle = deepFreeze(structuredClone(validated.value));
  const sourceEntriesById = new Map(
    CATEGORY_ORDER.flatMap((category) => immutableBundle.files[category].entries).map(
      (entry) => [entry.id, entry] as const,
    ),
  );
  const canonicalEntries: CatalogEntry[] = [];
  for (const category of CATEGORY_ORDER) {
    for (const entryId of EXPECTED_ENTRY_IDS[category]) {
      const entry = sourceEntriesById.get(entryId);
      if (!entry) {
        return {
          status: 'unavailable',
          errors: freezeErrors([
            {
              path: `bundle.files.${FILE_KEY_BY_CATEGORY[category]}.entries`,
              message: `is missing canonical entry ${entryId}`,
            },
          ]),
        };
      }
      canonicalEntries.push(entry);
    }
  }
  const entries = Object.freeze(canonicalEntries);
  const byIdEntries = entries.map((entry) => [entry.id, entry] as const);
  const tokenEntries = entries.map((entry) => [entry.id, collectSearchTokens(entry)] as const);

  const index: CatalogIndex = {
    catalogId: immutableBundle.manifest.catalogId,
    catalogVersion: immutableBundle.manifest.catalogVersion,
    manifest: immutableBundle.manifest,
    entries,
    byId: new ImmutableMapView(byIdEntries),
    tokensById: new ImmutableMapView(tokenEntries),
  };

  return { status: 'ready', index: Object.freeze(index) };
}

export function searchCatalog(index: CatalogIndex, filters: CatalogSearchFilters): CatalogEntry[] {
  const queryTerms = normalizeToken(filters.query).split(/\s+/u).filter(Boolean);

  return index.entries.filter((entry) => {
    if (
      queryTerms.length > 0 &&
      !queryTerms.every((term) =>
        (index.tokensById.get(entry.id) ?? []).some((token) => token.includes(term)),
      )
    ) {
      return false;
    }
    if (
      filters.networkRole !== undefined &&
      filters.networkRole !== 'all' &&
      !getCatalogNetworkRoles(entry).includes(filters.networkRole)
    ) {
      return false;
    }
    if (
      filters.inputMolecule !== undefined &&
      filters.inputMolecule !== 'all' &&
      !matchesSignalFilter(getCatalogInputMolecules(entry), filters.inputMolecule)
    ) {
      return false;
    }
    if (
      filters.outputMolecule !== undefined &&
      filters.outputMolecule !== 'all' &&
      !matchesSignalFilter(getCatalogOutputMolecules(entry), filters.outputMolecule)
    ) {
      return false;
    }
    if (
      filters.parameterStatus !== undefined &&
      filters.parameterStatus !== 'all' &&
      getCatalogParameterStatus(entry) !== filters.parameterStatus
    ) {
      return false;
    }
    if (
      filters.nodeKind !== 'all' &&
      !entry.modeling.compatibleNodeKinds.includes(filters.nodeKind)
    ) {
      return false;
    }
    if (filters.category !== 'all' && entry.category !== filters.category) return false;
    if (filters.entityType !== 'all' && entry.entityType !== filters.entityType) return false;
    if (!matchesKnownText(entry.context.host, filters.host)) return false;
    if (!matchesKnownText(entry.context.strain, filters.strain)) return false;
    if (filters.evidenceGrade !== 'all' && entry.evidence.grade !== filters.evidenceGrade) {
      return false;
    }
    if (filters.sequenceStatus !== 'all' && entry.sequence.status !== filters.sequenceStatus) {
      return false;
    }
    if (
      filters.modelingCompatibility !== 'all' &&
      entry.modeling.compatibility !== filters.modelingCompatibility
    ) {
      return false;
    }
    return true;
  });
}

type CanonicalBundleResult =
  | { ok: true; value: unknown }
  | { ok: false; errors: readonly { path: string; message: string }[] };

function toCanonicalBundle(
  bundle: ValidatedBundleInput | CatalogBundleInput,
): CanonicalBundleResult {
  if (Array.isArray(bundle.files)) {
    const canonicalFiles: Record<string, unknown> = {};
    const errors: Array<{ path: string; message: string }> = [];

    for (const [index, item] of bundle.files.entries()) {
      if (!isRecord(item) || !isCatalogCategory(item.category) || !('value' in item)) {
        errors.push({
          path: `bundle.files[${index}]`,
          message: 'must contain a controlled category and file value',
        });
        continue;
      }
      const fileKey = FILE_KEY_BY_CATEGORY[item.category];
      if (fileKey in canonicalFiles) {
        errors.push({
          path: `bundle.files[${index}].category`,
          message: `duplicates ${item.category}`,
        });
        continue;
      }
      canonicalFiles[fileKey] = item.value;
    }

    if (errors.length > 0) return { ok: false, errors: freezeErrors(errors) };
    return { ok: true, value: { manifest: bundle.manifest, files: canonicalFiles } };
  }

  if (isValidatedFileRecord(bundle.files)) {
    return {
      ok: true,
      value: {
        manifest: bundle.manifest,
        files: {
          qsSystems: bundle.files['qs-system'],
          pollutantSensors: bundle.files['pollutant-sensor'],
          controlOutputParts: bundle.files['control-output'],
        },
      },
    };
  }

  return { ok: true, value: { manifest: bundle.manifest, files: bundle.files } };
}

function isValidatedFileRecord(
  value: unknown,
): value is Record<CatalogCategory, { entries: CatalogEntry[] }> {
  return (
    isRecord(value) &&
    CATEGORY_ORDER.every(
      (category) => isRecord(value[category]) && Array.isArray(value[category].entries),
    )
  );
}

function isCatalogCategory(value: unknown): value is CatalogCategory {
  return typeof value === 'string' && CATEGORY_ORDER.includes(value as CatalogCategory);
}

function collectSearchTokens(entry: CatalogEntry): readonly string[] {
  const tokens = new Set<string>();
  const add = (value: string | undefined): void => {
    if (value === undefined) return;
    const normalized = normalizeToken(value);
    if (normalized) tokens.add(normalized);
  };
  const addCatalogText = (value: CatalogValue<string>): void => {
    if (value.state === 'known') add(value.value);
  };

  add(entry.id);
  add(entry.name.zh);
  add(entry.name.en);
  entry.name.aliases.forEach(add);

  const signals = [entry.signals.inputs, entry.signals.outputs];
  for (const signalGroup of signals) {
    if (!Array.isArray(signalGroup)) continue;
    for (const signal of signalGroup) {
      add(signal.id);
      addCatalogText(signal.name);
    }
  }

  for (const literature of entry.literature) {
    add(literature.id);
    addCatalogText(literature.doi);
    addCatalogText(literature.pmid);
    add(literature.url);
    try {
      add(new URL(literature.url).hostname);
    } catch {
      // The full source value remains searchable even when it is not an absolute URL.
    }
  }

  addCatalogText(entry.context.host);
  addCatalogText(entry.context.strain);

  if (Array.isArray(entry.sequence.records)) {
    for (const record of entry.sequence.records) add(record.accession);
  }

  return Object.freeze([...tokens]);
}

function matchesKnownText(value: CatalogValue<string>, filter: string): boolean {
  if (filter === 'all') return true;
  return value.state === 'known' && normalizeToken(value.value) === normalizeToken(filter);
}

function matchesSignalFilter(values: readonly string[], filter: string): boolean {
  const normalizedFilter = normalizeToken(filter);
  return values.some((value) => normalizeToken(value) === normalizedFilter);
}

function normalizeToken(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function freezeErrors(
  errors: readonly { path: string; message: string }[],
): readonly { path: string; message: string }[] {
  return Object.freeze(
    errors.map((error) => Object.freeze({ path: error.path, message: error.message })),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
