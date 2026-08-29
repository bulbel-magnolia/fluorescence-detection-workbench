import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import { isBfnProjectV20, isBfnProjectV21, upgradeBfnProjectToCurrent } from './bfnIrMigration';
import { parseBfnProject } from './repository';

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a record fixture.');
  }
  return value as Record<string, unknown>;
}

function records(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('Expected a record array fixture.');
  return value.map(record);
}

function asLegacyV20Fixture(): Record<string, unknown> {
  const project = record(structuredClone(createDemoBfnProject()));
  project.schemaVersion = '2.0';

  const registry = record(project.registry);
  delete registry.entities;
  delete registry.provenanceRecords;
  for (const context of records(registry.contexts)) delete context.documentationState;
  for (const implementation of records(registry.implementations)) {
    delete implementation.maturity;
    delete implementation.provenanceIds;
  }

  for (const module of records(record(project.network).modules)) {
    delete module.authoring;
    delete module.implementationState;
    for (const model of records(module.modelVariants)) delete model.provenanceIds;
  }
  return project;
}

function expectedMigration(legacy: Record<string, unknown>): Record<string, unknown> {
  const expected = structuredClone(legacy);
  expected.schemaVersion = '2.1';
  const registry = record(expected.registry);
  registry.entities = [];
  registry.provenanceRecords = [];
  for (const context of records(registry.contexts)) context.documentationState = 'recorded';
  for (const implementation of records(registry.implementations)) {
    implementation.maturity = 'not_recorded';
    implementation.provenanceIds = [];
  }
  for (const module of records(record(expected.network).modules)) {
    const implementationIds = module.implementationIds;
    if (!Array.isArray(implementationIds)) throw new Error('Expected implementation IDs.');
    module.implementationState = implementationIds.length === 0 ? 'unspecified' : 'not_recorded';
    for (const model of records(module.modelVariants)) model.provenanceIds = [];
  }
  return expected;
}

describe('BFN-IR 2.0 to 2.1 migration', () => {
  it('migrates a pristine 2.0 project using the exact conservative defaults', () => {
    const legacy = asLegacyV20Fixture();

    expect(isBfnProjectV20(legacy)).toBe(true);
    expect(upgradeBfnProjectToCurrent(legacy)).toEqual(expectedMigration(legacy));
  });

  it('is non-mutating, deterministic, and idempotent', () => {
    const legacy = asLegacyV20Fixture();
    const untouched = structuredClone(legacy);

    const first = upgradeBfnProjectToCurrent(legacy);
    const second = upgradeBfnProjectToCurrent(legacy);
    const repeated = upgradeBfnProjectToCurrent(first);

    expect(legacy).toEqual(untouched);
    expect(first).toEqual(second);
    expect(repeated).toEqual(first);
    expect(repeated).not.toBe(first);
  });

  it('preserves existing uncertainty methods, context references, ranges, and dataset references', () => {
    const legacy = asLegacyV20Fixture();
    const legacyModule = records(record(legacy.network).modules)[0]!;
    const legacyModel = records(legacyModule.modelVariants)[0]!;
    const legacyDomain = records(record(legacy.registry).validityDomains)[0]!;

    const migrated = upgradeBfnProjectToCurrent(legacy);
    const migratedModel = migrated.network.modules[0]!.modelVariants[0]!;

    expect(migratedModel.uncertaintyMethod).toBe(legacyModel.uncertaintyMethod);
    expect(migratedModel.contextId).toBe(legacyModel.contextId);
    expect(migratedModel.sourceDatasetIds).toEqual(legacyModel.sourceDatasetIds);
    expect(migrated.registry.validityDomains[0]?.contextId).toBe(legacyDomain.contextId);
    expect(migrated.registry.validityDomains[0]?.inputRanges).toEqual(legacyDomain.inputRanges);
  });

  it('preserves legacy recorded Context text verbatim instead of rewriting it as missing data', () => {
    const legacy = asLegacyV20Fixture();
    const legacyContext = records(record(legacy.registry).contexts)[0]!;
    legacyContext.host = 'unknown';
    legacyContext.medium = 'N/A';

    const migrated = upgradeBfnProjectToCurrent(legacy);

    expect(migrated.registry.contexts[0]).toMatchObject({
      documentationState: 'recorded',
      host: 'unknown',
      medium: 'N/A',
    });
  });

  it('does not infer or preserve user-authoring metadata on a 2.0 module', () => {
    const legacy = asLegacyV20Fixture();
    records(record(legacy.network).modules)[0]!.authoring = {
      origin: 'user_defined',
      name: 'Hybrid extra field',
      description: null,
    };

    const migrated = upgradeBfnProjectToCurrent(legacy);

    expect(migrated.network.modules[0]).not.toHaveProperty('authoring');
  });

  it('accepts 2.0 import and always returns 2.1', () => {
    const parsed = parseBfnProject(JSON.stringify(asLegacyV20Fixture()));

    expect(parsed.schemaVersion).toBe('2.1');
    expect(isBfnProjectV21(parsed)).toBe(true);
  });

  it.each(['2.2', '3.0'])('fails closed for unknown future schema version %s', (schemaVersion) => {
    const future = asLegacyV20Fixture();
    future.schemaVersion = schemaVersion;

    expect(() => upgradeBfnProjectToCurrent(future)).toThrow('BFN_IMPORT_SCHEMA_INVALID');
    expect(() => parseBfnProject(JSON.stringify(future))).toThrow('BFN_IMPORT_SCHEMA_INVALID');
  });
});

