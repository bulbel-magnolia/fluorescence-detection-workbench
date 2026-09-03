import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBlankTemplateProject, captureStaticFixture } from './template/templateTestFixtures';
import {
  createBfnModuleTemplateVersionV1,
  instantiateReusableModuleTemplate,
  type BfnReusableModulePayloadV1,
} from './template';
import { createIndexedDbBfnWorkspaceRepository } from '../workspace/indexedDbWorkspaceRepository';
import {
  BFN_WORKSPACE_DATABASE_NAME,
  BFN_WORKSPACE_DATABASE_VERSION,
  BFN_WORKSPACE_FALLBACK_KEY,
} from '../workspace/workspaceTypes';
import { createIndexedDbBfnModuleLibraryRepository } from './indexedDbModuleLibraryRepository';
import { createLocalStorageBfnModuleLibraryRepository } from './localStorageModuleLibraryRepository';
import {
  BFN_MODULE_LIBRARY_DATABASE_NAME,
  BFN_MODULE_LIBRARY_DATABASE_VERSION,
  BFN_MODULE_LIBRARY_FALLBACK_KEY,
  BFN_MODULE_LIBRARY_METADATA_CORRUPT,
  BFN_MODULE_LIBRARY_STATE_CORRUPT,
  BFN_MODULE_LIBRARY_TEMPLATE_EXISTS,
  BFN_MODULE_LIBRARY_TEMPLATE_ID_INDEX,
  BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND,
  BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX,
  BFN_MODULE_LIBRARY_TEMPLATES_STORE,
  BFN_MODULE_LIBRARY_VERSION_CORRUPT,
  BFN_MODULE_LIBRARY_VERSIONS_STORE,
  type BfnModuleLibraryRepository,
  type CreateBfnModuleLibraryTemplateInput,
} from './moduleLibraryTypes';

const TIME_1 = '2026-09-03T01:00:00.000Z';
const TIME_2 = '2026-09-03T02:00:00.000Z';
const TIME_3 = '2026-09-03T03:00:00.000Z';
const TIME_4 = '2026-09-03T04:00:00.000Z';

interface RepositoryHarness {
  readonly repository: BfnModuleLibraryRepository;
  readonly peer: () => BfnModuleLibraryRepository;
}

interface CorruptionHarness extends RepositoryHarness {
  readonly corruptMetadata: (
    templateId: string,
    mutate: (value: Record<string, unknown>) => void,
  ) => Promise<void>;
  readonly corruptVersion: (
    versionId: string,
    mutate: (value: Record<string, unknown>) => void,
  ) => Promise<void>;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a record fixture.');
  }
  return value as Record<string, unknown>;
}

function templateInput(
  templateId: string,
  name = templateId,
  createdAt = TIME_1,
  initialPayload = scientificPayload('initial'),
): CreateBfnModuleLibraryTemplateInput {
  return {
    templateId,
    name,
    description: `${name} description`,
    createdAt,
    note: 'Initial scientific payload.',
    initialPayload,
  };
}

function scientificPayload(marker: string): BfnReusableModulePayloadV1 {
  const payload = captureStaticFixture();
  return {
    ...payload,
    entities: payload.entities.map((entity, index) => {
      if (index !== 0) return entity;
      if (entity.mode !== 'embedded') {
        throw new Error('Expected an embedded fixture entity.');
      }
      return { ...entity, description: `Scientific payload ${marker}` };
    }),
  };
}

