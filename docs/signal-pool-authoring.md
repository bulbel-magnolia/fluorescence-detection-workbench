# Batch 12.4 Signal Pool Authoring & Integration

Batch 12.4 remains a **CANDIDATE** on branch
`codex/bfn-signal-pool-authoring-integration`. Its identity-boundary Correction
Pass advances pre-fix candidate `9d45d350abf07ef6034a8ce04f82d3b0d90fd76b`
to implementation candidate `6150203fe9c75b9acbc308cb782104e80cab22cb`.
Batch 12.4.0 is a CANDIDATE with Master Review PASS and freeze bookkeeping
deferred. Batch 12.4.1 is a CANDIDATE with Final Correction Review PASS and
freeze bookkeeping deferred. Batch 12.4 awaits final combined review; none of
these three batches is FROZEN.

## Purpose

Signal Pool is the user-facing form of the existing explicit accumulator. It
turns one signal's production rate into that same signal's concentration over
time:

```text
dC/dt = r(t)
C(0) = C0
```

The feature adds authoring, materialization, and graph integration. It does not
implement a second numerical runtime. Every created pool executes through the
existing BFN-SIM 2.2 accumulator path and central
`assessBfnAccumulatorRuntimeContract()` admission.

## Authoring contract

The form contains exactly these user fields:

| Field                 | Contract                                             |
| --------------------- | ---------------------------------------------------- |
| Name                  | required, preserved verbatim                         |
| Description           | optional, preserved verbatim or stored as `null`     |
| Signal                | required, selected from one explicit identity source |
| Concentration unit    | `nM` or `uM`                                         |
| Initial concentration | finite, non-negative, expressed in the selected unit |

Initial state is an empty name and description, no selected signal, `nM`, and
`C0 = 0`. Zero is valid. Blank, NaN, infinity, and negative initial
concentrations are rejected. The Add action remains unavailable until the
required fields form a valid draft.

The interface presents a specialized Signal Pool option alongside General
Functional Module and Designed Sender in the existing Add Module workflow. It
does not add a top-level navigation page. User-facing copy is localized in
Simplified Chinese and English.

## Signal identity

Signal identity always comes from one explicit source:

1. **Known AHL/HSL signal.** The form reuses the Designed Sender canonical
   signal identity source. A known 3OC6-HSL selection therefore produces the
   same exact Entity ID used by a Designed Sender output. It does not create a
   duplicate project-defined Entity. Catalog availability is independent of
   the current graph.
2. **Existing project signal Entity.** An Entity is eligible only when at least
   one current Input Source, module, or Output Monitor Port uses that exact ID
   with `quantityType = concentration` or `production_rate`. Activity-only,
   expression-level-only, and registry-only untyped Entities are excluded. The
   selected exact ID is preserved; display text, aliases, and name patterns are
   never used to infer signal semantics.
3. **Custom signal.** The user explicitly supplies a name and the materializer
   creates one ordinary `BfnEntityDefinition` with `origin = user_defined`.
   The path performs no fuzzy matching, canonical mapping, or experimental
   validation claim. ID or definition conflicts fail closed.

`collectSignalPoolEligibleEntityIds()` is the single existing-signal
eligibility source for the selector, draft builder, and materializer. The
materializer re-evaluates the current project, so a draft whose last qualifying
Port was removed fails with `signal_identity_invalid`.

## Materialized BFN object

A successful Add creates exactly one ordinary `BfnFunctionalModule`. Its Ports
are:

```text
input
  entity = E
  quantityType = production_rate
  unit = nM/h | uM/h
  direction = input
  display label = Production rate / 产生速率

output
  entity = E
  quantityType = concentration
  unit = nM | uM
  direction = output
  display label = Concentration / 浓度
```

Input and output use the same exact Entity. Selecting `nM` fixes the unit pair
to `nM/h → nM`; selecting `uM` fixes it to `uM/h → uM`. No other unit pair or
hidden conversion is available.

The active model is dynamic-only:

