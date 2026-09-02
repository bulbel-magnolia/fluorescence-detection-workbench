import { describe, expect, it } from 'vitest';
import { assessBfnAccumulatorRuntimeContract } from '../../accumulatorRuntimeContract';
import { createDemoBfnProject } from '../../fixtures';
import type { BfnProject } from '../../types';
import { getDesignedSenderSignalCatalog } from '../designed-sender/designedSenderSignalCatalog';
import {
  createInitialSignalPoolAuthoringState,
  type SignalPoolAuthoringState,
  type SignalPoolDraft,
} from './signalPoolContract';
import { buildSignalPoolDraft } from './signalPoolDraft';
import { materializeSignalPool } from './signalPoolMaterialization';

function projectFixture(): BfnProject {
  return createDemoBfnProject();
}

function knownState(): SignalPoolAuthoringState {
  const signal = getDesignedSenderSignalCatalog()[0];
  if (!signal) throw new Error('Expected a canonical Signal Pool test signal.');
  return {
    ...createInitialSignalPoolAuthoringState(),
    name: 'Signal pool fixture',
    description: 'Exact Signal Pool description.',
    signalMode: 'known',
    knownCatalogSignalId: signal.catalogSignalId,
    initialConcentration: '2',
  };
}

function requiredDraft(project: BfnProject, state: SignalPoolAuthoringState = knownState()) {
  const result = buildSignalPoolDraft(state, project);
  if (!result.ok) throw new Error('Expected a valid Signal Pool draft fixture.');
  return result.draft;
}

