import { describe, expect, it } from 'vitest';
import type { UserDefinedDynamicFunctionalModuleDraft } from './userModuleDynamicContract';
import { assessUserDefinedDynamicFunctionalModule } from './userModuleDynamicValidation';

describe('user-defined first-order dynamic module authoring contract', () => {
  it('accepts Hill activation, Hill repression, linear, and independent-input steady-state families', () => {
    for (const draft of [
      createDynamicDraft(),
      createDynamicDraft({
        steadyStateResponse: {
          ...createDynamicDraft().steadyStateResponse,
          family: 'hill_repression',
        },
      }),
      createLinearDynamicDraft(),
      createIndependentDynamicDraft(),
    ]) {
      const assessment = assessUserDefinedDynamicFunctionalModule(draft);
      expect(assessment.semantic.state).toBe('valid');
      expect(assessment.runtime.state).toBe('supported');
    }
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s tau estimates', (_label, value) => {
    const assessment = assessUserDefinedDynamicFunctionalModule(
      createDynamicDraft({ dynamics: { tau: { value, unit: 'h' }, initialState: 0 } }),
    );
    expect(assessment.semantic.state).toBe('invalid');
    if (!Number.isFinite(value)) {
      expect(issueCodes(assessment)).toContain('dynamic_tau_non_finite');
    }
    if (value === 0 || value === -1) {
      expect(issueCodes(assessment)).toContain('dynamic_tau_non_positive');
    }
  });

  it('requires tau to use hours exactly', () => {
    const assessment = assessUserDefinedDynamicFunctionalModule(
      createDynamicDraft({ dynamics: { tau: { value: 1, unit: 'nM' }, initialState: 0 } }),
    );
    expect(assessment.semantic.state).toBe('invalid');
    expect(issueCodes(assessment)).toContain('dynamic_tau_unit_invalid');
  });

  it('rejects non-finite initial state without clamping or vector coercion', () => {
    for (const initialState of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const assessment = assessUserDefinedDynamicFunctionalModule(
        createDynamicDraft({ dynamics: { tau: { value: 1, unit: 'h' }, initialState } }),
      );
      expect(assessment.semantic.state).toBe('invalid');
      expect(issueCodes(assessment)).toContain('dynamic_initial_state_non_finite');
    }
    const vectorDraft = createDynamicDraft({
      dynamics: { tau: { value: 1, unit: 'h' }, initialState: [0] as never },
    });
    expect(assessUserDefinedDynamicFunctionalModule(vectorDraft).semantic.state).toBe('invalid');
  });

  it('accepts an absent time range and validates finite nonnegative hour ranges', () => {
    expect(assessUserDefinedDynamicFunctionalModule(createDynamicDraft()).semantic.state).toBe(
      'valid',
    );
    expect(
      assessUserDefinedDynamicFunctionalModule(createDynamicDraft({ timeRangeHours: [0, 8] }))
        .semantic.state,
    ).toBe('valid');

    for (const timeRangeHours of [
      [-1, 8],
      [0, Number.NaN],
      [0, Number.POSITIVE_INFINITY],
      [8, 8],
      [9, 8],
    ] as const) {
      const assessment = assessUserDefinedDynamicFunctionalModule(
        createDynamicDraft({ timeRangeHours }),
      );
      expect(assessment.semantic.state).toBe('invalid');
      expect(issueCodes(assessment)).toContain('dynamic_time_range_invalid');
    }
  });

  it('requires a complete tau interval under parameter interval envelope uncertainty', () => {
    const base = createDynamicDraft({
      uncertainty: { state: 'reported', method: 'parameter_interval_envelope' },
    });
    expect(assessUserDefinedDynamicFunctionalModule(base).semantic.state).toBe('invalid');
    expect(issueCodes(assessUserDefinedDynamicFunctionalModule(base))).toContain(
      'dynamic_tau_interval_missing',
    );

    for (const [tau, expectedCode] of [
      [{ value: 1, unit: 'h', interval95: [2, 3] }, 'dynamic_tau_interval_estimate_outside'],
      [{ value: 1, unit: 'h', interval95: [0, 2] }, 'dynamic_tau_interval_invalid'],
      [{ value: 1, unit: 'h', interval95: [3, 2] }, 'dynamic_tau_interval_invalid'],
      [{ value: 1, unit: 'h', interval95: [Number.NaN, 2] }, 'dynamic_tau_interval_invalid'],
    ] as const) {
      const assessment = assessUserDefinedDynamicFunctionalModule(
        createDynamicDraft({
          uncertainty: { state: 'reported', method: 'parameter_interval_envelope' },
          dynamics: { tau, initialState: 0 },
        }),
      );
      expect(assessment.semantic.state).toBe('invalid');
      expect(issueCodes(assessment)).toContain(expectedCode);
    }
  });

  it('requires complete valid intervals for every steady-state parameter under an envelope', () => {
    const draft = createDynamicDraft({
      uncertainty: { state: 'reported', method: 'parameter_interval_envelope' },
      dynamics: {
        tau: { value: 1, unit: 'h', interval95: [0.5, 1.5] },
        initialState: 0,
      },
      steadyStateResponse: {
        ...createDynamicDraft().steadyStateResponse,
        parameters: {
          k: { value: 10, unit: 'nM', interval95: [8, 12] },
          n: { value: 2, unit: 'dimensionless' },
          ymin: { value: 0.1, unit: 'RPU', interval95: [0, 0.2] },
          ymax: { value: 1, unit: 'RPU', interval95: [0.8, 1.2] },
        },
      },
    });
    const assessment = assessUserDefinedDynamicFunctionalModule(draft);
    expect(assessment.semantic.state).toBe('invalid');
    expect(issueCodes(assessment)).toContain('dynamic_parameter_interval_missing');
  });

  it('rejects unsupported steady-state families and arbitrary expressions', () => {
    for (const family of ['identity', 'first_order', 'lookup', 'spline', 'polynomial']) {
      const assessment = assessUserDefinedDynamicFunctionalModule(
        createDynamicDraft({
          steadyStateResponse: {
            ...createDynamicDraft().steadyStateResponse,
            family,
          },
        }),
      );
      expect(assessment.semantic.state).toBe('invalid');
      expect(issueCodes(assessment)).toContain('unsupported_model_family');
    }

    const expression = assessUserDefinedDynamicFunctionalModule(
      createDynamicDraft({
        steadyStateResponse: {
          ...createDynamicDraft().steadyStateResponse,
          expression: 'sin(x)',
        },
      }),
    );
    expect(expression.semantic.state).toBe('invalid');
    expect(issueCodes(expression)).toContain('dynamic_steady_state_expression_unsupported');

    for (const explicitExpression of ['', '  \t  ']) {
      const assessment = assessUserDefinedDynamicFunctionalModule(
        createDynamicDraft({
          steadyStateResponse: {
            ...createDynamicDraft().steadyStateResponse,
            expression: explicitExpression,
          },
        }),
      );
      expect(assessment.semantic.state).toBe('invalid');
      expect(issueCodes(assessment)).toContain('dynamic_steady_state_expression_unsupported');
    }
  });

  it('retains static Context, Evidence, provenance, Implementation, and uncertainty semantics', () => {
    const context = assessUserDefinedDynamicFunctionalModule(
      createDynamicDraft({
        context: { state: 'defined', facts: { hostSpecies: 'unknown' } },
      }),
    );
    expect(issueCodes(context)).toContain('context_fact_invalid');

    const measured = assessUserDefinedDynamicFunctionalModule(
      createDynamicDraft({
        evidence: { basis: 'measured_single_context', provenance: [] },
      }),
    );
    expect(measured.semantic.state).toBe('valid');
    expect(measured.evidence.provenanceState).toBe('missing');

    const implementation = assessUserDefinedDynamicFunctionalModule(createDynamicDraft());
    expect(implementation.implementation).toEqual({ state: 'unspecified', issues: [] });

    for (const method of ['posterior_samples', 'bootstrap', 'covariance']) {
      const assessment = assessUserDefinedDynamicFunctionalModule(
        createDynamicDraft({ uncertainty: { state: 'reported', method } as never }),
      );
      expect(assessment.semantic.state).toBe('invalid');
      expect(issueCodes(assessment)).toContain('dynamic_uncertainty_method_invalid');
    }

    for (const malformed of [null, undefined, {}, { state: 'posterior_samples' }]) {
      const assessment = assessUserDefinedDynamicFunctionalModule(
        createDynamicDraft({ uncertainty: malformed as never }),
      );
      expect(assessment.semantic.state).toBe('invalid');
      expect(issueCodes(assessment)).toContain('dynamic_uncertainty_method_invalid');
    }

    const proposed = assessUserDefinedDynamicFunctionalModule(createDynamicDraft());
    expect(proposed.evidence.basis).toBe('proposed_unbuilt_design');
    expect(proposed.implementation.state).toBe('unspecified');
  });

  it('is deterministic, deeply frozen, non-mutating, and storage-independent', () => {
    const draft = createDynamicDraft();
    const before = structuredClone(draft);
    localStorage.setItem('dynamic-contract-sentinel', 'unchanged');
    const first = assessUserDefinedDynamicFunctionalModule(draft);
    const second = assessUserDefinedDynamicFunctionalModule(draft);
    const invalid = assessUserDefinedDynamicFunctionalModule(
      createDynamicDraft({ dynamics: { tau: { value: 0, unit: 'h' }, initialState: 0 } }),
    );

    expect(first).toEqual(second);
    expect(draft).toEqual(before);
    expect(localStorage.getItem('dynamic-contract-sentinel')).toBe('unchanged');
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.semantic)).toBe(true);
    expect(Object.isFrozen(first.semantic.issues)).toBe(true);
    expect(Object.isFrozen(invalid.semantic.issues[0] ?? {})).toBe(true);
  });
});

