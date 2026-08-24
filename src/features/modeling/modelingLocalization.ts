import type { TFunction } from 'i18next';
import type { ModelNode, ModelNodeKind, ModelTemplateId, ModelingRun, NetworkModel } from './types';

const legacyGeneratedCopy: Record<string, readonly string[]> = {
  'modeling.defaultNodeName.input': [
    '新输入节点',
    'New input node',
    '新传感节点',
    'New sensor node',
  ],
  'modeling.defaultNodeName.processing': [
    '新处理节点',
    'New processing node',
    'New process node',
    '新响应节点',
    'New response node',
  ],
  'modeling.defaultNodeName.output': [
    '新输出节点',
    'New output node',
    '新报告节点',
    'New reporter node',
  ],
  'modeling.defaultNodeName.sensor': [
    '新传感节点',
    'New sensor node',
    '新输入节点',
    'New input node',
  ],
  'modeling.defaultNodeName.signal': [
    '新处理节点',
    'New process node',
    '新处理模块',
    'New processing node',
  ],
  'modeling.defaultNodeName.response': ['新响应节点', 'New response node'],
  'modeling.defaultNodeName.memory': ['新记忆节点', 'New memory node'],
  'modeling.defaultNodeName.reporter': [
    '新报告节点',
    'New reporter node',
    '新输出节点',
    'New output node',
  ],
  'modeling.defaultNodeName.integration': ['信号整合', 'Signal integration'],
  'modeling.defaultNodeName.gate': ['逻辑门', 'Logic gate'],
  'modeling.templates.licorice-quality.name': [
    '甘草多指标整合网络',
    'Licorice multi-index network',
  ],
  'modeling.templates.licorice-quality.description': [
    '以三个归一化示意输入演示多指标汇聚、响应传递和报告输出。',
    'Three normalized illustrative inputs demonstrate multi-index integration, response propagation, and reporting.',
  ],
  'modeling.templates.licorice-quality.sensorA': ['皂苷示意输入', 'Saponin example input'],
  'modeling.templates.licorice-quality.sensorB': ['黄酮示意输入', 'Flavonoid example input'],
  'modeling.templates.licorice-quality.sensorC': ['酚类示意输入', 'Phenolic example input'],
  'modeling.templates.signal-gate.name': ['双输入信号门', 'Dual-input signal gate'],
  'modeling.templates.signal-gate.description': [
    '演示两个归一化传感输入经过非线性门控后产生报告响应。',
    'Two normalized sensor inputs pass through nonlinear gating to produce a reporter response.',
  ],
  'modeling.templates.signal-gate.sensorA': ['输入 A', 'Input A'],
  'modeling.templates.signal-gate.sensorB': ['输入 B', 'Input B'],
  'modeling.templates.signal-gate.sensorC': ['备用输入', 'Spare input'],
  'modeling.templates.feedback-loop.name': ['带记忆反馈回路', 'Memory feedback loop'],
  'modeling.templates.feedback-loop.description': [
    '演示信号整合、状态记忆和弱正反馈形成的动态响应。',
    'Signal integration, state memory, and weak positive feedback form a dynamic response.',
  ],
  'modeling.templates.feedback-loop.sensorA': ['刺激输入', 'Stimulus input'],
  'modeling.templates.feedback-loop.sensorB': ['备用输入 B', 'Spare input B'],
  'modeling.templates.feedback-loop.sensorC': ['备用输入 C', 'Spare input C'],
};

function generatedValues(key: string, t: TFunction): Set<string> {
  return new Set([
    t(key, { lng: 'zh-CN' }),
    t(key, { lng: 'en-US' }),
    ...(legacyGeneratedCopy[key] ?? []),
  ]);
}

function localizeGeneratedValue(value: string, key: string, t: TFunction): string {
  return generatedValues(key, t).has(value) ? t(key) : value;
}

function templateKey(templateId: ModelTemplateId, field: string): string {
  return `modeling.templates.${templateId}.${field}`;
}

const defaultNodeKeys: Record<ModelNodeKind, string> = {
  input: 'modeling.defaultNodeName.input',
  processing: 'modeling.defaultNodeName.processing',
  output: 'modeling.defaultNodeName.output',
};

export type ModelNodeNameCounters = Record<ModelNodeKind, number>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function generatedNumberedNodeName(value: string, kind: ModelNodeKind, t: TFunction): number | null {
  const labels = new Set([
    t(`modeling.nodeKinds.${kind}`, { lng: 'zh-CN' }),
    t(`modeling.nodeKinds.${kind}`, { lng: 'en-US' }),
  ]);
  for (const label of labels) {
    if (!label || label.startsWith('modeling.')) continue;
    const match = value.match(new RegExp(`^${escapeRegExp(label)}\\s+(\\d+)$`, 'u'));
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

/** Generated names use a type-scoped monotonic counter owned by the page. */
export function nextModelNodeName(
  kind: ModelNodeKind,
  t: TFunction,
  counters: ModelNodeNameCounters,
): string {
  const next = Math.max(1, Math.floor(counters[kind] || 1));
  counters[kind] = next + 1;
  const label = t(`modeling.nodeKinds.${kind}`);
  return `${label} ${next}`;
}

export function createModelNodeNameCounters(
  model: Pick<NetworkModel, 'nodes'>,
  t: TFunction,
): ModelNodeNameCounters {
  const counters: ModelNodeNameCounters = { input: 1, processing: 1, output: 1 };
  for (const node of model.nodes) {
    const number = generatedNumberedNodeName(node.name, node.kind, t);
    if (number !== null) counters[node.kind] = Math.max(counters[node.kind], number + 1);
  }
  return counters;
}

function localizeNumberedNodeName(value: string, kind: ModelNodeKind, t: TFunction): string {
  const number = generatedNumberedNodeName(value, kind, t);
  return number === null ? value : `${t(`modeling.nodeKinds.${kind}`)} ${number}`;
}

function nodeKey(node: ModelNode, templateId: ModelTemplateId): string {
  const fixedNodeKeys: Record<string, string> = {
    'sensor-a': templateKey(templateId, 'sensorA'),
    'sensor-b': templateKey(templateId, 'sensorB'),
    'sensor-c': templateKey(templateId, 'sensorC'),
    integration: 'modeling.defaultNodeName.integration',
    gate: 'modeling.defaultNodeName.gate',
    memory: 'modeling.defaultNodeName.memory',
    response: 'modeling.defaultNodeName.response',
    reporter: 'modeling.defaultNodeName.reporter',
  };
  return fixedNodeKeys[node.id] ?? defaultNodeKeys[node.kind];
}

export function localizeSystemModel(model: NetworkModel, t: TFunction): NetworkModel {
  const name = localizeGeneratedValue(model.name, templateKey(model.templateId, 'name'), t);
  const description = localizeGeneratedValue(
    model.description,
    templateKey(model.templateId, 'description'),
    t,
  );
  let nodesChanged = false;
  const nodes = model.nodes.map((node) => {
    const localizedName = localizeNumberedNodeName(
      localizeGeneratedValue(node.name, nodeKey(node, model.templateId), t),
      node.kind,
      t,
    );
    if (localizedName === node.name) return node;
    nodesChanged = true;
    return { ...node, name: localizedName };
  });

  if (name === model.name && description === model.description && !nodesChanged) return model;
  return { ...model, name, description, nodes };
}

export function localizedRunName(run: ModelingRun, t: TFunction): string {
  return localizeGeneratedValue(run.modelName, templateKey(run.templateId, 'name'), t);
}
