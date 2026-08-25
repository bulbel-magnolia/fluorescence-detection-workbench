# Desktop Surface Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the Batch 3.5 scientific desktop styling into continuous toolbars and pane surfaces across network design, overview, acquisition, import, history, and settings without changing domain behavior.

**Architecture:** Keep every existing page component, state transition, persistence path, BFN type, and algorithm intact. Add two small shared presentation primitives for metadata and lightweight operational status, wrap existing page regions in semantic desktop surfaces, and express hierarchy through outer borders plus internal dividers. BFN evidence tone remains a presentation mapping derived from the existing `BfnEvidenceGrade` union.

**Tech Stack:** React 19, TypeScript, CSS semantic tokens, i18next, Vitest, React Testing Library, Vite 7.

**Baseline:** `codex/bfn-scientific-desktop` at `853a3c18f290e8958cfdb0d1034ff6eeef0f53fc`; typecheck and lint passed, 65 Vitest files / 359 tests passed, and production build passed before branching.

---

### Task 1: Lock the Batch 3.6 structure and semantic contracts

**Files:**

- Create: `src/pages/ModelingPage.batch36.test.tsx`
- Create: `src/pages/DesktopSurfaceConsolidation.test.tsx`
- Modify: `src/features/bfn/presentation.test.ts`
- Modify: `src/features/bfn/bfn-platform.styles.test.ts`

- [ ] **Step 1: Add failing BFN surface tests**

Assert that `.bfn-top-surface` contains both `.bfn-project-toolbar` and `.bfn-run-toolbar`, that the project toolbar contains no rendered “当前项目” label or `.status-pill`, that the save state remains exposed through `.inline-status[data-tone]`, and that `.bfn-workbench-surface` contains both the network workspace and result dock.

```tsx
const topSurface = document.querySelector('.bfn-top-surface');
expect(topSurface).toContainElement(document.querySelector('.bfn-project-toolbar'));
expect(topSurface).toContainElement(document.querySelector('.bfn-run-toolbar'));
expect(within(topSurface as HTMLElement).queryByText('当前项目')).not.toBeInTheDocument();
expect(topSurface?.querySelector('.status-pill')).not.toBeInTheDocument();
expect(topSurface?.querySelector('.inline-status[data-tone="success"]')).toBeInTheDocument();
```

- [ ] **Step 2: Add failing evidence-tone tests**

Test the presentation helper directly. Evidence classifications remain neutral/accent, true external validation maps to success, and assumptions/proposed designs map to warning.

```ts
expect(bfnEvidenceTone('data_driven_prediction')).toBe('evidence');
expect(bfnEvidenceTone('externally_validated')).toBe('validated');
expect(bfnEvidenceTone('independent_assumption')).toBe('warning');
expect(bfnEvidenceTone('proposed_unbuilt_design')).toBe('warning');
```

- [ ] **Step 3: Add failing cross-page surface tests**

Render overview, detection, import, history, and settings. Require one `.desktop-surface` wrapper on each page while preserving the current primary actions, search input, import file input, settings controls, and acquisition controls.

```tsx
expect(container.querySelector('.detection-surface.desktop-surface')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '扫描设备' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: '开始检测' })).toBeInTheDocument();
```

- [ ] **Step 4: Run the focused tests and confirm the new assertions fail**

Run:

```powershell
npm test -- src/pages/ModelingPage.batch36.test.tsx src/pages/DesktopSurfaceConsolidation.test.tsx src/features/bfn/presentation.test.ts src/features/bfn/bfn-platform.styles.test.ts
```

Expected: FAIL because Batch 3.6 wrappers, shared inline semantics, and evidence mapping do not exist yet.

### Task 2: Consolidate the BFN top surface, evidence semantics, workspace, and dock

**Files:**

