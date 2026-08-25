# Scientific Desktop Visual Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Windows fluorescence workbench from a card-heavy Web dashboard into a flat, neutral, data-first scientific desktop interface without changing BFN behavior or scientific logic.

**Architecture:** Keep the existing React structure and functional state intact. Establish canonical semantic tokens, add one intentional application-wide desktop theme layer, and replace the monolithic BFN stylesheet with focused workbench, canvas, inspector, and results styles. Introduce one accessible property-grid component so parameter explanations remain available on focus, hover, and selection without occupying the permanent primary layer.

**Tech Stack:** React 19, TypeScript 5.9, CSS custom properties, i18next, Vitest, React Testing Library, Vite.

---

### Task 1: Lock the semantic visual contract with tests

**Files:**

- Create: `src/pages/ModelingPage.batch35.test.tsx`
- Modify: `src/features/bfn/bfn-platform.styles.test.ts`

- [ ] **Step 1: Add the Batch 3.5 structural tests**

Cover the visible contract with React Testing Library: the modeling page has no duplicate global top bar; Undo/Redo live in the run toolbar; the inspector exposes `.bfn-property-grid` rows and a focused explanation; mathematical-model disclosure still opens; the module drawer contains list rows and remains actionable; direct-connection handles, result dock, navigation groups, and both locales remain available.

```tsx
const inspector = screen.getByRole('heading', { name: 'AHL 响应' }).closest('aside');
expect(inspector?.querySelectorAll('.bfn-property-row')).toHaveLength(4);
expect(within(inspector!).getByRole('note')).toHaveTextContent('基础启动子活性');
expect(document.querySelector('.top-bar')).not.toBeInTheDocument();
```

- [ ] **Step 2: Replace the legacy CSS-substring assertions with semantic checks**

Read `tokens.css`, `scientific-desktop.css`, and the four BFN CSS modules. Assert the required `--ui-*` tokens exist, BFN component styles contain no 8px/9px text, selection uses `--ui-accent`, compatible ports use `--ui-success`, signal curves use `--ui-signal`, canvas has a major/minor grid, and ordinary panes/nodes do not use shadows.

```ts
expect(tokens).toContain('--ui-bg-pane');
expect(canvasCss).toMatch(/data-selected='true'[\s\S]*var\(--ui-accent\)/);
expect(canvasCss).toMatch(/data-connection-state='compatible'[\s\S]*var\(--ui-success\)/);
expect(allBfnCss).not.toMatch(/font-size:\s*(8|9)px/);
```

- [ ] **Step 3: Run the focused tests and confirm they fail for the pre-refactor DOM/CSS**

Run: `npm test -- src/pages/ModelingPage.batch35.test.tsx src/features/bfn/bfn-platform.styles.test.ts`

Expected: FAIL because the property grid, split CSS files, desktop theme layer, and toolbar structure do not yet exist.

### Task 2: Establish canonical tokens and shared desktop controls

**Files:**

