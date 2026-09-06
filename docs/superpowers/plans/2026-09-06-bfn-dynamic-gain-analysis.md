# BFN Dynamic Gain Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a target-scoped, analytic small-signal periodic gain and phase interpretation for dynamic BIO-NET projects while preserving all frozen runtime, graph, unit, persistence, and ANN contracts.

**Architecture:** The calculator first delegates the baseline operating point, target closure, module outputs, static local gains, applicability, Context, and Evidence to corrected `calculateBfnNetworkInfluence()`. A separate pure complex propagation layer converts each returned local static gain into either a quasi-static transfer or the frozen first-order transfer `g / (1 + jωτ)`, then propagates those transfers over the same target-scoped edges with existing unit-coordinate conversion. The UI is an ephemeral Output Monitor drawer; it does not read runs, write persistence, modify the canvas, or expose internal complex notation.

**Tech Stack:** TypeScript 5.9, React 19, Vitest, React Testing Library, i18next, Vite, existing BFN-INTERPRETATION 1.0 and BFN-IR 2.3 types.

---

### Task 1: Record the preimplementation contract audit

**Files:**

- Inspect: `docs/user-defined-first-order-dynamic-authoring.md`
- Inspect: `docs/bfn-sim-2.2-accumulator-runtime.md`
- Inspect: `src/features/bfn/simulation.ts`
- Inspect: `src/features/bfn/validation.ts`
- Inspect: `src/features/bfn/modelResolution.ts`
- Inspect: `src/features/bfn/types.ts`
- Inspect: `src/features/bfn/accumulatorRuntimeContract.ts`
- Inspect: `src/features/bfn/interpretation/localInfluence.ts`
- Inspect: `src/features/bfn/interpretation/networkInfluence.ts`
- Inspect: `src/features/bfn/interpretation/localAnnApproximation.ts`
- Inspect: `src/features/bfn/compatibility/contextIntegration.ts`
- Inspect: `src/features/bfn/unitSystem.ts`
- Inspect: `src/features/bfn/BfnPlatformPage.tsx`
- Inspect: `src/features/bfn/interpretation/BfnNetworkInfluenceDrawer.tsx`
- Inspect: `src/i18n/locales/bfn-zh-CN.ts`
- Inspect: `src/i18n/locales/bfn-en-US.ts`
- Inspect: `src/features/bfn/temporal/temporalCapability.ts`

- [x] Confirm the frozen first-order model is `τ dy/dt = f(x) - y`, with finite positive nominal `tau.value` in hours.
- [x] Confirm `Math.max(0.001, tau)` occurs only in the trajectory executor and is not declared as scientific model semantics; leave `simulation.ts` unchanged and use exact nominal tau in the analytic calculator.
- [x] Confirm Accumulator/Signal Pool target paths lack a unique baseline concentration reference and must fail closed without `1/(jω)` propagation.
- [x] Confirm corrected Batch 13.2 exposes target closure, source/module order, baseline outputs, local gains, applicability, Context, and Evidence needed by this batch.
- [x] Confirm `convertUnit()` supplies the frozen numeric coordinate transform and no Edge field is needed.
- [x] Confirm the existing `frequencyGain` is trajectory-derived and remains isolated, as do both existing ANN implementations and `analysis.annThresholds`.
- [x] Confirm the Output Monitor Inspector and compact drawer pattern are the sole UI insertion points; no canvas overlay is required.

### Task 2: Add the complex-number primitive under TDD

Status: completed. RED/GREEN cycle executed; helper is pure, immutable, finite-checked, and covered by targeted tests.

**Files:**

- Create: `src/features/bfn/interpretation/complexMath.ts`
- Create: `src/features/bfn/interpretation/complexMath.test.ts`

- [ ] **Step 1: Write failing tests for arithmetic and phase normalization**

Cover immutable add, multiply, real scale, finite checks, `Math.hypot` magnitude, quadrants, signed zero, and deterministic `-180° -> +180°` normalization.

```ts
expect(bfnComplexMultiply({ re: 2, im: 3 }, { re: 4, im: -1 })).toEqual({ re: 11, im: 10 });
expect(bfnComplexPhaseDegrees({ re: -1, im: -0 })).toBe(180);
expect(bfnComplexMagnitude({ re: 3, im: 4 })).toBe(5);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/features/bfn/interpretation/complexMath.test.ts`

