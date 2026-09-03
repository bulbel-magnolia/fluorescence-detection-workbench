import { describe, expect, it } from 'vitest';
import { buildAllBfnCatalogRuntimeCandidates } from '../catalog/catalogBfnAdapter';
import { instantiateCatalogResponseInBfnProject } from '../catalog/catalogBfnAdapter';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import { BFN_MODULE_LIBRARY_DATABASE_VERSION } from '../module-library/moduleLibraryTypes';
import { BFN_MODULE_TEMPLATE_SCHEMA_VERSION } from '../module-library/template/templateTypes';
import { runBfnSimulation } from '../simulation';
import { ACCUMULATOR_MODULE_ID, createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import type {
  BfnFunctionalModule,
  BfnProject,
  BfnStaticModel,
  BfnStaticResponse,
  BfnUnit,
} from '../types';
import { BFN_WORKSPACE_DATABASE_VERSION } from '../workspace/workspaceTypes';
import { BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1 } from './interpretationContract';
import type { BfnDerivedGainUnit, BfnLocalInfluenceRequestV1 } from './interpretationTypes';
import { assessBfnLocalInfluenceRequest } from './interpretationValidation';

function activeStaticModel(module: BfnFunctionalModule): BfnStaticModel {
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.id === module.activeModelIds.static && candidate.mode === 'static',
  );
  if (!model) throw new Error('Expected active static model.');
  return model;
}

function requestFor(
  module: BfnFunctionalModule,
  operatingPoint = module.inputPorts.map((port) => ({
    portId: port.id,
    value: 0.5,
    unit: port.unit,
  })),
): BfnLocalInfluenceRequestV1 {
  return {
    contractVersion: '1.0',
    scope: 'module_static_response',
    moduleId: module.id,
    outputPortId: module.outputPorts[0]!.id,
    operatingPoint,
  };
}

function singleInputFixture(value = 10): {
  project: BfnProject;
  module: BfnFunctionalModule;
  request: BfnLocalInfluenceRequestV1;
} {
  const project = createDemoBfnProject();
  const module = project.network.modules[0]!;
  return {
    project,
    module,
    request: requestFor(module, [
      { portId: module.inputPorts[0]!.id, value, unit: module.inputPorts[0]!.unit },
    ]),
  };
}

function multiInputFixture(): {
  project: BfnProject;
  module: BfnFunctionalModule;
  request: BfnLocalInfluenceRequestV1;
} {
  const project = createDemoBfnProject();
  const module = createCatalogModule('dual-input-gate', 'interpretation');
  const model = activeStaticModel(module);
  project.network.modules = [module];
  project.registry.validityDomains = [
    {
      id: model.validityDomainId,
      labelKey: 'bfn.domains.interpretationTest',
      inputRanges: module.inputPorts.map((port) => ({
        portId: port.id,
        minimum: 0,
        maximum: 1,
        unit: port.unit,
      })),
      contextId: model.contextId,
    },
  ];
  return { project, module, request: requestFor(module) };
}

function issueCodes(assessment: ReturnType<typeof assessBfnLocalInfluenceRequest>): string[] {
  return assessment.issues.map((issue) => issue.code);
}

function useSingleStaticResponse(
  project: BfnProject,
  module: BfnFunctionalModule,
  response: BfnStaticResponse,
): void {
  const model = activeStaticModel(module);
  model.family = response.family;
  model.response = response;
  module.modelVariants = [model];
  module.activeModelIds = { static: model.id };
  project.network.mode = 'static';
}

