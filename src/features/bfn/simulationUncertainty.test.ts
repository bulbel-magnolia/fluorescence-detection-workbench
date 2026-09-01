import { describe, expect, it } from 'vitest';
import { createCatalogModule, createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import {
  assessBfnModelUncertainty,
  createBfnRunUncertaintySnapshot,
} from './simulationUncertainty';
import type { BfnDynamicModel, BfnStaticModel } from './types';

function selectedStaticModel(project = createDemoBfnProject()): BfnStaticModel {
  const module = project.network.modules[0]!;
  const model = module.modelVariants.find(
    (candidate) => candidate.id === module.activeModelIds.static,
  );
  if (model?.mode !== 'static') throw new Error('Expected selected static model');
  return model;
}

function selectedDynamicModel(project = createDemoBfnProject()): BfnDynamicModel {
  project.network.mode = 'dynamic';
  const module = project.network.modules[0]!;
  const model = module.modelVariants.find(
    (candidate) => candidate.id === module.activeModelIds.dynamic,
  );
  if (model?.mode !== 'dynamic' || model.family !== 'first_order') {
    throw new Error('Expected selected dynamic model');
  }
  return model;
}

describe('BFN-SIM 2.1 uncertainty execution contract', () => {
  it('records an executable output-reachable parameter envelope for a new run', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-30T00:00:00.000Z');

    expect(result.engineVersion).toBe('BFN-SIM-2.1');
    expect(result.uncertaintyMethod).toBe('parameter_interval_envelope');
    expect(result.uncertaintySnapshot).toEqual({
      scope: 'output_reachable',
      status: 'available',
      method: 'parameter_interval_envelope',
      modules: project.network.modules.map((module) => ({
        moduleId: module.id,
        selectedModelId: module.activeModelIds.static,
        method: 'parameter_interval_envelope',
        intervalExecutable: true,
        reason: null,
      })),
    });
    expect(result.points.every((point) => typeof point.lower === 'number')).toBe(true);
    expect(result.points.every((point) => typeof point.upper === 'number')).toBe(true);
    expect(result.annApproximation?.metrics.predictionIntervalCoverage).not.toBeNull();
  });

  it.each([
    ['none', 'none_declared'],
    ['not_recorded', 'not_recorded'],
    ['posterior_samples', 'method_not_executable'],
    ['bootstrap', 'method_not_executable'],
    ['covariance', 'method_not_executable'],
  ] as const)(
    'keeps point estimates but does not fabricate an interval for %s',
    (method, reason) => {
      const project = createDemoBfnProject();
      selectedStaticModel(project).uncertaintyMethod = method;

      const result = runBfnSimulation(project);

      expect(result.points.every((point) => Number.isFinite(point.output))).toBe(true);
      expect(result.points.every((point) => point.lower === null && point.upper === null)).toBe(
        true,
      );
      expect(result.uncertaintyMethod).toBeNull();
      expect(result.uncertaintySnapshot).toMatchObject({
        scope: 'output_reachable',
        status: 'unavailable',
        method: null,
        modules: [
          expect.objectContaining({
            method,
            intervalExecutable: false,
            reason,
          }),
          expect.objectContaining({ intervalExecutable: true, reason: null }),
        ],
      });
      expect(result.annApproximation?.metrics.predictionIntervalCoverage).toBeNull();
    },
  );

  it('rejects incomplete, nonfinite, reversed, and estimate-excluding parameter intervals', () => {
    const project = createDemoBfnProject();
    const model = selectedStaticModel(project);
    if (model.response.family !== 'hill_activation') throw new Error('Expected Hill response');

    delete model.response.k.interval95;
    expect(assessBfnModelUncertainty(model)).toMatchObject({
      intervalExecutable: false,
      reason: 'parameter_interval_incomplete',
    });

    Object.assign(model.response.k, { interval95: null });
    expect(assessBfnModelUncertainty(model).intervalExecutable).toBe(false);
    model.response.k.interval95 = [Number.NaN, 12];
    expect(assessBfnModelUncertainty(model).intervalExecutable).toBe(false);
    model.response.k.interval95 = [13, 12];
    expect(assessBfnModelUncertainty(model).intervalExecutable).toBe(false);
    model.response.k.interval95 = [11, 12];
    expect(assessBfnModelUncertainty(model).intervalExecutable).toBe(false);

    const result = runBfnSimulation(project);
    expect(result.points.every((point) => point.lower === null && point.upper === null)).toBe(true);
  });

  it('requires every Hill, linear, independent-input, and dynamic parameter interval', () => {
    const project = createDemoBfnProject();
    const hill = selectedStaticModel(project);
    const linearModule = project.network.modules[1]!;
    const linear = linearModule.modelVariants.find(
      (candidate) => candidate.id === linearModule.activeModelIds.static,
    );
    const independent = createCatalogModule('dual-input-gate', 'interval-audit').modelVariants[0];
    const dynamic = selectedDynamicModel();
    if (linear?.mode !== 'static' || independent?.mode !== 'static') {
      throw new Error('Expected static interval fixtures');
    }

    expect(assessBfnModelUncertainty(hill).intervalExecutable).toBe(true);
    expect(assessBfnModelUncertainty(linear).intervalExecutable).toBe(true);
    expect(assessBfnModelUncertainty(independent).intervalExecutable).toBe(true);
    expect(assessBfnModelUncertainty(dynamic).intervalExecutable).toBe(true);

    if (linear.response.family !== 'linear_transfer') throw new Error('Expected linear response');
    delete linear.response.scale.interval95;
    expect(assessBfnModelUncertainty(linear).intervalExecutable).toBe(false);

    if (independent.response.family !== 'independent_inputs') {
      throw new Error('Expected independent-input response');
    }
    delete independent.response.terms[1]!.contribution.interval95;
    expect(assessBfnModelUncertainty(independent).intervalExecutable).toBe(false);

    delete dynamic.tau.interval95;
    expect(assessBfnModelUncertainty(dynamic).intervalExecutable).toBe(false);
  });

  it('does not let an output-unreachable module suppress the final interval', () => {
    const project = createDemoBfnProject();
    const unrelated = createCatalogModule('ahl-sensor', 'unreachable');
    const unrelatedModel = unrelated.modelVariants[0];
    if (unrelatedModel?.mode !== 'static') throw new Error('Expected unrelated static model');
    unrelatedModel.uncertaintyMethod = 'not_recorded';
    project.network.modules.push(unrelated);

    const snapshot = createBfnRunUncertaintySnapshot(
      project,
      project.network.outputMonitors[0]!.id,
    );
    const result = runBfnSimulation(project);

    expect(snapshot.status).toBe('available');
    expect(snapshot.modules.map((module) => module.moduleId)).not.toContain(unrelated.id);
    expect(result.points.every((point) => point.lower !== null && point.upper !== null)).toBe(true);
  });

  it('marks a dynamic result point-only when tau lacks an interval', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    delete selectedDynamicModel(project).tau.interval95;

    const result = runBfnSimulation(project);

    expect(result.engineVersion).toBe('BFN-SIM-2.1');
    expect(result.uncertaintySnapshot.status).toBe('unavailable');
    expect(result.uncertaintySnapshot.modules[0]).toMatchObject({
      intervalExecutable: false,
      reason: 'parameter_interval_incomplete',
    });
    expect(result.points.every((point) => point.lower === null && point.upper === null)).toBe(true);
  });

  it('marks a malformed persisted dynamic response unavailable without fabricating intervals', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const model = selectedDynamicModel(project);
    const malformedModel = model as unknown as { steadyStateResponse?: unknown };
    delete malformedModel.steadyStateResponse;

    expect(() => createBfnRunUncertaintySnapshot(project, 'monitor-reporter')).not.toThrow();
    const snapshot = createBfnRunUncertaintySnapshot(project, 'monitor-reporter');
    expect(snapshot.status).toBe('unavailable');
    expect(snapshot.method).toBeNull();
    expect(snapshot.modules[0]).toMatchObject({
      selectedModelId: model.id,
      intervalExecutable: false,
      reason: 'parameter_interval_incomplete',
    });
  });
});
