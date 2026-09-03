import { describe, expect, it } from 'vitest';
import {
  buildAllBfnCatalogRuntimeCandidates,
  instantiateCatalogResponseInBfnProject,
} from '../catalog/catalogBfnAdapter';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import { evaluateStaticResponse } from '../responseMath';
import { ACCUMULATOR_MODULE_ID, createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import type {
  BfnFunctionalModule,
  BfnIndependentResponse,
  BfnProject,
  BfnStaticModel,
  BfnStaticResponse,
} from '../types';
import type {
  BfnLocalInfluenceCalculationV1,
  BfnLocalInfluenceRequestV1,
  BfnLocalInfluenceResultV1,
} from './interpretationTypes';
import { calculateBfnLocalInfluence } from './localInfluence';

function activeStaticModel(module: BfnFunctionalModule): BfnStaticModel {
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.id === module.activeModelIds.static && candidate.mode === 'static',
  );
  if (!model) throw new Error('Expected an active static model.');
  return model;
}

function requestFor(
  module: BfnFunctionalModule,
  values: readonly number[],
  inputOrder: readonly number[] = values.map((_, index) => index),
): BfnLocalInfluenceRequestV1 {
  return {
    contractVersion: '1.0',
    scope: 'module_static_response',
    moduleId: module.id,
    outputPortId: module.outputPorts[0]!.id,
    operatingPoint: inputOrder.map((index) => {
      const port = module.inputPorts[index]!;
      return { portId: port.id, value: values[index]!, unit: port.unit };
    }),
  };
}

function isolateStaticModule(
  project: BfnProject,
  module: BfnFunctionalModule,
  response: BfnStaticResponse,
  range: readonly [number, number] = [0, 100],
): BfnStaticModel {
  const model = activeStaticModel(module);
  model.family = response.family;
  model.response = response;
  module.modelVariants = [model];
  module.activeModelIds = { static: model.id };
  project.network.mode = 'static';
  project.network.modules = [module];
  project.registry.validityDomains = [
    {
      id: model.validityDomainId,
      labelKey: 'bfn.domains.localInfluenceTest',
      inputRanges: module.inputPorts.map((port) => ({
        portId: port.id,
        minimum: range[0],
        maximum: range[1],
        unit: port.unit,
      })),
      contextId: model.contextId,
    },
  ];
  return model;
}

function singleInputFixture(
  responseFactory: (module: BfnFunctionalModule) => BfnStaticResponse,
  value: number,
  moduleIndex = 0,
  range: readonly [number, number] = [0, 100],
) {
  const project = createDemoBfnProject();
  const module = project.network.modules[moduleIndex]!;
  const model = isolateStaticModule(project, module, responseFactory(module), range);
  return { project, module, model, request: requestFor(module, [value]) };
}

function hillResponse(
  module: BfnFunctionalModule,
  options: {
    family?: 'hill_activation' | 'hill_repression';
    ymin?: number;
    ymax?: number;
    k?: number;
    n?: number;
  } = {},
): BfnStaticResponse {
  return {
    family: options.family ?? 'hill_activation',
    inputPortId: module.inputPorts[0]!.id,
    ymin: { value: options.ymin ?? 0.1, unit: module.outputPorts[0]!.unit },
    ymax: { value: options.ymax ?? 1.1, unit: module.outputPorts[0]!.unit },
    k: { value: options.k ?? 2, unit: module.inputPorts[0]!.unit },
    n: { value: options.n ?? 2, unit: 'dimensionless' },
  };
}

function linearResponse(
  module: BfnFunctionalModule,
  options: {
    scale?: number;
    intercept?: number;
    minimum?: number;
    maximum?: number;
    unclamped?: boolean;
  } = {},
): BfnStaticResponse {
  return {
    family: 'linear_transfer',
    inputPortId: module.inputPorts[0]!.id,
    scale: { value: options.scale ?? 2, unit: 'dimensionless' },
    intercept: { value: options.intercept ?? 0, unit: module.outputPorts[0]!.unit },
    ...(options.unclamped ? {} : { outputMinimum: options.minimum ?? 0 }),
    ...(options.unclamped ? {} : { outputMaximum: options.maximum ?? 2 }),
  };
}

function independentFixture(
  aggregation: BfnIndependentResponse['aggregation'],
  values: readonly [number, number] = [0.3, 0.7],
) {
  const project = createDemoBfnProject();
  const module = createCatalogModule('dual-input-gate', 'local-' + aggregation);
  const response = activeStaticModel(module).response as BfnIndependentResponse;
  response.aggregation = aggregation;
  const model = isolateStaticModule(project, module, response, [0, 2]);
  return { project, module, model, response, request: requestFor(module, values) };
}

