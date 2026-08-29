# User-defined Functional Module Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define a machine-checkable scientific authoring contract for user-defined BFN functional modules and audit, without materialization or schema changes, whether BFN-IR 2.0 can represent each required concept losslessly.

**Architecture:** Keep the work in a new `src/features/bfn/user-defined/` domain-only boundary. Accept an immutable authoring draft, report independent semantic, representation, runtime, evidence, and implementation findings, and never construct or mutate a `BfnProject`, workspace record, catalog record, ontology assignment, or persisted artifact. Document the verified development ledger and defer all BFN-IR changes to Batch 12.1.

**Tech Stack:** TypeScript 5.9, Vitest 4, Markdown, existing BFN-IR 2.0 domain types.

---

### Task 1: Lock the Batch 12.0 baseline and frozen boundaries

**Files:**

- Verify: `src/features/bfn/types.ts`
- Verify: `src/features/modeling/catalog/sender/v1_2/`
- Verify: `src/features/modeling/ontology/v1/`

- [x] **Step 1: Fetch the GitHub remote and verify the requested base**

  Confirm `HEAD` and `origin/codex/bfn-sender-evidence-integration` are `099294b018d1a6c4644156a9e083edde87570a43`.

- [x] **Step 2: Run the pristine baseline suite**

  Run `npm.cmd test`. Expected baseline: 129 files and 993 tests pass.

- [x] **Step 3: Create the task branch**

  Create `codex/bfn-user-defined-module-contract` directly from the verified base.

### Task 2: Specify the authoring contract and independent audit axes

**Files:**

- Create: `src/features/bfn/user-defined/userModuleContract.ts`
- Test: `src/features/bfn/user-defined/userModuleContract.test.ts`

- [x] **Step 1: Write failing contract tests**

  Cover a valid user-defined Hill sender, an implementation-unspecified module, required entity identity and units, a production-rate output, and proof that semantic validity, BFN-IR representability, runtime support, evidence basis, and implementation state remain independent fields with no aggregate score.

- [x] **Step 2: Verify RED**

  Run `npm.cmd test -- src/features/bfn/user-defined/userModuleContract.test.ts`. Expected: imports fail because the contract and validator do not exist.

- [x] **Step 3: Add the contract vocabulary**

  Define untrusted draft types for module identity, ports, mathematical models, validity domains, context state, uncertainty state, generic provenance, and implementation maturity. Reuse existing BFN quantity, unit, evidence, parameter, and interaction vocabularies where they are sufficient; use explicit authoring-only states where BFN-IR 2.0 cannot express the concept.

### Task 3: Implement deterministic scientific validation and representation audit

**Files:**

- Create: `src/features/bfn/user-defined/userModuleValidation.ts`
- Test: `src/features/bfn/user-defined/userModuleContract.test.ts`

- [x] **Step 1: Add the invalid-fixture matrix**

  Cover incomplete Hill parameters, non-positive `K`/`n`, incompatible parameter units, invalid or missing validity ranges, duplicate or unresolved ports, unsupported arbitrary formulas, multi-output models, linear dimensional mismatch, independent-input term gaps, and measured evidence without provenance.

- [x] **Step 2: Implement pure axis-specific checks**

  Return immutable issue arrays and axis states. Support Hill activation/repression, dimensionally safe linear transfer, and explicitly independent multi-input aggregation for the first authoring contract. Report unsupported families without inferring formulas or entities.

- [x] **Step 3: Audit BFN-IR 2.0 losslessness**

  Report explicit gaps for authoring origin, free module description, custom entity registry semantics, partial or unrecorded context, `none`/`not_recorded` uncertainty, generic provenance, explicit implementation maturity, compound linear units, and multi-output response binding. Do not emit a materialized module or schema proposal object.

- [x] **Step 4: Prove read-only behavior**

  Assert repeated calls are equal, results are deeply frozen, input drafts remain byte-for-byte equivalent, browser storage remains unchanged, and production sources do not depend on project, workspace, persistence, catalog admission, simulation orchestration, or ontology assignment modules.

### Task 4: Add scientific examples and the BFN-IR 2.0 gap table

**Files:**

- Create: `docs/user-defined-functional-modules.md`

- [x] **Step 1: Document the minimal scientific contract**

  Define module name and provenance, typed ports, mathematical completeness, validity domains, evidence basis, context, uncertainty, implementation-unspecified semantics, and supported first-version model families.

- [x] **Step 2: Add concrete fixtures and counterexamples**

  Include a designed sender with production-rate output, an implementation-unspecified module, incomplete Hill and invalid validity-domain cases, independent-input assumptions, and an unsupported arbitrary formula.

- [x] **Step 3: Publish the current representation audit**

  Map every contract concept to current BFN-IR 2.0, state whether representation is lossless, and recommend the smallest Batch 12.1 extensions. State explicitly that Batch 12.0 changes no schema and creates no runnable project artifact.

### Task 5: Add the verified development-state ledger

**Files:**

- Create: `docs/bfn-development-state.md`

- [x] **Step 1: Record allowed states only**

  Use `FROZEN`, `ACTIVE`, `PLANNED`, `CANDIDATE`, or `FUTURE` for Batch 10, Batch 11, Batch 12.0, Sender Runtime Research, the corrected Sender Runtime Gap Analysis, Batch 11.2, Batch 7, Batch 12.1-12.5, and Batch 13.

- [x] **Step 2: Separate verified Git facts from roadmap facts**

  Record exact verified SHAs where repository history provides them. Use `verification pending` for requested roadmap/research checkpoints absent from local or remote history; never invent a commit.

### Task 6: Update cross-references and testing documentation

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/modeling.md`
- Modify: `docs/testing.md`

- [x] **Step 1: Add minimal architecture and modeling boundaries**

  Link the contract and state ledger, describe the pure audit boundary, and state that project materialization, authoring UI, runtime registration, persistence, and schema evolution are outside Batch 12.0.

- [x] **Step 2: Record the focused test matrix**

  Add the new contract cases and frozen-boundary checks to `docs/testing.md` without claiming results before they run.

### Task 7: Validate, review, and commit the narrow batch

**Files:**

- Verify: all changed files
- Verify frozen: Sender V1.2, Receiver runtime, inverse design, ontology, temporal, compatibility, simulation, workspace, `package.json`, and `package-lock.json`

- [x] **Step 1: Run focused and regression tests**

  Run the new test file, relevant BFN contract tests, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build`.

- [x] **Step 2: Format only changed files**

  Run Prettier on the explicit changed-file list, rerun affected checks, then inspect `git diff --check`.

- [x] **Step 3: Verify frozen paths and review the diff**

  Compare frozen paths with `099294b018d1a6c4644156a9e083edde87570a43`; inspect for schema changes, project/workspace side effects, fabricated evidence, secrets, generated output, and unrelated edits.

- [ ] **Step 4: Create one coherent commit**

  The user requested one narrow handoff commit, so commit the reviewed contract, audit, tests, and documentation together as `feat(bfn): define user module authoring contract`.
