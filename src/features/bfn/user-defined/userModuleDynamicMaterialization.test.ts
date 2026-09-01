import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { parseBfnProject } from '../repository';
import { runBfnSimulation } from '../simulation';
import type { BfnProject } from '../types';
import { createIndexedDbBfnWorkspaceRepository } from '../workspace/indexedDbWorkspaceRepository';
import { createLocalStorageBfnWorkspaceRepository } from '../workspace/localStorageWorkspaceRepository';
import { createWorkspaceProjectMetadata } from '../workspace/workspaceProjectFactory';
import type { UserDefinedDynamicFunctionalModuleDraft } from './userModuleDynamicContract';
import { materializeUserDefinedDynamicModule } from './userModuleDynamicMaterialization';

function dynamicDraft(
  overrides: Partial<UserDefinedDynamicFunctionalModuleDraft> = {},
): UserDefinedDynamicFunctionalModuleDraft {
  const base: UserDefinedDynamicFunctionalModuleDraft = {
    id: 'user.module.dynamic-materialized',
    origin: 'user_defined',
    name: 'Materialized dynamic module',
    description: 'First-order dynamic test module.',
    ports: [
      {
        id: 'input',
        name: 'Input role',
        entity: { id: 'entity.dynamic.input', displayName: 'Dynamic input' },
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
      {
        id: 'output',
        name: 'Output role',
        entity: { id: 'entity.dynamic.output', displayName: 'Dynamic output' },
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
    dynamics: { tau: { value: 2, unit: 'h' }, initialState: 0.1 },
    timeRangeHours: [0, 12],
    context: {
      state: 'defined',
      facts: {
        hostSpecies: 'Escherichia coli',
        hostStrain: 'MG1655',
        medium: 'M9',
        temperatureCelsius: 37,
      },
    },
    uncertainty: { state: 'reported', method: 'parameter_interval_envelope' },
    evidence: {
      basis: 'fitted_from_published_data',
      provenance: [
        {
          id: 'dynamic-source',
          kind: 'publication',
          reference: 'Example et al. 2026, doi:10.0000/example',
        },
      ],
    },
    implementation: { state: 'unspecified', implementationIds: [] },
  };
  return {
    ...base,
    ...overrides,
    steadyStateResponse: overrides.steadyStateResponse ?? {
      ...base.steadyStateResponse,
      parameters: {
        ...base.steadyStateResponse.parameters,
        k: { value: 10, unit: 'nM', interval95: [8, 12] },
        n: { value: 2, unit: 'dimensionless', interval95: [1.5, 2.5] },
        ymin: { value: 0.1, unit: 'RPU', interval95: [0, 0.2] },
        ymax: { value: 1, unit: 'RPU', interval95: [0.8, 1.2] },
      },
    },
    dynamics: overrides.dynamics ?? {
      tau: { value: 2, unit: 'h', interval95: [1, 3] },
      initialState: 0.1,
    },
  };
}

function draftWithPortEntityId(
  draft: UserDefinedDynamicFunctionalModuleDraft,
  entityId: string,
): UserDefinedDynamicFunctionalModuleDraft {
  return {
    ...draft,
    ports: draft.ports.map((port, index) =>
      index === 0 ? { ...port, entity: { ...port.entity, id: entityId } } : port,
    ),
  };
}

function expectEntityIdCollision(entityId: string): void {
  const project = createDemoBfnProject();
  const projectBefore = structuredClone(project);
  const result = materializeUserDefinedDynamicModule(
    draftWithPortEntityId(dynamicDraft(), entityId),
    project,
  );
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'generated_id_collision' }),
    );
    expect(result.issues.some((issue) => issue.details?.includes(entityId))).toBe(true);
  }
  expect(project).toEqual(projectBefore);
}

