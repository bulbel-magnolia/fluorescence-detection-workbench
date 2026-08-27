# BFN Workspace Integrity Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make workspace retry, project switching, version numbering, drawer isolation, transient form state, and version topology summaries reliable without changing BFN-IR, BFN-SIM, Catalog, or the Workspace database schema.

**Architecture:** Keep the existing repository/controller/editor separation. Fix retry at the IndexedDB connection cache, make project loading a preflight-before-commit transition in the workspace controller, derive version metadata updates from the successful `createVersion` result, and keep drawer-local state inside `BfnProjectCenter`. Add only the optional `edgeCount` presentation field to stored version summaries.

**Tech Stack:** React 19, TypeScript 5.9, IndexedDB/fake-indexeddb, localStorage fallback, Vitest, React Testing Library, i18next, Vite 7.

---

### Task 1: Establish the clean Batch 6 baseline

**Files:**

- Verify: `package.json`
- Verify: `src/features/bfn/workspace/`

- [x] **Step 1: Fetch and compare the baseline branch**

  Run `git fetch origin codex/bfn-multi-project-workspace`, then compare `HEAD` and `origin/codex/bfn-multi-project-workspace`.

- [x] **Step 2: Run all baseline gates**

  Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Expected baseline: all commands succeed before any source change.

- [x] **Step 3: Create the task branch**

  Create `codex/bfn-workspace-integrity-fix` from the verified latest Batch 6 Head.

### Task 2: Make IndexedDB open failures retryable

**Files:**

- Modify: `src/features/bfn/workspace/indexedDbWorkspaceRepository.ts`
- Test: `src/features/bfn/workspace/workspaceRepository.test.ts`
- Test: `src/features/bfn/workspace/BfnWorkspacePage.test.tsx`

- [ ] **Step 1: Add a controlled IDBFactory failure fixture and failing repository test**

  Wrap a real `fake-indexeddb` `IDBFactory`. Return an asynchronous failing `IDBOpenDBRequest` for the configured first attempts and delegate later attempts to the real factory. Assert first `listProjects()` rejects, the same repository retries `open()`, and a later call succeeds.

- [ ] **Step 2: Verify RED**

  Run `npm test -- src/features/bfn/workspace/workspaceRepository.test.ts`. Expected: the second operation still receives the cached rejected Promise.

- [ ] **Step 3: Clear only rejected open promises**

  Replace the permanent cache with:

  ```ts
  const database = (): Promise<IDBDatabase> => {
    if (!databasePromise) {
      databasePromise = openDatabase(factory).catch((error: unknown) => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  };
  ```

- [ ] **Step 4: Verify GREEN and retry UI**

  Add a component test that observes the real load-error surface, clicks Retry, and reaches a normal project with the same repository instance. Run both targeted files.

### Task 3: Make project switching a preflighted transition

**Files:**

- Modify: `src/features/bfn/workspace/BfnWorkspacePage.tsx`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`
- Test: `src/features/bfn/workspace/BfnWorkspacePage.test.tsx`

- [ ] **Step 1: Add the failing switch matrix**

  Start with active Project A and existing Project B. Inject failures independently at target draft read, target run read, `setActiveProject`, and pending autosave. Assert the visible heading, repository active ID, and A draft stay unchanged on every failure; retain the existing success case.

- [ ] **Step 2: Verify RED**

  Run the component test. Expected: target-read failures leave persistent `activeProjectId` set to B under the old ordering.

- [ ] **Step 3: Preflight before persistence**

  Read projects, target metadata, draft, versions, and runs first. Validate metadata and draft, then call `setActiveProject(projectId, openedAt)`. Build the sorted project list locally by applying `lastOpenedAt` to the already-read target metadata, and only then call `applyState`.

- [ ] **Step 4: Separate autosave and target-open errors**

  Flush A first. A flush failure uses `switchBlocked`; later preflight or activation failures use `switchFailed`. Neither path applies B to React state.

- [ ] **Step 5: Verify GREEN**

  Run the complete switch matrix and confirm repository and UI agree in all paths.

### Task 4: Synchronize consecutive version revisions

**Files:**

- Modify: `src/features/bfn/workspace/BfnWorkspacePage.tsx`
- Test: `src/features/bfn/workspace/BfnWorkspacePage.test.tsx`

- [ ] **Step 1: Add a failing consecutive-version test**

  Save Version 1, make no project edit, reopen the form, and assert it displays Version 2. Save again and assert history order `[2, 1]` and repository `nextRevision === 3`. Capture the draft, computation signature, Undo state, and current result relation before both saves and assert they remain unchanged.

- [ ] **Step 2: Verify RED**

  Run the test. Expected: the second form still reports Version 1.

- [ ] **Step 3: Update state from the committed version**

  Use `createdVersion.revision + 1` to update `activeProject.nextRevision` and the matching project-list metadata. Prepend a list item derived from `createdVersion`; do not add a post-commit repository read that can turn a successful version write into a UI failure.

- [ ] **Step 4: Verify GREEN**

  Run the targeted component suite and repository contract.

### Task 5: Isolate drawers and reset Project Center transient state

**Files:**

- Modify: `src/features/bfn/BfnPlatformPage.tsx`
- Modify: `src/features/bfn/workspace/BfnProjectCenter.tsx`
- Test: `src/features/bfn/workspace/BfnWorkspacePage.test.tsx`

- [ ] **Step 1: Add failing overlay and transient-state tests**

  Edit a real input in Input Settings, open Project Center, and assert the input drawer closes while the edit is committed into one Undo step. Also verify a half-filled version form is empty after switching projects, and rename mode is cleared after closing/reopening the drawer.

- [ ] **Step 2: Verify RED**

  Run the component suite. Expected: the input drawer overlaps Project Center and local form state survives close/project changes.

- [ ] **Step 3: Use the existing input close contract**

  In the toolbar Project Center callback, call `closeInputSettings()` before closing Catalog and opening Project Center. Do not bypass `commitInputEdit()`.

- [ ] **Step 4: Reset drawer-local state**

  On `open === false` or `activeProject.id` change, clear `renamingId`, `renameValue`, `versionFormOpen`, `versionName`, `versionNote`, and `confirmation`.

- [ ] **Step 5: Verify GREEN**

  Run the targeted component suite.

### Task 6: Add compatible edge counts to version summaries

**Files:**

- Modify: `src/features/bfn/workspace/workspaceTypes.ts`
- Modify: `src/features/bfn/workspace/BfnProjectCenter.tsx`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`
- Test: `src/features/bfn/workspace/workspaceRepository.test.ts`
- Test: `src/features/bfn/workspace/BfnWorkspacePage.test.tsx`

