import { evaluateHill, evaluateStaticResponse } from '../responseMath';
import type {
  BfnFunctionalModule,
  BfnIndependentInputTerm,
  BfnProject,
  BfnStaticModel,
  BfnStaticResponse,
} from '../types';
import type {
  BfnDerivedGainUnit,
  BfnLocalDifferentialGainV1,
  BfnLocalInfluenceAdmissionV1,
  BfnLocalInfluenceCalculationIssueCodeV1,
  BfnLocalInfluenceCalculationV1,
  BfnLocalInfluenceRequestV1,
  BfnLocalInfluenceResultV1,
  BfnLogElasticityV1,
  BfnResolvedLocalInfluenceTargetV1,
} from './interpretationTypes';
import { assessBfnLocalInfluenceRequest } from './interpretationValidation';

type DerivativeResolution =
  | { readonly availability: 'available'; readonly value: number }
  | {
      readonly availability: 'unavailable';
      readonly reason: Extract<
        BfnLocalDifferentialGainV1,
        { readonly availability: 'unavailable' }
      >['reason'];
    };

function failedCalculation(
  admission: BfnLocalInfluenceAdmissionV1,
  calculationIssue: BfnLocalInfluenceCalculationIssueCodeV1 | null,
): BfnLocalInfluenceCalculationV1 {
  return Object.freeze({ ok: false, admission, calculationIssue });
}

function availableDerivative(value: number): DerivativeResolution {
  return Number.isFinite(value)
    ? Object.freeze({ availability: 'available', value })
    : Object.freeze({ availability: 'unavailable', reason: 'derivative_non_finite' });
}

function unavailableDerivative(
  reason: Extract<BfnLocalDifferentialGainV1, { readonly availability: 'unavailable' }>['reason'],
): DerivativeResolution {
  return Object.freeze({ availability: 'unavailable', reason });
}

function hillFractionDerivative(input: number, k: number, n: number): DerivativeResolution {
  if (input === 0) {
    if (n > 1) return availableDerivative(0);
    if (n === 1) return unavailableDerivative('derivative_not_unique');
    return unavailableDerivative('derivative_non_finite');
  }
  const inputPower = input ** n;
  const thresholdPower = k ** n;
  return availableDerivative(
    (n * thresholdPower * input ** (n - 1)) / (thresholdPower + inputPower) ** 2,
  );
}

function hillResponseDerivative(
  response: Extract<BfnStaticResponse, { family: 'hill_activation' | 'hill_repression' }>,
  input: number,
): DerivativeResolution {
  const amplitude = response.ymax.value - response.ymin.value;
  if (amplitude === 0) return availableDerivative(0);
  const fractionDerivative = hillFractionDerivative(input, response.k.value, response.n.value);
  if (fractionDerivative.availability === 'unavailable') return fractionDerivative;
  const direction = response.family === 'hill_activation' ? 1 : -1;
  return availableDerivative(direction * amplitude * fractionDerivative.value);
}

function linearResponseDerivative(
  response: Extract<BfnStaticResponse, { family: 'linear_transfer' }>,
  input: number,
): DerivativeResolution {
  const minimum = response.outputMinimum ?? Number.NEGATIVE_INFINITY;
  const maximum = response.outputMaximum ?? Number.POSITIVE_INFINITY;
  if (minimum === maximum) return availableDerivative(0);
  const scale = response.scale.value;
  const raw = response.intercept.value + scale * input;
  if (raw < minimum || raw > maximum) return availableDerivative(0);
  if (raw === minimum || raw === maximum) {
    return scale === 0 ? availableDerivative(0) : unavailableDerivative('derivative_not_unique');
  }
  return availableDerivative(scale);
}

interface IndependentTermEvaluation {
  readonly value: number;
  readonly derivative: DerivativeResolution;
}

