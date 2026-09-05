import type { BfnProject, BfnUnit } from '../types';
import type { BfnDerivedGainUnit } from './interpretationTypes';
import type { BfnLocalAnnApproximationResultV1 } from './localAnnApproximationTypes';

export interface BfnLocalAnnCanvasWeightOverlayV1 {
  readonly targetModuleId: string;
  readonly targetInputPortId: string;
  /** Positioning identity only; the Edge never owns this derived value. */
  readonly edgeId: string;
  readonly value: number;
  readonly unit: BfnDerivedGainUnit;
}

export interface BfnLocalAnnCanvasModuleBiasV1 {
  readonly moduleId: string;
  readonly value: number;
  readonly unit: BfnUnit;
}

export interface BfnLocalAnnCanvasOverlayV1 {
  readonly weights: readonly BfnLocalAnnCanvasWeightOverlayV1[];
  readonly moduleBiases: readonly BfnLocalAnnCanvasModuleBiasV1[];
  readonly relevantEdgeIds: readonly string[];
  readonly relevantNodeIds: readonly string[];
  readonly persistence: 'ephemeral';
}

/** Converts a successful derived result into read-only canvas presentation state. */
export function createBfnLocalAnnCanvasOverlay(
  project: BfnProject,
  result: BfnLocalAnnApproximationResultV1,
): BfnLocalAnnCanvasOverlayV1 {
  const relevantEdgeIds = new Set(result.target.relevantEdgeIds);
  const weights = result.moduleApproximations.flatMap((module) =>
    module.inputWeights.flatMap((input) => {
      const edge = project.network.edges.find(
        (candidate) =>
          candidate.enabled &&
          relevantEdgeIds.has(candidate.id) &&
          candidate.target.nodeId === module.moduleId &&
          candidate.target.portId === input.inputPortId,
      );
      return edge
        ? [
            Object.freeze({
              targetModuleId: module.moduleId,
              targetInputPortId: input.inputPortId,
              edgeId: edge.id,
              value: input.weight.value,
              unit: input.weight.unit,
            }),
          ]
        : [];
    }),
  );
  const moduleBiases = result.moduleApproximations.map((module) =>
    Object.freeze({
      moduleId: module.moduleId,
      value: module.bias.value,
      unit: module.bias.unit,
    }),
  );
  return Object.freeze({
    weights: Object.freeze(weights),
    moduleBiases: Object.freeze(moduleBiases),
    relevantEdgeIds: Object.freeze([...result.target.relevantEdgeIds]),
    relevantNodeIds: Object.freeze([
      ...result.target.inputSources.map((source) => source.inputSourceId),
      ...result.moduleApproximations.map((module) => module.moduleId),
      result.target.outputMonitorId,
    ]),
    persistence: 'ephemeral',
  });
}