Expected: FAIL because `complexMath.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

```ts
export interface BfnComplex {
  readonly re: number;
  readonly im: number;
}

export function bfnComplexMultiply(left: BfnComplex, right: BfnComplex): BfnComplex {
  return Object.freeze({
    re: left.re * right.re - left.im * right.im,
    im: left.re * right.im + left.im * right.re,
  });
}
```

Implement matching `bfnComplexAdd`, `bfnComplexScale`, `isFiniteBfnComplex`, `isZeroBfnComplex`, `bfnComplexMagnitude`, and `bfnComplexPhaseDegrees` exports without a dependency.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx vitest run src/features/bfn/interpretation/complexMath.test.ts`

Expected: all complex helper tests pass.

### Task 3: Define and admit the dynamic interpretation contract under TDD

Status: completed. RED/GREEN cycle executed; request/admission/result unions and fail-closed issues are implemented.

**Files:**

- Create: `src/features/bfn/interpretation/dynamicGainTypes.ts`
- Create: `src/features/bfn/interpretation/dynamicGainValidation.ts`
- Create: `src/features/bfn/interpretation/dynamicGainValidation.test.ts`
- Modify: `src/features/bfn/interpretation/index.ts`

- [ ] **Step 1: Write failing admission tests**

Cover static-mode rejection, finite positive period, exact target-relevant external operating points, first-order nominal tau/model Evidence admission, quasi-static fallback, target Accumulator/feedback rejection, and off-target containment.

```ts
const request: BfnDynamicGainRequestV1 = {
  contractVersion: '1.0',
  scope: 'network_dynamic_periodic_gain',
  outputMonitorId: 'monitor-reporter',
  operatingPoint: [{ inputSourceId: 'source-ahl', value: 10, unit: 'nM' }],
  perturbation: { periodHours: 2 },
};
expect(assessBfnDynamicGainRequest(project, request).status).toBe('supported');
```

- [ ] **Step 2: Run the admission test and verify RED**

Run: `npx vitest run src/features/bfn/interpretation/dynamicGainValidation.test.ts`

Expected: FAIL because the dynamic gain contract modules do not exist.

- [ ] **Step 3: Implement request, result, module-transfer, Evidence, and issue types**

Define `BfnDynamicGainRequestV1`, `BfnDynamicGainResultV1`, available/unavailable gain and phase unions, nested module/input transfers, and a calculation envelope carrying the delegated Batch 13.2 calculation. Keep `BfnDerivedGainUnit` as the only gain-unit representation.

- [ ] **Step 4: Implement pure admission**

Reject any non-dynamic project before target resolution, require finite `periodHours > 0`, delegate closure and operating-point admission to `assessBfnNetworkInfluenceRequest()`, validate exact first-order model/tau metadata, and map Accumulator, feedback, missing-input, and response failures to stable dynamic-analysis issues.

- [ ] **Step 5: Run the admission test and verify GREEN**

Run: `npx vitest run src/features/bfn/interpretation/dynamicGainValidation.test.ts`

Expected: all admission tests pass without modifying frozen model/runtime files.

### Task 4: Implement analytic forward complex propagation under TDD

Status: completed. RED/GREEN cycle executed; calculator delegates Batch 13.2 exactly once and keeps runtime/ANN/frequency paths isolated.

**Files:**

- Create: `src/features/bfn/interpretation/dynamicGain.ts`
- Create: `src/features/bfn/interpretation/dynamicGain.test.ts`
- Modify: `src/features/bfn/interpretation/index.ts`

- [ ] **Step 1: Write failing calculator tests**

Cover positive/negative/zero quasi-static paths, same/mixed-unit direct transmission, exact first-order real/imaginary/magnitude/phase values, period and tau changes, very small positive tau, quasi-static/first-order ordering, two first-order cascades, multi-input modules, branches/convergence, multiple sources, stable source/module order, derivative containment, applicability, Context, Evidence, nominal-only uncertainty, duration/time-step isolation, purity, determinism, and no result for target Accumulator/feedback.

