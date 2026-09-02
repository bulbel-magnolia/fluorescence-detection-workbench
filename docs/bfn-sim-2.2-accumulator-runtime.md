# BFN-SIM 2.2 Accumulator Runtime

Batch 12.4.1 is a **CANDIDATE** whose final persistence correction is complete
at c1a350f7f3dfa81f985cd84e7b86dd1292fe2111. Its exact original base is
cb41a6e49829249b5b2fbf44206cfb6436a425bf. Batch 12.4.0 is the reviewed
predecessor: implementation review and correction review passed, while its
freeze bookkeeping was deferred by Master Control. Batch 12.4.1 awaits the
combined Master Review and is not PASS or FROZEN.

## Representation and admission

BFN-IR remains 2.3. The serialized accumulator representation stays:

```text
mode = dynamic
family = accumulator
inputPortId
outputPortId
initialState
uncertaintyMethod
```

BFN-SIM 2.2 admits the first narrow scientific contract only when the module
has exactly one input and one output, both model Port references bind those
Ports, both Ports have the same exact Entity, and the quantity/unit pair is
one of:

```text
production_rate nM/h -> concentration nM
production_rate uM/h -> concentration uM
```

initialState is the output-unit concentration at time zero and must be finite
and non-negative. The serialized uncertainty method must be none or
not_recorded. Contract failures use accumulator_model_contract_invalid with a
stable machine-readable details.reason; a rate resolved during execution must
be finite and non-negative or execution throws BFN_ACCUMULATOR_RATE_INVALID.
No value is silently clamped or converted inside the accumulator.

## Time integration

The executable equation is:

```text
dC/dt = r(t)
C(0) = C0
C(k+1) = C(k) + r(k) * deltaT
```

The timestep contract is left-endpoint sample-and-hold with deferred state
commit. At t0, the module exposes C0, computes r0, and stores that rate for the
next interval. At every later sample, it first commits the previously stored
rate using the actual elapsed integration step, exposes the resulting Ck to
downstream quasi-static modules, then stores the current rate for the future
interval. A partial final interval uses timeHours - previousTimeHours, so it
cannot over-integrate.

The Batch 12.3 first-order update remains unchanged:

```text
y(next) = y(previous)
  + (1 - exp(-deltaT / tau)) * (target - y(previous))
```

An upstream first-order rate producer may feed an accumulator: its current
output sample becomes the accumulator rate for the future interval.
Accumulator-to-first-order ordering is rejected with
mixed_dynamic_process_ordering_unsupported. Any target-reachable feedback
cycle containing an effective accumulator is rejected with
dynamic_feedback_unsupported.

## Deterministic uncertainty propagation

BFN-SIM 2.2 module snapshots distinguish:

```text
parameter_interval
deterministic_transform
unavailable
```

An accumulator is a deterministic_transform; it contributes no fabricated
parameter or initial-state interval. A network interval is available only
when every output-reachable module is either an executable parameter envelope
or a deterministic transform, and at least one real
parameter_interval_envelope source exists. Each existing parameter scenario
is integrated independently through the accumulator. A deterministic-only
path therefore retains lower = null and upper = null.

Validation, temporal admission, and uncertainty assessment remain scoped to
the selected Output Monitor. An unrelated accumulator branch does not block a
valid selected path.

## Result and persistence contract

New runs use BFN-SIM-2.2. Historical BFN-SIM-2.0 and BFN-SIM-2.1 payloads
retain their original parser contracts and are not rewritten. Workspace
IndexedDB structural version remains 1.

For SIM 2.2 snapshots, `method` preserves the model's serialized uncertainty
declaration while `propagationMode` records its role in the current network
propagation. Repository validation therefore admits the simulator-produced
combination `method = parameter_interval_envelope` with
`propagationMode = deterministic_transform`, `intervalExecutable = true`, and
`reason = null`. Save/load is lossless; unsupported deterministic-transform
methods such as bootstrap, posterior_samples, and covariance remain rejected.

SIM 2.2 dynamic metrics add terminalValue and steadyStateAvailable. An
output-reachable accumulator reports:

```text
steadyStateAvailable = false
steadyValue = null
riseTimeHours = null
overshootFraction = null
dcGain = null
frequencyGain = null
```

Accumulator-free dynamic runs keep their established numerical trajectory and
report the final sample as both terminal and available steady-state value.

## Supported integration boundary

The primary supported feed-forward path is:

```text
Dynamic Input
  -> quasi-static production-rate module
  -> explicit accumulator
  -> quasi-static concentration consumer
  -> Monitor
```

The integration regression uses the existing Designed Sender materializer and
trusted Catalog Receiver evaluator. Designed Sender remains static-only and
outputs production_rate; Catalog Receiver remains a static concentration
consumer. The intervening concentration edge may perform the existing unit
representation conversion, such as nM -> M. Direct
production_rate -> concentration wiring remains rejected by unchanged Port
Compatibility rules.

## Authoring integration boundary

Batch 12.4 now has a **CANDIDATE** Signal Pool authoring implementation. It
materializes the existing accumulator representation and delegates all
execution to this BFN-SIM 2.2 runtime. It does not add another integration
equation, automatic graph insertion or wiring, a feedback solver, degradation,
dilution, clearance, amount/volume state, multi-rate summation, or initial-state
uncertainty. Batch 12.4.0, 12.4.1, and 12.4 await combined Master Review and are
not FROZEN.
