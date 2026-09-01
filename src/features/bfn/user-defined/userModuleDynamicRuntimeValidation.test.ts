import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { parseBfnProject } from '../repository';
import { runBfnSimulation } from '../simulation';
import type { BfnDynamicModel, BfnFunctionalModule, BfnProject, BfnStaticModel } from '../types';
import { validateBfnProject } from '../validation';
import { createLocalStorageBfnWorkspaceRepository } from '../workspace/localStorageWorkspaceRepository';
import { createWorkspaceProjectMetadata } from '../workspace/workspaceProjectFactory';
import type { UserDefinedDynamicFunctionalModuleDraft } from './userModuleDynamicContract';
import { materializeUserDefinedDynamicModule } from './userModuleDynamicMaterialization';

const MODULE_ID = 'user.module.dynamic-runtime';
const MONITOR_ID = 'monitor-dynamic-runtime';

function runtimeDraft(): UserDefinedDynamicFunctionalModuleDraft {
  return {
    id: MODULE_ID,
    origin: 'user_defined',
    name: 'Dynamic runtime contract module',
    description: 'Runtime admission fixture.',
    ports: [
      {
        id: 'dynamic-runtime-input',
        name: 'Input',
        entity: { id: 'entity.dynamic.runtime.input', displayName: 'Runtime input' },
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
      {
        id: 'dynamic-runtime-output',
        name: 'Output',
        entity: { id: 'entity.dynamic.runtime.output', displayName: 'Runtime output' },
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'output',
      },
    ],
    steadyStateResponse: {
      family: 'hill_activation',
      inputPortIds: ['dynamic-runtime-input'],
      outputPortIds: ['dynamic-runtime-output'],
      parameters: {
        k: { value: 10, unit: 'nM' },
        n: { value: 2, unit: 'dimensionless' },
        ymin: { value: 0.1, unit: 'RPU' },
        ymax: { value: 1, unit: 'RPU' },
      },
    },
    validityDomains: [{ portId: 'dynamic-runtime-input', minimum: 0, maximum: 100, unit: 'nM' }],
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
    uncertainty: { state: 'none' },
    evidence: { basis: 'proposed_unbuilt_design', provenance: [] },
    implementation: { state: 'unspecified', implementationIds: [] },
  };
}

function materializedConnectedProject(mode: 'static' | 'dynamic' = 'dynamic'): BfnProject {
  const base = createDemoBfnProject();
  base.network.mode = mode;
  base.network.inputSources = [
    {
      kind: 'input_source',
      id: 'source-dynamic-runtime',
      labelKey: 'bfn.sources.test',
      outputPort: {
        id: 'source-dynamic-runtime-out',
        entity: 'entity.dynamic.runtime.input',
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
      id: MONITOR_ID,
      labelKey: 'bfn.monitors.test',
      inputPort: {
        id: 'monitor-dynamic-runtime-in',
        entity: 'entity.dynamic.runtime.output',
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'input',
      },
      position: { x: 800, y: 200 },
    },
  ];
  base.network.edges = [];

  const result = materializeUserDefinedDynamicModule(runtimeDraft(), base);
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.code).join(','));
  const project = result.nextProject;
  const module = authoredModule(project);
  const source = project.network.inputSources[0]!;
  const monitor = project.network.outputMonitors[0]!;
  project.network.edges.push(
    {
      id: 'edge-dynamic-runtime-input',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-dynamic-runtime-output',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  );
  return project;
}

function authoredModule(project: BfnProject): BfnFunctionalModule {
  const module = project.network.modules.find((candidate) => candidate.id === MODULE_ID);
  if (!module) throw new Error('Expected materialized authored module.');
  return module;
}

function dynamicModel(project: BfnProject): BfnDynamicModel {
  const model = authoredModule(project).modelVariants.find(
    (candidate): candidate is BfnDynamicModel => candidate.mode === 'dynamic',
  );
  if (!model) throw new Error('Expected paired dynamic model.');
  return model;
}

function staticModel(project: BfnProject): BfnStaticModel {
  const model = authoredModule(project).modelVariants.find(
    (candidate): candidate is BfnStaticModel => candidate.mode === 'static',
  );
  if (!model) throw new Error('Expected paired static model.');
  return model;
}

function importedProject(
  mutate: (project: BfnProject) => void,
  mode: 'static' | 'dynamic' = 'dynamic',
): BfnProject {
  const serialized = structuredClone(materializedConnectedProject(mode));
  mutate(serialized);
  return parseBfnProject(JSON.stringify(serialized));
}

function contractReasons(project: BfnProject, targetMonitorId = MONITOR_ID): string[] {
  return validateBfnProject(project, { targetMonitorId })
    .filter((issue) => issue.code === 'dynamic_model_contract_invalid')
    .map((issue) => String(issue.details?.reason));
}

function expectRuntimeContractFailure(project: BfnProject, reason: string): void {
  expect(contractReasons(project)).toContain(reason);
  expect(() => runBfnSimulation(project)).toThrow(
    /BFN_VALIDATION_FAILED:.*dynamic_model_contract_invalid/u,
  );
}

describe('user-defined dynamic runtime contract admission', () => {
  it('rejects an imported negative tau before the solver clamp can execute it', () => {
    const project = importedProject((imported) => {
      dynamicModel(imported).tau.value = -1;
    });

    expect(dynamicModel(project).tau).toEqual({ value: -1, unit: 'h' });
    expectRuntimeContractFailure(project, 'tau_non_positive');
  });

  it('rejects the same malformed contract after a Workspace persistence round trip', async () => {
    localStorage.clear();
    const project = materializedConnectedProject();
    dynamicModel(project).tau.value = -1;
    const repository = createLocalStorageBfnWorkspaceRepository(localStorage);
    const metadata = createWorkspaceProjectMetadata('Malformed persisted dynamic project', {
      now: '2026-09-01T00:00:00.000Z',
      workspaceProjectId: 'dynamic-runtime-contract-workspace',
    });
    await repository.createProject({ metadata, draft: project, makeActive: true });

    const persisted = await repository.getDraft(metadata.id);
    expect(persisted).not.toBeNull();
    expectRuntimeContractFailure(persisted!, 'tau_non_positive');
  });

  it('rejects an imported tau with the wrong scientific unit', () => {
    const project = importedProject((imported) => {
      dynamicModel(imported).tau.unit = 'nM';
    });

    expectRuntimeContractFailure(project, 'tau_unit_invalid');
  });

  it('rejects non-finite direct and null imported initial states without coercion', () => {
    const direct = materializedConnectedProject();
    dynamicModel(direct).initialState = Number.NaN;
    expectRuntimeContractFailure(direct, 'initial_state_invalid');

    const imported = importedProject((project) => {
      Object.assign(dynamicModel(project), { initialState: null });
    });
    expect(dynamicModel(imported).initialState).toBeNull();
    expectRuntimeContractFailure(imported, 'initial_state_invalid');
  });

  it.each([
    [
      'family_invalid',
      (project: BfnProject) => Object.assign(dynamicModel(project), { family: 'second_order' }),
    ],
    [
      'tau_missing',
      (project: BfnProject) => {
        delete (dynamicModel(project) as unknown as { tau?: unknown }).tau;
      },
    ],
    [
      'tau_non_finite',
      (project: BfnProject) => {
        dynamicModel(project).tau.value = Number.NaN;
      },
    ],
    [
      'tau_non_positive',
      (project: BfnProject) => {
        dynamicModel(project).tau.value = 0;
      },
    ],
    [
      'tau_interval_invalid',
      (project: BfnProject) => {
        dynamicModel(project).tau.interval95 = [0, 3];
      },
    ],
  ] as const)('reports the stable %s reason', (reason, mutate) => {
    const project = materializedConnectedProject();
    mutate(project);
    expectRuntimeContractFailure(project, reason);
  });

  it('rejects a missing or non-static paired active model', () => {
    const missing = materializedConnectedProject();
    authoredModule(missing).activeModelIds.static = 'missing-static-model';
    expectRuntimeContractFailure(missing, 'paired_static_missing');

    const nonStatic = materializedConnectedProject();
    authoredModule(nonStatic).activeModelIds.static = dynamicModel(nonStatic).id;
    expectRuntimeContractFailure(nonStatic, 'paired_static_missing');
  });

  it('rejects a changed paired static response and ignores object insertion order', () => {
    const mismatched = materializedConnectedProject();
    const response = staticModel(mismatched).response;
    if (response.family !== 'hill_activation') throw new Error('Expected Hill response.');
    response.k.value = 80;
    expectRuntimeContractFailure(mismatched, 'steady_state_response_mismatch');

    const reordered = materializedConnectedProject();
    const dynamic = dynamicModel(reordered);
    dynamic.steadyStateResponse = Object.fromEntries(
      Object.entries(dynamic.steadyStateResponse).reverse(),
    ) as unknown as BfnDynamicModel['steadyStateResponse'];
    expect(contractReasons(reordered)).not.toContain('steady_state_response_mismatch');
  });

  it('rejects an imported reversed time validity range', () => {
    const project = importedProject((imported) => {
      const domain = imported.registry.validityDomains.find(
        (candidate) => candidate.id === dynamicModel(imported).validityDomainId,
      );
      if (!domain) throw new Error('Expected dynamic validity domain.');
      domain.timeRangeHours = [8, 2];
    });

    expectRuntimeContractFailure(project, 'time_range_invalid');
  });

  it('rejects an incomplete declared parameter-interval envelope', () => {
    const project = materializedConnectedProject();
    const dynamic = dynamicModel(project);
    dynamic.uncertaintyMethod = 'parameter_interval_envelope';
    dynamic.tau.interval95 = [1, 3];

    expectRuntimeContractFailure(project, 'parameter_interval_incomplete');
  });

  it('keeps valid paired static and dynamic execution admitted', () => {
    const staticProject = materializedConnectedProject('static');
    expect(contractReasons(staticProject)).toEqual([]);
    expect(runBfnSimulation(staticProject).mode).toBe('static');

    const dynamicProject = materializedConnectedProject('dynamic');
    expect(contractReasons(dynamicProject)).toEqual([]);
    expect(runBfnSimulation(dynamicProject).mode).toBe('dynamic');
  });

  it('does not inspect a malformed dormant dynamic variant in static mode', () => {
    const project = materializedConnectedProject('static');
    dynamicModel(project).tau.value = -1;

    expect(contractReasons(project)).toEqual([]);
    expect(runBfnSimulation(project).mode).toBe('static');
  });

  it('does not block the selected monitor for a malformed authored dynamic module off target', () => {
    const project = materializedConnectedProject();
    const offTarget = structuredClone(authoredModule(project));
    offTarget.id = 'user.module.dynamic-runtime.off-target';
    offTarget.labelKey = 'bfn.userDefined.offTarget';
    offTarget.inputPorts[0] = { ...offTarget.inputPorts[0]!, id: 'off-target-input' };
    offTarget.outputPorts[0] = { ...offTarget.outputPorts[0]!, id: 'off-target-output' };
    offTarget.modelVariants = offTarget.modelVariants.map((model) => ({
      ...model,
      id: model.id + '.off-target',
    }));
    offTarget.activeModelIds = {
      static: staticModel(project).id + '.off-target',
      dynamic: dynamicModel(project).id + '.off-target',
    };
    const offTargetDynamic = offTarget.modelVariants.find(
      (model): model is BfnDynamicModel => model.mode === 'dynamic',
    )!;
    offTargetDynamic.tau.value = -1;
    const secondMonitor = structuredClone(project.network.outputMonitors[0]!);
    secondMonitor.id = 'monitor-dynamic-runtime-off-target';
    secondMonitor.inputPort = {
      ...secondMonitor.inputPort,
      id: 'monitor-dynamic-runtime-off-target-in',
    };
    project.network.modules.push(offTarget);
    project.network.outputMonitors.push(secondMonitor);
    project.network.edges.push({
      id: 'edge-dynamic-runtime-off-target-output',
      source: { nodeId: offTarget.id, portId: offTarget.outputPorts[0].id },
      target: { nodeId: secondMonitor.id, portId: secondMonitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    });

    expect(
      validateBfnProject(project, { targetMonitorId: MONITOR_ID }).some(
        (issue) =>
          issue.code === 'dynamic_model_contract_invalid' && issue.subjectId === offTarget.id,
      ),
    ).toBe(false);
    expect(
      validateBfnProject(project).some(
        (issue) =>
          issue.code === 'dynamic_model_contract_invalid' &&
          issue.subjectId === offTarget.id &&
          issue.details?.reason === 'tau_non_positive',
      ),
    ).toBe(true);
    expect(() => runBfnSimulation(project)).not.toThrow();
  });
});