```ts
const omega = (2 * Math.PI) / request.perturbation.periodHours;
const expected = {
  re: gain / (1 + (omega * tau) ** 2),
  im: (-gain * omega * tau) / (1 + (omega * tau) ** 2),
};
expect(result.moduleTransfers[0]?.inputs[0]?.dynamicGain.complex.re).toBeCloseTo(expected.re);
```

- [ ] **Step 2: Run the calculator test and verify RED**

Run: `npx vitest run src/features/bfn/interpretation/dynamicGain.test.ts`

Expected: FAIL because `calculateBfnDynamicGain()` does not exist.

- [ ] **Step 3: Implement delegated baseline calculation**

Call `calculateBfnNetworkInfluence()` exactly once for the accepted request and use its returned ordered operating point, baseline output, module interpretations, applicability, Context snapshot, and Evidence. Do not call response evaluators, simulation, run repositories, ANN code, duration, or time step.

- [ ] **Step 4: Implement local transfer construction**

For quasi-static modules use `{ re: g, im: 0 }`. For first-order modules use exact nominal tau:

```ts
const denominator = 1 + (omega * tauHours) ** 2;
const complex = {
  re: gain / denominator,
  im: (-gain * omega * tauHours) / denominator,
};
```

Preserve the dynamic model ID/version/Evidence/Context/ValidityDomain/uncertainty metadata. Treat exact zero as an available zero magnitude with unavailable `zero_magnitude` phase.

- [ ] **Step 5: Implement source-to-target complex propagation**

Initialize each source sensitivity as `1 + 0i` for itself and exact zero for other sources. Across each admitted Edge, multiply both coordinates by `convertUnit(1) - convertUnit(0)`. At each module sum `H_i * S_i` in input order, applying exact-zero containment before unavailable propagation and rejecting every non-finite complex or magnitude.

- [ ] **Step 6: Run calculator and Batch 13.0–13.3 regression tests**

Run: `npx vitest run src/features/bfn/interpretation/complexMath.test.ts src/features/bfn/interpretation/dynamicGainValidation.test.ts src/features/bfn/interpretation/dynamicGain.test.ts src/features/bfn/interpretation/interpretationContract.test.ts src/features/bfn/interpretation/localInfluence.test.ts src/features/bfn/interpretation/networkInfluence.test.ts src/features/bfn/interpretation/localAnnApproximation.test.ts`

Expected: all selected tests pass.

### Task 5: Add the ephemeral Output Monitor workflow under TDD

Status: completed. Output Monitor availability, drawer workflow, lifecycle cleanup, focus behavior, and zh-CN/en-US copy are implemented.

**Files:**

- Create: `src/features/bfn/interpretation/dynamicGainPresentation.ts`
- Create: `src/features/bfn/interpretation/dynamicGainPresentation.test.ts`
- Create: `src/features/bfn/interpretation/BfnDynamicGainDrawer.tsx`
- Create: `src/features/bfn/interpretation/BfnDynamicGainUi.test.tsx`
- Create: `src/features/bfn/interpretation/bfn-dynamic-gain.css`
- Modify: `src/features/bfn/BfnPlatformPage.tsx`
- Modify: `src/features/bfn/bfn-platform.css`
- Modify: `src/i18n/locales/bfn-zh-CN.ts`
- Modify: `src/i18n/locales/bfn-en-US.ts`

- [ ] **Step 1: Write failing presentation and UI tests**

Cover all 26 requested UI behaviors: mode gate, target-scoped source fields, exact-unit constant prefill, blank non-constant inputs, required positive period, output/gain/phase results, undefined zero phase, no direction column, first-order/quasi-static details, applicability and Context caveats, outside-domain rejection, natural Accumulator/feedback copy, edit/result clearing, close/project clearing, project immutability, bilingual parity, focus restoration, and absence of raw complex/solver terminology.

- [ ] **Step 2: Run the UI tests and verify RED**

Run: `npx vitest run src/features/bfn/interpretation/dynamicGainPresentation.test.ts src/features/bfn/interpretation/BfnDynamicGainUi.test.tsx`

Expected: FAIL because the Inspector action and drawer do not exist.

- [ ] **Step 3: Implement the availability helper**

Return only `dynamic_mode_required`, `integrator_reference_state_unavailable`, `feedback`, `missing_input`, or `response_invalid`; reuse Batch 13.2 target discovery and `bfnNetworkInfluencePrefill()`.

