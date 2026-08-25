# Scientific Results & Figure Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the BFN Result Dock into a scientific result workspace with exact nearest-point reading, independent axis/series view state, publication export, provenance, and one compatible historical-run comparison.

**Architecture:** Keep simulation results and `BfnProject` immutable from all figure interactions. A pure chart-math/model layer resolves visible series, domains, scales, ticks, paths, labels, and nearest real points; both the interactive SVG and standalone export SVG consume that model. `BfnResultWorkspace` owns ephemeral chart/comparison state and receives project/result/runs as read-only props, so hover, axes, series, export, and comparison never enter editor history, autosave, freshness, or the computation signature.

**Tech Stack:** React 19, TypeScript 5.9 strict mode, SVG, browser Canvas/Clipboard APIs with feature detection, i18next, Vitest, React Testing Library, Vite 7. No chart library or server dependency.

**Baseline:** `codex/bfn-scientific-results` at `a2c15e6`; typecheck and lint passed, three post-fix full Vitest runs passed at 67 files / 370 tests, and the production build passed before Batch 4.

---

### Task 1: Build the pure chart math and shared figure model

**Files:**

- Create: `src/features/bfn/chartTypes.ts`
- Create: `src/features/bfn/chartMath.ts`
- Create: `src/features/bfn/chartModel.ts`
- Create: `src/features/bfn/chartMath.test.ts`
- Create: `src/features/bfn/chartModel.test.ts`

- [ ] **Step 1: Write failing scale, inverse, nearest-point, domain, tick, and log-eligibility tests**

Cover linear and log10 round trips; binary-search nearest-point selection without interpolation; manual `min < max`; positive log ranges; 4–7 useful linear major ticks; power-of-ten log ticks; normalized 0–1 linear Y defaults; hidden uncertainty no longer blocking log Y; visible ANN and comparison participation in auto extents; and manual X domains excluding non-positive points.

```ts
expect(createScale([1, 100], [0, 200], 'log').map(10)).toBeCloseTo(100);
expect(createScale([1, 100], [0, 200], 'log').invert(100)).toBeCloseTo(10);
expect(nearestPointIndex([{ coordinate: 1 }, { coordinate: 4 }, { coordinate: 10 }], 7.8)).toBe(2);
expect(validateManualDomain({ minimum: 2, maximum: 1 }, 'linear')).toEqual({
  valid: false,
  reason: 'minimum_not_less_than_maximum',
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```powershell
npm test -- src/features/bfn/chartMath.test.ts src/features/bfn/chartModel.test.ts
```

Expected: FAIL because the chart modules do not exist.

- [ ] **Step 3: Define view and figure contracts**

`chartTypes.ts` owns only result-view types:

```ts
export type BfnChartScale = 'linear' | 'log';
export type BfnChartDomainMode = 'auto' | 'manual';
export interface BfnChartViewState {
  xScale: BfnChartScale;
  yScale: BfnChartScale;
  xDomainMode: BfnChartDomainMode;
  yDomainMode: BfnChartDomainMode;
  xMinimum?: number;
  xMaximum?: number;
  yMinimum?: number;
  yMaximum?: number;
  showFullModel: boolean;
  showUncertainty: boolean;
  showAnn: boolean;
  cursorIndex: number | null;
}
export interface BfnChartComparison {
  result: BfnSimulationResult;
  label: string;
}
```

Export `defaultBfnChartViewState(result)`, `BfnChartLabels`, `BfnChartModel`, `BfnChartSeries`, `BfnChartTick`, `BfnChartGeometry`, and discriminated validation results. Do not add any field to `BfnProject` or `BfnSimulationResult`.

- [ ] **Step 4: Implement pure math**

`chartMath.ts` exports:

```ts
createScale(domain, range, scale);
nearestPointIndex(points, coordinate);
validateManualDomain(domain, scale);
linearNiceTicks(domain, targetCount);
logMajorTicks(domain);
filterPointsInDomain(points, domain);
visibleYValues(result, visibility, comparison);
resolveAutoDomain(values, options);
evaluateLogEligibility(axis, activeDomain, result, visibility, comparison);
```

Reject non-positive log values explicitly; never clamp, `abs`, substitute epsilon, or interpolate. Only visible series inside the active X domain influence Y eligibility and automatic Y domains.

- [ ] **Step 5: Implement the shared figure model**

`createBfnChartModel({ project, result, comparison, viewState, geometry, translate })` resolves labels from the current input source/output monitor, active domains, scale functions, ticks, uncertainty/full/ANN/comparison paths, warning reasons, and cursor positions. Static X labels use entity plus unit; dynamic X is time in hours; unresolved historical IDs fall back to IDs or “Input”/“Output”.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run the same two files. Expected: PASS.

- [ ] **Step 7: Commit the pure chart foundation**

```powershell
git add src/features/bfn/chartTypes.ts src/features/bfn/chartMath.ts src/features/bfn/chartModel.ts src/features/bfn/chartMath.test.ts src/features/bfn/chartModel.test.ts
git commit -m "feat(bfn): add scientific chart model"
```

### Task 2: Deliver Phase 4.1 exact reading, axes, and series controls

**Files:**

- Create: `src/features/bfn/BfnChartControls.tsx`
- Create: `src/features/bfn/BfnChartTooltip.tsx`
- Create: `src/features/bfn/BfnResultWorkspace.tsx`
- Create: `src/features/bfn/BfnResponseChart.test.tsx`
- Create: `src/pages/ModelingPage.batch4.test.tsx`
- Modify: `src/features/bfn/BfnResponseChart.tsx`
- Modify: `src/features/bfn/BfnPlatformPage.tsx`
- Modify: `src/features/bfn/bfn-results.css`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`