function libraryRepositoryContract(label: string, createHarness: () => RepositoryHarness): void {
  describe(label, () => {
    let harness: RepositoryHarness;
    let repository: BfnModuleLibraryRepository;

    beforeEach(() => {
      harness = createHarness();
      repository = harness.repository;
    });

    it('creates template metadata and immutable revision 1 atomically', async () => {
      const created = await repository.createTemplate(
        templateInput('template-create', 'Created template'),
      );

      expect(created.metadata).toMatchObject({
        id: 'template-create',
        name: 'Created template',
        latestRevision: 1,
      });
      expect(created.version).toMatchObject({
        id: 'template-create:version:1',
        templateId: 'template-create',
        revision: 1,
      });
      expect(Object.isFrozen(created.version)).toBe(true);
      expect(await repository.listVersions('template-create')).toEqual([created.version]);
    });

    it('round-trips strict metadata independently from scientific versions', async () => {
      const created = await repository.createTemplate(
        templateInput('template-metadata', 'Metadata roundtrip'),
      );

      const metadata = await repository.getTemplateMetadata('template-metadata');
      expect(metadata).toEqual(created.metadata);
      expect(metadata).not.toBe(created.metadata);
    });

    it('round-trips a strict frozen Template 1.0 version', async () => {
      const created = await repository.createTemplate(
        templateInput('template-version', 'Version roundtrip'),
      );

      const version = await repository.getVersion(created.version.id);
      expect(version).toEqual(created.version);
      expect(version).not.toBe(created.version);
      expect(Object.isFrozen(version)).toBe(true);
      expect(Object.isFrozen(version?.payload)).toBe(true);
    });

    it('lists metadata and versions in deterministic order', async () => {
      await repository.createTemplate(templateInput('template-a', 'A', TIME_1));
      await repository.createTemplate(templateInput('template-c', 'C', TIME_2));
      await repository.createTemplate(templateInput('template-b', 'B', TIME_2));
      await repository.saveScientificRevision({
        templateId: 'template-a',
        payload: scientificPayload('second'),
        createdAt: TIME_3,
        note: null,
      });
      await repository.saveScientificRevision({
        templateId: 'template-a',
        payload: scientificPayload('third'),
        createdAt: TIME_4,
        note: null,
      });

      expect((await repository.listTemplates()).map((item) => item.id)).toEqual([
        'template-a',
        'template-b',
        'template-c',
      ]);
      expect((await repository.listVersions('template-a')).map((item) => item.revision)).toEqual([
        3, 2, 1,
      ]);
    });

    it('updates metadata without creating or changing a scientific revision', async () => {
      const created = await repository.createTemplate(
        templateInput('template-rename', 'Before rename'),
      );
      const versionBefore = JSON.stringify(created.version);
      const updated = await repository.updateMetadata({
        templateId: 'template-rename',
        name: 'After rename',
        description: 'Metadata only.',
        updatedAt: TIME_2,
      });

      expect(updated).toMatchObject({
        name: 'After rename',
        description: 'Metadata only.',
        latestRevision: 1,
      });
      const versions = await repository.listVersions('template-rename');
      expect(versions).toHaveLength(1);
      expect(JSON.stringify(versions[0])).toBe(versionBefore);
    });

    it('allocates the next integer revision for each changed payload', async () => {
      await repository.createTemplate(templateInput('template-revisions'));
      const second = await repository.saveScientificRevision({
        templateId: 'template-revisions',
        payload: scientificPayload('second'),
        createdAt: TIME_2,
        note: 'Second revision.',
      });
      const third = await repository.saveScientificRevision({
        templateId: 'template-revisions',
        payload: scientificPayload('third'),
        createdAt: TIME_3,
        note: 'Third revision.',
      });

      expect([second.created, second.version.revision, third.version.revision]).toEqual([
        true,
        2,
        3,
      ]);
      expect(third.metadata.latestRevision).toBe(3);
      expect(third.version.id).toBe('template-revisions:version:3');
    });

    it('treats the same latest payload signature as a no-op', async () => {
      const created = await repository.createTemplate(templateInput('template-noop'));
      const result = await repository.saveScientificRevision({
        templateId: 'template-noop',
        payload: structuredClone(created.version.payload),
        createdAt: TIME_4,
        note: 'This envelope metadata must not create a revision.',
      });

      expect(result.created).toBe(false);
      expect(result.version).toEqual(created.version);
      expect(result.metadata).toEqual(created.metadata);
      expect(await repository.listVersions('template-noop')).toHaveLength(1);
    });

    it('keeps historical bytes and science unchanged through edits and instantiation', async () => {
      const created = await repository.createTemplate(templateInput('template-history'));
      const historicalBytes = JSON.stringify(created.version);
      await repository.updateMetadata({
        templateId: 'template-history',
        name: 'Edited metadata',
        description: null,
        updatedAt: TIME_2,
      });
      await repository.saveScientificRevision({
        templateId: 'template-history',
        payload: scientificPayload('later'),
        createdAt: TIME_3,
        note: null,
      });

      const historical = await repository.getVersion(created.version.id);
      expect(JSON.stringify(historical)).toBe(historicalBytes);
      const target = createBlankTemplateProject('project.library-copy');
      const targetBefore = structuredClone(target);
      const result = instantiateReusableModuleTemplate(
        historical!,
        target,
        {},
        {
          instanceId: 'instance.library-copy',
          instanceName: 'Independent library copy',
          instanceDescription: null,
        },
      );
      expect(result.ok).toBe(true);
      expect(target).toEqual(targetBefore);
      expect(JSON.stringify(await repository.getVersion(created.version.id))).toBe(historicalBytes);
    });

    it('deletes metadata and all versions as one logical operation', async () => {
      const created = await repository.createTemplate(templateInput('template-delete'));
      const second = await repository.saveScientificRevision({
        templateId: 'template-delete',
        payload: scientificPayload('second'),
        createdAt: TIME_2,
        note: null,
      });

      await repository.deleteTemplate('template-delete');
      expect(await repository.getTemplateMetadata('template-delete')).toBeNull();
      expect(await repository.getVersion(created.version.id)).toBeNull();
      expect(await repository.getVersion(second.version.id)).toBeNull();
      await expect(repository.listVersions('template-delete')).rejects.toMatchObject({
        code: BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND,
      });
    });

    it('uses stable null and not-found results for unknown identities', async () => {
      expect(await repository.getTemplateMetadata('template-unknown')).toBeNull();
      expect(await repository.getVersion('template-unknown:version:1')).toBeNull();
      await expect(repository.listVersions('template-unknown')).rejects.toMatchObject({
        code: BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND,
      });
      await expect(
        repository.updateMetadata({
          templateId: 'template-unknown',
          name: 'Unknown',
          description: null,
          updatedAt: TIME_2,
        }),
      ).rejects.toMatchObject({ code: BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND });
    });

    it('returns independent clones and frozen version trees', async () => {
      const created = await repository.createTemplate(templateInput('template-clones'));
      const metadata = await repository.getTemplateMetadata(created.metadata.id);
      const version = await repository.getVersion(created.version.id);
      record(metadata).name = 'Caller mutation';
      expect(() => {
        record(version).note = 'Caller mutation';
      }).toThrow(TypeError);

      expect((await repository.getTemplateMetadata(created.metadata.id))?.name).toBe(
        created.metadata.name,
      );
      expect(await repository.getVersion(created.version.id)).toEqual(created.version);
    });

    it('serializes concurrent revisions across repository instances without overwrite', async () => {
      const created = await repository.createTemplate(templateInput('template-concurrent'));
      const historicalBytes = JSON.stringify(created.version);
      const peer = harness.peer();
      const results = await Promise.all([
        repository.saveScientificRevision({
          templateId: 'template-concurrent',
          payload: scientificPayload('concurrent-a'),
          createdAt: TIME_2,
          note: 'Concurrent A',
        }),
        peer.saveScientificRevision({
          templateId: 'template-concurrent',
          payload: scientificPayload('concurrent-b'),
          createdAt: TIME_3,
          note: 'Concurrent B',
        }),
      ]);

      expect(results.map((item) => item.version.revision).sort()).toEqual([2, 3]);
      expect(results.every((item) => item.created)).toBe(true);
      const versions = await repository.listVersions('template-concurrent');
      expect(versions.map((item) => item.revision)).toEqual([3, 2, 1]);
      expect(new Set(versions.map((item) => item.payloadSignature))).toHaveLength(3);
      expect(JSON.stringify(await repository.getVersion(created.version.id))).toBe(historicalBytes);
    });

    it('rejects duplicate creation without overwriting revision 1', async () => {
      const created = await repository.createTemplate(templateInput('template-duplicate'));
      await expect(
        repository.createTemplate(
          templateInput(
            'template-duplicate',
            'Replacement',
            TIME_2,
            scientificPayload('replacement'),
          ),
        ),
      ).rejects.toMatchObject({ code: BFN_MODULE_LIBRARY_TEMPLATE_EXISTS });
      expect(await repository.getVersion(created.version.id)).toEqual(created.version);
    });
  });
}

