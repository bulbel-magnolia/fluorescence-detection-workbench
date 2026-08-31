import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { isBfnProjectV22 } from '../bfnIrMigration';
import { createDemoBfnProject } from '../fixtures';
import { parseBfnProject } from '../repository';
import type { BfnStaticModel } from '../types';
import type { UserDefinedFunctionalModuleDraft } from './userModuleContract';
import { assessUserDefinedFunctionalModule } from './userModuleValidation';
import { materializeUserDefinedStaticModule } from './userModuleMaterialization';

describe('user-defined static module materialization', () => {
  beforeEach(() => localStorage.clear());

  it('materializes a Hill module losslessly without using the historical representation gap as a gate', () => {
    const project = createDemoBfnProject();
    const draft = createHillDraft();
    const assessment = assessUserDefinedFunctionalModule(draft);
    expect(assessment.representation.state).toBe('requires_ir_extension');

    const result = materializeUserDefinedStaticModule(Object.freeze(draft), project);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const module = result.nextProject.network.modules.at(-1)!;
    const model = module.modelVariants[0] as BfnStaticModel;
    expect(result.addedModuleId).toBe(draft.id);
    expect(module).toMatchObject({
      kind: 'functional_module',
      id: draft.id,
      labelKey: 'bfn.userDefined.genericModule',
      descriptionKey: 'bfn.userDefined.genericDescription',
      authoring: {
        origin: 'user_defined',
        name: draft.name,
        description: draft.description,
      },
      activeModelIds: { static: `${draft.id}.model.static.v1` },
      implementationIds: [],
      implementationState: 'unspecified',
      evidenceGrade: 'proposed_unbuilt_design',
      isDemo: false,
    });
    expect(module).not.toHaveProperty('displayName');
    expect(module.inputPorts[0]).toEqual({
      id: 'input-inducer',
      authoring: { origin: 'user_defined', name: 'Inducer role' },
      entity: 'entity.user.inducer-x',
      quantityType: 'concentration',
      unit: 'nM',
      direction: 'input',
    });
    expect(module.outputPorts[0]).toEqual({
      id: 'output-production',
      authoring: { origin: 'user_defined', name: 'Product formation role' },
      entity: 'entity.user.product-x',
      quantityType: 'production_rate',
      unit: 'nM/h',
      direction: 'output',
    });
    expect(model).toMatchObject({
      id: `${draft.id}.model.static.v1`,
      version: '1.0.0',
      mode: 'static',
      family: 'hill_activation',
      contextId: null,
      validityDomainId: `${draft.id}.domain.v1`,
      sourceDatasetIds: [],
      provenanceIds: [],
      evidenceGrade: 'proposed_unbuilt_design',
      uncertaintyMethod: 'not_recorded',
      isDemo: false,
      response: {
        family: 'hill_activation',
        inputPortId: 'input-inducer',
      },
    });
    expect(model.response).not.toHaveProperty('tau');
    expect(result.nextProject.registry.validityDomains.at(-1)).toEqual({
      id: `${draft.id}.domain.v1`,
      labelKey: 'bfn.userDefined.genericValidityDomain',
      inputRanges: draft.validityDomains,
      contextId: null,
    });
    expect(result.nextProject.registry.entities.slice(-2)).toEqual([
      {
        id: 'entity.user.inducer-x',
        origin: 'user_defined',
        displayName: 'Inducer X',
        description: null,
      },
      {
        id: 'entity.user.product-x',
        origin: 'user_defined',
        displayName: 'Product X',
        description: null,
      },
    ]);
    expect(result.nextProject.network.edges).toEqual(project.network.edges);
    expect(result.nextProject.network.outputMonitors).toEqual(project.network.outputMonitors);
    expect(result.nextProject.network.inputSources).toEqual(project.network.inputSources);
  });

  it.each([
    ['hill_repression', createRepressionDraft],
    ['linear_transfer', createLinearDraft],
    ['independent_inputs', createIndependentDraft],
  ] as const)('materializes the supported %s family exactly', (family, createDraft) => {
    const result = materializeUserDefinedStaticModule(createDraft(), createDemoBfnProject());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const module = result.nextProject.network.modules.at(-1)!;
    const model = module.modelVariants[0];
    expect(model).toMatchObject({ mode: 'static', family, response: { family } });
    expect(module.outputPorts).toHaveLength(1);
    expect(module.modelVariants).toHaveLength(1);
    expect(module.activeModelIds.dynamic).toBeUndefined();
    if (family === 'independent_inputs' && model?.mode === 'static') {
      expect(model.response).toMatchObject({
        aggregation: 'bounded_sum',
        interactionAssumption: 'independent_unverified',
        terms: [
          expect.objectContaining({ inputPortId: 'input-a', direction: 'activation' }),
          expect.objectContaining({ inputPortId: 'input-b', direction: 'repression' }),
        ],
      });
    }
  });

  it('reuses exact existing entity IDs without adding label overrides', () => {
    const project = createDemoBfnProject();
    const draft = createHillDraft({
      ports: [
        {
          id: 'input-inducer',
          name: 'Existing AHL role',
          entity: { id: '3OC6-HSL', displayName: '3OC6-HSL' },
          quantityType: 'concentration',
          unit: 'nM',
          direction: 'input',
        },
        createHillDraft().ports[1]!,
      ],
    });

    const result = materializeUserDefinedStaticModule(draft, project);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextProject.registry.entities.some((entity) => entity.id === '3OC6-HSL')).toBe(
      false,
    );
    expect(result.nextProject.network.modules.at(-1)!.inputPorts[0]!.entity).toBe('3OC6-HSL');
  });

  it('reuses an identical user entity and rejects an authoritative display-name conflict', () => {
    const project = createDemoBfnProject();
    project.registry.entities.push({
      id: 'entity.user.inducer-x',
      origin: 'user_defined',
      displayName: 'Inducer X',
      description: null,
    });

    const reused = materializeUserDefinedStaticModule(createHillDraft(), project);
    expect(reused.ok).toBe(true);
    if (reused.ok) {
      expect(
        reused.nextProject.registry.entities.filter(
          (entity) => entity.id === 'entity.user.inducer-x',
        ),
      ).toHaveLength(1);
    }

    const conflict = materializeUserDefinedStaticModule(
      createHillDraft({
        ports: [
          {
            ...createHillDraft().ports[0]!,
            entity: { id: 'entity.user.inducer-x', displayName: 'Different inducer' },
          },
          createHillDraft().ports[1]!,
        ],
      }),
      project,
    );
    expect(conflict).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'entity_display_name_conflict' })],
    });
  });

  it('rejects conflicting names for one new entity within the draft', () => {
    const draft = createIndependentDraft();
    const conflict: UserDefinedFunctionalModuleDraft = {
      ...draft,
      ports: draft.ports.map((port, index) =>
        index < 2
          ? {
              ...port,
              entity: {
                id: 'entity.user.shared-input',
                displayName: index === 0 ? 'Shared input' : 'Conflicting input',
              },
            }
          : port,
      ),
    };

    expect(materializeUserDefinedStaticModule(conflict, createDemoBfnProject())).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'entity_display_name_conflict' })],
    });
  });

  it('preserves not-recorded Context as null and maps defined Context to partial or recorded', () => {
    const notRecorded = materializeUserDefinedStaticModule(
      createHillDraft(),
      createDemoBfnProject(),
    );
    expect(notRecorded.ok).toBe(true);
    if (!notRecorded.ok) return;
    const notRecordedModel = notRecorded.nextProject.network.modules.at(-1)!.modelVariants[0]!;
    expect(notRecordedModel.contextId).toBeNull();
    expect(notRecorded.nextProject.registry.contexts).toHaveLength(
      createDemoBfnProject().registry.contexts.length,
    );

    const partial = materializeUserDefinedStaticModule(
      createHillDraft({
        context: { state: 'defined', facts: { hostSpecies: 'Escherichia coli', ph: 7 } },
      }),
      createDemoBfnProject(),
    );
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.nextProject.registry.contexts.at(-1)).toMatchObject({
      id: `${createHillDraft().id}.context.v1`,
      documentationState: 'partial',
      host: 'Escherichia coli',
      strain: null,
      medium: null,
      temperatureCelsius: null,
      ph: 7,
      isDemo: false,
    });

    const recorded = materializeUserDefinedStaticModule(
      createHillDraft({
        context: {
          state: 'defined',
          facts: {
            hostSpecies: 'Escherichia coli',
            hostStrain: 'MG1655',
            medium: 'M9',
            temperatureCelsius: 37,
          },
        },
      }),
      createDemoBfnProject(),
    );
    expect(recorded.ok).toBe(true);
    if (recorded.ok) {
      expect(recorded.nextProject.registry.contexts.at(-1)?.documentationState).toBe('recorded');
      expect(recorded.nextProject.registry.validityDomains.at(-1)?.contextId).toBe(
        `${createHillDraft().id}.context.v1`,
      );
    }
  });

  it('rejects an empty defined Context instead of creating a placeholder record', () => {
    const result = materializeUserDefinedStaticModule(
      createHillDraft({ context: { state: 'defined', facts: {} } }),
      createDemoBfnProject(),
    );

    expect(result).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'defined_context_empty' })],
    });
  });

  it.each([
    [{ state: 'not_recorded' } as const, 'not_recorded'],
    [{ state: 'none' } as const, 'none'],
    [
      { state: 'reported', method: 'parameter_interval_envelope' } as const,
      'parameter_interval_envelope',
    ],
    [{ state: 'reported', method: 'posterior_samples' } as const, 'posterior_samples'],
  ])('maps uncertainty %o to %s without changing parameter estimates', (uncertainty, method) => {
    const baseDraft = createHillDraft({ uncertainty });
    const draft =
      uncertainty.state === 'reported' && uncertainty.method === 'parameter_interval_envelope'
        ? {
            ...baseDraft,
            model: {
              ...baseDraft.model,
              parameters: {
                ...baseDraft.model.parameters,
                k: { value: 12, unit: 'nM', interval95: [10, 14] as const },
                n: { value: 2, unit: 'dimensionless', interval95: [1.7, 2.3] as const },
                ymin: { value: 0.1, unit: 'nM/h', interval95: [0.05, 0.2] as const },
                ymax: { value: 4.2, unit: 'nM/h', interval95: [3.8, 4.8] as const },
              },
            },
          }
        : baseDraft;

    const result = materializeUserDefinedStaticModule(draft, createDemoBfnProject());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextProject.network.modules.at(-1)!.modelVariants[0]).toMatchObject({
      uncertaintyMethod: method,
    });
  });

  it('requires complete valid intervals for a reported parameter envelope', () => {
    const baseDraft = createHillDraft({
      uncertainty: { state: 'reported', method: 'parameter_interval_envelope' },
    });
    const draft: UserDefinedFunctionalModuleDraft = {
      ...baseDraft,
      model: {
        ...baseDraft.model,
        parameters: {
          ...baseDraft.model.parameters,
          k: { value: 12, unit: 'nM', interval95: [13, 14] },
        },
      },
    };

    const result = materializeUserDefinedStaticModule(draft, createDemoBfnProject());

    expect(result).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'parameter_interval_incomplete' })],
    });
  });

  it('gates strong evidence on valid provenance and preserves generated provenance links', () => {
    const missing = materializeUserDefinedStaticModule(
      createHillDraft({
        evidence: { basis: 'measured_single_context', provenance: [] },
      }),
      createDemoBfnProject(),
    );
    expect(missing).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'evidence_unclaimable' })],
    });

    const draft = createHillDraft({
      evidence: {
        basis: 'fitted_from_published_data',
        provenance: [
          {
            id: 'draft-source-id',
            kind: 'publication',
            reference: 'Example et al. 2026, doi:10.0000/example',
          },
        ],
      },
    });
    const result = materializeUserDefinedStaticModule(draft, createDemoBfnProject());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextProject.registry.provenanceRecords.at(-1)).toEqual({
      id: `${draft.id}.provenance.1`,
      kind: 'publication',
      reference: 'Example et al. 2026, doi:10.0000/example',
    });
    expect(result.nextProject.network.modules.at(-1)!.modelVariants[0]).toMatchObject({
      provenanceIds: [`${draft.id}.provenance.1`],
      evidenceGrade: 'fitted_from_published_data',
      sourceDatasetIds: [],
    });
    expect(result.nextProject.network.modules.at(-1)!.evidenceGrade).toBe(
      'fitted_from_published_data',
    );
  });

  it('accepts only existing implementation IDs when implementation is specified', () => {
    const project = createDemoBfnProject();
    const existingId = project.registry.implementations[0]!.id;
    const valid = materializeUserDefinedStaticModule(
      createHillDraft({
        implementation: { state: 'designed', implementationIds: [existingId] },
      }),
      project,
    );
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.nextProject.network.modules.at(-1)).toMatchObject({
        implementationState: 'designed',
        implementationIds: [existingId],
      });
    }

    const missing = materializeUserDefinedStaticModule(
      createHillDraft({
        implementation: { state: 'designed', implementationIds: ['implementation-missing'] },
      }),
      project,
    );
    expect(missing).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'implementation_reference_missing' })],
    });
  });

  it('rejects unsupported semantics, runtime, and generated-ID collisions with structured issues', () => {
    const baseDraft = createHillDraft();
    const unsupported: UserDefinedFunctionalModuleDraft = {
      ...baseDraft,
      model: { ...baseDraft.model, family: 'custom_formula' },
    };
    expect(materializeUserDefinedStaticModule(unsupported, createDemoBfnProject())).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({ code: 'semantic_invalid' }),
        expect.objectContaining({ code: 'runtime_unsupported' }),
      ],
    });

    const project = createDemoBfnProject();
    project.registry.validityDomains.push({
      id: `${createHillDraft().id}.model.static.v1`,
      labelKey: 'collision',
      inputRanges: [],
      contextId: null,
    });
    expect(materializeUserDefinedStaticModule(createHillDraft(), project)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'generated_id_collision' })],
    });
  });

  it('is deterministic, non-mutating, structurally valid, and export/import stable', () => {
    const project = createDemoBfnProject();
    const draft = createIndependentDraft();
    const projectBefore = structuredClone(project);
    const draftBefore = structuredClone(draft);
    localStorage.setItem('batch-12-1-materialization-sentinel', 'unchanged');

    const first = materializeUserDefinedStaticModule(Object.freeze(draft), project);
    const second = materializeUserDefinedStaticModule(Object.freeze(draft), project);

    expect(first).toEqual(second);
    expect(project).toEqual(projectBefore);
    expect(draft).toEqual(draftBefore);
    expect(localStorage.getItem('batch-12-1-materialization-sentinel')).toBe('unchanged');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(isBfnProjectV22(first.nextProject)).toBe(true);
    expect(parseBfnProject(JSON.stringify(first.nextProject))).toEqual(first.nextProject);
    expect(first.nextProject.createdAt).toBe(project.createdAt);
    expect(first.nextProject.updatedAt).toBe(project.updatedAt);

    const productionSource = readFileSync(
      resolve(process.cwd(), 'src/features/bfn/user-defined/userModuleMaterialization.ts'),
      'utf8',
    );
    expect(productionSource).not.toMatch(
      /localStorage|indexedDB|runBfnSimulation|senderRuntimeAdmission|ontologyAssignments|react|Math\.random|Date\./i,
    );
  });
});