describe('Signal Pool materialization', () => {
  it('purely adds exactly one ordinary dynamic-only accumulator and its minimal domain', () => {
    const project = projectFixture();
    const before = structuredClone(project);
    const draft = requiredDraft(project);
    const result = materializeSignalPool(draft, project);

    expect(result).toMatchObject({ ok: true, addedModuleId: draft.id });
    expect(project).toEqual(before);
    if (!result.ok) throw new Error('Expected Signal Pool materialization.');

    expect(result.nextProject.network.modules).toHaveLength(project.network.modules.length + 1);
    const module = result.nextProject.network.modules.find(({ id }) => id === draft.id);
    expect(module).toMatchObject({
      kind: 'functional_module',
      id: draft.id,
      authoring: {
        origin: 'user_defined',
        name: draft.name,
        description: draft.description,
      },
      inputPorts: [
        {
          id: draft.inputPort.id,
          displayName: { en: 'Production rate', zh: '产生速率' },
          entity: draft.signal.entityId,
          quantityType: 'production_rate',
          unit: 'nM/h',
          direction: 'input',
        },
      ],
      outputPorts: [
        {
          id: draft.outputPort.id,
          displayName: { en: 'Concentration', zh: '浓度' },
          entity: draft.signal.entityId,
          quantityType: 'concentration',
          unit: 'nM',
          direction: 'output',
        },
      ],
      activeModelIds: { dynamic: `${draft.id}.model.accumulator.v1` },
      implementationIds: [],
      implementationState: 'unspecified',
      evidenceGrade: 'independent_assumption',
      isDemo: false,
    });
    expect(module?.inputPorts[0]?.authoring).toBeUndefined();
    expect(module?.outputPorts[0]?.authoring).toBeUndefined();
    expect(Object.keys(module?.activeModelIds ?? {})).toEqual(['dynamic']);
    expect(module?.modelVariants).toHaveLength(1);

    const model = module?.modelVariants[0];
    expect(model).toMatchObject({
      mode: 'dynamic',
      family: 'accumulator',
      inputPortId: draft.inputPort.id,
      outputPortId: draft.outputPort.id,
      initialState: 2,
      uncertaintyMethod: 'none',
      contextId: null,
      sourceDatasetIds: [],
      provenanceIds: [],
      evidenceGrade: 'independent_assumption',
      isDemo: false,
    });
    expect(model).not.toHaveProperty('tau');
    expect(model).not.toHaveProperty('steadyStateResponse');
    expect(model).not.toHaveProperty('response');
    expect(module?.modelVariants.some((candidate) => candidate.mode === 'static')).toBe(false);

    const domain = result.nextProject.registry.validityDomains.find(
      ({ id }) => id === `${draft.id}.domain.v1`,
    );
    expect(domain).toEqual({
      id: `${draft.id}.domain.v1`,
      labelKey: 'bfn.signalPool.validityDomain',
      inputRanges: [],
      contextId: null,
    });

    if (!module || model?.mode !== 'dynamic' || model.family !== 'accumulator') {
      throw new Error('Expected a materialized accumulator model.');
    }
    expect(assessBfnAccumulatorRuntimeContract(module, model)).toBeNull();
  });

  it('materializes the exact uM/h to uM pair', () => {
    const project = projectFixture();
    const draft = requiredDraft(project, { ...knownState(), concentrationUnit: 'uM' });
    const result = materializeSignalPool(draft, project);

    if (!result.ok) throw new Error('Expected uM Signal Pool materialization.');
    const module = result.nextProject.network.modules.find(({ id }) => id === draft.id)!;
    expect(module.inputPorts[0]?.unit).toBe('uM/h');
    expect(module.outputPorts[0]?.unit).toBe('uM');
  });

  it('reuses known and existing entities without creating user Entity definitions', () => {
    const project = projectFixture();
    const existingEntityId = '3OC6-HSL';
    const knownDraft = requiredDraft(project);
    const existingDraft = requiredDraft(project, {
      ...knownState(),
      name: 'Existing Entity Pool',
      signalMode: 'existing',
      knownCatalogSignalId: '',
      existingEntityId,
    });
    const known = materializeSignalPool(knownDraft, project);
    const existing = materializeSignalPool(existingDraft, project);

    if (!known.ok || !existing.ok) throw new Error('Expected Entity reuse materialization.');
    expect(known.nextProject.registry.entities).toEqual(project.registry.entities);
    expect(existing.nextProject.registry.entities).toEqual(project.registry.entities);
    expect(
      existing.nextProject.network.modules.find(({ id }) => id === existingDraft.id)?.inputPorts[0]
        ?.entity,
    ).toBe(existingEntityId);
  });

  it('fails closed when an existing Entity loses its only signal-semantic port after drafting', () => {
    const project = projectFixture();
    const owner = project.network.modules[0];
    if (!owner) throw new Error('Expected a project module fixture.');
    owner.outputPorts.push({
      id: 'port-production-rate-only',
      entity: 'entity.production-rate-only',
      quantityType: 'production_rate',
      unit: 'nM/h',
      direction: 'output',
    });
    const draft = requiredDraft(project, {
      ...knownState(),
      signalMode: 'existing',
      knownCatalogSignalId: '',
      existingEntityId: 'entity.production-rate-only',
    });
    owner.outputPorts = owner.outputPorts.filter(({ id }) => id !== 'port-production-rate-only');
    const before = structuredClone(project);

    expect(materializeSignalPool(draft, project)).toMatchObject({
      ok: false,
      issues: [{ code: 'signal_identity_invalid', path: 'signal.entityId' }],
    });
    expect(project).toEqual(before);
  });

  it('adds exactly one ordinary user-defined Entity for an explicit custom signal', () => {
    const project = projectFixture();
    const draft = requiredDraft(project, {
      ...knownState(),
      signalMode: 'custom',
      knownCatalogSignalId: '',
      customSignalName: '  Exact custom signal  ',
    });
    const result = materializeSignalPool(draft, project);

    if (!result.ok) throw new Error('Expected custom Signal Pool materialization.');
    expect(result.nextProject.registry.entities).toHaveLength(project.registry.entities.length + 1);
    expect(result.nextProject.registry.entities.at(-1)).toEqual({
      id: draft.signal.entityId,
      origin: 'user_defined',
      displayName: '  Exact custom signal  ',
      description: null,
    });
  });

  it('has no automatic graph, mode, run, provenance, context, or implementation side effects', () => {
    const project = projectFixture();
    project.network.mode = 'static';
    const draft = requiredDraft(project);
    const result = materializeSignalPool(draft, project);

    if (!result.ok) throw new Error('Expected side-effect boundary fixture.');
    expect(result.nextProject.network.inputSources).toEqual(project.network.inputSources);
    expect(result.nextProject.network.outputMonitors).toEqual(project.network.outputMonitors);
    expect(result.nextProject.network.edges).toEqual(project.network.edges);
    expect(result.nextProject.network.mode).toBe('static');
    expect(result.nextProject.registry.provenanceRecords).toEqual(
      project.registry.provenanceRecords,
    );
    expect(result.nextProject.registry.contexts).toEqual(project.registry.contexts);
    expect(result.nextProject.registry.implementations).toEqual(project.registry.implementations);
  });

  it('fails closed on canonical identity forgery, unit-pair corruption, generated ID collision, and Entity conflict', () => {
    const project = projectFixture();
    const draft = requiredDraft(project);
    const forged: SignalPoolDraft = {
      ...draft,
      signal:
        draft.signal.source === 'known'
          ? { ...draft.signal, entityId: 'entity.forged' }
          : draft.signal,
      inputPort: { ...draft.inputPort, entityId: 'entity.forged' },
      outputPort: { ...draft.outputPort, entityId: 'entity.forged' },
    };
    const unitMismatch: SignalPoolDraft = {
      ...draft,
      inputPort: { ...draft.inputPort, unit: 'uM/h' },
    };
    const collisionProject = structuredClone(project);
    collisionProject.network.inputSources[0]!.id = draft.id;
    const conflictProject = structuredClone(project);
    conflictProject.registry.entities.push({
      id: draft.signal.entityId,
      origin: 'user_defined',
      displayName: 'Conflicting identity',
      description: null,
    });

    expect(materializeSignalPool(forged, project)).toMatchObject({
      ok: false,
      issues: [{ code: 'signal_identity_invalid' }],
    });
    expect(materializeSignalPool(unitMismatch, project)).toMatchObject({
      ok: false,
      issues: [{ code: 'accumulator_contract_invalid', details: ['unit_pair_invalid'] }],
    });
    expect(materializeSignalPool(draft, collisionProject)).toMatchObject({
      ok: false,
      issues: [{ code: 'generated_id_collision' }],
    });
    expect(materializeSignalPool(draft, conflictProject)).toMatchObject({
      ok: false,
      issues: [{ code: 'entity_definition_conflict' }],
    });
  });

  it('rejects a non-finite initial state even if a serialized draft bypasses authoring validation', () => {
    const project = projectFixture();
    const draft = requiredDraft(project);
    const malformed: SignalPoolDraft = { ...draft, initialConcentration: Number.NaN };

    expect(materializeSignalPool(malformed, project)).toMatchObject({
      ok: false,
      issues: [{ code: 'draft_invalid', path: 'initialConcentration' }],
    });
  });

  it('fails closed on an unknown serialized signal source without mutating the project', () => {
    const project = projectFixture();
    const before = structuredClone(project);
    const draft = requiredDraft(project);
    const malformed = {
      ...draft,
      signal: {
        source: 'future_signal_mode',
        entityId: 'entity.arbitrary',
        displayName: 'Arbitrary signal',
      },
    } as unknown as SignalPoolDraft;

    expect(materializeSignalPool(malformed, project)).toMatchObject({
      ok: false,
      issues: [{ code: 'signal_identity_invalid', path: 'signal' }],
    });
    expect(project).toEqual(before);
  });
});