- [ ] **Step 1: Write failing chart interaction tests**

Render real simulation results from `createDemoBfnProject` and assert pointer position selects the nearest actual point, keyboard `ArrowLeft`/`ArrowRight`/`Home`/`End` navigates real indices, `Escape` clears, extrapolated points warn, dynamic tooltips show time and every input, and ANN values appear only while visible. Assert displayed coordinates equal stored point coordinates even when the pointer is between them.

- [ ] **Step 2: Write failing controls and isolation tests**

Assert full/uncertainty/ANN use `aria-pressed`; the final visible Y series cannot be hidden; invalid log displays a specific inline reason; valid log and manual ranges update ticks; invalid manual ranges are not applied; Reset restores auto/linear/default visibility without changing comparison. At page level, snapshot project JSON, Undo disabled state, current/stale label, and `localStorage.setItem` count before/after series, axis, cursor, and Reset interactions.

- [ ] **Step 3: Run the new tests and confirm RED**

```powershell
npm test -- src/features/bfn/BfnResponseChart.test.tsx src/pages/ModelingPage.batch4.test.tsx
```

Expected: FAIL because the controls/workspace do not exist.

- [ ] **Step 4: Implement the stateless interactive chart**

`BfnResponseChart` receives `model`, `result`, optional comparison, cursor index, and `onCursorIndexChange`. The plot SVG has `tabIndex={0}`; pointer coordinates are inverse-mapped then passed through binary search; state changes only when the nearest index changes. Handle chart navigation keys with `preventDefault` and `stopPropagation`, while leaving Ctrl/Cmd+Z to existing editor rules. Render crosshair, marker, and tooltip only on screen.

- [ ] **Step 5: Implement compact chart controls**

`BfnChartControls` renders scientific toolbar controls for Full model, uncertainty, and ANN; X/Y Linear/Log10; an inline `<details>` axis panel with Auto/Manual and Min/Max; validation feedback; and Reset View. Keep at least one Y line visible, omit ANN when absent, and show manual-mode state visibly.

- [ ] **Step 6: Extract the Result Dock workspace**

Move result-only rendering from `BfnPlatformPage.tsx` into `BfnResultWorkspace`. It owns `BfnChartViewState` and resets only cursor/availability-dependent defaults when the displayed result changes. Props are read-only project/result/runs/freshness values plus existing callbacks; it never receives `setProject`, `performProjectEdit`, editor history, or autosave functions.

- [ ] **Step 7: Add bilingual labels and restrained scientific styling**

Add semantic Chinese/English keys for computed point, axis modes, manual errors, series controls, tooltip fields, log rejection, reset, and chart focus instructions. Extend the existing continuous pane visual language; no dashboard cards, global toolbar changes, large animation, or 8 px text. Ensure the toolbar wraps or compacts at 1280 px without document horizontal overflow.

