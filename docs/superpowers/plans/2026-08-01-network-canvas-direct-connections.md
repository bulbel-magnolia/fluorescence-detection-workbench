# Network Canvas Direct Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the form-based connection workflow with direct port dragging, enforce confirmed node-direction rules, emphasize node creation, and preserve editable, undoable weighted connections.

**Architecture:** Put port capability and connection validity in the pure modeling core, keep pointer-preview state inside `NetworkCanvas`, and commit only validated connections through `ModelingPage.updateModel`. Existing `NetworkModel` schema, templates, persistence, simulation, reverse design, and detection-record links remain unchanged. The existing inspector remains the authoritative editor for selected edges, with an additional inline weight editor on the canvas.

**Tech Stack:** React 19, TypeScript 5.9, inline SVG Pointer Events, i18next, Vitest 4, React Testing Library, CSS, Tauri 2.

**Source design:** `docs/superpowers/specs/2026-08-01-history-network-workbench-design.md`

---

### Task 1: Centralize node-port capabilities and connection validation

**Files:**
- Modify: `src/features/modeling/types.ts`
- Modify: `src/features/modeling/modelingCore.ts`
- Modify: `src/features/modeling/modelingCore.test.ts`

- [ ] **Step 1: Write failing tests for all confirmed port rules**

Extend `modelingCore.test.ts` imports with `getModelConnectionIssue` and `getModelPortCapabilities`, then add:

```ts
it('assigns ports by node kind', () => {
  expect(getModelPortCapabilities('sensor')).toEqual({ input: false, output: true });
  expect(getModelPortCapabilities('reporter')).toEqual({ input: true, output: false });
  expect(getModelPortCapabilities('signal')).toEqual({ input: true, output: true });
  expect(getModelPortCapabilities('response')).toEqual({ input: true, output: true });
  expect(getModelPortCapabilities('memory')).toEqual({ input: true, output: true });
});

it('returns a stable public-facing reason for every invalid route', () => {
  const model = createTemplate('feedback-loop', labels, '2026-08-01T00:00:00.000Z');
  expect(getModelConnectionIssue(model, 'reporter', 'response')).toBe('source-has-no-output');
  expect(getModelConnectionIssue(model, 'response', 'sensor-a')).toBe('target-has-no-input');
  expect(getModelConnectionIssue(model, 'response', 'response')).toBe('self-connection');
  expect(getModelConnectionIssue(model, 'response', 'reporter')).toBe('duplicate-connection');
  expect(getModelConnectionIssue(model, 'missing', 'response')).toBe('missing-source');
  expect(getModelConnectionIssue(model, 'response', 'missing')).toBe('missing-target');
});

it('rejects imported edges that violate node port directions', () => {
  const model = createTemplate('feedback-loop', labels, '2026-08-01T00:00:00.000Z');
  expect(validateNetworkModel({
    ...model,
    edges: [...model.edges, { id: 'edge-invalid', source: 'reporter', target: 'response', weight: 1, enabled: true }],
  })).toBe(false);
});

it('creates a valid process-to-memory connection with the default weight', () => {
  const model = createTemplate('licorice-quality', labels, '2026-08-01T00:00:00.000Z');
  const memory = createModelNode('memory', 'Memory', model.nodes.length);
  const withMemory = { ...model, nodes: [...model.nodes, memory] };
  const connected = connectModelNodes(withMemory, 'integration', memory.id, undefined, 'edge-memory');
  expect(connected.edges.at(-1)).toEqual({ id: 'edge-memory', source: 'integration', target: memory.id, weight: 1, enabled: true });
});
```

- [ ] **Step 2: Run the core test and verify the new API is missing**

Run: `npm test -- src/features/modeling/modelingCore.test.ts`

Expected: FAIL because the port and issue functions are not exported.

- [ ] **Step 3: Define stable connection types**

Add to `src/features/modeling/types.ts`:

