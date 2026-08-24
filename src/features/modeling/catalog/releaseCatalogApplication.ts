import {
  buildReceiverResponseBinding,
  ReceiverResponseEvaluationError,
} from '../receiverResponseEvaluator';
import type { ModelNode, NetworkModel } from '../types';
import { attachCatalogReference } from './catalogReference';
import {
  createReleaseComponentReference,
  createReleaseResponseReference,
  getReleaseResponseNodeName,
  isCanonicalRunnableReleaseResponse,
  type ReleaseCatalogLanguage,
  type ReleaseCatalogPresentation,
  type ReleaseComponentView,
  type ReleaseResponseVariantView,
} from './releaseCatalogPresentation';

export type ReleaseCatalogApplicationIssue =
  | 'response-not-canonical'
  | 'response-not-runnable'
  | 'component-not-found'
  | 'node-id-conflict'
  | 'port-id-conflict'
  | 'trusted-binding-rejected';

export type ReleaseCatalogApplicationResult =
  | { ok: true; node: ModelNode; model: NetworkModel }
  | { ok: false; issue: ReleaseCatalogApplicationIssue };

export interface ReleaseCatalogApplicationOptions {
  nodeId: string;
  x: number;
  y: number;
  language: ReleaseCatalogLanguage;
  displayName?: string;
  now?: string;
}

/**
 * Apply one trusted V1.1 receiver response as an independent processing node.
 *
 * The response object must be the canonical object exposed by the frozen
 * presentation.  The trusted binding builder independently compares the
 * catalog and response parameters against the bundled release, so a forged
 * object with a whitelisted ID is rejected.
 */
export function applyReleaseResponseToNetwork(
  model: NetworkModel,
  presentation: ReleaseCatalogPresentation,
  responseView: ReleaseResponseVariantView,
  options: ReleaseCatalogApplicationOptions,
): ReleaseCatalogApplicationResult {
  if (
    !presentation.responseVariants.includes(responseView) ||
    !presentation.catalog.receiverResponses.includes(responseView.response)
  )
    return { ok: false, issue: 'response-not-canonical' };
  if (
    !responseView.runnable ||
    !isCanonicalRunnableReleaseResponse(presentation.catalog, responseView.response)
  )
    return { ok: false, issue: 'response-not-runnable' };
  const component = presentation.components.find(
    (candidate) => candidate.id === responseView.componentId,
  );
  if (component === undefined) return { ok: false, issue: 'component-not-found' };
  if (model.nodes.some((node) => node.id === options.nodeId))
    return { ok: false, issue: 'node-id-conflict' };

  const inputPortId = options.nodeId + '-in-1';
  const outputPortId = options.nodeId + '-out-1';
  const existingPortIds = new Set(
    model.nodes.flatMap((node) => [
      ...node.inputPorts.map((port) => port.id),
      ...node.outputPorts.map((port) => port.id),
    ]),
  );
  if (existingPortIds.has(inputPortId) || existingPortIds.has(outputPortId))
    return { ok: false, issue: 'port-id-conflict' };

  let receiverResponseBinding: ModelNode['receiverResponseBinding'];
  try {
    receiverResponseBinding = buildReceiverResponseBinding(
      presentation.catalog,
      responseView.response.id,
    );
  } catch (error) {
    if (error instanceof ReceiverResponseEvaluationError)
      return { ok: false, issue: 'trusted-binding-rejected' };
    throw error;
  }

  const node: ModelNode = {
    id: options.nodeId,
    name:
      options.displayName?.trim() ||
      getReleaseResponseNodeName(component, responseView, options.language),
    kind: 'processing',
    x: options.x,
    y: options.y,
    parameters: {
      baseline: 0,
      gain: 1,
      parameterStatus: 'normalized-demo',
      provenance: 'catalog-reference',
    },
    inputPorts: [
      {
        id: inputPortId,
        signalId: receiverResponseBinding.inputSignalId,
        sensitivity: 1,
        direction: receiverResponseBinding.direction,
        parameterStatus: 'normalized-demo',
        provenance: 'catalog-reference',
      },
    ],
    outputPorts: [
      {
        id: outputPortId,
        signalId: receiverResponseBinding.outputSignalId,
        strength: 1,
        parameterStatus: 'normalized-demo',
        provenance: 'catalog-reference',
      },
    ],
    receiverResponseBinding,
    catalogReference: createReleaseResponseReference(presentation, responseView, options.language),
  };
  return {
    ok: true,
    node,
    model: {
      ...model,
      nodes: [...model.nodes, node],
      edges: model.edges,
      updatedAt: options.now ?? new Date().toISOString(),
      isDemo: true,
    },
  };
}

/**
 * Secondary citation-only action.  It changes no parameters, ports or edges.
 */
export function attachReleaseComponentCitation(
  model: NetworkModel,
  nodeId: string,
  presentation: ReleaseCatalogPresentation,
  component: ReleaseComponentView,
  language: ReleaseCatalogLanguage,
): NetworkModel {
  return attachCatalogReference(
    model,
    nodeId,
    createReleaseComponentReference(presentation, component, language),
  );
}
