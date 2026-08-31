import { describe, expect, it } from 'vitest';
import {
  buildReceiverResponseBinding,
  evaluateReceiverResponse,
} from '../../modeling/receiverResponseEvaluator';
import { getTrustedAhlHslCatalogRelease } from '../../modeling/catalog/v2/catalogReleaseLoader';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import { runBfnSimulation } from '../simulation';
import type { BfnProject, BfnStaticModel } from '../types';
import { addIdealConnection, validateBfnProject } from '../validation';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalogBfnAdapter';
import { BfnCatalogContractError } from './catalogBfnTypes';

const RESPONSE_ID = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;

function instantiatedCatalogProject(): BfnProject {
  const project = createDemoBfnProject();
  project.isDemo = false;
  project.network.inputSources = [];
  project.network.modules = [];
  project.network.edges = [];
  project.registry.validityDomains = [];
  const candidate = buildBfnCatalogRuntimeCandidate(RESPONSE_ID);
  const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-catalog-simulation',
    modulePosition: { x: 360, y: 220 },
    createInputSource: true,
    inputSourceId: 'source-catalog-simulation',
    inputSourcePosition: { x: 40, y: 220 },
  });
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  const next = instantiated.nextProject;
  const module = next.network.modules[0]!;
  const monitor = next.network.outputMonitors[0]!;
  monitor.inputPort = {
    ...module.outputPorts[0]!,
    id: monitor.inputPort.id,
    direction: 'input',
  };
  return next;
}

function connectedCatalogProject(): BfnProject {
  const project = instantiatedCatalogProject();
  const source = project.network.inputSources[0]!;
  const module = project.network.modules[0]!;
  const monitor = project.network.outputMonitors[0]!;
  const withInput = addIdealConnection(
    project,
    { nodeId: source.id, portId: source.outputPort.id },
    { nodeId: module.id, portId: module.inputPorts[0]!.id },
    'edge-source-catalog',
  );
  return addIdealConnection(
    withInput,
    { nodeId: module.id, portId: module.outputPorts[0]!.id },
    { nodeId: monitor.id, portId: monitor.inputPort.id },
    'edge-catalog-monitor',
  );
}

function catalogStaticModel(project: BfnProject): BfnStaticModel {
  const model = project.network.modules[0]?.modelVariants[0];
  if (!model || model.mode !== 'static') throw new Error('expected static Catalog model');
  return model;
}

function markCurrentModelsNonDemo(project: BfnProject): void {
  project.isDemo = false;
  for (const module of project.network.modules) {
    module.isDemo = false;
    for (const model of module.modelVariants) model.isDemo = false;
  }
}

function detachedCatalogBranchProject(disabledPathToMonitor = false): BfnProject {
  const project = createDemoBfnProject();
  markCurrentModelsNonDemo(project);
  project.network.inputSources[0]!.staticSpecification = {
    type: 'fixed_value',
    value: 10,
    unit: 'nM',
  };
  const instantiated = instantiateCatalogResponseInBfnProject(
    project,
    buildBfnCatalogRuntimeCandidate(RESPONSE_ID),
    {
      moduleId: 'module-catalog-detached',
      modulePosition: { x: 360, y: 360 },
      createInputSource: true,
      inputSourceId: 'source-catalog-detached',
      inputSourcePosition: { x: 40, y: 360 },
    },
  );
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  const next = instantiated.nextProject;
  const source = next.network.inputSources.find(
    (candidate) => candidate.id === 'source-catalog-detached',
  )!;
  const module = next.network.modules.find(
    (candidate) => candidate.id === 'module-catalog-detached',
  )!;
  source.staticSpecification = { type: 'fixed_value', value: 0, unit: 'M' };
  const withInput = addIdealConnection(
    next,
    { nodeId: source.id, portId: source.outputPort.id },
    { nodeId: module.id, portId: module.inputPorts[0]!.id },
    'edge-source-catalog-detached',
  );
  if (disabledPathToMonitor) {
    const monitor = withInput.network.outputMonitors[0]!;
    withInput.network.edges.push({
      id: 'edge-catalog-detached-monitor-disabled',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: false,
    });
  }
  return withInput;
}

