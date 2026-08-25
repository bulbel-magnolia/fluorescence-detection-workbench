import type { BfnProject } from './types';

export type BfnEditorChangeKind = 'semantic' | 'layout';

export interface BfnEditorSnapshot {
  project: BfnProject;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
}

export interface BfnEditorHistoryEntry {
  snapshot: BfnEditorSnapshot;
  kind: BfnEditorChangeKind;
}

export interface BfnEditorHistory {
  past: BfnEditorHistoryEntry[];
  future: BfnEditorHistoryEntry[];
}

export interface BfnEditorHistoryTransition {
  history: BfnEditorHistory;
  snapshot: BfnEditorSnapshot;
  kind: BfnEditorChangeKind;
}

export const BFN_EDITOR_HISTORY_LIMIT = 75;

export function createBfnEditorHistory(): BfnEditorHistory {
  return { past: [], future: [] };
}

export function createBfnEditorSnapshot(
  project: BfnProject,
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
): BfnEditorSnapshot {
  return {
    project: structuredClone(project),
    selectedNodeId,
    selectedEdgeId,
  };
}

export function recordBfnEditorSnapshot(
  history: BfnEditorHistory,
  snapshot: BfnEditorSnapshot,
  kind: BfnEditorChangeKind,
): BfnEditorHistory {
  return {
    past: [...history.past, { snapshot: structuredClone(snapshot), kind }].slice(
      -BFN_EDITOR_HISTORY_LIMIT,
    ),
    future: [],
  };
}

export function undoBfnEditorHistory(
  history: BfnEditorHistory,
  currentSnapshot: BfnEditorSnapshot,
): BfnEditorHistoryTransition | null {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [
        ...history.future,
        { snapshot: structuredClone(currentSnapshot), kind: previous.kind },
      ].slice(-BFN_EDITOR_HISTORY_LIMIT),
    },
    snapshot: structuredClone(previous.snapshot),
    kind: previous.kind,
  };
}

export function redoBfnEditorHistory(
  history: BfnEditorHistory,
  currentSnapshot: BfnEditorSnapshot,
): BfnEditorHistoryTransition | null {
  const next = history.future.at(-1);
  if (!next) return null;
  return {
    history: {
      past: [
        ...history.past,
        { snapshot: structuredClone(currentSnapshot), kind: next.kind },
      ].slice(-BFN_EDITOR_HISTORY_LIMIT),
      future: history.future.slice(0, -1),
    },
    snapshot: structuredClone(next.snapshot),
    kind: next.kind,
  };
}

export function areBfnProjectsEquivalent(left: BfnProject, right: BfnProject): boolean {
  return JSON.stringify({ ...left, updatedAt: '' }) === JSON.stringify({ ...right, updatedAt: '' });
}