function createDynamicDraft(
  overrides: Partial<UserDefinedDynamicFunctionalModuleDraft> = {},
): UserDefinedDynamicFunctionalModuleDraft {
  const base: UserDefinedDynamicFunctionalModuleDraft = {
    id: 'user.module.dynamic-hill',
    origin: 'user_defined',
    name: 'Dynamic Hill module',
    description: null,
    ports: [
      {
        id: 'input',
        name: 'Inducer',
        entity: { id: 'entity.inducer', displayName: 'Inducer' },
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
      {
        id: 'output',
        name: 'Output',
        entity: { id: 'entity.output', displayName: 'Output' },
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'output',
      },
    ],
    steadyStateResponse: {
      family: 'hill_activation',
      inputPortIds: ['input'],
      outputPortIds: ['output'],
      parameters: {
        k: { value: 10, unit: 'nM' },
        n: { value: 2, unit: 'dimensionless' },
        ymin: { value: 0.1, unit: 'RPU' },
        ymax: { value: 1, unit: 'RPU' },
      },
    },
    validityDomains: [{ portId: 'input', minimum: 0, maximum: 100, unit: 'nM' }],
    dynamics: { tau: { value: 1, unit: 'h' }, initialState: 0 },
    context: { state: 'not_recorded' },
    uncertainty: { state: 'not_recorded' },
    evidence: { basis: 'proposed_unbuilt_design', provenance: [] },
    implementation: { state: 'unspecified', implementationIds: [] },
  };
  return { ...base, ...overrides };
}

function createLinearDynamicDraft(): UserDefinedDynamicFunctionalModuleDraft {
  const base = createDynamicDraft();
  return {
    ...base,
    id: 'user.module.dynamic-linear',
    ports: [
      { ...base.ports[0]!, quantityType: 'activity', unit: 'RPU' },
      { ...base.ports[1]!, quantityType: 'expression_level', unit: 'RPU' },
    ],
    steadyStateResponse: {
      family: 'linear_transfer',
      inputPortIds: ['input'],
      outputPortIds: ['output'],
      parameters: {
        scale: { value: 0.8, unit: 'dimensionless' },
        intercept: { value: 0.1, unit: 'RPU' },
      },
    },
    validityDomains: [{ portId: 'input', minimum: 0, maximum: 10, unit: 'RPU' }],
  };
}

function createIndependentDynamicDraft(): UserDefinedDynamicFunctionalModuleDraft {
  const base = createDynamicDraft();
  return {
    ...base,
    id: 'user.module.dynamic-independent',
    ports: [
      base.ports[0]!,
      {
        id: 'input-b',
        name: 'Second inducer',
        entity: { id: 'entity.inducer-b', displayName: 'Second inducer' },
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
      base.ports[1]!,
    ],
    steadyStateResponse: {
      family: 'independent_inputs',
      inputPortIds: ['input', 'input-b'],
      outputPortIds: ['output'],
      parameters: {
        basal: { value: 0.1, unit: 'RPU' },
        outputMaximum: { value: 1, unit: 'RPU' },
      },
      terms: [
        {
          inputPortId: 'input',
          mode: 'activation',
          k: { value: 10, unit: 'nM' },
          n: { value: 2, unit: 'dimensionless' },
          weight: { value: 0.5, unit: 'dimensionless' },
        },
        {
          inputPortId: 'input-b',
          mode: 'repression',
          k: { value: 8, unit: 'nM' },
          n: { value: 1.5, unit: 'dimensionless' },
          weight: { value: 0.5, unit: 'dimensionless' },
        },
      ],
      aggregation: 'bounded_sum',
      interactionAssumption: 'independent_unverified',
    },
    validityDomains: [
      { portId: 'input', minimum: 0, maximum: 100, unit: 'nM' },
      { portId: 'input-b', minimum: 0, maximum: 100, unit: 'nM' },
    ],
  };
}

function issueCodes(assessment: {
  readonly semantic: { readonly issues: readonly { readonly code: string }[] };
  readonly runtime: { readonly issues: readonly { readonly code: string }[] };
  readonly evidence: { readonly issues: readonly { readonly code: string }[] };
  readonly implementation: { readonly issues: readonly { readonly code: string }[] };
}): string[] {
  return [
    ...assessment.semantic.issues,
    ...assessment.runtime.issues,
    ...assessment.evidence.issues,
    ...assessment.implementation.issues,
  ].map((issue) => issue.code);
}
