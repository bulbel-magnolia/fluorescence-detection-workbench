import { describe, expect, it } from 'vitest';
import { getTrustedAhlHslCatalogRelease } from '../modeling/catalog/v2/catalogReleaseLoader';
import {
  buildReceiverResponseBinding,
  evaluateReceiverResponse,
} from '../modeling/receiverResponseEvaluator';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalog/catalogBfnAdapter';
import { createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import type { BfnAccumulatorDynamicModel, BfnFunctionalModule, BfnProject } from './types';
import { addIdealConnection, checkIdealConnection } from './validation';
import { materializeUserDefinedStaticModule } from './user-defined/userModuleMaterialization';
import type { DesignedSenderAuthoringState } from './user-defined/designed-sender/designedSenderContract';
import {
  buildDesignedSenderDraft,
  createInitialDesignedSenderAuthoringState,
} from './user-defined/designed-sender/designedSenderDraft';
import { getDesignedSenderSignalCatalog } from './user-defined/designed-sender/designedSenderSignalCatalog';

const RECEIVER_RESPONSE_ID = 'resp.kylilis2018.lux.3oc6';
const CONTROL_SOURCE_ID = 'source-dynamic-iptg';
const CONTROL_SOURCE_PORT_ID = 'port-dynamic-iptg-output';
const ACCUMULATOR_MODULE_ID = 'module-explicit-3oc6-accumulator';
const ACCUMULATOR_INPUT_PORT_ID = 'port-explicit-3oc6-rate-input';
const ACCUMULATOR_OUTPUT_PORT_ID = 'port-explicit-3oc6-concentration-output';
const ACCUMULATOR_MODEL_ID = 'model-explicit-3oc6-accumulator';
const ACCUMULATOR_DOMAIN_ID = 'domain-explicit-3oc6-accumulator';
const RECEIVER_MODULE_ID = 'module-trusted-lux-receiver';
const REPORTER_MONITOR_ID = 'monitor-reporter';
const REPORTER_MONITOR_PORT_ID = 'port-reporter-monitor-input';

interface IntegrationFixture {
  project: BfnProject;
  sender: BfnFunctionalModule;
  accumulator: BfnFunctionalModule;
  receiver: BfnFunctionalModule;
}

describe('Designed Sender to accumulator to Catalog Receiver integration', () => {
  it('executes the explicit feed-forward chain with deferred accumulator visibility', () => {
    const fixture = createIntegrationFixture();
    const result = runBfnSimulation(fixture.project, '2026-09-01T12:00:00.000Z');
    const senderRates = result.points.map((point) => point.moduleOutputs[fixture.sender.id]);
    const accumulatorStates = result.points.map(
      (point) => point.moduleOutputs[fixture.accumulator.id],
    );
    const receiverOutputs = result.points.map((point) => point.moduleOutputs[fixture.receiver.id]);
    const binding = buildReceiverResponseBinding(
      getTrustedAhlHslCatalogRelease().catalog,
      RECEIVER_RESPONSE_ID,
    );

    expect(result.engineVersion).toBe('BFN-SIM-2.2');
    expect(result.points.map((point) => point.timeHours)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(fixture.sender.outputPorts[0]).toMatchObject({
      entity: fixture.accumulator.inputPorts[0]?.entity,
      quantityType: 'production_rate',
      unit: 'nM/h',
    });
    expect(senderRates).toEqual([0, 0, 5, 5, 5]);
    expect(accumulatorStates).toEqual([2, 2, 2, 4.5, 7]);

    expect(receiverOutputs[0]).toBeCloseTo(evaluateReceiverResponse(binding, 2e-9, 'M'), 12);
    expect(receiverOutputs[1]).toBeCloseTo(receiverOutputs[0]!, 12);
    expect(receiverOutputs[2]).toBeCloseTo(receiverOutputs[0]!, 12);
    expect(receiverOutputs[3]).toBeCloseTo(evaluateReceiverResponse(binding, 4.5e-9, 'M'), 12);
    expect(receiverOutputs[4]).toBeCloseTo(evaluateReceiverResponse(binding, 7e-9, 'M'), 12);
    expect(receiverOutputs[3]).toBeGreaterThan(receiverOutputs[2]!);
    expect(result.points.map((point) => point.output)).toEqual(receiverOutputs);
    expect(result.points.every((point) => Number.isFinite(point.output))).toBe(true);

    expect(fixture.project.network.inputSources).toHaveLength(1);
    expect(fixture.project.network.modules).toHaveLength(3);
    expect(fixture.project.network.outputMonitors).toHaveLength(1);
    expect(fixture.project.network.edges).toHaveLength(4);
    expect(
      fixture.project.network.modules.filter((module) =>
        module.modelVariants.some((model) => model.mode === 'dynamic'),
      ),
    ).toEqual([fixture.accumulator]);
  });

  it('still rejects a direct production-rate Sender to concentration Receiver edge', () => {
    const fixture = createIntegrationFixture();
    const directProject = structuredClone(fixture.project);
    directProject.network.modules = directProject.network.modules.filter(
      (module) => module.id !== fixture.accumulator.id,
    );
    directProject.network.edges = directProject.network.edges.filter(
      (edge) =>
        edge.source.nodeId !== fixture.accumulator.id &&
        edge.target.nodeId !== fixture.accumulator.id,
    );
    const source = {
      nodeId: fixture.sender.id,
      portId: fixture.sender.outputPorts[0]!.id,
    };
    const target = {
      nodeId: fixture.receiver.id,
      portId: fixture.receiver.inputPorts[0]!.id,
    };
    const edgeSnapshot = structuredClone(directProject.network.edges);

    expect(checkIdealConnection(directProject, source, target).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['quantity_mismatch', 'unit_dimension_mismatch']),
    );
    expect(() => addIdealConnection(directProject, source, target, 'edge-direct-invalid')).toThrow(
      /BFN_CONNECTION_REJECTED:.*quantity_mismatch/u,
    );
    expect(directProject.network.edges).toEqual(edgeSnapshot);
  });
});

function createIntegrationFixture(): IntegrationFixture {
  const project = createEmptyProject();
  const senderBuild = buildDesignedSenderDraft(createSenderState(project), project);
  if (!senderBuild.ok) throw new Error('Designed Sender integration fixture is invalid.');
  const senderResult = materializeUserDefinedStaticModule(senderBuild.draft, project, {
    authoritativeEntities: senderBuild.authoritativeSignal
      ? [
          {
            id: senderBuild.authoritativeSignal.entityId,
            displayName: senderBuild.authoritativeSignal.displayName,
          },
        ]
      : [],
  });
  if (!senderResult.ok) throw new Error('Designed Sender integration fixture did not materialize.');

  const candidate = buildBfnCatalogRuntimeCandidate(RECEIVER_RESPONSE_ID);
  const receiverResult = instantiateCatalogResponseInBfnProject(
    senderResult.nextProject,
    candidate,
    {
      moduleId: RECEIVER_MODULE_ID,
      modulePosition: { x: 720, y: 200 },
      createInputSource: false,
    },
  );
  if (!receiverResult.ok) throw new Error(receiverResult.error.code);
  let nextProject = receiverResult.nextProject;
  const sender = requiredModule(nextProject, senderResult.addedModuleId);
  const receiver = requiredModule(nextProject, receiverResult.addedModuleId);
  const senderInput = sender.inputPorts[0]!;
  const senderOutput = sender.outputPorts[0]!;
  const receiverInput = receiver.inputPorts[0]!;
  const receiverOutput = receiver.outputPorts[0]!;
  const accumulator = createAccumulatorModule(senderOutput.entity, nextProject);

  nextProject.network.mode = 'dynamic';
  nextProject.analysis.durationHours = 2;
  nextProject.analysis.timeStepHours = 0.5;
  nextProject.network.inputSources.push({
    kind: 'input_source',
    id: CONTROL_SOURCE_ID,
    labelKey: 'bfn.sources.iptg',
    outputPort: {
      id: CONTROL_SOURCE_PORT_ID,
      entity: senderInput.entity,
      quantityType: 'concentration',
      unit: 'uM',
      direction: 'output',
    },
    staticSpecification: { type: 'fixed_value', value: 0, unit: 'uM' },
    dynamicSpecification: { type: 'step', before: 0, after: 1, atHours: 1, unit: 'uM' },
    position: { x: 20, y: 200 },
  });
  nextProject.network.modules.push(accumulator);
  nextProject.network.outputMonitors.push({
    kind: 'output_monitor',
    id: REPORTER_MONITOR_ID,
    labelKey: 'bfn.monitors.reporter',
    inputPort: {
      id: REPORTER_MONITOR_PORT_ID,
      entity: receiverOutput.entity,
      quantityType: receiverOutput.quantityType,
      unit: receiverOutput.unit,
      direction: 'input',
    },
    position: { x: 980, y: 200 },
  });
  nextProject.registry.validityDomains.push({
    id: ACCUMULATOR_DOMAIN_ID,
    labelKey: 'bfn.testing.accumulatorDomain',
    inputRanges: [
      {
        portId: ACCUMULATOR_INPUT_PORT_ID,
        minimum: 0,
        maximum: 10,
        unit: 'nM/h',
      },
    ],
    contextId: accumulator.modelVariants[0]?.contextId ?? null,
  });

  nextProject = addIdealConnection(
    nextProject,
    { nodeId: CONTROL_SOURCE_ID, portId: CONTROL_SOURCE_PORT_ID },
    { nodeId: sender.id, portId: senderInput.id },
    'edge-control-to-sender',
  );
  nextProject = addIdealConnection(
    nextProject,
    { nodeId: sender.id, portId: senderOutput.id },
    { nodeId: accumulator.id, portId: ACCUMULATOR_INPUT_PORT_ID },
    'edge-sender-to-accumulator',
  );
  nextProject = addIdealConnection(
    nextProject,
    { nodeId: accumulator.id, portId: ACCUMULATOR_OUTPUT_PORT_ID },
    { nodeId: receiver.id, portId: receiverInput.id },
    'edge-accumulator-to-receiver',
  );
  nextProject = addIdealConnection(
    nextProject,
    { nodeId: receiver.id, portId: receiverOutput.id },
    { nodeId: REPORTER_MONITOR_ID, portId: REPORTER_MONITOR_PORT_ID },
    'edge-receiver-to-monitor',
  );

  return {
    project: nextProject,
    sender: requiredModule(nextProject, sender.id),
    accumulator: requiredModule(nextProject, accumulator.id),
    receiver: requiredModule(nextProject, receiver.id),
  };
}

function createEmptyProject(): BfnProject {
  const project = createDemoBfnProject();
  project.network = {
    ...project.network,
    id: 'network-sender-accumulator-receiver-integration',
    inputSources: [],
    modules: [],
    outputMonitors: [],
    edges: [],
  };
  project.registry.validityDomains = [];
  return project;
}

function createSenderState(project: BfnProject): DesignedSenderAuthoringState {
  const initial = createInitialDesignedSenderAuthoringState(project);
  const signal = getDesignedSenderSignalCatalog().find(
    (identity) => identity.catalogSignalId === 'ahl.3oc6.l',
  );
  if (!signal) throw new Error('Trusted 3OC6-HSL signal identity is unavailable.');
  return {
    ...initial,
    name: 'Designed 3OC6-HSL sender integration fixture',
    description: 'Deterministic quasi-static rate producer for accumulator integration.',
    controlInput: {
      ...initial.controlInput,
      name: 'IPTG control',
      entityMode: 'new',
      newEntityName: 'IPTG',
      unit: 'uM',
      minimum: '0',
      maximum: '10',
    },
    output: {
      ...initial.output,
      name: '3OC6-HSL production rate',
      signalMode: 'known',
      catalogSignalId: signal.catalogSignalId,
      unit: 'nM/h',
    },
    hillK: parameter('1'),
    hillN: parameter('1'),
    minimumOutput: parameter('0'),
    maximumOutput: parameter('10'),
  };
}

function createAccumulatorModule(entity: string, project: BfnProject): BfnFunctionalModule {
  const model: BfnAccumulatorDynamicModel = {
    id: ACCUMULATOR_MODEL_ID,
    version: 'BFN-IR-2.3-accumulator-integration-fixture',
    mode: 'dynamic',
    family: 'accumulator',
    inputPortId: ACCUMULATOR_INPUT_PORT_ID,
    outputPortId: ACCUMULATOR_OUTPUT_PORT_ID,
    initialState: 2,
    contextId: project.registry.contexts[0]?.id ?? null,
    validityDomainId: ACCUMULATOR_DOMAIN_ID,
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'none',
    isDemo: true,
  };
  return {
    kind: 'functional_module',
    id: ACCUMULATOR_MODULE_ID,
    labelKey: 'bfn.testing.accumulator',
    descriptionKey: 'bfn.testing.accumulatorDescription',
    inputPorts: [
      {
        id: ACCUMULATOR_INPUT_PORT_ID,
        entity,
        quantityType: 'production_rate',
        unit: 'nM/h',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: ACCUMULATOR_OUTPUT_PORT_ID,
        entity,
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'output',
      },
    ],
    modelVariants: [model],
    activeModelIds: { dynamic: model.id },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 480, y: 200 },
    isDemo: true,
  };
}

function requiredModule(project: BfnProject, moduleId: string): BfnFunctionalModule {
  const module = project.network.modules.find((candidate) => candidate.id === moduleId);
  if (!module) throw new Error(`Required integration module is missing: ${moduleId}`);
  return module;
}

function parameter(value: string) {
  return { value, lower: '', upper: '' };
}
