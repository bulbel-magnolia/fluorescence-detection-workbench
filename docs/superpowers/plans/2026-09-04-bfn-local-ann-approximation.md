# BFN Local ANN Approximation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Correct Batch 13.2 interpretation context semantics, then add a pure, local, read-only ANN-like affine view derived from the existing Batch 13.1 and 13.2 calculations.

**Architecture:** Phase 0 extends the existing target-scoped network influence result with a context snapshot and makes source prefill conservative about exact units. Phase 1 delegates calculation to `calculateBfnNetworkInfluence()`, transforms returned module-local gains and network gains into affine weights plus reconstruction biases, and exposes the result through an Output Monitor drawer and an ephemeral overlay prop on the existing canvas.

**Tech Stack:** TypeScript, React 19, Vitest, React Testing Library, i18next, Vite, existing BFN-INTERPRETATION 1.0 contracts.

---

### Task 1: Establish the exact reviewed branch

**Files:**

- Inspect: `package.json`
- Inspect: `README.md`
- Inspect: `docs/bfn-network-interpretation-1.0.md`

- [x] Verify `HEAD` is `f3da7c9277976ba60526a28ddb3dda7b30fb9a49` on `codex/bfn-local-ann-approximation`.
- [x] Install the exact lockfile with `npm ci`.
- [x] Run `npm test -- --maxWorkers=4` and record the known Sender byte-inventory checkout issue separately from Batch 13 behavior.

### Task 2: Phase 0 conservative source prefill

**Files:**

- Modify: `src/features/bfn/interpretation/networkInfluencePresentation.ts`
- Test: `src/features/bfn/interpretation/networkInfluencePresentation.test.ts`
- Test: `src/features/bfn/interpretation/BfnNetworkInfluenceUi.test.tsx`

- [x] Add failing tests for static `fixed_value` and dynamic `constant` specifications whose units differ from their output ports, plus working-range and non-constant input cases.
- [x] Run the presentation and UI tests and confirm the new assertions fail because mismatched units are currently prefilled.
- [x] Require `specification.unit === source.outputPort.unit` before returning a numeric prefill.
- [x] Re-run the tests and confirm exact-unit values prefill while all other cases remain blank.

### Task 3: Phase 0 target-scoped Context snapshot

**Files:**

- Modify: `src/features/bfn/interpretation/networkInfluenceTypes.ts`
- Modify: `src/features/bfn/interpretation/networkInfluence.ts`
- Modify: `src/features/bfn/interpretation/BfnNetworkInfluenceDrawer.tsx`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`
- Test: `src/features/bfn/interpretation/networkInfluence.test.ts`
- Test: `src/features/bfn/interpretation/BfnNetworkInfluenceUi.test.tsx`

- [x] Define an interpretation-only snapshot with `scope: 'target_relevant_module_edges'`, a summary, and immutable per-edge copies of the existing applicability state and checks.
- [x] Add failing tests for matched, mismatched, uncertain, unavailable, off-target, direct-transmission, purity, and no raw issue-code UI behavior.
- [x] Build the snapshot only from enabled `target.relevantEdgeIds` whose endpoints are both Functional Modules, delegating each comparison to `assessBfnConnectionContextApplicability()`.
- [x] Attach the snapshot to successful network results without changing admission or propagation math.
- [x] Render concise localized caveats only for mismatch and uncertain/unavailable summaries.
- [x] Run targeted network, presentation, compatibility, validation, typecheck, locale parity, and frozen-boundary checks.
- [x] Commit only Phase 0 files as `fix(bfn): preserve network interpretation context semantics`.

### Task 4: Audit the Phase 1 reuse boundaries

**Files:**

- Inspect: `src/features/bfn/interpretation/localInfluence.ts`
- Inspect: `src/features/bfn/interpretation/networkInfluence.ts`
- Inspect: `src/features/bfn/interpretation/BfnNetworkInfluenceDrawer.tsx`
- Inspect: `src/features/bfn/BfnNetworkCanvas.tsx`
- Inspect: `src/features/bfn/BfnPlatformPage.tsx`
- Inspect: `src/features/bfn/annApproximation.ts`
- Inspect: `src/features/bfn/types.ts`

- [x] Confirm module gains and evidence are present in `moduleInterpretations` and overall gains are present in `perSource`.
- [x] Confirm the canvas accepts a derived overlay prop without changing graph storage or layout.
- [x] Record hashes for the old range-fit ANN files and all frozen boundaries before Phase 1.

### Task 5: Phase 1 local ANN calculation contract

**Files:**

- Create: `src/features/bfn/interpretation/localAnnApproximationTypes.ts`
- Create: `src/features/bfn/interpretation/localAnnApproximation.ts`
- Create: `src/features/bfn/interpretation/localAnnApproximation.test.ts`
- Modify: `src/features/bfn/interpretation/index.ts`

- [x] Write failing tests for contract identity, Hill activation/repression, linear, identity, multi-input weights, finite positive/negative/zero biases, exact units, source/module order, mixed units, branch convergence, direct transmission, applicability, context, evidence, first-order steady state, and both reconstruction invariants.
- [x] Write failing tests proving unavailable local gains reject the complete approximation even when Batch 13.2 contains a zero upstream sensitivity; also cover outside-domain, Accumulator, and feedback behavior.
- [x] Implement a request with `contractVersion: '1.0'` and `scope: 'network_local_ann_approximation'`, converting it directly to the existing network influence request.
- [x] Use returned module input gains as module weights and calculate each module bias as `y0 - sum(wi * xi0)`.
- [x] Use returned total source gains as global weights and calculate the network bias as `Y0 - sum(Ws * Us0)`.
- [x] Fail closed if any relevant module input gain or any derived bias is unavailable/non-finite; freeze the ephemeral result.
- [x] Prove by test and hash that `buildAnnApproximation`, `BfnAnnApproximation`, `annThresholds`, R², NRMSE, and fit status remain isolated.

### Task 6: Phase 1 presentation and Output Monitor workflow

**Files:**

- Create: `src/features/bfn/interpretation/localAnnApproximationPresentation.ts`
- Create: `src/features/bfn/interpretation/localAnnApproximationPresentation.test.ts`
- Create: `src/features/bfn/interpretation/BfnLocalAnnApproximationDrawer.tsx`
- Create: `src/features/bfn/interpretation/BfnLocalAnnApproximationUi.test.tsx`
- Create: `src/features/bfn/interpretation/bfn-local-ann-approximation.css`
- Modify: `src/features/bfn/BfnPlatformPage.tsx`
- Modify: `src/features/bfn/bfn-platform.css`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`

