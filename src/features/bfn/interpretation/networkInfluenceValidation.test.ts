import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { ACCUMULATOR_MODULE_ID, createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import type { BfnFunctionalModule, BfnProject } from '../types';
import type { BfnNetworkInfluenceRequestV1 } from './networkInfluenceTypes';
import { assessBfnNetworkInfluenceRequest } from './networkInfluenceValidation';

function requestFor(
  project: BfnProject,
  values: readonly {
    inputSourceId: string;
    value: number;
    unit: BfnNetworkInfluenceRequestV1['operatingPoint'][number]['unit'];
  }[] = [{ inputSourceId: 'source-ahl', value: 10, unit: 'nM' }],
): BfnNetworkInfluenceRequestV1 {
  return {
    contractVersion: '1.0',
    scope: 'network_static_output',
    outputMonitorId: project.network.outputMonitors[0]!.id,
    operatingPoint: values,
  };
}

function issueCodes(project: BfnProject, request: BfnNetworkInfluenceRequestV1): string[] {
  return assessBfnNetworkInfluenceRequest(project, request).issues.map((issue) => issue.code);
}

function identityModule(project: BfnProject, id: string): BfnFunctionalModule {
  const contextId = project.registry.contexts[0]?.id ?? null;
  const datasetId = project.registry.datasets[0]?.id;
  const inputPortId = `${id}-in`;
  const outputPortId = `${id}-out`;
  const domainId = `${id}-domain`;
  const modelId = `${id}-static`;
  project.registry.validityDomains.push({
    id: domainId,
    labelKey: 'bfn.testing.networkInfluenceDomain',
    inputRanges: [{ portId: inputPortId, minimum: 0, maximum: 100, unit: 'dimensionless' }],
    contextId,
  });
  return {
    kind: 'functional_module',
    id,
    labelKey: 'bfn.testing.networkInfluenceModule',
    descriptionKey: 'bfn.testing.networkInfluenceModuleDescription',
    inputPorts: [
      {
        id: inputPortId,
        entity: 'network-cycle-signal',
        quantityType: 'activity',
        unit: 'dimensionless',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: outputPortId,
        entity: 'network-cycle-signal',
        quantityType: 'activity',
        unit: 'dimensionless',
        direction: 'output',
      },
    ],
    modelVariants: [
      {
        id: modelId,
        version: '1.0-test',
        mode: 'static',
        family: 'identity',
        response: { family: 'identity', inputPortId },
        contextId,
        validityDomainId: domainId,
        sourceDatasetIds: datasetId ? [datasetId] : [],
        provenanceIds: [],
        evidenceGrade: 'independent_assumption',
        uncertaintyMethod: 'not_recorded',
        isDemo: true,
      },
    ],
    activeModelIds: { static: modelId },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 0, y: 0 },
    isDemo: true,
  };
}

