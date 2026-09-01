import { describe, expect, it } from 'vitest';
import { isBfnProjectV22 } from '../../bfnIrMigration';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from '../../catalog/catalogBfnAdapter';
import { createDemoBfnProject } from '../../fixtures';
import { parseBfnProject } from '../../repository';
import { runBfnSimulation } from '../../simulation';
import type { BfnProject } from '../../types';
import { addIdealConnection, checkIdealConnection, validateBfnProject } from '../../validation';
import { materializeUserDefinedStaticModule } from '../userModuleMaterialization';
import type { DesignedSenderAuthoringState } from './designedSenderContract';
import {
  buildDesignedSenderDraft,
  createInitialDesignedSenderAuthoringState,
  type BuildDesignedSenderDraftResult,
} from './designedSenderDraft';
import { getDesignedSenderSignalCatalog } from './designedSenderSignalCatalog';

describe('Designed Sender generic BFN materialization', () => {
  it.each(['hill_activation', 'hill_repression'] as const)(
    'materializes %s as one ordinary FunctionalModule with exact authored semantics',
    (family) => {
      const project = createEmptyProject();
      const build = buildDesignedSenderDraft({ ...validState(project), family }, project);
      expect(build.ok).toBe(true);
      if (!build.ok) return;
      const result = materializeBuild(build, project);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const module = result.nextProject.network.modules[0]!;
      const model = module.modelVariants[0]!;
      expect(module).toMatchObject({
        kind: 'functional_module',
        authoring: {
          origin: 'user_defined',
          name: 'Designed 3OC6-HSL sender',
          description: 'One-control signal production response.',
        },
        implementationIds: [],
        implementationState: 'unspecified',
        evidenceGrade: 'proposed_unbuilt_design',
      });
      expect(module).not.toHaveProperty('designedSender');
      expect(module.inputPorts).toEqual([
        expect.objectContaining({
          authoring: { origin: 'user_defined', name: 'Control input' },
          quantityType: 'concentration',
          unit: 'uM',
        }),
      ]);
      expect(module.inputPorts[0]?.entity).toMatch(/^user\.module\..+\.entity\.input\.1$/);
      expect(module.outputPorts).toEqual([
        expect.objectContaining({
          authoring: { origin: 'user_defined', name: 'AHL production role' },
          entity: build.authoritativeSignal?.entityId,
          quantityType: 'production_rate',
          unit: 'nM/h',
        }),
      ]);
      expect(model).toMatchObject({
        mode: 'static',
        family,
        response: {
          family,
          k: { value: 12, unit: 'uM' },
          n: { value: 2, unit: 'dimensionless' },
          ymin: { value: 0.1, unit: 'nM/h' },
          ymax: { value: 4.2, unit: 'nM/h' },
        },
        evidenceGrade: 'proposed_unbuilt_design',
        uncertaintyMethod: 'not_recorded',
      });
      expect(module.modelVariants).toHaveLength(1);
      expect(module.activeModelIds.static).toBe(model.id);
      expect(module.activeModelIds).not.toHaveProperty('dynamic');
      expect(model).not.toHaveProperty('tau');
      expect(model).not.toHaveProperty('initialState');
      expect(model).not.toHaveProperty('steadyStateResponse');
      expect(module).not.toHaveProperty('dynamics');
      expect(module).not.toHaveProperty('timeRangeHours');
      expect(model).not.toHaveProperty('catalogReference');
      expect(
        result.nextProject.registry.entities.some(
          (entity) => entity.id === build.authoritativeSignal?.entityId,
        ),
      ).toBe(false);
      expect(result.nextProject.network.inputSources).toEqual(project.network.inputSources);
      expect(result.nextProject.network.edges).toEqual(project.network.edges);
      expect(result.nextProject.network.outputMonitors).toEqual(project.network.outputMonitors);
      expect(result.nextProject).not.toHaveProperty('runs');
      expect(isBfnProjectV22(result.nextProject)).toBe(true);
      expect(parseBfnProject(JSON.stringify(result.nextProject))).toEqual(result.nextProject);
    },
  );

  it('creates a normal stable user-defined Entity only for a custom output signal', () => {
    const project = createEmptyProject();
    const state = validState(project);
    const build = buildDesignedSenderDraft(
      {
        ...state,
        output: {
          ...state.output,
          signalMode: 'custom',
          customSignalName: 'Project signal X',
        },
      },
      project,
    );
    expect(build.ok).toBe(true);
    if (!build.ok) return;

    const first = materializeBuild(build, project);
    const secondBuild = buildDesignedSenderDraft(
      {
        ...state,
        output: {
          ...state.output,
          signalMode: 'custom',
          customSignalName: 'Project signal X',
        },
      },
      project,
    );
    expect(secondBuild).toEqual(build);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const output = first.nextProject.network.modules[0]!.outputPorts[0]!;
    expect(output.quantityType).toBe('production_rate');
    expect(output.unit).toBe('nM/h');
    expect(first.nextProject.registry.entities).toContainEqual({
      id: output.entity,
      origin: 'user_defined',
      displayName: 'Project signal X',
      description: null,
    });
  });

  it('ignores an injected concentration quantity and keeps the workflow output fixed to rate', () => {
    const project = createEmptyProject();
    const state = validState(project);
    const build = buildDesignedSenderDraft(
      {
        ...state,
        output: { ...state.output, quantityType: 'concentration' },
      } as DesignedSenderAuthoringState,
      project,
    );

    expect(build.ok).toBe(true);
    if (build.ok) {
      expect(build.draft.ports.filter((port) => port.direction === 'output')).toEqual([
        expect.objectContaining({ quantityType: 'production_rate', unit: 'nM/h' }),
      ]);
    }
  });

  it('hard-rejects direct rate-to-concentration wiring for the same real trusted Entity', () => {
    const project = createEmptyProject();
    const build = buildDesignedSenderDraft(validState(project), project);
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    const materialized = materializeBuild(build, project);
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;

    const candidate = buildBfnCatalogRuntimeCandidate('resp.kylilis2018.lux.3oc6');
    const receiverResult = instantiateCatalogResponseInBfnProject(
      materialized.nextProject,
      candidate,
      {
        moduleId: 'catalog.receiver.real-3oc6',
        modulePosition: { x: 640, y: 180 },
        createInputSource: false,
      },
    );
    expect(receiverResult.ok).toBe(true);
    if (!receiverResult.ok) return;
    const sender = receiverResult.nextProject.network.modules.find(
      (module) => module.id === materialized.addedModuleId,
    )!;
    const receiver = receiverResult.nextProject.network.modules.find(
      (module) => module.id === receiverResult.addedModuleId,
    )!;
    const senderOutput = sender.outputPorts[0]!;
    const receiverInput = receiver.inputPorts[0]!;
    const source = { nodeId: sender.id, portId: senderOutput.id };
    const target = { nodeId: receiver.id, portId: receiverInput.id };

    expect(senderOutput.entity).toBe(candidate.inputEntity);
    expect(receiverInput.entity).toBe(candidate.inputEntity);
    expect(senderOutput.quantityType).toBe('production_rate');
    expect(receiverInput.quantityType).toBe('concentration');
    const issues = checkIdealConnection(receiverResult.nextProject, source, target);
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['quantity_mismatch', 'unit_dimension_mismatch']),
    );
    expect(issues.map((issue) => issue.code)).not.toContain('entity_mismatch');
    expect(() =>
      addIdealConnection(receiverResult.nextProject, source, target, 'edge-rate-to-concentration'),
    ).toThrow(/BFN_CONNECTION_REJECTED:.*quantity_mismatch/u);
    expect(receiverResult.nextProject.network.edges).toEqual(
      materialized.nextProject.network.edges,
    );
  });
});

