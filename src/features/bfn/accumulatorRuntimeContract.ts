import type { BfnAccumulatorDynamicModel, BfnFunctionalModule } from './types';

export class BfnAccumulatorRateError extends Error {
  readonly code = 'BFN_ACCUMULATOR_RATE_INVALID' as const;

  constructor(readonly rate: unknown) {
    super('BFN_ACCUMULATOR_RATE_INVALID');
    this.name = 'BfnAccumulatorRateError';
  }
}

export function assertBfnAccumulatorRate(rate: unknown): asserts rate is number {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
    throw new BfnAccumulatorRateError(rate);
  }
}

export type BfnAccumulatorRuntimeContractReason =
  | 'input_arity_invalid'
  | 'output_arity_invalid'
  | 'input_binding_invalid'
  | 'output_binding_invalid'
  | 'entity_mismatch'
  | 'input_quantity_invalid'
  | 'output_quantity_invalid'
  | 'unit_pair_invalid'
  | 'initial_state_negative'
  | 'uncertainty_contract_invalid';

export function assessBfnAccumulatorRuntimeContract(
  module: BfnFunctionalModule,
  model: BfnAccumulatorDynamicModel,
): BfnAccumulatorRuntimeContractReason | null {
  if (module.inputPorts.length !== 1) return 'input_arity_invalid';
  if (module.outputPorts.length !== 1) return 'output_arity_invalid';

  const input = module.inputPorts[0]!;
  const output = module.outputPorts[0]!;
  if (model.inputPortId !== input.id) return 'input_binding_invalid';
  if (model.outputPortId !== output.id) return 'output_binding_invalid';
  if (input.entity !== output.entity) return 'entity_mismatch';
  if (input.quantityType !== 'production_rate') return 'input_quantity_invalid';
  if (output.quantityType !== 'concentration') return 'output_quantity_invalid';

  const supportedUnitPair =
    (input.unit === 'nM/h' && output.unit === 'nM') ||
    (input.unit === 'uM/h' && output.unit === 'uM');
  if (!supportedUnitPair) return 'unit_pair_invalid';
  if (model.initialState < 0) return 'initial_state_negative';
  if (model.uncertaintyMethod !== 'none' && model.uncertaintyMethod !== 'not_recorded') {
    return 'uncertainty_contract_invalid';
  }
  return null;
}