function mixedCatalogBranchProject(): BfnProject {
  const project = detachedCatalogBranchProject();
  const reporter = project.network.modules.find((module) => module.id === 'module-reporter')!;
  const catalogModule = project.network.modules.find(
    (module) => module.id === 'module-catalog-detached',
  )!;
  const finalModule = createCatalogModule('dual-input-gate', 'mixed');
  finalModule.isDemo = false;
  for (const model of finalModule.modelVariants) model.isDemo = false;
  finalModule.inputPorts = finalModule.inputPorts.map((port) => ({
    ...port,
    entity: 'normalized_reporter_expression',
    quantityType: 'expression_level',
    unit: 'dimensionless',
  }));
  project.network.modules.push(finalModule);
  project.network.edges = project.network.edges.filter(
    (edge) => edge.target.nodeId !== project.network.outputMonitors[0]!.id,
  );
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort = {
    ...finalModule.outputPorts[0]!,
    id: monitor.inputPort.id,
    direction: 'input',
  };
  const withNormalBranch = addIdealConnection(
    project,
    { nodeId: reporter.id, portId: reporter.outputPorts[0]!.id },
    { nodeId: finalModule.id, portId: finalModule.inputPorts[0]!.id },
    'edge-reporter-final',
  );
  const withDemoBranch = addIdealConnection(
    withNormalBranch,
    { nodeId: catalogModule.id, portId: catalogModule.outputPorts[0]!.id },
    { nodeId: finalModule.id, portId: finalModule.inputPorts[1]!.id },
    'edge-catalog-final',
  );
  return addIdealConnection(
    withDemoBranch,
    { nodeId: finalModule.id, portId: finalModule.outputPorts[0]!.id },
    { nodeId: monitor.id, portId: monitor.inputPort.id },
    'edge-final-monitor',
  );
}