- Modify: `src/theme/tokens.css`
- Create: `src/theme/scientific-desktop.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Define light and dark semantic tokens**

Add the required background, border, text, accent, status, signal, radius, divider, focus, control-height, and floating-shadow variables. Map legacy aliases such as `--paper`, `--surface`, `--ink-*`, `--teal-*`, and `--shadow-panel` to the semantic values so untouched pages inherit the new language.

```css
:root {
  --ui-bg-app: #edf1f3;
  --ui-bg-pane: #f9fafb;
  --ui-bg-canvas: #f3f6f7;
  --ui-accent: #176b82;
  --ui-success: #357a59;
  --ui-warning: #9a6819;
  --ui-error: #b34b52;
  --ui-signal: #bc3f73;
  --ui-radius-sm: 4px;
  --ui-radius-md: 7px;
  --ui-divider: 1px solid var(--ui-border-subtle);
}
```

- [ ] **Step 2: Add the application-wide scientific desktop theme layer**

Override only shared presentation primitives: neutral app surface, compact navigation and brand, flat top bar, 18–22px page titles, divider-based panels, 30–32px controls, low-radius fields/buttons, status semantics, and floating-only shadows for dialogs. Remove hover translation, background grids, glows, clip paths, and decorative gradients from shared elements.

- [ ] **Step 3: Import tokens after the legacy theme and import the desktop layer last**

```ts
import './theme/global.css';
import './theme/cyber-scientific.css';
import './theme/tokens.css';
import './theme/scientific-desktop.css';
```

- [ ] **Step 4: Run component and shell tests**

Run: `npm test -- src/components/ScientificUi.test.tsx src/app/App.test.tsx src/theme/contrast.test.ts`

Expected: PASS.

### Task 3: Convert the BFN shell and toolbar to panes and desktop toolbars

**Files:**

- Replace: `src/features/bfn/bfn-platform.css` with an import-only aggregator
- Create: `src/features/bfn/bfn-workbench.css`
- Modify: `src/features/bfn/BfnPlatformPage.tsx`
- Modify: `src/features/bfn/BfnProjectToolbar.tsx`

- [ ] **Step 1: Create the focused BFN style modules**

Use `bfn-platform.css` only to import `bfn-workbench.css`, `bfn-canvas.css`, `bfn-inspector.css`, and `bfn-results.css`. The workbench module owns the fixed page frame, project toolbar, run toolbar, pane dividers, network index, drawer, inverse layout, and responsive behavior.

```css
.bfn-network-workspace {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  grid-template-columns: 184px minmax(0, 1fr) 292px;
  background: var(--ui-bg-pane);
  border: var(--ui-divider);
  border-radius: var(--ui-radius-xs);
}
```

- [ ] **Step 2: Move Undo/Redo into the second-row run toolbar**

Render `BfnEditorToolbar` before the mode switch and add visual separators through CSS. Keep the same callbacks, disabled state, keyboard shortcuts, and history semantics. Leave the stage header with the network title and compact counts.

- [ ] **Step 3: Flatten navigation index, toolbar groups, drawers, and inverse panes**

Use section headings and row dividers instead of cards. Keep Drawer and ConfirmDialog as the only elevated surfaces. At 1280×720 retain three workbench panes with a narrower index and inspector; use owned scrolling rather than moving the inspector below the canvas.

- [ ] **Step 4: Run Batch 2 and Batch 3 regression tests**

Run: `npm test -- src/pages/ModelingPage.batch2.test.tsx src/pages/ModelingPage.batch3.test.tsx`

Expected: PASS.

### Task 4: Rebuild the inspector as an accessible property inspector

**Files:**

- Create: `src/features/bfn/BfnPropertyGrid.tsx`
- Create: `src/features/bfn/bfn-inspector.css`
- Modify: `src/features/bfn/BfnPlatformPage.tsx`

- [ ] **Step 1: Add the reusable property-grid component**

Render stable label/value columns with tabular numerals and a separate subdued unit. Parameter labels are buttons that update an explanation region on hover, focus, or click. The active row uses an accent line; the explanation uses `role="note"` and remains connected through `aria-controls` and `aria-expanded`.

```tsx
<button aria-controls={descriptionId} aria-expanded={activeId === row.id}>
  <span>{row.label}</span>
  {row.symbol ? <small>{row.symbol}</small> : null}
