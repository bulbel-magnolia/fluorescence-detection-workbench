import type { BfnIndependentInputTerm, BfnParameterEstimate, BfnStaticResponse } from './types';

export type BfnParameterScenario = 'estimate' | 'lower' | 'upper' | 'low_output' | 'high_output';

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function estimateValue(
  parameter: BfnParameterEstimate,
  scenario: BfnParameterScenario,
  role: 'minimum' | 'maximum' | 'threshold' | 'exponent' | 'scale' | 'intercept',
): number {
  const [lower, upper] = parameter.interval95 ?? [parameter.value, parameter.value];
  if (scenario === 'estimate') return parameter.value;
  if (scenario === 'lower') return lower;
  if (scenario === 'upper') return upper;
  if (scenario === 'low_output') {
    if (role === 'threshold') return upper;
    if (role === 'exponent') return parameter.value;
    return lower;
  }
  if (role === 'threshold') return lower;
  if (role === 'exponent') return parameter.value;
  return upper;
}

export function evaluateHill(
  input: number,
  ymin: number,
  ymax: number,
  k: number,
  n: number,
  direction: 'activation' | 'repression',
): number {
  const safeInput = Math.max(0, input);
  const safeK = Math.max(Number.EPSILON, k);
  const safeN = Math.max(Number.EPSILON, n);
  const inputPower = safeInput ** safeN;
  const thresholdPower = safeK ** safeN;
  const fraction = inputPower / (thresholdPower + inputPower);
  return direction === 'activation'
    ? ymin + (ymax - ymin) * fraction
    : ymax - (ymax - ymin) * fraction;
}

function evaluateIndependentTerm(
  term: BfnIndependentInputTerm,
  input: number,
  scenario: BfnParameterScenario,
): number {
  const k = estimateValue(term.k, scenario, 'threshold');
  const n = estimateValue(term.n, scenario, 'exponent');
  const contribution = estimateValue(term.contribution, scenario, 'scale');
  const fraction = evaluateHill(
    input,
    0,
    1,
    k,
    n,
    term.direction === 'activation' ? 'activation' : 'repression',
  );
  return contribution * fraction;
}

export function evaluateStaticResponse(
  response: BfnStaticResponse,
  inputs: Readonly<Record<string, number>>,
  scenario: BfnParameterScenario = 'estimate',
): number {
  switch (response.family) {
    case 'hill_activation':
    case 'hill_repression': {
      const input = inputs[response.inputPortId] ?? 0;
      const ymin = estimateValue(response.ymin, scenario, 'minimum');
      const ymax = estimateValue(response.ymax, scenario, 'maximum');
      const k = estimateValue(response.k, scenario, 'threshold');
      const n = estimateValue(response.n, scenario, 'exponent');
      return evaluateHill(
        input,
        ymin,
        ymax,
        k,
        n,
        response.family === 'hill_activation' ? 'activation' : 'repression',
      );
    }
    case 'linear_transfer': {
      const input = inputs[response.inputPortId] ?? 0;
      const scale = estimateValue(response.scale, scenario, 'scale');
      const intercept = estimateValue(response.intercept, scenario, 'intercept');
      const minimum = response.outputMinimum ?? Number.NEGATIVE_INFINITY;
      const maximum = response.outputMaximum ?? Number.POSITIVE_INFINITY;
      return bounded(intercept + scale * input, minimum, maximum);
    }
    case 'identity':
      return inputs[response.inputPortId] ?? 0;
    case 'independent_inputs': {
      const basal = estimateValue(response.basal, scenario, 'minimum');
      const maximum = estimateValue(response.outputMaximum, scenario, 'maximum');
      const terms = response.terms.map((term) =>
        evaluateIndependentTerm(term, inputs[term.inputPortId] ?? 0, scenario),
      );
      const combined =
        response.aggregation === 'bounded_sum'
          ? basal + terms.reduce((sum, value) => sum + value, 0)
          : basal +
            (maximum - basal) * (1 - terms.reduce((product, value) => product * (1 - value), 1));
      return bounded(combined, Math.min(0, basal), maximum);
    }
  }
}

export function evaluateResponseEnvelope(
  response: BfnStaticResponse,
  inputs: Readonly<Record<string, number>>,
): { estimate: number; lower: number; upper: number } {
  const estimate = evaluateStaticResponse(response, inputs, 'estimate');
  const scenarios: BfnParameterScenario[] = [
    'estimate',
    'lower',
    'upper',
    'low_output',
    'high_output',
  ];
  const values = scenarios.map((scenario) => evaluateStaticResponse(response, inputs, scenario));
  return { estimate, lower: Math.min(...values), upper: Math.max(...values) };
}
