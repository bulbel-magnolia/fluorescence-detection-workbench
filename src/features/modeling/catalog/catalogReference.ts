import type { ModelNode, NetworkModel } from '../types';
import type { LiteratureCandidateReference } from './catalogTypes';

function mapNode(
  model: NetworkModel,
  nodeId: string,
  map: (node: ModelNode) => ModelNode,
): NetworkModel {
  if (!model.nodes.some((node) => node.id === nodeId)) {
    throw new Error('MODEL_NODE_NOT_FOUND');
  }
  return {
    ...model,
    nodes: model.nodes.map((node) => (node.id === nodeId ? map(node) : node)),
    updatedAt: new Date().toISOString(),
  };
}

export function isLiteratureCandidateReference(
  value: unknown,
): value is LiteratureCandidateReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<LiteratureCandidateReference>;
  return (
    typeof candidate.catalogId === 'string' &&
    candidate.catalogId.trim().length > 0 &&
    typeof candidate.catalogVersion === 'string' &&
    candidate.catalogVersion.trim().length > 0 &&
    typeof candidate.entryId === 'string' &&
    candidate.entryId.trim().length > 0 &&
    typeof candidate.displayNameSnapshot === 'string' &&
    candidate.displayNameSnapshot.trim().length > 0 &&
    (candidate.sourceStatus === undefined ||
      ['passed', 'needs-review', 'withdrawn'].includes(candidate.sourceStatus)) &&
    (candidate.boundaryNote === undefined || typeof candidate.boundaryNote === 'string')
  );
}

export function attachCatalogReference(
  model: NetworkModel,
  nodeId: string,
  reference: LiteratureCandidateReference,
): NetworkModel {
  if (!isLiteratureCandidateReference(reference)) {
    throw new Error('INVALID_CATALOG_REFERENCE');
  }
  return mapNode(model, nodeId, (node) => ({
    ...node,
    catalogReference: { ...reference },
  }));
}

export function detachCatalogReference(model: NetworkModel, nodeId: string): NetworkModel {
  return mapNode(model, nodeId, (node) => {
    const withoutReference = { ...node };
    delete withoutReference.catalogReference;
    return withoutReference;
  });
}
