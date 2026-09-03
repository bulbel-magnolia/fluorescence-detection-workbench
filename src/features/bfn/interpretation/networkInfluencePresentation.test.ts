import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import {
  assessBfnNetworkInfluenceAvailability,
  bfnNetworkInfluencePrefill,
} from './networkInfluencePresentation';

describe('network influence presentation helpers', () => {
  it('exposes a resolved target even while UI operating values are empty', () => {
    const project = createDemoBfnProject();
    expect(
      assessBfnNetworkInfluenceAvailability(project, project.network.outputMonitors[0]!),
    ).toMatchObject({ supported: true, reason: null });
  });

  it('maps Accumulator, feedback, missing input, and invalid response to user-level reasons', () => {
    const accumulator = createAccumulatorBfnProject();
    expect(
      assessBfnNetworkInfluenceAvailability(accumulator, accumulator.network.outputMonitors[0]!),
    ).toMatchObject({ supported: false, reason: 'dynamic_integrator' });

    const missing = createDemoBfnProject();
    missing.network.edges = missing.network.edges.filter(
      (edge) => edge.id !== 'edge-source-sensor',
    );
    expect(
      assessBfnNetworkInfluenceAvailability(missing, missing.network.outputMonitors[0]!),
    ).toMatchObject({ supported: false, reason: 'missing_input' });

    const invalid = createDemoBfnProject();
    invalid.network.modules[0]!.activeModelIds = { static: 'missing-model' };
    expect(
      assessBfnNetworkInfluenceAvailability(invalid, invalid.network.outputMonitors[0]!),
    ).toMatchObject({ supported: false, reason: 'response_invalid' });
  });

  it('prefills only static fixed values and dynamic constant values', () => {
    const project = createDemoBfnProject();
    expect(bfnNetworkInfluencePrefill(project, 'source-ahl')).toBeNull();

    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: 12,
      unit: 'nM',
    };
    expect(bfnNetworkInfluencePrefill(project, 'source-ahl')).toBe(12);

    project.network.mode = 'dynamic';
    expect(bfnNetworkInfluencePrefill(project, 'source-ahl')).toBeNull();
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 7,
      unit: 'nM',
    };
    expect(bfnNetworkInfluencePrefill(project, 'source-ahl')).toBe(7);
  });
});
