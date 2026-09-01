import { describe, expect, it } from 'vitest';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from '../catalog/catalogBfnAdapter';
import { addIdealConnection, validateBfnProject } from '../validation';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import { runBfnSimulation } from '../simulation';
import { ACCUMULATOR_MODULE_ID, createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import type { BfnProject } from '../types';

const RESPONSE_ID = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;

function connectedCatalogProject(): BfnProject {
  const base = createDemoBfnProject();
  base.network.inputSources = [];
  base.network.modules = [];
  base.network.edges = [];
  base.registry.validityDomains = [];
  const instantiated = instantiateCatalogResponseInBfnProject(
    base,
    buildBfnCatalogRuntimeCandidate(RESPONSE_ID),
    {
      moduleId: 'module-catalog-temporal-run',
      modulePosition: { x: 360, y: 180 },
      createInputSource: true,
      inputSourceId: 'source-catalog-temporal-run',
      inputSourcePosition: { x: 30, y: 180 },
    },
  );
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  const project = instantiated.nextProject;
  const source = project.network.inputSources[0]!;
  const module = project.network.modules[0]!;
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort = { ...module.outputPorts[0]!, id: monitor.inputPort.id, direction: 'input' };
  const withInput = addIdealConnection(
    project,
    { nodeId: source.id, portId: source.outputPort.id },
    { nodeId: module.id, portId: module.inputPorts[0]!.id },
    'edge-catalog-temporal-input',
  );
  return addIdealConnection(
    withInput,
    { nodeId: module.id, portId: module.outputPorts[0]!.id },
    { nodeId: monitor.id, portId: monitor.inputPort.id },
    'edge-catalog-temporal-output',
  );
}

function appendOffTargetAccumulatorPath(project: BfnProject): void {
  const branch = createAccumulatorBfnProject();
  project.network.inputSources.push(...structuredClone(branch.network.inputSources));
  project.network.modules.push(...structuredClone(branch.network.modules));
  project.network.outputMonitors.push(...structuredClone(branch.network.outputMonitors));
  project.network.edges.push(...structuredClone(branch.network.edges));
  project.registry.validityDomains.push(...structuredClone(branch.registry.validityDomains));
  for (const provenance of branch.registry.provenanceRecords) {
    if (!project.registry.provenanceRecords.some(({ id }) => id === provenance.id)) {
      project.registry.provenanceRecords.push(structuredClone(provenance));
    }
  }
}

describe('BFN temporal runtime integration', () => {
  it('blocks an output-reachable unsupported module', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[0]!;
    module.activeModelIds = { static: 'missing-model' };

    expect(validateBfnProject(project)).toContainEqual({
      code: 'temporal_execution_unsupported',
      severity: 'error',
      subjectId: module.id,
    });
  });

  it('does not block an isolated unsupported module', () => {
    const project = createDemoBfnProject();
    const isolated = createCatalogModule('ahl-sensor', 'isolated-temporal');
    isolated.activeModelIds = { static: 'missing-model' };
    project.network.modules.push(isolated);

    expect(
      validateBfnProject(project).filter(
        (issue) =>
          issue.code === 'temporal_execution_unsupported' && issue.subjectId === isolated.id,
      ),
    ).toEqual([]);
  });

  it('scopes the temporal hard gate to the selected monitor while retaining whole-project audit coverage', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'static';
    const selectedMonitor = project.network.outputMonitors[0]!;
    appendOffTargetAccumulatorPath(project);
    const unsupportedIssue = {
      code: 'temporal_execution_unsupported',
      severity: 'error',
      subjectId: ACCUMULATOR_MODULE_ID,
    } as const;

    expect(validateBfnProject(project, { targetMonitorId: selectedMonitor.id })).not.toContainEqual(
      unsupportedIssue,
    );
    expect(runBfnSimulation(project).outputMonitorId).toBe(selectedMonitor.id);
    expect(validateBfnProject(project)).toContainEqual(unsupportedIssue);
  });

  it('runs a mixed dynamic path and records exact output-reachable temporal/context snapshots', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const reporter = project.network.modules[1]!;
    const staticModelId = reporter.activeModelIds.static;
    if (staticModelId === undefined) throw new Error('Expected paired demo model.');
    reporter.activeModelIds = { static: staticModelId };
    const isolated = createCatalogModule('ahl-sensor', 'isolated-snapshot');
    project.network.modules.push(isolated);

    const result = runBfnSimulation(project, '2026-08-28T02:00:00.000Z');
    expect(result.temporalSnapshot).toEqual({
      scope: 'output_reachable',
      modules: [
        {
          moduleId: 'module-ahl-sensor',
          selectedModelId: 'module-ahl-sensor-dynamic-v1',
          executionMode: 'stateful_dynamic',
          evidenceTier: 'not_recorded',
          resolutionBasis: 'active-dynamic',
        },
        {
          moduleId: 'module-reporter',
          selectedModelId: 'module-reporter-static-v1',
          executionMode: 'quasi_static',
          evidenceTier: 'not_recorded',
          resolutionBasis: 'dynamic-static-fallback',
        },
      ],
    });
    expect(result.contextApplicabilitySnapshot).toEqual({
      scope: 'output_reachable_module_edges',
      edges: [expect.objectContaining({ edgeId: 'edge-sensor-reporter', state: 'matched' })],
    });
    expect(result.temporalSnapshot?.modules.some((entry) => entry.moduleId === isolated.id)).toBe(
      false,
    );
  });

  it('records Catalog dynamic fallback as quasi-static T0 and built-in first-order as not-recorded stateful', () => {
    const catalogProject = connectedCatalogProject();
    catalogProject.network.mode = 'dynamic';
    const catalogResult = runBfnSimulation(catalogProject);
    expect(catalogResult.temporalSnapshot?.modules[0]).toMatchObject({
      executionMode: 'quasi_static',
      evidenceTier: 't0_steady_state',
      resolutionBasis: 'dynamic-static-fallback',
    });

    const builtInProject = createDemoBfnProject();
    builtInProject.network.mode = 'dynamic';
    const builtInResult = runBfnSimulation(builtInProject);
    expect(builtInResult.temporalSnapshot?.modules[0]).toMatchObject({
      executionMode: 'stateful_dynamic',
      evidenceTier: 'not_recorded',
      resolutionBasis: 'active-dynamic',
    });
  });

  it('allows a run with known context differences and records them in provenance', () => {
    const project = createDemoBfnProject();
    const originalTemperature = project.registry.contexts[0]!.temperatureCelsius;
    if (originalTemperature === null) throw new Error('Expected a recorded demo temperature.');
    const context = {
      ...structuredClone(project.registry.contexts[0]!),
      id: 'context-run-known-difference',
      temperatureCelsius: originalTemperature + 3,
    };
    project.registry.contexts.push(context);
    const reporter = project.network.modules[1]!;
    const model = reporter.modelVariants.find(
      (candidate) => candidate.id === reporter.activeModelIds.static,
    );
    if (!model) throw new Error('Expected reporter static model.');
    model.contextId = context.id;

    const result = runBfnSimulation(project);
    expect(result.validationIssues).toContainEqual({
      code: 'context_applicability_mismatch',
      severity: 'warning',
      subjectId: 'edge-sensor-reporter',
    });
    expect(result.contextApplicabilitySnapshot?.edges).toEqual([
      expect.objectContaining({ edgeId: 'edge-sensor-reporter', state: 'mismatched' }),
    ]);
  });

  it('preserves the exact frozen-baseline static points and module outputs', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'static';
    project.network.inputSources[0]!.staticSpecification = {
      type: 'working_range',
      minimum: 0.1,
      maximum: 1,
      points: 3,
      unit: 'nM',
    };

    const result = runBfnSimulation(project, '2026-08-28T00:00:00.000Z');
    expect({ points: result.points, dynamicMetrics: result.dynamicMetrics }).toEqual({
      points: [
        {
          coordinate: 0.1,
          inputs: { 'source-ahl': 0.1 },
          moduleOutputs: {
            'module-ahl-sensor': 0.030091990800919906,
            'module-reporter': 0.03828647135286471,
          },
          output: 0.03828647135286471,
          lower: 0.01805437122422054,
          upper: 0.06912884029892057,
          extrapolated: false,
        },
        {
          coordinate: 0.55,
          inputs: { 'source-ahl': 0.55 },
          moduleOutputs: {
            'module-ahl-sensor': 0.03277460681438648,
            'module-reporter': 0.04080813040552329,
          },
          output: 0.04080813040552329,
          lower: 0.019641395679215537,
          upper: 0.07288170635057373,
          extrapolated: false,
        },
        {
          coordinate: 1,
          inputs: { 'source-ahl': 1 },
          moduleOutputs: {
            'module-ahl-sensor': 0.03910891089108911,
            'module-reporter': 0.04676237623762376,
          },
          output: 0.04676237623762376,
          lower: 0.023400000000000004,
          upper: 0.08170989761092151,
          extrapolated: false,
        },
      ],
      dynamicMetrics: null,
    });
  });

  it('preserves the exact frozen-baseline dynamic points, envelope, and metrics', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.analysis.durationHours = 0.2;
    project.analysis.timeStepHours = 0.1;
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'step',
      before: 0,
      after: 20,
      atHours: 0.1,
      unit: 'nM',
    };

    const result = runBfnSimulation(project, '2026-08-28T00:00:00.000Z');
    expect({ points: result.points, dynamicMetrics: result.dynamicMetrics }).toEqual({
      points: [
        {
          coordinate: 0,
          timeHours: 0,
          inputs: { 'source-ahl': 0 },
          moduleOutputs: {
            'module-ahl-sensor': 0.03,
            'module-reporter': 0.01,
          },
          output: 0.01,
          lower: 0.01,
          upper: 0.01,
          extrapolated: true,
        },
        {
          coordinate: 0.1,
          timeHours: 0.1,
          inputs: { 'source-ahl': 20 },
          moduleOutputs: {
            'module-ahl-sensor': 0.11648227969773774,
            'module-reporter': 0.03181792787273746,
          },
          output: 0.03181792787273746,
          lower: 0.018819191524634703,
          upper: 0.056338103635695386,
          extrapolated: false,
        },
        {
          coordinate: 0.2,
          timeHours: 0.2,
          inputs: { 'source-ahl': 20 },
          moduleOutputs: {
            'module-ahl-sensor': 0.19280262365944595,
            'module-reporter': 0.06358368132578643,
          },
          output: 0.06358368132578643,
          lower: 0.032450747802630193,
          upper: 0.1193110916889753,
          extrapolated: false,
        },
      ],
      dynamicMetrics: {
        terminalValue: 0.06358368132578643,
        steadyStateAvailable: true,
        steadyValue: 0.06358368132578643,
        riseTimeHours: 0.2,
        peakValue: 0.06358368132578643,
        peakTimeHours: 0.2,
        overshootFraction: 0,
        oscillatory: false,
        dcGain: 0.0026791840662893215,
        frequencyGain: null,
      },
    });
  });
});