```ts
export interface ModelPortCapabilities {
  input: boolean;
  output: boolean;
}

export type ModelConnectionIssue =
  | 'missing-source'
  | 'missing-target'
  | 'source-has-no-output'
  | 'target-has-no-input'
  | 'self-connection'
  | 'duplicate-connection';
```

- [ ] **Step 4: Implement the pure capability and validation functions**

Add to `modelingCore.ts`:

```ts
const MODEL_PORTS: Record<ModelNodeKind, ModelPortCapabilities> = {
  sensor: { input: false, output: true },
  signal: { input: true, output: true },
  response: { input: true, output: true },
  memory: { input: true, output: true },
  reporter: { input: true, output: false },
};

export function getModelPortCapabilities(kind: ModelNodeKind): ModelPortCapabilities {
  return MODEL_PORTS[kind];
}

export function getModelConnectionIssue(
  model: NetworkModel,
  sourceId: string,
  targetId: string,
  ignoredEdgeId?: string,
): ModelConnectionIssue | null {
  const source = model.nodes.find((node) => node.id === sourceId);
  const target = model.nodes.find((node) => node.id === targetId);
  if (!source) return 'missing-source';
  if (!target) return 'missing-target';
  if (!getModelPortCapabilities(source.kind).output) return 'source-has-no-output';
  if (!getModelPortCapabilities(target.kind).input) return 'target-has-no-input';
  if (sourceId === targetId) return 'self-connection';
  if (model.edges.some((edge) => edge.id !== ignoredEdgeId && edge.source === sourceId && edge.target === targetId)) return 'duplicate-connection';
  return null;
}
```

Replace the existing inline checks in `connectModelNodes` with:

```ts
const issue = getModelConnectionIssue(model, source, target);
if (issue) throw new Error(issue);
```

Keep the `[-3, 3]` clamp, default weight `1`, enabled state, immutable update, and schema unchanged.

Update the existing duplicate-route assertion to expect `duplicate-connection`. In `validateNetworkModel`, after the structural node and edge checks, require `getModelConnectionIssue(candidate as NetworkModel, modelEdge.source, modelEdge.target, modelEdge.id) === null` for every imported edge. Passing the current edge ID prevents the edge from identifying itself as a duplicate while still rejecting duplicate routes and invalid port directions.

- [ ] **Step 5: Run modeling core tests**

Run: `npm test -- src/features/modeling/modelingCore.test.ts`

Expected: PASS, including existing template, simulation, record-link, import-validation, and duplicate-route tests.

- [ ] **Step 6: Commit the domain rules**

```powershell
git add src/features/modeling/types.ts src/features/modeling/modelingCore.ts src/features/modeling/modelingCore.test.ts
git commit -m "feat(modeling): enforce node port connection rules"
```

### Task 2: Implement direct port dragging and inline edge editing

**Files:**
- Create: `src/features/modeling/NetworkCanvas.test.tsx`
- Modify: `src/features/modeling/NetworkCanvas.tsx`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/en-US.ts`

- [ ] **Step 1: Write failing canvas interaction tests**

Create `NetworkCanvas.test.tsx`, import `../../i18n`, and build a `signal-gate` model plus an idle `RunNarrative`. Test:

```ts
it('creates a connection by dragging from an output port to an input port', () => {
  renderCanvas();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Create connection from Sensor A' }), { clientX: 180, clientY: 145 });
  const target = screen.getByRole('button', { name: 'Connect to Reporter' });
  fireEvent.pointerEnter(target);
  fireEvent.pointerUp(target, { clientX: 550, clientY: 240 });
  expect(onCreateConnection).toHaveBeenCalledWith('sensor-a', 'reporter');
});

