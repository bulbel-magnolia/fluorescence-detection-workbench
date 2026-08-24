# Evidence-backed Component Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the versioned, source-audited 27-entry evidence-backed component catalog for BIO-NET, expose it through a searchable bilingual browser, and attach only an immutable literature reference beside the existing demo `ModelNode.part` data.

**Architecture:** Four static JSON files are validated by a handwritten TypeScript type guard before being merged into a read-only ID/alias index. A separate `catalogReference` module adds or removes `catalogReference` on a node without touching `part`, parameters, topology, or output selection; the existing schemaVersion 1 model and repository remain readable. Focused browser components consume the index, while `ModelingPage` owns only dialog state and the immutable model update, with all visible text supplied by i18next.

**Tech Stack:** React 19, TypeScript 5.9 strict mode, Vite 7 JSON imports, i18next/react-i18next, Vitest 4, React Testing Library, CSS in `cyber-scientific.css`, Tauri 2 Windows build.

**Source specification:** `docs/superpowers/specs/2026-08-02-evidence-backed-component-catalog-design.md`

---

## File structure and responsibility map

The following is the complete implementation surface. The worktree already contains the modeling, i18n, and theme files listed under **Modify**; every other path below is created by this plan.

### Catalog data and pure catalog services

- **Create:** `src/features/modeling/catalog/catalogTypes.ts` — strict catalog unions, `Known<T> | UnknownValue`, literature/sequence/context/observation types, `CatalogEntry`, manifest and file types, search/filter types, and the single exported definition of `LiteratureCandidateReference`.
- **Create:** `src/features/modeling/catalog/catalogManifest.json` — `evidence-backed-components@2026-08-02.1`, schema version, four filenames, fixed counts `5/9/13/27`, and generation date.
- **Create:** `src/features/modeling/catalog/qsSystems.json` — exactly `qs.cin`, `qs.tra`, `qs.rhl`, `qs.esa`, `qs.aub`; no pollutant or output IDs.
- **Create:** `src/features/modeling/catalog/pollutantSensors.json` — exactly the nine pollutant IDs in the approved specification; CadR is accepted only after the SI audit gate.
- **Create:** `src/features/modeling/catalog/controlOutputParts.json` — exactly the thirteen control/output IDs in the approved specification.
- **Create:** `src/features/modeling/catalog/catalogValidator.ts` — manifest/file/entry type guards, fixed-ID/count checks, source-context checks, node-kind compatibility checks, sequence rules, quantitative-observation boundary checks, and CadR audit checks. It introduces no runtime schema dependency.
- **Create:** `src/features/modeling/catalog/catalogLoader.ts` — static JSON imports, validation result, unavailable/error state, and a loader that never fetches the network or derives model parameters.
- **Create:** `src/features/modeling/catalog/catalogIndex.ts` — immutable merged index, ID and normalized-token lookup, search/filter operation, and metadata for category/host/strain/evidence/sequence/modeling filters.
- **Create:** `src/features/modeling/catalog/catalogIndex.test.ts` — manifest and validator contract tests, merged-index tests, unknown-ID behavior, search/filter tests, and the no-model-parameter-mapping invariant.
- **Create:** `src/features/modeling/catalog/qsSystems.test.ts` — isolated validation/count test for the five QS entries.
- **Create:** `src/features/modeling/catalog/pollutantSensors.test.ts` — isolated validation/count and CadR SI-gate test for the nine pollutant entries.
- **Create:** `src/features/modeling/catalog/controlOutputParts.test.ts` — isolated validation/count test for the thirteen control/output entries.

### Model compatibility and persistence

- **Create:** `src/features/modeling/catalog/catalogReference.ts` — immutable `attachCatalogReference`, `detachCatalogReference`, and runtime reference guard; these functions only add/remove the sibling field.
- **Create:** `src/features/modeling/catalog/catalogReference.test.ts` — deep-preservation tests for node, edge, parameter, and output fields, old references, unknown references, and independent demo-part behavior.
- **Create:** `src/features/modeling/modelingRepository.test.ts` — localStorage compatibility tests for schemaVersion 1 models, snapshots, and invalid catalog references.
- **Modify:** `src/features/modeling/types.ts` — add `LiteratureCandidateReference` and optional `ModelNode.catalogReference`; do not change `ModelNode.part`, `ModelNodeParameters`, `NetworkModel.schemaVersion`, or `NetworkModel.outputNodeId`.
- **Modify:** `src/features/modeling/modelingCore.ts` — validate the optional sibling reference while preserving all schemaVersion 1 modeling rules.
- **Modify:** `src/features/modeling/partLibrary.ts` — keep `applyPart`’s immutable spread behavior and explicitly test that a catalog reference survives a demo-part replacement.
- **Modify:** `src/features/modeling/modelingRepository.ts` — preserve references in project/run snapshots, accept missing references from old local JSON, and reject malformed references without dropping the remaining model.
- **Modify:** `src/features/modeling/activity.ts` — add catalog attach/detach/unavailable/version-unsupported activity types.
- **Modify:** `src/features/modeling/ModelingActivityPanel.tsx` only if its type narrowing needs the new activity labels; it continues to render translated activity keys and never renders sequence data.

### Focused browser and page integration

- **Create:** `src/features/modeling/catalog/CatalogFilterBar.tsx` — controlled search and filter controls with clear state and result count.
- **Create:** `src/features/modeling/catalog/CatalogEntryCard.tsx` — accessible result card with ID, localized name, category/entity type, evidence grade, sequence status, and selection callback.
- **Create:** `src/features/modeling/catalog/CatalogEntryDetail.tsx` — mechanism, signals, context, evidence boundary, source links, quantitative source-context observations, sequence identifiers, modeling boundary, and attach/detach controls.
- **Create:** `src/features/modeling/catalog/EvidenceCatalogDialog.tsx` — dialog shell, focus/Escape management, unavailable/version states, list/detail layout, and attach callback orchestration.
- **Create:** `src/features/modeling/catalog/EvidenceCatalogDialog.test.tsx` — search, all filters, unknown rendering, keyboard focus/Escape, long DOI/accession expansion, and attach eligibility tests.
- **Modify:** `src/pages/ModelingPage.tsx` — add the catalog entry point, own dialog/focus state, call attach/detach helpers, and record activity; do not place catalog parsing or filter logic in this page.
- **Modify:** `src/pages/ModelingPage.test.tsx` — page-level preservation test proving an attach/detach changes only `catalogReference`, plus legacy/unknown reference rendering.
- **Modify:** `src/i18n/locales/zh-CN.ts` and `src/i18n/locales/en-US.ts` — all catalog entry, filter, state, boundary, activity, and accessibility labels.
- **Modify:** `src/theme/cyber-scientific.css` — dialog/list/detail/filter styles, long-token disclosure, focus states, responsive layout, and reduced-motion rules.
- **Modify:** `src/theme/contrast.test.ts` — CSS contracts for catalog body text, focus visibility, non-wrapping controls, long-token layout, and reduced-motion behavior.

### Documentation and validation

- **Modify:** `README.md` — catalog status, static-data boundary, browser entry point, and validation commands.
- **Modify:** `docs/modeling.md` — catalog data flow, reference-only semantics, schema compatibility, and metric boundary.
- **Modify:** `docs/testing.md` — unit/component/manual matrix for catalog validation, i18n, keyboard behavior, and Windows/Tauri build.

### Ordering and concurrency boundaries

Task 1 is the only prerequisite for Tasks 2–4. Tasks 2, 3, and 4 may run in parallel after Task 1: each worker edits exactly one JSON file and its isolated test file, and none edits the manifest, shared validator, locale files, or page. Task 5 waits for all three JSON files. Task 6 waits for Task 5 because model references must point at an indexed catalog version. Task 7 waits for Tasks 5 and 6 and owns all shared UI, i18n, and CSS files. Task 8 waits for Task 7 and owns documentation and the final validation/commit. The actual implementation branch must keep these dependencies; this plan file is the only file being changed in the current turn.

### Task 1: Lock schema, manifest, and validator contracts before data entry

**Files:**
- Create: `src/features/modeling/catalog/catalogTypes.ts`
- Create: `src/features/modeling/catalog/catalogManifest.json`
- Create: `src/features/modeling/catalog/catalogValidator.ts`
- Create: `src/features/modeling/catalog/catalogIndex.test.ts`

- [ ] **Step 1: Write the failing schema and validator tests**

Create `catalogIndex.test.ts` with a minimal valid fixture and explicit rejection cases. The fixture must use the actual controlled IDs and the exact unknown representation:

