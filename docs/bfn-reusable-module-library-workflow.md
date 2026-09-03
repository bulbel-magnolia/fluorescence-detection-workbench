# BFN Reusable Module Library User Workflow

- Delivery: Batch 12.5 `CANDIDATE`
- Status: correction candidate complete, awaiting Master Correction Review, not frozen
- Branch: `codex/bfn-reusable-module-library-workflow`
- Exact implementation base: `1d59a144e03eea4cdce70b3889936cd3e2e20f74`
- Exact correction base: `c4295d1335448ad2ca6b7f4296d77ab2dc5a18c1`
- Predecessors: Batch 12.5.0 and Batch 12.5.1 review `PASS`, both not frozen

Batch 12.5 connects the reviewed reusable-template and local-version repository contracts to the desktop BFN workspace. The workflow lets a researcher save a supported user-authored module, inspect saved science and historical versions, confirm biological identities, and add one independent copy to the current project.

## Entry points and layout

The selected-module Inspector exposes **Save to Module Library** when the current user-authored module satisfies the capture contract. Unsupported modules retain the control in a disabled state with a scientific, actionable explanation.

The existing Add Module drawer places **My Modules** before the current authoring and catalog entries. Opening it produces a dense split workspace:

- the left pane lists saved name, module type, latest version, and update time in deterministic order;
- the right pane presents the selected version and remains independently scrollable;
- normal desktop widths preserve the list/detail relationship, while narrower windows stack the panes without hiding actions.

The integration reuses the existing drawer, button, icon, form, table, typography, confirmation-dialog, focus, and theme-token primitives. It does not introduce a parallel component system or a new UI dependency.

## Saving and versioning

The save review shows the scientific definition before persistence. A researcher explicitly chooses one of two destinations:

1. save as a new module with a name and optional description;
2. save as a new version of one explicitly selected saved module.

Names never trigger automatic association. A definition equal to the selected module's latest scientific signature produces a no-op. A changed definition appends one immutable revision. Editing the saved name or description updates metadata only and leaves scientific history unchanged.

Private project entities naturally default to travelling with the saved module definition. Shared noncanonical identities remain confirmation points for each target project. Recognized canonical identities remain automatic. Dataset and Calibration Map dependencies, dormant models, missing records, and incomplete definitions are rejected with user-facing reasons.

## Scientific detail

The detail pane maps the stored definition into scientific software concepts:

- inputs and outputs with direction, biological entity, quantity, and unit;
- model family and model role;
- aligned parameter values, 95% intervals when recorded, and units;
- host, strain, medium, temperature, pH, input range, and time range when recorded;
- evidence basis, source, uncertainty method, and uncertainty notes;
- module version, save time, and version note.

Model evidence sources are resolved only through that model's declared provenance references. Static and accumulator summaries cannot absorb implementation-only provenance. For a first-order module, the steady-state and dynamic models are compared across evidence grade, uncertainty method, model provenance, resolved Context, and resolved Validity Domain. Identical metadata remains compact; any difference produces separately labelled steady-state and dynamic scientific summaries.

Historical versions are selectable and read-only. The presentation does not infer validation, approval, or experimental confirmation from executability or library membership.

## Entity confirmation and project copies

Adding a saved version follows exact scientific identity rules:

- canonical identities resolve automatically;
- private identities create fresh project entities;
- each shared noncanonical identity requires an explicit choice between creating a fresh entity and using one exact existing entity;
- every shared choice requires confirmation that it represents the same scientific entity;
- all confirmations must be complete before **Add to Current Project** becomes available.

The action uses the existing pure template-instantiation function and creates one independent module copy plus the minimal scientific records required by that copy. It does not create an Edge, Input Source, Output Monitor, Signal Pool, or Run; it does not switch network mode or start a simulation. Existing project copies do not track later library changes, and later project edits do not alter saved versions.

## Metadata, deletion, and failures

Researchers can edit the saved name and description without creating a revision. Cancelling an edit discards both draft fields and restores the persisted metadata before edit mode closes. Deleting a saved module requires the existing destructive confirmation dialog and removes the complete version history as one operation. Project copies already created remain in their projects.

Unreadable or inconsistent records produce a calm error panel with retry and back actions. The workflow does not repair, infer, or partially load scientific content. Errors use text and iconography in addition to color; disabled actions explain their prerequisite.

## Localization and scope

All visible workflow text uses the existing `bfn.moduleLibrary` namespace with aligned Simplified Chinese and English keys. The feature adds no cloud synchronization, sharing, marketplace, import/export, live linking, automatic entity guessing, automatic wiring, or individual historical-version deletion.

The implementation leaves BFN-IR 2.3, BFN-SIM 2.2, Workspace DB 1, Ideal Edge, Port Compatibility, the unit system, Accumulator runtime, Signal Pool, Designed Sender, Sender/Receiver, Temporal, Ontology, and Inverse Design contracts unchanged. Batch 12.5 remains `CANDIDATE`, awaiting Master Correction Review, and not frozen.