it('does not render impossible ports', () => {
  renderCanvas();
  expect(screen.queryByRole('button', { name: 'Connect to Sensor A' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create connection from Reporter' })).not.toBeInTheDocument();
});

it('edits a selected connection weight inline', async () => {
  const user = userEvent.setup();
  renderCanvas({ selectedEdgeId: 'edge-gate-reporter' });
  await user.dblClick(screen.getByRole('button', { name: 'Edit connection weight 1.00' }));
  const input = screen.getByRole('spinbutton', { name: 'Connection weight' });
  await user.clear(input);
  await user.type(input, '-0.75{Enter}');
  expect(onChangeEdgeWeight).toHaveBeenCalledWith('edge-gate-reporter', -0.75);
});
```

Also assert that a negative edge receives `is-inhibitory`, an ordinary edge receives `is-activating`, and pointer-down on a port does not call `onMoveNode`.

- [ ] **Step 2: Run the canvas tests and verify they fail**

Run: `npm test -- src/features/modeling/NetworkCanvas.test.tsx`

Expected: FAIL because direct-port callbacks and controls do not exist.

- [ ] **Step 3: Extend the canvas callback contract**

Add to `NetworkCanvasProps`:

```ts
onCreateConnection: (sourceId: string, targetId: string) => void;
onChangeEdgeWeight: (edgeId: string, weight: number) => void;
```

Keep selection and node-move callbacks unchanged.

- [ ] **Step 4: Add local pointer-preview and edge-editor state**

Inside `NetworkCanvas`, add:

```ts
interface DraftConnection {
  sourceId: string;
  pointer: { x: number; y: number };
}

const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null);
const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
const [editingWeight, setEditingWeight] = useState('1.00');
```

Create one `canvasPoint(event, svg)` helper that maps client coordinates into the `900 × 500` viewBox. Node dragging and draft-line movement must both use this helper.

- [ ] **Step 5: Render type-aware input and output ports**

For each node, call `getModelPortCapabilities(modelNode.kind)`. Render input and output port groups only when allowed:

```tsx
{ports.input ? (
  <g
    className={inputPortClassName}
    role="button"
    tabIndex={0}
    aria-label={t('modeling.inputPortLabel', { node: modelNode.name })}
    onPointerEnter={() => draftConnection && setHoveredTargetId(modelNode.id)}
    onPointerLeave={() => setHoveredTargetId((current) => current === modelNode.id ? null : current)}
  >
    <circle className="model-port__hit" cx={modelNode.x - nodeWidth / 2} cy={modelNode.y} r="16" />
    <circle className="model-port__dot" cx={modelNode.x - nodeWidth / 2} cy={modelNode.y} r="5" />
  </g>
) : null}
```

The output port uses `modelNode.x + nodeWidth / 2`. Its `onPointerDown` must call `stopPropagation()`, select the node, clear edge selection through the existing page callback, and initialize `draftConnection`. Do not call `setPointerCapture`; input-port enter/leave events must remain available.

While dragging, mark each valid input as `is-valid-target`, the hovered valid target as `is-hovered`, and impossible targets as `is-invalid-target`. Determine validity only through `getModelConnectionIssue(model, sourceId, targetId)`.

- [ ] **Step 6: Commit or cancel on pointer release**

On the root SVG `onPointerUp`, call `onCreateConnection(sourceId, hoveredTargetId)` whenever both IDs exist. The page-level handler performs the authoritative validation, creates valid connections, and shows a specific notice for invalid self or duplicate attempts. Always clear draft and hover state afterward. Pointer cancel, pointer leave, and Escape clear the preview without changing the model.

Render the preview before nodes and after committed edges:

```tsx
{draftConnection && sourceNode ? (
  <path
    className="model-connection-preview"
    d={pointToPointPath(outputPoint(sourceNode), draftConnection.pointer)}
    markerEnd="url(#model-preview-arrow)"
  />
) : null}
```

- [ ] **Step 7: Add activating/inhibitory styles and inline weight editing markup**

Give every edge either `is-activating` or `is-inhibitory`. Use `url(#model-arrow)` for non-negative weights and a new `url(#model-inhibitory)` T-bar marker for negative weights.

Turn the weight-label group into a keyboard-accessible button with `aria-label={t('modeling.editWeightLabel', { weight: modelEdge.weight.toFixed(2) })}`. On double click or Enter, show an SVG `foreignObject` containing:

```tsx
<input
  autoFocus
  aria-label={t('modeling.weight')}
  type="number"
  min="-3"
  max="3"
  step="0.05"
  value={editingWeight}
  onChange={(event) => setEditingWeight(event.target.value)}
  onBlur={commitInlineWeight}
  onKeyDown={(event) => {
    if (event.key === 'Enter') commitInlineWeight();
    if (event.key === 'Escape') setEditingEdgeId(null);
  }}
/>
```

`commitInlineWeight` must reject non-finite input, clamp valid input to `[-3, 3]`, call `onChangeEdgeWeight` exactly once, and close the editor.

- [ ] **Step 8: Add bilingual port and weight labels**

Add under `modeling`:

```ts
inputPortLabel: '连接到 {{node}}',
outputPortLabel: '从 {{node}} 创建连接',
editWeightLabel: '编辑连接权重 {{weight}}',
```

English:

```ts
inputPortLabel: 'Connect to {{node}}',
outputPortLabel: 'Create connection from {{node}}',
editWeightLabel: 'Edit connection weight {{weight}}',
```

- [ ] **Step 9: Run the canvas tests**

Run: `npm test -- src/features/modeling/NetworkCanvas.test.tsx`

Expected: PASS for direct drag, port availability, inline editing, edge semantics, and node-drag separation.

- [ ] **Step 10: Commit the direct canvas interaction**

```powershell
git add src/features/modeling/NetworkCanvas.tsx src/features/modeling/NetworkCanvas.test.tsx src/i18n/locales/zh-CN.ts src/i18n/locales/en-US.ts
git commit -m "feat(modeling): add direct canvas connections"
```

### Task 3: Integrate direct connections, undo, deletion, and the two-row command deck

**Files:**
- Create: `src/pages/ModelingPage.test.tsx`
- Modify: `src/pages/ModelingPage.tsx`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/en-US.ts`

- [ ] **Step 1: Write failing page-level workflow tests**

Create `ModelingPage.test.tsx`. Clear modeling localStorage keys, set Chinese, render the page, and cover:

1. The command deck has two named groups: project operations and node creation.
2. “连接节点” and the source/target connection dock are absent.
3. Clicking “处理” adds a node but does not create an edge automatically.
4. Dragging from a valid output port to the new node input creates an edge with weight `1.00` and selects its inspector.
5. Undo removes that edge; redo restores it.
6. Delete removes the selected edge when focus is outside a form field; Delete inside the weight input does not delete it.
7. An invalid attempt exposes the specific translated reason, not a generic engineering error.

- [ ] **Step 2: Run the page test and verify the current connection dock fails expectations**

Run: `npm test -- src/pages/ModelingPage.test.tsx`

Expected: FAIL because the old mode button/dock exists and the canvas callbacks are missing.

- [ ] **Step 3: Remove obsolete connection-assist state and handlers**

Delete `connectionSource`, `connectionTarget`, `connectionWeight`, `connectionAssistOpen`, `addConnection`, and all setters tied only to the dock. Remove the “连接节点” command and the complete `.modeling-connection-dock` JSX.

In `addNode`, keep immutable node creation, selection, activity, and undo history. Replace its last notice with `modeling.nodeAddedHint`; do not select a source, target, or open another mode.

- [ ] **Step 4: Add one direct-connection commit handler**

Add the issue-to-copy map near other translation maps:

```ts
const connectionIssueKeys: Record<ModelConnectionIssue, string> = {
  'missing-source': 'modeling.connectionErrors.missingSource',
  'missing-target': 'modeling.connectionErrors.missingTarget',
  'source-has-no-output': 'modeling.connectionErrors.sourceHasNoOutput',
  'target-has-no-input': 'modeling.connectionErrors.targetHasNoInput',
  'self-connection': 'modeling.connectionErrors.selfConnection',
  'duplicate-connection': 'modeling.connectionErrors.duplicateConnection',
};
```

Implement:

```ts
const createCanvasConnection = (sourceId: string, targetId: string): void => {
  const issue = getModelConnectionIssue(model, sourceId, targetId);
  if (issue) {
    setNoticeKey(connectionIssueKeys[issue]);
    return;
  }
  const edgeId = `edge-${sourceId}-${targetId}-${Date.now()}`;
  updateModel((current) => connectModelNodes(current, sourceId, targetId, 1, edgeId), {
    kind: 'structure',
    activity: { type: 'edge.linked', subjectId: edgeId },
  });
  setSelectedNodeId(null);
  setSelectedEdgeId(edgeId);
  setNoticeKey('modeling.connectionCreated');
};
```

Pass it as `onCreateConnection`. Pass an `onChangeEdgeWeight` callback that updates one edge through `updateModel`, producing one undoable parameter edit.

- [ ] **Step 5: Extract edge deletion and protect form editing**

Move the inspector's inline deletion body into `removeSelectedEdge()`, preserving activity and undo history. Extend the existing global keyboard listener:

```ts
const target = event.target;
const editingText = target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
if ((event.key === 'Delete' || event.key === 'Backspace') && !editingText) {
  if (selectedEdge) removeSelectedEdge();
  else if (selectedNode) removeSelectedNode();
  return;
}
```

Keep Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+D, Escape narrative skipping, and dialog closing.

- [ ] **Step 6: Replace the single-row toolbar with two explicit rows**

Use this class structure:

```tsx
<section className="panel modeling-command-deck">
  <div className="modeling-command-row modeling-command-row--project" aria-label={t('modeling.projectOperations')}>
    <label className="modeling-template-picker">...</label>
    <div className="modeling-history-tools">...</div>
    <div className="modeling-command-row__spacer" />
    <div className="modeling-file-tools">...</div>
  </div>
  <div className="modeling-command-row modeling-command-row--nodes" aria-label={t('modeling.nodeCreation')}>
    <span className="modeling-command-row__label">{t('modeling.addNode')}</span>
    {nodeKinds.map((kind) => (
      <button className="modeling-node-command" data-kind={kind} key={kind} type="button" onClick={() => addNode(kind)}>
        <Icon name="plus" size={15} />
        {t(`modeling.nodeKinds.${kind}`)}
      </button>
    ))}
  </div>
</section>
```

Keep import input hidden but associated with the import button. Keep template replacement confirmation, import size validation, export, and reset behavior unchanged.

- [ ] **Step 7: Add specific public-facing connection copy**

Chinese:

```ts
projectOperations: '项目操作',
nodeCreation: '添加网络节点',
nodeAddedHint: '节点已添加。可从上游节点右侧端口直接拖出连接。',
dragHint: '拖动节点调整布局；从端口拖出连接',
connectionErrors: {
  missingSource: '起点已不存在，请重新选择节点。',
  missingTarget: '终点已不存在，请重新选择节点。',
  sourceHasNoOutput: '输出节点不能继续向外连接。',
  targetHasNoInput: '传感节点不能接收输入。',
  selfConnection: '节点不能连接到自身。',
  duplicateConnection: '这两个节点已经连接，无需重复添加。',
},
```

English:

```ts
projectOperations: 'Project operations',
nodeCreation: 'Add network nodes',
nodeAddedHint: 'Node added. Drag directly from an upstream output port to connect it.',
dragHint: 'Drag nodes to arrange; drag from a port to connect',
connectionErrors: {
  missingSource: 'The source node is no longer available. Choose it again.',
  missingTarget: 'The target node is no longer available. Choose it again.',
  sourceHasNoOutput: 'Output nodes cannot create outgoing connections.',
  targetHasNoInput: 'Sensor nodes cannot receive incoming connections.',
  selfConnection: 'A node cannot connect to itself.',
  duplicateConnection: 'These nodes are already connected.',
},
```

Remove the now-unused `connectNodes`, `connectionBuilder`, `connectionGuide`, `addConnection`, and `nodeReadyToConnect` keys after `rg` confirms no references remain.

- [ ] **Step 8: Run page and modeling tests**

Run:

```powershell
npm test -- src/pages/ModelingPage.test.tsx src/features/modeling/NetworkCanvas.test.tsx src/features/modeling/modelingCore.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit page integration**

```powershell
git add src/pages/ModelingPage.tsx src/pages/ModelingPage.test.tsx src/i18n/locales/zh-CN.ts src/i18n/locales/en-US.ts
git commit -m "feat(modeling): integrate direct connection workflow"
```

### Task 4: Apply command-deck, port, edge, and readability styling

**Files:**
- Modify: `src/theme/cyber-scientific.css`
- Modify: `src/theme/contrast.test.ts`
- Modify: `docs/modeling.md`

- [ ] **Step 1: Add failing style-contract assertions**

Extend `contrast.test.ts` to assert that `.modeling-node-command` and `.icon-text-button` use `white-space: nowrap`, node names are at least 14 px, node-kind and edge labels are at least 13 px, and dark-theme edge labels remain readable. Add a static assertion that the old `.modeling-connection-dock` selector no longer exists after migration.

- [ ] **Step 2: Run the style test and verify it fails**

Run: `npm test -- src/theme/contrast.test.ts`

Expected: FAIL before the new command-deck and port styles are applied.

- [ ] **Step 3: Replace command-bar and dock styles with the two-row deck**

Remove obsolete `.modeling-commandbar`, `.modeling-commandbar__*`, and `.modeling-connection-dock*` rules after confirming they have no remaining JSX references. Add:

```css
.modeling-command-deck { display: grid; gap: 1px; margin-bottom: 14px; padding: 0; overflow: hidden; }
.modeling-command-row { display: flex; min-width: 0; align-items: center; gap: 9px; padding: 10px 12px; }
.modeling-command-row--project { border-bottom: 1px solid rgb(0 190 220 / 16%); }
.modeling-command-row--nodes { overflow-x: auto; background: linear-gradient(90deg, rgb(0 245 255 / 5%), transparent 60%); }
.modeling-command-row__spacer { flex: 1; }
.modeling-file-tools, .modeling-history-tools { display: flex; flex: 0 0 auto; gap: 7px; }
.modeling-command-row__label { flex: 0 0 auto; color: var(--ink-700); font: 650 13px var(--font-display); white-space: nowrap; }
.modeling-node-command, .icon-text-button { display: inline-flex; min-height: 40px; flex: 0 0 auto; align-items: center; gap: 7px; padding: 0 13px; font-size: 14px; white-space: nowrap; }
.modeling-node-command[data-kind='sensor'] { --command-color: #00f5ff; }
.modeling-node-command[data-kind='signal'] { --command-color: #4b8cff; }
.modeling-node-command[data-kind='response'] { --command-color: #ec5dff; }
.modeling-node-command[data-kind='memory'] { --command-color: #8c6cff; }
.modeling-node-command[data-kind='reporter'] { --command-color: #20e6bd; }
```

Use `--command-color` for border, icon, hover glow, and a narrow bottom accent. Keep text high-contrast and avoid saturated full-button fills.

- [ ] **Step 4: Style ports, previews, and edge semantics**

Add:

```css
.model-port { cursor: crosshair; }
.model-port__hit { fill: transparent; stroke: transparent; }
.model-port__dot { fill: #06131f; stroke: var(--node-color); stroke-width: 1.4; opacity: 0.58; transition: 140ms var(--ease-ui); }
.model-port:hover .model-port__dot, .model-port.is-valid-target .model-port__dot { opacity: 1; filter: drop-shadow(0 0 6px var(--node-color)); }
.model-port.is-hovered .model-port__dot { r: 7px; fill: color-mix(in srgb, var(--node-color) 35%, #06131f); }
.model-port.is-invalid-target { cursor: not-allowed; opacity: 0.3; }
.model-connection-preview { fill: none; stroke: #00f5ff; stroke-width: 2; stroke-dasharray: 7 5; filter: drop-shadow(0 0 7px rgb(0 245 255 / 55%)); pointer-events: none; }
.model-edge.is-activating .model-edge__line { stroke: #3f8194; }
.model-edge.is-inhibitory .model-edge__line { stroke: #b55bd1; stroke-dasharray: 7 4; }
.model-edge.is-selected .model-edge__line { animation: selected-edge-flow 900ms linear infinite; }
.model-edge__weight-editor input { width: 76px; height: 30px; color: var(--ink-900); background: #06131f; border: 1px solid var(--teal-500); text-align: center; }
@keyframes selected-edge-flow { to { stroke-dashoffset: -24; } }
```

The existing reduced-motion block must disable the selected-edge animation and leave a static selected stroke. Set edge labels, node-kind labels, stage statistics, and supporting canvas text to at least 13 px. Set node names to at least 14 px and keep them high contrast.

- [ ] **Step 5: Add deliberate responsive behavior**

At widths below 1280 px, keep each command group intact: allow horizontal scrolling on both command rows, retain full labels, and never set button `font-size: 0`. Remove the old media rule that hides undo/redo text. At widths below 1080 px, keep the existing stage/inspector stacking.

- [ ] **Step 6: Update the modeling documentation**

In `docs/modeling.md`:

- Replace all statements about opening a connection work bar.
- Document always-available ports and the confirmed node-type port table.
- Document direct drag, default weight `1.00`, inspector and inline weight editing.
- Document activating arrows, inhibitory T-bars, invalid-route messages, and undo/redo.
- Keep the reference-only detection-link and illustrative-model boundaries unchanged.

- [ ] **Step 7: Run focused style and interaction checks**

Run:

```powershell
npm test -- src/theme/contrast.test.ts src/features/modeling/NetworkCanvas.test.tsx src/pages/ModelingPage.test.tsx
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit styling and documentation**

```powershell
git add src/theme/cyber-scientific.css src/theme/contrast.test.ts docs/modeling.md
git commit -m "style(modeling): emphasize direct network editing"
```

### Task 5: Run regression, build, and manual desktop validation

**Files:**
- Modify: `docs/testing.md`

- [ ] **Step 1: Document the direct-connection test matrix**

Add to `docs/testing.md`: node-kind ports, valid drag, cancelled drag, invalid route reasons, default weight, inline edit, positive/negative semantics, inspector edit, deletion, keyboard protection, undo/redo, bilingual labels, narrow-width command scrolling, and reduced motion.

- [ ] **Step 2: Run all automated checks**

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Expected: every command exits 0; history, BLE, import, persistence, reverse-design, motion, localization, and simulation tests remain green.

- [ ] **Step 3: Build the Windows desktop application**

Run: `npm run tauri -- build`

Expected: exit 0 and produce the Windows installer/bundle. If a local Rust or Windows packaging dependency blocks the build, preserve the exact error and report the remaining check without changing code to hide it.

- [ ] **Step 4: Perform the complete manual workflow**

In both Chinese and English:

1. Load every template and confirm existing edges remain valid.
2. Add each of the five node kinds and verify its visible ports.
3. Drag a valid connection without entering a mode.
4. Cancel a drag on empty canvas.
5. Attempt self and duplicate connections and verify specific messages; verify that output nodes have no output port and sensor nodes have no input port.
6. Edit weight in the inspector and by double-clicking the canvas label.
7. Set a negative weight and verify inhibitory color plus T-bar shape.
8. Delete and restore nodes and edges through undo/redo.
9. Run simulation, reverse design, Use this design, record linking, import, export, and saved-run restoration to confirm no regression.
10. Narrow the window and verify all command text remains intact.
11. Enable reduced motion and verify glows remain informative without flowing animation.

- [ ] **Step 5: Commit the testing documentation**

```powershell
git add docs/testing.md
git commit -m "docs(testing): cover direct network editing"
```