describe('Catalog-backed BFN simulation integration', () => {
  it('blocks a Catalog module and input source until explicit edges define the topology', () => {
    const project = instantiatedCatalogProject();
    const module = project.network.modules[0]!;
    const inputPort = module.inputPorts[0]!;
    const issues = validateBfnProject(project);

    expect(project.network.inputSources).toHaveLength(1);
    expect(project.network.edges).toEqual([]);
    expect(issues).toContainEqual({
      code: 'catalog_required_input_unconnected',
      severity: 'error',
      subjectId: inputPort.id,
    });
    expect(
      issues.some(
        (issue) => issue.subjectId === inputPort.id && issue.code === 'missing_required_input',
      ),
    ).toBe(false);
    expect(() => runBfnSimulation(project)).toThrow(/catalog_required_input_unconnected/);

    const source = project.network.inputSources[0]!;
    project.network.edges.push({
      id: 'edge-source-catalog-disabled',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: module.id, portId: inputPort.id },
      mapping: 'identity',
      enabled: false,
    });
    expect(
      validateBfnProject(project).some(
        (issue) => issue.code === 'catalog_required_input_unconnected',
      ),
    ).toBe(true);
    project.network.edges = [
      {
        id: 'edge-source-wrong-catalog-port',
        source: { nodeId: source.id, portId: source.outputPort.id },
        target: { nodeId: module.id, portId: 'different-input-port' },
        mapping: 'identity',
        enabled: true,
      },
    ];
    expect(
      validateBfnProject(project).some(
        (issue) => issue.code === 'catalog_required_input_unconnected',
      ),
    ).toBe(true);

    const connected = connectedCatalogProject();
    expect(
      validateBfnProject(connected).filter(
        (issue) => issue.code === 'catalog_required_input_unconnected',
      ),
    ).toEqual([]);
  });

  it('does not count an enabled edge with an unresolved source as a Catalog input', () => {
    const project = instantiatedCatalogProject();
    const module = project.network.modules[0]!;
    const monitor = project.network.outputMonitors[0]!;
    project.network.edges = [
      {
        id: 'edge-missing-source-catalog',
        source: { nodeId: 'missing-source', portId: 'missing-source-output' },
        target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge-catalog-monitor',
        source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
        target: { nodeId: monitor.id, portId: monitor.inputPort.id },
        mapping: 'identity',
        enabled: true,
      },
    ];

    const codes = validateBfnProject(project).map((issue) => issue.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'missing_source_node',
        'missing_source_port',
        'catalog_required_input_unconnected',
      ]),
    );
  });

  it('treats an explicit zero as trusted without fabricating a zero-width interval', () => {
    const project = connectedCatalogProject();
    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: 0,
      unit: 'M',
    };

    const result = runBfnSimulation(project);

    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({
      output: 0,
      lower: null,
      upper: null,
      extrapolated: false,
    });
    expect(result.uncertaintySnapshot.status).toBe('unavailable');
    expect(result.extrapolated).toBe(false);
    expect(result.validationIssues.map((issue) => issue.code)).not.toContain(
      'outside_validity_domain',
    );
    expect(result.validationIssues.map((issue) => issue.code)).not.toContain(
      'catalog_required_input_unconnected',
    );
    expect(result.validationIssues.map((issue) => issue.code)).not.toContain(
      'catalog_input_out_of_range',
    );
  });

  it('fails positive extrapolation instead of returning a generic domain warning', () => {
    const project = connectedCatalogProject();
    const model = catalogStaticModel(project);
    const range = model.catalogReference!.sourceParameters.workingRange;
    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: range.min / 2,
      unit: 'M',
    };

    expect(() => runBfnSimulation(project)).toThrowError(BfnCatalogContractError);
    try {
      runBfnSimulation(project);
    } catch (error) {
      expect(error).toMatchObject({ code: 'catalog_input_out_of_range' });
    }
  });

  it('converts a compatible nM edge into the canonical M evaluator input', () => {
    const project = connectedCatalogProject();
    const trusted = getTrustedAhlHslCatalogRelease();
    const binding = buildReceiverResponseBinding(trusted.catalog, RESPONSE_ID);
    const source = project.network.inputSources[0]!;
    source.outputPort.unit = 'nM';
    source.staticSpecification = {
      type: 'fixed_value',
      value: binding.originalParameters.ec50 / 1e-9,
      unit: 'nM',
    };

    const result = runBfnSimulation(project);

    expect(result.points[0]!.output).toBeCloseTo(
      evaluateReceiverResponse(binding, binding.originalParameters.ec50, 'M'),
      12,
    );
  });

  it('executes a static Catalog model memorylessly in a dynamic network', () => {
    const project = connectedCatalogProject();
    const model = catalogStaticModel(project);
    const ec50 = model.catalogReference!.sourceParameters.ec50;
    project.network.mode = 'dynamic';
    project.analysis.durationHours = 2;
    project.analysis.timeStepHours = 0.5;
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'step',
      before: 0,
      after: ec50,
      atHours: 1,
      unit: 'M',
    };

    const validation = validateBfnProject(project);
    const result = runBfnSimulation(project);

    expect(model.mode).toBe('static');
    expect(project.network.modules[0]!.modelVariants).toHaveLength(1);
    expect('tau' in model).toBe(false);
    expect(validation.filter((issue) => issue.code === 'missing_required_input')).toEqual([]);
    expect(result.points.find((point) => point.timeHours === 0.5)?.output).toBe(0);
    expect(result.points.find((point) => point.timeHours === 1)?.output).toBeCloseTo(0.5, 12);
    expect(result.points.find((point) => point.timeHours === 1.5)?.output).toBeCloseTo(0.5, 12);
  });

  it('propagates the runtime-demo boundary into a non-demo project result', () => {
    const project = connectedCatalogProject();
    const model = catalogStaticModel(project);
    const ec50 = model.catalogReference!.sourceParameters.ec50;
    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: ec50,
      unit: 'M',
    };

    const result = runBfnSimulation(project);

    expect(project.isDemo).toBe(false);
    expect(result.isDemo).toBe(true);
    expect(result.experimentalValidity).toBe('not_validated');
  });

  it('does not propagate an input-connected Catalog demo module outside the output subgraph', () => {
    const project = detachedCatalogBranchProject();

    const result = runBfnSimulation(project);

    expect(validateBfnProject(project).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.isDemo).toBe(false);
    expect(result.experimentalValidity).toBe('not_validated');
  });

  it('does not propagate a Catalog demo module through a disabled path', () => {
    const project = detachedCatalogBranchProject(true);

    const result = runBfnSimulation(project);

    expect(result.isDemo).toBe(false);
  });

  it('propagates a reachable Catalog demo branch in a mixed network', () => {
    const project = mixedCatalogBranchProject();

    const result = runBfnSimulation(project);

    expect(result.isDemo).toBe(true);
  });

  it('keeps the project demo boundary authoritative when reachable models are non-demo', () => {
    const project = detachedCatalogBranchProject();
    project.isDemo = true;

    const result = runBfnSimulation(project);

    expect(result.isDemo).toBe(true);
  });

  it('rejects an unavailable release before copied Hill parameters can execute', () => {
    const project = connectedCatalogProject();
    const model = catalogStaticModel(project);
    model.catalogReference!.releaseVersion = 'future-unknown';

    expect(() => runBfnSimulation(project)).toThrow(
      'BFN_VALIDATION_FAILED:catalog_release_unavailable',
    );
  });
});
