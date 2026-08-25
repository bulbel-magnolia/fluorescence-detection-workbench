import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import {
  BFN_EDITOR_HISTORY_LIMIT,
  createBfnEditorHistory,
  createBfnEditorSnapshot,
  recordBfnEditorSnapshot,
  redoBfnEditorHistory,
  undoBfnEditorHistory,
} from './editorHistory';

describe('BFN editor history', () => {
  it('round-trips semantic edits through undo and redo with selection', () => {
    const initial = createDemoBfnProject();
    const changed = {
      ...initial,
      network: { ...initial.network, mode: 'dynamic' as const },
    };
    const before = createBfnEditorSnapshot(initial, 'module-ahl-sensor', null);
    const after = createBfnEditorSnapshot(changed, null, 'edge-source-sensor');
    const recorded = recordBfnEditorSnapshot(createBfnEditorHistory(), before, 'semantic');

    const undone = undoBfnEditorHistory(recorded, after);
    expect(undone?.snapshot.project.network.mode).toBe('static');
    expect(undone?.snapshot.selectedNodeId).toBe('module-ahl-sensor');
    expect(undone?.kind).toBe('semantic');

    const redone = undone ? redoBfnEditorHistory(undone.history, undone.snapshot) : null;
    expect(redone?.snapshot.project.network.mode).toBe('dynamic');
    expect(redone?.snapshot.selectedEdgeId).toBe('edge-source-sensor');
  });

  it('limits stored edits and clears redo after a new edit', () => {
    const project = createDemoBfnProject();
    let history = createBfnEditorHistory();
    for (let index = 0; index < BFN_EDITOR_HISTORY_LIMIT + 8; index += 1) {
      history = recordBfnEditorSnapshot(
        history,
        createBfnEditorSnapshot({ ...project, updatedAt: `${index}` }, null, null),
        'layout',
      );
    }
    expect(history.past).toHaveLength(BFN_EDITOR_HISTORY_LIMIT);

    const undone = undoBfnEditorHistory(history, createBfnEditorSnapshot(project, null, null));
    expect(undone?.history.future).toHaveLength(1);
    const recorded = recordBfnEditorSnapshot(
      undone?.history ?? history,
      createBfnEditorSnapshot(project, null, null),
      'semantic',
    );
    expect(recorded.future).toHaveLength(0);
  });
});
