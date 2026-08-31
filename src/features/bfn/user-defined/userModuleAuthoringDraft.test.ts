import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import {
  buildUserDefinedModuleDraft,
  createInitialUserModuleAuthoringState,
  type UserModuleAuthoringParameter,
  type UserModuleAuthoringState,
} from './userModuleAuthoringDraft';

describe('user-defined static module draft builder', () => {
  it('maps an entirely blank Context to not_recorded and derives stable IDs without mutation', () => {
    const project = createDemoBfnProject();
    const projectSnapshot = structuredClone(project);
    const state = readyState(project);
    const blankContextState: UserModuleAuthoringState = {
      ...state,
      context: {
        hostSpecies: '  ',
        hostStrain: '',
        medium: '\t',
        temperatureCelsius: '',
        ph: '',
      },
    };

    const first = buildUserDefinedModuleDraft(blankContextState, project);
    const second = buildUserDefinedModuleDraft(blankContextState, project);

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    if (!first.ok || !second.ok) return;
    expect(first.draft.context).toEqual({ state: 'not_recorded' });
    expect(second.draft.id).toBe(first.draft.id);
    expect(second.draft.ports.map((port) => port.id)).toEqual(
      first.draft.ports.map((port) => port.id),
    );
    expect(project).toEqual(projectSnapshot);
  });

  it('preserves a partially recorded Context and rejects placeholder semantics', () => {
    const project = createDemoBfnProject();
    const state = readyState(project);
    const partial = buildUserDefinedModuleDraft(
      {
        ...state,
        context: {
          ...state.context,
          hostSpecies: ' Escherichia coli ',
          temperatureCelsius: '37',
        },
      },
      project,
    );

    expect(partial).toMatchObject({ ok: true });
    if (partial.ok) {
      expect(partial.draft.context).toEqual({
        state: 'defined',
        facts: { hostSpecies: 'Escherichia coli', temperatureCelsius: 37 },
      });
    }

    const placeholder = buildUserDefinedModuleDraft(
      {
        ...state,
        context: { ...state.context, medium: 'N/A' },
      },
      project,
    );
    expect(placeholder.ok).toBe(false);
    if (!placeholder.ok) {
      expect(
        placeholder.issues.some(
          (item) => item.field === 'context.medium' && item.code === 'context_specific',
        ),
      ).toBe(true);
    }
  });

  it('accepts only complete parameter envelopes and preserves every interval', () => {
    const project = createDemoBfnProject();
    const state = readyState(project);
    const complete = buildUserDefinedModuleDraft(
      {
        ...state,
        uncertainty: 'parameter_interval_envelope',
        hillK: interval(state.hillK, '8', '12'),
        hillN: interval(state.hillN, '1.5', '2.5'),
        minimumOutput: interval(state.minimumOutput, '-0.1', '0.1'),
        maximumOutput: interval(state.maximumOutput, '0.8', '1.2'),
      },
      project,
    );

    expect(complete).toMatchObject({ ok: true });
    if (complete.ok) {
      expect(complete.draft.uncertainty).toEqual({
        state: 'reported',
        method: 'parameter_interval_envelope',
      });
      expect(complete.draft.model.parameters).toMatchObject({
        k: { interval95: [8, 12] },
        n: { interval95: [1.5, 2.5] },
        ymin: { interval95: [-0.1, 0.1] },
        ymax: { interval95: [0.8, 1.2] },
      });
    }

    const incomplete = buildUserDefinedModuleDraft(
      {
        ...state,
        uncertainty: 'parameter_interval_envelope',
        hillK: interval(state.hillK, '8', '12'),
      },
      project,
    );
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) {
      expect(incomplete.issues.some((item) => item.code === 'parameter_interval_required')).toBe(
        true,
      );
    }
  });

  it('rejects a linear transfer whose input and output dimensions differ', () => {
    const project = createDemoBfnProject();
    const state = readyState(project);
    const mismatch = buildUserDefinedModuleDraft({ ...state, family: 'linear_transfer' }, project);

    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(
        mismatch.issues.some(
          (item) => item.field === 'model.linear.units' && item.code === 'linear_unit_mismatch',
        ),
      ).toBe(true);
    }
  });
});

function readyState(project: ReturnType<typeof createDemoBfnProject>): UserModuleAuthoringState {
  const initial = createInitialUserModuleAuthoringState(project);
  return {
    ...initial,
    name: 'User response module',
    inputs: initial.inputs.map((input) => ({
      ...input,
      name: 'Inducer input',
      existingEntityId: '3OC6-HSL',
    })),
    output: {
      ...initial.output,
      name: 'Production output',
      newEntityName: 'Product X',
      quantityType: 'production_rate',
      unit: 'nM/h',
    },
  };
}

function interval(
  parameter: UserModuleAuthoringParameter,
  lower: string,
  upper: string,
): UserModuleAuthoringParameter {
  return { ...parameter, lower, upper };
}