function evaluateIndependentTermWithDerivative(
  term: BfnIndependentInputTerm,
  input: number,
): IndependentTermEvaluation {
  const direction = term.direction === 'activation' ? 'activation' : 'repression';
  const value =
    term.contribution.value * evaluateHill(input, 0, 1, term.k.value, term.n.value, direction);
  const fractionDerivative = hillFractionDerivative(input, term.k.value, term.n.value);
  if (fractionDerivative.availability === 'unavailable') {
    return Object.freeze({ value, derivative: fractionDerivative });
  }
  const sign = term.direction === 'activation' ? 1 : -1;
  return Object.freeze({
    value,
    derivative: availableDerivative(sign * term.contribution.value * fractionDerivative.value),
  });
}

function applyFinalClampDerivative(
  combined: number,
  minimum: number,
  maximum: number,
  rawDerivative: DerivativeResolution,
): DerivativeResolution {
  if (rawDerivative.availability === 'unavailable') return rawDerivative;
  if (combined < minimum || combined > maximum) return availableDerivative(0);
  if (combined === minimum || combined === maximum) {
    return rawDerivative.value === 0
      ? availableDerivative(0)
      : unavailableDerivative('derivative_not_unique');
  }
  return availableDerivative(rawDerivative.value);
}

function independentResponseDerivatives(
  response: Extract<BfnStaticResponse, { family: 'independent_inputs' }>,
  inputs: Readonly<Record<string, number>>,
): ReadonlyMap<string, DerivativeResolution> {
  const evaluations = response.terms.map((term) =>
    evaluateIndependentTermWithDerivative(term, inputs[term.inputPortId] ?? 0),
  );
  const basal = response.basal.value;
  const maximum = response.outputMaximum.value;
  const combined =
    response.aggregation === 'bounded_sum'
      ? basal + evaluations.reduce((sum, evaluation) => sum + evaluation.value, 0)
      : basal +
        (maximum - basal) *
          (1 - evaluations.reduce((product, evaluation) => product * (1 - evaluation.value), 1));
  const minimum = Math.min(0, basal);
  return new Map(
    response.terms.map((term, index) => {
      const evaluation = evaluations[index];
      if (!evaluation) {
        return [term.inputPortId, unavailableDerivative('analytic_derivative_not_supported')];
      }
      if (evaluation.derivative.availability === 'unavailable') {
        return [term.inputPortId, evaluation.derivative];
      }
      const rawDerivative =
        response.aggregation === 'bounded_sum'
          ? evaluation.derivative
          : availableDerivative(
              (maximum - basal) *
                evaluation.derivative.value *
                evaluations.reduce(
                  (product, candidate, candidateIndex) =>
                    candidateIndex === index ? product : product * (1 - candidate.value),
                  1,
                ),
            );
      return [
        term.inputPortId,
        applyFinalClampDerivative(combined, minimum, maximum, rawDerivative),
      ];
    }),
  );
}

function responseDerivatives(
  response: BfnStaticResponse,
  inputs: Readonly<Record<string, number>>,
): ReadonlyMap<string, DerivativeResolution> {
  switch (response.family) {
    case 'hill_activation':
    case 'hill_repression':
      return new Map([
        [response.inputPortId, hillResponseDerivative(response, inputs[response.inputPortId] ?? 0)],
      ]);
    case 'linear_transfer':
      return new Map([
        [
          response.inputPortId,
          linearResponseDerivative(response, inputs[response.inputPortId] ?? 0),
        ],
      ]);
    case 'identity':
      return new Map([[response.inputPortId, availableDerivative(1)]]);
    case 'independent_inputs':
      return independentResponseDerivatives(response, inputs);
  }
}

function resolveAdmittedModel(
  project: BfnProject,
  target: BfnResolvedLocalInfluenceTargetV1,
): { readonly module: BfnFunctionalModule; readonly model: BfnStaticModel } | null {
  const modules = project.network.modules.filter((candidate) => candidate.id === target.moduleId);
  const module = modules[0];
  if (modules.length !== 1 || !module) return null;
  const models = module.modelVariants.filter(
    (candidate): candidate is BfnStaticModel =>
      candidate.id === target.staticModelId && candidate.mode === 'static',
  );
  const model = models[0];
  return models.length === 1 && model ? Object.freeze({ module, model }) : null;
}

