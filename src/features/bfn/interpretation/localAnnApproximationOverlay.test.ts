import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { calculateBfnLocalAnnApproximation } from './localAnnApproximation';
import type { BfnLocalAnnApproximationResultV1 } from './localAnnApproximationTypes';
import { createBfnLocalAnnCanvasOverlay } from './localAnnApproximationOverlay';

function resultForDemo(): BfnLocalAnnApproximationResultV1 {
  const project = createDemoBfnProject();
  const calculation = calculateBfnLocalAnnApproximation(project, {
    contractVersion: '1.0',
    scope: 'network_local_ann_approximation',
    outputMonitorId: project.network.outputMonitors[0]!.id,
    operatingPoint: [{ inputSourceId: 'source-ahl', value: 10, unit: 'nM' }],
  });
  if (!calculation.ok) throw new Error('Expected local ANN approximation.');
  return calculation.result;
}

describe('local ANN canvas overlay', () => {
  it('binds each derived module weight to the downstream module input and positioning edge', () => {
    const project = createDemoBfnProject();
    const result = resultForDemo();
    const overlay = createBfnLocalAnnCanvasOverlay(project, result);

    expect(overlay.weights).toEqual([
      expect.objectContaining({
        targetModuleId: 'module-ahl-sensor',
        targetInputPortId: 'module-ahl-sensor-in',
        edgeId: 'edge-source-sensor',
        unit: { outputUnit: 'dimensionless', inputUnit: 'nM' },
      }),
      expect.objectContaining({
        targetModuleId: 'module-reporter',
        targetInputPortId: 'module-reporter-in',
        edgeId: 'edge-sensor-reporter',
        unit: { outputUnit: 'dimensionless', inputUnit: 'dimensionless' },
      }),
    ]);
    expect(overlay.moduleBiases.map((bias) => bias.moduleId)).toEqual([
      'module-ahl-sensor',
      'module-reporter',
    ]);
  });

  it('retains target relevance for dimming without storing any value on an Edge', () => {
    const project = createDemoBfnProject();
    const before = structuredClone(project);
    const overlay = createBfnLocalAnnCanvasOverlay(project, resultForDemo());

    expect(overlay.relevantEdgeIds).toEqual([
      'edge-source-sensor',
      'edge-sensor-reporter',
      'edge-reporter-monitor',
    ]);
    expect(overlay.relevantNodeIds).toEqual([
      'source-ahl',
      'module-ahl-sensor',
      'module-reporter',
      'monitor-reporter',
    ]);
    expect(overlay.persistence).toBe('ephemeral');
    expect(Object.isFrozen(overlay)).toBe(true);
    expect(Object.isFrozen(overlay.weights)).toBe(true);
    expect(project).toEqual(before);
    expect(project.network.edges.every((edge) => !('weight' in edge) && !('bias' in edge))).toBe(
      true,
    );
  });

  it('does not invent module overlays for direct transmission', () => {
    const project = createDemoBfnProject();
    const source = project.network.inputSources[0]!;
    const monitor = project.network.outputMonitors[0]!;
    monitor.inputPort = { ...source.outputPort, id: 'monitor-direct-ann-in', direction: 'input' };
    project.network.modules = [];
    project.network.edges = [
      {
        id: 'edge-direct-ann-monitor',
        source: { nodeId: source.id, portId: source.outputPort.id },
        target: { nodeId: monitor.id, portId: monitor.inputPort.id },
        mapping: 'identity',
        enabled: true,
      },
    ];
    const calculation = calculateBfnLocalAnnApproximation(project, {
      contractVersion: '1.0',
      scope: 'network_local_ann_approximation',
      outputMonitorId: monitor.id,
      operatingPoint: [{ inputSourceId: source.id, value: 10, unit: source.outputPort.unit }],
    });
    if (!calculation.ok) throw new Error('Expected direct approximation.');

    const overlay = createBfnLocalAnnCanvasOverlay(project, calculation.result);
    expect(overlay.weights).toEqual([]);
    expect(overlay.moduleBiases).toEqual([]);
  });
});
