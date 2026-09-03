import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import type { BfnLocalDifferentialGainV1 } from './interpretationTypes';
import {
  assessBfnLocalInfluenceAvailability,
  bfnLocalInfluenceDirection,
} from './localInfluencePresentation';

function available(value: number): BfnLocalDifferentialGainV1 {
  return {
    availability: 'available',
    value,
    unit: { outputUnit: 'dimensionless', inputUnit: 'dimensionless' },
  };
}

describe('local influence presentation', () => {
  it.each([
    { value: 1, direction: 'enhancing' },
    { value: -1, direction: 'inhibiting' },
    { value: 0, direction: 'no_local_change' },
  ] as const)('maps the exact gain sign to $direction', ({ value, direction }) => {
    expect(bfnLocalInfluenceDirection(available(value))).toBe(direction);
  });

  it('maps an unavailable gain without applying a near-zero tolerance', () => {
    expect(
      bfnLocalInfluenceDirection({
        availability: 'unavailable',
        reason: 'derivative_not_unique',
        unit: { outputUnit: 'dimensionless', inputUnit: 'dimensionless' },
      }),
    ).toBe('unavailable');
    expect(bfnLocalInfluenceDirection(available(Number.MIN_VALUE))).toBe('enhancing');
  });

  it('admits a static target preview without inventing operating values', () => {
    const project = createDemoBfnProject();
    const availability = assessBfnLocalInfluenceAvailability(project, project.network.modules[0]!);
    expect(availability).toMatchObject({ supported: true });
  });

  it('classifies an accumulator as a dynamic integrator', () => {
    const project = createAccumulatorBfnProject();
    expect(assessBfnLocalInfluenceAvailability(project, project.network.modules[0]!)).toEqual({
      supported: false,
      target: null,
      reason: 'dynamic_integrator',
    });
  });
});