- [ ] **Step 8: Run Phase 4.1 gate**

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all commands pass before Task 3 starts.

- [ ] **Step 9: Commit Phase 4.1**

```powershell
git add src/features/bfn/BfnChartControls.tsx src/features/bfn/BfnChartTooltip.tsx src/features/bfn/BfnResultWorkspace.tsx src/features/bfn/BfnResponseChart.tsx src/features/bfn/BfnResponseChart.test.tsx src/features/bfn/BfnPlatformPage.tsx src/features/bfn/bfn-results.css src/i18n/locales/bfn-zh-CN.ts src/i18n/locales/bfn-en-US.ts src/pages/ModelingPage.batch4.test.tsx
git commit -m "feat(bfn): add precise scientific chart reading"
```

### Task 3: Build Phase 4.2 publication export primitives

**Files:**

- Create: `src/features/bfn/chartExport.ts`
- Create: `src/features/bfn/chartExport.test.ts`
- Create: `src/features/bfn/chartClipboard.ts`
- Create: `src/features/bfn/chartClipboard.test.ts`

- [ ] **Step 1: Write failing vector, data, filename, caption, PNG, and clipboard tests**

Require SVG `<path>`, text ticks, `<title>`, `<desc>`, white background, inline styles, current axes/visibility/comparison, and no crosshair/tooltip/image embedding. Require CSV BOM, stable project input/module columns, tidy `run_role` rows, original JS numeric precision, RFC-style quoting, and TSV tabs. Require Windows-safe deterministic filenames; truthful captions/provenance; PNG canvas dimensions exactly 3× the figure viewBox; text fallback; and unsupported image-copy state.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
npm test -- src/features/bfn/chartExport.test.ts src/features/bfn/chartClipboard.test.ts
```

Expected: FAIL because export modules do not exist.

- [ ] **Step 3: Implement standalone SVG from the shared model**

`serializeBfnFigureSvg({ model, result, comparison, title, description })` emits real axes, ticks, labels, vector uncertainty/full/ANN/comparison paths, legend, white rectangle background, dark text, fixed scientific colors, and optional XML-safe metadata. It consumes existing model geometry and never serializes screen-only focus/cursor/tooltip/UI elements.

- [ ] **Step 4: Implement raw CSV/TSV serializers**

`serializeBfnResultTable({ project, current, comparison, delimiter, bom })` emits stable columns in project input/module order, with ID-sorted fallback for orphaned historical fields. Use `String(number)` for raw values, correct quote escaping, decimal dots, and tidy current/comparison rows. Hidden figure series do not remove raw data columns.

- [ ] **Step 5: Implement filenames, captions, provenance, PNG, and clipboard capability**

Add `createBfnExportFilename`, `createBfnFigureCaption`, and `createBfnProvenanceRows` using only known fields. Describe `parameter_interval_envelope` as a parameter-interval envelope and ANN acceptance as passing the current approximation-quality threshold. Convert the standalone SVG through an image/canvas pipeline at scale 3 with a white canvas. Feature-detect `navigator.clipboard.writeText`, `ClipboardItem`, and `image/png`; return explicit success/unsupported/failure results.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run both new files. Expected: PASS.

- [ ] **Step 7: Commit export primitives**

```powershell
git add src/features/bfn/chartExport.ts src/features/bfn/chartExport.test.ts src/features/bfn/chartClipboard.ts src/features/bfn/chartClipboard.test.ts
git commit -m "feat(bfn): add publication export pipeline"
```

### Task 4: Integrate Phase 4.2 export, copy, caption, and provenance UI

**Files:**

- Create: `src/features/bfn/BfnExportMenu.tsx`
- Create: `src/features/bfn/BfnRunProvenance.tsx`
- Create: `src/features/bfn/BfnExportMenu.test.tsx`
- Modify: `src/features/bfn/BfnResultWorkspace.tsx`
- Modify: `src/features/bfn/bfn-results.css`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`
- Modify: `src/pages/ModelingPage.batch4.test.tsx`

- [ ] **Step 1: Write failing menu, clipboard, provenance, and isolation tests**

Open the compact Export menu and assert SVG/PNG/CSV download actions plus Copy Figure/Data/Caption. Verify unsupported image copy is disabled or reports “use PNG export”; success is announced only after the API resolves. Expand Run information and assert every displayed value originates from the result contract. Verify export/copy does not change project JSON, freshness, Undo history, or autosave count.