```ts
import { describe, expect, it } from 'vitest';
import {
  CATALOG_ID,
  CATALOG_VERSION,
  EXPECTED_ENTRY_IDS,
  validateCatalogBundle,
  validateCatalogEntry,
} from './catalogValidator';
import type { CatalogEntry, CatalogFile, CatalogManifest } from './catalogTypes';

const unknown = { state: 'unknown' as const, reason: 'not reported by the source' };

const literature = {
  id: 'lithgow-2000-cinri',
  title: 'The regulatory locus cinRI in Rhizobium leguminosarum controls a network of quorum-sensing loci',
  authors: 'Lithgow et al.',
  year: { state: 'known', value: 2000 },
  doi: { state: 'known', value: '10.1046/j.1365-2958.2000.01960.x' },
  pmid: unknown,
  url: 'https://doi.org/10.1046/j.1365-2958.2000.01960.x',
  sourceType: 'primary-paper' as const,
  supports: ['mechanism', 'sequence', 'heterologous-function'],
};

const validEntry: CatalogEntry = {
  id: 'qs.cin',
  catalogId: CATALOG_ID,
  catalogVersion: CATALOG_VERSION,
  entityType: 'system',
  name: { zh: 'CinI/CinR–pCin', en: 'CinI/CinR–pCin', aliases: ['Cin'] },
  category: 'qs-system',
  roles: ['quorum-sensing', 'regulator'],
  mechanism: {
    summary: 'A source-referenced AHL production and response system.',
    steps: ['signal production', 'receptor binding', 'promoter response'],
    requiredPartners: ['CinI', 'CinR', 'pCin'],
  },
  signals: {
    inputs: [{
      id: 'ahl', name: { state: 'unknown', reason: 'source context differs by construct' },
      direction: 'positive', unit: unknown, directObservation: true, sourceRefs: ['lithgow-2000-cinri'],
    }],
    outputs: [{
      id: 'promoter-output', name: { state: 'known', value: 'pCin transcription' },
      direction: 'positive', unit: unknown, directObservation: true, sourceRefs: ['lithgow-2000-cinri'],
    }],
  },
  context: {
    host: { state: 'known', value: 'Escherichia coli' },
    strain: unknown,
    vector: unknown,
    culture: unknown,
    temperature: unknown,
    induction: unknown,
    growthPhase: unknown,
    readout: { state: 'known', value: 'transcriptional reporter' },
    other: unknown,
  },
  evidence: {
    grade: 'B', reviewStatus: 'needs-review',
    scope: 'Mechanism and heterologous function reported in the cited source.',
    directInEColi: true,
    reviewNotes: ['Validator test data; not a team validation.'],
    boundaryNotes: ['Source-context observation is not a model parameter.'],
  },
  literature: [literature],
  quantitativeObservations: [{
    metric: 'reporter-activity', value: unknown, unit: unknown, sourceRef: 'lithgow-2000-cinri',
    context: { host: { state: 'known', value: 'Escherichia coli' }, strain: unknown, vector: unknown, culture: unknown },
    originalMeaning: 'The source does not report a transferable reporter-activity value.',
    transferability: 'Display unknown only.',
    modelingBoundary: { application: 'display-only', forbiddenMappings: ['edge-weight', 'km', 'hill', 'gain', 'threshold'] },
  }],
  sequence: {
    status: 'unknown', records: unknown, isCompleteSingleSequence: false,
  },
  modeling: {
    compatibility: 'qualitative-only',
    allowedRepresentations: ['annotated candidate card'],
    signalMappings: ['show source-context direction'],
    compatibleNodeKinds: ['signal', 'response'],
    forbiddenAutomaticMappings: ['edge-weight', 'km', 'hill', 'gain', 'threshold'],
    requiredMeasurements: ['current-host dose response'],
    calibrationRequirements: ['define a project calibration version before numerical use'],
  },
  curation: {
    catalogVersion: CATALOG_VERSION,
    reviewedAt: '2026-08-02',
    reviewedBy: ['software review'],
    changeNotes: ['Validator contract test record.'],
    withdrawalReason: unknown,
    auditChecks: { cadRSupplementChecked: false },
  },
};

const manifest: CatalogManifest = {
  schemaVersion: 'evidence-backed-components.schema.v1',
  catalogId: CATALOG_ID,
  catalogVersion: CATALOG_VERSION,
  generatedAt: '2026-08-02',
  files: { qsSystems: 'qsSystems.json', pollutantSensors: 'pollutantSensors.json', controlOutputParts: 'controlOutputParts.json' },
  counts: { 'qs-system': 5, 'pollutant-sensor': 9, 'control-output': 13, total: 27 },
};

const file = (category: CatalogFile['category'], entries: CatalogEntry[]): CatalogFile => ({
  schemaVersion: manifest.schemaVersion,
  catalogId: manifest.catalogId,
  catalogVersion: manifest.catalogVersion,
  category,
  entries,
});

describe('catalog validator contract', () => {
  it('accepts a structurally complete entry with explicit unknown values', () => {
    expect(validateCatalogEntry(validEntry, manifest)).toEqual({ ok: true, value: validEntry });
  });

  it('rejects a known quantitative number without a known unit or source reference', () => {
    const invalid = structuredClone(validEntry);
    invalid.quantitativeObservations[0] = {
      ...invalid.quantitativeObservations[0]!,
      value: { state: 'known', value: 10000 },
      unit: unknown,
      sourceRef: '',
    };
    expect(validateCatalogEntry(invalid, manifest)).toMatchObject({ ok: false });
  });

  it('rejects a family or system that claims a complete single sequence', () => {
    const invalid = { ...validEntry, sequence: { ...validEntry.sequence, status: 'available-public-accession' as const, isCompleteSingleSequence: true, records: [{ kind: 'GenBank' as const, accession: 'ABC123', sequenceType: 'system' as const, version: unknown, orientation: 'unknown' as const, sourceRef: 'lithgow-2000-cinri', complete: true }] } };
    expect(validateCatalogEntry(invalid, manifest)).toMatchObject({ ok: false });
  });

  it('rejects an empty or illegal compatible node-kind list', () => {
    const empty = { ...validEntry, modeling: { ...validEntry.modeling, compatibleNodeKinds: [] } };
    expect(validateCatalogEntry(empty, manifest)).toMatchObject({ ok: false });
    const illegal = JSON.parse(JSON.stringify(validEntry)) as unknown as { modeling: { compatibleNodeKinds: unknown[] } };
    illegal.modeling.compatibleNodeKinds = ['not-a-model-node-kind'];
    expect(validateCatalogEntry(illegal, manifest)).toMatchObject({ ok: false });
  });

  it('rejects any observation that exposes a model parameter mapping', () => {
    const invalid = {
      ...validEntry,
      quantitativeObservations: [{
        ...validEntry.quantitativeObservations[0]!,
        modelingBoundary: { application: 'model-parameter', forbiddenMappings: [] },
      }],
    };
    expect(validateCatalogEntry(invalid, manifest)).toMatchObject({ ok: false });
  });

  it('requires the fixed five plus nine plus thirteen entry IDs and counts', () => {
    expect(Object.values(EXPECTED_ENTRY_IDS).flat()).toHaveLength(27);
    expect(manifest.counts).toEqual({ 'qs-system': 5, 'pollutant-sensor': 9, 'control-output': 13, total: 27 });
    expect(validateCatalogBundle({ manifest, files: {
      qsSystems: file('qs-system', [validEntry]),
      pollutantSensors: file('pollutant-sensor', []),
      controlOutputParts: file('control-output', []),
    }})).toMatchObject({ ok: false });
  });
});
```

The fixture uses explicit `unknown` values for source omissions. The malformed mapping payload is intentionally an unvalidated object so the runtime guard, rather than the TypeScript union, exercises the rejection path.

- [ ] **Step 2: Run the contract test and verify it fails for missing catalog modules**

Run:

```powershell
npm test -- src/features/modeling/catalog/catalogIndex.test.ts
```

Expected: FAIL during module resolution because `catalogValidator.ts` and `catalogTypes.ts` do not exist yet.

- [ ] **Step 3: Define the strict catalog data structures**

Create `catalogTypes.ts` with these complete public unions and interfaces. Keep the generic unknown union reusable for every value whose source does not provide a value:

