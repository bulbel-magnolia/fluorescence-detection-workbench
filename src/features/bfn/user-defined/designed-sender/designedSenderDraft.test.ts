import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../../fixtures';
import { assessUserDefinedFunctionalModule } from '../userModuleValidation';
import {
  DESIGNED_SENDER_CONTROL_UNITS,
  DESIGNED_SENDER_MODEL_FAMILIES,
  DESIGNED_SENDER_OUTPUT_UNITS,
  DESIGNED_SENDER_UNCERTAINTY_OPTIONS,
  type DesignedSenderAuthoringState,
} from './designedSenderContract';
import {
  buildDesignedSenderDraft,
  createInitialDesignedSenderAuthoringState,
} from './designedSenderDraft';
import { getDesignedSenderSignalCatalog } from './designedSenderSignalCatalog';

describe('Designed Sender authoring draft builder', () => {
  it('builds one valid concentration-to-production-rate Hill module', () => {
    const project = createDemoBfnProject();
    const state = validState(project);
    const result = buildDesignedSenderDraft(state, project);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const input = result.draft.ports.filter((port) => port.direction === 'input');
    const output = result.draft.ports.filter((port) => port.direction === 'output');
    const signal = getDesignedSenderSignalCatalog().find(
      (identity) => identity.catalogSignalId === state.output.catalogSignalId,
    );

    expect(input).toHaveLength(1);
    expect(input[0]).toMatchObject({
      name: 'Control input',
      quantityType: 'concentration',
      unit: 'uM',
    });
    expect(input[0]?.entity.displayName).toBe('IPTG');
    expect(output).toHaveLength(1);
    expect(output[0]).toMatchObject({
      name: 'AHL production role',
      quantityType: 'production_rate',
      unit: 'nM/h',
    });
    expect(output[0]?.entity).toEqual({
      id: signal?.entityId,
      displayName: signal?.displayName,
    });
    expect(result.authoritativeSignal).toEqual(signal);
    expect(result.draft.model).toMatchObject({
      family: 'hill_activation',
      parameters: {
        k: { value: 12, unit: 'uM' },
        n: { value: 2, unit: 'dimensionless' },
        ymin: { value: 0.1, unit: 'nM/h' },
        ymax: { value: 4.2, unit: 'nM/h' },
      },
    });
    expect(result.draft.validityDomains).toEqual([
      expect.objectContaining({ minimum: 0, maximum: 100, unit: 'uM' }),
    ]);
    expect(result.draft.context).toEqual({ state: 'not_recorded' });
    expect(result.draft.evidence).toEqual({
      basis: 'proposed_unbuilt_design',
      provenance: [],
    });
    expect(result.draft.uncertainty).toEqual({ state: 'not_recorded' });
    expect(result.draft.implementation).toEqual({
      state: 'unspecified',
      implementationIds: [],
    });
    expect(Object.isFrozen(result.draft)).toBe(true);

    const assessment = assessUserDefinedFunctionalModule(result.draft);
    expect(assessment.semantic).toEqual({ state: 'valid', issues: [] });
    expect(assessment.runtime).toEqual({ state: 'supported', issues: [] });
    expect(assessment.evidence.issues).toEqual([]);
    expect(assessment.implementation).toEqual({ state: 'unspecified', issues: [] });
  });

  it('accepts only the two Hill families and preserves repression', () => {
    const project = createDemoBfnProject();
    for (const family of DESIGNED_SENDER_MODEL_FAMILIES) {
      const result = buildDesignedSenderDraft({ ...validState(project), family }, project);
      expect(result.ok, family).toBe(true);
      if (result.ok) expect(result.draft.model.family).toBe(family);
    }
    for (const family of [
      'linear_transfer',
      'independent_inputs',
      'identity',
      'first_order',
      'custom_formula',
    ]) {
      expect(buildDesignedSenderDraft({ ...validState(project), family }, project)).toMatchObject({
        ok: false,
        issues: [expect.objectContaining({ code: 'unsupported_model_family' })],
      });
    }
  });

  it('restricts control and output units without exposing another output quantity', () => {
    const project = createDemoBfnProject();
    for (const unit of DESIGNED_SENDER_CONTROL_UNITS) {
      const state = validState(project);
      const result = buildDesignedSenderDraft(
        { ...state, controlInput: { ...state.controlInput, unit } },
        project,
      );
      expect(result.ok, unit).toBe(true);
      if (result.ok) {
        expect(result.draft.ports[0]).toMatchObject({ quantityType: 'concentration', unit });
        expect(result.draft.model.parameters.k?.unit).toBe(unit);
      }
    }
    for (const unit of DESIGNED_SENDER_OUTPUT_UNITS) {
      const state = validState(project);
      const result = buildDesignedSenderDraft(
        { ...state, output: { ...state.output, unit } },
        project,
      );
      expect(result.ok, unit).toBe(true);
      if (result.ok) {
        expect(result.draft.ports[1]).toMatchObject({ quantityType: 'production_rate', unit });
        expect(result.draft.model.parameters.ymin?.unit).toBe(unit);
        expect(result.draft.model.parameters.ymax?.unit).toBe(unit);
      }
    }

    const control = validState(project);
    expect(
      buildDesignedSenderDraft(
        { ...control, controlInput: { ...control.controlInput, unit: 'nM/h' } },
        project,
      ),
    ).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'unsupported_control_unit' })],
    });
    const output = validState(project);
    for (const unit of ['M', 'nM', 'uM', 'dimensionless', 'RPU']) {
      expect(
        buildDesignedSenderDraft({ ...output, output: { ...output.output, unit } }, project),
      ).toMatchObject({
        ok: false,
        issues: [expect.objectContaining({ code: 'unsupported_output_unit' })],
      });
    }
  });

  it('enforces Hill parameter and validity-domain bounds through the generic contract', () => {
    const project = createDemoBfnProject();
    const cases: readonly [Partial<DesignedSenderAuthoringState>, string][] = [
      [{ hillK: parameter('0') }, 'k_positive'],
      [{ hillN: parameter('0') }, 'n_positive'],
      [{ minimumOutput: parameter('5'), maximumOutput: parameter('2') }, 'output_bounds'],
    ];
    for (const [override, code] of cases) {
      expect(
        buildDesignedSenderDraft({ ...validState(project), ...override }, project),
      ).toMatchObject({ ok: false, issues: [expect.objectContaining({ code })] });
    }
    const state = validState(project);
    expect(
      buildDesignedSenderDraft(
        {
          ...state,
          controlInput: { ...state.controlInput, minimum: '100', maximum: '100' },
        },
        project,
      ),
    ).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'range_bounds' })],
    });
  });

  it('reuses frozen Context and evidence semantics', () => {
    const project = createDemoBfnProject();
    const partial = validState(project);
    const partialResult = buildDesignedSenderDraft(
      {
        ...partial,
        context: { ...partial.context, hostSpecies: 'Escherichia coli' },
      },
      project,
    );
    expect(partialResult.ok).toBe(true);
    if (partialResult.ok) {
      expect(partialResult.draft.context).toEqual({
        state: 'defined',
        facts: { hostSpecies: 'Escherichia coli' },
      });
    }

    for (const placeholder of ['unknown', 'N/A', 'not recorded', 'unspecified', '   ']) {
      const state = validState(project);
      expect(
        buildDesignedSenderDraft(
          {
            ...state,
            context: { ...state.context, hostSpecies: placeholder, medium: 'LB' },
          },
          project,
        ),
      ).toMatchObject({
        ok: false,
        issues: [expect.objectContaining({ code: 'context_specific' })],
      });
    }

    const strong = validState(project);
    expect(
      buildDesignedSenderDraft({ ...strong, evidenceBasis: 'measured_single_context' }, project),
    ).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'provenance_required' })],
    });
    const supported = buildDesignedSenderDraft(
      {
        ...strong,
        evidenceBasis: 'measured_single_context',
        provenanceReference: 'doi:10.0000/designed-sender-example',
      },
      project,
    );
    expect(supported.ok).toBe(true);
    if (supported.ok) expect(supported.draft.evidence.provenance).toHaveLength(1);
  });

  it('offers exactly the frozen three uncertainty states and requires complete intervals', () => {
    expect(DESIGNED_SENDER_UNCERTAINTY_OPTIONS).toEqual([
      'not_recorded',
      'none',
      'parameter_interval_envelope',
    ]);
    const project = createDemoBfnProject();
    for (const uncertainty of ['not_recorded', 'none'] as const) {
      const result = buildDesignedSenderDraft({ ...validState(project), uncertainty }, project);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.draft.uncertainty).toEqual({ state: uncertainty });
    }

    const interval = validState(project);
    const complete = buildDesignedSenderDraft(
      {
        ...interval,
        uncertainty: 'parameter_interval_envelope',
        hillK: parameter('12', '10', '14'),
        hillN: parameter('2', '1.5', '2.5'),
        minimumOutput: parameter('0.1', '0.05', '0.2'),
        maximumOutput: parameter('4.2', '4', '4.5'),
      },
      project,
    );
    expect(complete.ok).toBe(true);
    if (complete.ok) {
      expect(complete.draft.uncertainty).toEqual({
        state: 'reported',
        method: 'parameter_interval_envelope',
      });
      expect(complete.draft.model.parameters.k?.interval95).toEqual([10, 14]);
    }

    expect(
      buildDesignedSenderDraft(
        { ...validState(project), uncertainty: 'parameter_interval_envelope' },
        project,
      ),
    ).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'parameter_interval_required' })],
    });
    for (const uncertainty of ['posterior_samples', 'bootstrap', 'covariance']) {
      expect(
        buildDesignedSenderDraft({ ...validState(project), uncertainty }, project),
      ).toMatchObject({
        ok: false,
        issues: [expect.objectContaining({ code: 'unsupported_uncertainty' })],
      });
    }
  });

  it('keeps known identity exact, creates stable custom identity, and rejects spoofed selections', () => {
    const project = createDemoBfnProject();
    const known = buildDesignedSenderDraft(validState(project), project);
    expect(known.ok).toBe(true);
    if (known.ok) {
      expect(known.draft.ports[1]?.entity.id).toBe(known.authoritativeSignal?.entityId);
    }

    const customState = validState(project);
    const custom = buildDesignedSenderDraft(
      {
        ...customState,
        output: {
          ...customState.output,
          signalMode: 'custom',
          customSignalName: 'Project signal X',
        },
      },
      project,
    );
    expect(custom.ok).toBe(true);
    if (custom.ok) {
      expect(custom.authoritativeSignal).toBeNull();
      expect(custom.draft.ports[1]?.entity).toMatchObject({ displayName: 'Project signal X' });
      expect(custom.draft.ports[1]?.entity.id).toMatch(/^user\.module\..+\.entity\.output\.1$/);
    }

    const spoofed = validState(project);
    expect(
      buildDesignedSenderDraft(
        { ...spoofed, output: { ...spoofed.output, catalogSignalId: 'ahl.spoofed' } },
        project,
      ),
    ).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'catalog_signal_unknown' })],
    });
  });

  it('is deterministic and does not mutate authoring state or Project', () => {
    const project = createDemoBfnProject();
    const state = validState(project);
    const projectBefore = structuredClone(project);
    const stateBefore = structuredClone(state);

    const first = buildDesignedSenderDraft(state, project);
    const second = buildDesignedSenderDraft(state, project);

    expect(first).toEqual(second);
    expect(project).toEqual(projectBefore);
    expect(state).toEqual(stateBefore);
    expect(Object.isFrozen(first)).toBe(true);
  });
});

function validState(project = createDemoBfnProject()): DesignedSenderAuthoringState {
  const initial = createInitialDesignedSenderAuthoringState(project);
  const signal = getDesignedSenderSignalCatalog().find(
    (identity) => identity.catalogSignalId === 'ahl.3oc6.l',
  );
  if (!signal) throw new Error('Trusted 3OC6-HSL identity fixture is unavailable.');
  return {
    ...initial,
    name: 'Designed 3OC6-HSL sender',
    description: 'One-control signal production response.',
    controlInput: {
      ...initial.controlInput,
      name: 'Control input',
      entityMode: 'new',
      newEntityName: 'IPTG',
      unit: 'uM',
      minimum: '0',
      maximum: '100',
    },
    output: {
      ...initial.output,
      name: 'AHL production role',
      signalMode: 'known',
      catalogSignalId: signal.catalogSignalId,
      unit: 'nM/h',
    },
    hillK: parameter('12'),
    hillN: parameter('2'),
    minimumOutput: parameter('0.1'),
    maximumOutput: parameter('4.2'),
  };
}

function parameter(value: string, lower = '', upper = '') {
  return { value, lower, upper };
}
