import { describe, expect, it } from 'vitest';
import {
  buildReceiverResponseBinding,
  evaluateReceiverResponse,
} from '../../modeling/receiverResponseEvaluator';
import { getTrustedAhlHslCatalogRelease } from '../../modeling/catalog/v2/catalogReleaseLoader';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { createDemoBfnProject } from '../fixtures';
import type { BfnFunctionalModule, BfnProject, BfnStaticModel } from '../types';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalogBfnAdapter';
import { evaluateBfnModuleModel } from './catalogBfnEvaluation';
import { BfnCatalogContractError } from './catalogBfnTypes';

interface CatalogModelFixture {
  project: BfnProject;
  module: BfnFunctionalModule;
  model: BfnStaticModel;
}

function createCatalogModelFixture(responseId: string): CatalogModelFixture {
  const candidate = buildBfnCatalogRuntimeCandidate(responseId);
  const project = createDemoBfnProject();
  project.network.inputSources = [];
  project.network.modules = [];
  project.network.edges = [];
  project.registry.validityDomains = [];
  const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-catalog-under-test',
    modulePosition: { x: 360, y: 220 },
    createInputSource: true,
    inputSourceId: 'source-catalog-under-test',
    inputSourcePosition: { x: 40, y: 220 },
  });
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  const next = instantiated.nextProject;
  const module = next.network.modules[0];
  const source = next.network.inputSources[0];
  const monitor = next.network.outputMonitors[0];
  const model = module?.modelVariants[0];
  if (!module || !source || !monitor || !model || model.mode !== 'static') {
    throw new Error('catalog model fixture incomplete');
  }
  monitor.inputPort = {
    ...module.outputPorts[0]!,
    id: monitor.inputPort.id,
    direction: 'input',
  };
  next.network.edges = [
    {
      id: 'edge-catalog-source',
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
  return { project: next, module, model };
}

describe('Catalog-backed BFN evaluation', () => {
  it.each(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST)(
    'matches the trusted evaluator for $id at canonical points',
    ({ id }) => {
      const trusted = getTrustedAhlHslCatalogRelease();
      const binding = buildReceiverResponseBinding(trusted.catalog, id);
      const fixture = createCatalogModelFixture(id);
      const inputPortId = fixture.module.inputPorts[0]!.id;
      const ec50 = binding.originalParameters.ec50;
      const interior = Math.sqrt(
        Math.max(Number.MIN_VALUE, binding.workingRange.min) * binding.workingRange.max,
      );
      const fourthPoint =
        ec50 >= binding.workingRange.min && ec50 <= binding.workingRange.max ? ec50 : interior;
      const inputs = [0, binding.workingRange.min, binding.workingRange.max, fourthPoint];

      for (const input of inputs) {
        const expected = evaluateReceiverResponse(binding, input, 'M');
        const actual = evaluateBfnModuleModel(
          fixture.project,
          fixture.module,
          fixture.model,
          { [inputPortId]: input },
          'estimate',
        );
        expect(actual).toBeCloseTo(expected, 12);
      }
    },
  );

  it('returns one trusted value for every parameter scenario because no interval is asserted', () => {
    const fixture = createCatalogModelFixture(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id);
    const inputPortId = fixture.module.inputPorts[0]!.id;
    const input = fixture.model.catalogReference!.sourceParameters.ec50;
    const scenarios = ['estimate', 'lower', 'upper', 'low_output', 'high_output'] as const;
    const values = scenarios.map((scenario) =>
      evaluateBfnModuleModel(
        fixture.project,
        fixture.module,
        fixture.model,
        { [inputPortId]: input },
        scenario,
      ),
    );

    expect(new Set(values).size).toBe(1);
  });

  it('rejects a missing input key while preserving explicit zero as a trusted value', () => {
    const fixture = createCatalogModelFixture(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id);
    const inputPortId = fixture.module.inputPorts[0]!.id;

    expect(() =>
      evaluateBfnModuleModel(fixture.project, fixture.module, fixture.model, {}),
    ).toThrowError(BfnCatalogContractError);
    try {
      evaluateBfnModuleModel(fixture.project, fixture.module, fixture.model, {});
    } catch (error) {
      expect(error).toMatchObject({ code: 'catalog_required_input_unconnected' });
    }
    expect(
      evaluateBfnModuleModel(fixture.project, fixture.module, fixture.model, {
        [inputPortId]: 0,
      }),
    ).toBe(0);
  });

  it('implements the trusted zero and closed working-range boundary without extrapolation', () => {
    const fixture = createCatalogModelFixture(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id);
    const reference = fixture.model.catalogReference!;
    const portId = fixture.module.inputPorts[0]!.id;
    const evaluate = (input: number) =>
      evaluateBfnModuleModel(
        fixture.project,
        fixture.module,
        fixture.model,
        { [portId]: input },
        'estimate',
      );

    expect(evaluate(0)).toBe(0);
    expect(evaluate(reference.sourceParameters.workingRange.min)).toBeGreaterThanOrEqual(0);
    expect(evaluate(reference.sourceParameters.workingRange.max)).toBeLessThanOrEqual(1);
    for (const invalid of [
      -1,
      reference.sourceParameters.workingRange.min / 2,
      reference.sourceParameters.workingRange.max * 2,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => evaluate(invalid)).toThrowError(BfnCatalogContractError);
      try {
        evaluate(invalid);
      } catch (error) {
        expect(error).toMatchObject({ code: 'catalog_input_out_of_range' });
      }
    }
  });

  it('computes the Shong response as x / (K + x)', () => {
    const fixture = createCatalogModelFixture('resp.shong2013.esar-wt-pesar.3oc6');
    const input = 2.1e-7;
    const result = evaluateBfnModuleModel(fixture.project, fixture.module, fixture.model, {
      [fixture.module.inputPorts[0]!.id]: input,
    });

    expect(result).toBeCloseTo(input / (2.1e-7 + input), 12);
  });
});
