import { describe, expect, it } from 'vitest';
import {
  buildReceiverResponseBinding,
  evaluateReceiverResponse,
} from '../../modeling/receiverResponseEvaluator';
import { getTrustedAhlHslCatalogRelease } from '../../modeling/catalog/v2/catalogReleaseLoader';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { createDemoBfnProject } from '../fixtures';
import { runBfnSimulation } from '../simulation';
import type { BfnProject, BfnStaticModel } from '../types';
import { validateBfnProject } from '../validation';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalogBfnAdapter';
import { BfnCatalogContractError } from './catalogBfnTypes';

const RESPONSE_ID = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;

function connectedCatalogProject(): BfnProject {
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
  const source = next.network.inputSources[0]!;
  const module = next.network.modules[0]!;
  const monitor = next.network.outputMonitors[0]!;
  monitor.inputPort = {
    ...module.outputPorts[0]!,
    id: monitor.inputPort.id,
    direction: 'input',
  };
  next.network.edges = [
    {
      id: 'edge-source-catalog',
      source: { nodeId: source.id, portId: source.outputPort.id },
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
  return next;
}

function catalogStaticModel(project: BfnProject): BfnStaticModel {
  const model = project.network.modules[0]?.modelVariants[0];
  if (!model || model.mode !== 'static') throw new Error('expected static Catalog model');
  return model;
}

describe('Catalog-backed BFN simulation integration', () => {
  it('treats zero as trusted and non-extrapolated even when the positive range starts above zero', () => {
    const project = connectedCatalogProject();
    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: 0,
      unit: 'M',
    };

    const result = runBfnSimulation(project);

    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({ output: 0, lower: 0, upper: 0, extrapolated: false });
    expect(result.extrapolated).toBe(false);
    expect(result.validationIssues.map((issue) => issue.code)).not.toContain(
      'outside_validity_domain',
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

  it('rejects an unavailable release before copied Hill parameters can execute', () => {
    const project = connectedCatalogProject();
    const model = catalogStaticModel(project);
    model.catalogReference!.releaseVersion = 'future-unknown';

    expect(() => runBfnSimulation(project)).toThrow(
      'BFN_VALIDATION_FAILED:catalog_release_unavailable',
    );
  });
});