function corruptionContract(label: string, createHarness: () => CorruptionHarness): void {
  describe(label, () => {
    let harness: CorruptionHarness;

    beforeEach(() => {
      harness = createHarness();
    });

    it('fails closed on corrupt metadata during every read path', async () => {
      const created = await harness.repository.createTemplate(
        templateInput('template-corrupt-metadata'),
      );
      await harness.corruptMetadata(created.metadata.id, (metadata) => {
        metadata.name = '';
      });

      await expect(
        harness.repository.getTemplateMetadata(created.metadata.id),
      ).rejects.toMatchObject({ code: BFN_MODULE_LIBRARY_METADATA_CORRUPT });
      await expect(harness.repository.listTemplates()).rejects.toMatchObject({
        code: BFN_MODULE_LIBRARY_METADATA_CORRUPT,
      });
      await expect(harness.repository.getVersion(created.version.id)).rejects.toMatchObject({
        code: BFN_MODULE_LIBRARY_METADATA_CORRUPT,
      });
    });

    it.each([
      [
        'schema',
        (value: Record<string, unknown>): void => {
          value.schema = 'UNKNOWN';
        },
      ],
      [
        'schema version',
        (value: Record<string, unknown>): void => {
          value.schemaVersion = '9.9';
        },
      ],
      [
        'template identity',
        (value: Record<string, unknown>): void => {
          value.templateId = 'other';
        },
      ],
      [
        'version identity',
        (value: Record<string, unknown>): void => {
          value.id = 'invalid-version-id';
        },
      ],
      [
        'revision',
        (value: Record<string, unknown>): void => {
          value.revision = 0;
        },
      ],
      [
        'payload',
        (value: Record<string, unknown>): void => {
          delete value.payload;
        },
      ],
      [
        'payload signature',
        (value: Record<string, unknown>): void => {
          value.payloadSignature = 'forged';
        },
      ],
      [
        'missing field',
        (value: Record<string, unknown>): void => {
          delete value.note;
        },
      ],
    ] as const)('fails closed on corrupt version %s', async (_label, mutate) => {
      const created = await harness.repository.createTemplate(
        templateInput('template-corrupt-version'),
      );
      await harness.corruptVersion(created.version.id, mutate);

      await expect(harness.repository.getVersion(created.version.id)).rejects.toMatchObject({
        code: BFN_MODULE_LIBRARY_VERSION_CORRUPT,
      });
      await expect(
        harness.repository.getTemplateMetadata(created.metadata.id),
      ).rejects.toMatchObject({ code: BFN_MODULE_LIBRARY_VERSION_CORRUPT });
    });
  });
}