function materializedConnectedProject(mode: 'static' | 'dynamic'): BfnProject {
  const base = createDemoBfnProject();
  base.network.mode = mode;
  base.network.inputSources = [
    {
      kind: 'input_source',
      id: 'source-dynamic-test',
      labelKey: 'bfn.sources.test',
      outputPort: {
        id: 'source-dynamic-test-out',
        entity: 'entity.dynamic.input',
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'output',
      },
      staticSpecification: { type: 'fixed_value', value: 20, unit: 'nM' },
      dynamicSpecification: { type: 'step', before: 0, after: 20, atHours: 1, unit: 'nM' },
      position: { x: 30, y: 200 },
    },
  ];
  base.network.modules = [];
  base.network.outputMonitors = [
    {
      kind: 'output_monitor',
      id: 'monitor-dynamic-test',
      labelKey: 'bfn.monitors.test',
      inputPort: {
        id: 'monitor-dynamic-test-in',
        entity: 'entity.dynamic.output',
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'input',
      },
      position: { x: 800, y: 200 },
    },
  ];
  base.network.edges = [];
  const materialized = materializeUserDefinedDynamicModule(dynamicDraft(), base);
  if (!materialized.ok) throw new Error(materialized.issues.map((issue) => issue.code).join(','));
  const module = materialized.nextProject.network.modules[0]!;
  const source = materialized.nextProject.network.inputSources[0]!;
  const monitor = materialized.nextProject.network.outputMonitors[0]!;
  materialized.nextProject.network.edges.push(
    {
      id: 'edge-dynamic-test-input',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-dynamic-test-output',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  );
  return materialized.nextProject;
}

describe('user-defined first-order dynamic module materialization', () => {
  beforeEach(() => localStorage.clear());

  it('materializes paired static and dynamic variants with the existing sidecars only', () => {
    const project = createDemoBfnProject();
    const draft = dynamicDraft();
    const result = materializeUserDefinedDynamicModule(draft, project);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const module = result.nextProject.network.modules.at(-1)!;
    const staticModel = module.modelVariants.find((model) => model.mode === 'static');
    const dynamicModel = module.modelVariants.find((model) => model.mode === 'dynamic');
    expect(module.modelVariants).toHaveLength(2);
    expect(module.activeModelIds).toEqual({
      static: `${draft.id}.model.static.v1`,
      dynamic: `${draft.id}.model.dynamic.v1`,
    });
    expect(staticModel).toBeDefined();
    expect(dynamicModel).toBeDefined();
    expect(
      dynamicModel?.mode === 'dynamic' && dynamicModel.family === 'first_order'
        ? dynamicModel.steadyStateResponse
        : undefined,
    ).toEqual(staticModel?.response);
    expect(
      dynamicModel?.mode === 'dynamic' && dynamicModel.family === 'first_order'
        ? dynamicModel.steadyStateResponse
        : undefined,
    ).not.toBe(staticModel?.response);
    expect(dynamicModel).toMatchObject({
      mode: 'dynamic',
      family: 'first_order',
      tau: { value: 2, unit: 'h', interval95: [1, 3] },
      initialState: 0.1,
    });
    expect(result.nextProject.registry.validityDomains.at(-1)).toMatchObject({
      id: `${draft.id}.domain.v1`,
      timeRangeHours: [0, 12],
    });
    expect(result.nextProject.registry.contexts.at(-1)).toMatchObject({
      id: `${draft.id}.context.v1`,
      documentationState: 'recorded',
    });
    expect(result.nextProject.registry.provenanceRecords.at(-1)).toEqual({
      id: 'dynamic-source',
      kind: 'publication',
      reference: 'Example et al. 2026, doi:10.0000/example',
    });
    expect(result.nextProject.network.inputSources).toEqual(project.network.inputSources);
    expect(result.nextProject.network.outputMonitors).toEqual(project.network.outputMonitors);
    expect(result.nextProject.network.edges).toEqual(project.network.edges);
    expect(result.nextProject.network.modules).toHaveLength(project.network.modules.length + 1);
  });

  it('is deterministic and non-mutating, and rejects invalid tau before creating sidecars', () => {
    const project = createDemoBfnProject();
    const draft = dynamicDraft();
    const projectBefore = structuredClone(project);
    const draftBefore = structuredClone(draft);
    const first = materializeUserDefinedDynamicModule(draft, project);
    const second = materializeUserDefinedDynamicModule(draft, project);
    expect(first).toEqual(second);
    expect(project).toEqual(projectBefore);
    expect(draft).toEqual(draftBefore);

    const invalid = materializeUserDefinedDynamicModule(
      dynamicDraft({ dynamics: { tau: { value: 0, unit: 'h' }, initialState: 0.1 } }),
      project,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(
        invalid.issues.some((issue) =>
          issue.details?.some((detail) => detail.includes('dynamic_tau_non_positive')),
        ),
      ).toBe(true);
    }
    expect(project).toEqual(projectBefore);
  });

  it('fails closed when the dynamic model ID collides with an existing project ID', () => {
    const project = createDemoBfnProject();
    project.registry.validityDomains.push({
      id: 'user.module.dynamic-materialized.model.dynamic.v1',
      labelKey: 'collision',
      inputRanges: [],
      contextId: null,
    });
    const result = materializeUserDefinedDynamicModule(dynamicDraft(), project);
    expect(result).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'generated_id_collision' })],
    });
  });

  it('rejects a port entity ID equal to the generated dynamic model ID', () => {
    expectEntityIdCollision('user.module.dynamic-materialized.model.dynamic.v1');
  });

  it('rejects a port entity ID equal to a generated static sidecar ID', () => {
    expectEntityIdCollision('user.module.dynamic-materialized.model.static.v1');
  });

  it('rejects a port entity ID equal to an existing non-entity project object ID', () => {
    expectEntityIdCollision('module-ahl-sensor');
  });

  it('allows repeated ports to reuse one entity ID', () => {
    const draft = dynamicDraft();
    const sharedEntityId = 'entity.dynamic.shared';
    const result = materializeUserDefinedDynamicModule(
      {
        ...draft,
        ports: draft.ports.map((port) => ({
          ...port,
          entity: { ...port.entity, id: sharedEntityId, displayName: 'Shared entity' },
        })),
      },
      createDemoBfnProject(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.nextProject.registry.entities.filter((entity) => entity.id === sharedEntityId),
      ).toHaveLength(1);
    }
  });

  it('rejects a reported envelope without a tau interval before materializing any sidecar', () => {
    const project = createDemoBfnProject();
    const draft = dynamicDraft({ dynamics: { tau: { value: 2, unit: 'h' }, initialState: 0.1 } });
    const result = materializeUserDefinedDynamicModule(draft, project);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((issue) =>
          issue.details?.some((detail) => detail.includes('dynamic_tau_interval_missing')),
        ),
      ).toBe(true);
    }
    expect(project.network.modules).toHaveLength(createDemoBfnProject().network.modules.length);
    expect(project.registry.entities).toEqual(createDemoBfnProject().registry.entities);
  });

  it('distinguishes malformed optional tau intervals from a missing envelope interval', () => {
    const uncertaintyStates = [
      { state: 'none' as const },
      { state: 'not_recorded' as const },
      { state: 'reported' as const, method: 'parameter_interval_envelope' as const },
      { state: 'parameter_interval_envelope' as const },
    ];
    const malformedIntervals: readonly unknown[] = [
      null,
      [2],
      [Number.NaN, 3],
      [0, 3],
      [3, 2],
      [1, 1.5],
    ];
    for (const uncertainty of uncertaintyStates) {
      for (const interval of malformedIntervals) {
        const draft = dynamicDraft({ uncertainty });
        Object.assign(draft.dynamics.tau, { interval95: interval });
        const result = materializeUserDefinedDynamicModule(draft, createDemoBfnProject());
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(
            result.issues.some((issue) =>
              issue.details?.some(
                (detail) =>
                  detail.includes('dynamic_tau_interval_invalid') ||
                  detail.includes('dynamic_tau_interval_estimate_outside'),
              ),
            ),
          ).toBe(true);
        }
      }
    }
  });

  it('allows a missing tau interval when uncertainty is not recorded', () => {
    const result = materializeUserDefinedDynamicModule(
      dynamicDraft({
        uncertainty: { state: 'not_recorded' },
        dynamics: { tau: { value: 2, unit: 'h' }, initialState: 0.1 },
      }),
      createDemoBfnProject(),
    );
    expect(result.ok).toBe(true);
  });

  it('does not add graph artifacts or a Signal Pool/Run sidecar', () => {
    const project = createDemoBfnProject();
    const result = materializeUserDefinedDynamicModule(dynamicDraft(), project);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.nextProject as BfnProject & Record<string, unknown>;
    expect(next.network.inputSources).toHaveLength(project.network.inputSources.length);
    expect(next.network.outputMonitors).toHaveLength(project.network.outputMonitors.length);
    expect(next.network.edges).toHaveLength(project.network.edges.length);
    expect(next).not.toHaveProperty('signalPool');
    expect(next).not.toHaveProperty('runs');
  });

  it('uses the paired static model in static execution and the paired first-order model in dynamic execution', () => {
    const staticProject = materializedConnectedProject('static');
    const staticResult = runBfnSimulation(staticProject);
    expect(staticResult.mode).toBe('static');
    expect(staticResult.points).toHaveLength(1);
    expect(staticResult.temporalSnapshot?.modules[0]).toMatchObject({
      selectedModelId: 'user.module.dynamic-materialized.model.static.v1',
      executionMode: 'steady_state',
      evidenceTier: 'not_recorded',
    });

    const dynamicProject = materializedConnectedProject('dynamic');
    dynamicProject.analysis.durationHours = 8;
    dynamicProject.analysis.timeStepHours = 0.5;
    const dynamicResult = runBfnSimulation(dynamicProject);
    const outputs = dynamicResult.points.map((point) => point.output);
    const preStepPoints = dynamicResult.points.filter((point) => (point.timeHours ?? 0) < 1);
    const postStepPoints = dynamicResult.points.filter((point) => (point.timeHours ?? 0) >= 1);
    expect(dynamicResult.temporalSnapshot?.modules[0]).toMatchObject({
      selectedModelId: 'user.module.dynamic-materialized.model.dynamic.v1',
      executionMode: 'stateful_dynamic',
      evidenceTier: 'not_recorded',
    });
    expect(outputs[0]).toBeCloseTo(0.1, 8);
    expect(preStepPoints.length).toBeGreaterThan(1);
    expect(preStepPoints.every((point) => Math.abs(point.output - outputs[0]!) < 1e-8)).toBe(true);
    expect(preStepPoints.every((point) => point.inputs['source-dynamic-test'] === 0)).toBe(true);
    expect(preStepPoints.at(-1)?.output).toBeCloseTo(outputs[0]!, 8);
    expect(postStepPoints[0]?.inputs['source-dynamic-test']).toBe(20);
    expect(
      postStepPoints.every(
        (point, index) => index === 0 || point.output >= postStepPoints[index - 1]!.output,
      ),
    ).toBe(true);
    expect(postStepPoints[0]?.output).toBeGreaterThan(preStepPoints.at(-1)?.output ?? 0);
    expect(outputs.at(-1)).toBeCloseTo(staticResult.points[0]!.output, 1);
  });

  it('round-trips dynamic authoring metadata through JSON/BFN-IR 2.3 and Workspace v1', async () => {
    const project = createDemoBfnProject();
    const result = materializeUserDefinedDynamicModule(dynamicDraft(), project);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = parseBfnProject(JSON.stringify(result.nextProject));
    expect(parsed).toEqual(result.nextProject);
    const parsedModule = parsed.network.modules.at(-1)!;
    const originalModule = result.nextProject.network.modules.at(-1)!;
    expect(parsedModule.authoring).toEqual(originalModule.authoring);
    expect(parsedModule.inputPorts).toEqual(originalModule.inputPorts);
    expect(parsedModule.outputPorts).toEqual(originalModule.outputPorts);
    expect(parsedModule.modelVariants).toEqual(originalModule.modelVariants);
    expect(parsedModule.modelVariants.find((model) => model.mode === 'dynamic')).toMatchObject({
      tau: { value: 2, unit: 'h', interval95: [1, 3] },
      initialState: 0.1,
    });
    expect(parsed.registry.validityDomains.at(-1)?.timeRangeHours).toEqual([0, 12]);
    expect(parsed.registry.contexts.at(-1)).toEqual(result.nextProject.registry.contexts.at(-1));
    expect(parsed.registry.provenanceRecords.at(-1)).toEqual(
      result.nextProject.registry.provenanceRecords.at(-1),
    );
    expect(parsedModule.implementationIds).toEqual(originalModule.implementationIds);
    const metadata = createWorkspaceProjectMetadata('Dynamic project', {
      now: '2026-09-01T00:00:00.000Z',
      workspaceProjectId: 'dynamic-workspace',
    });
    const repositories = [
      createLocalStorageBfnWorkspaceRepository(localStorage),
      createIndexedDbBfnWorkspaceRepository(new IDBFactory()),
    ];
    for (const repository of repositories) {
      await repository.createProject({ metadata, draft: result.nextProject, makeActive: true });
      expect(await repository.getDraft(metadata.id)).toEqual(result.nextProject);
    }
  });
});
