import { describe, expect, it } from 'vitest';
import { resolveBfnModuleSemanticProfile } from '../../modeling/ontology/v1/ontologyResolver';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from '../catalog/catalogBfnAdapter';
import { createBfnComputationSignature } from '../computationSignature';
import { createDemoBfnProject } from '../fixtures';
import { resolveEffectiveBfnModel } from '../modelResolution';
import type { BfnFunctionalModule, BfnProject } from '../types';
import { resolveBfnModuleTemporalCapability } from './temporalCapability';

function moduleById(project: BfnProject, id = 'module-ahl-sensor'): BfnFunctionalModule {
  const module = project.network.modules.find((candidate) => candidate.id === id);
  if (!module) throw new Error(`missing module fixture: ${id}`);
  return module;
}

describe('BFN temporal capability', () => {
  it('resolves an active static model in a static network as steady-state execution', () => {
    const project = createDemoBfnProject();
    const module = moduleById(project);

    expect(resolveBfnModuleTemporalCapability(project, module)).toEqual({
      executionMode: 'steady_state',
      evidenceTier: 'not_recorded',
      selectedModelId: 'module-ahl-sensor-static-v1',
      selectedModelMode: 'static',
      resolutionBasis: 'active-static',
    });
  });

  it('resolves an active dynamic model as stateful dynamic execution', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const capability = resolveBfnModuleTemporalCapability(project, moduleById(project));

    expect(capability).toEqual({
      executionMode: 'stateful_dynamic',
      evidenceTier: 'not_recorded',
      selectedModelId: 'module-ahl-sensor-dynamic-v1',
      selectedModelMode: 'dynamic',
      resolutionBasis: 'active-dynamic',
    });
    expect(Object.isFrozen(capability)).toBe(true);
  });

  it('names the existing dynamic-to-static fallback quasi-static', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const module = moduleById(project);
    module.modelVariants = module.modelVariants.filter((model) => model.mode === 'static');
    const staticModelId = module.activeModelIds.static;
    if (staticModelId === undefined) throw new Error('Expected paired demo model.');
    module.activeModelIds = { static: staticModelId };

    expect(resolveBfnModuleTemporalCapability(project, module)).toEqual({
      executionMode: 'quasi_static',
      evidenceTier: 'not_recorded',
      selectedModelId: 'module-ahl-sensor-static-v1',
      selectedModelMode: 'static',
      resolutionBasis: 'dynamic-static-fallback',
    });
  });

  it.each(['static', 'dynamic'] as const)(
    'returns unsupported when a %s network has no executable model',
    (mode) => {
      const project = createDemoBfnProject();
      project.network.mode = mode;
      const module = moduleById(project);
      module.modelVariants = [];

      expect(resolveBfnModuleTemporalCapability(project, module)).toEqual({
        executionMode: 'unsupported',
        evidenceTier: 'not_recorded',
        selectedModelId: null,
        selectedModelMode: null,
        resolutionBasis: 'no-executable-model',
      });
    },
  );

  it('reports a Catalog-backed static receiver as T0 and quasi-static in dynamic mode', () => {
    const project = createDemoBfnProject();
    const candidate = buildBfnCatalogRuntimeCandidate(
      AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id,
    );
    const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
      moduleId: 'module-catalog-temporal',
      modulePosition: { x: 400, y: 240 },
      createInputSource: false,
    });
    if (!instantiated.ok) throw new Error(instantiated.error.code);
    instantiated.nextProject.network.mode = 'dynamic';
    const module = moduleById(instantiated.nextProject, instantiated.addedModuleId);

    expect(resolveBfnModuleTemporalCapability(instantiated.nextProject, module)).toMatchObject({
      executionMode: 'quasi_static',
      evidenceTier: 't0_steady_state',
      selectedModelMode: 'static',
      resolutionBasis: 'dynamic-static-fallback',
    });
  });

  it('does not infer T2 or T3 from first-order family or mechanistic evidence grade', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const reporter = moduleById(project, 'module-reporter');
    const capability = resolveBfnModuleTemporalCapability(project, reporter);

    expect(resolveEffectiveBfnModel(project, reporter)).toMatchObject({
      family: 'first_order',
      evidenceGrade: 'mechanistic_model_only',
    });
    expect(capability.executionMode).toBe('stateful_dynamic');
    expect(capability.evidenceTier).toBe('not_recorded');
  });

  it('uses the same selected model as the existing effective-model resolver', () => {
    const project = createDemoBfnProject();
    for (const mode of ['static', 'dynamic'] as const) {
      project.network.mode = mode;
      for (const module of project.network.modules) {
        const selected = resolveEffectiveBfnModel(project, module);
        const capability = resolveBfnModuleTemporalCapability(project, module);
        expect(capability.selectedModelId).toBe(selected?.id ?? null);
        expect(capability.selectedModelMode).toBe(selected?.mode ?? null);
      }
    }
  });

  it('is read-only for Project, Module, and computation signature', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const module = moduleById(project);
    const projectBefore = structuredClone(project);
    const moduleBefore = structuredClone(module);
    const signatureBefore = createBfnComputationSignature(project);

    resolveBfnModuleTemporalCapability(project, module);

    expect(project).toEqual(projectBefore);
    expect(module).toEqual(moduleBefore);
    expect(createBfnComputationSignature(project)).toBe(signatureBefore);
  });

  it('does not change Functional Ontology when analysis mode changes', () => {
    const staticProject = createDemoBfnProject();
    const dynamicProject = structuredClone(staticProject);
    dynamicProject.network.mode = 'dynamic';

    expect(resolveBfnModuleSemanticProfile(moduleById(dynamicProject))).toEqual(
      resolveBfnModuleSemanticProfile(moduleById(staticProject)),
    );
  });
});
