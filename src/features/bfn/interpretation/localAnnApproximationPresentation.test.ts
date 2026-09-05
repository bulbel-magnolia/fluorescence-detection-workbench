import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import {
  assessBfnLocalAnnApproximationAvailability,
  bfnLocalAnnApproximationPrefill,
} from './localAnnApproximationPresentation';

describe('local ANN approximation presentation helpers', () => {
  it('reuses the selected target network closure and relevant external sources', () => {
    const project = createDemoBfnProject();
    const unrelated = structuredClone(project.network.inputSources[0]!);
    unrelated.id = 'source-local-ann-unrelated';
    unrelated.outputPort.id = 'source-local-ann-unrelated-out';
    project.network.inputSources.push(unrelated);

    expect(
      assessBfnLocalAnnApproximationAvailability(project, project.network.outputMonitors[0]!),
    ).toMatchObject({
      supported: true,
      target: {
        inputSources: [{ inputSourceId: 'source-ahl' }],
        moduleTargets: [{ moduleId: 'module-ahl-sensor' }, { moduleId: 'module-reporter' }],
      },
    });
  });

  it('inherits natural Accumulator and feedback availability reasons', () => {
    const accumulator = createAccumulatorBfnProject();
    expect(
      assessBfnLocalAnnApproximationAvailability(
        accumulator,
        accumulator.network.outputMonitors[0]!,
      ),
    ).toMatchObject({ supported: false, reason: 'dynamic_integrator' });

    const feedback = createDemoBfnProject();
    const module = feedback.network.modules[1]!;
    module.inputPorts[0]!.entity = module.outputPorts[0]!.entity;
    module.inputPorts[0]!.quantityType = module.outputPorts[0]!.quantityType;
    module.inputPorts[0]!.unit = module.outputPorts[0]!.unit;
    feedback.network.modules = [module];
    feedback.network.edges = [
      {
        id: 'edge-local-ann-feedback',
        source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
        target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-local-ann-feedback-monitor',
        source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
        target: {
          nodeId: feedback.network.outputMonitors[0]!.id,
          portId: feedback.network.outputMonitors[0]!.inputPort.id,
        },
        mapping: 'identity',
        enabled: true,
      },
    ];
    expect(
      assessBfnLocalAnnApproximationAvailability(feedback, feedback.network.outputMonitors[0]!),
    ).toMatchObject({ supported: false, reason: 'feedback' });
  });

  it('delegates conservative exact-unit prefill semantics', () => {
    const project = createDemoBfnProject();
    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: 12,
      unit: 'nM',
    };
    expect(bfnLocalAnnApproximationPrefill(project, 'source-ahl')).toBe(12);

    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: 0.012,
      unit: 'uM',
    };
    expect(bfnLocalAnnApproximationPrefill(project, 'source-ahl')).toBeNull();
  });
});