describe('Designed Sender generic BFN-SIM-2.1 execution', () => {
  it('executes the ordinary Hill point estimate with a connected control input', () => {
    const project = createRunnableProject(12);
    const result = runBfnSimulation(project, '2026-08-31T06:00:00.000Z');

    expect(result.engineVersion).toBe('BFN-SIM-2.1');
    expect(result.points).toHaveLength(1);
    expect(result.points[0]?.output).toBeCloseTo((0.1 + 4.2) / 2, 12);
    expect(result.points[0]?.lower).toBeNull();
    expect(result.points[0]?.upper).toBeNull();
  });

  it('keeps an output-reachable unconnected control input as a hard error', () => {
    const project = createRunnableProject(12);
    const module = project.network.modules[0]!;
    project.network.edges = project.network.edges.filter(
      (edge) => edge.target.nodeId !== module.id,
    );

    expect(validateBfnProject(project)).toContainEqual(
      expect.objectContaining({
        code: 'missing_required_input',
        severity: 'error',
        subjectId: module.inputPorts[0]!.id,
      }),
    );
    expect(() => runBfnSimulation(project)).toThrow(
      /BFN_VALIDATION_FAILED:.*missing_required_input/u,
    );
  });

  it('treats an explicitly connected zero as valid and evaluates ymin', () => {
    const project = createRunnableProject(0);
    const result = runBfnSimulation(project, '2026-08-31T06:00:00.000Z');

    expect(result.points).toHaveLength(1);
    expect(result.points[0]?.inputs['source-control']).toBe(0);
    expect(result.points[0]?.output).toBeCloseTo(0.1, 12);
  });
});