describe('BFN-IR 2.1 representation contract', () => {
  it('round-trips user metadata, custom entities, partial contexts, provenance, and maturity', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[0]!;
    const model = module.modelVariants[0]!;
    const implementation = project.registry.implementations[0]!;

    module.authoring = {
      origin: 'user_defined',
      name: '  Verbatim sensor name  ',
      description: '  Verbatim user description.  ',
    };
    project.registry.entities.push({
      id: 'entity-user-fluorophore',
      origin: 'user_defined',
      displayName: '  Custom fluorophore  ',
      description: null,
    });
    project.registry.contexts[0] = {
      ...project.registry.contexts[0]!,
      documentationState: 'partial',
      strain: null,
    };
    project.registry.provenanceRecords.push({
      id: 'provenance-user-note',
      kind: 'user_note',
      reference: '  Recorded by the project author.  ',
    });
    model.provenanceIds = ['provenance-user-note'];
    implementation.maturity = 'reported';
    implementation.provenanceIds = ['provenance-user-note'];

    const parsed = parseBfnProject(JSON.stringify(project));

    expect(parsed).toEqual(project);
    expect(parsed.network.modules[0]?.authoring?.name).toBe('  Verbatim sensor name  ');
    expect(parsed.network.modules[0]?.authoring?.description).toBe(
      '  Verbatim user description.  ',
    );
    expect(parsed.registry.entities[0]?.displayName).toBe('  Custom fluorophore  ');
    expect(parsed.registry.contexts[0]?.strain).toBeNull();
    expect(parsed.registry.provenanceRecords[0]?.reference).toBe(
      '  Recorded by the project author.  ',
    );
    expect(parsed.network.modules[0]?.modelVariants[0]?.sourceDatasetIds).toEqual(
      model.sourceDatasetIds,
    );
    expect(parsed.network.modules[0]?.modelVariants[0]?.provenanceIds).toEqual([
      'provenance-user-note',
    ]);
  });

  it('round-trips a truthful not-recorded context and nullable model/domain references', () => {
    const project = createDemoBfnProject();
    const context = project.registry.contexts[0]!;
    project.registry.contexts[0] = {
      ...context,
      documentationState: 'not_recorded',
      host: null,
      strain: null,
      medium: null,
      temperatureCelsius: null,
      ph: null,
      oxygenation: null,
      growthPhase: null,
      plasmidBackbone: null,
      copyNumberRegime: null,
      inductionProtocol: null,
      measurementTimeHours: null,
      batch: null,
    };
    project.network.modules[0]!.modelVariants[0]!.contextId = null;
    project.registry.validityDomains[0]!.contextId = null;

    const parsed = parseBfnProject(JSON.stringify(project));

    expect(parsed.registry.contexts[0]?.documentationState).toBe('not_recorded');
    expect(parsed.registry.contexts[0]?.host).toBeNull();
    expect(parsed.network.modules[0]?.modelVariants[0]?.contextId).toBeNull();
    expect(parsed.registry.validityDomains[0]?.contextId).toBeNull();
  });

  it.each(['none', 'not_recorded'] as const)('round-trips uncertainty method %s', (method) => {
    const project = createDemoBfnProject();
    project.network.modules[0]!.modelVariants[0]!.uncertaintyMethod = method;

    expect(
      parseBfnProject(JSON.stringify(project)).network.modules[0]?.modelVariants[0]
        ?.uncertaintyMethod,
    ).toBe(method);
  });

  it('round-trips an explicitly unspecified module implementation', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[0]!;
    module.implementationIds = [];
    module.implementationState = 'unspecified';

    const parsed = parseBfnProject(JSON.stringify(project));

    expect(parsed.network.modules[0]?.implementationIds).toEqual([]);
    expect(parsed.network.modules[0]?.implementationState).toBe('unspecified');
  });

  it.each(['unknown', 'N/A', 'not recorded', 'unspecified', ''])(
    'rejects fake scientific Context placeholder %j',
    (placeholder) => {
      const project = createDemoBfnProject();
      project.registry.contexts[0] = {
        ...project.registry.contexts[0]!,
        documentationState: 'partial',
        host: placeholder,
        strain: null,
      };

      expect(() => parseBfnProject(JSON.stringify(project))).toThrow('BFN_IMPORT_SCHEMA_INVALID');
    },
  );

  it('fails closed for malformed fields added in BFN-IR 2.1', () => {
    const mutations: Array<(project: Record<string, unknown>) => void> = [
      (project) => {
        record(project.registry).entities = [{ id: '', origin: 'user_defined', displayName: 'X' }];
      },
      (project) => {
        record(project.registry).provenanceRecords = [
          { id: 'p', kind: 'verified_source', reference: 'x' },
        ];
      },
      (project) => {
        records(record(project.registry).contexts)[0]!.documentationState = 'unknown';
      },
      (project) => {
        records(records(record(project.network).modules)[0]!.modelVariants)[0]!.uncertaintyMethod =
          'zero';
      },
      (project) => {
        records(record(project.network).modules)[0]!.implementationState = 'complete';
      },
      (project) => {
        records(record(project.registry).implementations)[0]!.maturity = 'complete';
      },
      (project) => {
        records(record(project.network).modules)[0]!.authoring = {
          origin: 'inferred',
          name: 'X',
          description: null,
        };
      },
    ];

    for (const mutate of mutations) {
      const malformed = record(structuredClone(createDemoBfnProject()));
      mutate(malformed);
      expect(() => parseBfnProject(JSON.stringify(malformed))).toThrow('BFN_IMPORT_SCHEMA_INVALID');
    }
  });
});
