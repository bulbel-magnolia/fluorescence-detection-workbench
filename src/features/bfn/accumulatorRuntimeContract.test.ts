import { describe, expect, it } from 'vitest';
import { assertBfnAccumulatorRate, BfnAccumulatorRateError } from './accumulatorRuntimeContract';
import {
  ACCUMULATOR_MODEL_ID,
  createAccumulatorBfnProject,
  getAccumulatorModule,
} from './testing/accumulatorFixtures';
import type { BfnAccumulatorDynamicModel, BfnProject } from './types';
import { validateBfnProject } from './validation';

function accumulatorModel(project: BfnProject): BfnAccumulatorDynamicModel {
  const model = getAccumulatorModule(project).modelVariants.find(
    (candidate) => candidate.id === ACCUMULATOR_MODEL_ID,
  );
  if (model?.mode !== 'dynamic' || model.family !== 'accumulator') {
    throw new Error('Expected accumulator fixture.');
  }
  return model;
}

function accumulatorContractReason(project: BfnProject): string | undefined {
  return validateBfnProject(project, {
    targetMonitorId: project.network.outputMonitors[0]!.id,
  }).find((issue) => issue.code === 'accumulator_model_contract_invalid')?.details?.reason as
    string | undefined;
}

describe('BFN-SIM 2.2 accumulator central runtime contract', () => {
  it('admits the exact one-rate/one-concentration contract independently of authoring origin', () => {
    const project = createAccumulatorBfnProject();

    expect(getAccumulatorModule(project).authoring).toBeUndefined();
    expect(accumulatorContractReason(project)).toBeUndefined();
  });

  it.each([
    [
      'input_arity_invalid',
      (project: BfnProject) => {
        const module = getAccumulatorModule(project);
        module.inputPorts.push({
          ...structuredClone(module.inputPorts[0]!),
          id: 'port-accumulator-rate-in-extra',
        });
      },
    ],
    [
      'output_arity_invalid',
      (project: BfnProject) => {
        const module = getAccumulatorModule(project);
        module.outputPorts.push({
          ...structuredClone(module.outputPorts[0]!),
          id: 'port-accumulator-state-out-extra',
        });
      },
    ],
    [
      'input_binding_invalid',
      (project: BfnProject) => {
        accumulatorModel(project).inputPortId = 'port-accumulator-rate-in-missing';
      },
    ],
    [
      'output_binding_invalid',
      (project: BfnProject) => {
        accumulatorModel(project).outputPortId = 'port-accumulator-state-out-missing';
      },
    ],
    [
      'entity_mismatch',
      (project: BfnProject) => {
        getAccumulatorModule(project).outputPorts[0]!.entity = 'entity.accumulator.other-signal';
      },
    ],
    [
      'input_quantity_invalid',
      (project: BfnProject) => {
        getAccumulatorModule(project).inputPorts[0]!.quantityType = 'concentration';
      },
    ],
    [
      'output_quantity_invalid',
      (project: BfnProject) => {
        getAccumulatorModule(project).outputPorts[0]!.quantityType = 'amount';
      },
    ],
    [
      'unit_pair_invalid',
      (project: BfnProject) => {
        getAccumulatorModule(project).outputPorts[0]!.unit = 'uM';
      },
    ],
    [
      'initial_state_negative',
      (project: BfnProject) => {
        accumulatorModel(project).initialState = -Number.EPSILON;
      },
    ],
    [
      'uncertainty_contract_invalid',
      (project: BfnProject) => {
        accumulatorModel(project).uncertaintyMethod = 'parameter_interval_envelope';
      },
    ],
  ] as const)('reports stable reason %s', (reason, mutate) => {
    const project = createAccumulatorBfnProject();
    mutate(project);

    expect(accumulatorContractReason(project)).toBe(reason);
  });

  it.each([
    ['nM/h', 'nM'],
    ['uM/h', 'uM'],
  ] as const)('admits the exact %s to %s unit pair', (inputUnit, outputUnit) => {
    const project = createAccumulatorBfnProject();
    const module = getAccumulatorModule(project);
    module.inputPorts[0]!.unit = inputUnit;
    module.outputPorts[0]!.unit = outputUnit;

    expect(accumulatorContractReason(project)).toBeUndefined();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'fails closed with a typed runtime error for rate %s',
    (rate) => {
      expect(() => assertBfnAccumulatorRate(rate)).toThrow(BfnAccumulatorRateError);
      try {
        assertBfnAccumulatorRate(rate);
      } catch (error) {
        expect(error).toMatchObject({ code: 'BFN_ACCUMULATOR_RATE_INVALID' });
      }
    },
  );
});
