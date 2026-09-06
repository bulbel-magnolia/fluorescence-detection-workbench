import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { assessBfnDynamicGainAvailability, bfnDynamicGainPrefill } from './dynamicGainPresentation';

describe('dynamic gain presentation contract', () => {
  it('enables a supported static target', () => {
    const project = createDemoBfnProject();
    expect(
      assessBfnDynamicGainAvailability(project, project.network.outputMonitors[0]!),
    ).toMatchObject({ supported: true, reason: null });
  });

  it('delegates static and dynamic prefill rules to Batch 13.2', () => {
    const project = createDemoBfnProject();
    const source = project.network.inputSources[0]!;
    source.staticSpecification = { type: 'fixed_value', value: 7, unit: 'nM' };
    expect(bfnDynamicGainPrefill(project, source.id)).toBe(7);
    source.staticSpecification = {
      type: 'working_range',
      minimum: 0,
      maximum: 10,
      points: 3,
      unit: 'nM',
    };
    expect(bfnDynamicGainPrefill(project, source.id)).toBeNull();

    project.network.mode = 'dynamic';
    source.dynamicSpecification = { type: 'constant', value: 9, unit: 'nM' };
    expect(bfnDynamicGainPrefill(project, source.id)).toBe(9);
    source.dynamicSpecification = { type: 'constant', value: 9, unit: 'uM' };
    expect(bfnDynamicGainPrefill(project, source.id)).toBeNull();
  });
});