- [ ] **Step 1: Add failing summary tests**

  Assert new versions store `project.network.edges.length`, Current Draft exposes the same count, and an old persisted summary without `edgeCount` renders safely with an unknown marker.

- [ ] **Step 2: Verify RED**

  Run repository and component tests. Expected: the field and visible copy are absent.

- [ ] **Step 3: Add the optional field without a schema upgrade**

  Add `edgeCount?: number` to `BfnWorkspaceVersionSummary`; `summarizeBfnProject()` always supplies `edgeCount`. Render current and saved-version connection counts, using `—` for older records. Keep `BFN_WORKSPACE_DATABASE_VERSION = 1`.

- [ ] **Step 4: Verify GREEN and scientific boundaries**

  Run repository, migration, Catalog factory, signature, simulation, and component tests. Confirm the frozen Catalog JSON has no diff.

### Task 7: Complete visual evidence and documentation

**Files:**

- Modify: `docs/workspace.md`
- Modify: `docs/testing.md`
- Modify: `docs/ui-audit/multi-project-workspace/README.md`
- Create: `docs/ui-audit/multi-project-workspace/04-rename-duplicate-1440x900.png`
- Create: `docs/ui-audit/multi-project-workspace/05-version-history-1440x900.png`
- Create: `docs/ui-audit/multi-project-workspace/06-save-version-1440x900.png`
- Create: `docs/ui-audit/multi-project-workspace/07-restore-confirmation-1440x900.png`
- Create: `docs/ui-audit/multi-project-workspace/08-run-relations-1440x900.png`

- [ ] **Step 1: Capture real 1440×900 states**

  Use the real application and repository state to capture rename/duplicate, two saved versions with edge counts, the correct next revision form, restore confirmation, and Current/Earlier/Legacy run relations. Preserve existing filenames 01, 02, 03, 09, and 10.

- [ ] **Step 2: Measure responsive integrity**

  At 1280×720 and 1180×700, record `document.documentElement.clientWidth === document.documentElement.scrollWidth`, confirm the 680 px drawer remains usable, and inspect Current Draft summary overflow. Recheck dark mode.

- [ ] **Step 3: Document the integrity contracts**

  Document rejected-open cache clearing, preflighted switching, immediate next-revision synchronization, overlay isolation, transient resets, edge-count compatibility, and the final visual artifacts.

### Task 8: Run final gates and finish the branch

**Files:**

- Review: all task diffs

- [ ] **Step 1: Run complete validation**

  Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`; record actual Vitest file/test counts and Vite artifact metrics.

- [ ] **Step 2: Review boundaries**

  Run `git diff --check`, inspect the full diff, confirm the frozen Catalog release has no changes, scan for secrets, and verify BFN-IR/BFN-SIM versions and IndexedDB version remain unchanged.

- [ ] **Step 3: Commit the coherent fix**

  Stage only reviewed files and commit as `fix(bfn): harden workspace state transitions`. Do not merge, push, or enter Batch 7 without a separate instruction.
