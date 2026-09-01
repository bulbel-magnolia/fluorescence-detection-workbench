import { describe, expect, it } from 'vitest';
import { createCatalogModule, createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import {
  ACCUMULATOR_INPUT_PORT_ID,
  ACCUMULATOR_MODULE_ID,
  ACCUMULATOR_OUTPUT_PORT_ID,
  createAccumulatorBfnProject,
  getAccumulatorModule,
} from './testing/accumulatorFixtures';
import type { BfnStaticModel } from './types';
import { validateBfnProject } from './validation';

function addDynamicFeedbackCycle(project: ReturnType<typeof createDemoBfnProject>): void {
  project.network.mode = 'dynamic';
  const sensor = project.network.modules[0]!;
  sensor.authoring = { origin: 'user_defined', name: 'Authored dynamic sensor', description: null };
  project.network.edges.push({
    id: 'edge-feedback',
    source: {
      nodeId: project.network.modules[1]!.id,
      portId: project.network.modules[1]!.outputPorts[0]!.id,
    },
    target: { nodeId: sensor.id, portId: sensor.inputPorts[0]!.id },
    mapping: 'identity',
    enabled: true,
  });
}

describe('user-defined dynamic feedback validation', () => {
  it('rejects a target-reachable cycle containing an effective accumulator regardless of origin', () => {
    const project = createAccumulatorBfnProject();
    const inputPortId = 'port-feedback-rate-converter-in';
    const outputPortId = 'port-feedback-rate-converter-out';
    const model: BfnStaticModel = {
      id: 'model-feedback-rate-converter',
      version: 'test.1',
      mode: 'static',
      family: 'linear_transfer',
      response: {
        family: 'linear_transfer',
        inputPortId,
        scale: { value: 1, unit: 'dimensionless' },
        intercept: { value: 0, unit: 'nM/h' },
      },
      contextId: null,
      validityDomainId: 'domain-feedback-rate-converter',
      sourceDatasetIds: [],
      provenanceIds: [],
      evidenceGrade: 'independent_assumption',
      uncertaintyMethod: 'none',
      isDemo: true,
    };
    project.network.modules.push({
      kind: 'functional_module',
      id: 'module-feedback-rate-converter',
      labelKey: 'bfn.testing.feedbackRateConverter',
      descriptionKey: 'bfn.testing.feedbackRateConverterDescription',
      inputPorts: [
        {
          id: inputPortId,
          entity: getAccumulatorModule(project).outputPorts[0]!.entity,
          quantityType: 'concentration',
          unit: 'nM',
          direction: 'input',
        },
      ],
      outputPorts: [
        {
          id: outputPortId,
          entity: getAccumulatorModule(project).inputPorts[0]!.entity,
          quantityType: 'production_rate',
          unit: 'nM/h',
          direction: 'output',
        },
      ],
      modelVariants: [model],
      activeModelIds: { static: model.id },
      implementationIds: [],
      implementationState: 'unspecified',
      evidenceGrade: 'independent_assumption',
      position: { x: 160, y: 320 },
      isDemo: true,
    });
    project.registry.validityDomains.push({
      id: model.validityDomainId,
      labelKey: 'bfn.testing.feedbackRateConverterDomain',
      inputRanges: [{ portId: inputPortId, minimum: 0, maximum: 10, unit: 'nM' }],
      contextId: null,
    });
    project.network.edges = project.network.edges.filter(
      (edge) => edge.id !== 'edge-accumulator-rate',
    );
    project.network.edges.push(
      {
        id: 'edge-accumulator-feedback-converter',
        source: { nodeId: ACCUMULATOR_MODULE_ID, portId: ACCUMULATOR_OUTPUT_PORT_ID },
        target: { nodeId: 'module-feedback-rate-converter', portId: inputPortId },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-feedback-converter-accumulator',
        source: { nodeId: 'module-feedback-rate-converter', portId: outputPortId },
        target: { nodeId: ACCUMULATOR_MODULE_ID, portId: ACCUMULATOR_INPUT_PORT_ID },
        mapping: 'identity',
        enabled: true,
      },
    );

    expect(getAccumulatorModule(project).authoring).toBeUndefined();
    expect(validateBfnProject(project)).toContainEqual(
      expect.objectContaining({
        code: 'dynamic_feedback_unsupported',
        severity: 'error',
        subjectId: ACCUMULATOR_MODULE_ID,
      }),
    );
    expect(() => runBfnSimulation(project)).toThrow(
      /BFN_VALIDATION_FAILED:.*dynamic_feedback_unsupported/u,
    );
  });

  it('rejects a dynamic user-authored cycle on the selected output monitor path', () => {
    const project = createDemoBfnProject();
    addDynamicFeedbackCycle(project);

    const issues = validateBfnProject(project, { targetMonitorId: 'monitor-reporter' });
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'dynamic_feedback_unsupported',
        severity: 'error',
      }),
    );
    expect(() => runBfnSimulation(project)).toThrow(
      /BFN_VALIDATION_FAILED:.*dynamic_feedback_unsupported/u,
    );
  });

  it('does not report this code for cycles outside the selected monitor path', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const left = createCatalogModule('ahl-sensor', 'feedback-left');
    const right = createCatalogModule('ahl-sensor', 'feedback-right');
    left.authoring = { origin: 'user_defined', name: 'Left dynamic module', description: null };
    right.authoring = { origin: 'user_defined', name: 'Right dynamic module', description: null };
    project.network.modules.push(left, right);
    project.network.edges.push(
      {
        id: 'edge-feedback-left-right',
        source: { nodeId: left.id, portId: left.outputPorts[0]!.id },
        target: { nodeId: right.id, portId: right.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-feedback-right-left',
        source: { nodeId: right.id, portId: right.outputPorts[0]!.id },
        target: { nodeId: left.id, portId: left.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
    );

    expect(validateBfnProject(project, { targetMonitorId: 'monitor-reporter' })).not.toContainEqual(
      expect.objectContaining({ code: 'dynamic_feedback_unsupported' }),
    );
  });

  it('does not report this code when a cycle has no effective dynamic user module', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const sensor = project.network.modules[0]!;
    sensor.authoring = {
      origin: 'user_defined',
      name: 'Static fallback module',
      description: null,
    };
    sensor.modelVariants = sensor.modelVariants.filter((model) => model.mode === 'static');
    const staticModelId = sensor.activeModelIds.static;
    if (staticModelId === undefined) throw new Error('Expected paired demo model.');
    sensor.activeModelIds = { static: staticModelId };
    project.network.edges.push({
      id: 'edge-static-fallback-cycle',
      source: {
        nodeId: project.network.modules[1]!.id,
        portId: project.network.modules[1]!.outputPorts[0]!.id,
      },
      target: { nodeId: sensor.id, portId: sensor.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    });

    expect(validateBfnProject(project, { targetMonitorId: 'monitor-reporter' })).not.toContainEqual(
      expect.objectContaining({ code: 'dynamic_feedback_unsupported' }),
    );
  });

  it('reports a dynamic user module in an SCC reached through an already-visited cross edge', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const sensor = project.network.modules[0]!;
    const reporter = project.network.modules[1]!;
    const crossEdgeModule = createCatalogModule('reporter', 'feedback-cross');
    crossEdgeModule.authoring = {
      origin: 'user_defined',
      name: 'Cross-edge dynamic module',
      description: null,
    };
    project.network.modules.push(crossEdgeModule);
    project.network.edges.push(
      {
        id: 'edge-feedback-reporter-sensor',
        source: { nodeId: reporter.id, portId: reporter.outputPorts[0]!.id },
        target: { nodeId: sensor.id, portId: sensor.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-feedback-sensor-cross',
        source: { nodeId: sensor.id, portId: sensor.outputPorts[0]!.id },
        target: { nodeId: crossEdgeModule.id, portId: crossEdgeModule.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-feedback-cross-reporter',
        source: { nodeId: crossEdgeModule.id, portId: crossEdgeModule.outputPorts[0]!.id },
        target: { nodeId: reporter.id, portId: reporter.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
    );

    const issues = validateBfnProject(project, { targetMonitorId: 'monitor-reporter' });
    const dynamicIssue = issues.find(
      (issue) =>
        issue.code === 'dynamic_feedback_unsupported' && issue.subjectId === crossEdgeModule.id,
    );
    expect(dynamicIssue).toBeDefined();
    expect(dynamicIssue?.details?.cycle).toContain(crossEdgeModule.id);
  });

  it('checks every output monitor when no target monitor is selected', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const left = createCatalogModule('reporter', 'feedback-monitor-left');
    const right = createCatalogModule('reporter', 'feedback-monitor-right');
    left.authoring = { origin: 'user_defined', name: 'Monitor left', description: null };
    right.authoring = { origin: 'user_defined', name: 'Monitor right', description: null };
    const secondMonitor = structuredClone(project.network.outputMonitors[0]!);
    secondMonitor.id = 'monitor-feedback';
    secondMonitor.inputPort = { ...secondMonitor.inputPort, id: 'monitor-feedback-in' };
    project.network.modules.push(left, right);
    project.network.outputMonitors.push(secondMonitor);
    project.network.edges.push(
      {
        id: 'edge-monitor-feedback-left-right',
        source: { nodeId: left.id, portId: left.outputPorts[0]!.id },
        target: { nodeId: right.id, portId: right.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-monitor-feedback-right-left',
        source: { nodeId: right.id, portId: right.outputPorts[0]!.id },
        target: { nodeId: left.id, portId: left.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-monitor-feedback-right-monitor',
        source: { nodeId: right.id, portId: right.outputPorts[0]!.id },
        target: { nodeId: secondMonitor.id, portId: secondMonitor.inputPort.id },
        mapping: 'identity',
        enabled: true,
      },
    );

    expect(
      validateBfnProject(project).some(
        (issue) =>
          issue.code === 'dynamic_feedback_unsupported' &&
          issue.details?.monitorId === secondMonitor.id,
      ),
    ).toBe(true);
  });
});
