import { simulateNetwork } from './modelingCore';
import type { NetworkModel, OutputBand, ReceiverResponseWorkingRange } from './types';

export interface ReverseDesignCandidate {
  id: string;
  inputs: Record<string, number>;
  outputValue: number;
  outputBand: OutputBand;
  distance: number;
  isDemo: true;
}

export type ReverseDesignStatus =
  | 'idle'
  | 'ready'
  | 'no-path'
  | 'target-out-of-range'
  | 'missing-runnable-response'
  | 'range-conflict';

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function reverseReachableNodeIds(model: NetworkModel): ReadonlySet<string> {
  const reachable = new Set<string>([model.outputNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of model.edges) {
      if (!edge.enabled || !reachable.has(edge.target) || reachable.has(edge.source)) continue;
      reachable.add(edge.source);
      changed = true;
    }
  }
  return reachable;
}

function reverseReachableInputNodes(model: NetworkModel): NetworkModel['nodes'] {
  const reachable = reverseReachableNodeIds(model);
  return model.nodes.filter((node) => node.kind === 'input' && reachable.has(node.id));
}

function rangesForInputNode(model: NetworkModel, nodeId: string): ReceiverResponseWorkingRange[] {
  const source = model.nodes.find((candidate) => candidate.id === nodeId);
  if (!source) return [];
  const reachable = reverseReachableNodeIds(model);
  const signalIds = new Set(source.outputPorts.map((port) => port.signalId));
  const ranges = model.nodes
    .filter((candidate) => candidate.receiverResponseBinding !== undefined)
    .filter((candidate) => reachable.has(candidate.id))
    .filter((candidate) => signalIds.has(candidate.receiverResponseBinding?.inputSignalId ?? ''))
    .filter((candidate) =>
      model.edges.some(
        (edge) =>
          edge.enabled &&
          edge.source === nodeId &&
          edge.target === candidate.id &&
          edge.signalId === candidate.receiverResponseBinding?.inputSignalId,
      ),
    )
    .map((candidate) => candidate.receiverResponseBinding!.workingRange);
  if (ranges.length <= 1) return ranges;
  const intersection: ReceiverResponseWorkingRange = {
    min: Math.max(...ranges.map((range) => range.min)),
    max: Math.min(...ranges.map((range) => range.max)),
    unit: 'M',
  };
  if (intersection.max < intersection.min) throw new Error('REVERSE_DESIGN_INPUT_RANGE_CONFLICT');
  return [intersection];
}

function samplesForRange(range: ReceiverResponseWorkingRange): number[] {
  const values = [0];
  const positiveMin = range.min > 0 ? range.min : range.max * 1e-6;
  const count = 20;
  for (let index = 0; index <= count; index += 1) {
    const fraction = index / count;
    values.push(positiveMin * Math.pow(range.max / positiveMin, fraction));
  }
  return values;
}

function reverseInputSamples(model: NetworkModel, node: NetworkModel['nodes'][number]): number[] {
  const ranges = rangesForInputNode(model, node.id);
  if (ranges.length === 0) return Array.from({ length: 21 }, (_, index) => index / 20);
  const values = ranges.flatMap(samplesForRange);
  const source = model.nodes.find((candidate) => candidate.id === node.id);
  const reachable = reverseReachableNodeIds(model);
  const signalIds = new Set(source?.outputPorts.map((port) => port.signalId) ?? []);
  const bindingEc50s = model.nodes
    .filter((candidate) => candidate.receiverResponseBinding !== undefined)
    .filter((candidate) => reachable.has(candidate.id))
    .filter((candidate) => signalIds.has(candidate.receiverResponseBinding?.inputSignalId ?? ''))
    .filter((candidate) =>
      model.edges.some(
        (edge) =>
          edge.enabled &&
          edge.source === node.id &&
          edge.target === candidate.id &&
          edge.signalId === candidate.receiverResponseBinding?.inputSignalId,
      ),
    )
    .map((candidate) => candidate.receiverResponseBinding!.originalParameters.ec50)
    .filter((value): value is number => Number.isFinite(value) && value > 0);
  values.push(...bindingEc50s);
  const range = ranges[0]!;
  const unique = new Map<string, number>();
  for (const value of values) {
    if (
      Number.isFinite(value) &&
      value >= 0 &&
      (value === 0 || (value >= range.min && value <= range.max))
    )
      unique.set(value.toExponential(12), value);
  }
  return [...unique.values()].sort((left, right) => left - right);
}

function isBoundInput(model: NetworkModel, nodeId: string): boolean {
  return rangesForInputNode(model, nodeId).length > 0;
}

