# BFN Local Versioned Module Library Persistence 1.0

## Status and scope

- Delivery: Batch 12.5.1 `ACTIVE`
- Exact base: `d7fdcbf13ec8847ec9480085756dfaf184c35331`
- Branch: `codex/bfn-local-versioned-module-library`
- Stored representation: `BFN-MODULE-TEMPLATE 1.0`
- Batch 12.5.0 status: `CANDIDATE`, not frozen
- Batch 12.5 user workflow: not authorized

This delivery adds a project-independent local repository for reusable module template metadata and immutable scientific versions. It adds no visible workflow, Project ownership, graph relationship, runtime dependency, or live linkage.

## Database contract

The IndexedDB database is independent from the BFN Workspace database:

- database name: `fluorescence-desktop-bfn-module-library`;
- structural version: `1`;
- `templates` store: key path `id`, no indexes;
- `versions` store: key path `id`;
- `versions.templateId`: non-unique index for template-scoped lookup;
- `versions.templateIdRevision`: unique compound index over `[templateId, revision]`.

Upgrade creates missing version-1 stores and indexes deterministically. Every successful open verifies the exact store, key-path, and index contract. An incompatible pre-existing schema fails closed. The implementation does not open, upgrade, or modify `fluorescence-desktop-bfn-workspace`; its structural version remains `1`.

## Stored records

`templates` stores only strict `BfnModuleTemplateMetadata` records. `versions` stores only strict, immutable `BfnModuleTemplateVersionV1` records. The version identity remains:

```text
${templateId}:version:${revision}
```

Metadata and science remain separate. No stored record contains a Project ID, Project ownership, graph edge, instance lineage, or UI state.

## Repository API

`BfnModuleLibraryRepository` exposes:

- `createTemplate()`;
- `getTemplateMetadata()`;
- `listTemplates()`;
- `getVersion()`;
- `listVersions()`;
- `saveScientificRevision()`;
- `updateMetadata()`;
- `deleteTemplate()`.

`createBfnModuleLibraryRepository()` selects IndexedDB when available and otherwise selects the localStorage fallback. Backend-specific constructors remain available for tests and controlled environments.

Metadata lists use descending `updatedAt` with ascending template ID as the deterministic tie-break. Version lists use descending revision.

## Revision and transaction semantics

Creation writes metadata and revision 1 together. A changed latest payload signature creates the next integer revision. The repository determines the actual latest persisted revision; the caller does not provide or control `latestRevision`. Saving the same latest payload signature returns the existing latest version with `created: false` and performs no metadata or version write. Metadata edits preserve every version.

IndexedDB allocates and writes a revision in one read-write transaction spanning both stores. The unique compound index prevents two records from claiming one template revision, and version writes use `add` so history cannot be overwritten. Template deletion removes metadata and every associated version in the same transaction.

The fallback key is `fluorescence-desktop.bfn-module-library.v1`. It stores one exact versioned envelope under a namespace separate from Workspace. Operations sharing one `Storage` instance are serialized in process; each completed write replaces the whole validated envelope once. This gives the same repository behavior for normal application use, including logical atomic deletion and collision-free revision allocation between repository instances in the same runtime.

## Fail-closed reads

Persistence content is untrusted. Every operation reads and validates the complete metadata/version snapshot. Metadata passes through `parseBfnModuleTemplateMetadata()`. Versions pass through `parseBfnModuleTemplateVersion()`, which validates the exact schema, schema version, version/template identity, positive revision, timestamp, payload contract, canonical identities, and payload signature before returning a deeply frozen clone.

Repository validation additionally requires:

- unique metadata and version identities;
- no orphan version;
- contiguous revisions beginning at 1;
- metadata `latestRevision` equal to the actual latest version;
- localStorage dictionary keys equal to the parsed record IDs;
- exact localStorage envelope shape and version.

No missing field is inferred and no scientific payload is repaired. Stable repository failures distinguish invalid input, duplicate/missing templates, corrupt metadata, corrupt versions, corrupt repository state, revision conflicts, blocked database access, and storage failure.

## Copy and Project boundary

Metadata reads return independent clones. Version reads return independent, deeply frozen clones. Caller mutation cannot alter persistence. Existing versions remain unchanged after metadata edits, later scientific revisions, or copy-on-create Project instantiation.

The repository does not import a BFN Project type, edit a Project, create a graph object, change network mode, or participate in Project loading or execution. Instantiation remains the pure Template 1.0 copy-on-create operation.

## Excluded workflow

This delivery adds no Save to Library control, My Modules view, module card, search/filter, version selector, Entity matching view, Add to Project control, or related i18n strings. Import/export, cloud sync, collaboration, individual-version deletion, and cross-document localStorage coordination remain outside Batch 12.5.1.

BFN-IR remains 2.3, BFN-SIM remains 2.2, Workspace IndexedDB remains structural version 1, and package dependencies are unchanged.