function appendCycle(project: BfnProject, targetMonitor: boolean): void {
  const a = identityModule(project, 'module-cycle-a');
  const b = identityModule(project, 'module-cycle-b');
  project.network.modules.push(a, b);
  project.network.edges.push(
    {
      id: 'edge-cycle-a-b',
      source: { nodeId: a.id, portId: a.outputPorts[0]!.id },
      target: { nodeId: b.id, portId: b.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-cycle-b-a',
      source: { nodeId: b.id, portId: b.outputPorts[0]!.id },
      target: { nodeId: a.id, portId: a.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
  );
  if (!targetMonitor) return;
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort.entity = 'network-cycle-signal';
  monitor.inputPort.quantityType = 'activity';
  monitor.inputPort.unit = 'dimensionless';
  project.network.edges = project.network.edges.filter((edge) => edge.target.nodeId !== monitor.id);
  project.network.edges.push({
    id: 'edge-cycle-monitor',
    source: { nodeId: b.id, portId: b.outputPorts[0]!.id },
    target: { nodeId: monitor.id, portId: monitor.inputPort.id },
    mapping: 'identity',
    enabled: true,
  });
}

describe('assessBfnNetworkInfluenceRequest', () => {
  it('resolves only the enabled active-response closure in Project order', () => {
    const project = createDemoBfnProject();
    const admission = assessBfnNetworkInfluenceRequest(project, requestFor(project));

    expect(admission.status).toBe('supported');
    expect(admission.target?.inputSources.map((source) => source.inputSourceId)).toEqual([
      'source-ahl',
    ]);
    expect(admission.target?.moduleTargets.map((module) => module.moduleId)).toEqual([
      'module-ahl-sensor',
      'module-reporter',
    ]);
    expect(admission.target?.outputUnit).toBe('dimensionless');
  });

  it('ignores an unconnected non-response input on a relevant module', () => {
    const project = createDemoBfnProject();
    project.network.modules[0]!.inputPorts.push({
      id: 'unused-input',
      entity: 'unused-signal',
      quantityType: 'concentration',
      unit: 'nM',
      direction: 'input',
    });

    expect(assessBfnNetworkInfluenceRequest(project, requestFor(project)).status).toBe('supported');
  });

  it('rejects an unknown Output Monitor', () => {
    const project = createDemoBfnProject();
    expect(
      issueCodes(project, { ...requestFor(project), outputMonitorId: 'missing-monitor' }),
    ).toContain('output_monitor_not_found');
  });

  it('rejects a missing incoming edge for a required module input', () => {
    const project = createDemoBfnProject();
    project.network.edges = project.network.edges.filter(
      (edge) => edge.id !== 'edge-source-sensor',
    );
    expect(issueCodes(project, requestFor(project))).toContain('required_input_unconnected');
  });

  it('rejects duplicate enabled incoming edges for a required input', () => {
    const project = createDemoBfnProject();
    project.network.edges.push({
      ...structuredClone(project.network.edges[0]!),
      id: 'edge-source-sensor-duplicate',
    });
    expect(issueCodes(project, requestFor(project))).toContain('required_input_ambiguous');
  });

  it('ignores a disabled duplicate incoming edge', () => {
    const project = createDemoBfnProject();
    project.network.edges.push({
      ...structuredClone(project.network.edges[0]!),
      id: 'edge-source-sensor-disabled',
      enabled: false,
    });
    expect(assessBfnNetworkInfluenceRequest(project, requestFor(project)).status).toBe('supported');
  });

  it('rejects a malformed endpoint on the selected path', () => {
    const project = createDemoBfnProject();
    project.network.edges[0]!.source.portId = 'unknown-port';
    expect(issueCodes(project, requestFor(project))).toContain('edge_endpoint_invalid');
  });

  it('does not let an unrelated malformed module block the selected target', () => {
    const project = createDemoBfnProject();
    const unrelated = structuredClone(project.network.modules[0]!);
    unrelated.id = 'module-unrelated-malformed';
    unrelated.activeModelIds = { static: 'missing-model' };
    project.network.modules.push(unrelated);

    expect(assessBfnNetworkInfluenceRequest(project, requestFor(project)).status).toBe('supported');
  });

  it('rejects an Accumulator in the target closure with its own reason', () => {
    const project = createAccumulatorBfnProject();
    const request = requestFor(project, [
      { inputSourceId: 'source-accumulator-rate', value: 1, unit: 'nM/h' },
    ]);
    expect(issueCodes(project, request)).toContain('upstream_accumulator_unsupported');
    expect(issueCodes(project, request)).not.toContain('response_model_invalid');
    expect(project.network.modules[0]!.id).toBe(ACCUMULATOR_MODULE_ID);
  });

  it('admits paired first-order modules as steady-state response targets', () => {
    const project = createDemoBfnProject();
    const admission = assessBfnNetworkInfluenceRequest(project, requestFor(project));
    expect(admission.target?.includesFirstOrderSteadyState).toBe(true);
    expect(
      admission.target?.moduleTargets.every(
        (module) => module.interpretationBasis === 'first_order_steady_state_static_response',
      ),
    ).toBe(true);
  });

  it('admits a dynamic DAG with explicit steady-state analysis conditions', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 10,
      unit: 'nM',
    };
    expect(assessBfnNetworkInfluenceRequest(project, requestFor(project)).status).toBe('supported');
  });

  it('rejects feedback in the selected target closure', () => {
    const project = createDemoBfnProject();
    appendCycle(project, true);
    expect(issueCodes(project, requestFor(project, []))).toContain('upstream_feedback_unsupported');
  });

  it('ignores a cycle outside the selected target closure', () => {
    const project = createDemoBfnProject();
    appendCycle(project, false);
    expect(assessBfnNetworkInfluenceRequest(project, requestFor(project)).status).toBe('supported');
  });

  it('rejects a missing external source operating value', () => {
    const project = createDemoBfnProject();
    expect(issueCodes(project, requestFor(project, []))).toContain('input_source_value_missing');
  });

  it('rejects a duplicate external source operating value', () => {
    const project = createDemoBfnProject();
    expect(
      issueCodes(
        project,
        requestFor(project, [
          { inputSourceId: 'source-ahl', value: 10, unit: 'nM' },
          { inputSourceId: 'source-ahl', value: 11, unit: 'nM' },
        ]),
      ),
    ).toContain('input_source_value_duplicate');
  });

  it('rejects an unrelated source operating value', () => {
    const project = createDemoBfnProject();
    const unrelated = structuredClone(project.network.inputSources[0]!);
    unrelated.id = 'source-unrelated';
    unrelated.outputPort.id = 'source-unrelated-out';
    project.network.inputSources.unshift(unrelated);
    expect(
      issueCodes(
        project,
        requestFor(project, [
          { inputSourceId: 'source-unrelated', value: 2, unit: 'nM' },
          { inputSourceId: 'source-ahl', value: 10, unit: 'nM' },
        ]),
      ),
    ).toContain('unexpected_input_source');
  });

  it('rejects a wrong exact source unit', () => {
    const project = createDemoBfnProject();
    expect(
      issueCodes(
        project,
        requestFor(project, [{ inputSourceId: 'source-ahl', value: 10, unit: 'uM' }]),
      ),
    ).toContain('unit_mismatch');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a non-finite external value %s',
    (value) => {
      const project = createDemoBfnProject();
      expect(
        issueCodes(
          project,
          requestFor(project, [{ inputSourceId: 'source-ahl', value, unit: 'nM' }]),
        ),
      ).toContain('value_non_finite');
    },
  );

  it('rejects a negative external value', () => {
    const project = createDemoBfnProject();
    expect(
      issueCodes(
        project,
        requestFor(project, [{ inputSourceId: 'source-ahl', value: -1, unit: 'nM' }]),
      ),
    ).toContain('value_negative');
  });
});