```ts
export type UnknownValue = { state: 'unknown'; reason?: string };
export type Known<T> = { state: 'known'; value: T };
export type CatalogValue<T> = Known<T> | UnknownValue;

export type CatalogEntityType = 'part' | 'device' | 'system' | 'library' | 'family';
export type CatalogCategory = 'qs-system' | 'pollutant-sensor' | 'control-output';
export type EvidenceGrade = 'A' | 'B' | 'C' | 'D' | 'unknown';
export type ReviewStatus = 'passed' | 'needs-review' | 'withdrawn';
export type SequenceStatus = 'available-public-accession' | 'partial-public' | 'not-reported' | 'restricted' | 'unknown';
export type ModelingCompatibility = 'qualitative-only' | 'parameterizable-after-calibration' | 'normalized-demo-only' | 'not-compatible' | 'unknown';
export type CatalogNodeKind = 'sensor' | 'signal' | 'response' | 'memory' | 'reporter';
export type EffectDirection = 'positive' | 'negative' | 'mixed' | 'unknown';
export type CatalogRole = 'quorum-sensing' | 'pollutant-sensor' | 'regulator' | 'promoter' | 'output' | 'control' | 'translation' | 'degradation' | 'insulator' | 'rna-regulator';

export interface CatalogName { zh: string; en: string; aliases: string[]; }
export interface CatalogMechanism { summary: string; steps: string[]; requiredPartners: string[]; }
export interface CatalogSignal { id: string; name: CatalogValue<string>; direction: EffectDirection; unit: CatalogValue<string>; directObservation: boolean; sourceRefs: string[]; }
export interface CatalogSignals { inputs: CatalogSignal[] | UnknownValue; outputs: CatalogSignal[] | UnknownValue; }
export interface CatalogContext {
  host: CatalogValue<string>; strain: CatalogValue<string>; vector: CatalogValue<string>; culture: CatalogValue<string>;
  temperature: CatalogValue<string>; induction: CatalogValue<string>; growthPhase: CatalogValue<string>;
  readout: CatalogValue<string>; other: CatalogValue<string>;
}
export interface CatalogEvidence { grade: EvidenceGrade; reviewStatus: ReviewStatus; scope: string; directInEColi: boolean; reviewNotes: string[]; boundaryNotes: string[]; }
export interface CatalogLiterature {
  id: string; title: string; authors: string; year: CatalogValue<number>; doi: CatalogValue<string>; pmid: CatalogValue<string>;
  url: string; sourceType: 'primary-paper' | 'database' | 'registry' | 'supplement'; supports: string[];
}
export interface QuantitativeObservation {
  metric: string; value: CatalogValue<number>; unit: CatalogValue<string>; sourceRef: string;
  context: { host: CatalogValue<string>; strain: CatalogValue<string>; vector: CatalogValue<string>; culture: CatalogValue<string> };
  originalMeaning: string; transferability: string;
  modelingBoundary: { application: 'display-only'; forbiddenMappings: Array<'edge-weight' | 'km' | 'hill' | 'gain' | 'threshold'> };
}
export interface SequenceRecord {
  kind: 'GenBank' | 'NCBI' | 'Registry' | 'Addgene'; accession: string; sequenceType: 'part' | 'promoter' | 'regulator' | 'system' | 'library' | 'family';
  version: CatalogValue<string>; orientation: 'forward' | 'reverse' | 'unknown'; sourceRef: string; complete: boolean;
}
export interface CatalogSequence { status: SequenceStatus; records: SequenceRecord[] | UnknownValue; isCompleteSingleSequence: boolean; }
export interface CatalogModelingBoundary {
  compatibility: ModelingCompatibility; allowedRepresentations: string[]; signalMappings: string[];
  compatibleNodeKinds: CatalogNodeKind[];
  forbiddenAutomaticMappings: string[]; requiredMeasurements: string[]; calibrationRequirements: string[];
}
export interface CatalogCuration { catalogVersion: string; reviewedAt: string; reviewedBy: string[]; changeNotes: string[]; withdrawalReason: CatalogValue<string>; auditChecks: { cadRSupplementChecked: boolean }; }
export interface CatalogEntry {
  id: string; catalogId: string; catalogVersion: string; entityType: CatalogEntityType; name: CatalogName;
  category: CatalogCategory; roles: CatalogRole[]; mechanism: CatalogMechanism; signals: CatalogSignals; context: CatalogContext;
  evidence: CatalogEvidence; literature: CatalogLiterature[]; quantitativeObservations: QuantitativeObservation[] | UnknownValue;
  sequence: CatalogSequence; modeling: CatalogModelingBoundary; curation: CatalogCuration;
}
export interface CatalogManifest {
  schemaVersion: 'evidence-backed-components.schema.v1'; catalogId: string; catalogVersion: string; generatedAt: string;
  files: { qsSystems: 'qsSystems.json'; pollutantSensors: 'pollutantSensors.json'; controlOutputParts: 'controlOutputParts.json' };
  counts: { 'qs-system': 5; 'pollutant-sensor': 9; 'control-output': 13; total: 27 };
}
export interface CatalogFile { schemaVersion: CatalogManifest['schemaVersion']; catalogId: string; catalogVersion: string; category: CatalogCategory; entries: CatalogEntry[]; }
export type LiteratureCandidateReference = {
  catalogId: string;
  catalogVersion: string;
  entryId: string;
  displayNameSnapshot: string;
  sourceStatus?: ReviewStatus;
  boundaryNote?: string;
};
export interface CatalogSearchFilters { query: string; nodeKind: CatalogNodeKind | 'all'; category: CatalogCategory | 'all'; entityType: CatalogEntityType | 'all'; host: string; strain: string; evidenceGrade: EvidenceGrade | 'all'; sequenceStatus: SequenceStatus | 'all'; modelingCompatibility: ModelingCompatibility | 'all'; }
```

Export `isUnknownValue(value: unknown): value is UnknownValue` and `isCatalogValue<T>(value: unknown): value is CatalogValue<T>` from this module; all later guards use these functions instead of unsafe assertions.

- [ ] **Step 4: Add the fixed manifest and handwritten validator**

Create `catalogManifest.json` with exactly:

```json
{
  "schemaVersion": "evidence-backed-components.schema.v1",
  "catalogId": "evidence-backed-components",
  "catalogVersion": "evidence-backed-components@2026-08-02.1",
  "generatedAt": "2026-08-02",
  "files": { "qsSystems": "qsSystems.json", "pollutantSensors": "pollutantSensors.json", "controlOutputParts": "controlOutputParts.json" },
  "counts": { "qs-system": 5, "pollutant-sensor": 9, "control-output": 13, "total": 27 }
}
```

Implement `catalogValidator.ts` with these concrete exports and failure rules:

```ts
export const CATALOG_ID = 'evidence-backed-components' as const;
export const CATALOG_VERSION = 'evidence-backed-components@2026-08-02.1' as const;
export const EXPECTED_ENTRY_IDS = {
  'qs-system': ['qs.cin', 'qs.tra', 'qs.rhl', 'qs.esa', 'qs.aub'],
  'pollutant-sensor': ['sensor.cadr', 'sensor.chrb', 'sensor.merr', 'sensor.cuer', 'sensor.narx-narl', 'sensor.nahr', 'sensor.xyls', 'sensor.dmpr', 'sensor.phnr'],
  'control-output': ['control.mutalik-bcd-library', 'control.anderson-j231-library', 'control.phlf', 'control.srpr', 'control.bm3r1', 'control.qacr', 'control.amtr', 'control.star', 'control.toehold-switch', 'control.ssra-asv-aav-family', 'control.riboj', 'output.sfgfp', 'output.mneongreen'],
} as const;

export interface CatalogValidationError { code: string; path: string; message: string; }
export type CatalogValidationResult<T> = { ok: true; value: T } | { ok: false; errors: CatalogValidationError[] };
export function validateCatalogManifest(value: unknown): CatalogValidationResult<CatalogManifest>;
export function validateCatalogEntry(value: unknown, manifest: CatalogManifest): CatalogValidationResult<CatalogEntry>;
export function validateCatalogFile(value: unknown, category: CatalogCategory, manifest: CatalogManifest): CatalogValidationResult<CatalogFile>;
export function validateCatalogBundle(input: { manifest: unknown; files: { qsSystems: unknown; pollutantSensors: unknown; controlOutputParts: unknown } }): CatalogValidationResult<{ manifest: CatalogManifest; files: Record<CatalogCategory, CatalogFile> }>;
```

The guard must reject: a manifest/file version mismatch; wrong `5/9/13/27` counts; duplicate, unknown, or cross-category IDs; missing required fields; non-lowercase stable IDs; a known quantitative value with an unknown unit; a `sourceRef` absent from that entry’s literature; a missing host/strain/vector/culture `CatalogValue`; a public sequence status without an accession and source reference; a family/library/system claiming `isCompleteSingleSequence: true`; any observation whose `modelingBoundary.application` is not `display-only`; an empty `compatibleNodeKinds` array or a node kind outside `sensor | signal | response | memory | reporter`; a forbidden mapping outside the five literal strings; and `sensor.cadr` unless `curation.auditChecks.cadRSupplementChecked === true`, its literature contains a supplement source, the SI-backed homolog/promoter/operator fields are recorded where available, and no name/mechanism field substitutes `Staphylococcus aureus CadC/PcadA`. A CadR `sequence.status` of `unknown` or `not-reported` with an explicit SI reason is valid when the SI has no sequence accession; the validator must not invent or require a sequence record in that case.

Return every failure with a field path. Do not coerce malformed data, infer sequences from names, or insert defaults. Unknown array fields remain `{ state: 'unknown', reason }`.

- [ ] **Step 5: Run the schema tests**

Run:

```powershell
npm test -- src/features/modeling/catalog/catalogIndex.test.ts
npm run typecheck
```

Expected: both commands PASS for the fixture and validator. No catalog data files are imported in this task, so the fixed-ID bundle test remains a deliberate failure assertion inside the passing test suite.

- [ ] **Step 6: Commit the schema contract**

```powershell
git add src/features/modeling/catalog/catalogTypes.ts src/features/modeling/catalog/catalogManifest.json src/features/modeling/catalog/catalogValidator.ts src/features/modeling/catalog/catalogIndex.test.ts
git commit -m "feat(catalog): define evidence catalog schema and validator"
```

### Task 2: Populate and independently validate the five QS systems

**Files:**
- Create: `src/features/modeling/catalog/qsSystems.json`
- Create: `src/features/modeling/catalog/qsSystems.test.ts`

This task can run in parallel with Tasks 3 and 4 after Task 1. It modifies no shared TypeScript, locale, manifest, or page file.

- [ ] **Step 1: Write the isolated QS data test before the JSON exists**

Create `qsSystems.test.ts` with a static JSON import and these exact assertions:

```ts
import qsSystems from './qsSystems.json';
import { CATALOG_ID, CATALOG_VERSION, EXPECTED_ENTRY_IDS, validateCatalogFile, validateCatalogManifest } from './catalogValidator';
import manifest from './catalogManifest.json';

const manifestResult = validateCatalogManifest(manifest);
if (!manifestResult.ok) throw new Error(manifestResult.errors.map((error) => `${error.path}: ${error.message}`).join('; '));
const validatedManifest = manifestResult.value;

it('contains exactly the five approved QS IDs and passes the file guard', () => {
  const result = validateCatalogFile(qsSystems, 'qs-system', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  expect(result.value.entries.map((entry) => entry.id)).toEqual(EXPECTED_ENTRY_IDS['qs-system']);
  expect(result.value.entries.every((entry) => entry.catalogId === CATALOG_ID && entry.catalogVersion === CATALOG_VERSION)).toBe(true);
});
```

- [ ] **Step 2: Run the isolated test and record the expected missing-file failure**

Run `npm test -- src/features/modeling/catalog/qsSystems.test.ts`.

Expected: FAIL because `qsSystems.json` does not exist.

- [ ] **Step 3: Write the canonical five-entry file**

Create `qsSystems.json` as a `CatalogFile` with category `qs-system` and entries in the manifest order:

1. `qs.cin` — CinI/CinR–pCin; retain unknown AHL chain, host, vector, and sequence fields unless the cited source supplies them.
2. `qs.tra` — TraI/TraR–pTra; distinguish signal production, receptor activation, and promoter response in `mechanism.steps`.
3. `qs.rhl` — RhlI/RhlR–pRhl; store cross-reactivity only when a source reports it, otherwise use an unknown signal observation.
4. `qs.esa` — EsaI/EsaR–PesaR/PesaS; represent the derepression and activation architectures as separate mechanism steps and use `mixed` direction when the source does not support a single direction.
5. `qs.aub` — AubI/AubR–pAub; keep ligand, host, and sequence state source-bound rather than deriving them from the family name.

