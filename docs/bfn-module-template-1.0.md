# BFN Module Template 1.0

## Status

- Schema: `BFN-MODULE-TEMPLATE`
- Schema version: `1.0`
- Delivery: Batch 12.5.0 `ACTIVE` implementation candidate
- Runtime target: BFN-IR 2.3 projects
- Persistence and user workflow: outside Batch 12.5.0

This document defines the project-independent representation and pure conversion contract for reusable user-authored modules. It does not declare Batch 12.5.0 frozen or provide a module-library repository.

## Responsibility boundary

BFN-IR represents network objects that belong to a concrete project and participate in project computation. BFN-MODULE-TEMPLATE represents an immutable scientific payload that can create a new, self-contained project module.

The relationship is copy-on-create:

```text
source BFN-IR 2.3 module
  -> captureReusableModuleTemplatePayload()
  -> project-independent scientific payload
  -> BfnModuleTemplateVersionV1
  -> instantiateReusableModuleTemplate()
  -> independent BFN-IR 2.3 module instance
```

An instance has no live link to its template. Editing or deleting either side does not update or delete the other side, and project execution and export do not depend on a template or library repository.

## Metadata and immutable versions

Template identity metadata is separate from scientific versions:

- `BfnModuleTemplateMetadata` records `id`, user-facing name and description, creation/update timestamps, and the latest revision number.
- `BfnModuleTemplateVersionV1` records the fixed schema identity, version ID, template ID, positive revision, creation timestamp, optional note, normalized payload, and payload signature.
- `createBfnModuleTemplateVersionV1()` receives identity and timestamp data from its caller, computes the signature, and admits the result through the same strict parser used for imported data.

The version ID is exactly `${templateId}:version:${revision}`. Revision 1 is the initial scientific version. A scientific payload change creates a new positive integer revision; a metadata name or description edit does not. Saving the same latest payload signature is a no-op. A version is never modified in place, and the parser returns a deeply frozen clone. Template 1.0 does not delete an individual historical version. A future repository must delete metadata and all versions atomically when deleting a template.

This delivery defines and validates these value semantics only. Allocation, storage, no-op coordination, and deletion belong to Batch 12.5.1.

## Supported module classes

`payload.moduleClass` is an exact discriminated union:

