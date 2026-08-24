import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';

describe('BFN-IR complete-model simulation', () => {
  it('scans a static working range with uncertainty and an accepted local ANN approximation', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-20T01:00:00.000Z');

    expect(result.mode).toBe('static');
    expect(result.points).toHaveLength(33);
    expect(result.points.at(-1)!.output).toBeGreaterThan(result.points[0]!.output);
    expect(result.points.every((point) => point.lower <= point.output)).toBe(true);
    expect(result.points.every((point) => point.upper >= point.output)).toBe(true);
    expect(result.extrapolated).toBe(false);
    expect(result.annApproximation).toMatchObject({
      status: 'accepted',
      representation: 'ann_affine_approximation',
    });
  });

  it('does not generate ANN weight or bias for a static fixed point', () => {
    const project = createDemoBfnProject();
    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: 10,
      unit: 'nM',
    };

    const result = runBfnSimulation(project);

    expect(result.points).toHaveLength(1);
    expect(result.annApproximation).toBeNull();
  });

  it('rejects an affine approximation when the working range exposes strong nonlinearity', () => {
    const project = createDemoBfnProject();
    project.network.inputSources[0]!.staticSpecification = {
      type: 'working_range',
      minimum: 0,
      maximum: 100,
      points: 61,
      unit: 'nM',
    };

    const result = runBfnSimulation(project);

    expect(result.annApproximation).toMatchObject({
      status: 'rejected',
      representation: 'full_nonlinear_model',
    });
  });

  it('marks results outside the registered validity domain as extrapolated', () => {
    const project = createDemoBfnProject();
    project.network.inputSources[0]!.staticSpecification = {
      type: 'working_range',
      minimum: 80,
      maximum: 140,
      points: 7,
      unit: 'nM',
    };

    const result = runBfnSimulation(project);

    expect(result.extrapolated).toBe(true);
    expect(result.validationIssues.map((issue) => issue.code)).toContain('outside_validity_domain');
    expect(result.points.some((point) => point.extrapolated)).toBe(true);
  });

  it('runs a complete first-order dynamic step response and derives DC metrics', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.analysis.durationHours = 8;
    project.analysis.timeStepHours = 0.05;

    const result = runBfnSimulation(project);

    expect(result.mode).toBe('dynamic');
    expect(result.annApproximation).toBeNull();
    expect(result.points.at(-1)!.output).toBeGreaterThan(result.points[0]!.output);
    expect(result.dynamicMetrics?.steadyValue).toBeCloseTo(result.points.at(-1)!.output, 8);
    expect(result.dynamicMetrics?.riseTimeHours).not.toBeNull();
    expect(result.dynamicMetrics?.dcGain).not.toBeNull();
  });

  it('keeps the exact first-order update bounded under a coarse time step', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.analysis.durationHours = 8;
    project.analysis.timeStepHours = 4;

    const result = runBfnSimulation(project);
    const outputs = result.points.map((point) => point.output);

    expect(outputs[0]).toBeCloseTo(0.01, 8);
    expect(outputs.every((output) => Number.isFinite(output))).toBe(true);
    expect(Math.min(...outputs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...outputs)).toBeLessThanOrEqual(1);
  });

  it('derives frequency gain only for a periodic dynamic input', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.analysis.durationHours = 10;
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'periodic',
      baseline: 20,
      amplitude: 8,
      periodHours: 2,
      phaseRadians: 0,
      unit: 'nM',
    };

    const result = runBfnSimulation(project);

    expect(result.dynamicMetrics?.frequencyGain?.magnitude).toBeGreaterThan(0);
    expect(result.dynamicMetrics?.dcGain).toBeNull();
  });
});
