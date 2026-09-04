import type { BfnProject } from '../types';
import { assessBfnConnectionContextApplicability } from '../compatibility/contextIntegration';
import type {
  BfnNetworkInterpretationContextSnapshotV1,
  BfnNetworkInterpretationContextSummaryV1,
  BfnResolvedNetworkInfluenceTargetV1,
} from './networkInfluenceTypes';

function summarize(
  edges: BfnNetworkInterpretationContextSnapshotV1['edges'],
): BfnNetworkInterpretationContextSummaryV1 {
  if (edges.length === 0) return 'not_applicable';
  if (edges.some((edge) => edge.state === 'mismatched')) return 'mismatch_present';
  if (edges.some((edge) => edge.state === 'uncertain' || edge.state === 'unavailable')) {
    return 'uncertain_or_unavailable';
  }
  return 'matched';
}

/** Delegates every relevant Module-to-Module comparison to the existing Context contract. */
export function createBfnNetworkInterpretationContextSnapshot(
  project: BfnProject,
  target: BfnResolvedNetworkInfluenceTargetV1,
): BfnNetworkInterpretationContextSnapshotV1 {
  const relevantEdgeIds = new Set(target.relevantEdgeIds);
  const moduleIds = new Set(project.network.modules.map((module) => module.id));
  const edges = project.network.edges
    .filter(
      (edge) =>
        edge.enabled &&
        relevantEdgeIds.has(edge.id) &&
        moduleIds.has(edge.source.nodeId) &&
        moduleIds.has(edge.target.nodeId),
    )
    .map((edge) => {
      const assessment = assessBfnConnectionContextApplicability(project, edge.source, edge.target);
      return Object.freeze({
        edgeId: edge.id,
        state: assessment.overall,
        checks: Object.freeze(assessment.checks.map((check) => Object.freeze({ ...check }))),
      });
    });
  const frozenEdges = Object.freeze(edges);
  return Object.freeze({
    scope: 'target_relevant_module_edges',
    summary: summarize(frozenEdges),
    edges: frozenEdges,
  });
}
