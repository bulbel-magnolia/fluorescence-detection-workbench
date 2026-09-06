import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { createAccumulatorBfnProject, getAccumulatorModule } from '../testing/accumulatorFixtures';
import type { BfnDynamicModel, BfnProject } from '../types';
import type { BfnDynamicGainRequestV1 } from './dynamicGainTypes';
import { assessBfnDynamicGainRequest } from './dynamicGainValidation';

function dynamicProject(): BfnProject {
  const project = createDemoBfnProject();
  project.network.mode = 'dynamic';
  return project;
}

function requestFor(
  project: BfnProject,
  periodHours = 2,
  operatingPoint: BfnDynamicGainRequestV1['operatingPoint'] = project.network.inputSources.map(
    (source) => ({ inputSourceId: source.id, value: 10, unit: source.outputPort.unit }),
  ),
): BfnDynamicGainRequestV1 {
  return {
    contractVersion: '1.0',
    scope: 'network_dynamic_periodic_gain',
    outputMonitorId: project.network.outputMonitors[0]?.id ?? 'missing-monitor',
    operatingPoint,
    perturbation: { periodHours },
  };
}

function firstOrderModel(project: BfnProject): BfnDynamicModel {
  const model = project.network.modules[0]?.modelVariants.find(
    (candidate): candidate is BfnDynamicModel =>
      candidate.mode === 'dynamic' && candidate.family === 'first_order',
  );
  if (!model) throw new Error('Expected a first-order fixture model.');
  return model;
}

function issueCodes(project: BfnProject, request = requestFor(project)): string[] {
  return assessBfnDynamicGainRequest(project, request).issues.map((issue) => issue.code);
}

describe('assessBfnDynamicGainRequest', () => {
  it('requires dynamic mode before considering dormant dynamic models', () => {
    const project = createDemoBfnProject();
    const admission = assessBfnDynamicGainRequest(project, requestFor(project));

    expect(admission).toMatchObject({ status: 'unsupported', target: null });
    expect(issueCodes(project)).toContain('dynamic_mode_required');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid period %s',
    (periodHours) => {
      const project = dynamicProject();
      expect(issueCodes(project, requestFor(project, periodHours))).toContain(
        'perturbation_period_invalid',
      );
    },
  );

  it('admits the target closure in stable source and module order', () => {
    const project = dynamicProject();
    const admission = assessBfnDynamicGainRequest(project, requestFor(project));

    expect(admission.status).toBe('supported');
    expect(
      admission.target?.baselineTarget.inputSources.map((entry) => entry.inputSourceId),
    ).toEqual(['source-ahl']);
    expect(admission.target?.modules.map((entry) => [entry.moduleId, entry.dynamicKind])).toEqual([
      ['module-ahl-sensor', 'first_order'],
      ['module-reporter', 'first_order'],
    ]);
  });

  it('uses exact small positive nominal tau and rejects invalid tau', () => {
    const project = dynamicProject();
    firstOrderModel(project).tau.value = 0.0001;
    expect(
      assessBfnDynamicGainRequest(project, requestFor(project)).target?.modules[0],
    ).toMatchObject({
      dynamicKind: 'first_order',
      dynamicModel: { tauHours: 0.0001 },
    });

    firstOrderModel(project).tau.value = 0;
    expect(issueCodes(project)).toContain('dynamic_model_contract_invalid');
  });

  it('inherits complete exact-unit baseline admission from Batch 13.2', () => {
    const project = dynamicProject();
    expect(issueCodes(project, requestFor(project, 2, []))).toContain(
      'baseline_operating_point_invalid',
    );
    expect(
      issueCodes(
        project,
        requestFor(project, 2, [{ inputSourceId: 'source-ahl', value: 10, unit: 'uM' }]),
      ),
    ).toContain('baseline_operating_point_invalid');
  });

  it('rejects a target Accumulator and ignores an off-target Accumulator', () => {
    const targetProject = createAccumulatorBfnProject();
    expect(issueCodes(targetProject)).toContain('integrator_reference_state_unavailable');
    expect(assessBfnDynamicGainRequest(targetProject, requestFor(targetProject)).target).toBeNull();

    const offTargetProject = dynamicProject();
    offTargetProject.network.modules.push(
      structuredClone(getAccumulatorModule(createAccumulatorBfnProject())),
    );
    expect(assessBfnDynamicGainRequest(offTargetProject, requestFor(offTargetProject)).status).toBe(
      'supported',
    );
  });
});
