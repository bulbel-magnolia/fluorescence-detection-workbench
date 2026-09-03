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
  BFN_MODULE_LIBRARY_DATABASE_BLOCKED,
  BFN_MODULE_LIBRARY_DATABASE_NAME,
  BFN_MODULE_LIBRARY_DATABASE_VERSION,
  BFN_MODULE_LIBRARY_REVISION_CONFLICT,
  BFN_MODULE_LIBRARY_STATE_CORRUPT,
  BFN_MODULE_LIBRARY_TEMPLATE_EXISTS,
  BFN_MODULE_LIBRARY_TEMPLATES_STORE,
  BFN_MODULE_LIBRARY_TEMPLATE_ID_INDEX,
  BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX,
  BFN_MODULE_LIBRARY_VERSIONS_STORE,
  BfnModuleLibraryRepositoryError,
  type BfnModuleLibraryRepository,
} from './moduleLibraryTypes';

const ALL_STORES = [BFN_MODULE_LIBRARY_TEMPLATES_STORE, BFN_MODULE_LIBRARY_VERSIONS_STORE] as const;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IDB_REQUEST_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IDB_TRANSACTION_ABORTED'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IDB_TRANSACTION_FAILED'));
  });
}

function sameNames(actual: DOMStringList, expected: readonly string[]): boolean {
  const actualNames = Array.from(actual).sort();
  const expectedNames = [...expected].sort();
  return (
    actualNames.length === expectedNames.length &&
    actualNames.every((name, index) => name === expectedNames[index])
  );
}

function sameKeyPath(
  actual: string | string[] | null,
  expected: string | readonly string[],
): boolean {
  if (typeof expected === 'string') return actual === expected;
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function hasExpectedSchema(database: IDBDatabase): boolean {
  if (!sameNames(database.objectStoreNames, ALL_STORES)) return false;

  const transaction = database.transaction(ALL_STORES, 'readonly');
  const templates = transaction.objectStore(BFN_MODULE_LIBRARY_TEMPLATES_STORE);
  const versions = transaction.objectStore(BFN_MODULE_LIBRARY_VERSIONS_STORE);
  if (
    templates.autoIncrement ||
    !sameKeyPath(templates.keyPath, 'id') ||
    templates.indexNames.length !== 0 ||
    versions.autoIncrement ||
    !sameKeyPath(versions.keyPath, 'id') ||
    !sameNames(versions.indexNames, [
      BFN_MODULE_LIBRARY_TEMPLATE_ID_INDEX,
      BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX,
    ])
  ) {
    return false;
  }

  const templateId = versions.index(BFN_MODULE_LIBRARY_TEMPLATE_ID_INDEX);
  const templateRevision = versions.index(BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX);
  return (
    sameKeyPath(templateId.keyPath, 'templateId') &&
    !templateId.unique &&
    !templateId.multiEntry &&
    sameKeyPath(templateRevision.keyPath, ['templateId', 'revision']) &&
    templateRevision.unique &&
    !templateRevision.multiEntry
  );
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = factory.open(
      BFN_MODULE_LIBRARY_DATABASE_NAME,
      BFN_MODULE_LIBRARY_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) {
        return;
      }
      if (!database.objectStoreNames.contains(BFN_MODULE_LIBRARY_TEMPLATES_STORE)) {
        database.createObjectStore(BFN_MODULE_LIBRARY_TEMPLATES_STORE, {
          keyPath: 'id',
        });
      }
      const versions = database.objectStoreNames.contains(BFN_MODULE_LIBRARY_VERSIONS_STORE)
        ? transaction.objectStore(BFN_MODULE_LIBRARY_VERSIONS_STORE)
        : database.createObjectStore(BFN_MODULE_LIBRARY_VERSIONS_STORE, {
            keyPath: 'id',
          });
      if (!versions.indexNames.contains(BFN_MODULE_LIBRARY_TEMPLATE_ID_INDEX)) {
        versions.createIndex(BFN_MODULE_LIBRARY_TEMPLATE_ID_INDEX, 'templateId', { unique: false });
      }
      if (!versions.indexNames.contains(BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX)) {
        versions.createIndex(
          BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX,
          ['templateId', 'revision'],
          { unique: true },
        );
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      try {
        if (!hasExpectedSchema(database)) {
          database.close();
          reject(new BfnModuleLibraryRepositoryError(BFN_MODULE_LIBRARY_STATE_CORRUPT));
          return;
        }
        database.onversionchange = () => database.close();
        resolve(database);
      } catch (error) {
        database.close();
        reject(error instanceof Error ? error : new Error('IDB_SCHEMA_VALIDATION_FAILED'));
      }
    };
    request.onerror = () => reject(request.error ?? new Error('IDB_DATABASE_OPEN_FAILED'));
    request.onblocked = () => {
      blocked = true;
      reject(new BfnModuleLibraryRepositoryError(BFN_MODULE_LIBRARY_DATABASE_BLOCKED));
    };
  });
}

async function loadSnapshot(transaction: IDBTransaction): Promise<BfnModuleLibrarySnapshot> {
  const templatesRequest = transaction
    .objectStore(BFN_MODULE_LIBRARY_TEMPLATES_STORE)
    .getAll() as IDBRequest<unknown[]>;
  const versionsRequest = transaction
    .objectStore(BFN_MODULE_LIBRARY_VERSIONS_STORE)
    .getAll() as IDBRequest<unknown[]>;
  const [templates, versions] = await Promise.all([
    requestResult(templatesRequest),
    requestResult(versionsRequest),
  ]);
  return parseModuleLibraryRecords(templates, versions);
}

