import type { BfnOutputMonitor, BfnProject } from '../types';
import {
  assessBfnNetworkInfluenceAvailability,
  bfnNetworkInfluencePrefill,
  type BfnNetworkInfluenceAvailability,
} from './networkInfluencePresentation';

/** Reuses Batch 13.2 target discovery and unsupported-topology reasons verbatim. */
export function assessBfnLocalAnnApproximationAvailability(
  project: BfnProject,
  monitor: BfnOutputMonitor,
): BfnNetworkInfluenceAvailability {
  return assessBfnNetworkInfluenceAvailability(project, monitor);
}

/** Reuses Batch 13.2 conservative exact-unit prefill semantics. */
export function bfnLocalAnnApproximationPrefill(
  project: BfnProject,
  inputSourceId: string,
): number | null {
  return bfnNetworkInfluencePrefill(project, inputSourceId);
}