- [ ] **Step 2: Run the focused tests and confirm RED**

```powershell
npm test -- src/features/bfn/BfnExportMenu.test.tsx src/pages/ModelingPage.batch4.test.tsx
```

- [ ] **Step 3: Implement export and copy menu**

Use a compact `<details>` menu beside the chart. Download SVG, 3× PNG, and UTF-8 CSV through object URLs with deterministic filenames. Copy TSV and caption through text clipboard support/fallback; copy PNG only when `ClipboardItem` and `image/png` are truly available. Surface success/error/unsupported messages with translated status text.

- [ ] **Step 4: Implement folded provenance**

`BfnRunProvenance` displays completedAt, run ID, engine version, mode, network ID, input/time range, model versions, context IDs, uncertainty method, extrapolation, demo, and experimental validity. Preserve exact scientific wording and avoid confidence, validation, or causality claims not represented by types.

- [ ] **Step 5: Run Phase 4.2 gate**

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all commands pass before Task 5 starts.

- [ ] **Step 6: Commit Phase 4.2 UI**

```powershell
git add src/features/bfn/BfnExportMenu.tsx src/features/bfn/BfnRunProvenance.tsx src/features/bfn/BfnExportMenu.test.tsx src/features/bfn/BfnResultWorkspace.tsx src/features/bfn/bfn-results.css src/i18n/locales/bfn-zh-CN.ts src/i18n/locales/bfn-en-US.ts src/pages/ModelingPage.batch4.test.tsx
git commit -m "feat(bfn): integrate scientific result export"
```

### Task 5: Deliver Phase 4.3 compatible historical-run comparison

**Files:**