Every entry must include the complete `CatalogEntry` shape from Task 1. Set a non-empty `modeling.compatibleNodeKinds` list from the cited construct’s actual role: QS cards may name only the signal/response kinds supported by their source, while a card must not receive a blanket all-kinds default. For every numerical observation, use a literal source ID that exists in `literature`, a known unit when the source reports one, and explicit `CatalogValue` host/strain/vector/culture fields; an unreported context field uses `{ "state": "unknown", "reason": "not reported in the cited primary source" }`. If the paper reports no value, use the same unknown form for the value and/or unit and set `modelingBoundary.application` to `display-only`. `reviewStatus: "passed"` is allowed only when the citation and boundary are complete; it does not mean BIT-CHINA validation.

- [ ] **Step 4: Run the isolated QS test and typecheck**

Run:

```powershell
npm test -- src/features/modeling/catalog/qsSystems.test.ts
npm run typecheck
```

Expected: PASS; the test must report five entries in the exact fixed order and no validator error.

- [ ] **Step 5: Commit only the QS file and its test**

```powershell
git add src/features/modeling/catalog/qsSystems.json src/features/modeling/catalog/qsSystems.test.ts
git commit -m "feat(catalog): add quorum-sensing candidate cards"
```

### Task 3: Populate and independently validate the nine pollutant sensors, with CadR SI gate

**Files:**
- Create: `src/features/modeling/catalog/pollutantSensors.json`
- Create: `src/features/modeling/catalog/pollutantSensors.test.ts`

This task can run in parallel with Tasks 2 and 4 after Task 1. It modifies no shared TypeScript, locale, manifest, or page file.

- [ ] **Step 1: Write the isolated pollutant test before the JSON exists**

Create `pollutantSensors.test.ts`:

```ts
import pollutantSensors from './pollutantSensors.json';
import manifest from './catalogManifest.json';
import { EXPECTED_ENTRY_IDS, validateCatalogFile, validateCatalogManifest } from './catalogValidator';

const manifestResult = validateCatalogManifest(manifest);
if (!manifestResult.ok) throw new Error(manifestResult.errors.map((error) => `${error.path}: ${error.message}`).join('; '));
const validatedManifest = manifestResult.value;

it('contains exactly the nine approved pollutant IDs', () => {
  const result = validateCatalogFile(pollutantSensors, 'pollutant-sensor', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  expect(result.value.entries.map((entry) => entry.id)).toEqual(EXPECTED_ENTRY_IDS['pollutant-sensor']);
});

it('allows an honest CadR unknown sequence when the SI has no accession', () => {
  const result = validateCatalogFile(pollutantSensors, 'pollutant-sensor', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  const cadr = result.value.entries.find((entry) => entry.id === 'sensor.cadr');
  expect(['unknown', 'not-reported']).toContain(cadr?.sequence.status);
  if (cadr?.sequence.records && !Array.isArray(cadr.sequence.records)) {
    expect(cadr.sequence.records.reason).toMatch(/SI|accession|序列/i);
  }
});

it('does not pass CadR with the Staphylococcus aureus CadC/PcadA substitute', () => {
  const result = validateCatalogFile(pollutantSensors, 'pollutant-sensor', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  const cadr = result.value.entries.find((entry) => entry.id === 'sensor.cadr');
  expect(cadr?.curation.auditChecks.cadRSupplementChecked).toBe(true);
  expect(JSON.stringify(cadr)).not.toMatch(/Staphylococcus aureus CadC\/PcadA/i);
});
```

- [ ] **Step 2: Run the isolated test and record the expected missing-file failure**

Run `npm test -- src/features/modeling/catalog/pollutantSensors.test.ts`.

Expected: FAIL because `pollutantSensors.json` does not exist.

- [ ] **Step 3: Complete the CadR supplement audit before writing its passed card**

For `sensor.cadr`, inspect the original ACS Sensors paper and supplementary information for the best CadR homolog, promoter/operator, species/strain, vector/construct, and any sequence accession. Record the supplement as a `CatalogLiterature` item with `sourceType: "supplement"`, set `curation.auditChecks.cadRSupplementChecked` to `true`, and write the SI-supported homolog/promoter/operator fields with their source context. If the SI does not establish a field, keep `reviewStatus: "needs-review"` (or `passed` only when the remaining citation and boundary are complete) and use an explicit unknown reason; when the SI has no sequence accession, set `sequence.status` to `unknown` or `not-reported` and `records` to an unknown value with a reason naming the SI/accession gap. Never replace it with *S. aureus* CadC/PcadA or conflate CadR with CadC/PcadA.

- [ ] **Step 4: Write the canonical nine-entry file**

Create `pollutantSensors.json` with category `pollutant-sensor` and entries in this exact order:

1. `sensor.cadr` — CadR module; Cd input, homolog/promoter/operator context, and sequence state must come from the SI audit in Step 3; an accession-free SI is represented as honest unknown rather than an invented record.
2. `sensor.chrb` — ChrB/Pchr; record Cr(VI) versus Cr(III), promoter version, host/strain, and assay medium as separate context fields.
3. `sensor.merr` — MerR/Pmer; record Hg species, source strain, promoter, and any different MerR homolog as source-specific fields.
4. `sensor.cuer` — CueR/PcopA; record Cu oxidation state, Ag cross-reactivity, and E. coli homeostasis context.
5. `sensor.narx-narl` — NarX/NarL/Pnar; retain nitrate/nitrite and oxygen/FNR conditions rather than calling the system a generic pollutant detector.
6. `sensor.nahr` — NahR/Psal; distinguish natural NahR from any engineered mutant and report the promoter construct.
7. `sensor.xyls` — XylS/Pm; distinguish m-toluate, m-xylene, and other benzoate derivatives and preserve volatility/temperature context.
8. `sensor.dmpr` — DmpR/Po; record σ54/RpoN dependence and phenol/substituted-phenol specificity.
9. `sensor.phnr` — PhnR/PphnA; record phosphonoacetate input, phosphorus condition, and host uptake context.

Use the primary-paper DOI/PMID/stable URL as literature IDs. Set each pollutant card’s `modeling.compatibleNodeKinds` from its documented sensor role (normally `['sensor']`); do not broaden compatibility merely to make an entry attachable. For the known observations supported by the evidence set, preserve the author’s stated unit and context exactly (for example, CadR nM values, ChrB µM Cr(VI) values, MerR Hg ranges, NahR µM range, and XylS mM/µM ranges). If a source does not define LOD, EC50, Hill, dynamic range, or response time, store that metric with an unknown value and reason; do not infer one from a plot. Every observation must include `sourceRef`, `unit`, and all four context fields as `CatalogValue` values, set `modelingBoundary.application` to `display-only`, and list all five forbidden model mappings.

- [ ] **Step 5: Run the isolated pollutant tests and typecheck**

Run:

```powershell
npm test -- src/features/modeling/catalog/pollutantSensors.test.ts
npm run typecheck
```

Expected: PASS; nine IDs are present, CadR passes the SI audit without a CadC/PcadA substitute, accession-free SI data can remain honest unknown, and no source-less value is accepted.

- [ ] **Step 6: Commit only the pollutant file and its test**

```powershell
git add src/features/modeling/catalog/pollutantSensors.json src/features/modeling/catalog/pollutantSensors.test.ts
git commit -m "feat(catalog): add pollutant sensor candidate cards"
```

### Task 4: Populate and independently validate the thirteen control/output entries

**Files:**
- Create: `src/features/modeling/catalog/controlOutputParts.json`
- Create: `src/features/modeling/catalog/controlOutputParts.test.ts`

This task can run in parallel with Tasks 2 and 3 after Task 1. It modifies no shared TypeScript, locale, manifest, or page file.

- [ ] **Step 1: Write the isolated control/output test before the JSON exists**

Create `controlOutputParts.test.ts`:

```ts
import controlOutputParts from './controlOutputParts.json';
import manifest from './catalogManifest.json';
import { EXPECTED_ENTRY_IDS, validateCatalogFile, validateCatalogManifest } from './catalogValidator';

const manifestResult = validateCatalogManifest(manifest);
if (!manifestResult.ok) throw new Error(manifestResult.errors.map((error) => `${error.path}: ${error.message}`).join('; '));
const validatedManifest = manifestResult.value;

it('contains exactly the thirteen approved control/output IDs', () => {
  const result = validateCatalogFile(controlOutputParts, 'control-output', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  expect(result.value.entries.map((entry) => entry.id)).toEqual(EXPECTED_ENTRY_IDS['control-output']);
});

it('does not claim a family or library is one complete sequence', () => {
  const result = validateCatalogFile(controlOutputParts, 'control-output', validatedManifest);
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) return;
  expect(result.value.entries.filter((entry) => entry.entityType === 'family' || entry.entityType === 'library').every((entry) => !entry.sequence.isCompleteSingleSequence)).toBe(true);
});
```

- [ ] **Step 2: Run the isolated test and record the expected missing-file failure**

Run `npm test -- src/features/modeling/catalog/controlOutputParts.test.ts`.

Expected: FAIL because `controlOutputParts.json` does not exist.

- [ ] **Step 3: Write the canonical thirteen-entry file**

Create `controlOutputParts.json` with category `control-output` and entries in this exact order:

