import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../../fixtures';
import type { BfnProject } from '../../types';
import { getDesignedSenderSignalCatalog } from '../designed-sender/designedSenderSignalCatalog';
import {
  SIGNAL_POOL_CONCENTRATION_UNITS,
  createInitialSignalPoolAuthoringState,
  signalPoolUnitPair,
  type SignalPoolAuthoringState,
} from './signalPoolContract';
import { buildSignalPoolDraft } from './signalPoolDraft';

function projectFixture(): BfnProject {
  return createDemoBfnProject();
}

function validKnownState(): SignalPoolAuthoringState {
  const initial = createInitialSignalPoolAuthoringState();
  const signal = getDesignedSenderSignalCatalog()[0];
  if (!signal) throw new Error('Expected a canonical Designed Sender signal fixture.');
  return {
    ...initial,
    name: '  Exact pool name  ',
    description: '  Exact description  ',
    signalMode: 'known',
    knownCatalogSignalId: signal.catalogSignalId,
    initialConcentration: '0',
  };
}

function existingState(entityId: string): SignalPoolAuthoringState {
  return {
    ...validKnownState(),
    signalMode: 'existing',
    knownCatalogSignalId: '',
    existingEntityId: entityId,
  };
}

describe('Signal Pool authoring contract and draft', () => {
  it('starts without a selected biological signal and with the narrow v1 defaults', () => {
    expect(createInitialSignalPoolAuthoringState()).toEqual({
      name: '',
      description: '',
      signalMode: '',
      knownCatalogSignalId: '',
      existingEntityId: '',
      customSignalName: '',
      concentrationUnit: 'nM',
      initialConcentration: '0',
    });
    expect(SIGNAL_POOL_CONCENTRATION_UNITS).toEqual(['nM', 'uM']);
  });

  it.each([
    [
      'blank name',
      (state: SignalPoolAuthoringState) => ({ ...state, name: ' ' }),
      'module_name_required',
    ],
    [
      'no signal',
      (state: SignalPoolAuthoringState) => ({ ...state, signalMode: '', knownCatalogSignalId: '' }),
      'signal_required',
    ],
    [
      'invalid custom signal',
      (state: SignalPoolAuthoringState) => ({
        ...state,
        signalMode: 'custom',
        customSignalName: ' ',
      }),
      'custom_signal_required',
    ],
    [
      'blank initial concentration',
      (state: SignalPoolAuthoringState) => ({ ...state, initialConcentration: '' }),
      'initial_concentration_required',
    ],
    [
      'negative initial concentration',
      (state: SignalPoolAuthoringState) => ({ ...state, initialConcentration: '-0.1' }),
      'initial_concentration_negative',
    ],
    [
      'NaN initial concentration',
      (state: SignalPoolAuthoringState) => ({ ...state, initialConcentration: 'NaN' }),
      'initial_concentration_non_finite',
    ],
    [
      'infinite initial concentration',
      (state: SignalPoolAuthoringState) => ({ ...state, initialConcentration: 'Infinity' }),
      'initial_concentration_non_finite',
    ],
    [
      'unsupported unit',
      (state: SignalPoolAuthoringState) => ({ ...state, concentrationUnit: 'mM' }),
      'unsupported_unit',
    ],
  ] as const)('rejects %s', (_label, mutate, code) => {
    const project = projectFixture();
    const result = buildSignalPoolDraft(mutate(validKnownState()), project);

    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error('Expected invalid Signal Pool authoring state.');
    expect(result.issues.map((issue) => issue.code)).toContain(code);
  });

  it.each([
    ['nM', 'nM/h'],
    ['uM', 'uM/h'],
  ] as const)('accepts the exact %s concentration and %s rate pair', (concentration, rate) => {
    const project = projectFixture();
    const result = buildSignalPoolDraft(
      { ...validKnownState(), concentrationUnit: concentration },
      project,
    );

    expect(signalPoolUnitPair(concentration)).toEqual({ concentration, productionRate: rate });
    expect(result).toMatchObject({
      ok: true,
      draft: {
        inputPort: { quantityType: 'production_rate', unit: rate, direction: 'input' },
        outputPort: { quantityType: 'concentration', unit: concentration, direction: 'output' },
      },
    });
  });

  it('accepts zero C0 and preserves exact user module metadata', () => {
    const project = projectFixture();
    const state = validKnownState();
    const result = buildSignalPoolDraft(state, project);

    expect(result).toMatchObject({
      ok: true,
      draft: {
        name: state.name,
        description: state.description,
        initialConcentration: 0,
      },
    });
  });

  it('reuses the exact Designed Sender canonical identity', () => {
    const project = projectFixture();
    const signal = getDesignedSenderSignalCatalog()[0]!;
    const result = buildSignalPoolDraft(validKnownState(), project);

    expect(result).toMatchObject({
      ok: true,
      draft: {
        signal: {
          source: 'known',
          catalogSignalId: signal.catalogSignalId,
          entityId: signal.entityId,
          displayName: signal.displayName,
        },
        inputPort: { entityId: signal.entityId },
        outputPort: { entityId: signal.entityId },
      },
    });
  });

  it('accepts and preserves a concentration-only existing project Entity ID', () => {
    const project = projectFixture();
    const existingEntityId = '3OC6-HSL';
    const result = buildSignalPoolDraft(existingState(existingEntityId), project);

    expect(result).toMatchObject({
      ok: true,
      draft: {
        signal: { source: 'existing', entityId: existingEntityId },
        inputPort: { entityId: existingEntityId },
        outputPort: { entityId: existingEntityId },
      },
    });
  });

  it('accepts an existing Entity that occurs only on a production-rate port', () => {
    const project = projectFixture();
    const ratePort = project.network.modules[0]?.outputPorts[0];
    if (!ratePort) throw new Error('Expected a project output port fixture.');
    ratePort.entity = 'entity.production-rate-only';
    ratePort.quantityType = 'production_rate';
    ratePort.unit = 'nM/h';

    expect(buildSignalPoolDraft(existingState(ratePort.entity), project)).toMatchObject({
      ok: true,
      draft: { signal: { source: 'existing', entityId: ratePort.entity } },
    });
  });

  it.each(['normalized_promoter_activity', 'normalized_reporter_expression'])(
    'rejects the non-signal-semantic project Entity %s',
    (entityId) => {
      const result = buildSignalPoolDraft(existingState(entityId), projectFixture());

      expect(result).toMatchObject({
        ok: false,
        issues: [{ field: 'existingEntityId', code: 'existing_entity_unknown' }],
      });
    },
  );

  it('rejects a registry-only Entity without a signal-semantic project port', () => {
    const project = projectFixture();
    project.registry.entities.push({
      id: 'entity.registry-only',
      origin: 'user_defined',
      displayName: 'Registry only',
      description: null,
    });

    expect(buildSignalPoolDraft(existingState('entity.registry-only'), project)).toMatchObject({
      ok: false,
      issues: [{ field: 'existingEntityId', code: 'existing_entity_unknown' }],
    });
  });

  it('keeps the known catalog path independent from current graph ports', () => {
    const project = projectFixture();
    project.network.inputSources = [];
    project.network.modules = [];
    project.network.outputMonitors = [];

    expect(buildSignalPoolDraft(validKnownState(), project)).toMatchObject({
      ok: true,
      draft: { signal: { source: 'known' } },
    });
  });

  it('creates a custom identity only through the explicit custom path', () => {
    const project = projectFixture();
    const result = buildSignalPoolDraft(
      {
        ...validKnownState(),
        signalMode: 'custom',
        knownCatalogSignalId: '',
        customSignalName: '  New orthogonal signal  ',
      },
      project,
    );

    expect(result).toMatchObject({
      ok: true,
      draft: {
        signal: {
          source: 'custom',
          displayName: '  New orthogonal signal  ',
        },
      },
    });
    if (!result.ok) throw new Error('Expected custom signal draft.');
    expect(result.draft.signal.entityId).toBe(`${result.draft.id}.entity.signal`);
  });

  it('fails closed for a stale existing Entity selection and an unknown canonical selection', () => {
    const project = projectFixture();
    const base = validKnownState();
    const stale = buildSignalPoolDraft(
      {
        ...base,
        signalMode: 'existing',
        knownCatalogSignalId: '',
        existingEntityId: 'entity.missing',
      },
      project,
    );
    const unknown = buildSignalPoolDraft({ ...base, knownCatalogSignalId: 'ahl.missing' }, project);

    expect(stale).toMatchObject({ ok: false, issues: [{ code: 'existing_entity_unknown' }] });
    expect(unknown).toMatchObject({ ok: false, issues: [{ code: 'known_signal_unknown' }] });
  });
});
