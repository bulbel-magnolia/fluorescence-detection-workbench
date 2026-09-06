import { BFN_INTERPRETATION_CONTRACT_VERSION } from './interpretationTypes';

export const BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1 = Object.freeze({
  name: 'BFN-INTERPRETATION' as const,
  version: BFN_INTERPRETATION_CONTRACT_VERSION,
  layer: 'derived_interpretation' as const,
  persistence: 'ephemeral' as const,
  parameterBasis: 'nominal' as const,
  localDifferentialGain: Object.freeze({
    definition: 'partial_derivative_at_same_operating_point' as const,
    method: 'analytic_only' as const,
    unitRepresentation: 'output_unit_input_unit_pair' as const,
  }),
  logElasticity: Object.freeze({
    definition: 'input_over_output_times_local_differential_gain' as const,
    unit: 'dimensionless' as const,
    requires: Object.freeze([
      'positive_input',
      'positive_output',
      'finite_local_differential_gain',
    ] as const),
  }),
  localAnnApproximation: Object.freeze({
    weight: 'local_differential_gain_at_same_operating_point' as const,
    bias: 'output_at_operating_point_minus_sum_of_weight_times_input_operating_values' as const,
    biasUnit: 'output_unit' as const,
    excludedBiologicalQuantities: Object.freeze([
      'basal_expression',
      'leak',
      'constitutive_output',
      'threshold_shift',
      'environmental_background',
      'initial_state',
    ] as const),
    rangeFittedApproximationThresholds: 'outside_this_contract' as const,
  }),
  edge: Object.freeze({
    role: 'instantaneous_lossless_identity_topology' as const,
    derivedWeightStorage: 'forbidden' as const,
  }),
  networkComposition: Object.freeze({
    status: 'implemented_batch_13_2' as const,
    rule: 'chain_rule_over_module_local_gains' as const,
  }),
  dynamicAnalysis: Object.freeze({
    status: 'implemented_batch_13_4' as const,
    scope: 'network_dynamic_periodic_gain' as const,
    staticNetworks: 'quasi_static_supported' as const,
    dcGainSource: 'batch_13_2_total_differential_gain' as const,
    linearization: 'complete_target_closure_fail_closed' as const,
    perturbation: 'single_period_hours' as const,
    firstOrderEquation: 'tau_dy_dt_equals_f_x_minus_y' as const,
    parameterBasis: 'nominal_tau_value' as const,
    persistence: 'ephemeral' as const,
    excludedSources: Object.freeze([
      'simulation_trajectory',
      'dynamicMetrics_frequencyGain',
      'analysis_durationHours',
      'analysis_timeStepHours',
      'initialState',
    ] as const),
  }),
  presentation: Object.freeze({
    formulasInPrimaryUi: 'not_required' as const,
  }),
});