describe('BFN-INTERPRETATION 1.0 local influence admission', () => {
  it('admits a complete single-input active static request', () => {
    const { project, module, request } = singleInputFixture();

    const assessment = assessBfnLocalInfluenceRequest(project, request);

    expect(assessment.status).toBe('supported');
    expect(assessment.applicability).toBe('within_recorded_domain');
    expect(assessment.target).toMatchObject({
      moduleId: module.id,
      staticModelId: module.activeModelIds.static,
      responseFamily: 'hill_activation',
      outputPortId: module.outputPorts[0]!.id,
      interpretationSource: 'active_bfn_static_response',
      parameterBasis: 'nominal',
    });
  });

  it('admits every independently identified input of a multi-input response', () => {
    const { project, module, request } = multiInputFixture();

    const assessment = assessBfnLocalInfluenceRequest(project, request);

    expect(assessment.status).toBe('supported');
    expect(assessment.target?.inputPorts.map((port) => port.portId)).toEqual(
      module.inputPorts.map((port) => port.id),
    );
  });

  it('rejects a missing required input', () => {
    const { project, request } = multiInputFixture();
    const incomplete = { ...request, operatingPoint: request.operatingPoint.slice(0, 1) };

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, incomplete))).toContain(
      'input_value_missing',
    );
  });

  it('rejects a duplicate operating-point input', () => {
    const { project, request } = singleInputFixture();
    const duplicate = {
      ...request,
      operatingPoint: [request.operatingPoint[0]!, request.operatingPoint[0]!],
    };

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, duplicate))).toContain(
      'input_value_duplicate',
    );
  });

  it('rejects a known module input that the active response does not use', () => {
    const { project, module, request } = singleInputFixture();
    module.inputPorts.push({
      id: 'unused-valid-input',
      entity: 'unused-entity',
      quantityType: 'concentration',
      unit: 'nM',
      direction: 'input',
    });
    const unexpected = {
      ...request,
      operatingPoint: [
        ...request.operatingPoint,
        { portId: 'unused-valid-input', value: 1, unit: 'nM' as const },
      ],
    };

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, unexpected))).toContain(
      'unexpected_input',
    );
  });

  it('rejects an output port masquerading as an analysis input', () => {
    const { project, module, request } = singleInputFixture();
    const invalid = {
      ...request,
      operatingPoint: [
        ...request.operatingPoint,
        { portId: module.outputPorts[0]!.id, value: 1, unit: module.outputPorts[0]!.unit },
      ],
    };

    const assessment = assessBfnLocalInfluenceRequest(project, invalid);
    expect(assessment.issues).toContainEqual(
      expect.objectContaining({
        code: 'input_port_invalid',
        subjectId: module.outputPorts[0]!.id,
        details: { reason: 'output_port' },
      }),
    );
  });

  it('rejects an unknown port identifier', () => {
    const { project, request } = singleInputFixture();
    const invalid = {
      ...request,
      operatingPoint: [{ portId: 'unknown-port', value: 10, unit: 'nM' as const }],
    };

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, invalid))).toEqual(
      expect.arrayContaining(['input_port_invalid', 'input_value_missing']),
    );
  });

  it('requires the exact input-port unit instead of display-name or compatible-unit matching', () => {
    const { project, request } = singleInputFixture();
    const wrongUnit = {
      ...request,
      operatingPoint: [{ ...request.operatingPoint[0]!, unit: 'uM' as const }],
    };

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, wrongUnit))).toContain(
      'unit_mismatch',
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite operating value %s',
    (value) => {
      const { project, request } = singleInputFixture();
      const invalid = {
        ...request,
        operatingPoint: [{ ...request.operatingPoint[0]!, value }],
      };

      expect(issueCodes(assessBfnLocalInfluenceRequest(project, invalid))).toContain(
        'value_non_finite',
      );
    },
  );

  it('rejects a negative value under the existing scientific input constraint', () => {
    const { project, request } = singleInputFixture();
    const invalid = {
      ...request,
      operatingPoint: [{ ...request.operatingPoint[0]!, value: -Number.EPSILON }],
    };

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, invalid))).toContain(
      'value_negative',
    );
  });

  it.each([0.1, 100])('admits exact closed ValidityDomain boundary %s', (value) => {
    const { project, request } = singleInputFixture(value);

    expect(assessBfnLocalInfluenceRequest(project, request)).toMatchObject({
      status: 'supported',
      applicability: 'within_recorded_domain',
    });
  });

  it.each([0.099, 100.001])(
    'blocks an operating point outside the recorded domain at %s',
    (value) => {
      const { project, request } = singleInputFixture(value);
      const assessment = assessBfnLocalInfluenceRequest(project, request);

      expect(assessment).toMatchObject({
        status: 'unsupported',
        applicability: 'outside_recorded_domain',
      });
      expect(issueCodes(assessment)).toContain('outside_validity_domain');
    },
  );

  it('preserves applicability_not_recorded without silently claiming an unbounded domain', () => {
    const { project, request } = singleInputFixture();
    project.registry.validityDomains[0]!.inputRanges = [];

    const assessment = assessBfnLocalInfluenceRequest(project, request);

    expect(assessment).toMatchObject({
      status: 'supported',
      applicability: 'applicability_not_recorded',
    });
    expect(assessment.issues).toContainEqual(
      expect.objectContaining({ code: 'applicability_not_recorded', severity: 'warning' }),
    );
  });

  it('resolves the exact active static model deterministically when dormant variants exist', () => {
    const { project, module, request } = singleInputFixture();
    const active = activeStaticModel(module);
    module.modelVariants.unshift({ ...structuredClone(active), id: 'dormant-static-model' });

    const assessment = assessBfnLocalInfluenceRequest(project, request);

    expect(assessment.target?.staticModelId).toBe(active.id);
  });

  it('fails closed when a module identity is not unique', () => {
    const { project, module, request } = singleInputFixture();
    project.network.modules.push(structuredClone(module));

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, request))).toContain(
      'module_identity_conflict',
    );
  });

  it('reports a missing target module without throwing', () => {
    const { project, request } = singleInputFixture();
    const missing = { ...request, moduleId: 'missing-module' };

    expect(assessBfnLocalInfluenceRequest(project, missing)).toMatchObject({
      status: 'unsupported',
      issues: [expect.objectContaining({ code: 'module_not_found' })],
    });
  });

  it('classifies a paired first-order module as steady-state static interpretation', () => {
    const { project, request } = singleInputFixture();
    project.network.mode = 'dynamic';

    const assessment = assessBfnLocalInfluenceRequest(project, request);

    expect(assessment.target?.interpretationBasis).toBe('first_order_steady_state_static_response');
    expect(assessment.target).not.toHaveProperty('dynamicGain');
    expect(assessment.target).not.toHaveProperty('frequencyGain');
  });

  it('fails closed when a first-order steady-state response diverges from its active static pair', () => {
    const { project, module, request } = singleInputFixture();
    const dynamic = module.modelVariants.find(
      (model): model is Extract<typeof model, { mode: 'dynamic'; family: 'first_order' }> =>
        model.mode === 'dynamic' && model.family === 'first_order',
    )!;
    dynamic.initialState += 0;
    dynamic.steadyStateResponse = {
      ...dynamic.steadyStateResponse,
      family: 'identity',
      inputPortId: module.inputPorts[0]!.id,
    };

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, request))).toContain(
      'model_contract_invalid',
    );
  });

  it('rejects an accumulator from the static local interpretation contract', () => {
    const project = createAccumulatorBfnProject();
    const module = project.network.modules.find(
      (candidate) => candidate.id === ACCUMULATOR_MODULE_ID,
    )!;
    const request: BfnLocalInfluenceRequestV1 = {
      contractVersion: '1.0',
      scope: 'module_static_response',
      moduleId: module.id,
      outputPortId: module.outputPorts[0]!.id,
      operatingPoint: [
        { portId: module.inputPorts[0]!.id, value: 1, unit: module.inputPorts[0]!.unit },
      ],
    };

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, request))).toContain(
      'static_interpretation_unsupported',
    );
  });

  it('uses the materialized active BFN static response as the catalog interpretation source', () => {
    const candidate = buildAllBfnCatalogRuntimeCandidates()[0]!;
    const instantiated = instantiateCatalogResponseInBfnProject(createDemoBfnProject(), candidate, {
      moduleId: 'catalog-interpretation-module',
      modulePosition: { x: 0, y: 0 },
      createInputSource: false,
    });
    if (!instantiated.ok) throw new Error('Expected catalog instantiation.');
    const module = instantiated.nextProject.network.modules.find(
      (item) => item.id === instantiated.addedModuleId,
    )!;
    const range = candidate.catalogReference.sourceParameters.workingRange;
    const request = requestFor(module, [
      {
        portId: module.inputPorts[0]!.id,
        value: (range.min + range.max) / 2,
        unit: 'M',
      },
    ]);

    const assessment = assessBfnLocalInfluenceRequest(instantiated.nextProject, request);

    expect(assessment.status).toBe('supported');
    expect(assessment.target).toMatchObject({
      staticModelId: module.activeModelIds.static,
      responseFamily: activeStaticModel(module).response.family,
      interpretationSource: 'active_bfn_static_response',
      contextReference: { kind: 'catalog_parameter_context' },
    });
    expect(assessment.target?.evidence.catalogReference?.responseId).toBe(candidate.responseId);
  });

  it('inherits only the active model evidence, provenance, uncertainty, context, and version', () => {
    const { project, module, request } = singleInputFixture();
    const model = activeStaticModel(module);
    project.registry.provenanceRecords.push({
      id: 'model-provenance',
      kind: 'publication',
      reference: 'Model evidence',
    });
    model.provenanceIds = ['model-provenance'];

    const target = assessBfnLocalInfluenceRequest(project, request).target!;

    expect(target.staticModelVersion).toBe(model.version);
    expect(target.evidence).toMatchObject({
      evidenceGrade: model.evidenceGrade,
      uncertaintyMethod: model.uncertaintyMethod,
      provenanceIds: ['model-provenance'],
    });
    expect(target.contextReference).toEqual({
      kind: 'project_context',
      contextId: model.contextId,
    });
    expect(target.validityDomainId).toBe(model.validityDomainId);
  });

  it('does not treat implementation-only provenance as active-model evidence', () => {
    const { project, module, request } = singleInputFixture();
    project.registry.provenanceRecords.push({
      id: 'implementation-provenance',
      kind: 'repository_record',
      reference: 'Implementation evidence',
    });
    project.registry.implementations[0]!.provenanceIds = ['implementation-provenance'];

    const target = assessBfnLocalInfluenceRequest(project, request).target!;

    expect(target.evidence.provenanceIds).toEqual([]);
    expect(target.evidence.provenanceIds).not.toContain('implementation-provenance');
    expect(module.implementationIds.length).toBeGreaterThan(0);
  });

  it('does not mutate the Project or request', () => {
    const { project, request } = singleInputFixture();
    const projectBefore = structuredClone(project);
    const requestBefore = structuredClone(request);

    assessBfnLocalInfluenceRequest(project, request);

    expect(project).toEqual(projectBefore);
    expect(request).toEqual(requestBefore);
  });

  it('rejects a different analysis scope or contract version', () => {
    const { project, request } = singleInputFixture();
    const invalid = {
      ...request,
      contractVersion: '2.0',
      scope: 'network_propagation',
    } as unknown as BfnLocalInfluenceRequestV1;

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, invalid))).toContain(
      'request_contract_invalid',
    );
  });

  it('rejects an output target that is not an exact module output port', () => {
    const { project, request } = singleInputFixture();
    const invalid = { ...request, outputPortId: 'missing-output' };

    expect(issueCodes(assessBfnLocalInfluenceRequest(project, invalid))).toContain(
      'output_port_invalid',
    );
  });
});

