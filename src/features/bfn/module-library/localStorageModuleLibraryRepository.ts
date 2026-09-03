import type { BfnModuleTemplateMetadata, BfnModuleTemplateVersionV1 } from './template';
import { hasOnlyKeys, isDeepDataTree, isPlainDataRecord } from './template/templateInternals';
import {
  advanceTemplateMetadataRevision,
  cloneTemplateMetadata,
  cloneTemplateVersion,
  createInitialTemplateRecords,
  createScientificRevisionCandidate,
  fail,
  orderedTemplateMetadata,
  orderedTemplateVersions,
  parseModuleLibraryRecords,
  requireNonEmptyIdentifier,
  requireTemplateMetadata,
  rethrowAsStorageFailure,
  updateTemplateMetadataRecord,
  validateMetadataUpdateInput,
  type BfnModuleLibrarySnapshot,
} from './moduleLibraryValidation';
import {
  BFN_MODULE_LIBRARY_FALLBACK_KEY,
  BFN_MODULE_LIBRARY_FALLBACK_SCHEMA,
  BFN_MODULE_LIBRARY_FALLBACK_SCHEMA_VERSION,
  BFN_MODULE_LIBRARY_REVISION_CONFLICT,
  BFN_MODULE_LIBRARY_STATE_CORRUPT,
  BFN_MODULE_LIBRARY_TEMPLATE_EXISTS,
  type BfnModuleLibraryRepository,
} from './moduleLibraryTypes';

interface LocalModuleLibraryEnvelopeV1 {
  readonly schema: typeof BFN_MODULE_LIBRARY_FALLBACK_SCHEMA;
  readonly schemaVersion: typeof BFN_MODULE_LIBRARY_FALLBACK_SCHEMA_VERSION;
  readonly templates: Readonly<Record<string, BfnModuleTemplateMetadata>>;
  readonly versions: Readonly<Record<string, BfnModuleTemplateVersionV1>>;
}

const storageQueues = new WeakMap<Storage, Promise<void>>();

function emptySnapshot(): BfnModuleLibrarySnapshot {
  return { metadataById: new Map(), versionById: new Map() };
}

function readSnapshot(storage: Storage): BfnModuleLibrarySnapshot {
  const raw = storage.getItem(BFN_MODULE_LIBRARY_FALLBACK_KEY);
  if (raw === null) return emptySnapshot();

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fail(BFN_MODULE_LIBRARY_STATE_CORRUPT);
  }
  if (
    !isDeepDataTree(value) ||
    !isPlainDataRecord(value) ||
    !hasOnlyKeys(value, ['schema', 'schemaVersion', 'templates', 'versions']) ||
    value.schema !== BFN_MODULE_LIBRARY_FALLBACK_SCHEMA ||
    value.schemaVersion !== BFN_MODULE_LIBRARY_FALLBACK_SCHEMA_VERSION ||
    !isPlainDataRecord(value.templates) ||
    !isPlainDataRecord(value.versions)
  ) {
    return fail(BFN_MODULE_LIBRARY_STATE_CORRUPT);
  }

  const metadataEntries = Object.entries(value.templates);
  const versionEntries = Object.entries(value.versions);
  const snapshot = parseModuleLibraryRecords(
    metadataEntries.map((entry) => entry[1]),
    versionEntries.map((entry) => entry[1]),
  );
  if (
    metadataEntries.some(([key, metadata]) => {
      try {
        return cloneTemplateMetadata(metadata as BfnModuleTemplateMetadata).id !== key;
      } catch {
        return true;
      }
    }) ||
    versionEntries.some(([key, version]) => {
      try {
        return cloneTemplateVersion(version as BfnModuleTemplateVersionV1).id !== key;
      } catch {
        return true;
      }
    })
  ) {
    return fail(BFN_MODULE_LIBRARY_STATE_CORRUPT);
  }
  return snapshot;
}

function writeSnapshot(storage: Storage, snapshot: BfnModuleLibrarySnapshot): void {
  const validated = parseModuleLibraryRecords(
    [...snapshot.metadataById.values()],
    [...snapshot.versionById.values()],
  );
  const envelope: LocalModuleLibraryEnvelopeV1 = {
    schema: BFN_MODULE_LIBRARY_FALLBACK_SCHEMA,
    schemaVersion: BFN_MODULE_LIBRARY_FALLBACK_SCHEMA_VERSION,
    templates: Object.fromEntries(validated.metadataById),
    versions: Object.fromEntries(validated.versionById),
  };
  storage.setItem(BFN_MODULE_LIBRARY_FALLBACK_KEY, JSON.stringify(envelope));
}

