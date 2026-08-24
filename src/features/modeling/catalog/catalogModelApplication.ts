import type {
  ModelInputDirection,
  ModelInputPort,
  ModelNode,
  ModelOutputPort,
  ModelParameterProvenance,
  ModelParameterStatus,
  NetworkModel,
} from '../types';
import type {
  CatalogApplicationAssessment,
  CatalogEntry,
  CatalogNetworkRole,
  CatalogSignal,
} from './catalogTypes';
import { createLiteratureCandidateReference } from './catalogPresentation';

export type CatalogModelApplicationIssue =
  | 'application-not-allowed'
  | 'target-role-missing'
  | 'required-input-signal-missing'
  | 'required-output-signal-missing'
  | 'quantitative-parameters-missing';

export type CatalogModelApplicationResult =
  | { ok: true; node: ModelNode; model: NetworkModel }
  | { ok: false; issue: CatalogModelApplicationIssue };

export interface CatalogModelApplicationOptions {
  nodeId: string;
  displayName: string;
  x: number;
  y: number;
  now?: string;
}

function knownSignals(value: CatalogEntry['signals']['inputs']): CatalogSignal[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((signal) => {
    if (!signal.id.trim() || seen.has(signal.id)) return false;
    seen.add(signal.id);
    return true;
  });
}

function direction(signal: CatalogSignal): ModelInputDirection {
  return signal.direction === 'negative' ? 'inhibition' : 'activation';
}

function modelStatus(assessment: CatalogApplicationAssessment): {
  status: ModelParameterStatus;
  provenance: ModelParameterProvenance;
  runnableValue: number;
} {
  if (assessment.applicationMode === 'demo') {
    return {
      status: 'normalized-demo',
      provenance: 'development-fixture',
      runnableValue: 1,
    };
  }
  if (assessment.applicationMode === 'calibration') {
    return {
      status: 'calibration-required',
      provenance: 'catalog-reference',
      runnableValue: 0,
    };
  }
  return {
    status: 'reference-only',
    provenance: 'catalog-reference',
    runnableValue: 0,
  };
}

function portsForRole(
  role: CatalogNetworkRole,
  entry: CatalogEntry,
  nodeId: string,
  status: ModelParameterStatus,
  provenance: ModelParameterProvenance,
  value: number,
): { inputPorts: ModelInputPort[]; outputPorts: ModelOutputPort[] } | CatalogModelApplicationIssue {
  const catalogInputs = knownSignals(entry.signals.inputs);
  const catalogOutputs = knownSignals(entry.signals.outputs);
  const inputs = role === 'input' ? [] : catalogInputs.length ? catalogInputs : catalogOutputs;
  const outputs = role === 'output' ? [] : catalogOutputs.length ? catalogOutputs : catalogInputs;

  if (role !== 'input' && inputs.length === 0) return 'required-input-signal-missing';
  if (role !== 'output' && outputs.length === 0) return 'required-output-signal-missing';

  return {
    inputPorts: inputs.map((signal, index) => ({
      id: `${nodeId}-in-${index + 1}`,
      signalId: signal.id,
      sensitivity: value,
      direction: direction(signal),
      parameterStatus: status,
      provenance,
    })),
    outputPorts: outputs.map((signal, index) => ({
      id: `${nodeId}-out-${index + 1}`,
      signalId: signal.id,
      strength: value,
      parameterStatus: status,
      provenance,
    })),
  };
}

export function applyCatalogEntryToNetwork(
  model: NetworkModel,
  entry: CatalogEntry,
  assessment: CatalogApplicationAssessment,
  options: CatalogModelApplicationOptions,
): CatalogModelApplicationResult {
  if (!assessment.allowed) return { ok: false, issue: 'application-not-allowed' };
  if (!assessment.targetNetworkRole) return { ok: false, issue: 'target-role-missing' };
  if (assessment.applicationMode === 'quantitative') {
    return { ok: false, issue: 'quantitative-parameters-missing' };
  }

  const metadata = modelStatus(assessment);
  const ports = portsForRole(
    assessment.targetNetworkRole,
    entry,
    options.nodeId,
    metadata.status,
    metadata.provenance,
    metadata.runnableValue,
  );
  if (typeof ports === 'string') return { ok: false, issue: ports };

  const modelNode: ModelNode = {
    id: options.nodeId,
    name: options.displayName,
    kind: assessment.targetNetworkRole,
    x: options.x,
    y: options.y,
    parameters: {
      baseline:
        assessment.targetNetworkRole === 'input' && metadata.status === 'normalized-demo' ? 0.5 : 0,
      gain: metadata.runnableValue,
      parameterStatus: metadata.status,
      provenance: metadata.provenance,
    },
    inputPorts: ports.inputPorts,
    outputPorts: ports.outputPorts,
    catalogReference: createLiteratureCandidateReference(entry, options.displayName),
  };
  const now = options.now ?? new Date().toISOString();
  return {
    ok: true,
    node: modelNode,
    model: {
      ...model,
      nodes: [...model.nodes, modelNode],
      updatedAt: now,
      isDemo: model.isDemo || metadata.status === 'normalized-demo',
    },
  };
}
