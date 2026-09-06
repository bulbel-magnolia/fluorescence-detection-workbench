import type { BfnOutputMonitor, BfnProject } from '../types';
import type { BfnDynamicGainRequestV1, BfnResolvedDynamicGainTargetV1 } from './dynamicGainTypes';
import { assessBfnDynamicGainRequest } from './dynamicGainValidation';
import { bfnNetworkInfluencePrefill } from './networkInfluencePresentation';

export type BfnDynamicGainAvailabilityReason =
  'dynamic_integrator' | 'feedback' | 'missing_input' | 'response_invalid';

export type BfnDynamicGainAvailability =
  | {
      readonly supported: true;
      readonly target: BfnResolvedDynamicGainTargetV1;
      readonly reason: null;
    }
  | {
      readonly supported: false;
      readonly target: null;
      readonly reason: BfnDynamicGainAvailabilityReason;
    };

export function assessBfnDynamicGainAvailability(
  project: BfnProject,
  monitor: BfnOutputMonitor,
): BfnDynamicGainAvailability {
  const request: BfnDynamicGainRequestV1 = {
    contractVersion: '1.0',
    scope: 'network_dynamic_periodic_gain',
    outputMonitorId: monitor.id,
    operatingPoint: project.network.inputSources.map((source) => ({
      inputSourceId: source.id,
      value: 0,
      unit: source.outputPort.unit,
    })),
    perturbation: { periodHours: 1 },
  };
  const admission = assessBfnDynamicGainRequest(project, request);
  if (admission.target) {
    return Object.freeze({ supported: true, target: admission.target, reason: null });
  }
  if (admission.issues.some((issue) => issue.code === 'integrator_reference_state_unavailable')) {
    return Object.freeze({ supported: false, target: null, reason: 'dynamic_integrator' });
  }
  if (admission.issues.some((issue) => issue.code === 'feedback')) {
    return Object.freeze({ supported: false, target: null, reason: 'feedback' });
  }
  if (admission.issues.some((issue) => issue.code === 'missing_input')) {
    return Object.freeze({ supported: false, target: null, reason: 'missing_input' });
  }
  return Object.freeze({ supported: false, target: null, reason: 'response_invalid' });
}

/** Reuses the corrected Batch 13.2 exact Project-setting prefill contract. */
export function bfnDynamicGainPrefill(project: BfnProject, inputSourceId: string): number | null {
  return bfnNetworkInfluencePrefill(project, inputSourceId);
}