- Create: `src/components/MetadataLabel.tsx`
- Create: `src/components/InlineStatus.tsx`
- Modify: `src/features/bfn/BfnProjectToolbar.tsx`
- Modify: `src/features/bfn/BfnPlatformPage.tsx`
- Modify: `src/features/bfn/presentation.ts`
- Modify: `src/features/bfn/bfn-workbench.css`
- Modify: `src/features/bfn/bfn-inspector.css`
- Modify: `src/features/bfn/bfn-results.css`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`

- [ ] **Step 1: Add metadata and inline-status primitives**

`MetadataLabel` renders project properties without status semantics. `InlineStatus` renders operational state with a small marker or icon and an optional `role="status"`.

```tsx
export function MetadataLabel({ label, tone = 'neutral' }: MetadataLabelProps) {
  return (
    <span className="metadata-label" data-tone={tone}>
      {label}
    </span>
  );
}

export function InlineStatus({
  label,
  tone = 'neutral',
  icon,
  announce = false,
}: InlineStatusProps) {
  return (
    <span className="inline-status" data-tone={tone} role={announce ? 'status' : undefined}>
      {icon ? <Icon name={icon} size={12} /> : <span className="inline-status__marker" />}
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Merge project and run controls into one top surface**

Wrap `BfnProjectToolbar` and `bfn-run-toolbar` inside `.bfn-top-surface`. Remove the persistent “当前项目” label, keep the project name primary and network name secondary, render `DEMO` through `MetadataLabel`, and render saving/saved/error through `InlineStatus`.

```tsx
<div className="bfn-top-surface">
  <BfnProjectToolbar
    projectName={t(project.labelKey)}
    networkName={t(project.network.labelKey)}
    workspace={view}
    saveStatus={saveStatus}
    onWorkspaceChange={setView}
    onImport={() => importRef.current?.click()}
    onExport={exportProject}
    onReset={() => setPendingDestructiveAction('reset-project')}
  />
  {view === 'design' ? (
    <section className="bfn-run-toolbar" aria-label={t('bfn.runToolbar.label')}>
      <BfnEditorToolbar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={undo}
        onRedo={redo}
      />
    </section>
  ) : null}
</div>
```

- [ ] **Step 3: Add presentation-only evidence tones**

Export `bfnEvidenceTone(grade)` from `presentation.ts` and attach its result as `data-evidence-tone` to inspector banners, implementation labels, inverse candidates, and module drawer evidence labels. Do not change `BfnEvidenceGrade` or fixture data.

```ts
export function bfnEvidenceTone(grade: BfnEvidenceGrade): BfnEvidenceTone {
  if (grade === 'externally_validated') return 'validated';
  if (grade === 'independent_assumption' || grade === 'proposed_unbuilt_design') return 'warning';
  return 'evidence';
}
```

- [ ] **Step 4: Join network workspace and result dock**

Wrap the top surface, transient notices, network/inverse workspace, and result dock in `.bfn-workbench-surface`. Give the outer wrapper the single boundary; internal toolbar rows, three panes, and result dock use only dividers and zero radius.

- [ ] **Step 5: Run BFN regression tests**

Run:

```powershell
npm test -- src/pages/ModelingPage.test.tsx src/pages/ModelingPage.batch2.test.tsx src/pages/ModelingPage.batch3.test.tsx src/pages/ModelingPage.batch35.test.tsx src/pages/ModelingPage.batch36.test.tsx src/features/bfn/presentation.test.ts src/features/bfn/bfn-platform.styles.test.ts
```

Expected: PASS with all direct manipulation, Undo/Redo, freshness, drawers, property-grid, and inverse-design behavior preserved.

- [ ] **Step 6: Commit the BFN consolidation**

```powershell
git add src/components/MetadataLabel.tsx src/components/InlineStatus.tsx src/features/bfn/BfnProjectToolbar.tsx src/features/bfn/BfnPlatformPage.tsx src/features/bfn/presentation.ts src/features/bfn/bfn-workbench.css src/features/bfn/bfn-inspector.css src/features/bfn/bfn-results.css src/i18n/locales/bfn-zh-CN.ts src/i18n/locales/bfn-en-US.ts src/pages/ModelingPage.batch36.test.tsx src/features/bfn/presentation.test.ts src/features/bfn/bfn-platform.styles.test.ts
git commit -m "feat(bfn): consolidate desktop workbench surfaces"
```

### Task 3: Propagate continuous pane surfaces across detection workflows

**Files:**

- Modify: `src/pages/OverviewPage.tsx`
- Modify: `src/pages/DetectionPage.tsx`
- Modify: `src/pages/ImportPage.tsx`
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/theme/scientific-desktop.css`
- Test: `src/pages/DesktopSurfaceConsolidation.test.tsx`

- [ ] **Step 1: Consolidate overview**

Wrap the instrument readout and overview grid in `.overview-surface.desktop-surface`. Remove inner card gaps and borders through CSS dividers. Keep device, recent-record, system-state, import, demo, and acquisition actions unchanged. Replace local/demo transport metadata pills with `MetadataLabel`; keep actual result and connection states as status components.

- [ ] **Step 2: Consolidate acquisition**

Wrap the device strip, error state, signal area, readings, and controls in `.detection-surface.desktop-surface`. Keep the existing device scan/connect, channel selection, zero/calibrate, LED, start/stop, fault injection, and technical-detail operations. Use the device strip as the first toolbar row, then divide signal and controls into continuous panes.

- [ ] **Step 3: Consolidate import**

Add `.import-surface.desktop-surface` around the current import layout. Treat drop zone plus preview as one left pane and format guidance plus save action as the right pane, using dividers instead of separate card borders.

- [ ] **Step 4: Consolidate history**

Add `.history-surface.desktop-surface` to the existing list/detail layout. Remove inner outer-box styling, preserve row selection through an accent line plus background and `aria-selected`, and keep export, chart controls, filters, metadata, and empty states intact.

- [ ] **Step 5: Consolidate settings**

Add `.settings-surface.desktop-surface` to the settings grid. Present language, appearance, device, versions, privacy, and team items as divided settings rows/panes; keep all controls and descriptions unchanged.

- [ ] **Step 6: Run cross-page component and interaction tests**

Run:

```powershell
npm test -- src/pages/DesktopSurfaceConsolidation.test.tsx src/pages/HistoryPage.test.tsx src/pages/ImportPage.test.tsx src/components/ScientificUi.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit shared page consolidation**

```powershell
git add src/pages/OverviewPage.tsx src/pages/DetectionPage.tsx src/pages/ImportPage.tsx src/pages/HistoryPage.tsx src/pages/SettingsPage.tsx src/theme/scientific-desktop.css src/pages/DesktopSurfaceConsolidation.test.tsx
git commit -m "feat(ui): unify scientific desktop pane surfaces"
```

### Task 4: Complete spacing, navigation, dark theme, responsive audit, and documentation

**Files:**

- Modify: `src/theme/scientific-desktop.css`
- Modify: `docs/modeling.md`
- Modify: `docs/testing.md`
- Create: `docs/ui-audit/surface-consolidation/README.md`
- Create: `docs/ui-audit/surface-consolidation/01-network-toolbar-1440x900.png`
- Create: `docs/ui-audit/surface-consolidation/02-network-workspace-1440x900.png`
- Create: `docs/ui-audit/surface-consolidation/03-evidence-semantics-1440x900.png`
- Create: `docs/ui-audit/surface-consolidation/04-result-status-1440x900.png`
- Create: `docs/ui-audit/surface-consolidation/05-overview-1440x900.png`
- Create: `docs/ui-audit/surface-consolidation/06-acquisition-1440x900.png`
- Create: `docs/ui-audit/surface-consolidation/07-import-1440x900.png`
- Create: `docs/ui-audit/surface-consolidation/08-history-1440x900.png`
- Create: `docs/ui-audit/surface-consolidation/09-settings-1440x900.png`
- Create: `docs/ui-audit/surface-consolidation/10-dark-mode-1440x900.png`

- [ ] **Step 1: Normalize shared spacing and navigation**

Use 4/6/8/12 px internal spacing, 6–10 px pane headers, 8–12 px pane bodies, and row dividers. Keep navigation grouping fixed; active navigation uses a 2 px accent line, subtle selected background, normal text, zero shadow, and no pill shape. Reduce brand height below the BFN two-row toolbar height.

- [ ] **Step 2: Verify dark theme and typography**

All new surfaces derive from `--ui-bg-*`, `--ui-border-*`, and `--ui-text-*` variables. Preserve 12–14 px body type, remove meaningful 8–9 px text, and apply numeric/tabular text to readings, record values, chart values, timestamps, and parameters.

- [ ] **Step 3: Run formatting and all required gates**

Run:

```powershell
npm exec prettier -- --check src/components/MetadataLabel.tsx src/components/InlineStatus.tsx src/features/bfn/BfnProjectToolbar.tsx src/features/bfn/BfnPlatformPage.tsx src/features/bfn/presentation.ts src/features/bfn/presentation.test.ts src/features/bfn/bfn-workbench.css src/features/bfn/bfn-inspector.css src/features/bfn/bfn-results.css src/features/bfn/bfn-platform.styles.test.ts src/i18n/locales/bfn-zh-CN.ts src/i18n/locales/bfn-en-US.ts src/pages/OverviewPage.tsx src/pages/DetectionPage.tsx src/pages/ImportPage.tsx src/pages/HistoryPage.tsx src/pages/SettingsPage.tsx src/pages/ModelingPage.batch36.test.tsx src/pages/DesktopSurfaceConsolidation.test.tsx src/theme/scientific-desktop.css docs/modeling.md docs/testing.md docs/ui-audit/surface-consolidation/README.md docs/superpowers/plans/2026-08-25-desktop-surface-consolidation.md
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Expected: all checks pass. The existing Vite chunk-size warning may remain documented; it must not be reported as a failure.

- [ ] **Step 4: Capture the ten required 1440×900 screenshots**

Use the locally running React application and the in-app browser. Capture actual UI states with the exact filenames listed above. Screenshots must be real PNG images at 1440×900.

- [ ] **Step 5: Audit 1280×720**

Verify no document-level horizontal scrolling, the BFN toolbar remains two rows with Run visible, project identity ellipsizes, workspace remains usable, acquisition panes remain operable, and typography is not reduced to solve layout pressure. Record measured dimensions in the audit README.

- [ ] **Step 6: Update documentation and commit the audit**

Document the surface hierarchy, metadata/status/evidence semantics, responsive boundary, tests, and screenshot mapping.

```powershell
git add docs/modeling.md docs/testing.md docs/ui-audit/surface-consolidation docs/superpowers/plans/2026-08-25-desktop-surface-consolidation.md src/theme/scientific-desktop.css
git commit -m "docs(ui): add desktop surface consolidation audit"
```

### Task 5: Final branch verification and delivery

**Files:**

- Review all committed files on `codex/bfn-surface-consolidation`

- [ ] **Step 1: Review branch diff and secrets**

Run:

```powershell
git status
git diff origin/codex/bfn-scientific-desktop...HEAD --check
git diff origin/codex/bfn-scientific-desktop...HEAD --stat
git log --oneline origin/codex/bfn-scientific-desktop..HEAD
```

Confirm no credentials, build output, unrelated files, fabricated scientific values, or domain-logic changes are included.

- [ ] **Step 2: Push the feature branch**

```powershell
git push -u origin codex/bfn-surface-consolidation
```

- [ ] **Step 3: Report completion**

Report Top Surface, Metadata / Status, Evidence Semantics, Network Workspace, each detection-workflow page, Shared UI, Dark Mode, major files, exact test counts, build result, all ten screenshots, branch, commits, and push result. Do not merge into `main`.
