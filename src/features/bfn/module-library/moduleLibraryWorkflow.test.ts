import { describe, expect, it } from 'vitest';
import {
  BFN_MODULE_LIBRARY_DATABASE_BLOCKED,
  BFN_MODULE_LIBRARY_INPUT_INVALID,
  BFN_MODULE_LIBRARY_METADATA_CORRUPT,
  BFN_MODULE_LIBRARY_REVISION_CONFLICT,
  BFN_MODULE_LIBRARY_STORAGE_FAILED,
  BFN_MODULE_LIBRARY_TEMPLATE_EXISTS,
  BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND,
  BfnModuleLibraryRepositoryError,
} from './moduleLibraryTypes';
import {
  createAccumulatorTemplateProject,
  createFirstOrderTemplateProject,
  createStaticTemplateProject,
} from './template/templateTestFixtures';
import {
  buildEntityBindingDecisions,
  buildReusableModuleCaptureAvailability,
  createModuleInstanceIdCandidate,
  createTemplateIdCandidate,
  instantiationFailureKind,
  listProjectEntityChoices,
  repositoryFailureKind,
} from './moduleLibraryWorkflow';

const TIME = '2026-09-03T08:00:00.000Z';

describe('module library workflow admission', () => {
  it('admits a supported user-authored steady-state module', () => {
    const project = createStaticTemplateProject();
    expect(
      buildReusableModuleCaptureAvailability(project, project.network.modules[0]!.id),
    ).toMatchObject({ supported: true, payload: { moduleClass: 'static' } });
  });

  it('admits a supported first-order dynamic module', () => {
    const project = createFirstOrderTemplateProject();
    expect(
      buildReusableModuleCaptureAvailability(project, project.network.modules[0]!.id),
    ).toMatchObject({ supported: true, payload: { moduleClass: 'first_order' } });
  });

  it('admits a supported signal accumulator', () => {
    const project = createAccumulatorTemplateProject();
    expect(
      buildReusableModuleCaptureAvailability(project, project.network.modules[0]!.id),
    ).toMatchObject({ supported: true, payload: { moduleClass: 'accumulator' } });
  });

  it('rejects a module that is not user-authored', () => {
    const project = createStaticTemplateProject();
    delete project.network.modules[0]!.authoring;
    expect(
      buildReusableModuleCaptureAvailability(project, project.network.modules[0]!.id),
    ).toMatchObject({ supported: false, failureKind: 'not-user-module' });
  });

  it('reports an active dataset dependency with a dedicated friendly category', () => {
    const project = createStaticTemplateProject();
    project.network.modules[0]!.modelVariants[0]!.sourceDatasetIds = ['dataset.external'];
    expect(
      buildReusableModuleCaptureAvailability(project, project.network.modules[0]!.id),
    ).toMatchObject({ supported: false, failureKind: 'dataset' });
  });

  it('reports a targeted calibration dependency with a dedicated friendly category', () => {
    const project = createStaticTemplateProject();
    const module = project.network.modules[0]!;
    project.registry.calibrationMaps.push({
      id: 'calibration.targeted',
      labelKey: 'bfn.fixture.calibration',
      targetModuleId: module.id,
      modelType: 'lookup_table',
      contextId: project.registry.contexts[0]!.id,
      sourceDatasetIds: [],
      candidates: [],
      isDemo: false,
    });
    expect(buildReusableModuleCaptureAvailability(project, module.id)).toMatchObject({
      supported: false,
      failureKind: 'calibration',
    });
  });

  it('rejects inactive model alternatives instead of dropping them', () => {
    const project = createStaticTemplateProject();
    const module = project.network.modules[0]!;
    module.modelVariants.push({ ...structuredClone(module.modelVariants[0]!), id: 'model.extra' });
    expect(buildReusableModuleCaptureAvailability(project, module.id)).toMatchObject({
      supported: false,
      failureKind: 'extra-model',
    });
  });

  it('defaults private entities to travelling with the module', () => {
    const project = createStaticTemplateProject();
    const result = buildReusableModuleCaptureAvailability(project, project.network.modules[0]!.id);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.entityChoices.every((choice) => choice.handling === 'save-with-module')).toBe(
      true,
    );
    expect(result.payload.entities.every((entity) => entity.mode === 'embedded')).toBe(true);
  });

  it('lets a private entity require destination-project confirmation', () => {
    const project = createStaticTemplateProject();
    const module = project.network.modules[0]!;
    const inputEntity = module.inputPorts[0]!.entity;
    const result = buildReusableModuleCaptureAvailability(project, module.id, {
      [inputEntity]: 'slot',
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.payload.entities.some((entity) => entity.mode === 'slot')).toBe(true);
  });

  it('forces a shared nonstandard entity to destination-project confirmation', () => {
    const project = createStaticTemplateProject();
    const module = project.network.modules[0]!;
    const port = module.outputPorts[0]!;
    project.network.outputMonitors.push({
      kind: 'output_monitor',
      id: 'monitor.shared',
      labelKey: 'bfn.fixture.monitor',
      inputPort: { ...port, id: 'monitor.shared.port', direction: 'input' },
      position: { x: 0, y: 0 },
    });
    const result = buildReusableModuleCaptureAvailability(project, module.id);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(
      result.entityChoices.find((choice) => choice.sourceEntityId === port.entity),
    ).toMatchObject({
      handling: 'confirm-in-project',
      userSelectable: false,
    });
  });

  it('handles recognized signal identities automatically', () => {
    const project = createAccumulatorTemplateProject();
    const result = buildReusableModuleCaptureAvailability(project, project.network.modules[0]!.id);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.entityChoices).toEqual([
      expect.objectContaining({ handling: 'recognized-standard', userSelectable: false }),
    ]);
    expect(result.entityPolicies).toEqual({});
  });

  it('does not mutate the source project during capture review', () => {
    const project = createStaticTemplateProject();
    const before = structuredClone(project);
    buildReusableModuleCaptureAvailability(project, project.network.modules[0]!.id);
    expect(project).toEqual(before);
  });
});