async function runTransaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const transaction = database.transaction(ALL_STORES, mode);
  const done = transactionDone(transaction);
  try {
    const result = await operation(transaction);
    await done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already be complete or aborted.
    }
    try {
      await done;
    } catch {
      // Preserve the validation or request error that triggered the abort.
    }
    throw error;
  }
}

function isConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConstraintError'
  );
}

export function createIndexedDbBfnModuleLibraryRepository(
  factory: IDBFactory = indexedDB,
): BfnModuleLibraryRepository {
  let databasePromise: Promise<IDBDatabase> | null = null;
  const database = (): Promise<IDBDatabase> => {
    if (!databasePromise) {
      databasePromise = openDatabase(factory).catch((error: unknown) => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  };

  const operate = async <T>(operation: (database: IDBDatabase) => Promise<T>) => {
    try {
      return await operation(await database());
    } catch (error) {
      if (isConstraintError(error)) throw error;
      return rethrowAsStorageFailure(error);
    }
  };

  return {
    kind: 'indexeddb',

    async createTemplate(input) {
      const initial = createInitialTemplateRecords(input);
      try {
        return await operate((db) =>
          runTransaction(db, 'readwrite', async (transaction) => {
            const snapshot = await loadSnapshot(transaction);
            if (snapshot.metadataById.has(initial.metadata.id)) {
              return fail(BFN_MODULE_LIBRARY_TEMPLATE_EXISTS);
            }
            transaction.objectStore(BFN_MODULE_LIBRARY_TEMPLATES_STORE).add(initial.metadata);
            transaction.objectStore(BFN_MODULE_LIBRARY_VERSIONS_STORE).add(initial.version);
            return {
              metadata: cloneTemplateMetadata(initial.metadata),
              version: cloneTemplateVersion(initial.version),
            };
          }),
        );
      } catch (error) {
        if (isConstraintError(error)) return fail(BFN_MODULE_LIBRARY_TEMPLATE_EXISTS);
        throw error;
      }
    },

    async getTemplateMetadata(templateId) {
      const id = requireNonEmptyIdentifier(templateId);
      return operate((db) =>
        runTransaction(db, 'readonly', async (transaction) => {
          const metadata = (await loadSnapshot(transaction)).metadataById.get(id);
          return metadata ? cloneTemplateMetadata(metadata) : null;
        }),
      );
    },

    async listTemplates() {
      return operate((db) =>
        runTransaction(db, 'readonly', async (transaction) =>
          orderedTemplateMetadata((await loadSnapshot(transaction)).metadataById.values()),
        ),
      );
    },

    async getVersion(versionId) {
      const id = requireNonEmptyIdentifier(versionId);
      return operate((db) =>
        runTransaction(db, 'readonly', async (transaction) => {
          const version = (await loadSnapshot(transaction)).versionById.get(id);
          return version ? cloneTemplateVersion(version) : null;
        }),
      );
    },

    async listVersions(templateId) {
      const id = requireNonEmptyIdentifier(templateId);
      return operate((db) =>
        runTransaction(db, 'readonly', async (transaction) => {
          const snapshot = await loadSnapshot(transaction);
          requireTemplateMetadata(snapshot, id);
          return orderedTemplateVersions(snapshot.versionById.values(), id);
        }),
      );
    },

    async saveScientificRevision(input) {
      const provisional = createScientificRevisionCandidate(input, 1);
      try {
        return await operate((db) =>
          runTransaction(db, 'readwrite', async (transaction) => {
            const snapshot = await loadSnapshot(transaction);
            const metadata = requireTemplateMetadata(snapshot, provisional.templateId);
            const latest = orderedTemplateVersions(
              snapshot.versionById.values(),
              provisional.templateId,
            )[0]!;
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
            const nextMetadata = advanceTemplateMetadataRevision(
              metadata,
              revision,
              version.createdAt,
            );
            transaction.objectStore(BFN_MODULE_LIBRARY_VERSIONS_STORE).add(version);
            transaction.objectStore(BFN_MODULE_LIBRARY_TEMPLATES_STORE).put(nextMetadata);
            return {
              created: true,
              metadata: cloneTemplateMetadata(nextMetadata),
              version: cloneTemplateVersion(version),
            };
          }),
        );
      } catch (error) {
        if (isConstraintError(error)) return fail(BFN_MODULE_LIBRARY_REVISION_CONFLICT);
        throw error;
      }
    },

    async updateMetadata(input) {
      const validated = validateMetadataUpdateInput(input);
      return operate((db) =>
        runTransaction(db, 'readwrite', async (transaction) => {
          const snapshot = await loadSnapshot(transaction);
          const current = requireTemplateMetadata(snapshot, validated.templateId);
          const metadata = updateTemplateMetadataRecord(current, validated);
          transaction.objectStore(BFN_MODULE_LIBRARY_TEMPLATES_STORE).put(metadata);
          return cloneTemplateMetadata(metadata);
        }),
      );
    },

    async deleteTemplate(templateId) {
      const id = requireNonEmptyIdentifier(templateId);
      return operate((db) =>
        runTransaction(db, 'readwrite', async (transaction) => {
          const snapshot = await loadSnapshot(transaction);
          requireTemplateMetadata(snapshot, id);
          transaction.objectStore(BFN_MODULE_LIBRARY_TEMPLATES_STORE).delete(id);
          const versions = transaction.objectStore(BFN_MODULE_LIBRARY_VERSIONS_STORE);
          for (const version of snapshot.versionById.values()) {
            if (version.templateId === id) versions.delete(version.id);
          }
        }),
      );
    },
  };
}