1. `control.mutalik-bcd-library` — Mutalik BCD translation-initiation library (`library`, never a single sequence).
2. `control.anderson-j231-library` — Anderson BBa_J23100–BBa_J23119 promoter family (`library`, each member needs separate sequence evidence).
3. `control.phlf` — PhlF (`part`) with its paired operator/promoter context.
4. `control.srpr` — SrpR (`part`) with its paired orthogonal promoter context.
5. `control.bm3r1` — BM3R1 (`part`) with its promoter/operator context.
6. `control.qacr` — QacR (`part`) with inducer/operator context.
7. `control.amtr` — AmtR (`part`) with nitrogen/culture condition context.
8. `control.star` — STAR small transcription-activating RNA family (`family`, trigger/terminator pair required).
9. `control.toehold-switch` — toehold switch family (`family`, trigger RNA required).
10. `control.ssra-asv-aav-family` — ssrA ASV/AAV degradation-tag family (`family`, tag member and host protease context required).
11. `control.riboj` — RiboJ 5′-UTR insulator (`part`).
12. `output.sfgfp` — sfGFP output reporter (`part`; do not add GFP-LVA as a new entry).
13. `output.mneongreen` — mNeonGreen output reporter (`part`).

Use public Registry/Addgene/GenBank/NCBI identifiers only when the cited source actually identifies the exact construct. Set each control/output card’s `modeling.compatibleNodeKinds` from the cited role (for example, reporter outputs use `['reporter']`; control parts, libraries, and families list only the signal/response/memory kinds supported by their source). A family or library receives `sequence.status` `partial-public`, `not-reported`, or `unknown` and `isCompleteSingleSequence: false` when it does not describe one sequence. Quantitative observations are source-context display values and never model parameters; unreported values use unknown with a reason.

- [ ] **Step 4: Run the isolated control/output tests and typecheck**

Run:

```powershell
npm test -- src/features/modeling/catalog/controlOutputParts.test.ts
npm run typecheck
```

Expected: PASS; thirteen IDs are present and no family/library claims a complete single sequence.

- [ ] **Step 5: Commit only the control/output file and its test**

```powershell
git add src/features/modeling/catalog/controlOutputParts.json src/features/modeling/catalog/controlOutputParts.test.ts
git commit -m "feat(catalog): add control and output candidate cards"
```

### Task 5: Load, validate, merge, and index the three data files

**Files:**
- Create: `src/features/modeling/catalog/catalogLoader.ts`
- Create: `src/features/modeling/catalog/catalogIndex.ts`
- Modify: `src/features/modeling/catalog/catalogIndex.test.ts`

Depends on Tasks 2–4. The loader must remain static and deterministic; it must not use `fetch`, network APIs, or model defaults.

- [ ] **Step 1: Add failing loader/index tests**

Extend `catalogIndex.test.ts` with these assertions against the real JSON files:

```ts
import { loadEvidenceCatalog } from './catalogLoader';
import { buildCatalogIndex, searchCatalog, type CatalogIndex } from './catalogIndex';

it('loads all 27 entries only when manifest and category files agree', () => {
  const loaded = loadEvidenceCatalog();
  expect(loaded.status).toBe('ready');
  if (loaded.status !== 'ready') return;
  expect(loaded.index.entries).toHaveLength(27);
  expect(loaded.index.catalogVersion).toBe('evidence-backed-components@2026-08-02.1');
});

it('indexes aliases, IDs, references, and controlled filters without changing entry data', () => {
  const loaded = loadEvidenceCatalog();
  if (loaded.status !== 'ready') throw new Error(loaded.message);
  const byId = loaded.index.byId.get('sensor.cadr');
  expect(byId?.id).toBe('sensor.cadr');
  expect(searchCatalog(loaded.index, { query: 'CadR', nodeKind: 'all', category: 'all', entityType: 'all', host: 'all', strain: 'all', evidenceGrade: 'all', sequenceStatus: 'all', modelingCompatibility: 'all' })).toContain(byId);
  expect(searchCatalog(loaded.index, { query: '', nodeKind: 'sensor', category: 'pollutant-sensor', entityType: 'system', host: 'Escherichia coli', strain: 'all', evidenceGrade: 'A', sequenceStatus: 'all', modelingCompatibility: 'all' }).every((entry) => entry.category === 'pollutant-sensor' && entry.modeling.compatibleNodeKinds.includes('sensor'))).toBe(true);
});

it('returns unavailable status and leaves demo behavior independent when a file is invalid', () => {
  const invalid = buildCatalogIndex({ manifest: { ...manifest, catalogVersion: 'wrong' }, files: [] });
  expect(invalid.status).toBe('unavailable');
});
```

- [ ] **Step 2: Run the loader/index tests and verify the new API is absent**

Run `npm test -- src/features/modeling/catalog/catalogIndex.test.ts`.

Expected: FAIL because `catalogLoader.ts`, `catalogIndex.ts`, and their exported functions do not exist.

- [ ] **Step 3: Implement the loader result and static JSON imports**

Create `catalogLoader.ts` with this interface and behavior:

```ts
import manifestJson from './catalogManifest.json';
import controlOutputPartsJson from './controlOutputParts.json';
import pollutantSensorsJson from './pollutantSensors.json';
import qsSystemsJson from './qsSystems.json';
import { validateCatalogBundle } from './catalogValidator';
import { buildCatalogIndex } from './catalogIndex';
import type { CatalogIndex } from './catalogIndex';

export type CatalogLoadResult =
  | { status: 'ready'; index: CatalogIndex }
  | { status: 'unavailable'; message: string; errors: readonly { path: string; message: string }[] };

export function loadEvidenceCatalog(): CatalogLoadResult {
  const result = validateCatalogBundle({ manifest: manifestJson, files: { qsSystems: qsSystemsJson, pollutantSensors: pollutantSensorsJson, controlOutputParts: controlOutputPartsJson } });
  if (!result.ok) return { status: 'unavailable', message: 'Evidence-backed catalog unavailable', errors: result.errors };
  const indexed = buildCatalogIndex(result.value);
  if (indexed.status !== 'ready') return { status: 'unavailable', message: 'Evidence-backed catalog unavailable', errors: indexed.errors };
  return { status: 'ready', index: indexed.index };
}
```

The implementation must import `buildCatalogIndex` as a value, preserve unknown values, and never alter the parsed JSON object.

- [ ] **Step 4: Implement the immutable index and controlled search**

Create `catalogIndex.ts` with these exact public interfaces:

```ts
import type { CatalogCategory, CatalogEntry, CatalogManifest, CatalogSearchFilters } from './catalogTypes';

export interface CatalogIndex {
  catalogId: string;
  catalogVersion: string;
  manifest: CatalogManifest;
  entries: readonly CatalogEntry[];
  byId: ReadonlyMap<string, CatalogEntry>;
  tokensById: ReadonlyMap<string, readonly string[]>;
}
export interface CatalogBundleInput { manifest: unknown; files: Array<{ category: CatalogCategory; value: unknown }> | Record<string, never>; }
export type CatalogIndexBuildResult = { status: 'ready'; index: CatalogIndex } | { status: 'unavailable'; errors: readonly { path: string; message: string }[] };
export function buildCatalogIndex(bundle: { manifest: CatalogManifest; files: Record<CatalogCategory, { entries: CatalogEntry[] }> } | CatalogBundleInput): CatalogIndexBuildResult;
export function searchCatalog(index: CatalogIndex, filters: CatalogSearchFilters): CatalogEntry[];
```

Normalize lower-case ID, Chinese/English names, aliases, input/output names, literature IDs/DOI/PMID/URL, host, strain, and sequence accessions into tokens. Search must be substring-based and deterministic in manifest order. A filter value of `all` does not filter; host/strain filters match only known values. When `nodeKind` is set to a concrete kind, pre-filter to entries whose `modeling.compatibleNodeKinds` contains that kind; the dialog sets this from the selected node, while global browsing keeps `nodeKind: 'all'` and displays every entry. The index must not expose a mutating array or map.

- [ ] **Step 5: Run loader/index tests and all modeling tests**

Run:

```powershell
npm test -- src/features/modeling/catalog/catalogIndex.test.ts src/features/modeling/catalog/qsSystems.test.ts src/features/modeling/catalog/pollutantSensors.test.ts src/features/modeling/catalog/controlOutputParts.test.ts
npm test -- src/features/modeling/modelingCore.test.ts src/features/modeling/partLibrary.test.ts
npm run typecheck
```

Expected: PASS. The loader must expose 27 entries; demo part and simulation tests remain unchanged.

- [ ] **Step 6: Commit the loader and index**

```powershell
git add src/features/modeling/catalog/catalogLoader.ts src/features/modeling/catalog/catalogIndex.ts src/features/modeling/catalog/catalogIndex.test.ts
git commit -m "feat(catalog): load and index evidence-backed entries"
```

### Task 6: Add an independent catalog reference and preserve schemaVersion 1 data

**Files:**
- Create: `src/features/modeling/catalog/catalogReference.ts`
- Create: `src/features/modeling/catalog/catalogReference.test.ts`
- Create: `src/features/modeling/modelingRepository.test.ts`
- Modify: `src/features/modeling/types.ts`
- Modify: `src/features/modeling/modelingCore.ts`
- Modify: `src/features/modeling/partLibrary.ts`
- Modify: `src/features/modeling/modelingRepository.ts`
- Modify: `src/features/modeling/activity.ts`
- Modify: `src/features/modeling/activity.test.ts`

Depends on Task 5. The model remains `schemaVersion: 1`; there is no migration of `part` and no copy of quantitative observations into parameters.

- [ ] **Step 1: Write failing attach/detach and persistence tests**

