# Batch 12.1 Static Functional Module Authoring Implementation Plan

> **For Codex:** Execute this plan phase-by-phase. Each phase begins with a failing targeted test and must be green before the next phase starts.

**Goal:** Add scientifically explicit, static user-defined functional modules to the BFN-IR 2.2 workbench while upgrading new simulation records to uncertainty-aware BFN-SIM 2.1 semantics.

**Architecture:** Keep BFN-IR at 2.2. Phase A extends only the simulation result contract, output-reachable runtime audit, and authored-input safety. Phase B adds a pure draft-to-project materializer that reuses the frozen Batch 12.0 authoring contract. Phase C connects that materializer to the existing Add Module drawer and editor history as one atomic semantic edit.

**Tech Stack:** React 19, TypeScript 5.9, Zustand-compatible controlled project state, i18next, Vitest, React Testing Library, Vite 7.

---

## Phase A — Uncertainty-aware static runtime

### Task A1: Freeze BFN-SIM 2.1 result semantics in tests

**Files:**

- Modify: `src/features/bfn/simulation.test.ts`
- Modify: `src/features/bfn/repository.test.ts`
- Modify: `src/features/bfn/validation.test.ts`
- Modify: `src/features/bfn/annApproximation.test.ts`
- Modify: `src/features/bfn/chartModel.test.ts`
- Modify: `src/features/bfn/BfnResponseChart.test.tsx`
- Modify: `src/features/bfn/chartExport.test.ts`

Add failing tests for:

- new runs use `BFN-SIM-2.1` and carry an output-reachable uncertainty snapshot;
- complete Hill, linear, independent-input, and dynamic parameter intervals produce an envelope;
- missing/invalid intervals, `none`, `not_recorded`, posterior, bootstrap, and covariance retain point estimates while storing `lower/upper: null`;
- an unrelated unreachable module cannot suppress a reachable envelope;
- historical `BFN-SIM-2.0` records remain readable and unchanged;
- ANN interval coverage is `null` when no executable interval exists;
- charts, tooltips, provenance, CSV/SVG/caption exports, and result UI omit the ribbon and explain unavailability;
- output-reachable user-authored modeled inputs are blocking errors while an explicit connected zero remains valid and unreachable authored modules do not block.

Run the targeted tests and confirm RED for missing 2.1 behavior.

### Task A2: Implement the runtime audit and nullable envelope

**Files:**

- Modify: `src/features/bfn/types.ts`
- Create: `src/features/bfn/simulationUncertainty.ts`
- Create: `src/features/bfn/simulationUncertainty.test.ts`
- Modify: `src/features/bfn/simulation.ts`
- Modify: `src/features/bfn/annApproximation.ts`
- Modify: `src/features/bfn/validation.ts`
- Modify: `src/features/bfn/repository.ts`

Implementation rules:

- represent 2.0 and 2.1 as a backward-compatible result union;
- require the uncertainty snapshot only for 2.1 and validate it on load;
- inspect only effective models that can reach the selected output monitor;
- execute parameter envelopes only when every required estimate has a finite ordered interval containing its estimate;
- include dynamic `tau` in the required set;
- never manufacture a zero-width interval;
- keep the trusted response evaluator and dynamic equations unchanged;
- escalate missing modeled inputs only for output-reachable `authoring.origin === 'user_defined'` modules.

### Task A3: Propagate unavailable interval semantics through presentation/export

**Files:**

