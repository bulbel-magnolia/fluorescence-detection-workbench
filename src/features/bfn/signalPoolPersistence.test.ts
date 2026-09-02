import { beforeEach, describe, expect, it } from 'vitest';
import { createBfnComputationSignature } from './computationSignature';
import { createDemoBfnProject } from './fixtures';
import { loadBfnProject, parseBfnProject, saveBfnProject } from './repository';
import type { BfnAccumulatorDynamicModel, BfnProject } from './types';
import { getDesignedSenderSignalCatalog } from './user-defined/designed-sender/designedSenderSignalCatalog';
import {
  createInitialSignalPoolAuthoringState,
  type SignalPoolAuthoringState,
} from './user-defined/signal-pool/signalPoolContract';
import { buildSignalPoolDraft } from './user-defined/signal-pool/signalPoolDraft';
import { materializeSignalPool } from './user-defined/signal-pool/signalPoolMaterialization';
import { createLocalStorageBfnWorkspaceRepository } from './workspace/localStorageWorkspaceRepository';
import { BFN_WORKSPACE_DATABASE_VERSION } from './workspace/workspaceTypes';

function customState(overrides: Partial<SignalPoolAuthoringState> = {}): SignalPoolAuthoringState {
  return {
    ...createInitialSignalPoolAuthoringState(),
    name: 'Persistent Signal Pool',
    description: 'Exact persistent description',
    signalMode: 'custom',
    customSignalName: 'Persistent signal X',
    concentrationUnit: 'uM',
    initialConcentration: '1.5',
    ...overrides,
  };
}

function materializedProject(state: SignalPoolAuthoringState = customState()): BfnProject {
  const project = createDemoBfnProject();
  const built = buildSignalPoolDraft(state, project);
  if (!built.ok) throw new Error('Expected a valid persistence draft fixture.');
  const result = materializeSignalPool(built.draft, project);
  if (!result.ok) throw new Error('Expected a materialized persistence fixture.');
  return result.nextProject;
}

function signalPoolModel(project: BfnProject): BfnAccumulatorDynamicModel {
  const module = project.network.modules.at(-1);
  const model = module?.modelVariants[0];
  if (model?.mode !== 'dynamic' || model.family !== 'accumulator') {
    throw new Error('Expected a persisted Signal Pool accumulator.');
  }
  return model;
}

describe('Signal Pool persistence and computation identity', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips losslessly through JSON and localStorage as BFN-IR 2.3', () => {
    const project = materializedProject();

    expect(parseBfnProject(JSON.stringify(project))).toEqual(project);
    saveBfnProject(project);
    expect(loadBfnProject()).toEqual(project);
    expect(project.schemaVersion).toBe('2.3');
    expect(signalPoolModel(project)).toMatchObject({
      family: 'accumulator',
      initialState: 1.5,
      uncertaintyMethod: 'none',
    });
    expect(project.network.modules.at(-1)?.activeModelIds).toEqual({
      dynamic: signalPoolModel(project).id,
    });
  });

  it('round-trips losslessly through Workspace Draft and Version while DB remains version 1', async () => {
    const project = materializedProject();
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const timestamp = '2026-09-02T00:00:00.000Z';
    await repository.createProject({
      metadata: {
        id: project.id,
        name: 'Signal Pool workspace',
        createdAt: timestamp,
        lastOpenedAt: timestamp,
        draftUpdatedAt: timestamp,
        nextRevision: 1,
      },
      draft: project,
    });

    expect(await repository.getDraft(project.id)).toEqual(project);
    await repository.saveDraft(project.id, project, timestamp);
    const version = await repository.createVersion({
      projectId: project.id,
      snapshot: project,
      computationSignature: createBfnComputationSignature(project),
      createdAt: timestamp,
    });
    expect((await repository.getVersion(version.id))?.snapshot).toEqual(project);
    expect(BFN_WORKSPACE_DATABASE_VERSION).toBe(1);
  });

  it('changes the computation signature for C0, signal identity, and unit pair only', () => {
    const project = materializedProject();
    const baseSignature = createBfnComputationSignature(project);
    const model = signalPoolModel(project);
    const module = project.network.modules.at(-1)!;

    const changedInitialState = structuredClone(project);
    signalPoolModel(changedInitialState).initialState = model.initialState + 1;
    expect(createBfnComputationSignature(changedInitialState)).not.toBe(baseSignature);

    const changedSignal = structuredClone(project);
    const changedModule = changedSignal.network.modules.at(-1)!;
    changedModule.inputPorts[0]!.entity = 'entity.changed-signal';
    changedModule.outputPorts[0]!.entity = 'entity.changed-signal';
    expect(createBfnComputationSignature(changedSignal)).not.toBe(baseSignature);

    const changedUnitPair = structuredClone(project);
    const changedUnitModule = changedUnitPair.network.modules.at(-1)!;
    changedUnitModule.inputPorts[0]!.unit = 'nM/h';
    changedUnitModule.outputPorts[0]!.unit = 'nM';
    expect(createBfnComputationSignature(changedUnitPair)).not.toBe(baseSignature);

    const presentationOnly = structuredClone(project);
    const presentationModule = presentationOnly.network.modules.at(-1)!;
    presentationModule.authoring = {
      origin: 'user_defined',
      name: 'Renamed Pool',
      description: 'Changed description',
    };
    presentationModule.position = {
      x: module.position.x + 100,
      y: module.position.y + 50,
    };
    expect(createBfnComputationSignature(presentationOnly)).toBe(baseSignature);
  });

  it('preserves the exact canonical Designed Sender signal identity through export/import', () => {
    const signal = getDesignedSenderSignalCatalog().find(
      (candidate) => candidate.catalogSignalId === 'ahl.3oc6.l',
    );
    if (!signal) throw new Error('Expected trusted 3OC6-HSL identity.');
    const project = materializedProject({
      ...customState(),
      name: 'Canonical Signal Pool',
      signalMode: 'known',
      customSignalName: '',
      knownCatalogSignalId: signal.catalogSignalId,
    });
    const loaded = parseBfnProject(JSON.stringify(project));
    const module = loaded.network.modules.at(-1)!;

    expect(module.inputPorts[0]?.entity).toBe(signal.entityId);
    expect(module.outputPorts[0]?.entity).toBe(signal.entityId);
    expect(loaded.registry.entities.some((entity) => entity.id === signal.entityId)).toBe(false);
  });
});
