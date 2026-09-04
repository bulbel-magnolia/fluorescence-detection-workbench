import type { BfnOutputMonitor, BfnProject } from '../types';
import type {
  BfnNetworkInfluenceRequestV1,
  BfnResolvedNetworkInfluenceTargetV1,
} from './networkInfluenceTypes';
import { assessBfnNetworkInfluenceRequest } from './networkInfluenceValidation';

export type BfnNetworkInfluenceAvailabilityReason =
  'dynamic_integrator' | 'feedback' | 'missing_input' | 'response_invalid';

export type BfnNetworkInfluenceAvailability =
  | {
      readonly supported: true;
      readonly target: BfnResolvedNetworkInfluenceTargetV1;
      readonly reason: null;
    }
  | {
      readonly supported: false;
      readonly target: null;
      readonly reason: BfnNetworkInfluenceAvailabilityReason;
    };

export function assessBfnNetworkInfluenceAvailability(
  project: BfnProject,
  monitor: BfnOutputMonitor,
): BfnNetworkInfluenceAvailability {
  const request: BfnNetworkInfluenceRequestV1 = {
    contractVersion: '1.0',
    scope: 'network_static_output',
    outputMonitorId: monitor.id,
    operatingPoint: [],
  };
  const admission = assessBfnNetworkInfluenceRequest(project, request);
  if (admission.target) {
    return Object.freeze({ supported: true, target: admission.target, reason: null });
  }
  if (admission.issues.some((issue) => issue.code === 'upstream_accumulator_unsupported')) {
    return Object.freeze({ supported: false, target: null, reason: 'dynamic_integrator' });
  }
  if (admission.issues.some((issue) => issue.code === 'upstream_feedback_unsupported')) {
    return Object.freeze({ supported: false, target: null, reason: 'feedback' });
  }
  if (
    admission.issues.some(
      (issue) =>
        issue.code === 'required_input_unconnected' || issue.code === 'required_input_ambiguous',
    )
  ) {
    return Object.freeze({ supported: false, target: null, reason: 'missing_input' });
  }
  return Object.freeze({ supported: false, target: null, reason: 'response_invalid' });
}

/** Returns only an exact, uniquely defined Project setting; all other conditions remain blank. */
export function bfnNetworkInfluencePrefill(
  project: BfnProject,
  inputSourceId: string,
): number | null {
  const source = project.network.inputSources.find((candidate) => candidate.id === inputSourceId);
  if (!source) return null;
  if (project.network.mode === 'static' && source.staticSpecification.type === 'fixed_value') {
    return source.staticSpecification.unit === source.outputPort.unit
      ? source.staticSpecification.value
      : null;
  }
  if (project.network.mode === 'dynamic' && source.dynamicSpecification.type === 'constant') {
    return source.dynamicSpecification.unit === source.outputPort.unit
      ? source.dynamicSpecification.value
      : null;
  }
  return null;
}