- Modify: `src/features/bfn/chartMath.ts`
- Modify: `src/features/bfn/chartModel.ts`
- Modify: `src/features/bfn/chartTypes.ts`
- Modify: `src/features/bfn/BfnResponseChart.tsx`
- Modify: `src/features/bfn/BfnChartTooltip.tsx`
- Modify: `src/features/bfn/BfnChartControls.tsx`
- Modify: `src/features/bfn/BfnResultWorkspace.tsx`
- Modify: `src/features/bfn/BfnRunProvenance.tsx`
- Modify: `src/features/bfn/chartExport.ts`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`

Disable or omit uncertainty controls and geometry when the result has no interval. Show a concise reason and render ANN interval coverage as unavailable, never as zero.

### Task A4: Gate, review, and commit Phase A

Run targeted Phase A tests, then:

```powershell
npm run typecheck
npm run lint
git diff --check
```

Review frozen Receiver equations and create commit:

```text
feat(bfn): add uncertainty-aware static runtime
```

---

## Phase B — Pure BFN-IR 2.2 materialization

### Task B1: Specify materialization outcomes with failing tests

**Files:**

- Create: `src/features/bfn/user-defined/userModuleMaterialization.test.ts`

Cover all four supported families, `production_rate` preservation, one output, deterministic/non-mutating results, exact authoring metadata and port labels, context states, uncertainty mapping, provenance/evidence gating, existing/new entity reuse, authoritative-name conflicts, generated-ID collisions, implementation references, structural validation, project JSON round trip, and absence of storage/simulation/Catalog/Sender/Ontology side effects.

Run the new test alone and confirm RED because the materializer does not exist.

### Task B2: Implement a pure materializer

**Files:**

- Create: `src/features/bfn/user-defined/userModuleMaterialization.ts`
- Modify only if required for public typing: `src/features/bfn/user-defined/userModuleContract.ts`

The function accepts a frozen draft and current project and returns either a cloned next project plus the added module ID or structured issues. Gate on semantic validity, supported runtime, claimable evidence, and valid implementation; deliberately ignore the historical representation assessment. Generate model/domain/context/provenance IDs from the stable module ID, reject collisions, use the existing pure placement helper, and leave timestamps/storage/runs untouched.

### Task B3: Gate, review, and commit Phase B

Run the materializer test, BFN-IR migration/repository tests, typecheck, lint, and `git diff --check`. Create commit:

```text
feat(bfn): materialize user-defined static modules
```

---

## Phase C — Existing-drawer authoring workflow

### Task C1: Specify the authoring workflow with failing tests

**Files:**

- Create: `src/features/bfn/user-defined/BfnUserModuleAuthoringDrawer.test.tsx`
- Create: `src/features/bfn/BfnPlatformUserModuleAuthoring.test.tsx`
- Modify: `src/features/bfn/BfnPlatformSemanticPresentation.test.tsx`

Cover drawer entry, four allowed models, no forbidden model/code options, distinct role/entity controls, independent-input arity, context placeholders, evidence/provenance requirements, uncertainty interval completeness, validation feedback, atomic add, no implicit graph artifacts, selection/close, undo/redo exact IDs and registry cleanup, Inspector authored labels/details, `production_rate`, and workspace/export/import persistence.

### Task C2: Build the authoring drawer and draft helpers

**Files:**

- Create: `src/features/bfn/user-defined/userModuleDraft.ts`
- Create: `src/features/bfn/user-defined/userModuleDraft.test.ts`
- Create: `src/features/bfn/user-defined/BfnUserModuleAuthoringDrawer.tsx`
- Create: `src/features/bfn/user-defined/bfn-user-module-authoring.css`
- Modify: `src/features/bfn/catalog/BfnCatalogDiscoveryDrawer.tsx`
- Modify: `src/features/bfn/BfnPlatformPage.tsx`
- Modify: `src/features/bfn/BfnPropertyGrid.tsx` or existing presentation helpers only where authored labels require it
- Modify: `src/features/bfn/presentation.ts`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`

Use the existing drawer shell and scientific desktop visual language. Keep generated identifiers hidden, support existing/new entities, place the action inside an internally scrolling drawer, and pass the materialized project through one `performProjectEdit` call so editor history owns all generated registry records atomically.

### Task C3: Result semantics and responsive behavior

**Files:**

- Modify: `src/features/bfn/bfn-platform.css`
- Modify: `src/features/bfn/bfn-inspector.css`
- Modify: `src/features/bfn/bfn-results.css`
- Modify: authoring CSS and relevant UI tests

Ensure authored scientific metadata is readable in the Inspector, point-only results explain the interval boundary without a band, and the drawer remains usable at 1280×720 without page-level horizontal overflow.

### Task C4: Documentation

**Files:**

- Create: `docs/user-defined-static-authoring.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/modeling.md`
- Modify: `docs/testing.md`
- Modify: `docs/bfn-development-state.md`

Set Batch 12.1 to ACTIVE and keep 12.0/12.0.1/12.0.2 FROZEN and 12.2–12.5 PLANNED. Document BFN-SIM 2.1, point-only uncertainty behavior, the materialization gate, authoring limits, and required-input safety.

### Task C5: Real-app visual audit

Run the real Vite application and inspect at 1440×900:

1. Add Module drawer with custom option
2. Hill authoring
3. independent-input authoring
4. validation error
5. successful canvas insertion
6. authored-module Inspector
7. point-only result
8. interval result
9. dark theme

Repeat responsive checks at 1280×720. Save only real-app evidence under the task artifact directory, confirm the primary action remains reachable, internal scroll works, the result dock does not cover the workflow, and the browser console has zero new errors or warnings.

### Task C6: Full validation, frozen-boundary audit, and commit

Run changed-file Prettier, all targeted Phase C tests, then:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Re-read and test frozen Sender/Receiver/ontology/compatibility/temporal/inverse-design boundaries and report the current 20 Receiver / 53 Sender evidence / 0 admitted counts from code. Create commit:

```text
feat(bfn): add static functional module authoring
```

Push `codex/bfn-static-user-module-authoring`, inspect the remote ref and GitHub checks, report local validation accurately, and stop before Batch 12.2.
