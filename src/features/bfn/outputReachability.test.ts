import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import { findBfnOutputReachableModuleIds } from './outputReachability';

describe('BFN output reachability', () => {
  it('collects modules on enabled upstream paths from the selected monitor', () => {
    const project = createDemoBfnProject();

    const result = findBfnOutputReachableModuleIds(project, 'monitor-reporter');

    expect([...result].sort()).toEqual(['module-ahl-sensor', 'module-reporter']);
  });

  it('stops at a disabled edge without including the detached upstream branch', () => {
    const project = createDemoBfnProject();
    project.network.edges.find((edge) => edge.id === 'edge-sensor-reporter')!.enabled = false;

    const result = findBfnOutputReachableModuleIds(project, 'monitor-reporter');

    expect([...result]).toEqual(['module-reporter']);
  });

  it('terminates on cycles and ignores malformed edges', () => {
    const project = createDemoBfnProject();
    const sensor = project.network.modules[0]!;
    const reporter = project.network.modules[1]!;
    project.network.edges.push(
      {
        id: 'edge-cycle',
        source: { nodeId: reporter.id, portId: reporter.outputPorts[0]!.id },
        target: { nodeId: sensor.id, portId: sensor.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-malformed',
        source: { nodeId: 'missing-module', portId: 'missing-output' },
        target: { nodeId: reporter.id, portId: reporter.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
    );

    const result = findBfnOutputReachableModuleIds(project, 'monitor-reporter');

    expect([...result].sort()).toEqual(['module-ahl-sensor', 'module-reporter']);
  });

  it('returns an empty set for a missing monitor', () => {
    expect(findBfnOutputReachableModuleIds(createDemoBfnProject(), 'missing-monitor')).toEqual(
      new Set(),
    );
  });
});