function createHillDraft(
  overrides: Partial<UserDefinedFunctionalModuleDraft> = {},
): UserDefinedFunctionalModuleDraft {
  return {
    id: 'user.module.static-production',
    origin: 'user_defined',
    name: 'Static production response',
    description: 'A user-authored static functional response.',
    ports: [
      {
        id: 'input-inducer',
        name: 'Inducer role',
        entity: { id: 'entity.user.inducer-x', displayName: 'Inducer X' },
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
      {
        id: 'output-production',
        name: 'Product formation role',
        entity: { id: 'entity.user.product-x', displayName: 'Product X' },
        quantityType: 'production_rate',
        unit: 'nM/h',
        direction: 'output',
      },
    ],
    model: {
      family: 'hill_activation',
      inputPortIds: ['input-inducer'],
      outputPortIds: ['output-production'],
      parameters: {
        k: { value: 12, unit: 'nM' },
        n: { value: 2, unit: 'dimensionless' },
        ymin: { value: 0.1, unit: 'nM/h' },
        ymax: { value: 4.2, unit: 'nM/h' },
      },
    },
    validityDomains: [{ portId: 'input-inducer', minimum: 0, maximum: 100, unit: 'nM' }],
    context: { state: 'not_recorded' },
    uncertainty: { state: 'not_recorded' },
    evidence: { basis: 'proposed_unbuilt_design', provenance: [] },
    implementation: { state: 'unspecified', implementationIds: [] },
    ...overrides,
  };
}

function createRepressionDraft(): UserDefinedFunctionalModuleDraft {
  const draft = createHillDraft();
  return {
    ...draft,
    id: 'user.module.static-repression',
    model: { ...draft.model, family: 'hill_repression' },
  };
}

function createLinearDraft(): UserDefinedFunctionalModuleDraft {
  const draft = createHillDraft();
  return {
    ...draft,
    id: 'user.module.static-linear',
    ports: [
      {
        ...draft.ports[0]!,
        entity: { id: 'entity.user.activity-in', displayName: 'Input activity' },
        quantityType: 'activity',
        unit: 'RPU',
      },
      {
        ...draft.ports[1]!,
        entity: { id: 'entity.user.activity-out', displayName: 'Output activity' },
        quantityType: 'expression_level',
        unit: 'RPU',
      },
    ],
    model: {
      family: 'linear_transfer',
      inputPortIds: ['input-inducer'],
      outputPortIds: ['output-production'],
      parameters: {
        scale: { value: 0.8, unit: 'dimensionless' },
        intercept: { value: 0.1, unit: 'RPU' },
      },
    },
    validityDomains: [{ portId: 'input-inducer', minimum: 0, maximum: 10, unit: 'RPU' }],
  };
}

function createIndependentDraft(): UserDefinedFunctionalModuleDraft {
  const draft = createHillDraft();
  return {
    ...draft,
    id: 'user.module.static-independent',
    ports: [
      {
        ...draft.ports[0]!,
        id: 'input-a',
        name: 'Activator role',
      },
      {
        ...draft.ports[0]!,
        id: 'input-b',
        name: 'Repressor role',
        entity: { id: 'entity.user.inducer-y', displayName: 'Inducer Y' },
      },
      draft.ports[1]!,
    ],
    model: {
      family: 'independent_inputs',
      inputPortIds: ['input-a', 'input-b'],
      outputPortIds: ['output-production'],
      parameters: {
        basal: { value: 0.1, unit: 'nM/h' },
        outputMaximum: { value: 5, unit: 'nM/h' },
      },
      terms: [
        {
          inputPortId: 'input-a',
          mode: 'activation',
          k: { value: 12, unit: 'nM' },
          n: { value: 2, unit: 'dimensionless' },
          weight: { value: 0.6, unit: 'dimensionless' },
        },
        {
          inputPortId: 'input-b',
          mode: 'repression',
          k: { value: 8, unit: 'nM' },
          n: { value: 1.5, unit: 'dimensionless' },
          weight: { value: 0.4, unit: 'dimensionless' },
        },
      ],
      aggregation: 'bounded_sum',
      interactionAssumption: 'independent_unverified',
    },
    validityDomains: [
      { portId: 'input-a', minimum: 0, maximum: 100, unit: 'nM' },
      { portId: 'input-b', minimum: 0, maximum: 80, unit: 'nM' },
    ],
    evidence: { basis: 'independent_assumption', provenance: [] },
  };
}