/** Classify reverse-design preconditions so an empty result is not ambiguous. */
export function inspectReverseDesign(model: NetworkModel, target: number): ReverseDesignStatus {
  if (!Number.isFinite(target) || target < 0 || target > 1) return 'target-out-of-range';
  const inputNodes = reverseReachableInputNodes(model);
  if (inputNodes.length === 0) return 'no-path';
  try {
    inputNodes.forEach((node) => rangesForInputNode(model, node.id));
  } catch (error) {
    if (error instanceof Error && error.message === 'REVERSE_DESIGN_INPUT_RANGE_CONFLICT')
      return 'range-conflict';
  }
  const reachable = reverseReachableNodeIds(model);
  const responseNodes = model.nodes.filter(
    (node) => node.receiverResponseBinding !== undefined && reachable.has(node.id),
  );
  const forbidden = new Set(['calibration-required', 'reference-only', 'unvalidated', 'experimental']);
  if (
    responseNodes.length > 0 &&
    responseNodes.some(
      (node) =>
        forbidden.has(node.parameters.parameterStatus) ||
        node.inputPorts.some((port) => forbidden.has(port.parameterStatus)) ||
        node.outputPorts.some((port) => forbidden.has(port.parameterStatus)),
    )
  )
    return 'missing-runnable-response';
  return 'ready';
}

function withInputs(model: NetworkModel, inputs: Record<string, number>): NetworkModel {
  return {
    ...model,
    nodes: model.nodes.map((node) => {
      const input = inputs[node.id];
      return node.kind === 'input' && input !== undefined
        ? {
            ...node,
            parameters: {
              ...node.parameters,
              baseline: isBoundInput(model, node.id) ? input : clamp(input),
            },
          }
        : node;
    }),
  };
}

function candidate(
  model: NetworkModel,
  inputs: Record<string, number>,
  target: number,
  index: number,
): ReverseDesignCandidate {
  const result = simulateNetwork(withInputs(model, inputs), {
    now: '2000-01-01T00:00:00.000Z',
  });
  return {
    id: `reverse-candidate-${index}`,
    inputs: { ...inputs },
    outputValue: result.outputValue,
    outputBand: result.outputBand,
    distance: Math.abs(result.outputValue - target),
    isDemo: true,
  };
}

export function solveReverseDesign(
  model: NetworkModel,
  target: number,
  maximumCandidates = 6,
): ReverseDesignCandidate[] {
  const inputNodes = reverseReachableInputNodes(model);
  if (inputNodes.length === 0) return [];
  if (!Number.isFinite(target) || target < 0 || target > 1)
    throw new Error('REVERSE_DESIGN_TARGET_OUT_OF_RANGE');
  if (!Number.isFinite(maximumCandidates) || maximumCandidates < 1)
    throw new Error('REVERSE_DESIGN_MAXIMUM_CANDIDATES_INVALID');
  const boundedTarget = target;
  const current = Object.fromEntries(
    inputNodes.map((node) => [
      node.id,
      (() => {
        if (!isBoundInput(model, node.id)) return clamp(node.parameters.baseline);
        const baseline = Number.isFinite(node.parameters.baseline)
          ? Math.max(0, node.parameters.baseline)
          : 0;
        const range = rangesForInputNode(model, node.id)[0];
        return range !== undefined &&
          (baseline === 0 || baseline >= range.min) &&
          baseline <= range.max
          ? baseline
          : 0;
      })(),
    ]),
  );
  const evaluated: ReverseDesignCandidate[] = [];
  let sequence = 0;

  for (let pass = 0; pass < 3; pass += 1) {
    for (const inputNode of inputNodes) {
      let bestInputs = { ...current };
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const inputValue of reverseInputSamples(model, inputNode)) {
        const inputs = { ...current, [inputNode.id]: inputValue };
        const evaluatedCandidate = candidate(model, inputs, boundedTarget, sequence);
        sequence += 1;
        evaluated.push(evaluatedCandidate);
        if (evaluatedCandidate.distance < bestDistance) {
          bestInputs = inputs;
          bestDistance = evaluatedCandidate.distance;
        }
      }
      Object.assign(current, bestInputs);
    }
  }

  const unique = new Map<string, ReverseDesignCandidate>();
  const ranked: ReverseDesignCandidate[] = evaluated
    .slice()
    .sort((left: ReverseDesignCandidate, right: ReverseDesignCandidate): number => {
      const byDistance = left.distance - right.distance;
      if (byDistance !== 0) return byDistance;
      const leftKey = inputNodes
        .map((node) => (left.inputs[node.id] ?? 0).toExponential(12))
        .join('|');
      const rightKey = inputNodes
        .map((node) => (right.inputs[node.id] ?? 0).toExponential(12))
        .join('|');
      return leftKey.localeCompare(rightKey);
    });
  for (const item of ranked) {
    const key = inputNodes.map((node) => (item.inputs[node.id] ?? 0).toExponential(12)).join('|');
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, Math.max(1, maximumCandidates));
}

export function applyReverseDesignCandidate(
  model: NetworkModel,
  selected: ReverseDesignCandidate,
): NetworkModel {
  const inputNodes = reverseReachableInputNodes(model);
  const reachableInputs: Record<string, number> = {};
  for (const node of inputNodes) {
    const input = selected.inputs[node.id];
    if (input === undefined) throw new Error('REVERSE_DESIGN_INPUT_MISSING');
    if (!isFiniteNonNegative(input)) throw new Error('REVERSE_DESIGN_INPUT_INVALID');
    const ranges = rangesForInputNode(model, node.id);
    const range = ranges[0];
    if (range !== undefined && input !== 0 && (input < range.min || input > range.max))
      throw new Error('REVERSE_DESIGN_INPUT_OUT_OF_RANGE');
    reachableInputs[node.id] = input;
  }
  return withInputs(model, reachableInputs);
}
