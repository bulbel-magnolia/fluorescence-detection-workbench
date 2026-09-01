import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import { activeModelForModule, resolveEffectiveBfnModel } from './modelResolution';
import {
  ACCUMULATOR_MODEL_ID,
  createAccumulatorBfnProject,
  getAccumulatorModule,
} from './testing/accumulatorFixtures';

function createStaticOnlyProject() {
  const project = createDemoBfnProject();
  const module = project.network.modules[0]!;
  const staticModel = module.modelVariants.find(({ mode }) => mode === 'static')!;
  module.modelVariants = [staticModel];
  module.activeModelIds = { static: staticModel.id };
  return project;
}

describe('BFN active model resolution', () => {
  it('selects the active static model in a static network', () => {
    const project = createStaticOnlyProject();
    const module = project.network.modules[0]!;

    expect(resolveEffectiveBfnModel(project, module)).toBe(module.modelVariants[0]);
  });

  it('keeps the existing quasi-static fallback for a static-only module in a dynamic network', () => {
    const project = createStaticOnlyProject();
    project.network.mode = 'dynamic';
    const module = project.network.modules[0]!;

    expect(activeModelForModule(module, 'dynamic')).toBeNull();
    expect(resolveEffectiveBfnModel(project, module)).toBe(module.modelVariants[0]);
  });

  it('selects the active first-order model from a paired module in a dynamic network', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const module = project.network.modules[0]!;

    expect(resolveEffectiveBfnModel(project, module)).toBe(
      module.modelVariants.find(({ mode }) => mode === 'dynamic'),
    );
  });

  it('selects a dynamic-only accumulator representation in a dynamic network', () => {
    const project = createAccumulatorBfnProject();
    const module = getAccumulatorModule(project);

    expect(resolveEffectiveBfnModel(project, module)).toMatchObject({
      id: ACCUMULATOR_MODEL_ID,
      mode: 'dynamic',
      family: 'accumulator',
    });
  });

  it('returns null for a dynamic-only accumulator in a static network', () => {
    const project = createAccumulatorBfnProject();
    project.network.mode = 'static';

    expect(resolveEffectiveBfnModel(project, getAccumulatorModule(project))).toBeNull();
  });
});
