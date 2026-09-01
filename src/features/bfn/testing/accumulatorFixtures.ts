import { createDemoBfnProject } from '../fixtures';
import type { BfnAccumulatorDynamicModel, BfnFunctionalModule, BfnProject } from '../types';

export const ACCUMULATOR_MODULE_ID = 'module-accumulator-test';
export const ACCUMULATOR_MODEL_ID = 'model-accumulator-test-v1';
export const ACCUMULATOR_INPUT_PORT_ID = 'port-accumulator-rate-in';
export const ACCUMULATOR_OUTPUT_PORT_ID = 'port-accumulator-state-out';

export function createAccumulatorBfnProject(): BfnProject {
  const project = createDemoBfnProject();
  const contextId = project.registry.contexts[0]?.id ?? null;
  const datasetId = project.registry.datasets[0]?.id;
  const validityDomainId = 'domain-accumulator-test';
  const provenanceId = 'provenance-accumulator-test';
  const model: BfnAccumulatorDynamicModel = {
    id: ACCUMULATOR_MODEL_ID,
    version: '2.3-test.1',
    mode: 'dynamic',
    family: 'accumulator',
    inputPortId: ACCUMULATOR_INPUT_PORT_ID,
    outputPortId: ACCUMULATOR_OUTPUT_PORT_ID,
    initialState: 2.5,
    contextId,
    validityDomainId,
    sourceDatasetIds: datasetId === undefined ? [] : [datasetId],
    provenanceIds: [provenanceId],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'not_recorded',
    isDemo: true,
  };
  const module: BfnFunctionalModule = {
    kind: 'functional_module',
    id: ACCUMULATOR_MODULE_ID,
    labelKey: 'bfn.testing.accumulator',
    descriptionKey: 'bfn.testing.accumulatorDescription',
    inputPorts: [
      {
        id: ACCUMULATOR_INPUT_PORT_ID,
        entity: 'entity.accumulator.test-signal',
        quantityType: 'production_rate',
        unit: 'nM/h',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: ACCUMULATOR_OUTPUT_PORT_ID,
        entity: 'entity.accumulator.test-signal',
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'output',
      },
    ],
    modelVariants: [model],
    activeModelIds: { dynamic: ACCUMULATOR_MODEL_ID },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 320, y: 160 },
    isDemo: true,
  };

  project.id = 'bfn-project-accumulator-test';
  project.network.id = 'network-accumulator-test';
  project.network.mode = 'dynamic';
  project.network.inputSources = [
    {
      kind: 'input_source',
      id: 'source-accumulator-rate',
      labelKey: 'bfn.testing.accumulatorRate',
      outputPort: {
        id: 'port-accumulator-source-out',
        entity: 'entity.accumulator.test-signal',
        quantityType: 'production_rate',
        unit: 'nM/h',
        direction: 'output',
      },
      staticSpecification: {
        type: 'fixed_value',
        value: 1,
        unit: 'nM/h',
      },
      dynamicSpecification: {
        type: 'constant',
        value: 1,
        unit: 'nM/h',
      },
      position: { x: 40, y: 160 },
    },
  ];
  project.network.modules = [module];
  project.network.outputMonitors = [
    {
      kind: 'output_monitor',
      id: 'monitor-accumulator-state',
      labelKey: 'bfn.testing.accumulatorState',
      inputPort: {
        id: 'port-accumulator-monitor-in',
        entity: 'entity.accumulator.test-signal',
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
      position: { x: 620, y: 160 },
    },
  ];
  project.network.edges = [
    {
      id: 'edge-accumulator-rate',
      source: {
        nodeId: 'source-accumulator-rate',
        portId: 'port-accumulator-source-out',
      },
      target: {
        nodeId: ACCUMULATOR_MODULE_ID,
        portId: ACCUMULATOR_INPUT_PORT_ID,
      },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-accumulator-state',
      source: {
        nodeId: ACCUMULATOR_MODULE_ID,
        portId: ACCUMULATOR_OUTPUT_PORT_ID,
      },
      target: {
        nodeId: 'monitor-accumulator-state',
        portId: 'port-accumulator-monitor-in',
      },
      mapping: 'identity',
      enabled: true,
    },
  ];
  project.registry.provenanceRecords.push({
    id: provenanceId,
    kind: 'user_note',
    reference: 'Test-only accumulator representation fixture.',
  });
  project.registry.validityDomains = [
    {
      id: validityDomainId,
      labelKey: 'bfn.testing.accumulatorDomain',
      inputRanges: [
        {
          portId: ACCUMULATOR_INPUT_PORT_ID,
          minimum: 0,
          maximum: 10,
          unit: 'nM/h',
        },
      ],
      contextId,
    },
  ];
  return project;
}

export function getAccumulatorModule(project: BfnProject): BfnFunctionalModule {
  const module = project.network.modules.find(({ id }) => id === ACCUMULATOR_MODULE_ID);
  if (module === undefined) throw new Error('Accumulator fixture module is missing.');
  return module;
}
