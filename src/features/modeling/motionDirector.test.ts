import { describe, expect, it } from 'vitest';
import { createTemplate } from './modelingCore';
import { buildNarrativePlan, narrativeDurations, sampleNarrative } from './motionDirector';
import type { TemplateLabels } from './types';

const labels: TemplateLabels = {
  modelName: 'Test model',
  description: 'Test',
  nodes: {
    sensorA: 'A',
    sensorB: 'B',
    sensorC: 'C',
    integration: 'Integration',
    gate: 'Gate',
    memory: 'Memory',
    response: 'Response',
    reporter: 'Reporter',
  },
};

describe('modeling motion director', () => {
  it('builds deterministic full, rerun and reduced timelines', () => {
    const model = createTemplate('licorice-quality', labels);
    expect(buildNarrativePlan(model, 'full', false).duration).toBe(narrativeDurations.full);
    expect(buildNarrativePlan(model, 'rerun', false).duration).toBe(narrativeDurations.rerun);
    expect(buildNarrativePlan(model, 'full', true).duration).toBe(narrativeDurations.reduced);
  });

  it('orders enabled edges and reaches the same complete state when skipped', () => {
    const model = createTemplate('licorice-quality', labels);
    const plan = buildNarrativePlan(model, 'full', false);
    expect(
      plan.edges.every((edge, index) => index === 0 || plan.edges[index - 1]!.end <= edge.start),
    ).toBe(true);
    expect(sampleNarrative(plan, 0).chapter).toBe('establish');
    expect(sampleNarrative(plan, plan.duration)).toMatchObject({
      status: 'complete',
      complete: true,
      revealProgress: 1,
    });
  });
});