- Create: `src/features/bfn/runComparison.ts`
- Create: `src/features/bfn/runComparison.test.ts`
- Modify: `src/features/bfn/chartTypes.ts`
- Modify: `src/features/bfn/chartMath.ts`
- Modify: `src/features/bfn/chartModel.ts`
- Modify: `src/features/bfn/chartExport.ts`
- Modify: `src/features/bfn/BfnResponseChart.tsx`
- Modify: `src/features/bfn/BfnChartTooltip.tsx`
- Modify: `src/features/bfn/BfnResultWorkspace.tsx`
- Modify: `src/features/bfn/BfnExportMenu.tsx`
- Modify: `src/features/bfn/bfn-results.css`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`
- Modify: `src/pages/ModelingPage.batch4.test.tsx`

- [ ] **Step 1: Write failing compatibility and nearest-real-point tests**

Require exclusion of the current ID and exact equality of networkId, mode, primaryInputSourceId, and outputMonitorId. Preserve recency order and permit one selection. Require binary-search nearest historical point on its own grid, so a current x=10 and historical x=9.8 remain visibly distinct.

- [ ] **Step 2: Write failing integration/export/isolation tests**

Assert no select when there are no compatible runs; one historical choice adds a neutral dashed line/legend; tooltip has separate current and comparison coordinates; comparison participates in auto domains; manual ranges persist; changing to an incompatible current result clears selection with a lightweight notice; clearing history clears comparison. SVG/PNG include the dashed line; CSV/TSV contain tidy current/comparison rows; caption says only that a historical result is shown.

- [ ] **Step 3: Run focused comparison tests and confirm RED**

```powershell
npm test -- src/features/bfn/runComparison.test.ts src/features/bfn/BfnResponseChart.test.tsx src/features/bfn/chartExport.test.ts src/pages/ModelingPage.batch4.test.tsx
```

- [ ] **Step 4: Implement comparison selection and rendering**

`compatibleBfnRuns(current, runs)` applies the four ID/mode rules. `BfnResultWorkspace` owns `comparisonId`, shows a compact Compare control only with candidates, and derives the selected run from current props. Render only historical full-model output in neutral blue-gray dashed styling; do not render historical uncertainty or ANN.

- [ ] **Step 5: Integrate comparison cursor, domains, export, and lifecycle**

Use each run's nearest actual point independently. Include comparison in X/Y auto extents and active log checks. Keep legal manual domains; if comparison makes the current log view illegal, show the exact reason and return that axis to linear without changing manual bounds. Clear comparison when runs are cleared or the displayed result becomes incompatible. Export figure/data/caption from the same selected comparison.

- [ ] **Step 6: Run Phase 4.3 gate**

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 7: Commit Phase 4.3**

```powershell
git add src/features/bfn/runComparison.ts src/features/bfn/runComparison.test.ts src/features/bfn/chartTypes.ts src/features/bfn/chartMath.ts src/features/bfn/chartModel.ts src/features/bfn/chartExport.ts src/features/bfn/BfnResponseChart.tsx src/features/bfn/BfnChartTooltip.tsx src/features/bfn/BfnResultWorkspace.tsx src/features/bfn/BfnExportMenu.tsx src/features/bfn/bfn-results.css src/i18n/locales/bfn-zh-CN.ts src/i18n/locales/bfn-en-US.ts src/features/bfn/BfnResponseChart.test.tsx src/features/bfn/chartExport.test.ts src/pages/ModelingPage.batch4.test.tsx
git commit -m "feat(bfn): compare compatible scientific runs"
```

### Task 6: Produce the scientific-results audit and final regression

**Files:**

- Modify: `docs/modeling.md`
- Modify: `docs/testing.md`
- Create: `docs/ui-audit/scientific-results/README.md`
- Create: `docs/ui-audit/scientific-results/01-static-cursor-1440x900.png`
- Create: `docs/ui-audit/scientific-results/02-dynamic-cursor-1440x900.png`
- Create: `docs/ui-audit/scientific-results/03-log-axis-1440x900.png`
- Create: `docs/ui-audit/scientific-results/04-axis-settings-1440x900.png`
- Create: `docs/ui-audit/scientific-results/05-series-controls-1440x900.png`
- Create: `docs/ui-audit/scientific-results/06-export-menu-1440x900.png`
- Create: `docs/ui-audit/scientific-results/07-run-provenance-1440x900.png`
- Create: `docs/ui-audit/scientific-results/08-run-comparison-1440x900.png`
- Create: `docs/ui-audit/scientific-results/09-comparison-tooltip-1440x900.png`
- Create: `docs/ui-audit/scientific-results/10-dark-mode-results-1440x900.png`
- Create from the running application: `docs/ui-audit/scientific-results/exports/demo-static-response.svg`
- Create from the running application: `docs/ui-audit/scientific-results/exports/demo-static-response.png`
- Create from the running application: `docs/ui-audit/scientific-results/exports/demo-static-data.csv`

- [ ] **Step 1: Update behavior and testing documentation**

Document chart view-state isolation, exact-point semantics, log restrictions, manual ranges, vector/PNG/data export, clipboard fallbacks, provenance wording, comparison compatibility, and the full test matrix. State that no interpolation, confidence-interval relabeling, ANN experimental-validation claim, or historical parameter inference occurs.

- [ ] **Step 2: Run the built app and capture the ten required 1440×900 states**

Use the actual application controls and result data. Also inspect 1280×720 for no document horizontal scroll, usable tooltip/menus, fixed Result Dock height, and remaining canvas area. Capture one dark UI state while keeping publication export light.

- [ ] **Step 3: Generate and inspect real export artifacts**

Trigger SVG, PNG, and CSV from the UI. Verify SVG contains vector paths/text and no embedded PNG; PNG is at least 2280×900 with white background; CSV opens as UTF-8, retains raw precision, has stable headers, and contains the expected row count.

- [ ] **Step 4: Run final formatting checks on changed source files and diff audit**

```powershell
npx prettier --check src/features/bfn src/pages/ModelingPage.batch4.test.tsx src/i18n/locales/bfn-zh-CN.ts src/i18n/locales/bfn-en-US.ts docs/modeling.md docs/testing.md docs/ui-audit/scientific-results/README.md
git diff --check
```

- [ ] **Step 5: Run final regression**

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all commands pass; existing Batch 0–3.6 tests remain enabled and green.

- [ ] **Step 6: Commit audit and documentation**

```powershell
git add docs/modeling.md docs/testing.md docs/ui-audit/scientific-results
git commit -m "docs(bfn): audit scientific result workflow"
```

- [ ] **Step 7: Review branch history and push without merging**

```powershell
git status
git diff --check
git log --oneline --decorate -n 12
git push -u origin codex/bfn-scientific-results
```

Do not merge into `main`, rewrite history, or force-push.
