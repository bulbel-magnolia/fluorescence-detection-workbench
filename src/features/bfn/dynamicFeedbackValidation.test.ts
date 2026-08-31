import { describe, expect, it } from 'vitest';
import { createCatalogModule, createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
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
    sensor.activeModelIds = { static: sensor.activeModelIds.static };
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
