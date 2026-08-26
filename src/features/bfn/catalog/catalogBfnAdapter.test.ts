import { describe, expect, it } from 'vitest';
import { getTrustedAhlHslCatalogRelease } from '../../modeling/catalog/v2/catalogReleaseLoader';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { createDemoBfnProject } from '../fixtures';
import { BfnCatalogContractError } from './catalogBfnTypes';
import {
  buildAllBfnCatalogRuntimeCandidates,
  buildBfnCatalogRuntimeCandidate,
  createBfnInputSourceForCatalogResponse,
  instantiateCatalogResponseInBfnProject,
  type CatalogInstantiationOptions,
} from './catalogBfnAdapter';

const SHONG_RESPONSE_ID = 'resp.shong2013.esar-wt-pesar.3oc6';

describe('Catalog to BFN adapter', () => {
  it('builds exactly the 20 trusted receiver candidates from frozen release data', () => {
    const trusted = getTrustedAhlHslCatalogRelease();
    const candidates = buildAllBfnCatalogRuntimeCandidates();

    expect(candidates).toHaveLength(20);
    expect(candidates.map((candidate) => candidate.responseId)).toEqual(
      AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.map((entry) => entry.id),
    );
    expect(trusted.catalog.receiverResponses).toHaveLength(52);
    expect(trusted.catalog.senderOutputs).toHaveLength(0);
    expect(trusted.catalog.effectivePairs).toHaveLength(13);
    expect(
      trusted.catalog.effectivePairs.every(
        (pair) => pair.observed?.decompositionProhibited === true,
      ),
    ).toBe(true);
    expect(trusted.catalog.compatibilityRelations).toHaveLength(39);
    expect(
      trusted.catalog.compatibilityRelations.every(
        (relation) => relation.numericUseAllowed === false,
      ),
    ).toBe(true);
    expect(
      candidates.filter(
        (candidate) =>
          candidate.catalogReference.sourceModelType === 'four_parameter_logistic' &&
          candidate.catalogReference.biologicalDirection === 'activation',
      ),
    ).toHaveLength(19);
    expect(
      candidates.filter(
        (candidate) =>
          candidate.catalogReference.sourceModelType === 'hill_equation_n_fixed_1' &&
          candidate.catalogReference.biologicalDirection === 'derepression',
      ),
    ).toHaveLength(1);
  });

  it('fails closed for non-whitelisted responses and sender component identities', () => {
    const trusted = getTrustedAhlHslCatalogRelease();
    const admittedIds = new Set(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.map((entry) => entry.id));
    const nonWhitelisted = trusted.catalog.receiverResponses.find(
      (response) => !admittedIds.has(response.id),
    );
    const sender = trusted.release.components.find(
      (component) => component.component_type === 'sender',
    );
    if (!nonWhitelisted || !sender) throw new Error('expected frozen Catalog boundary records');

    for (const id of [nonWhitelisted.id, sender.id, 'response.unknown']) {
      expect(() => buildBfnCatalogRuntimeCandidate(id)).toThrowError(BfnCatalogContractError);
      try {
        buildBfnCatalogRuntimeCandidate(id);
      } catch (error) {
        expect(error).toMatchObject({ code: 'catalog_execution_unavailable' });
      }
    }
  });

  it('uses the frozen canonical chemical identity instead of a display label', () => {
    const trusted = getTrustedAhlHslCatalogRelease();
    const responseId = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;
    const candidate = buildBfnCatalogRuntimeCandidate(responseId);
    const canonicalSignal = trusted.release.signals.find(
      (signal) => signal.id === candidate.catalogReference.inputSignalId,
    );
    const adaptedSignal = trusted.catalog.signals.find(
      (signal) => signal.id === candidate.catalogReference.inputSignalId,
    );

    expect(candidate.inputEntity).toBe(canonicalSignal?.canonical_name);
    expect(candidate.inputEntity).not.toBe(adaptedSignal?.label);
    expect(candidate.outputEntity).toBe('normalized_reporter_expression');
  });

  it('maps normalized 4PL parameters without treating source basal and maximum as BFN bounds', () => {
    const candidate = buildAllBfnCatalogRuntimeCandidates().find(
      (entry) =>
        entry.catalogReference.sourceModelType === 'four_parameter_logistic' &&
        entry.catalogReference.sourceParameters.basal !== 0 &&
        entry.catalogReference.sourceParameters.maximum !== 1,
    );
    if (!candidate) throw new Error('expected non-unit 4PL candidate');

    const project = createDemoBfnProject();
    const result = instantiateCatalogResponseInBfnProject(project, candidate, {
      moduleId: 'module-catalog-four-pl',
      modulePosition: { x: 360, y: 220 },
      inputPortId: 'module-catalog-four-pl:input',
      outputPortId: 'module-catalog-four-pl:output',
      modelId: 'module-catalog-four-pl:model:static',
      validityDomainId: 'module-catalog-four-pl:domain:catalog',
      createInputSource: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const model = result.nextProject.network.modules.at(-1)?.modelVariants[0];
    if (!model || model.mode !== 'static' || model.response.family !== 'hill_activation') {
      throw new Error('expected Catalog Hill activation model');
    }

    expect(model.response.ymin).toEqual({ value: 0, unit: 'dimensionless' });
    expect(model.response.ymax).toEqual({ value: 1, unit: 'dimensionless' });
    expect(model.response.k.value).toBe(candidate.catalogReference.sourceParameters.ec50);
    expect(model.response.n.value).toBe(
      candidate.catalogReference.sourceParameters.hillCoefficient,
    );
    expect(model.sourceDatasetIds).toEqual([]);
  });

  it('preserves Shong derepression provenance while using the increasing Hill family', () => {
    const candidate = buildBfnCatalogRuntimeCandidate(SHONG_RESPONSE_ID);
    const project = createDemoBfnProject();
    const result = instantiateCatalogResponseInBfnProject(project, candidate, {
      moduleId: 'module-shong',
      modulePosition: { x: 360, y: 220 },
      createInputSource: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const model = result.nextProject.network.modules.at(-1)?.modelVariants[0];
    if (!model || model.mode !== 'static' || model.response.family !== 'hill_activation') {
      throw new Error('expected Shong Hill activation representation');
    }

    expect(candidate.catalogReference.biologicalDirection).toBe('derepression');
    expect(candidate.catalogReference.sourceModelType).toBe('hill_equation_n_fixed_1');
    expect(model.response.k).toEqual({ value: 2.1e-7, unit: 'M' });
    expect(model.response.n).toEqual({ value: 1, unit: 'dimensionless' });
  });

  it('creates an exact M input source without creating an edge', () => {
    const candidate = buildBfnCatalogRuntimeCandidate(
      AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id,
    );
    const source = createBfnInputSourceForCatalogResponse(candidate, {
      inputSourceId: 'source-catalog',
      outputPortId: 'source-catalog:output',
      position: { x: 40, y: 220 },
    });

    expect(source.outputPort).toEqual({
      id: 'source-catalog:output',
      entity: candidate.inputEntity,
      quantityType: 'concentration',
      unit: 'M',
      direction: 'output',
    });
    expect(source.staticSpecification).toEqual({
      type: 'working_range',
      minimum: candidate.catalogReference.sourceParameters.workingRange.min,
      maximum: candidate.catalogReference.sourceParameters.workingRange.max,
      points: 33,
      unit: 'M',
    });
    expect(source.dynamicSpecification).toEqual({
      type: 'constant',
      value: candidate.catalogReference.sourceParameters.workingRange.min,
      unit: 'M',
    });
    expect('edges' in source).toBe(false);
  });

  const conflictCases: Array<readonly [string, CatalogInstantiationOptions]> = [
    [
      'module_id',
      {
        moduleId: 'module-ahl-sensor',
        modulePosition: { x: 360, y: 220 },
        createInputSource: true,
        inputSourceId: 'source-catalog-conflict',
        inputSourcePosition: { x: 40, y: 220 },
      },
    ],
    [
      'input_source_id',
      {
        moduleId: 'module-catalog-conflict',
        modulePosition: { x: 360, y: 220 },
        createInputSource: true,
        inputSourceId: 'source-ahl',
        inputSourcePosition: { x: 40, y: 220 },
      },
    ],
    [
      'port_id',
      {
        moduleId: 'module-catalog-conflict',
        modulePosition: { x: 360, y: 220 },
        inputPortId: 'source-ahl-out',
        createInputSource: true,
        inputSourceId: 'source-catalog-conflict',
        inputSourcePosition: { x: 40, y: 220 },
      },
    ],
    [
      'validity_domain_id',
      {
        moduleId: 'module-catalog-conflict',
        modulePosition: { x: 360, y: 220 },
        validityDomainId: 'domain-demo-ahl',
        createInputSource: true,
        inputSourceId: 'source-catalog-conflict',
        inputSourcePosition: { x: 40, y: 220 },
      },
    ],
  ];

  it.each(conflictCases)(
    'returns a typed %s conflict without mutating the project',
    (kind, options) => {
      const project = createDemoBfnProject();
      const before = structuredClone(project);
      const candidate = buildBfnCatalogRuntimeCandidate(
        AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id,
      );
      const result = instantiateCatalogResponseInBfnProject(project, candidate, options);

      expect(result).toMatchObject({ ok: false, error: { code: 'catalog_id_conflict', kind } });
      expect(project).toEqual(before);
    },
  );

  it('adds a module and optional source atomically while preserving the existing graph', () => {
    const project = createDemoBfnProject();
    const existing = {
      sources: structuredClone(project.network.inputSources),
      modules: structuredClone(project.network.modules),
      monitors: structuredClone(project.network.outputMonitors),
      edges: structuredClone(project.network.edges),
    };
    const candidate = buildBfnCatalogRuntimeCandidate(
      AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id,
    );
    const result = instantiateCatalogResponseInBfnProject(project, candidate, {
      moduleId: 'module-catalog-atomic',
      modulePosition: { x: 360, y: 220 },
      createInputSource: true,
      inputSourceId: 'source-catalog-atomic',
      inputSourcePosition: { x: 40, y: 220 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.nextProject.network.modules).toHaveLength(existing.modules.length + 1);
    expect(result.nextProject.network.inputSources).toHaveLength(existing.sources.length + 1);
    expect(result.nextProject.network.modules.slice(0, -1)).toEqual(existing.modules);
    expect(result.nextProject.network.inputSources.slice(0, -1)).toEqual(existing.sources);
    expect(result.nextProject.network.outputMonitors).toEqual(existing.monitors);
    expect(result.nextProject.network.edges).toEqual(existing.edges);
    expect(result.addedModuleId).toBe('module-catalog-atomic');
    expect(result.addedInputSourceId).toBe('source-catalog-atomic');
  });

  it('adds a module-only transaction without changing sources, monitors, edges, or mode', () => {
    const project = createDemoBfnProject();
    const before = structuredClone(project);
    const candidate = buildBfnCatalogRuntimeCandidate(
      AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id,
    );
    const result = instantiateCatalogResponseInBfnProject(project, candidate, {
      moduleId: 'module-catalog-only',
      modulePosition: { x: 360, y: 220 },
      createInputSource: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.nextProject.network.modules).toHaveLength(before.network.modules.length + 1);
    expect(result.nextProject.registry.validityDomains).toHaveLength(
      before.registry.validityDomains.length + 1,
    );
    expect(result.nextProject.network.inputSources).toEqual(before.network.inputSources);
    expect(result.nextProject.network.outputMonitors).toEqual(before.network.outputMonitors);
    expect(result.nextProject.network.edges).toEqual(before.network.edges);
    expect(result.nextProject.network.mode).toBe(before.network.mode);
    expect(result.addedInputSourceId).toBeUndefined();
    expect(project).toEqual(before);
  });
});