```text
mode = dynamic
family = accumulator
inputPortId = created rate input
outputPortId = created concentration output
initialState = C0
uncertaintyMethod = none

activeModelIds.dynamic = accumulator model ID
activeModelIds.static = absent
```

The module contains no static response, `tau`, or steady-state response. It
uses `independent_assumption` at module and model level,
`implementationIds = []`, `implementationState = unspecified`,
`sourceDatasetIds = []`, `provenanceIds = []`, and `contextId = null`. A
minimal ValidityDomain sidecar uses `inputRanges = []` and `contextId = null`;
it does not invent an experimental working range. Fixed Port labels are product
semantics and do not claim user-authored Port metadata.

The pure materializer returns a new project and the added module ID. It adds a
custom Entity sidecar only for an explicitly custom signal. Every result must
pass the existing accumulator runtime contract; the Signal Pool layer does not
define a competing scientific validator.

Before constructing any BFN object, runtime identity validation explicitly
dispatches `known`, `existing`, and `custom`. Any other serialized
`signal.source` fails closed with `signal_identity_invalid`. Known identities
still require exact catalog ID, Entity ID, and display name; custom identities
still require the generated Entity ID, a nonblank display name, and no existing
Entity conflict.

## Graph transaction

One successful Add is one Project edit and one Undo/Redo transaction. Undo
removes the module, ValidityDomain, and any custom Entity created by that edit;
Redo restores the same object graph.

The transaction leaves these collections and settings unchanged:

```text
Input Sources
Ideal Edges
Output Monitors
Runs
network mode
```

It does not connect a nearby Sender or Receiver, propose automatic insertion,
switch a static network to dynamic mode, or run a simulation. Direct Designed
Sender `production_rate → concentration` Receiver wiring remains rejected by
the unchanged Port Compatibility contract. Users explicitly create and connect
the intermediate Signal Pool through the existing Ideal Edge workflow.

## Runtime behavior

In a dynamic network, the production materializer's module follows the
BFN-SIM 2.2 left-endpoint sample-and-hold and deferred-state contract. For a
constant `10 nM/h` rate, `C0 = 2 nM`, and `dt = 0.5 h`, its samples are:

```text
2, 7, 12, 17, ...
```

A downstream Receiver reads current `Ck`; it does not observe future
`C(k+1)` at the rate-change sample. In a static network the pool can be added,
while a selected path containing its dynamic-only model fails through the
existing `temporal_execution_unsupported` boundary. Add never changes the
network mode.

Signal Pool is a deterministic uncertainty transform. Its model declares
`uncertaintyMethod = none`, contributes no parameter or initial-state interval,
and preserves an executable upstream parameter envelope. It neither creates a
zero-width interval nor blocks a valid upstream interval.

## Persistence and computation identity

The module uses the existing BFN-IR 2.3 representation. JSON import/export,
localStorage, Workspace Draft, and Workspace Version preserve its dynamic-only
model, exact Entity, unit pair, initial state, and authoring metadata. Workspace
IndexedDB structural version remains `1`.

The computation signature changes when the initial concentration, signal
identity, or unit pair changes. Name, description, localized labels, and canvas
position remain descriptive and do not change the scientific signature.

## Scientific boundary

Signal Pool v1 implements pure accumulation with exactly one rate input. It
does not include degradation, dilution, clearance, half-life, volume, amount,
multiple rate inputs, initial-state uncertainty, feedback solving,
accumulator-to-first-order ordering, automatic insertion/wiring, or reusable
module templates. BFN-IR remains 2.3, BFN-SIM remains 2.2, and the existing
Designed Sender, Catalog Receiver, Port Compatibility, Ideal Edge, temporal
evidence, Ontology, Inverse Design, and Workspace database contracts remain
unchanged.

Related documents:

- [BFN-IR 2.3 Dynamic Process Representation](bfn-ir-2.3.md)
- [BFN-SIM 2.2 Accumulator Runtime](bfn-sim-2.2-accumulator-runtime.md)
- [Designed Sender Authoring](designed-sender-authoring.md)
- [BFN Development State Ledger](bfn-development-state.md)