function createEmptyProject(): BfnProject {
  const project = createDemoBfnProject();
  project.network = {
    ...project.network,
    id: 'network-designed-sender-test',
    inputSources: [],
    modules: [],
    outputMonitors: [],
    edges: [],
  };
  return project;
}

function validState(project: BfnProject): DesignedSenderAuthoringState {
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

function materializeBuild(
  build: Extract<BuildDesignedSenderDraftResult, { readonly ok: true }>,
  project: BfnProject,
) {
  return materializeUserDefinedStaticModule(build.draft, project, {
    authoritativeEntities: build.authoritativeSignal
      ? [
          {
            id: build.authoritativeSignal.entityId,
            displayName: build.authoritativeSignal.displayName,
          },
        ]
      : [],
  });
}

function createRunnableProject(inputValue: number): BfnProject {
  const project = createEmptyProject();
  const build = buildDesignedSenderDraft(validState(project), project);
  if (!build.ok) throw new Error('Designed Sender test fixture is invalid.');
  const materialized = materializeBuild(build, project);
  if (!materialized.ok) throw new Error('Designed Sender test fixture could not materialize.');
  const module = materialized.nextProject.network.modules[0]!;
  const input = module.inputPorts[0]!;
  const output = module.outputPorts[0]!;
  materialized.nextProject.network.inputSources.push({
    kind: 'input_source',
    id: 'source-control',
    labelKey: 'bfn.sources.ahl',
    outputPort: {
      id: 'source-control-output',
      entity: input.entity,
      quantityType: input.quantityType,
      unit: input.unit,
      direction: 'output',
    },
    staticSpecification: { type: 'fixed_value', value: inputValue, unit: input.unit },
    dynamicSpecification: { type: 'constant', value: inputValue, unit: input.unit },
    position: { x: 24, y: 180 },
  });
  materialized.nextProject.network.outputMonitors.push({
    kind: 'output_monitor',
    id: 'monitor-production-rate',
    labelKey: 'bfn.monitors.reporter',
    inputPort: {
      id: 'monitor-production-rate-input',
      entity: output.entity,
      quantityType: output.quantityType,
      unit: output.unit,
      direction: 'input',
    },
    position: { x: 806, y: 180 },
  });
  materialized.nextProject.network.edges.push(
    {
      id: 'edge-control-sender',
      source: { nodeId: 'source-control', portId: 'source-control-output' },
      target: { nodeId: module.id, portId: input.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-sender-monitor',
      source: { nodeId: module.id, portId: output.id },
      target: { nodeId: 'monitor-production-rate', portId: 'monitor-production-rate-input' },
      mapping: 'identity',
      enabled: true,
    },
  );
  return materialized.nextProject;
}

function parameter(value: string) {
  return { value, lower: '', upper: '' };
}
