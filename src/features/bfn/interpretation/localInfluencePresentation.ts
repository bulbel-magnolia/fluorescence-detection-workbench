import type { BfnFunctionalModule, BfnProject } from '../types';
import type {
  BfnLocalDifferentialGainV1,
  BfnLocalInfluenceRequestV1,
  BfnResolvedLocalInfluenceTargetV1,
} from './interpretationTypes';
import { assessBfnLocalInfluenceRequest } from './interpretationValidation';

export type BfnLocalInfluenceAvailabilityReason =
  'dynamic_integrator' | 'steady_state_missing' | 'response_invalid';

export type BfnLocalInfluenceAvailability =
  | {
      readonly supported: true;
      readonly target: BfnResolvedLocalInfluenceTargetV1;
      readonly reason: null;
    }
  | {
      readonly supported: false;
      readonly target: null;
      readonly reason: BfnLocalInfluenceAvailabilityReason;
    };

export type BfnLocalInfluenceDirection =
  'enhancing' | 'inhibiting' | 'no_local_change' | 'unavailable';

export function assessBfnLocalInfluenceAvailability(
  project: BfnProject,
  module: BfnFunctionalModule,
): BfnLocalInfluenceAvailability {
  const request: BfnLocalInfluenceRequestV1 = {
    contractVersion: '1.0',
    scope: 'module_static_response',
    moduleId: module.id,
    outputPortId: module.outputPorts[0]?.id ?? '',
    operatingPoint: [],
  };
  const admission = assessBfnLocalInfluenceRequest(project, request);
  if (admission.target) {
    return Object.freeze({ supported: true, target: admission.target, reason: null });
  }
  const dynamicIntegrator = admission.issues.some(
    (issue) =>
      issue.code === 'static_interpretation_unsupported' &&
      issue.details?.reason === 'accumulator_has_no_static_response',
  );
  if (dynamicIntegrator) {
    return Object.freeze({
      supported: false,
      target: null,
      reason: 'dynamic_integrator',
    });
  }
  const steadyStateMissing = admission.issues.some(
    (issue) => issue.code === 'static_model_missing' || issue.code === 'dynamic_only_model',
  );
  return Object.freeze({
    supported: false,
    target: null,
    reason: steadyStateMissing ? 'steady_state_missing' : 'response_invalid',
  });
}

export function bfnLocalInfluenceDirection(
  gain: BfnLocalDifferentialGainV1,
): BfnLocalInfluenceDirection {
  if (gain.availability === 'unavailable') return 'unavailable';
  if (gain.value > 0) return 'enhancing';
  if (gain.value < 0) return 'inhibiting';
  return 'no_local_change';
}