Add these tests to `catalogReference.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { attachCatalogReference, detachCatalogReference } from './catalogReference';
import { createTemplate } from '../modelingCore';
import type { LiteratureCandidateReference } from './catalogTypes';
import type { TemplateLabels } from '../types';

const labels: TemplateLabels = {
  modelName: 'Reference test', description: 'Illustrative model',
  nodes: { sensorA: 'A', sensorB: 'B', sensorC: 'C', integration: 'Integration', gate: 'Gate', memory: 'Memory', response: 'Response', reporter: 'Reporter' },
};
const reference: LiteratureCandidateReference = {
  catalogId: 'evidence-backed-components', catalogVersion: 'evidence-backed-components@2026-08-02.1',
  entryId: 'sensor.cadr', displayNameSnapshot: 'CadR module', sourceStatus: 'passed', boundaryNote: 'Source-context card only.',
};

it('attaches only a sibling catalogReference and preserves every model field', () => {
  const model = createTemplate('licorice-quality', labels, '2026-08-02T00:00:00.000Z');
  const before = structuredClone(model);
  const attached = attachCatalogReference(model, model.nodes[0]!.id, reference);
  expect(attached.nodes[0]?.catalogReference).toEqual(reference);
  expect(attached.nodes.map(({ catalogReference: _reference, ...node }) => node)).toEqual(before.nodes);
  expect(attached.edges).toEqual(before.edges);
  expect(attached.outputNodeId).toBe(before.outputNodeId);
  expect(attached.schemaVersion).toBe(1);
});

it('detaches only the sibling field and preserves an unknown historical reference', () => {
  const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
  const attached = attachCatalogReference(model, model.nodes[0]!.id, { ...reference, entryId: 'removed.entry' });
  const detached = detachCatalogReference(attached, model.nodes[0]!.id);
  expect(detached.nodes[0]).not.toHaveProperty('catalogReference');
  expect(detached.nodes[0]?.parameters).toEqual(model.nodes[0]?.parameters);
});
```

Add repository tests that write a schemaVersion 1 JSON without `catalogReference`, load it unchanged, save a model with a reference, and verify `loadModelingRuns()[0].modelSnapshot?.nodes[0]?.catalogReference` retains `catalogVersion` and `displayNameSnapshot`. Add a project fixture whose nodes, edges, thresholds, `recordReference`, and other fields are valid while one node has a malformed `catalogReference`; `loadModelingProject()` must return a non-null model with that one sibling field removed (and a diagnostic/unavailable marker available to the UI), leave every other field intact, and leave the raw localStorage JSON untouched. Add a second fixture with an unknown-but-well-shaped ID/version and assert that reference is preserved byte-for-byte for historical display. The test must never expect a whole project to become `null` solely because one optional reference is malformed.

- [ ] **Step 2: Run the focused tests and verify missing helpers fail**

Run:

```powershell
npm test -- src/features/modeling/catalog/catalogReference.test.ts src/features/modeling/modelingRepository.test.ts
```

Expected: FAIL because the reference helpers and optional field do not exist.

- [ ] **Step 3: Add the sibling reference type without touching `ModelNode.part`**

In `src/features/modeling/types.ts`, import the single catalog-owned type and re-export that alias for existing modeling imports:

```ts
import type { LiteratureCandidateReference } from './catalog/catalogTypes';
export type { LiteratureCandidateReference };
```

Add exactly `catalogReference?: LiteratureCandidateReference;` after the existing `part` field in `ModelNode`. Do not add catalog properties inside `part`, change `ModelNodeParameters`, bump `NetworkModel.schemaVersion`, or define a second reference shape.

- [ ] **Step 4: Implement immutable reference helpers**

Create `catalogReference.ts`:

```ts
import type { LiteratureCandidateReference } from './catalogTypes';
import type { ModelNode, NetworkModel } from '../types';

function mapNode(model: NetworkModel, nodeId: string, map: (node: ModelNode) => ModelNode): NetworkModel {
  if (!model.nodes.some((node) => node.id === nodeId)) throw new Error('MODEL_NODE_NOT_FOUND');
  return { ...model, nodes: model.nodes.map((node) => (node.id === nodeId ? map(node) : node)), updatedAt: new Date().toISOString() };
}

export function attachCatalogReference(model: NetworkModel, nodeId: string, reference: LiteratureCandidateReference): NetworkModel {
  if (!reference.catalogId || !reference.catalogVersion || !reference.entryId || !reference.displayNameSnapshot) throw new Error('INVALID_CATALOG_REFERENCE');
  return mapNode(model, nodeId, (node) => ({ ...node, catalogReference: { ...reference } }));
}

export function detachCatalogReference(model: NetworkModel, nodeId: string): NetworkModel {
  return mapNode(model, nodeId, (node) => {
    const { catalogReference: _catalogReference, ...withoutReference } = node;
    return withoutReference;
  });
}

export function isLiteratureCandidateReference(value: unknown): value is LiteratureCandidateReference {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LiteratureCandidateReference>;
  return typeof candidate.catalogId === 'string' && candidate.catalogId.length > 0 && typeof candidate.catalogVersion === 'string' && candidate.catalogVersion.length > 0 && typeof candidate.entryId === 'string' && candidate.entryId.length > 0 && typeof candidate.displayNameSnapshot === 'string' && candidate.displayNameSnapshot.length > 0 && (candidate.sourceStatus === undefined || ['passed', 'needs-review', 'withdrawn'].includes(candidate.sourceStatus)) && (candidate.boundaryNote === undefined || typeof candidate.boundaryNote === 'string');
}
```

The spread/destructuring must preserve all node fields. `updatedAt` may change because it is the model edit timestamp; every other field listed in the specification must remain byte-for-byte equivalent.

- [ ] **Step 5: Extend model validation and persistence without migration**

In `modelingCore.ts`, import `isLiteratureCandidateReference` and add the optional check to the node predicate:

```ts
(modelNode.catalogReference === undefined || isLiteratureCandidateReference(modelNode.catalogReference))
```

Keep in-memory validation strict, then add a safe parser in `modelingCore.ts`:

`sanitizeCatalogReferences(value: unknown): { model: NetworkModel | null; droppedNodeIds: string[] }` first validates the schemaVersion 1 model structure while treating the optional sibling as untrusted, clones the model, and removes only malformed `catalogReference` fields. It returns `model: null` only when nodes, edges, thresholds, `recordReference`, or another non-catalog field is invalid; malformed references never null the project. Unknown-but-well-shaped catalog ID/version values remain unchanged, and `droppedNodeIds` lets the repository/UI mark the unavailable reference.

In `modelingRepository.ts`, call this parser from `loadModelingProject()` and run-snapshot loading, retain the raw localStorage string without rewriting or deleting it, preserve `recordReference`, thresholds, nodes, and edges, and retain valid references even when their ID/version is absent from the current index. `isModelingRun` must apply the same rule instead of filtering an otherwise valid run.

In `partLibrary.ts`, leave `applyPart`’s `{ ...node, ... }` spread intact and add a test proving a node with `catalogReference` retains the reference after a demo part replacement. Extend `activity.ts` with:

```ts
| 'catalog.attached'
| 'catalog.detached'
| 'catalog.unavailable'
| 'catalog.versionUnsupported'
```

and add English/Chinese activity labels in Task 7. The unavailable activity may carry `droppedNodeIds`, but it must not carry full sequence data.

- [ ] **Step 6: Run reference, repository, and existing modeling tests**

Run:

```powershell
npm test -- src/features/modeling/catalog/catalogReference.test.ts src/features/modeling/modelingRepository.test.ts src/features/modeling/modelingCore.test.ts src/features/modeling/partLibrary.test.ts src/features/modeling/activity.test.ts
npm run typecheck
```

Expected: PASS. Old JSON without `catalogReference` remains readable; malformed optional references are dropped in isolation while nodes, edges, thresholds, `recordReference`, and raw storage remain intact; unknown-but-well-shaped references remain visible; attach/detach changes only the sibling field and the model timestamp; no quantitative observation is present in `ModelNode.parameters`.

- [ ] **Step 7: Commit model compatibility**

```powershell
git add src/features/modeling/catalog/catalogReference.ts src/features/modeling/catalog/catalogReference.test.ts src/features/modeling/modelingRepository.test.ts src/features/modeling/types.ts src/features/modeling/modelingCore.ts src/features/modeling/partLibrary.ts src/features/modeling/modelingRepository.ts src/features/modeling/activity.ts src/features/modeling/activity.test.ts
git commit -m "feat(modeling): preserve evidence catalog references"
```

### Task 7: Build focused browser components, integrate the page, and enforce bilingual accessibility

**Files:**
- Create: `src/features/modeling/catalog/CatalogFilterBar.tsx`
- Create: `src/features/modeling/catalog/CatalogEntryCard.tsx`
- Create: `src/features/modeling/catalog/CatalogEntryDetail.tsx`
- Create: `src/features/modeling/catalog/EvidenceCatalogDialog.tsx`
- Create: `src/features/modeling/catalog/EvidenceCatalogDialog.test.tsx`
- Modify: `src/pages/ModelingPage.tsx`
- Modify: `src/pages/ModelingPage.test.tsx`
- Modify: `src/i18n/locales/zh-CN.ts`
- Modify: `src/i18n/locales/en-US.ts`
- Modify: `src/theme/cyber-scientific.css`
- Modify: `src/theme/contrast.test.ts`

Depends on Tasks 5 and 6. Components own presentation and focus behavior; `ModelingPage` owns model updates and activity events. No catalog parsing/filter algorithm is added to the page.

- [ ] **Step 1: Write failing dialog/component tests**

Create `EvidenceCatalogDialog.test.tsx` with a small real index fixture and test the following exact behaviors:

