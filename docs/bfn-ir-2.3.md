# BFN-IR 2.3 Dynamic Process Representation Extension

Batch 12.4.0 is the reviewed predecessor for Batch 12.4.1. Its implementation review and correction review passed; Master Control deferred separate freeze bookkeeping. This document records the fixed representation input and does not declare Batch 12.4.0 or 12.4.1 FROZEN.

## Current representation

The current project envelope is:

```text
schema = BFN-IR
schemaVersion = 2.3
```

BFN-IR 2.3 adds a dynamic accumulator model as a distinct variant:

```text
mode = dynamic
family = accumulator
inputPortId
outputPortId
initialState
uncertaintyMethod
```

inputPortId references the module input whose value will eventually be integrated. outputPortId references the module state/output Port. initialState inherits the scientific unit of that output Port. The representation contains no tau, steadyStateResponse, or response.

This schema capability remains generic. It does not require the input to be production_rate, the output to be concentration, or the two Ports to share an Entity. BFN-SIM 2.2 now applies those requirements as a central, target-scoped runtime admission contract without changing or migrating the serialized BFN-IR representation.

## Active model invariant

FunctionalModule.activeModelIds represents exactly these useful forms:

| Module form  | Active static | Active dynamic |
| ------------ | ------------- | -------------- |
| static-only  | required      | absent         |
| paired       | required      | required       |
| dynamic-only | absent        | required       |

At least one active model ID must be present. Every active ID must be non-empty, resolve to a model in the same module, and match the declared static/dynamic mode. The 2.3 import validator rejects empty, missing, duplicated, or mode-mismatched references instead of repairing them.

Accumulator Port references are also structural invariants. inputPortId must resolve to an input-direction Port in module.inputPorts; outputPortId must resolve to an output-direction Port in module.outputPorts.

## Resolution

Static networks resolve only an active static model. A dynamic-only module therefore resolves to no executable model in static mode.

Dynamic networks resolve an active dynamic model first and retain the existing active-static quasi-static fallback when no dynamic model exists. Resolution can select an accumulator representation, while execution admission remains a separate decision.

## Migration and persistence

The central migration chain is:

```text
2.0 → 2.1 → 2.2 → 2.3
2.1 → 2.2 → 2.3
2.2 → 2.3
```

The 2.2-to-2.3 step is a structural clone plus schema-version update. It does not create an accumulator, remove a static model, change active IDs, infer a Signal Pool, or rewrite Ports, parameters, Context, validity, uncertainty, provenance, implementation, or authoring metadata. A current 2.3 project is validated and returned as a deep clone. Unknown future versions fail closed with BFN_IMPORT_SCHEMA_INVALID.

JSON, the existing localStorage key, Workspace Draft, and Workspace Version all use the same current parser. Historical Draft/Version reads expose a migrated 2.3 copy without rewriting the stored snapshot. Workspace IndexedDB remains structural version 1; database name, object stores, indexes, migration marker, and storage keys are unchanged.

## Computation signature

When an accumulator is the effective model, its model identity, version, mode, family, input/output Port references, initial state, Context, validity domain, source datasets, evidence grade, demo state, and uncertainty method enter the computation signature. Module authoring text, localized display names, descriptions, and canvas position remain excluded.

## Runtime boundary

New runs use BFN-SIM 2.2. A target-reachable effective accumulator executes only when it satisfies the narrow scientific contract documented in [BFN-SIM 2.2 Accumulator Runtime](bfn-sim-2.2-accumulator-runtime.md). Representable accumulators outside that contract fail closed with `accumulator_model_contract_invalid` and a stable `details.reason`.

Runtime admission remains scoped to the selected output Monitor. An accumulator on another Monitor path does not block the selected run. A paired accumulator is dormant in static mode when the active static model is effective. A dynamic-only module in static mode continues through the existing `temporal_execution_unsupported` path. BFN-IR stays 2.3; no runtime-only result field is added to the Project schema.

## Roadmap state

```text
Batch 12.3 = FROZEN
Batch 12.4.0 = reviewed predecessor; bookkeeping deferred
Batch 12.4.1 = ACTIVE implementation candidate
Batch 12.4 = PLANNED / NOT AUTHORIZED
```

Batch 12.4.1 implements the narrow accumulator execution semantics. Signal Pool materialization, authoring UI, signal selection, degradation, dilution, clearance, amount/volume conversion, multi-rate integration, initial-state uncertainty, and feedback ODE solving remain outside this implementation candidate.
