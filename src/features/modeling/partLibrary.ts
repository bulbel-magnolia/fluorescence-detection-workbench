import type { ModelNode, ModelNodeKind, ModelNodeParameters } from './types';

export type PartEvidenceStatus = 'documented-pattern' | 'illustrative';

type SuggestedNodeParameters = Partial<Pick<ModelNodeParameters, 'baseline' | 'gain'>>;

export interface ModelingPortSuggestions {
  inputSensitivity?: number;
  outputStrength?: number;
}

export interface ModelingPart {
  id: string;
  kind: ModelNodeKind;
  nameKey: string;
  descriptionKey: string;
  sourceKey: string;
  evidenceStatus: PartEvidenceStatus;
  suggestedParameters: SuggestedNodeParameters;
  suggestedPortParameters?: ModelingPortSuggestions;
  tint: string;
}

const illustrativeSource = 'modeling.parts.sources.platformPattern';

export const modelingParts: ModelingPart[] = [
  {
    id: 'normalized-input-linear',
    kind: 'input',
    nameKey: 'modeling.parts.sensorLinear.name',
    descriptionKey: 'modeling.parts.sensorLinear.description',
    sourceKey: illustrativeSource,
    evidenceStatus: 'illustrative',
    suggestedParameters: { baseline: 0.5, gain: 1 },
    suggestedPortParameters: { outputStrength: 1 },
    tint: '#00e7ff',
  },
  {
    id: 'normalized-input-cooperative',
    kind: 'input',
    nameKey: 'modeling.parts.sensorCooperative.name',
    descriptionKey: 'modeling.parts.sensorCooperative.description',
    sourceKey: illustrativeSource,
    evidenceStatus: 'illustrative',
    suggestedParameters: { baseline: 0.5, gain: 1.15 },
    suggestedPortParameters: { outputStrength: 1 },
    tint: '#377cff',
  },
  {
    id: 'processing-buffer',
    kind: 'processing',
    nameKey: 'modeling.parts.signalBuffer.name',
    descriptionKey: 'modeling.parts.signalBuffer.description',
    sourceKey: illustrativeSource,
    evidenceStatus: 'illustrative',
    suggestedParameters: { baseline: 0, gain: 1 },
    suggestedPortParameters: { inputSensitivity: 1, outputStrength: 1 },
    tint: '#00ffd0',
  },
  {
    id: 'processing-amplifier',
    kind: 'processing',
    nameKey: 'modeling.parts.signalAmplifier.name',
    descriptionKey: 'modeling.parts.signalAmplifier.description',
    sourceKey: illustrativeSource,
    evidenceStatus: 'illustrative',
    suggestedParameters: { baseline: 0, gain: 1.4 },
    suggestedPortParameters: { inputSensitivity: 1, outputStrength: 1 },
    tint: '#377cff',
  },
  {
    id: 'processing-gate',
    kind: 'processing',
    nameKey: 'modeling.parts.responseGate.name',
    descriptionKey: 'modeling.parts.responseGate.description',
    sourceKey: illustrativeSource,
    evidenceStatus: 'illustrative',
    suggestedParameters: { baseline: 0, gain: 1.2 },
    suggestedPortParameters: { inputSensitivity: 0.8, outputStrength: 1 },
    tint: '#ff4fa6',
  },
  {
    id: 'processing-memory',
    kind: 'processing',
    nameKey: 'modeling.parts.stateMemory.name',
    descriptionKey: 'modeling.parts.stateMemory.description',
    sourceKey: illustrativeSource,
    evidenceStatus: 'illustrative',
    suggestedParameters: { baseline: 0, gain: 0.88 },
    suggestedPortParameters: { inputSensitivity: 0.8, outputStrength: 1 },
    tint: '#8154ff',
  },
  {
    id: 'normalized-output-reporter',
    kind: 'output',
    nameKey: 'modeling.parts.normalizedReporter.name',
    descriptionKey: 'modeling.parts.normalizedReporter.description',
    sourceKey: illustrativeSource,
    evidenceStatus: 'illustrative',
    suggestedParameters: { baseline: 0, gain: 1 },
    suggestedPortParameters: { inputSensitivity: 1 },
    tint: '#00ffd0',
  },
];

export function compatibleParts(kind: ModelNodeKind): ModelingPart[] {
  return modelingParts.filter((part) => part.kind === kind);
}

function bounded(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

export function applyPart(node: ModelNode, part: ModelingPart, localizedName: string): ModelNode {
  if (node.kind !== part.kind) {
    throw new Error('Modeling part is incompatible with the selected node kind.');
  }
  const portSuggestions = part.suggestedPortParameters;
  const inputPorts =
    portSuggestions?.inputSensitivity === undefined
      ? node.inputPorts
      : node.inputPorts.map((port) => ({
          ...port,
          sensitivity: bounded(portSuggestions.inputSensitivity ?? port.sensitivity),
        }));
  const outputPorts =
    portSuggestions?.outputStrength === undefined
      ? node.outputPorts
      : node.outputPorts.map((port) => ({
          ...port,
          strength: bounded(portSuggestions.outputStrength ?? port.strength),
        }));
  return {
    ...node,
    name: localizedName,
    parameters: { ...node.parameters, ...part.suggestedParameters },
    inputPorts,
    outputPorts,
    part: {
      id: part.id,
      sourceKey: part.sourceKey,
      evidenceStatus: part.evidenceStatus,
    },
  };
}