- [x] Add failing UI tests for the monitor-only entry, relevant conditions, conservative prefill, overall weights, approximate bias, current output, local boundary, module details, inherited caveats, direct transmission, natural unavailable copy, first-order note, and bilingual parity.
- [x] Reuse Batch 13.2 availability and source discovery in the new presentation helper and drawer.
- [x] Keep weight, approximate bias, current condition, and target prominent; keep formulas and solver language absent.
- [x] Clear the result whenever a condition changes and report `null` overlay state to the parent.
- [x] Clear the overlay on drawer close and Project identity change.

### Task 7: Ephemeral ANN canvas overlay

**Files:**

- Create: `src/features/bfn/interpretation/localAnnApproximationOverlay.ts`
- Create: `src/features/bfn/interpretation/localAnnApproximationOverlay.test.ts`
- Modify: `src/features/bfn/BfnNetworkCanvas.tsx`
- Modify: `src/features/bfn/BfnNetworkCanvas.test.tsx`
- Modify: `src/features/bfn/bfn-canvas.css`
- Modify: `src/features/bfn/BfnPlatformPage.tsx`

- [x] Define overlay records by `targetModuleId`, `targetInputPortId`, derived weight, unit, and optional positioning-only `edgeId`.
- [x] Add failing tests proving weight labels appear only in ANN mode, bind to downstream module inputs, preserve full units in accessible labels/tooltips, and never mutate an Edge.
- [x] Render labels at stable points beside existing edge paths and module bias summaries on relevant module nodes.
- [x] Add a restrained Biological Network / ANN Approximation toggle after a successful result and the required Edge-ownership legend.
- [x] Do not map magnitude to width, glow, heat, or brightness.

### Task 8: Documentation, verification, and handoff

**Files:**

- Modify: `docs/bfn-network-influence-analysis.md`
- Modify: `docs/bfn-network-interpretation-1.0.md`
- Create: `docs/bfn-local-ann-approximation.md`
- Modify: `docs/bfn-development-state.md`
- Modify: `docs/testing.md`

- [x] Document conservative prefill, target-scoped Context, local/module/network affine semantics, scientific boundaries, canvas ownership, and old ANN isolation.
- [x] Run targeted Phase 1 tests and the broader BFN regression suite.
- [x] Temporarily materialize Sender sources from verified raw Git blobs, run `npm test -- --maxWorkers=4`, and restore all 12 files with byte/hash equality in `finally`.
- [x] Run `npm run typecheck`, `npm run lint`, `npm run build`, changed-file Prettier, and `git diff --check`.
- [x] Perform the full frozen-boundary audit against `f3da7c9277976ba60526a28ddb3dda7b30fb9a49`.
- [x] Run the live UI and screenshot audit for all eight requested states without adding dependencies.
- [ ] Commit Phase 1 as `feat(bfn): add local ann approximation`, push without force, and verify GitHub ancestry, compare counts, workflows, checks, statuses, and PR count.