function localStorageHarness(): RepositoryHarness {
  localStorage.clear();
  return {
    repository: createLocalStorageBfnModuleLibraryRepository(localStorage),
    peer: () => createLocalStorageBfnModuleLibraryRepository(localStorage),
  };
}

function indexedDbHarness(): RepositoryHarness {
  const factory = new IDBFactory();
  return {
    repository: createIndexedDbBfnModuleLibraryRepository(factory),
    peer: () => createIndexedDbBfnModuleLibraryRepository(factory),
  };
}

function localStorageCorruptionHarness(): CorruptionHarness {
  const harness = localStorageHarness();
  const mutateStoredRecord = (
    collection: 'templates' | 'versions',
    id: string,
    mutate: (value: Record<string, unknown>) => void,
  ): Promise<void> => {
    const state = record(JSON.parse(localStorage.getItem(BFN_MODULE_LIBRARY_FALLBACK_KEY)!));
    const value = record(record(state[collection])[id]);
    mutate(value);
    localStorage.setItem(BFN_MODULE_LIBRARY_FALLBACK_KEY, JSON.stringify(state));
    return Promise.resolve();
  };
  return {
    ...harness,
    corruptMetadata: (id, mutate) => mutateStoredRecord('templates', id, mutate),
    corruptVersion: (id, mutate) => mutateStoredRecord('versions', id, mutate),
  };
}

