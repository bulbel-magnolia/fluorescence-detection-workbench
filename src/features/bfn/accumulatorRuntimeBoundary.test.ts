import { describe, expect, it } from 'vitest';
import { evaluateBfnModuleModel } from './catalog/catalogBfnEvaluation';
import { createCatalogModule, createDemoBfnProject } from './fixtures';
import { resolveEffectiveBfnModel } from './modelResolution';
import { runBfnSimulation } from './simulation';
import { assessBfnModelUncertainty } from './simulationUncertainty';
import {
  ACCUMULATOR_INPUT_PORT_ID,
  ACCUMULATOR_MODEL_ID,
  ACCUMULATOR_MODULE_ID,
  createAccumulatorBfnProject,
  getAccumulatorModule,
} from './testing/accumulatorFixtures';
import type { BfnProject, BfnStaticModel } from './types';
import { validateBfnProject } from './validation';

function appendOffTargetAccumulatorBranch(project: BfnProject): void {
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

function createDormantAccumulatorProject(): BfnProject {
  const project = createAccumulatorBfnProject();
  const module = getAccumulatorModule(project);
  const accumulator = module.modelVariants[0]!;
  if (accumulator.mode !== 'dynamic' || accumulator.family !== 'accumulator') {
    throw new Error('Expected accumulator fixture.');
  }
  const staticModel: BfnStaticModel = {
    id: 'model-accumulator-static-test-v1',
    version: accumulator.version,
    mode: 'static',
    family: 'identity',
    response: {
      family: 'identity',
      inputPortId: ACCUMULATOR_INPUT_PORT_ID,
    },
    contextId: accumulator.contextId,
    validityDomainId: accumulator.validityDomainId,
    sourceDatasetIds: [...accumulator.sourceDatasetIds],
    provenanceIds: [...accumulator.provenanceIds],
    evidenceGrade: accumulator.evidenceGrade,
    uncertaintyMethod: 'none',
    isDemo: true,
  };
  project.network.mode = 'static';
  const source = project.network.inputSources[0]!;
  source.outputPort.quantityType = 'concentration';
  source.outputPort.unit = 'nM';
  source.staticSpecification.unit = 'nM';
  source.dynamicSpecification.unit = 'nM';
  module.inputPorts[0]!.quantityType = 'concentration';
  module.inputPorts[0]!.unit = 'nM';
  project.registry.validityDomains[0]!.inputRanges[0]!.unit = 'nM';
  module.modelVariants = [staticModel, accumulator];
  module.activeModelIds = {
    static: staticModel.id,
    dynamic: ACCUMULATOR_MODEL_ID,
  };
  return project;
}

describe('BFN-IR 2.3 accumulator runtime boundary', () => {
  it('admits a valid narrow accumulator into BFN-SIM 2.2 execution', () => {
    const project = createAccumulatorBfnProject();
    const issues = validateBfnProject(project);

    expect(issues.map(({ code }) => code)).not.toContain('dynamic_process_runtime_unsupported');
    expect(issues.map(({ code }) => code)).not.toContain('accumulator_model_contract_invalid');
    const result = runBfnSimulation(project);
    expect(result.engineVersion).toBe('BFN-SIM-2.2');
    expect(result.points.every((point) => Number.isFinite(point.output))).toBe(true);
  });

  it('does not block a selected monitor when the accumulator branch is off-target', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    appendOffTargetAccumulatorBranch(project);
    const selectedMonitorId = project.network.outputMonitors[0]!.id;

    expect(
      validateBfnProject(project, { targetMonitorId: selectedMonitorId }).map(({ code }) => code),
    ).not.toContain('accumulator_model_contract_invalid');
    expect(validateBfnProject(project).map(({ code }) => code)).not.toContain(
      'dynamic_process_runtime_unsupported',
    );
    const result = runBfnSimulation(project);

    expect(result.engineVersion).toBe('BFN-SIM-2.2');
    expect(result.points.every((point) => !(ACCUMULATOR_MODULE_ID in point.moduleOutputs))).toBe(
      true,
    );
  });

  it('keeps an off-target existing first-order module in the frozen numerical scope', () => {
    const project = createDemoBfnProject();
    const offTargetModule = createCatalogModule('ahl-sensor', 'off-target-existing');
    project.network.mode = 'dynamic';
    project.network.modules.push(offTargetModule);

    const result = runBfnSimulation(project);

    expect(result.engineVersion).toBe('BFN-SIM-2.2');
    expect(result.points.every((point) => Number.isFinite(point.output))).toBe(true);
    expect(
      result.points.every((point) => {
        const output = point.moduleOutputs[offTargetModule.id];
        return output !== undefined && Number.isFinite(output);
      }),
    ).toBe(true);
  });

  it('keeps a paired accumulator dormant when the static model is effective', () => {
    const project = createDormantAccumulatorProject();
    const module = getAccumulatorModule(project);

    expect(resolveEffectiveBfnModel(project, module)).toMatchObject({
      mode: 'static',
      family: 'identity',
    });
    expect(validateBfnProject(project).map(({ code }) => code)).not.toContain(
      'dynamic_process_runtime_unsupported',
    );
    expect(runBfnSimulation(project).engineVersion).toBe('BFN-SIM-2.2');
  });

  it('uses the existing temporal hard stop for dynamic-only modules in a static network', () => {
    const project = createAccumulatorBfnProject();
    project.network.mode = 'static';
    const codes = validateBfnProject(project).map(({ code }) => code);

    expect(codes).toContain('temporal_execution_unsupported');
    expect(codes).not.toContain('dynamic_process_runtime_unsupported');
    expect(() => runBfnSimulation(project)).toThrow(
      /BFN_VALIDATION_FAILED:.*temporal_execution_unsupported/u,
    );
  });

  it('fails closed when an accumulator is assessed or evaluated in isolation', () => {
    const project = createAccumulatorBfnProject();
    const module = getAccumulatorModule(project);
    const model = module.modelVariants[0]!;

    expect(assessBfnModelUncertainty(model)).toEqual({
      method: 'not_recorded',
      intervalExecutable: true,
      reason: null,
      propagationMode: 'deterministic_transform',
    });
    expect(() =>
      evaluateBfnModuleModel(project, module, model, {
        [ACCUMULATOR_INPUT_PORT_ID]: 1,
      }),
    ).toThrow('BFN_DYNAMIC_PROCESS_RUNTIME_UNSUPPORTED');
  });
});