function successfulResult(calculation: BfnLocalInfluenceCalculationV1): BfnLocalInfluenceResultV1 {
  if (!calculation.ok) throw new Error('Expected local influence calculation to succeed.');
  return calculation.result;
}

function gainValue(result: BfnLocalInfluenceResultV1, index = 0): number {
  const gain = result.perInput[index]?.localDifferentialGain;
  if (!gain || gain.availability === 'unavailable') {
    throw new Error('Expected an available local response gain.');
  }
  return gain.value;
}

function finiteDifference(
  response: BfnStaticResponse,
  inputs: Readonly<Record<string, number>>,
  portId: string,
): number {
  const h = 1e-6;
  return (
    (evaluateStaticResponse(response, { ...inputs, [portId]: inputs[portId]! + h }, 'estimate') -
      evaluateStaticResponse(response, { ...inputs, [portId]: inputs[portId]! - h }, 'estimate')) /
    (2 * h)
  );
}

function productionSafeHillFractionDerivative(input: number, k: number, n: number): number {
  const safeK = Math.max(Number.EPSILON, k);
  const safeN = Math.max(Number.EPSILON, n);
  const inputPower = input ** safeN;
  const thresholdPower = safeK ** safeN;
  return (safeN * thresholdPower * input ** (safeN - 1)) / (thresholdPower + inputPower) ** 2;
}