function withStorageQueue<T>(storage: Storage, operation: () => T | Promise<T>): Promise<T> {
  const previous = storageQueues.get(storage) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  storageQueues.set(
    storage,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
}

function storageOperation<T>(storage: Storage, operation: () => T): Promise<T> {
  return withStorageQueue(storage, operation).catch((error: unknown) =>
    rethrowAsStorageFailure(error),
  );
}

function withMetadata(
  snapshot: BfnModuleLibrarySnapshot,
  metadata: BfnModuleTemplateMetadata,
): BfnModuleLibrarySnapshot {
  const metadataById = new Map(snapshot.metadataById);
  metadataById.set(metadata.id, metadata);
  return { metadataById, versionById: new Map(snapshot.versionById) };
}

export function createLocalStorageBfnModuleLibraryRepository(
  storage: Storage = localStorage,
): BfnModuleLibraryRepository {
  return {
    kind: 'local-storage',

    async createTemplate(input) {
      return storageOperation(storage, () => {
        const initial = createInitialTemplateRecords(input);
        const snapshot = readSnapshot(storage);
        if (snapshot.metadataById.has(initial.metadata.id)) {
          return fail(BFN_MODULE_LIBRARY_TEMPLATE_EXISTS);
        }
        const metadataById = new Map(snapshot.metadataById);
        const versionById = new Map(snapshot.versionById);
        metadataById.set(initial.metadata.id, initial.metadata);
        versionById.set(initial.version.id, initial.version);
        writeSnapshot(storage, { metadataById, versionById });
        return {
          metadata: cloneTemplateMetadata(initial.metadata),
          version: cloneTemplateVersion(initial.version),
        };
      });
    },

    async getTemplateMetadata(templateId) {
      return storageOperation(storage, () => {
        const id = requireNonEmptyIdentifier(templateId);
        const metadata = readSnapshot(storage).metadataById.get(id);
        return metadata ? cloneTemplateMetadata(metadata) : null;
      });
    },

    async listTemplates() {
      return storageOperation(storage, () =>
        orderedTemplateMetadata(readSnapshot(storage).metadataById.values()),
      );
    },

    async getVersion(versionId) {
      return storageOperation(storage, () => {
        const id = requireNonEmptyIdentifier(versionId);
        const version = readSnapshot(storage).versionById.get(id);
        return version ? cloneTemplateVersion(version) : null;
      });
    },

    async listVersions(templateId) {
      return storageOperation(storage, () => {
        const id = requireNonEmptyIdentifier(templateId);
        const snapshot = readSnapshot(storage);
        requireTemplateMetadata(snapshot, id);
        return orderedTemplateVersions(snapshot.versionById.values(), id);
      });
    },

    async saveScientificRevision(input) {
      return storageOperation(storage, () => {
        const provisional = createScientificRevisionCandidate(input, 1);
        const snapshot = readSnapshot(storage);
        const metadata = requireTemplateMetadata(snapshot, provisional.templateId);
        const versions = orderedTemplateVersions(
          snapshot.versionById.values(),
          provisional.templateId,
        );
        const latest = versions[0]!;
        if (latest.payloadSignature === provisional.payloadSignature) {
          return {
            created: false,
            metadata: cloneTemplateMetadata(metadata),
            version: cloneTemplateVersion(latest),
          };
        }

        const revision = latest.revision + 1;
        const version = createScientificRevisionCandidate(input, revision);
        if (snapshot.versionById.has(version.id)) {
          return fail(BFN_MODULE_LIBRARY_REVISION_CONFLICT);
        }
        const nextMetadata = advanceTemplateMetadataRevision(metadata, revision, version.createdAt);
        const next = withMetadata(snapshot, nextMetadata);
        const versionById = new Map(next.versionById);
        versionById.set(version.id, version);
        writeSnapshot(storage, { metadataById: next.metadataById, versionById });
        return {
          created: true,
          metadata: cloneTemplateMetadata(nextMetadata),
          version: cloneTemplateVersion(version),
        };
      });
    },

    async updateMetadata(input) {
      return storageOperation(storage, () => {
        const validated = validateMetadataUpdateInput(input);
        const snapshot = readSnapshot(storage);
        const current = requireTemplateMetadata(snapshot, validated.templateId);
        const metadata = updateTemplateMetadataRecord(current, validated);
        writeSnapshot(storage, withMetadata(snapshot, metadata));
        return cloneTemplateMetadata(metadata);
      });
    },

    async deleteTemplate(templateId) {
      return storageOperation(storage, () => {
        const id = requireNonEmptyIdentifier(templateId);
        const snapshot = readSnapshot(storage);
        requireTemplateMetadata(snapshot, id);
        const metadataById = new Map(snapshot.metadataById);
        const versionById = new Map(snapshot.versionById);
        metadataById.delete(id);
        for (const [versionId, version] of versionById) {
          if (version.templateId === id) versionById.delete(versionId);
        }
        writeSnapshot(storage, { metadataById, versionById });
      });
    },
  };
}