function gainWithUnit(
  derivative: DerivativeResolution,
  unit: BfnDerivedGainUnit,
): BfnLocalDifferentialGainV1 {
  const frozenUnit = Object.freeze({ ...unit });
  return derivative.availability === 'available'
    ? Object.freeze({ availability: 'available', value: derivative.value, unit: frozenUnit })
    : Object.freeze({ availability: 'unavailable', reason: derivative.reason, unit: frozenUnit });
}

function logElasticity(
  input: number,
  output: number,
  gain: BfnLocalDifferentialGainV1,
): BfnLogElasticityV1 {
  if (gain.availability === 'unavailable') {
    return Object.freeze({
      availability: 'unavailable',
      reason: 'derivative_unavailable',
      unit: 'dimensionless',
    });
  }
  if (input <= 0) {
    return Object.freeze({
      availability: 'unavailable',
      reason: 'input_not_positive',
      unit: 'dimensionless',
    });
  }
  if (output <= 0) {
    return Object.freeze({
      availability: 'unavailable',
      reason: 'output_not_positive',
      unit: 'dimensionless',
    });
  }
  const value = (input / output) * gain.value;
  return Number.isFinite(value)
    ? Object.freeze({ availability: 'available', value, unit: 'dimensionless' })
    : Object.freeze({
        availability: 'unavailable',
        reason: 'derivative_unavailable',
        unit: 'dimensionless',
      });
}

/** Pure nominal-parameter local influence calculation for one admitted static response. */
export function calculateBfnLocalInfluence(
  project: BfnProject,
  request: BfnLocalInfluenceRequestV1,
): BfnLocalInfluenceCalculationV1 {
  const admission = assessBfnLocalInfluenceRequest(project, request);
  if (admission.status === 'unsupported' || admission.target === null) {
    return failedCalculation(admission, null);
  }
  const target = admission.target;
  const applicability = admission.applicability;
  if (applicability === null || applicability === 'outside_recorded_domain') {
    return failedCalculation(admission, null);
  }
  const resolved = resolveAdmittedModel(project, target);
  if (!resolved) return failedCalculation(admission, 'model_resolution_failed');

  const valuesByPortId: Record<string, number> = {};
  for (const input of request.operatingPoint) valuesByPortId[input.portId] = input.value;
  const output = evaluateStaticResponse(resolved.model.response, valuesByPortId, 'estimate');
  if (!Number.isFinite(output)) return failedCalculation(admission, 'output_non_finite');

  const derivatives = responseDerivatives(resolved.model.response, valuesByPortId);
  const requestInputs = new Map(request.operatingPoint.map((input) => [input.portId, input]));
  const perInput = target.inputPorts.map((targetInput) => {
    const input = requestInputs.get(targetInput.portId);
    const derivative =
      derivatives.get(targetInput.portId) ??
      unavailableDerivative('analytic_derivative_not_supported');
    if (!input) throw new Error('Admitted operating point is incomplete.');
    const gain = gainWithUnit(derivative, {
      outputUnit: target.outputUnit,
      inputUnit: targetInput.unit,
    });
    return Object.freeze({
      portId: targetInput.portId,
      operatingValue: input.value,
      operatingUnit: input.unit,
      localDifferentialGain: gain,
      logElasticity: logElasticity(input.value, output, gain),
    });
  });

  const result: BfnLocalInfluenceResultV1 = Object.freeze({
    contractVersion: target.contractVersion,
    scope: target.scope,
    target,
    operatingPoint: Object.freeze(
      request.operatingPoint.map((input) => Object.freeze({ ...input })),
    ),
    outputAtOperatingPoint: Object.freeze({
      value: output,
      unit: target.outputUnit,
    }),
    perInput: Object.freeze(perInput),
    applicability,
    persistence: 'ephemeral',
  });
  return Object.freeze({ ok: true, admission, result });
}