describe('calculateBfnLocalInfluence', () => {
  it('matches a finite-difference test oracle for an interior Hill activation point', () => {
    const fixture = singleInputFixture((module) => hillResponse(module), 3);
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    const inputId = fixture.module.inputPorts[0]!.id;

    expect(gainValue(result)).toBeCloseTo(
      finiteDifference(fixture.model.response, { [inputId]: 3 }, inputId),
      8,
    );
  });

  it('returns a negative Hill repression gain matching the test oracle', () => {
    const fixture = singleInputFixture(
      (module) => hillResponse(module, { family: 'hill_repression' }),
      3,
    );
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    const inputId = fixture.module.inputPorts[0]!.id;

    expect(gainValue(result)).toBeLessThan(0);
    expect(gainValue(result)).toBeCloseTo(
      finiteDifference(fixture.model.response, { [inputId]: 3 }, inputId),
      8,
    );
  });

  it.each(['hill_activation', 'hill_repression'] as const)(
    'uses production-safe K for a sub-EPS %s derivative',
    (family) => {
      const k = Number.EPSILON / 4;
      const input = Number.EPSILON;
      const fixture = singleInputFixture(
        (module) => hillResponse(module, { family, k, n: 2 }),
        input,
      );
      const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
      const direction = family === 'hill_activation' ? 1 : -1;
      const expected = direction * productionSafeHillFractionDerivative(input, k, 2);

      expect(gainValue(result) / expected).toBeCloseTo(1, 12);
    },
  );

  it.each(['hill_activation', 'hill_repression'] as const)(
    'uses production-safe n for a sub-EPS %s derivative',
    (family) => {
      const n = Number.EPSILON / 4;
      const input = 3;
      const fixture = singleInputFixture(
        (module) => hillResponse(module, { family, k: 2, n }),
        input,
      );
      const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
      const direction = family === 'hill_activation' ? 1 : -1;
      const expected = direction * productionSafeHillFractionDerivative(input, 2, n);

      expect(gainValue(result) / expected).toBeCloseTo(1, 12);
    },
  );

  it.each([
    { name: 'zero amplitude', n: 1, ymin: 0.4, ymax: 0.4, expected: 0 },
    { name: 'exponent greater than one', n: 2, ymin: 0.1, ymax: 1.1, expected: 0 },
  ])('returns zero at x=0 for $name', ({ n, ymin, ymax, expected }) => {
    const fixture = singleInputFixture((module) => hillResponse(module, { n, ymin, ymax }), 0);
    expect(
      gainValue(successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request))),
    ).toBe(expected);
  });

  it.each([
    { n: 1, reason: 'derivative_not_unique' },
    { n: 0.5, reason: 'derivative_non_finite' },
  ] as const)('marks the nonzero-amplitude Hill derivative at x=0 for n=$n', ({ n, reason }) => {
    const fixture = singleInputFixture((module) => hillResponse(module, { n }), 0);
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));

    expect(result.perInput[0]).toMatchObject({
      localDifferentialGain: { availability: 'unavailable', reason },
      logElasticity: { availability: 'unavailable', reason: 'derivative_unavailable' },
    });
  });

  it('marks a non-finite analytic Hill calculation unavailable without clamping it', () => {
    const fixture = singleInputFixture(
      (module) => hillResponse(module, { n: Number.MAX_VALUE, k: 2 }),
      1,
    );
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    expect(result.outputAtOperatingPoint.value).toBe(0.1);
    expect(result.perInput[0]?.localDifferentialGain).toMatchObject({
      availability: 'unavailable',
      reason: 'derivative_non_finite',
    });
  });

  it('uses the linear scale strictly inside the output clamp', () => {
    const fixture = singleInputFixture((module) => linearResponse(module), 0.5, 1, [0, 3]);
    expect(
      gainValue(successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request))),
    ).toBe(2);
  });

  it.each([
    { value: 0, response: { scale: 1, intercept: -1, minimum: 0, maximum: 1 } },
    { value: 2, response: { scale: 1, intercept: 0, minimum: 0, maximum: 1 } },
  ])('returns zero when a linear raw output is strictly clamped', ({ value, response }) => {
    const fixture = singleInputFixture(
      (module) => linearResponse(module, response),
      value,
      1,
      [0, 3],
    );
    expect(
      gainValue(successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request))),
    ).toBe(0);
  });

  it('returns zero for a fixed linear output clamp', () => {
    const fixture = singleInputFixture(
      (module) => linearResponse(module, { minimum: 0.5, maximum: 0.5 }),
      0.5,
      1,
      [0, 3],
    );
    expect(
      gainValue(successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request))),
    ).toBe(0);
  });

  it('marks a nonzero-scale linear clamp boundary as non-unique', () => {
    const fixture = singleInputFixture(
      (module) => linearResponse(module, { scale: 1, intercept: 0, minimum: 0, maximum: 1 }),
      0,
      1,
      [0, 3],
    );
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    expect(result.perInput[0]?.localDifferentialGain).toMatchObject({
      availability: 'unavailable',
      reason: 'derivative_not_unique',
    });
  });

  it('returns one for a scientifically valid identity response', () => {
    const fixture = singleInputFixture(
      (module) => {
        module.outputPorts[0]!.entity = module.inputPorts[0]!.entity;
        module.outputPorts[0]!.quantityType = module.inputPorts[0]!.quantityType;
        return { family: 'identity', inputPortId: module.inputPorts[0]!.id };
      },
      0.5,
      1,
      [0, 1],
    );
    expect(
      gainValue(successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request))),
    ).toBe(1);
  });

  it('does not calculate a same-unit identity with different scientific quantities', () => {
    const fixture = singleInputFixture(
      (module) => ({ family: 'identity', inputPortId: module.inputPorts[0]!.id }),
      0.5,
      1,
      [0, 1],
    );
    expect(calculateBfnLocalInfluence(fixture.project, fixture.request)).toMatchObject({
      ok: false,
      calculationIssue: null,
      admission: {
        status: 'unsupported',
        issues: [
          expect.objectContaining({
            code: 'model_contract_invalid',
            details: { reason: 'identity_contract_invalid' },
          }),
        ],
      },
    });
  });

  it.each(['bounded_sum', 'multiplicative'] as const)(
    'matches per-input finite-difference oracles for %s independent inputs',
    (aggregation) => {
      const fixture = independentFixture(aggregation);
      const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
      const inputs = Object.fromEntries(
        fixture.request.operatingPoint.map((input) => [input.portId, input.value]),
      );
      fixture.response.terms.forEach((term, index) => {
        expect(gainValue(result, index)).toBeCloseTo(
          finiteDifference(fixture.response, inputs, term.inputPortId),
          7,
        );
      });
    },
  );

  it.each(['activation', 'repression'] as const)(
    'uses production-safe Hill semantics for an independent %s term',
    (direction) => {
      const input = Number.EPSILON;
      const fixture = independentFixture('bounded_sum', [input, 0.7]);
      const term = fixture.response.terms[0]!;
      term.direction = direction;
      term.k.value = Number.EPSILON / 4;
      delete term.k.interval95;
      term.n.value = 2;
      delete term.n.interval95;
      term.contribution.value = 0.2;
      delete term.contribution.interval95;
      fixture.response.outputMaximum.value = 10;
      delete fixture.response.outputMaximum.interval95;
      const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
      const sign = direction === 'activation' ? 1 : -1;
      const expected =
        sign *
        term.contribution.value *
        productionSafeHillFractionDerivative(input, term.k.value, term.n.value);

      expect(gainValue(result) / expected).toBeCloseTo(1, 12);
    },
  );

  it('returns zero for every independent-input partial in a strict final clamp region', () => {
    const fixture = independentFixture('bounded_sum', [1, 1]);
    fixture.response.outputMaximum.value = 0.5;
    delete fixture.response.outputMaximum.interval95;
    fixture.response.terms.forEach((term) => {
      term.contribution.value = 1;
      delete term.contribution.interval95;
    });
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    expect(result.perInput.map((_, index) => gainValue(result, index))).toEqual([0, 0]);
  });

  it('marks nonzero independent-input partials at the final clamp boundary as non-unique', () => {
    const fixture = independentFixture('bounded_sum', [1, 1]);
    fixture.response.basal.value = 0;
    delete fixture.response.basal.interval95;
    fixture.response.outputMaximum.value = 0.5;
    delete fixture.response.outputMaximum.interval95;
    fixture.response.terms.forEach((term) => {
      term.k.value = 1;
      delete term.k.interval95;
      term.n.value = 1;
      delete term.n.interval95;
      term.contribution.value = 0.5;
      delete term.contribution.interval95;
    });
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    expect(result.perInput.map((input) => input.localDifferentialGain)).toEqual([
      expect.objectContaining({ availability: 'unavailable', reason: 'derivative_not_unique' }),
      expect.objectContaining({ availability: 'unavailable', reason: 'derivative_not_unique' }),
    ]);
  });

  it('contains one unavailable inner Hill derivative without hiding other input gains', () => {
    const fixture = independentFixture('bounded_sum', [0, 0.5]);
    fixture.response.terms[0]!.n.value = 1;
    delete fixture.response.terms[0]!.n.interval95;
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    expect(result.perInput[0]?.localDifferentialGain).toMatchObject({
      availability: 'unavailable',
      reason: 'derivative_not_unique',
    });
    expect(result.perInput[1]?.localDifferentialGain.availability).toBe('available');
  });

  it('uses the production nominal evaluator for outputAtOperatingPoint', () => {
    const fixture = singleInputFixture((module) => hillResponse(module), 3);
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    const inputs = { [fixture.module.inputPorts[0]!.id]: 3 };
    expect(result.outputAtOperatingPoint).toEqual({
      value: evaluateStaticResponse(fixture.model.response, inputs, 'estimate'),
      unit: fixture.module.outputPorts[0]!.unit,
    });
  });

  it('fails closed when the production evaluator returns a non-finite output', () => {
    const fixture = singleInputFixture(
      (module) =>
        linearResponse(module, {
          scale: Number.MAX_VALUE,
          intercept: 0,
          unclamped: true,
        }),
      2,
      1,
      [0, 3],
    );
    expect(calculateBfnLocalInfluence(fixture.project, fixture.request)).toMatchObject({
      ok: false,
      calculationIssue: 'output_non_finite',
    });
  });

  it('returns the exact output/input gain unit pair and available elasticity', () => {
    const fixture = singleInputFixture((module) => hillResponse(module), 3);
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    expect(result.perInput[0]).toMatchObject({
      localDifferentialGain: {
        availability: 'available',
        unit: { outputUnit: 'dimensionless', inputUnit: 'nM' },
      },
      logElasticity: { availability: 'available', unit: 'dimensionless' },
    });
  });

  it('uses deterministic elasticity unavailability priority', () => {
    const derivativeUnavailable = singleInputFixture((module) => hillResponse(module, { n: 1 }), 0);
    const zeroInput = singleInputFixture((module) => hillResponse(module, { n: 2 }), 0);
    const nonPositiveOutput = singleInputFixture(
      (module) => linearResponse(module, { scale: 0, intercept: 0, unclamped: true }),
      1,
      1,
      [0, 2],
    );
    expect(
      successfulResult(
        calculateBfnLocalInfluence(derivativeUnavailable.project, derivativeUnavailable.request),
      ).perInput[0]?.logElasticity,
    ).toMatchObject({ availability: 'unavailable', reason: 'derivative_unavailable' });
    expect(
      successfulResult(calculateBfnLocalInfluence(zeroInput.project, zeroInput.request)).perInput[0]
        ?.logElasticity,
    ).toMatchObject({ availability: 'unavailable', reason: 'input_not_positive' });
    expect(
      successfulResult(
        calculateBfnLocalInfluence(nonPositiveOutput.project, nonPositiveOutput.request),
      ).perInput[0]?.logElasticity,
    ).toMatchObject({ availability: 'unavailable', reason: 'output_not_positive' });
  });

  it('returns perInput in admitted response order, independent of request order', () => {
    const fixture = independentFixture('bounded_sum');
    const reversedRequest = requestFor(fixture.module, [0.3, 0.7], [1, 0]);
    const result = successfulResult(calculateBfnLocalInfluence(fixture.project, reversedRequest));
    expect(result.perInput.map((input) => input.portId)).toEqual(
      fixture.response.terms.map((term) => term.inputPortId),
    );
  });

  it('qualifies within-range and incompletely recorded results without persisting either', () => {
    const fixture = singleInputFixture((module) => hillResponse(module), 3);
    const within = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    fixture.project.registry.validityDomains[0]!.inputRanges = [];
    const unrecorded = successfulResult(
      calculateBfnLocalInfluence(fixture.project, fixture.request),
    );
    expect(within).toMatchObject({
      applicability: 'within_recorded_domain',
      persistence: 'ephemeral',
    });
    expect(unrecorded).toMatchObject({
      applicability: 'applicability_not_recorded',
      persistence: 'ephemeral',
    });
  });

  it('does not produce a formal result outside the recorded domain', () => {
    const fixture = singleInputFixture((module) => hillResponse(module), 3, 0, [0, 2]);
    expect(calculateBfnLocalInfluence(fixture.project, fixture.request)).toMatchObject({
      ok: false,
      calculationIssue: null,
      admission: {
        status: 'unsupported',
        applicability: 'outside_recorded_domain',
        issues: [expect.objectContaining({ code: 'outside_validity_domain' })],
      },
    });
  });

  it('labels a paired first-order model as steady-state static interpretation', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[0]!;
    project.network.mode = 'dynamic';
    const result = successfulResult(calculateBfnLocalInfluence(project, requestFor(module, [10])));
    expect(result.target.interpretationBasis).toBe('first_order_steady_state_static_response');
  });

  it('does not calculate a static gain for an accumulator', () => {
    const project = createAccumulatorBfnProject();
    const module = project.network.modules.find(({ id }) => id === ACCUMULATOR_MODULE_ID)!;
    expect(calculateBfnLocalInfluence(project, requestFor(module, [1]))).toMatchObject({
      ok: false,
      calculationIssue: null,
      admission: {
        status: 'unsupported',
        issues: [expect.objectContaining({ code: 'static_interpretation_unsupported' })],
      },
    });
  });

  it('uses a catalog Receiver active BFN response and inherits only model evidence', () => {
    const candidate = buildAllBfnCatalogRuntimeCandidates()[0]!;
    const instantiated = instantiateCatalogResponseInBfnProject(createDemoBfnProject(), candidate, {
      moduleId: 'catalog-local-influence',
      modulePosition: { x: 0, y: 0 },
      createInputSource: false,
    });
    if (!instantiated.ok) throw new Error('Expected catalog instantiation.');
    const module = instantiated.nextProject.network.modules.find(
      ({ id }) => id === instantiated.addedModuleId,
    )!;
    const range = candidate.catalogReference.sourceParameters.workingRange;
    const result = successfulResult(
      calculateBfnLocalInfluence(
        instantiated.nextProject,
        requestFor(module, [(range.min + range.max) / 2]),
      ),
    );
    const model = activeStaticModel(module);
    expect(result.target).toMatchObject({
      staticModelId: model.id,
      responseFamily: model.response.family,
      interpretationSource: 'active_bfn_static_response',
      evidence: {
        evidenceGrade: model.evidenceGrade,
        catalogReference: { responseId: candidate.responseId },
      },
    });
    expect(result.target.evidence).not.toHaveProperty('implementationIds');
    expect(result.target.evidence).not.toHaveProperty('implementationState');
  });

  it('does not mutate project or request and ignores range-fitted ANN thresholds', () => {
    const fixture = singleInputFixture((module) => hillResponse(module), 3);
    const projectBefore = structuredClone(fixture.project);
    const requestBefore = structuredClone(fixture.request);
    const baseline = successfulResult(calculateBfnLocalInfluence(fixture.project, fixture.request));
    expect(fixture.project).toEqual(projectBefore);
    expect(fixture.request).toEqual(requestBefore);
    fixture.project.analysis.annThresholds = {
      minimumR2: Number.POSITIVE_INFINITY,
      maximumNrmse: -1,
    };
    const changedThresholds = successfulResult(
      calculateBfnLocalInfluence(fixture.project, fixture.request),
    );

    expect({ ...fixture.project, analysis: projectBefore.analysis }).toEqual(projectBefore);
    expect(changedThresholds).toEqual(baseline);
    expect(Object.isFrozen(baseline)).toBe(true);
  });
});