</button>
<dd><strong>{row.value}</strong>{row.unit ? <span>{row.unit}</span> : null}</dd>
```

- [ ] **Step 2: Convert key parameters to the property grid**

Pass the first four `bfnParameterPresentations` as rows. Preserve every description in the on-demand explanation and keep remaining parameters in the existing “Detailed parameters” disclosure using the same row language.

- [ ] **Step 3: Convert input, output, connection, context, and model data to property-panel language**

Add an inspector subtitle for the selected object flow. Use aligned rows for signal type, unit, analysis mode, context values, and model values. Keep “Experiment and data”, “Mathematical model”, and “Advanced information” as border-separated disclosures without card backgrounds.

- [ ] **Step 4: Run inspector and localization tests**

Run: `npm test -- src/pages/ModelingPage.test.tsx src/pages/ModelingPage.batch3.test.tsx src/i18n/bfn-locales.test.ts`

Expected: PASS after updating tests that previously expected every parameter description to be permanently visible.

### Task 5: Rebuild the canvas as an engineering diagram surface

**Files:**

- Create: `src/features/bfn/bfn-canvas.css`
- Modify: `src/features/bfn/BfnNetworkCanvas.tsx`

- [ ] **Step 1: Implement a low-interference major/minor engineering grid**

Use 20px minor lines and 100px major lines. Remove the dot layer, inset shadow, backdrop blur, and decorative principle card.

- [ ] **Step 2: Flatten nodes and separate visual semantics**

Use 1px neutral borders, a 3px type strip, 4px radius, no shadow, and no hover movement. Selected nodes use a 2px `--ui-accent` border and subtle selection background; keyboard focus uses a separate outline.

- [ ] **Step 3: Make ports and edge previews engineering-oriented**

Keep ports compact. Drag source uses accent, compatible targets and preview use success, incompatible targets are muted until hovered, and errors use error red. Add a compatible preview marker so the arrowhead matches the preview line without glow.

- [ ] **Step 4: Run direct-manipulation tests**

Run: `npm test -- src/features/bfn/BfnNetworkCanvas.test.tsx src/pages/ModelingPage.batch2.test.tsx`

Expected: PASS.

### Task 6: Flatten results, module list, and inverse-design candidates

**Files:**

- Create: `src/features/bfn/bfn-results.css`
- Modify: `src/features/bfn/BfnPlatformPage.tsx`
- Modify: `src/features/bfn/BfnResponseChart.tsx`

- [ ] **Step 1: Convert the result panel into a dock**

Use a straight header divider, borderless compact status, and a chart/metrics data layout. Keep stale/current logic and expand/collapse behavior unchanged.

- [ ] **Step 2: Restyle the plot as a scientific chart**

Use a flat plot area, clear axes, weak grid, tabular tick labels, magenta signal, muted uncertainty band, and no decorative orbit or shadow.

- [ ] **Step 3: Convert the module drawer to list rows**

Remove the decorative curve preview from each catalog item. Keep name, flow, description, model basis, linked data, and Add action in a compact row with dividers.

- [ ] **Step 4: Convert inverse-design candidates to ranked data rows**

Preserve candidate algorithms and data. Emphasize rank, design variables, scores, total loss, and validation recommendation with aligned columns and minimal highlighting.

- [ ] **Step 5: Run result, drawer, inverse-design, and full modeling tests**

Run: `npm test -- src/pages/ModelingPage.test.tsx src/pages/ModelingPage.batch35.test.tsx`

Expected: PASS.

### Task 7: Validate, document, and capture visual evidence

**Files:**

- Modify: `docs/modeling.md`
- Modify: `docs/testing.md`
- Create: `docs/ui-audit/scientific-desktop/README.md`
- Create: `docs/ui-audit/scientific-desktop/01-network-workbench-light-1440x900.png`
- Create: `docs/ui-audit/scientific-desktop/02-network-node-selected-1440x900.png`
- Create: `docs/ui-audit/scientific-desktop/03-inspector-properties-1440x900.png`
- Create: `docs/ui-audit/scientific-desktop/04-connection-drag-1440x900.png`
- Create: `docs/ui-audit/scientific-desktop/05-results-dock-1440x900.png`
- Create: `docs/ui-audit/scientific-desktop/06-add-module-drawer-1440x900.png`
- Create: `docs/ui-audit/scientific-desktop/07-inverse-design-1440x900.png`
- Create: `docs/ui-audit/scientific-desktop/08-navigation-1440x900.png`
- Create: `docs/ui-audit/scientific-desktop/09-dark-mode-1440x900.png`

- [ ] **Step 1: Format and run all required gates**

Run: `npm run format -- <modified text files>`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm test`

Run: `npm run build`

Expected: all commands exit 0; the known Vite large-chunk advisory may remain informational.

- [ ] **Step 2: Capture the nine required 1440×900 screenshots**

Start the local Vite server, use browser automation to exercise selection, parameter focus, connection drag, analysis run, drawer, inverse design, navigation, and dark theme, then save the exact required filenames.

- [ ] **Step 3: Audit 1280×720**

At 1280×720 verify no full-page horizontal scrolling, readable body text, compact toolbar, independently scrollable inspector, usable canvas/result dock/drawer, and capture an additional diagnostic screenshot only if it documents a correction.

- [ ] **Step 4: Review and commit**

Run: `git diff --check`

Run: `git status --short`

Stage only reviewed source, tests, docs, and screenshots. Commit with:

```text
feat(ui): adopt scientific desktop visual language
```

Then push `codex/bfn-scientific-desktop` without force.