```ts
import { createRef } from 'react';
import { vi } from 'vitest';
import { loadEvidenceCatalog } from './catalogLoader';
import type { EvidenceCatalogDialogProps } from './EvidenceCatalogDialog';

const loadedCatalog = loadEvidenceCatalog();
if (loadedCatalog.status !== 'ready') throw new Error(loadedCatalog.message);
const onClose = vi.fn();
const onAttach = vi.fn();
const props: Omit<EvidenceCatalogDialogProps, 'open'> = {
  index: loadedCatalog.index,
  selectedNodeKind: 'sensor',
  triggerRef: createRef<HTMLButtonElement>(),
  onClose,
  onAttach,
  onDetach: vi.fn(),
};
const reporterEntry = loadedCatalog.index.entries.find((entry) => entry.modeling.compatibleNodeKinds.includes('reporter') && entry.evidence.reviewStatus === 'passed');
const pollutantSensorEntry = loadedCatalog.index.entries.find((entry) => entry.category === 'pollutant-sensor' && entry.modeling.compatibleNodeKinds.includes('sensor') && entry.evidence.reviewStatus === 'passed');
if (!reporterEntry || !pollutantSensorEntry) throw new Error('test fixture lacks compatible passed entries');

it('searches by ID, alias, literature identifier, and filters by category/host/evidence', async () => {
  const user = userEvent.setup();
  render(<EvidenceCatalogDialog {...props} open />);
  await user.type(screen.getByRole('searchbox', { name: '搜索文献元件库' }), 'CadR');
  expect(screen.getByRole('button', { name: /sensor\.cadr/i })).toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: '类别' }), 'pollutant-sensor');
  expect(screen.getByText('1 个候选')).toBeInTheDocument();
});

it('renders unknown values with a reason and labels observations as display-only', () => {
  render(<EvidenceCatalogDialog {...props} open />);
  expect(screen.getAllByText(/未知|Unknown/).length).toBeGreaterThan(0);
  expect(screen.getByText(/来源上下文观察|Source-context observation/)).toBeInTheDocument();
  expect(screen.getByText(/不会自动成为模型参数|Not applied as model parameter/)).toBeInTheDocument();
});

it('moves focus into the dialog, closes on Escape, and restores the trigger focus', async () => {
  const user = userEvent.setup();
  render(<EvidenceCatalogDialog {...props} open />);
  expect(screen.getByRole('heading', { name: /文献元件库|Evidence-backed library/ })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('only enables attach for passed entries and passes a versioned snapshot', async () => {
  const user = userEvent.setup();
  render(<EvidenceCatalogDialog {...props} open selectedNodeKind="sensor" />);
  await user.click(screen.getByRole('button', { name: /CadR/ }));
  await user.click(screen.getByRole('button', { name: /附加|Attach/ }));
  expect(onAttach).toHaveBeenCalledWith(expect.objectContaining({ catalogId: 'evidence-backed-components', catalogVersion: 'evidence-backed-components@2026-08-02.1', entryId: 'sensor.cadr', displayNameSnapshot: expect.any(String) }));
});

it('blocks a reporter candidate on a sensor node, allows a passed pollutant sensor on a sensor node, and explains the mismatch', async () => {
  const user = userEvent.setup();
  render(<EvidenceCatalogDialog {...props} open selectedNodeKind="sensor" />);
  await user.click(screen.getByRole('button', { name: new RegExp(reporterEntry.id, 'i') }));
  expect(screen.getByRole('button', { name: /附加|Attach/ })).toBeDisabled();
  expect(screen.getByText(/节点类型不兼容|incompatible node kind/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: new RegExp(pollutantSensorEntry.id, 'i') }));
  expect(screen.getByRole('button', { name: /附加|Attach/ })).toBeEnabled();
});
```

Modify `ModelingPage.test.tsx` to select a sensor, open the new library entry point, attach `sensor.cadr`, and deep-compare a snapshot of `part`, `parameters`, `id`, `x`, `y`, `edges`, edge weights/enabled values, and `outputNodeId` before and after. Test detach restores the absence of only `catalogReference`; test an unknown historical reference shows the translated unavailable state and leaves the model in place.

- [ ] **Step 2: Run focused UI tests and record the expected missing-component failure**

Run:

```powershell
npm test -- src/features/modeling/catalog/EvidenceCatalogDialog.test.tsx src/pages/ModelingPage.test.tsx
```

Expected: FAIL because the dialog components, catalog entry point, and new translations do not exist.

- [ ] **Step 3: Implement the controlled filter bar and result card contracts**

Create `CatalogFilterBar.tsx` with this exact props interface:

```ts
import type { CatalogNodeKind, CatalogSearchFilters } from './catalogTypes';
import type { CatalogIndex } from './catalogIndex';

export interface CatalogFilterBarProps {
  value: CatalogSearchFilters;
  index: CatalogIndex;
  resultCount: number;
  onChange: (next: CatalogSearchFilters) => void;
  onClear: () => void;
}
export function CatalogFilterBar(props: CatalogFilterBarProps): JSX.Element;
```

Render a labelled searchbox, node-kind/category/entity/host/strain/evidence/sequence/modeling comboboxes, current filter summary, result count, and clear button. The node-kind value defaults to `all` for global browsing and is set to the selected node’s `CatalogNodeKind` when opened from a node. Every option is derived from `index` metadata or the controlled `CatalogNodeKind` union; no English or Chinese string is hard-coded in JSX.

Create `CatalogEntryCard.tsx`:

```ts
import type { CatalogEntry } from './catalogTypes';
export interface CatalogEntryCardProps { entry: CatalogEntry; selected: boolean; onSelect: (entryId: string) => void; }
export function CatalogEntryCard({ entry, selected, onSelect }: CatalogEntryCardProps): JSX.Element;
```

Use a semantic `button` or article/button combination, visible ID and localized name, textual evidence/sequence labels plus icons, and `aria-pressed` for selection. Long IDs and aliases use a title/disclosure instead of forcing the grid wider.

- [ ] **Step 4: Implement the detail panel and exact metric boundary**

Create `CatalogEntryDetail.tsx` with:

```ts
import type { CatalogEntry, CatalogNodeKind, CatalogValue, LiteratureCandidateReference } from './catalogTypes';
export interface CatalogEntryDetailProps {
  entry: CatalogEntry | null;
  selectedNodeKind?: CatalogNodeKind;
  canAttach: boolean;
  attachedReference?: LiteratureCandidateReference;
  onAttach: (reference: LiteratureCandidateReference) => void;
  onDetach: () => void;
}
export function CatalogEntryDetail(props: CatalogEntryDetailProps): JSX.Element;
```

Define the formatter in the same module so unknown values never become blank UI text:

```ts
function formatCatalogValue<T>(value: CatalogValue<T>, unknownLabel: string): string {
  if (value.state === 'known') return String(value.value);
  return value.reason ? `${unknownLabel}: ${value.reason}` : unknownLabel;
}
```

Render semantic headings, signal tables, context definition lists, evidence grade/review status/boundary notes, each literature source as an external link with visible DOI/PMID/URL, sequence state/accession records, and each quantitative observation as:

```tsx
<section className="catalog-observation" aria-label={t('modeling.catalog.sourceObservation')}>
  <strong>{observation.metric}</strong>
  <span>{formatCatalogValue(observation.value, t('modeling.catalog.unknown'))}</span>
  <span>{formatCatalogValue(observation.unit, t('modeling.catalog.unknown'))}</span>
  <small>{observation.originalMeaning}</small>
  <small>{t('modeling.catalog.notModelParameter')}</small>
</section>
```

The formatter must print `未知 / Unknown` and the optional reason; it must not render an empty string for an unknown. Compute `nodeKindCompatible = selectedNodeKind !== undefined && entry?.modeling.compatibleNodeKinds.includes(selectedNodeKind) === true`; the attach button is disabled unless the entry exists, `reviewStatus === 'passed'`, `canAttach` is true, and `nodeKindCompatible` is true. When `nodeKindCompatible` is false, render a translated incompatibility reason. Attach constructs only `{ catalogId, catalogVersion, entryId, displayNameSnapshot, sourceStatus, boundaryNote }`; it never copies observations or sequences.

- [ ] **Step 5: Implement the dialog shell with focus, Escape, and unavailable/version states**

Create `EvidenceCatalogDialog.tsx` with this public contract:

```ts
import type { RefObject } from 'react';
import type { CatalogIndex } from './catalogIndex';
import type { CatalogNodeKind, LiteratureCandidateReference } from './catalogTypes';
export interface EvidenceCatalogDialogProps {
  open: boolean;
  index: CatalogIndex | null;
  unavailableMessage?: string;
  selectedNodeName?: string;
  selectedNodeKind?: CatalogNodeKind;
  selectedReference?: LiteratureCandidateReference;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onAttach: (reference: LiteratureCandidateReference) => void;
  onDetach: () => void;
}
```

When `open` becomes true, focus the dialog heading (or the searchbox after the heading is announced). Install a scoped Escape listener that calls `onClose`, and on close call `triggerRef.current?.focus()`. Use `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, a visible close button, a results count, and a details region. If `index` is null, render the translated “Evidence-backed catalog unavailable” message and retain the page/model; if the selected reference catalog version differs from the supported index version, render the read-only version state and allow detach but not attach. Pass `selectedNodeKind` into the search filter and detail panel: a concrete kind pre-filters candidates, while an omitted kind keeps global browsing available and disables attach. A candidate can be attached only when its `compatibleNodeKinds` contains the current kind, its review status is `passed`, and the catalog version is writable. Respect `prefers-reduced-motion` by relying on CSS media rules only.

- [ ] **Step 6: Integrate the browser without inflating model logic**

In `ModelingPage.tsx`, add:

```ts
const catalogTriggerRef = useRef<HTMLButtonElement>(null);
const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
const catalogLoad = useMemo(() => loadEvidenceCatalog(), []);
const catalogIndex = catalogLoad.status === 'ready' ? catalogLoad.index : null;
```

Add a translated “文献元件库 / Evidence-backed library” button next to the existing demo-part button. Keep the existing demo-part dialog and `applyPart` behavior unchanged. Pass `selectedNode?.catalogReference` and `selectedNode?.kind` to the dialog. Implement page handlers:

```ts
const attachSelectedCatalog = (reference: LiteratureCandidateReference): void => {
  if (!selectedNode) return;
  updateModel((current) => attachCatalogReference(current, selectedNode.id, reference), {
    kind: 'structure',
    activity: { type: 'catalog.attached', subjectId: selectedNode.id, label: reference.entryId },
  });
  setCatalogDialogOpen(false);
  setNoticeKey('modeling.catalog.attachCompleted');
};