| Class         | Active representation                                 | Required model structure                                                                                                                                                                |
| ------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static`      | one active static model                               | `hill_activation`, `hill_repression`, `linear_transfer`, `identity`, or `independent_inputs`                                                                                            |
| `first_order` | one active static model plus one active dynamic model | the dynamic model is `first_order` and its steady-state response exactly equals the paired static response                                                                              |
| `accumulator` | one active dynamic model and no static model          | the existing BFN-SIM 2.2 accumulator runtime contract, exact port quantity/unit pairing and initial state, model/module Evidence `independent_assumption`, and model uncertainty `none` |

A Designed Sender can be represented only through the generic `static` contract when the concrete project module is user-defined and otherwise passes every capture gate. Batch 12.5.0 does not preserve a specialized Designed Sender authoring draft or provide a specialized editor roundtrip.

Unknown classes and model families fail closed. A non-active model variant is not silently discarded; its presence makes capture fail.

## Normalized local references

The payload contains no source project-local module, port, model, Context, ValidityDomain, Provenance, Implementation, or embedded Entity IDs. Capture assigns deterministic local keys:

- ports: `port.input.N` followed by `port.output.N`;
- entities: `entity.N`, in first port-use order;
- models: `model.static`, `model.dynamic`, or `model.accumulator` according to the class;
- dependency sidecars: sequential `context.N`, `domain.N`, `provenance.N`, and `implementation.N` keys.

All model responses, ValidityDomain input ranges, active-model selectors, entity requirements, and sidecar references use these local keys. Keys are nonblank, unique within and across their namespaces where required, resolvable, deterministic for the same source representation, and validated before a payload is admitted.

Port order remains scientific: all inputs retain their source order, followed by all outputs in source order. Presentation-only module identity, description, and canvas position are not copied into the payload.

## Entity identity contract

Every referenced Entity is captured in exactly one mode.

### Canonical

`canonical` is limited to an exact AHL/HSL catalog identity resolved by the production resolver. The payload stores the authority, catalog ID, Entity ID, and canonical display name. Capture rejects conflicting project definitions. Parsing and instantiation call the resolver again, so a forged or stale tuple fails closed. Canonical Entity IDs remain unchanged in every instance.

### Embedded

`embedded` is available only for a private ordinary `user_defined` Entity with a complete, exact Entity definition and no reference from another module, Input Source, Output Monitor, or active dataset Entity reference. Its display name and nullable description are embedded. Each instantiation generates a fresh project-local Entity ID.

### Slot

`slot` represents a shared or externally referenced scientific Entity. Shared identity is never copied implicitly. The slot retains the source Entity ID for identity review, display metadata, and every participating port requirement: port key, direction, quantity type, and unit.

Each slot requires one explicit decision at instantiation:

- `existing_same_entity` selects an existing target-project Entity ID;
- `create_same_entity` creates a new ordinary user-defined Entity;
- both decisions must carry `identityConfirmation: 'same_scientific_entity'`.

All ports associated with one slot use the same decision. Missing, unexpected, malformed, name-guessed, or arbitrary-substitution decisions are rejected. The API records an explicit scientific identity assertion; it does not infer biological equivalence from names.

The final template-key-to-project-Entity mapping is injective across all modes. Two slot keys cannot bind to one target Entity, a slot cannot converge on a canonical Entity used by another key, and two canonical keys cannot name the same concrete canonical identity. Imported duplicate canonical identities fail parsing even when the payload is re-signed. Instance projection also rejects a collapsed mapping instead of assigning separate scientific ordinals from template keys alone.

## Dependency closure

Capture computes the smallest complete closure reachable from the active model set and the module's selected implementations:

- complete Context records referenced by models or ValidityDomains;
- complete ValidityDomains, with source port IDs rewritten to template port keys;
- complete Provenance records referenced by models or implementations;
- complete biological Implementations and their shared Provenance references.

Repeated references share one local key. Every referenced Context, ValidityDomain, Provenance record, and Implementation must resolve to exactly one registry record. Zero matches return `dependency_missing`; multiple matches, including byte-identical duplicate records, return `dependency_conflict`. Extra unrelated registry records are omitted.

An active model with any `sourceDatasetIds` is rejected. Dataset packaging is not part of Template 1.0. A Calibration Map targeting the selected module is rejected as `calibration_map_unsupported`; unrelated Calibration Maps remain outside the minimal closure. Demo modules, demo active models, catalog-backed model references, unresolved dependencies, and dormant model variants are also rejected.

## Strict parsing

`isBfnModuleTemplateVersionV1(value)` is a non-throwing runtime guard. `parseBfnModuleTemplateVersion(value)` returns a deeply frozen structured clone of a valid version and otherwise throws `BfnModuleTemplateSchemaError` with the stable code `BFN_MODULE_TEMPLATE_SCHEMA_INVALID`.

The parser accepts only a plain, acyclic data tree with exact own data properties. It rejects accessors, symbol keys, custom prototypes, sparse arrays, non-finite numbers, unknown or missing fields, unknown schema/version/discriminators, invalid timestamps and revisions, unresolved local references, invalid class-specific contracts, duplicate canonical identities, invalid canonical identities, and a signature that does not match the scientific projection. Accumulator versions require exact Signal Pool Evidence and uncertainty values even when an imported payload carries a freshly computed signature. These checks run on runtime `unknown` values and do not rely on TypeScript assertions.

Metadata has separate `isBfnModuleTemplateMetadata()` and `parseBfnModuleTemplateMetadata()` entry points with exact-shape validation.

## Capture

```ts
captureReusableModuleTemplatePayload(
  project,
  moduleId,
  { entityPolicies },
): BfnTemplateCaptureResult
```

Capture first applies a template-local, non-throwing runtime preflight to every Project structure it will read, then requires a valid BFN-IR 2.3 project and exactly one selected non-demo module whose `authoring.origin` is `user_defined`. The preflight covers first-order response/tau/initial state, ValidityDomain ranges/time range, Dataset Entity arrays, selected module records, and dependency records without modifying the frozen IR migration. Capture resolves the exact active static, paired first-order, or accumulator representation; audits datasets, Calibration Maps, dormant variants, model catalog references, entities, ports, and closure dependencies; normalizes all local references; and runs central payload validation. Private user-defined entities require an explicit `embedded` or `slot` policy. Shared entities are forced to `slot`.

The operation is pure: it does not edit the source project, browser storage, graph, runtime state, catalog, or ontology.

## Instantiation

```ts
instantiateReusableModuleTemplate(
  version,
  targetProject,
  bindings,
  { instanceId, instanceName, instanceDescription },
): BfnTemplateInstantiationResult
```

Instantiation reparses the complete template version, applies the same non-throwing target Project preflight, validates the target as BFN-IR 2.3, validates exact options and slot decisions, and re-resolves every canonical Entity. One unified map allocates the module, port, model, embedded/created Entity, Context, ValidityDomain, Provenance, and Implementation IDs from the caller-provided nonblank `instanceId`. The resolved Entity mapping must be injective. Any duplicate or target-project collision fails closed; the function does not retry or silently rename IDs.

Collision reservation includes both existing definitions and pre-existing references. Edge node/port references, model Context/ValidityDomain/Provenance/Dataset/Port references, module active-model/Implementation references, ValidityDomain port/Context references, Dataset references, and Calibration Map target/Context/Dataset references cannot be activated by a newly generated ID.

On success it returns a cloned project containing exactly one new module plus the minimum required sidecars. It creates no Edge, Input Source, Output Monitor, Run, template lineage field, graph connection, or network-mode change. Existing canonical and bound Entity IDs are preserved; all other instance-local IDs are fresh.

Before return, the implementation rechecks class-specific model rules, the existing accumulator admission contract where applicable, reference resolution, complete BFN-IR 2.3 validity, and scientific projection equality. Both the input version and target project remain unchanged.

## Scientific projection

`createReusableModuleScientificProjection()` dereferences template-local keys into an ID-independent scientific value. `createInstantiatedReusableModuleScientificProjection()` applies the same semantics to the generated project object. Equality uses canonical JSON for these projections.

The projection includes:

- module class;
- ordered port directions, Entity relationships, quantity types, and units;
- canonical, embedded, or slot Entity semantics and slot requirements;
- active model mode, family, version, complete response/parameter values and intervals, initial state, Context, ValidityDomain, Provenance, evidence grade, and uncertainty method;
- module evidence and implementation state;
- selected complete Implementations and their Provenance.

It excludes source/template/instance local keys and IDs, template metadata, version note/timestamps, module authoring name/description, port presentation labels, and canvas position. Unordered dependency sets are dereferenced and canonically sorted.

Capture-to-instantiate roundtrips for static, paired first-order, and accumulator modules require exact projection equality. A concrete Entity ID used by more than one template Entity key makes instance projection fail, so Entity-relation collapse cannot be hidden by local-key ordinals.

## Payload signature

`createBfnModuleTemplatePayloadSignature()` canonicalizes the ID-independent scientific projection and applies a small local deterministic two-seed FNV-1a fingerprint. The format is `bfn-template-v1:<hex>:<canonical-length>`.

The signature changes when a projected scientific field changes, including parameters, units, quantities, Entity semantics, model versions, evidence, uncertainty, validity ranges, Context, Provenance, or Implementations. It remains stable across object property order, source project IDs, newly generated instance IDs, template metadata, authoring display metadata, and canvas position.

This signature is an equality and change-detection aid. It is not cryptographic, is not an authenticity proof, and must not be used as a security boundary.

## Unsupported boundaries

Batch 12.5.0 does not implement persistence, an IndexedDB or localStorage repository, revision allocation, library import/export, cloud sync, team sharing, automatic graph wiring, automatic updates, live instance linkage, Dataset or Calibration Map packaging, arbitrary Entity substitution, or user-visible module-library UI.

BFN-IR remains 2.3, BFN-SIM remains 2.2, and the Workspace IndexedDB structural version remains 1. No package dependency is added.