- [ ] **Step 4: Implement the compact drawer**

Render target, baseline source table, a blank positive-period field in hours, Analyze, baseline output, source response-gain/phase table, layered caveats, collapsed module dynamic-response details, and collapsed analysis basis. Clear calculation state on every baseline/period edit and rely on unmount for close cleanup. Never render formulas, raw complex coordinates, IDs, enums, Bode/solver language, a direction column, or an amplitude field.

- [ ] **Step 5: Integrate lifecycle and translations**

Add the disabled/enabled Inspector action, Escape handling, focus restoration, and project-identity close behavior in `BfnPlatformPage`. Add exactly aligned Simplified Chinese and English translation trees and import the restrained drawer stylesheet.

- [ ] **Step 6: Run UI, locale, and style tests and verify GREEN**

Run: `npx vitest run src/features/bfn/interpretation/dynamicGainPresentation.test.ts src/features/bfn/interpretation/BfnDynamicGainUi.test.tsx src/i18n/bfn-locales.test.ts src/features/bfn/bfn-platform.styles.test.ts`

Expected: all selected tests pass.

### Task 6: Document the candidate and update the interpretation contract

Status: completed. Contract, candidate documentation, development-state, and testing records reflect Batch 13.4 as Candidate awaiting Master Review, not Frozen.

**Files:**

- Create: `docs/bfn-dynamic-gain-analysis.md`
- Modify: `docs/bfn-network-interpretation-1.0.md`
- Modify: `docs/bfn-development-state.md`
- Modify: `docs/testing.md`
- Modify: `src/features/bfn/interpretation/interpretationContract.ts`
- Modify: `src/features/bfn/interpretation/interpretationContract.test.ts`

- [ ] Add a failing contract assertion that Batch 13.4 is an ephemeral nominal analytic single-period interpretation and run it before changing the contract object.
- [ ] Document `H = g` and `H = g/(1+jωτ)`, exact nominal tau, target scope, Edge coordinate conversion, zero phase semantics, Accumulator/feedback boundaries, baseline-only ValidityDomain, Context caveats, Evidence provenance, nominal-only uncertainty, and isolation from simulation `frequencyGain`, ANN, DC, and Bode workflows.
- [ ] Record `Batch 13.4 = CANDIDATE / implementation complete / awaiting Master Review / not FROZEN` without freezing Batch 13 or Phase III.

### Task 7: Validate, audit, commit, and publish

Status: validation completed through full local gates and browser inspection; commit/push is the remaining handoff step.

**Files:**

- Verify all changed files against exact base `e0ce3a1cee0eff68a28a40edb4bfbd8a66ac3f44`.

- [ ] Run all dynamic-gain targeted tests plus Batch 13.0–13.3, static/dynamic runtime, Accumulator, Signal Pool, Compatibility, unit, Temporal, Template, Module Library, old ANN, and relevant UI regressions.
- [ ] Run the Sender-safe full suite with verified temporary source materialization, `try/finally`, 12/12 byte/hash restoration, and final source diff zero.
- [ ] Run `npm test -- --maxWorkers=4`, `npm run typecheck`, `npm run lint`, `npm run build`, changed-file Prettier, and `git diff --check`.
- [ ] Launch the app through the in-app browser workflow and visually inspect compact right-drawer layout, target/baseline/period clarity, numeric/unit alignment, collapsed details, caveat layering, keyboard focus, responsive width, and absence of gradients, giant cards, formula-first presentation, raw codes, and Bode-dashboard styling.
- [ ] Audit hashes/diffs for every frozen boundary and prove `simulation.ts`, dynamic metrics, `types.ts`, `unitSystem.ts`, `responseMath.ts`, `BfnIdealEdge`, ANN, persistence, Sender, and dependencies are unchanged.
- [ ] Stage reviewed Phase 1 files explicitly and commit `feat(bfn): add dynamic gain analysis`.
- [ ] Push `codex/bfn-dynamic-gain-analysis` without force and verify remote head, the two-commit parent chain, compare counts, changed files, workflows, checks, status contexts, and PR count. Report local validation only if GitHub exposes zero CI contexts.
