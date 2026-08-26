import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { createDemoBfnProject } from './fixtures';
import { resolveBfnResultSignals } from './resultSignals';
import { runBfnSimulation } from './simulation';

describe('BFN result-owned signal semantics', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('localizes snapshot semantics without exposing internal entity or unit codes', () => {
    const result = runBfnSimulation(createDemoBfnProject());
    const signals = resolveBfnResultSignals(result, i18n.getFixedT('zh-CN'));

    expect(signals).toMatchObject({
      complete: true,
      input: {
        id: 'source-ahl',
        label: '3OC6-HSL 浓度',
        unitLabel: 'nM',
        source: 'snapshot',
      },
      output: {
        id: 'monitor-reporter',
        label: '报告信号',
        unitLabel: '相对值',
        axisLabel: '报告信号 (相对值)',
        source: 'snapshot',
      },
    });
    expect(signals.output.axisLabel).not.toContain('normalized_reporter_expression');
    expect(signals.output.axisLabel).not.toContain('dimensionless');
  });

  it('re-localizes the stable snapshot in English', () => {
    const result = runBfnSimulation(createDemoBfnProject());
    const signals = resolveBfnResultSignals(result, i18n.getFixedT('en-US'));

    expect(signals.input.label).toBe('3OC6-HSL Concentration');
    expect(signals.output.axisLabel).toBe('Reporter signal (Relative value)');
  });

  it('uses only legacy IDs and explicit unknown units when no snapshot exists', () => {
    const result = runBfnSimulation(createDemoBfnProject());
    delete result.signalSnapshot;
    const signals = resolveBfnResultSignals(result, i18n.getFixedT('zh-CN'));

    expect(signals.complete).toBe(false);
    expect(signals.input.axisLabel).toBe('未知输入 · source-ahl (未知单位)');
    expect(signals.output.axisLabel).toBe('未知输出 · monitor-reporter (未知单位)');
    expect(signals.input.semantic).toBeNull();
    expect(signals.output.semantic).toBeNull();
  });
});
