import { describe, expect, it, vi } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import type { calculateBfnNetworkInfluence } from './networkInfluence';
import type { BfnNetworkInfluenceCalculationV1 } from './networkInfluenceTypes';

vi.mock('./networkInfluence', async (importOriginal) => {
  const actual = await importOriginal<{
    calculateBfnNetworkInfluence: typeof calculateBfnNetworkInfluence;
  }>();
  return {
    ...actual,
    calculateBfnNetworkInfluence: (
      ...args: Parameters<typeof actual.calculateBfnNetworkInfluence>
    ) => {
      const calculation = actual.calculateBfnNetworkInfluence(...args);
      if (!calculation.ok) return calculation;
      const interpretation = calculation.result.moduleInterpretations[0];
      const input = interpretation?.localInfluence.perInput[0];
      if (!input) throw new Error('Expected a relevant local input.');
      const modified: BfnNetworkInfluenceCalculationV1 = {
        ...calculation,
        result: {
          ...calculation.result,
          moduleInterpretations: [
            {
              ...interpretation,
              localInfluence: {
                ...interpretation.localInfluence,
                perInput: [
                  {
                    ...input,
                    localDifferentialGain: {
                      availability: 'unavailable',
                      reason: 'analytic_derivative_not_supported',
                      unit: input.localDifferentialGain.unit,
                    },
                  },
                  ...interpretation.localInfluence.perInput.slice(1),
                ],
              },
            },
            ...calculation.result.moduleInterpretations.slice(1),
          ],
        },
      };
      return modified;
    },
  };
});

import { calculateBfnDynamicGain } from './dynamicGain';

describe('complete dynamic linearization gate', () => {
  it('fails closed for any other unsupported analytic derivative reason', () => {
    const project = createDemoBfnProject();
    const calculation = calculateBfnDynamicGain(project, {
      contractVersion: '1.0',
      scope: 'network_dynamic_periodic_gain',
      outputMonitorId: project.network.outputMonitors[0]!.id,
      operatingPoint: [{ inputSourceId: 'source-ahl', value: 10, unit: 'nM' }],
      perturbation: { periodHours: 2 },
    });

    expect(calculation).toMatchObject({
      ok: false,
      calculationIssue: {
        code: 'incomplete_local_dynamic_linearization',
        moduleId: 'module-ahl-sensor',
        inputPortId: 'module-ahl-sensor-in',
        reason: 'analytic_derivative_not_supported',
      },
    });
  });
});