function indexedDbCorruptionHarness(): CorruptionHarness {
  const factory = new IDBFactory();
  const repository = createIndexedDbBfnModuleLibraryRepository(factory);
  const mutateStoredRecord = async (
    storeName: string,
    id: string,
    mutate: (value: Record<string, unknown>) => void,
  ) => {
    const database = await openLibraryDatabase(factory);
    const transaction = database.transaction(storeName, 'readwrite');
    const done = idbTransaction(transaction);
    const store = transaction.objectStore(storeName);
    const value = record(await idbRequest(store.get(id) as IDBRequest<unknown>));
    mutate(value);
    store.delete(id);
    store.put(value);
    await done;
    database.close();
  };
  return {
    repository,
    peer: () => createIndexedDbBfnModuleLibraryRepository(factory),
    corruptMetadata: (id, mutate) =>
      mutateStoredRecord(BFN_MODULE_LIBRARY_TEMPLATES_STORE, id, mutate),
    corruptVersion: (id, mutate) =>
      mutateStoredRecord(BFN_MODULE_LIBRARY_VERSIONS_STORE, id, mutate),
  };
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB test request failed.'));
  });
}

function idbTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB test transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB test transaction aborted.'));
  });
}

function openLibraryDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(
      BFN_MODULE_LIBRARY_DATABASE_NAME,
      BFN_MODULE_LIBRARY_DATABASE_VERSION,
    );
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Module Library database open failed.'));
  });
}

function openWorkspaceDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(BFN_WORKSPACE_DATABASE_NAME, BFN_WORKSPACE_DATABASE_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Workspace database open failed.'));
  });
}

async function workspaceSchema(factory: IDBFactory): Promise<unknown> {
  const database = await openWorkspaceDatabase(factory);
  const stores = Array.from(database.objectStoreNames);
  const transaction = database.transaction(stores, 'readonly');
  const done = idbTransaction(transaction);
  const indexes = Object.fromEntries(
    stores.map((storeName) => [
      storeName,
      Array.from(transaction.objectStore(storeName).indexNames),
    ]),
  );
  await done;
  const schema = { version: database.version, stores, indexes };
  database.close();
  return schema;
}

libraryRepositoryContract('localStorage Module Library contract', localStorageHarness);
libraryRepositoryContract('IndexedDB Module Library contract', indexedDbHarness);
corruptionContract(
  'localStorage Module Library corruption contract',
  localStorageCorruptionHarness,
);
corruptionContract('IndexedDB Module Library corruption contract', indexedDbCorruptionHarness);

