import { describe, expect, it } from 'vitest';
import { loadAhlHslCatalogRelease } from './catalog/v2/catalogReleaseLoader';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from './catalog/v2/catalogRuntimeDemoWhitelist';
import type { ComponentCatalogV2 } from './catalog/v2/catalogTypes';
import {
  buildReceiverResponseBinding,
  evaluateReceiverResponse,
  isTrustedReceiverResponseBinding,
  ReceiverResponseEvaluationError,
} from './receiverResponseEvaluator';

const catalog = loadAhlHslCatalogRelease().catalog;

function mutableCatalog(): ComponentCatalogV2 {
  return structuredClone(catalog);
}

describe('literature receiver response evaluator', () => {
  it('builds every explicitly whitelisted runtime response', () => {
    for (const entry of AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST) {
      const binding = buildReceiverResponseBinding(catalog, entry.id);
      expect(binding.receiverResponseId).toBe(entry.id);
      expect(binding.inputUnit).toBe('M');
      expect(binding.fixedWeightCandidate).toBe(false);
    }
  });

  it('normalizes four-parameter logistic responses within source context', () => {
    const binding = buildReceiverResponseBinding(catalog, 'resp.kylilis2018.rhl.c4');
    const ec50 = binding.originalParameters.ec50;
    expect(evaluateReceiverResponse(binding, 0)).toBe(0);
    expect(evaluateReceiverResponse(binding, ec50)).toBeCloseTo(0.5, 12);
    expect(evaluateReceiverResponse(binding, binding.workingRange.max)).toBeGreaterThan(0.5);
    expect(() => evaluateReceiverResponse(binding, -1)).toThrowError(
      new ReceiverResponseEvaluationError('RECEIVER_RESPONSE_INPUT_NEGATIVE'),
    );
    expect(() => evaluateReceiverResponse(binding, 1)).toThrowError(
      new ReceiverResponseEvaluationError('RECEIVER_RESPONSE_INPUT_OUT_OF_RANGE'),
    );
  });

  it('evaluates the Shong derepression response with n fixed to one', () => {
    const binding = buildReceiverResponseBinding(catalog, 'resp.shong2013.esar-wt-pesar.3oc6');
    expect(evaluateReceiverResponse(binding, 0)).toBe(0);
    expect(evaluateReceiverResponse(binding, 2.1e-7)).toBeCloseTo(0.5, 12);
  });

  it('rejects a forged response outside the release whitelist', () => {
    expect(() => buildReceiverResponseBinding(catalog, 'resp.not-in-release')).toThrow(
      'RECEIVER_RESPONSE_RESPONSE_NOT_FOUND',
    );
    const binding = buildReceiverResponseBinding(catalog, 'resp.kylilis2018.rhl.c4');
    expect(() =>
      evaluateReceiverResponse(
        { ...binding, receiverResponseId: 'resp.fake' },
        binding.originalParameters.ec50,
      ),
    ).toThrow('RECEIVER_RESPONSE_BINDING_NOT_WHITELISTED');
  });

  it('trust predicate accepts only an exact canonical binding', () => {
    const binding = buildReceiverResponseBinding(catalog, 'resp.kylilis2018.rhl.c4');
    expect(isTrustedReceiverResponseBinding(binding)).toBe(true);
    const forged = structuredClone(binding);
    forged.originalParameters.ec50 *= 2;
    expect(isTrustedReceiverResponseBinding(forged)).toBe(false);
  });

  it('rejects catalog fields that diverge from the frozen release source', () => {
    const mutations: Array<(candidate: ComponentCatalogV2) => void> = [
      (candidate) => {
        candidate.releaseManifest.releaseId = 'forged-release';
      },
      (candidate) => {
        candidate.releaseManifest.releaseVersion = '9.9';
      },
      (candidate) => {
        candidate.receiverResponses[0]!.parameterContextId = 'ctx.fake';
      },
      (candidate) => {
        candidate.receiverResponses[0]!.inputSignalId = 'ahl.c4.l';
      },
      (candidate) => {
        candidate.receiverResponses[0]!.outputSignalId = 'reporter.invalid';
      },
      (candidate) => {
        candidate.receiverResponses[0]!.sourceIds = ['src.fake'];
      },
      (candidate) => {
        candidate.receiverResponses[0]!.sourceResponse!.direction = 'inhibition';
      },
      (candidate) => {
        candidate.receiverResponses[0]!.sourceResponse!.workingRange = { min: 0, max: 1 };
      },
      (candidate) => {
        candidate.receiverResponses[0]!.sourceResponse!.modelType = 'hill_equation_n_fixed_1';
      },
      (candidate) => {
        candidate.receiverResponses[0]!.sourceResponse!.demoImplementation = 'forged';
      },
      (candidate) => {
        candidate.receiverResponses[0]!.sourceResponse!.numericalExecutionAllowed = false;
      },
      (candidate) => {
        candidate.receiverResponses[0]!.sourceResponse!.ec50 = 1;
      },
    ];

    for (const mutate of mutations) {
      const candidate = mutableCatalog();
      mutate(candidate);
      expect(() => buildReceiverResponseBinding(candidate, 'resp.kylilis2018.rhl.c4')).toThrow(
        'RECEIVER_RESPONSE_BINDING_INVALID',
      );
    }
  });

  it('rejects a forged catalog that only reuses a whitelisted response id', () => {
    const candidate = mutableCatalog();
    candidate.receiverResponses[0] = {
      ...candidate.receiverResponses[0]!,
      id: 'resp.kylilis2018.rhl.c4',
      sourceResponse: {
        ...candidate.receiverResponses[0]!.sourceResponse!,
        ec50: 9.9e-7,
      },
    };
    expect(() => buildReceiverResponseBinding(candidate, 'resp.kylilis2018.rhl.c4')).toThrow(
      'RECEIVER_RESPONSE_BINDING_INVALID',
    );
  });

  it('rejects forged binding parameters, provenance, units, and non-finite values', () => {
    const binding = buildReceiverResponseBinding(catalog, 'resp.kylilis2018.rhl.c4');
    const mutations: Array<(candidate: typeof binding) => void> = [
      (candidate) => {
        candidate.originalParameters.ec50 *= 2;
      },
      (candidate) => {
        candidate.parameterContextId = 'ctx.fake';
      },
      (candidate) => {
        candidate.inputSignalId = 'ahl.fake';
      },
      (candidate) => {
        candidate.sourceIds = ['src.fake'];
      },
      (candidate) => {
        candidate.releaseVersion = '9.9';
      },
      (candidate) => {
        candidate.direction = 'inhibition';
      },
      (candidate) => {
        candidate.workingRange = { min: 0, max: 1, unit: 'M' };
      },
      (candidate) => {
        candidate.originalParameters.ec50 = Number.NaN;
      },
      (candidate) => {
        const parameters = candidate.originalParameters as unknown as { ec50Unit: string };
        parameters.ec50Unit = 'nM';
      },
    ];
    for (const mutate of mutations) {
      const forged = structuredClone(binding);
      mutate(forged);
      expect(() => evaluateReceiverResponse(forged, binding.originalParameters.ec50)).toThrow(
        /RECEIVER_RESPONSE_BINDING_(?:NOT_WHITELISTED|INVALID)/,
      );
    }
  });

  it('keeps below-range and above-range handling deterministic', () => {
    const binding = buildReceiverResponseBinding(catalog, 'resp.kylilis2018.rhl.c4');
    expect(() => evaluateReceiverResponse(binding, binding.workingRange.min / 2)).toThrow(
      'RECEIVER_RESPONSE_INPUT_OUT_OF_RANGE',
    );
    expect(() => evaluateReceiverResponse(binding, binding.workingRange.max * 2)).toThrow(
      'RECEIVER_RESPONSE_INPUT_OUT_OF_RANGE',
    );
    expect(evaluateReceiverResponse(binding, 0)).toBe(0);
  });
});
