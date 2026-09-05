import type { BfnProject } from '../types';
import { calculateBfnNetworkInfluence } from './networkInfluence';
import type { BfnNetworkInfluenceCalculationV1 } from './networkInfluenceTypes';
import type {
  BfnAvailableLocalAnnWeightV1,
  BfnLocalAnnApproximationCalculationV1,
  BfnLocalAnnApproximationIssueV1,
  BfnLocalAnnApproximationRequestV1,
  BfnLocalAnnModuleApproximationV1,
  BfnLocalAnnNetworkSourceWeightV1,
} from './localAnnApproximationTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requestContractIsValid(request: BfnLocalAnnApproximationRequestV1): boolean {
  return (
    isRecord(request) &&
    request.contractVersion === '1.0' &&
    request.scope === 'network_local_ann_approximation' &&
    typeof request.outputMonitorId === 'string' &&
    request.outputMonitorId.trim().length > 0 &&
    Array.isArray(request.operatingPoint)
  );
}

function failed(
  networkInfluence: BfnNetworkInfluenceCalculationV1 | null,
  issue: BfnLocalAnnApproximationIssueV1 | null,
): BfnLocalAnnApproximationCalculationV1 {
  return Object.freeze({ ok: false, networkInfluence, issue });
}

function affineBias(
  output: number,
  inputs: readonly {
    readonly operatingValue: number;
    readonly weight: BfnAvailableLocalAnnWeightV1;
  }[],
): number {
  return output - inputs.reduce((sum, input) => sum + input.weight.value * input.operatingValue, 0);
}

/**
 * Builds a complete local affine representation from the existing network influence result.
 * The biological network remains the calculation source of truth and is never modified.
 */
export function calculateBfnLocalAnnApproximation(
  project: BfnProject,
  request: BfnLocalAnnApproximationRequestV1,
): BfnLocalAnnApproximationCalculationV1 {
  if (!requestContractIsValid(request)) {
    return failed(null, Object.freeze({ code: 'request_contract_invalid', subjectId: 'request' }));
  }

  const networkInfluence = calculateBfnNetworkInfluence(project, {
    contractVersion: '1.0',
    scope: 'network_static_output',
    outputMonitorId: request.outputMonitorId,
    operatingPoint: request.operatingPoint,
  });
  if (!networkInfluence.ok) return failed(networkInfluence, null);

  const moduleApproximations: BfnLocalAnnModuleApproximationV1[] = [];
  for (const interpretation of networkInfluence.result.moduleInterpretations) {
    const local = interpretation.localInfluence;
    const inputWeights = [];
    for (const input of local.perInput) {
      if (input.localDifferentialGain.availability === 'unavailable') {
        return failed(
          networkInfluence,
          Object.freeze({
            code: 'incomplete_local_linearization',
            moduleId: interpretation.moduleId,
            inputPortId: input.portId,
            reason: input.localDifferentialGain.reason,
          }),
        );
      }
      inputWeights.push(
        Object.freeze({
          inputPortId: input.portId,
          operatingValue: input.operatingValue,
          operatingUnit: input.operatingUnit,
          weight: input.localDifferentialGain,
        }),
      );
    }
    const biasValue = affineBias(local.outputAtOperatingPoint.value, inputWeights);
    if (!Number.isFinite(biasValue)) {
      return failed(
        networkInfluence,
        Object.freeze({ code: 'bias_non_finite', subjectId: interpretation.moduleId }),
      );
    }
    moduleApproximations.push(
      Object.freeze({
        moduleId: interpretation.moduleId,
        staticModelId: local.target.staticModelId,
        staticModelVersion: local.target.staticModelVersion,
        interpretationBasis: local.target.interpretationBasis,
        outputAtOperatingPoint: local.outputAtOperatingPoint,
        inputWeights: Object.freeze(inputWeights),
        bias: Object.freeze({ value: biasValue, unit: local.outputAtOperatingPoint.unit }),
        evidence: local.target.evidence,
        contextReference: local.target.contextReference,
      }),
    );
  }

  const sourceWeights: BfnLocalAnnNetworkSourceWeightV1[] = [];
  for (const source of networkInfluence.result.perSource) {
    if (source.totalDifferentialGain.availability === 'unavailable') {
      return failed(
        networkInfluence,
        Object.freeze({
          code: 'incomplete_network_linearization',
          inputSourceId: source.inputSourceId,
          reason: source.totalDifferentialGain.reason,
        }),
      );
    }
    sourceWeights.push(
      Object.freeze({
        inputSourceId: source.inputSourceId,
        operatingValue: source.operatingValue,
        operatingUnit: source.operatingUnit,
        weight: source.totalDifferentialGain,
      }),
    );
  }
  const networkBiasValue = affineBias(
    networkInfluence.result.outputAtOperatingPoint.value,
    sourceWeights,
  );
  if (!Number.isFinite(networkBiasValue)) {
    return failed(
      networkInfluence,
      Object.freeze({
        code: 'bias_non_finite',
        subjectId: networkInfluence.result.target.outputMonitorId,
      }),
    );
  }

  const networkApproximation = Object.freeze({
    outputMonitorId: networkInfluence.result.target.outputMonitorId,
    sourceWeights: Object.freeze(sourceWeights),
    bias: Object.freeze({
      value: networkBiasValue,
      unit: networkInfluence.result.outputAtOperatingPoint.unit,
    }),
  });
  const result = Object.freeze({
    contractVersion: '1.0' as const,
    scope: 'network_local_ann_approximation' as const,
    target: networkInfluence.result.target,
    operatingPoint: networkInfluence.result.operatingPoint,
    outputAtOperatingPoint: networkInfluence.result.outputAtOperatingPoint,
    moduleApproximations: Object.freeze(moduleApproximations),
    networkApproximation,
    applicability: networkInfluence.result.applicability,
    contextApplicability: networkInfluence.result.contextApplicability,
    persistence: 'ephemeral' as const,
  });
  return Object.freeze({ ok: true, networkInfluence, result });
}
