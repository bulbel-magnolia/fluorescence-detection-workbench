import { describe, expect, it } from 'vitest';
import { createBfnComputationSignature } from './computationSignature';
import { createDemoBfnProject } from './fixtures';

describe('BFN computation signature', () => {
  it('excludes layout and project presentation metadata', () => {
    const project = createDemoBfnProject();
    const moved = structuredClone(project);
    moved.updatedAt = '2030-01-01T00:00:00.000Z';
    moved.labelKey = 'bfn.project.renamed';
    moved.network.labelKey = 'bfn.network.renamed';
    moved.network.modules[0]!.position = { x: 777, y: 333 };
    moved.network.inputSources[0]!.position = { x: 91, y: 42 };

    expect(createBfnComputationSignature(moved)).toBe(createBfnComputationSignature(project));
  });

  it('tracks inputs, network structure, active models, domains, and analysis settings', () => {
    const project = createDemoBfnProject();
    const baseline = createBfnComputationSignature(project);
    const variants = [
      (candidate: typeof project) => {
        candidate.network.inputSources[0]!.staticSpecification = {
          type: 'fixed_value',
          value: 12,
          unit: 'nM',
        };
      },
      (candidate: typeof project) => {
        candidate.network.edges[0]!.enabled = false;
      },
      (candidate: typeof project) => {
        const model = candidate.network.modules[0]!.modelVariants[0]!;
        if (model.mode === 'static' && model.response.family === 'hill_activation') {
          model.response.k.value = 11;
        }
      },
      (candidate: typeof project) => {
        candidate.registry.validityDomains[0]!.inputRanges[0]!.maximum = 90;
      },
      (candidate: typeof project) => {
        candidate.registry.contexts[0]!.temperatureCelsius = 30;
      },
      (candidate: typeof project) => {
        candidate.analysis.annThresholds.minimumR2 = 0.995;
      },
    ];

    for (const mutate of variants) {
      const candidate = structuredClone(project);
      mutate(candidate);
      expect(createBfnComputationSignature(candidate)).not.toBe(baseline);
    }
  });

  it('ignores inactive model parameter changes until that model becomes active', () => {
    const project = createDemoBfnProject();
    const changed = structuredClone(project);
    const dynamicModel = changed.network.modules[0]!.modelVariants.find(
      (model) => model.mode === 'dynamic',
    );
    if (!dynamicModel || dynamicModel.mode !== 'dynamic')
      throw new Error('dynamic fixture missing');
    dynamicModel.tau.value += 1;

    expect(createBfnComputationSignature(changed)).toBe(createBfnComputationSignature(project));
    changed.network.mode = 'dynamic';
    expect(createBfnComputationSignature(changed)).not.toBe(
      createBfnComputationSignature({
        ...project,
        network: { ...project.network, mode: 'dynamic' },
      }),
    );
  });
});
