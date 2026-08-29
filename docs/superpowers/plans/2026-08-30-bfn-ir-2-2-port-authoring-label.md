# BFN-IR 2.2 Port Authoring Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current project schema to BFN-IR 2.2 so a user-authored Port role label round-trips independently from Entity identity, Entity display metadata, and localized application presentation.

**Architecture:** Extend `BfnPort` with optional explicit `user_defined` authoring metadata, then extend the single central migration/parser to read 2.0, 2.1, and 2.2 while always returning a validated 2.2 deep clone. Workspace repositories continue calling that migration without storage-structure changes; computation and compatibility continue projecting only scientific Port fields.

**Tech Stack:** TypeScript 5.9, Vitest 4, BFN-IR project types, IndexedDB/localStorage workspace repositories, Prettier, ESLint, Vite.

---

### Task 1: Define and validate the BFN-IR 2.2 Port contract

**Files:**

- Modify: `src/features/bfn/types.ts`
- Modify: `src/features/bfn/bfnIrMigration.ts`
- Modify: `src/features/bfn/bfnIrMigration.test.ts`
- Modify: `src/features/bfn/fixtures.ts`
- Modify: `src/features/bfn/repository.ts`
- Modify: `src/features/bfn/repository.test.ts`

- [x] **Step 1: Write failing schema and migration tests**

Add focused tests that require `isBfnProjectV22`, expect 2.0 and 2.1 inputs to return `schemaVersion: '2.2'`, reject `2.3`, and round-trip this exact distinction:

```ts
port.authoring = { origin: 'user_defined', name: '  Inducer input  ' };
project.registry.entities.push({
  id: 'entity.user.inducer-x',
  origin: 'user_defined',
  displayName: 'Inducer X',
  description: null,
});
expect(parseBfnProject(JSON.stringify(project))).toEqual(project);
```

Also assert 2.0/2.1 migration creates no Port `authoring`, malformed origins fail, blank names fail, and built-in/Catalog Ports without metadata remain valid.

- [x] **Step 2: Run the migration and repository tests to verify RED**

Run:

```powershell
npm test -- src/features/bfn/bfnIrMigration.test.ts src/features/bfn/repository.test.ts
```

Expected: FAIL because BFN-IR 2.2, `isBfnProjectV22`, and Port authoring metadata are not implemented.

- [x] **Step 3: Add the minimal production type and central migration**

Add exactly:

```ts
export interface BfnUserAuthoredPortMetadata {
  origin: 'user_defined';
  name: string;
}

export interface BfnPort {
  id: string;
  displayName?: BfnLocalizedDisplayName;
  authoring?: BfnUserAuthoredPortMetadata;
  entity: string;
  quantityType: BfnQuantityType;
  unit: BfnUnit;
  direction: 'input' | 'output';
}
```

Change current `BfnProject.schemaVersion` to `'2.2'`. Keep `isBfnProjectV20` and `isBfnProjectV21` for historical validation, add `isBfnProjectV22` as the current type guard, validate optional Port metadata only in 2.2, and make `upgradeBfnProjectToCurrent` follow:

```ts
if (isBfnProjectV22(value)) return structuredClone(value);
if (isBfnProjectV21(value)) return validateV22({ ...structuredClone(value), schemaVersion: '2.2' });
if (isBfnProjectV20(value)) return migrateV20ThroughV21ToV22(value);
throw new Error('BFN_IMPORT_SCHEMA_INVALID');
```

Do not derive Port authoring metadata during either migration.

- [x] **Step 4: Run focused tests to verify GREEN**

Run the command from Step 2 and expect all migration/repository tests to pass.

### Task 2: Preserve factory, signature, compatibility, and Workspace behavior

**Files:**

- Modify: `src/features/bfn/workspace/workspaceProjectFactory.test.ts`
- Modify: `src/features/bfn/workspace/workspaceRepository.test.ts`
- Modify: `src/features/bfn/computationSignature.test.ts`
- Modify: `src/features/bfn/compatibility/portCompatibility.test.ts`
- Modify: `src/features/modeling/ontology/v1/ontologyResolver.test.ts`

