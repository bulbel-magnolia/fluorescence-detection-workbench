import { describe, expect, it } from 'vitest';
import { runBfnSimulation } from './simulation';
import {
  ACCUMULATOR_INPUT_PORT_ID,
  ACCUMULATOR_MODULE_ID,
  ACCUMULATOR_OUTPUT_PORT_ID,
  createAccumulatorBfnProject,
  getAccumulatorModule,
} from './testing/accumulatorFixtures';
import type { BfnDynamicModel, BfnFunctionalModule, BfnProject, BfnStaticModel } from './types';
import { validateBfnProject } from './validation';

function createFirstOrderModule(
  project: BfnProject,
  id: string,
  input: BfnFunctionalModule['inputPorts'][number],
  output: BfnFunctionalModule['outputPorts'][number],
  initialState: number,
): BfnFunctionalModule {
  const inputPortId = `${id}:input`;
  const outputPortId = `${id}:output`;
  const response = {
    family: 'linear_transfer' as const,
    inputPortId,
    scale: { value: 1, unit: 'dimensionless' as const },
    intercept: { value: 0, unit: output.unit },
  };
  const staticModel: BfnStaticModel = {
    id: `${id}:static`,
    version: 'test.1',
    mode: 'static',
    family: 'linear_transfer',
    response: structuredClone(response),
    contextId: null,
    validityDomainId: `${id}:domain`,
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'none',
    isDemo: true,
  };
  const dynamicModel: BfnDynamicModel = {
    ...staticModel,
    id: `${id}:dynamic`,
    mode: 'dynamic',
    family: 'first_order',
    steadyStateResponse: structuredClone(response),
    tau: { value: 1, unit: 'h' },
    initialState,
  };
  project.registry.validityDomains.push({
    id: staticModel.validityDomainId,
    labelKey: 'bfn.testing.firstOrderDomain',
    inputRanges: [{ portId: inputPortId, minimum: 0, maximum: 100, unit: input.unit }],
    contextId: null,
  });
  return {
    kind: 'functional_module',
    id,
    labelKey: 'bfn.testing.firstOrder',
    descriptionKey: 'bfn.testing.firstOrderDescription',
    inputPorts: [{ ...input, id: inputPortId, direction: 'input' }],
    outputPorts: [{ ...output, id: outputPortId, direction: 'output' }],
    modelVariants: [staticModel, dynamicModel],
    activeModelIds: { static: staticModel.id, dynamic: dynamicModel.id },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 480, y: 160 },
    isDemo: true,
  };
}

describe('BFN-SIM 2.2 mixed dynamic ordering boundary', () => {
  it('fails closed when an accumulator feeds a first-order dynamic module', () => {
    const project = createAccumulatorBfnProject();
    const accumulator = getAccumulatorModule(project);
    const downstream = createFirstOrderModule(
      project,
      'module-downstream-first-order',
      {
        ...accumulator.outputPorts[0]!,
        direction: 'input',
      },
      {
        ...accumulator.outputPorts[0]!,
        entity: 'entity.accumulator.filtered-signal',
        direction: 'output',
      },
      0,
    );
    project.network.modules.push(downstream);
    const monitor = project.network.outputMonitors[0]!;
    monitor.inputPort = {
      ...downstream.outputPorts[0]!,
      id: monitor.inputPort.id,
      direction: 'input',
    };
    project.network.edges = project.network.edges.filter(
      (edge) => edge.id !== 'edge-accumulator-state',
    );
    project.network.edges.push(
      {
        id: 'edge-accumulator-downstream-first-order',
        source: { nodeId: ACCUMULATOR_MODULE_ID, portId: ACCUMULATOR_OUTPUT_PORT_ID },
        target: { nodeId: downstream.id, portId: downstream.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-downstream-first-order-monitor',
        source: { nodeId: downstream.id, portId: downstream.outputPorts[0]!.id },
        target: { nodeId: monitor.id, portId: monitor.inputPort.id },
        mapping: 'identity',
        enabled: true,
      },
    );

    expect(validateBfnProject(project)).toContainEqual({
      code: 'mixed_dynamic_process_ordering_unsupported',
      severity: 'error',
      subjectId: ACCUMULATOR_MODULE_ID,
      details: {
        monitorId: monitor.id,
        downstreamModuleId: downstream.id,
      },
    });
    expect(() => runBfnSimulation(project)).toThrow(
      /BFN_VALIDATION_FAILED:.*mixed_dynamic_process_ordering_unsupported/u,
    );
  });

  it('supports first-order rate output as the accumulator rate for the future interval', () => {
    const project = createAccumulatorBfnProject();
    const accumulator = getAccumulatorModule(project);
    const source = project.network.inputSources[0]!;
    source.outputPort = {
      ...source.outputPort,
      entity: 'entity.accumulator.rate-control',
      quantityType: 'concentration',
      unit: 'nM',
    };
    source.staticSpecification = { type: 'fixed_value', value: 10, unit: 'nM' };
    source.dynamicSpecification = { type: 'constant', value: 10, unit: 'nM' };
    const upstream = createFirstOrderModule(
      project,
      'module-upstream-first-order',
      { ...source.outputPort, direction: 'input' },
      { ...accumulator.inputPorts[0]!, direction: 'output' },
      3,
    );
    project.network.modules.unshift(upstream);
    project.network.edges = project.network.edges.filter(
      (edge) => edge.id !== 'edge-accumulator-rate',
    );
    project.network.edges.push(
      {
        id: 'edge-source-upstream-first-order',
        source: { nodeId: source.id, portId: source.outputPort.id },
        target: { nodeId: upstream.id, portId: upstream.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-upstream-first-order-accumulator',
        source: { nodeId: upstream.id, portId: upstream.outputPorts[0]!.id },
        target: { nodeId: ACCUMULATOR_MODULE_ID, portId: ACCUMULATOR_INPUT_PORT_ID },
        mapping: 'identity',
        enabled: true,
      },
    );
    const model = accumulator.modelVariants[0];
    if (model?.mode !== 'dynamic' || model.family !== 'accumulator') {
      throw new Error('Expected accumulator fixture.');
    }
    model.initialState = 2;
    project.analysis.durationHours = 0.5;
    project.analysis.timeStepHours = 0.5;

    const issues = validateBfnProject(project);
    expect(issues.map((issue) => issue.code)).not.toContain(
      'mixed_dynamic_process_ordering_unsupported',
    );
    const result = runBfnSimulation(project);
    expect(result.points.map((point) => point.moduleOutputs[ACCUMULATOR_MODULE_ID])).toEqual([
      2, 3.5,
    ]);
    expect(result.points[1]!.moduleOutputs[upstream.id]).toBeGreaterThan(3);
  });
});