describe('BFN-INTERPRETATION 1.0 static-family and scientific definitions', () => {
  it('admits hill_repression without changing the production equation', () => {
    const { project, module, request } = singleInputFixture();
    const response = structuredClone(activeStaticModel(module).response);
    if (response.family !== 'hill_activation') throw new Error('Expected Hill fixture.');
    useSingleStaticResponse(project, module, { ...response, family: 'hill_repression' });

    expect(assessBfnLocalInfluenceRequest(project, request).target?.responseFamily).toBe(
      'hill_repression',
    );
  });

  it('admits linear_transfer', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[1]!;
    module.modelVariants = module.modelVariants.filter((model) => model.mode === 'static');
    module.activeModelIds = { static: module.modelVariants[0]!.id };
    const request = requestFor(module, [
      { portId: module.inputPorts[0]!.id, value: 0.5, unit: 'dimensionless' },
    ]);

    expect(assessBfnLocalInfluenceRequest(project, request).target?.responseFamily).toBe(
      'linear_transfer',
    );
  });

  it('rejects a same-unit identity between different entities and quantities', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[1]!;
    useSingleStaticResponse(project, module, {
      family: 'identity',
      inputPortId: module.inputPorts[0]!.id,
    });
    const request = requestFor(module, [
      { portId: module.inputPorts[0]!.id, value: 0.5, unit: 'dimensionless' },
    ]);

    expect(assessBfnLocalInfluenceRequest(project, request)).toMatchObject({
      status: 'unsupported',
      issues: [
        expect.objectContaining({
          code: 'model_contract_invalid',
          details: { reason: 'identity_contract_invalid' },
        }),
      ],
    });
  });

  it('admits identity only when Entity, quantity type, and unit are all equal', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[1]!;
    const input = module.inputPorts[0]!;
    const output = module.outputPorts[0]!;
    output.entity = input.entity;
    output.quantityType = input.quantityType;
    output.unit = input.unit;
    useSingleStaticResponse(project, module, {
      family: 'identity',
      inputPortId: input.id,
    });

    expect(
      assessBfnLocalInfluenceRequest(
        project,
        requestFor(module, [{ portId: input.id, value: 0.5, unit: input.unit }]),
      ).target?.responseFamily,
    ).toBe('identity');
  });

  it.each([0, 1])(
    'rejects output selection %s when a static response has two same-unit outputs',
    (outputIndex) => {
      const { project, module } = singleInputFixture();
      module.outputPorts.push({
        ...structuredClone(module.outputPorts[0]!),
        id: 'secondary-output',
      });
      const request = {
        ...requestFor(module),
        outputPortId: module.outputPorts[outputIndex]!.id,
      };

      expect(assessBfnLocalInfluenceRequest(project, request)).toMatchObject({
        status: 'unsupported',
        issues: [
          expect.objectContaining({
            code: 'model_contract_invalid',
            details: { reason: 'static_output_arity_invalid' },
          }),
        ],
      });
    },
  );

  it('preserves supported behavior for an exactly-one-output static module', () => {
    const { project, module, request } = singleInputFixture();

    expect(module.outputPorts).toHaveLength(1);
    expect(assessBfnLocalInfluenceRequest(project, request)).toMatchObject({
      status: 'supported',
      target: { outputPortId: module.outputPorts[0]!.id },
    });
  });

  it('keeps Ideal Edge as identity topology without weight, gain, bias, or sensitivity fields', () => {
    const project = createDemoBfnProject();

    for (const edge of project.network.edges) {
      expect(edge.mapping).toBe('identity');
      expect(edge).not.toHaveProperty('weight');
      expect(edge).not.toHaveProperty('gain');
      expect(edge).not.toHaveProperty('bias');
      expect(edge).not.toHaveProperty('sensitivity');
    }
    expect(BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1.edge).toEqual({
      role: 'instantaneous_lossless_identity_topology',
      derivedWeightStorage: 'forbidden',
    });
  });

  it('keeps frozen schema, engine, Workspace, Template, and Module Library versions unchanged', () => {
    const project = createDemoBfnProject();

    expect(project.schemaVersion).toBe('2.3');
    expect(runBfnSimulation(project, '2026-09-03T00:00:00.000Z').engineVersion).toBe('BFN-SIM-2.2');
    expect(BFN_WORKSPACE_DATABASE_VERSION).toBe(1);
    expect(BFN_MODULE_LIBRARY_DATABASE_VERSION).toBe(1);
    expect(BFN_MODULE_TEMPLATE_SCHEMA_VERSION).toBe('1.0');
  });

  it('does not use or modify range-fitted ANN acceptance thresholds', () => {
    const { project, request } = singleInputFixture();
    const thresholds = structuredClone(project.analysis.annThresholds);

    const baseline = assessBfnLocalInfluenceRequest(project, request);
    project.analysis.annThresholds = { minimumR2: Number.POSITIVE_INFINITY, maximumNrmse: -1 };
    const changedThresholds = assessBfnLocalInfluenceRequest(project, request);

    expect(baseline.status).toBe('supported');
    expect(changedThresholds.status).toBe('supported');
    project.analysis.annThresholds = thresholds;
    expect(project.analysis.annThresholds).toEqual(thresholds);
    expect(
      BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1.localAnnApproximation
        .rangeFittedApproximationThresholds,
    ).toBe('outside_this_contract');
  });

  it('defines each local ANN weight as the local differential gain at the same point', () => {
    expect(BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1.localAnnApproximation.weight).toBe(
      'local_differential_gain_at_same_operating_point',
    );
  });

  it('defines local ANN bias as y0 minus weighted operating inputs with output-unit semantics', () => {
    expect(BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1.localAnnApproximation).toMatchObject({
      bias: 'output_at_operating_point_minus_sum_of_weight_times_input_operating_values',
      biasUnit: 'output_unit',
    });
  });

  it('does not relabel basal, leak, background, or initial state as ANN bias', () => {
    expect(
      BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1.localAnnApproximation.excludedBiologicalQuantities,
    ).toEqual(
      expect.arrayContaining([
        'basal_expression',
        'leak',
        'environmental_background',
        'initial_state',
      ]),
    );
  });

  it('represents gain as an output/input unit pair and elasticity as dimensionless', () => {
    const gainUnit = {
      outputUnit: 'nM/h',
      inputUnit: 'uM',
    } satisfies BfnDerivedGainUnit;
    const ordinaryUnits: readonly BfnUnit[] = ['nM/h', 'uM'];

    expect(gainUnit).toEqual({ outputUnit: ordinaryUnits[0], inputUnit: ordinaryUnits[1] });
    expect(BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1.localDifferentialGain.unitRepresentation).toBe(
      'output_unit_input_unit_pair',
    );
    expect(BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1.logElasticity.unit).toBe('dimensionless');
  });

  it('keeps network composition and dynamic gain in future batches', () => {
    expect(BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1.networkComposition.status).toBe(
      'future_batch_13_2',
    );
    expect(BFN_INTERPRETATION_SCIENTIFIC_CONTRACT_V1.dynamicAnalysis.status).toBe(
      'future_batch_13_4',
    );
  });
});