- [x] **Step 1: Write failing integration regressions**

Require new projects to emit 2.2; require IndexedDB and localStorage 2.1 Draft/Version reads to expose 2.2 while stored immutable Versions remain 2.1; require Port authoring labels to leave computation signatures and compatibility assessments unchanged.

```ts
described.network.modules[0]!.inputPorts[0]!.authoring = {
  origin: 'user_defined',
  name: 'Renamed input role',
};
expect(createBfnComputationSignature(described)).toBe(createBfnComputationSignature(project));
```

Separately assert changing `entity`, `quantityType`, `unit`, `direction`, or `id` changes the signature.

- [x] **Step 2: Run integration tests to verify RED**

```powershell
npm test -- src/features/bfn/workspace/workspaceProjectFactory.test.ts src/features/bfn/workspace/workspaceRepository.test.ts src/features/bfn/computationSignature.test.ts src/features/bfn/compatibility/portCompatibility.test.ts src/features/modeling/ontology/v1/ontologyResolver.test.ts
```

Expected: FAIL on schema/migration expectations before the implementation from Task 1 is complete.

- [x] **Step 3: Apply only required current-version integration changes**

Update 2.1 current-version assertions to 2.2. Keep `BFN_WORKSPACE_DATABASE_VERSION = 1`, storage keys, `portBasis`, and `assessBfnPortCompatibility` unchanged because they already exclude presentation metadata.

- [x] **Step 4: Run the same integration tests to verify GREEN**

Expect all targeted Workspace, signature, compatibility, and ontology tests to pass.

### Task 3: Document the schema and complete the frozen-draft audit

**Files:**

- Create: `docs/bfn-ir-2.2.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/modeling.md`
- Modify: `docs/testing.md`
- Modify: `docs/bfn-development-state.md`

- [x] **Step 1: Document the precise 2.2 extension**

Describe `port.authoring = { origin: 'user_defined', name }`, its separation from Entity identity/display and localized presentation, verbatim storage, no migration inference, signature exclusion, Workspace migration, and unchanged BFN-SIM/runtime contracts.

- [x] **Step 2: Record the formal ACTIVE state**

Keep Batch 12.0 and 12.0.1 FROZEN, add Batch 12.0.2 as ACTIVE, and keep Batch 12.1 PLANNED with the prior preflight stop recorded. Do not create a Batch 12.1 implementation claim.

- [x] **Step 3: Add the field-by-field audit table**

Classify every frozen draft field as `LOSSLESS NOW`. Record the single-output restriction that makes output binding unambiguous, the same-unit restriction for linear transfer, and the supported reported uncertainty restriction to `parameter_interval_envelope`. If any field cannot be classified truthfully, stop without completing the batch.

### Task 4: Validate frozen boundaries, commit, and push

**Files:**

- Review all changed files from Tasks 1–3.

- [x] **Step 1: Run changed-file Prettier only**

```powershell
npx prettier --write <reviewed changed text files>
```

- [x] **Step 2: Run targeted and full validation**

```powershell
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Re-run focused migration, repository, Workspace, signature, compatibility, Receiver, Sender, and production-rate boundary suites.

- [x] **Step 3: Verify frozen files and counts**

Require zero diff in Sender/Receiver frozen data, Sender admission, Receiver formulas, inverse design, ontology production assignments, temporal policy, Port compatibility production code, simulation equations, Workspace schema constants, package files, and the frozen Batch 12.0 contract files. Confirm 20 runnable Receivers, 53 Sender evidence records, 0 admitted Senders, BFN-SIM-2.0, and IndexedDB version 1.

- [ ] **Step 4: Create and push the single reviewed commit**

```powershell
git commit -m "feat(bfn): preserve user port labels in ir"
git push -u origin HEAD
```

Do not force-push, merge, freeze Batch 12.0.2, or restart Batch 12.1.