describe('Module Library backend and isolation contracts', () => {
  it('produces the same observable results in IndexedDB and localStorage', async () => {
    localStorage.clear();
    const local = createLocalStorageBfnModuleLibraryRepository(localStorage);
    const indexed = createIndexedDbBfnModuleLibraryRepository(new IDBFactory());
    for (const repository of [local, indexed]) {
      await repository.createTemplate(templateInput('template-parity', 'Parity'));
      await repository.updateMetadata({
        templateId: 'template-parity',
        name: 'Parity renamed',
        description: 'Same metadata',
        updatedAt: TIME_2,
      });
      await repository.saveScientificRevision({
        templateId: 'template-parity',
        payload: scientificPayload('parity-second'),
        createdAt: TIME_3,
        note: 'Same science',
      });
      await repository.saveScientificRevision({
        templateId: 'template-parity',
        payload: scientificPayload('parity-second'),
        createdAt: TIME_4,
        note: 'No-op',
      });
    }

    expect({
      templates: await indexed.listTemplates(),
      versions: await indexed.listVersions('template-parity'),
    }).toEqual({
      templates: await local.listTemplates(),
      versions: await local.listVersions('template-parity'),
    });
  });

  it('creates only the independent version-1 database, stores, and indexes', async () => {
    const factory = new IDBFactory();
    const first = createIndexedDbBfnModuleLibraryRepository(factory);
    const second = createIndexedDbBfnModuleLibraryRepository(factory);
    await first.listTemplates();
    await second.listTemplates();

    const database = await openLibraryDatabase(factory);
    expect(database.name).toBe(BFN_MODULE_LIBRARY_DATABASE_NAME);
    expect(database.version).toBe(1);
    expect(Array.from(database.objectStoreNames)).toEqual(['templates', 'versions']);
    const transaction = database.transaction(['templates', 'versions'], 'readonly');
    const done = idbTransaction(transaction);
    const templates = transaction.objectStore('templates');
    const versions = transaction.objectStore('versions');
    expect(templates.keyPath).toBe('id');
    expect(Array.from(templates.indexNames)).toEqual([]);
    expect(versions.keyPath).toBe('id');
    expect(Array.from(versions.indexNames)).toEqual([
      BFN_MODULE_LIBRARY_TEMPLATE_ID_INDEX,
      BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX,
    ]);
    expect(versions.index(BFN_MODULE_LIBRARY_TEMPLATE_ID_INDEX).unique).toBe(false);
    expect(versions.index(BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX).keyPath).toEqual([
      'templateId',
      'revision',
    ]);
    expect(versions.index(BFN_MODULE_LIBRARY_TEMPLATE_REVISION_INDEX).unique).toBe(true);
    await done;
    database.close();
  });

  it('does not change the Workspace IndexedDB schema or localStorage namespace', async () => {
    localStorage.clear();
    localStorage.setItem(BFN_WORKSPACE_FALLBACK_KEY, 'workspace-sentinel');
    const local = createLocalStorageBfnModuleLibraryRepository(localStorage);
    await local.createTemplate(templateInput('template-local-isolation'));
    expect(localStorage.getItem(BFN_WORKSPACE_FALLBACK_KEY)).toBe('workspace-sentinel');

    const factory = new IDBFactory();
    const workspace = createIndexedDbBfnWorkspaceRepository(factory);
    await workspace.listProjects();
    const before = await workspaceSchema(factory);
    const library = createIndexedDbBfnModuleLibraryRepository(factory);
    await library.createTemplate(templateInput('template-idb-isolation'));
    expect(await workspaceSchema(factory)).toEqual(before);
    expect(BFN_MODULE_LIBRARY_DATABASE_NAME).not.toBe(BFN_WORKSPACE_DATABASE_NAME);
  });

  it('rejects a pre-existing incompatible database instead of repairing it', async () => {
    const factory = new IDBFactory();
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(
        BFN_MODULE_LIBRARY_DATABASE_NAME,
        BFN_MODULE_LIBRARY_DATABASE_VERSION,
      );
      request.onupgradeneeded = () => {
        request.result.createObjectStore(BFN_MODULE_LIBRARY_TEMPLATES_STORE, {
          keyPath: 'id',
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Invalid fixture database open failed.'));
    });
    database.close();

    const repository = createIndexedDbBfnModuleLibraryRepository(factory);
    await expect(repository.listTemplates()).rejects.toMatchObject({
      code: BFN_MODULE_LIBRARY_STATE_CORRUPT,
    });
  });

  it('fails closed on malformed localStorage envelope data', async () => {
    localStorage.clear();
    localStorage.setItem(BFN_MODULE_LIBRARY_FALLBACK_KEY, '{malformed');
    const repository = createLocalStorageBfnModuleLibraryRepository(localStorage);

    await expect(repository.listTemplates()).rejects.toMatchObject({
      code: BFN_MODULE_LIBRARY_STATE_CORRUPT,
    });
  });

  it('rejects orphan historical versions instead of inferring metadata', async () => {
    const factory = new IDBFactory();
    const repository = createIndexedDbBfnModuleLibraryRepository(factory);
    await repository.listTemplates();
    const database = await openLibraryDatabase(factory);
    const transaction = database.transaction(BFN_MODULE_LIBRARY_VERSIONS_STORE, 'readwrite');
    const done = idbTransaction(transaction);
    transaction.objectStore(BFN_MODULE_LIBRARY_VERSIONS_STORE).add(
      createBfnModuleTemplateVersionV1({
        templateId: 'template-orphan',
        revision: 1,
        createdAt: TIME_1,
        note: null,
        payload: scientificPayload('orphan'),
      }),
    );
    await done;
    database.close();

    await expect(repository.listTemplates()).rejects.toMatchObject({
      code: BFN_MODULE_LIBRARY_STATE_CORRUPT,
    });
  });
});