describe('module library identity decisions', () => {
  it('creates deterministic saved-module identifier candidates', () => {
    expect(createTemplateIdCandidate('  Reporter response  ', TIME)).toBe(
      createTemplateIdCandidate('Reporter response', TIME),
    );
  });

  it('creates one prechecked project-copy candidate', () => {
    const project = createStaticTemplateProject();
    expect(createModuleInstanceIdCandidate('Reporter response', TIME, project)).toMatch(
      /^user\.module\.reporter-response-library-/u,
    );
  });

  it('returns no candidate when the prechecked project-copy identifier is occupied', () => {
    const project = createStaticTemplateProject();
    const candidate = createModuleInstanceIdCandidate('Reporter response', TIME, project);
    if (!candidate) throw new Error('Expected an available candidate.');
    project.registry.entities.push({
      id: candidate,
      origin: 'user_defined',
      displayName: 'Occupied',
      description: null,
    });
    expect(createModuleInstanceIdCandidate('Reporter response', TIME, project)).toBeNull();
  });

  it('lists exact project identities with natural display names', () => {
    const project = createStaticTemplateProject();
    expect(listProjectEntityChoices(project)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'Inducer X' }),
        expect.objectContaining({ displayName: 'Reporter Y' }),
      ]),
    );
  });

  it('keeps equal display names as distinct explicit choices', () => {
    const project = createStaticTemplateProject();
    project.registry.entities[1]!.displayName = project.registry.entities[0]!.displayName;
    const choices = listProjectEntityChoices(project).filter(
      (choice) => choice.displayName === 'Inducer X',
    );
    expect(choices).toHaveLength(2);
    expect(choices[0]!.entityId).not.toBe(choices[1]!.entityId);
  });

  it('builds an empty decision set when no shared identity is required', () => {
    expect(buildEntityBindingDecisions([], {})).toEqual({});
  });

  it('rejects a missing identity decision', () => {
    expect(buildEntityBindingDecisions(['entity.1'], {})).toBeNull();
  });

  it('rejects an unconfirmed identity decision', () => {
    expect(
      buildEntityBindingDecisions(['entity.1'], {
        'entity.1': { mode: 'create', targetEntityId: '', confirmed: false },
      }),
    ).toBeNull();
  });

  it('rejects an existing-identity choice without an exact target', () => {
    expect(
      buildEntityBindingDecisions(['entity.1'], {
        'entity.1': { mode: 'existing', targetEntityId: '', confirmed: true },
      }),
    ).toBeNull();
  });

  it('builds an exact existing-identity decision', () => {
    expect(
      buildEntityBindingDecisions(['entity.1'], {
        'entity.1': { mode: 'existing', targetEntityId: 'target.entity', confirmed: true },
      }),
    ).toEqual({
      'entity.1': {
        mode: 'existing_same_entity',
        targetEntityId: 'target.entity',
        identityConfirmation: 'same_scientific_entity',
      },
    });
  });

  it('builds a fresh same-identity decision', () => {
    expect(
      buildEntityBindingDecisions(['entity.1'], {
        'entity.1': { mode: 'create', targetEntityId: '', confirmed: true },
      }),
    ).toEqual({
      'entity.1': {
        mode: 'create_same_entity',
        identityConfirmation: 'same_scientific_entity',
      },
    });
  });

  it('requires every shared identity in a multi-identity module', () => {
    expect(
      buildEntityBindingDecisions(['entity.1', 'entity.2'], {
        'entity.1': { mode: 'create', targetEntityId: '', confirmed: true },
      }),
    ).toBeNull();
  });

  it('admits a fully confirmed multi-identity decision set', () => {
    expect(
      buildEntityBindingDecisions(['entity.1', 'entity.2'], {
        'entity.1': { mode: 'create', targetEntityId: '', confirmed: true },
        'entity.2': { mode: 'existing', targetEntityId: 'target.entity', confirmed: true },
      }),
    ).toHaveProperty(['entity.2', 'targetEntityId'], 'target.entity');
  });
});

describe('module library failure presentation categories', () => {
  it.each([
    [BFN_MODULE_LIBRARY_METADATA_CORRUPT, 'corrupt'],
    [BFN_MODULE_LIBRARY_DATABASE_BLOCKED, 'blocked'],
    [BFN_MODULE_LIBRARY_REVISION_CONFLICT, 'conflict'],
    [BFN_MODULE_LIBRARY_TEMPLATE_EXISTS, 'conflict'],
    [BFN_MODULE_LIBRARY_TEMPLATE_NOT_FOUND, 'missing'],
    [BFN_MODULE_LIBRARY_INPUT_INVALID, 'invalid'],
    [BFN_MODULE_LIBRARY_STORAGE_FAILED, 'unavailable'],
  ] as const)('maps repository failure %s without exposing its code', (code, category) => {
    expect(repositoryFailureKind(new BfnModuleLibraryRepositoryError(code))).toBe(category);
  });

  it('maps an unknown storage failure to unavailable', () => {
    expect(repositoryFailureKind(new Error('unavailable'))).toBe('unavailable');
  });

  it.each([
    ['template_schema_invalid', 'corrupt'],
    ['entity_binding_missing', 'entity'],
    ['generated_id_collision', 'collision'],
    ['target_project_schema_invalid', 'project'],
    ['scientific_contract_invalid', 'incomplete'],
  ] as const)('maps add failure %s without exposing its code', (code, category) => {
    expect(instantiationFailureKind([{ code }])).toBe(category);
  });
});
