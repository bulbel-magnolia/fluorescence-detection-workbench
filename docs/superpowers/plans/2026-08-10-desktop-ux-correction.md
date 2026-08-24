# Desktop UX Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Remove the operation blockers and misleading states found in the desktop UX audit, then improve the modeling workflow, accessibility, and readability without changing the scientific boundaries of the prototype.

**Architecture:** Keep acquisition truth in the Zustand application state and BLE transport boundary, keep modeling behavior in the modeling feature modules, and keep presentation changes in the existing React pages and theme files. Reuse current state machines, persistence repositories, translation modules, and catalog bindings instead of adding a second workflow.

**Tech Stack:** React 19, TypeScript 5.9, Zustand, i18next, Vitest, Testing Library, Vite, Tauri 2, native CSS.

---

## Fixed product decisions

- A detection record is used only to set a reverse-design target or validate the current network. Do not add a generic record-binding workflow.
- Manually created nodes use independent monotonic names such as `输入节点 1`, `处理节点 1`, and `输出节点 1`. Deleted numbers are not reused during the current model lifecycle. User-renamed nodes are preserved.
- Catalog nodes are function-first on canvas: short function name, `input → output`, and a compact parameter-status label. Scientific identifiers and evidence details stay in the inspector/dialog.
- Connections are created directly by dragging ports. There is no separate connection mode.
- Demo and normalized literature outputs remain visibly marked as illustrative and unvalidated.
- Persistent user-facing text should not be smaller than 12 px. Body and controls should normally be 14 px or larger.

## Task 1: Acquisition and history truthfulness

**Files:**

- Modify: `src/store/appStore.ts`
- Modify: `src/features/transport/Hc08dBleTransport.ts`
- Modify: `src/pages/DetectionPage.tsx`
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/pages/ImportPage.tsx`
- Test: `src/store/appStore.hc08d.test.ts`
- Test: `src/pages/DetectionPage.test.tsx`
- Test: `src/pages/HistoryPage.test.tsx`
- Test: `src/pages/ImportPage.test.tsx`

- [ ] Add failing tests proving that a transport in `discovering` cannot move acquisition to `ready`.
- [ ] Add failing tests proving that disconnecting during an active acquisition preserves the captured samples as an incomplete local record instead of clearing them.
- [ ] Add failing tests for scan states: not scanned, scanning, no result, error, and result available.
- [ ] Add failing tests that an empty trimmed sample identifier cannot start acquisition.
- [ ] Add failing tests that persistence failure does not show a saved state.
- [ ] Add failing tests that `null` signal values render as `N/A` and that filtered-out history details disappear.
- [ ] Gate `ready` on an actually usable connection/data channel and keep `discovering` visible until then.
- [ ] Preserve interrupted acquisition data, mark the record incomplete/raw, and provide a recoverable next action.
- [ ] Return a real success result from imported-record persistence and render retryable failure feedback.
- [ ] Implement explicit scan/no-result/retry states and sample-ID validation.
- [ ] Run focused tests: `npm.cmd test -- src/store/appStore.hc08d.test.ts src/pages/DetectionPage.test.tsx src/pages/HistoryPage.test.tsx src/pages/ImportPage.test.tsx`.

## Task 2: Modeling workflow and component presentation

**Files:**

- Modify: `src/pages/ModelingPage.tsx`
- Modify: `src/features/modeling/NetworkCanvas.tsx`
- Modify: `src/features/modeling/modelingCore.ts`
- Modify: `src/features/modeling/modelingLocalization.ts`
- Modify: `src/features/modeling/reverseDesign.ts`
- Modify: `src/features/modeling/catalog/releaseCatalogPresentation.ts`
- Modify: `src/features/modeling/catalog/ReleaseCatalogDialog.tsx`
- Test: corresponding `*.test.ts` and `*.test.tsx` files in these folders

- [ ] Add failing tests for independent monotonic node names, no number reuse after deletion, and preservation of user-renamed names.
- [ ] Add failing tests that clicking empty canvas or pressing Escape clears selection and exposes model settings.
- [ ] Add failing tests that a direct drag into an unbound/default input adopts the source molecule and creates a valid connection; explicit molecule conflicts remain blocked with a specific reason.
- [ ] Add failing tests for actionable preflight diagnostics: missing output, disconnected path, incompatible signal, invalid parameter, and non-convergence.
- [ ] Add failing tests that imported models pass through the existing migration/sanitization path and return an import summary.
- [ ] Add failing tests for reverse-design states: idle, no reachable input, target out of range, missing runnable response, and candidates available.
- [ ] Implement numbered default names using stored/derived per-kind counters that survive deletion and language switching without changing manual names.
- [ ] Add an explicit model-settings action and clear-selection behavior.
- [ ] Make direct port dragging adopt a molecule only for an unbound/default target; keep evidence-bound ports immutable unless the user explicitly changes them.
- [ ] Show node/edge-targeted simulation diagnostics and focus/highlight the first problem.
- [ ] Route JSON imports through model migration and sanitization, then show counts and warnings.
- [ ] Present catalog nodes with function title, `input → output`, and parameter status while keeping IDs in evidence details.
- [ ] Keep detection records limited to reverse-target and network-validation workflows, with explicit explanatory copy.
- [ ] Run focused modeling tests.

## Task 3: Shell, accessibility, and readability

**Files:**

- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/NavigationRail.tsx`
- Modify: `src/app/TopBar.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/components/TelemetryStrip.tsx`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/ModelingPage.tsx` only for shared dialog/focus behavior after Task 2 is integrated
- Modify: `src/theme/global.css`
- Modify: `src/theme/cyber-scientific.css`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/en-US.ts`
- Test: app/component tests covering these files

- [ ] Add failing tests for separate connection and acquisition states, with errors taking visual priority.
- [ ] Add failing tests for persistent running-acquisition access when navigating away from capture.
- [ ] Add failing tests for a visible navigation label or tooltip at the minimum desktop width.
- [ ] Add failing accessibility tests for main landmark/skip link, segmented controls, dialogs, and telemetry live regions.
- [ ] Resolve the 1280 px rail cascade so a collapsed rail is actually narrow and all icons have visible hover/focus labels.
- [ ] Split device connection and acquisition state in the top bar; add a persistent return/stop control while acquisition is active.
- [ ] Add one consistent `main` target, navigation focus transfer, dialog focus trap, and trigger-focus restoration.
- [ ] Limit live announcements to status/error cells and expose full truncated telemetry values.
- [ ] Raise the small-text floor, improve light-theme contrast, preserve no-wrap CTAs, and keep dense layouts compact through spacing rather than tiny type.
- [ ] Keep motion tied to state: no running scanline while idle; preserve reduced-motion and reduced-transparency behavior.
- [ ] Complete Chinese and English copy for all new states and remove internal identifiers from primary UI.
- [ ] Run focused component and accessibility tests.

## Task 4: Integration and verification

**Files:**

- Update: `docs/modeling.md`
- Update: `docs/testing.md`
- Update: `README.md` only if visible workflows or run instructions changed

- [ ] Review the combined diff for overlapping state, CSS, and translation changes.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd run tauri build -- --debug` when the local Rust/Tauri environment permits it.
- [ ] Inspect dark and light themes at 1180×700, 1280×720, and 1440×900.
- [ ] Verify keyboard-only navigation, reduced motion, interrupted acquisition recovery, direct node connection, reverse target from a demo record, and network validation from a demo record.
- [ ] Review `git diff --check`, staged file list, generated output, and secrets before committing.
