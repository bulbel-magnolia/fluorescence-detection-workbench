import type { NetworkModel } from './types';

export type NarrativeMode = 'full' | 'rerun';
export type NarrativeChapter = 'establish' | 'prepare' | 'signal' | 'readout' | 'complete';

export interface NarrativePlanItem {
  id: string;
  start: number;
  end: number;
}

export interface NarrativePlan {
  duration: number;
  mode: NarrativeMode;
  reducedMotion: boolean;
  chapters: Array<NarrativePlanItem & { id: NarrativeChapter }>;
  edges: Array<NarrativePlanItem & { source: string; target: string }>;
  nodes: NarrativePlanItem[];
}

export interface NarrativeState {
  status: 'running' | 'complete';
  chapter: NarrativeChapter;
  activeEdgeId: string | null;
  edgeProgress: number;
  resonantNodeId: string | null;
  revealProgress: number;
  complete: boolean;
}

export const narrativeDurations = Object.freeze({
  full: 9_000,
  rerun: 3_500,
  reduced: 900,
});

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function orderedEdges(model: NetworkModel) {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  return model.edges
    .filter((edge) => edge.enabled)
    .slice()
    .sort((left, right) => {
      const leftSource = nodeById.get(left.source);
      const rightSource = nodeById.get(right.source);
      const leftTarget = nodeById.get(left.target);
      const rightTarget = nodeById.get(right.target);
      return (
        (leftSource?.x ?? 0) - (rightSource?.x ?? 0) ||
        (leftTarget?.x ?? 0) - (rightTarget?.x ?? 0) ||
        left.id.localeCompare(right.id)
      );
    });
}

export function buildNarrativePlan(
  model: NetworkModel,
  mode: NarrativeMode,
  reducedMotion: boolean,
): NarrativePlan {
  const duration = reducedMotion ? narrativeDurations.reduced : narrativeDurations[mode];
  const chapters: NarrativePlan['chapters'] = [
    { id: 'establish', start: 0, end: duration * 0.16 },
    { id: 'prepare', start: duration * 0.16, end: duration * 0.28 },
    { id: 'signal', start: duration * 0.28, end: duration * 0.68 },
    { id: 'readout', start: duration * 0.68, end: duration * 0.88 },
    { id: 'complete', start: duration * 0.88, end: duration },
  ];
  const source = orderedEdges(model);
  const signalStart = duration * 0.28;
  const signalSpan = duration * 0.4;
  const edgeDuration = source.length > 0 ? signalSpan / source.length : signalSpan;
  const edges = source.map((edge, index) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    start: signalStart + edgeDuration * index,
    end: signalStart + edgeDuration * (index + 1),
  }));
  const nodes = edges.map((edge) => ({
    id: edge.target,
    start: edge.end,
    end: Math.min(duration, edge.end + Math.min(420, duration * 0.08)),
  }));

  return { duration, mode, reducedMotion, chapters, edges, nodes };
}

export function sampleNarrative(plan: NarrativePlan, elapsed: number): NarrativeState {
  const time = Math.max(0, Math.min(plan.duration, elapsed));
  const chapter =
    plan.chapters.find((item) => time >= item.start && time < item.end) ?? plan.chapters.at(-1);
  if (!chapter) {
    throw new Error('Narrative plan must contain at least one chapter.');
  }
  const edge = plan.edges.find((item) => time >= item.start && time < item.end);
  const node = plan.nodes.find((item) => time >= item.start && time < item.end);
  const revealStart = plan.duration * 0.68;
  const revealEnd = plan.duration * 0.88;
  const complete = time >= plan.duration;

  return {
    status: complete ? 'complete' : 'running',
    chapter: chapter.id,
    activeEdgeId: edge?.id ?? null,
    edgeProgress: edge ? clamp01((time - edge.start) / (edge.end - edge.start)) : 0,
    resonantNodeId: node?.id ?? null,
    revealProgress: clamp01((time - revealStart) / (revealEnd - revealStart)),
    complete,
  };
}