const detachSelectedCatalog = (): void => {
  if (!selectedNode?.catalogReference) return;
  const entryId = selectedNode.catalogReference.entryId;
  updateModel((current) => detachCatalogReference(current, selectedNode.id), {
    kind: 'structure',
    activity: { type: 'catalog.detached', subjectId: selectedNode.id, label: entryId },
  });
  setNoticeKey('modeling.catalog.detachCompleted');
};
```

Render an inspector reference block showing the snapshot ID/name and a detach action. If `catalogIndex.byId` lacks the current reference or its version is unsupported, show the translated historical-unavailable state and retain the raw reference. Pass `EvidenceCatalogDialog` the focus trigger and callbacks. Do not mutate the model on search, filter, selection, or detail view.

- [ ] **Step 7: Add all bilingual copy and activity labels**

Add matching keys under `modeling.catalog` in both locale files for: entry point, dialog title/kicker/description, search, result count, category/entity/host/strain/evidence/sequence/modeling filters, clear filters, no results and reason, unknown and unknown reason, source-context observation, not-model-parameter boundary, attach/detach, passed/needs-review/withdrawn, unavailable catalog, unsupported version, historical unavailable reference, sequence status, effect direction, source/accession labels, close, and focus instructions. Add activity keys for `catalog.attached`, `catalog.detached`, `catalog.unavailable`, and `catalog.versionUnsupported`.

Use semantic key names and these exact boundary meanings:

```ts
// zh-CN
sourceObservation: '来源上下文观察';
notModelParameter: '不会自动成为模型参数';
catalogUnavailable: '文献元件库暂不可用';
historicalUnavailable: '历史引用不可用';
unsupportedVersion: '当前目录版本不支持写入新引用';
attachCompleted: '文献候选引用已附加，演示部件和参数保持不变。';

// en-US
sourceObservation: 'Source-context observation';
notModelParameter: 'Not applied as a model parameter';
catalogUnavailable: 'Evidence-backed catalog unavailable';
historicalUnavailable: 'Historical reference unavailable';
unsupportedVersion: 'This catalog version is read-only for new references';
attachCompleted: 'The literature reference was attached; demo part and parameters were preserved.';
```

Do not place visible copy directly in component code. Long DOI/URL/accession values must use a localized “show full value” control or `title` plus an expandable `<details>` block.

- [ ] **Step 8: Add focused catalog styles and CSS contract tests**

Add to `cyber-scientific.css` a dedicated block with these selectors and minimum contracts:

```css
.evidence-catalog-dialog { width: min(1180px, calc(100vw - 48px)); max-height: min(860px, calc(100vh - 40px)); overflow: auto; }
.evidence-catalog-dialog__body { display: grid; grid-template-columns: minmax(260px, .35fr) minmax(0, .65fr); min-height: 520px; }
.catalog-filter-bar { display: grid; gap: 8px; padding: 16px; border-bottom: 1px solid rgb(0 231 255 / 14%); font-size: 14px; }
.catalog-entry-list { display: grid; gap: 8px; max-height: 620px; overflow: auto; padding: 12px; }
.catalog-entry-card { min-width: 0; padding: 12px; border: 1px solid rgb(0 231 255 / 18%); }
.catalog-entry-card:focus-visible, .catalog-filter-bar :focus-visible, .evidence-catalog-dialog :focus-visible { outline: 2px solid var(--teal-500); outline-offset: 2px; }
.catalog-entry-detail { min-width: 0; padding: 18px; font-size: 14px; }
.catalog-value--long { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.catalog-value-disclosure { overflow-wrap: anywhere; }
.catalog-observation { display: grid; gap: 4px; padding: 10px; border: 1px solid rgb(255 198 92 / 18%); }
.catalog-observation small, .catalog-boundary, .catalog-unknown { font-size: 13px; line-height: 1.45; }
@media (max-width: 1060px) { .evidence-catalog-dialog__body { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .evidence-catalog-dialog *, .evidence-catalog-dialog *::before, .evidence-catalog-dialog *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
```

Extend `contrast.test.ts` to assert `.catalog-entry-detail`, `.catalog-observation small`, and `.catalog-filter-bar` font sizes are at least 13px, all catalog interactive selectors have `:focus-visible`, long values use `overflow-wrap:anywhere`, and the reduced-motion rule exists. The test must not depend on a color-only state.

- [ ] **Step 9: Run focused UI, modeling, and accessibility tests**

Run:

```powershell
npm test -- src/features/modeling/catalog/EvidenceCatalogDialog.test.tsx src/pages/ModelingPage.test.tsx src/theme/contrast.test.ts
npm run typecheck
npm run lint
```

Expected: PASS. The page test must prove the before/after snapshot equality for all fields except `catalogReference` and `updatedAt`; keyboard Escape and focus restoration must pass in both locale setups.

- [ ] **Step 10: Commit browser, page, translations, and styles**

```powershell
git add src/features/modeling/catalog/CatalogFilterBar.tsx src/features/modeling/catalog/CatalogEntryCard.tsx src/features/modeling/catalog/CatalogEntryDetail.tsx src/features/modeling/catalog/EvidenceCatalogDialog.tsx src/features/modeling/catalog/EvidenceCatalogDialog.test.tsx src/pages/ModelingPage.tsx src/pages/ModelingPage.test.tsx src/i18n/locales/zh-CN.ts src/i18n/locales/en-US.ts src/theme/cyber-scientific.css src/theme/contrast.test.ts
git commit -m "feat(modeling): browse and attach evidence catalog entries"
```

### Task 8: Document boundaries, run full validation, self-review, and commit the plan implementation handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/modeling.md`
- Modify: `docs/testing.md`

Depends on Task 7. Documentation must describe the implementation that exists; it must not promise a scientific validation or a direct procurement sequence.

- [ ] **Step 1: Add the catalog boundary to README**

Add a BIO-NET subsection stating that the evidence-backed catalog is static JSON version `evidence-backed-components@2026-08-02.1`, contains exactly 27 source-context candidate cards, and is independent from `partLibrary.ts` and `BIONET-SIM-DEMO-0.2`. Document the modeling-page entry point, search/filter/detail workflow, reference-only attach semantics, unknown-value labels, and the fact that literature EC50/Hill/LOD/dynamic-range/response-time values never become edge weights or node parameters. Include the actual commands used for checks and the Windows desktop build.

- [ ] **Step 2: Document data flow and legacy compatibility in `docs/modeling.md`**

Add a catalog data-flow diagram:

```text
catalogManifest.json + three category JSON files
  -> catalogValidator / catalogLoader
  -> immutable ID/alias index
  -> browser search/filter/detail
  -> versioned node.catalogReference (sibling of node.part)
  -> modelingRepository project/run snapshot
```

State that schemaVersion 1 models without `catalogReference` remain readable, unknown historical IDs remain attached and visible as unavailable, family/system cards do not imply one sequence, and only a later calibrated algorithm version may use measured values.

- [ ] **Step 3: Add catalog test coverage and manual matrix to `docs/testing.md`**

Record unit coverage for fixed IDs/counts, unknown unions, sourceRef/unit/context, CadR SI audit, sequence status, loader failure, alias/filter search, and forbidden model mappings. Record component coverage for bilingual labels, details, long DOI/accession disclosure, no-results state, focus/Escape, attach eligibility, detach, unavailable catalog, unsupported version, old model import, and reduced motion. Record manual Windows checks at 1280px and 1920px, dark/light theme, Chinese/English, keyboard-only flow, and `npm run tauri -- build`.

- [ ] **Step 4: Run the exact project validation commands**

Run from the Windows project directory:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri -- build
git diff --check
```

Expected: each command exits 0. If the local Rust/Windows toolchain prevents the Tauri command, record the exact command and exact error in the handoff and leave all JavaScript checks intact; do not weaken TypeScript, lint, test, or build configuration.

- [ ] **Step 5: Perform the self-review required by the writing-plans workflow**

Run these searches over the completed implementation and documentation:

```powershell
$restricted = @('T'+'B'+'D', 'T'+'O'+'D'+'O', 'place'+'holder', '类'+'似前项') -join '|'
rg -n $restricted docs/superpowers/plans/2026-08-02-evidence-backed-component-catalog.md
rg -n "quantitativeObservations|edge-weight|km|hill|gain|threshold|catalogReference" src/features/modeling/catalog src/features/modeling/types.ts src/features/modeling/modelingCore.ts src/features/modeling/modelingRepository.ts
```

Expected: the first scan returns no restricted wording; the second scan shows the forbidden mapping guard and sibling reference without any assignment from observations to model parameters. Confirm the specification sections map to Tasks 1–8: fixed 27 IDs, unknown values, CadR SI gate, loader failure, legacy schema, attach/detach invariants, i18n/accessibility, reduced motion, docs, and validation.

- [ ] **Step 6: Commit documentation and report the implementation handoff**

```powershell
git add README.md docs/modeling.md docs/testing.md
git commit -m "docs(catalog): document evidence-backed component workflow"
git status --short --branch
```

Expected: a clean task branch except for unrelated pre-existing `.superpowers/` and sibling `__pycache__/` untracked paths; do not stage or delete those paths. Report the branch, commit hashes for each implementation task, command results, any toolchain limitation, and the exact catalog version.
