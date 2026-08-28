import { findBfnOutputReachableModuleIds } from '../outputReachability';
import type { BfnProject, BfnRunTemporalSnapshot } from '../types';
import { resolveBfnModuleTemporalCapability } from './temporalCapability';

export function createBfnRunTemporalSnapshot(
  project: BfnProject,
  monitorId: string,
): BfnRunTemporalSnapshot {
  const reachableModuleIds = findBfnOutputReachableModuleIds(project, monitorId);
  return {
    scope: 'output_reachable',
    modules: project.network.modules
      .filter((module) => reachableModuleIds.has(module.id))
      .map((module) => {
        const capability = resolveBfnModuleTemporalCapability(project, module);
        return {
          moduleId: module.id,
          selectedModelId: capability.selectedModelId,
          executionMode: capability.executionMode,
          evidenceTier: capability.evidenceTier,
          resolutionBasis: capability.resolutionBasis,
        };
      }),
  };
}
