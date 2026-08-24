import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { createTemplate } from './modelingCore';
import {
  createModelNodeNameCounters,
  localizeSystemModel,
  nextModelNodeName,
} from './modelingLocalization';
import type { TemplateLabels } from './types';

const legacyEnglishLabels: TemplateLabels = {
  modelName: 'Licorice multi-index network',
  description:
    'Three normalized illustrative inputs demonstrate multi-index integration, response propagation, and reporting.',
  nodes: {
    sensorA: 'Saponin example input',
    sensorB: 'Flavonoid example input',
    sensorC: 'Phenolic example input',
    integration: 'Signal integration',
    gate: 'Logic gate',
    memory: 'New memory node',
    response: 'New response node',
    reporter: 'New reporter node',
  },
};

describe('modeling localization', () => {
  it('updates legacy generated names when the interface language changes', () => {
    const model = createTemplate('licorice-quality', legacyEnglishLabels);
    const localized = localizeSystemModel(model, i18n.getFixedT('zh-CN'));

    expect(localized.name).toBe('甘草多指标响应网络');
    expect(localized.nodes.find((node) => node.id === 'sensor-a')?.name).toBe('皂苷相关输入');
    expect(localized.nodes.find((node) => node.id === 'reporter')?.name).toBe('新输出节点');
  });

  it('preserves names written by the user', () => {
    const model = createTemplate('licorice-quality', legacyEnglishLabels);
    model.name = '评审展示方案';
    const firstNode = model.nodes[0];
    if (!firstNode) throw new Error('Expected a template sensor node');
    model.nodes[0] = { ...firstNode, name: '样品一号输入' };

    const localized = localizeSystemModel(model, i18n.getFixedT('zh-CN'));

    expect(localized.name).toBe('评审展示方案');
    expect(localized.nodes[0]?.name).toBe('样品一号输入');
  });

  it('supports switching generated names back to English', () => {
    const model = createTemplate('licorice-quality', legacyEnglishLabels);
    const chinese = localizeSystemModel(model, i18n.getFixedT('zh-CN'));
    const english = localizeSystemModel(chinese, i18n.getFixedT('en-US'));

    expect(english.name).toBe('Licorice multi-index response network');
    expect(english.nodes.find((node) => node.id === 'sensor-a')?.name).toBe(
      'Saponin-related input',
    );
    expect(english.nodes.find((node) => node.id === 'reporter')?.name).toBe('New output node');
  });

  it('numbers manual nodes per kind without reusing deleted numbers', () => {
    const counters = createModelNodeNameCounters({ nodes: [] }, i18n.getFixedT('en-US'));
    const firstInput = nextModelNodeName('input', i18n.getFixedT('en-US'), counters);
    const firstProcessing = nextModelNodeName(
      'processing',
      i18n.getFixedT('en-US'),
      counters,
    );
    const secondInput = nextModelNodeName('input', i18n.getFixedT('en-US'), counters);

    expect(firstInput).toMatch(/Input 1/u);
    expect(firstProcessing).toMatch(/Processing 1/u);
    expect(secondInput).toMatch(/Input 2/u);
    expect(nextModelNodeName('input', i18n.getFixedT('en-US'), counters)).toMatch(/Input 3/u);
  });

  it('localizes generated numbered names while preserving custom names', () => {
    const model = createTemplate('signal-gate', legacyEnglishLabels);
    model.nodes = [
      ...model.nodes,
      { ...model.nodes[0]!, id: 'manual-input', name: 'Input 2' },
      { ...model.nodes[1]!, id: 'custom-input', name: 'My assay input' },
    ];
    const localized = localizeSystemModel(model, i18n.getFixedT('zh-CN'));

    expect(localized.nodes.find((node) => node.id === 'manual-input')?.name).toContain('2');
    expect(localized.nodes.find((node) => node.id === 'custom-input')?.name).toBe('My assay input');
  });
});
