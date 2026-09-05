import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { BfnPlatformPage } from '../BfnPlatformPage';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import { createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import type { BfnInputSource, BfnProject, BfnStaticModel } from '../types';

function activeStaticModel(project: BfnProject, moduleIndex: number): BfnStaticModel {
  const module = project.network.modules[moduleIndex]!;
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.mode === 'static' && candidate.id === module.activeModelIds.static,
  );
  if (!model) throw new Error('Expected an active static model.');
  return model;
}

function setReporterContext(
  project: BfnProject,
  changes: Partial<(typeof project.registry.contexts)[number]>,
): void {
  const context = {
    ...structuredClone(project.registry.contexts[0]!),
    ...changes,
    id: 'context-network-ui-compared',
  };
  project.registry.contexts.push(context);
  const model = activeStaticModel(project, 1);
  model.contextId = context.id;
  const domain = project.registry.validityDomains.find(
    (candidate) => candidate.id === model.validityDomainId,
  );
  if (!domain) throw new Error('Expected reporter validity domain.');
  domain.contextId = context.id;
}

function sourceFor(id: string, name: string, port: BfnInputSource['outputPort']): BfnInputSource {
  return {
    kind: 'input_source',
    id,
    labelKey: `bfn.testing.${id}`,
    displayName: { zh: name, en: name.replace('输入', 'Input') },
    outputPort: { ...port, id: `${id}-out`, direction: 'output' },
    staticSpecification: {
      type: 'working_range',
      minimum: 0,
      maximum: 1,
      points: 11,
      unit: port.unit,
    },
    dynamicSpecification: {
      type: 'step',
      before: 0,
      after: 1,
      atHours: 1,
      unit: port.unit,
    },
    position: { x: 0, y: 0 },
  };
}

function multiInputProject(): BfnProject {
  const project = createDemoBfnProject();
  const module = createCatalogModule('dual-input-gate', 'network-ui');
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel => candidate.mode === 'static',
  )!;
  const contextId = project.registry.contexts[0]?.id ?? null;
  model.validityDomainId = 'domain-network-ui';
  model.contextId = contextId;
  const sourceA = sourceFor('source-network-a', '输入 A', {
    ...module.inputPorts[0]!,
    direction: 'output',
  });
  const sourceB = sourceFor('source-network-b', '输入 B', {
    ...module.inputPorts[1]!,
    direction: 'output',
  });
  const monitor = project.network.outputMonitors[0]!;
  monitor.displayName = { zh: '汇合输出', en: 'Converged output' };
  monitor.inputPort = {
    ...module.outputPorts[0]!,
    id: 'monitor-network-ui-in',
    direction: 'input',
  };
  project.network.inputSources = [sourceA, sourceB];
  project.network.modules = [module];
  project.network.outputMonitors = [monitor];
  project.network.edges = [
    {
      id: 'edge-network-a',
      source: { nodeId: sourceA.id, portId: sourceA.outputPort.id },
      target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-network-b',
      source: { nodeId: sourceB.id, portId: sourceB.outputPort.id },
      target: { nodeId: module.id, portId: module.inputPorts[1]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-network-monitor',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  project.registry.validityDomains = [
    {
      id: model.validityDomainId,
      labelKey: 'bfn.testing.networkUiDomain',
      inputRanges: module.inputPorts.map((port) => ({
        portId: port.id,
        minimum: 0,
        maximum: 1,
        unit: port.unit,
      })),
      contextId,
    },
  ];
  return project;
}

function feedbackProject(): BfnProject {
  const project = createDemoBfnProject();
  const module = project.network.modules[1]!;
  module.inputPorts[0]!.entity = module.outputPorts[0]!.entity;
  module.inputPorts[0]!.quantityType = module.outputPorts[0]!.quantityType;
  module.inputPorts[0]!.unit = module.outputPorts[0]!.unit;
  project.network.modules = [module];
  const monitor = project.network.outputMonitors[0]!;
  project.network.edges = [
    {
      id: 'edge-self-feedback',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: module.id, portId: module.inputPorts[0]!.id },
      mapping: 'identity',
      enabled: true,
    },
    {
      id: 'edge-feedback-monitor',
      source: { nodeId: module.id, portId: module.outputPorts[0]!.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  return project;
}

async function selectMonitor(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name }));
}

async function openAnalysis(monitorName = /报告信号, 输出/) {
  const user = userEvent.setup();
  await selectMonitor(user, monitorName);
  const action = screen.getByRole('button', { name: '分析网络作用…' });
  await user.click(action);
  return {
    user,
    action,
    dialog: screen.getByRole('dialog', { name: '网络作用分析' }),
  };
}

describe('BFN Network Influence Analysis workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('opens from the Output Monitor Inspector with only relevant blank source conditions', async () => {
    const project = createDemoBfnProject();
    const unrelated = structuredClone(project.network.inputSources[0]!);
    unrelated.id = 'source-unrelated-ui';
    unrelated.displayName = { zh: '无关输入', en: 'Unrelated input' };
    unrelated.outputPort.id = 'source-unrelated-ui-out';
    project.network.inputSources.push(unrelated);
    render(<BfnPlatformPage project={project} />);
    const { dialog } = await openAnalysis();

    expect(dialog).toHaveTextContent(
      '查看在指定输入条件下，各网络输入对所选输出的总体影响方向和强度。',
    );
    expect(dialog).toHaveTextContent('分析对象');
    expect(dialog).toHaveTextContent('分析条件');
    expect(dialog).toHaveTextContent('当前分析使用动态模块的稳态响应关系');
    expect(dialog).not.toHaveTextContent('无关输入');
    expect(within(dialog).getAllByRole('spinbutton', { name: /分析值/ })).toHaveLength(1);
    expect(within(dialog).getByRole('spinbutton', { name: /分析值/ })).toHaveValue(null);
    expect(within(dialog).getByRole('button', { name: '分析' })).toBeDisabled();
    expect(dialog).not.toHaveTextContent(
      /∂|Jacobian|chain rule|gradient|topological|network_static_output|梯度|导数/,
    );
  });

  it.each([
    ['static fixed value', 'static', 12],
    ['dynamic constant value', 'dynamic', 7],
  ] as const)('prefills an exact %s and enables analysis', async (_label, mode, value) => {
    const project = createDemoBfnProject();
    project.network.mode = mode;
    if (mode === 'static') {
      project.network.inputSources[0]!.staticSpecification = {
        type: 'fixed_value',
        value,
        unit: 'nM',
      };
    } else {
      project.network.inputSources[0]!.dynamicSpecification = {
        type: 'constant',
        value,
        unit: 'nM',
      };
    }
    render(<BfnPlatformPage project={project} />);
    const { dialog } = await openAnalysis();
    expect(within(dialog).getByRole('spinbutton', { name: /分析值/ })).toHaveValue(value);
    expect(within(dialog).getByRole('button', { name: '分析' })).toBeEnabled();
  });

  it.each([
    ['static fixed value', 'static'],
    ['dynamic constant value', 'dynamic'],
  ] as const)('leaves a compatible but different-unit %s blank', async (_label, mode) => {
    const project = createDemoBfnProject();
    project.network.mode = mode;
    if (mode === 'static') {
      project.network.inputSources[0]!.staticSpecification = {
        type: 'fixed_value',
        value: 1,
        unit: 'uM',
      };
    } else {
      project.network.inputSources[0]!.dynamicSpecification = {
        type: 'constant',
        value: 1,
        unit: 'uM',
      };
    }
    render(<BfnPlatformPage project={project} />);
    const { dialog } = await openAnalysis();
    expect(within(dialog).getByRole('spinbutton', { name: /分析值/ })).toHaveValue(null);
    expect(within(dialog).getByRole('button', { name: '分析' })).toBeDisabled();
  });

  it('shows current output, direction, total gain, sensitivity, applicability, and model basis', async () => {
    const project = createDemoBfnProject();
    const before = structuredClone(project);
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openAnalysis();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/ }), '10');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));

    const result = within(dialog).getByRole('region', { name: '结果' });
    expect(result).toHaveTextContent('当前输出');
    expect(result).toHaveTextContent('增强');
    expect(result).toHaveTextContent('总体响应增益');
    expect(result).toHaveTextContent('相对敏感度');
    expect(result).toHaveTextContent('当前分析条件在所有相关模型已记录的适用范围内');
    expect(result).toHaveTextContent('分析依据');
    expect(result).toHaveTextContent('数据驱动模型');
    expect(result).toHaveTextContent('机制模型');
    expect(project).toEqual(before);
  });

  it('clears stale output on edit and blocks a formal result outside an internal model domain', async () => {
    render(<BfnPlatformPage project={createDemoBfnProject()} />);
    const { user, dialog } = await openAnalysis();
    const input = within(dialog).getByRole('spinbutton', { name: /分析值/ });
    const analyze = within(dialog).getByRole('button', { name: '分析' });
    await user.type(input, '10');
    await user.click(analyze);
    expect(within(dialog).getByRole('region', { name: '结果' })).toBeInTheDocument();

    await user.clear(input);
    expect(within(dialog).queryByRole('region', { name: '结果' })).not.toBeInTheDocument();
    await user.type(input, '150');
    await user.click(analyze);
    expect(within(dialog).queryByRole('region', { name: '结果' })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('未生成正式结果');
    expect(dialog).toHaveTextContent('AHL 响应');
    expect(dialog).toHaveTextContent('当前值 150 nM');
    expect(dialog).toHaveTextContent('记录范围 0.1–100 nM');
    expect(dialog).not.toHaveTextContent(/outside_recorded_domain|outside_validity_domain/);
  });

  it('keeps a mathematical result beside a network-level not-recorded applicability note', async () => {
    const project = createDemoBfnProject();
    const reporterModel = activeStaticModel(project, 1);
    project.registry.validityDomains.find(
      (domain) => domain.id === reporterModel.validityDomainId,
    )!.inputRanges = [];
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openAnalysis();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/ }), '10');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));
    expect(within(dialog).getByRole('region', { name: '结果' })).toHaveTextContent(
      '该网络中部分响应模型没有记录完整的输入适用范围',
    );
  });

  it('shows a natural caveat for relevant Context mismatch while retaining the result', async () => {
    const project = createDemoBfnProject();
    const temperature = project.registry.contexts[0]!.temperatureCelsius;
    if (temperature === null) throw new Error('Expected demo temperature.');
    setReporterContext(project, { temperatureCelsius: temperature + 5 });
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openAnalysis();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/ }), '10');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));

    expect(within(dialog).getByRole('region', { name: '结果' })).toHaveTextContent(
      '相关模块记录的实验条件存在不一致。当前总体作用是这些模型的数学组合，解释结果时需注意条件差异。',
    );
    expect(dialog).not.toHaveTextContent(/context_applicability_mismatch|mismatched/);
  });

  it('shows a natural caveat for uncertain relevant Context while retaining the result', async () => {
    const project = createDemoBfnProject();
    setReporterContext(project, { host: 'A differently reported host' });
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openAnalysis();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/ }), '10');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));

    expect(within(dialog).getByRole('region', { name: '结果' })).toHaveTextContent(
      '部分相关模块的实验条件不足以确认一致性。',
    );
    expect(dialog).not.toHaveTextContent(/uncertain|unavailable/);
  });

  it('renders two upstream inputs and two result rows for a multi-input network', async () => {
    render(<BfnPlatformPage project={multiInputProject()} />);
    const { user, dialog } = await openAnalysis(/汇合输出, 输出/);
    const inputs = within(dialog).getAllByRole('spinbutton', { name: /分析值/ });
    expect(inputs).toHaveLength(2);
    await user.type(inputs[0]!, '0.3');
    await user.type(inputs[1]!, '0.7');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));
    const result = within(dialog).getByRole('region', { name: '结果' });
    const rows = within(result).getAllByRole('table')[0]!.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('输入 A');
    expect(rows[1]).toHaveTextContent('输入 B');
  });

  it('gives distinct natural disabled reasons for an Accumulator and target feedback', async () => {
    const user = userEvent.setup();
    const accumulator = createAccumulatorBfnProject();
    accumulator.network.outputMonitors[0]!.labelKey = 'bfn.monitors.reporter';
    const { unmount } = render(<BfnPlatformPage project={accumulator} />);
    await selectMonitor(user, /报告信号, 输出/);
    expect(screen.getByRole('button', { name: '分析网络作用…' })).toBeDisabled();
    expect(
      screen.getByText('所选输出的上游包含信号池等动态积分过程，当前稳态网络作用分析不适用。', {
        selector: 'p',
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/upstream_accumulator_unsupported/)).not.toBeInTheDocument();
    unmount();

    render(<BfnPlatformPage project={feedbackProject()} />);
    await selectMonitor(user, /报告信号, 输出/);
    expect(screen.getByRole('button', { name: '分析网络作用…' })).toBeDisabled();
    expect(
      screen.getByText('所选输出的上游包含反馈回路，当前版本不能进行稳态网络作用分析。', {
        selector: 'p',
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/upstream_feedback_unsupported/)).not.toBeInTheDocument();
  });

  it('discards conditions on close, restores focus, and leaves the Project unchanged', async () => {
    const project = createDemoBfnProject();
    const before = structuredClone(project);
    render(<BfnPlatformPage project={project} />);
    const { user, action, dialog } = await openAnalysis();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/ }), '10');
    await user.click(within(dialog).getByRole('button', { name: '关闭网络作用分析' }));
    expect(screen.queryByRole('dialog', { name: '网络作用分析' })).not.toBeInTheDocument();
    expect(action).toHaveFocus();
    expect(project).toEqual(before);

    await user.click(action);
    expect(
      within(screen.getByRole('dialog', { name: '网络作用分析' })).getByRole('spinbutton', {
        name: /分析值/,
      }),
    ).toHaveValue(null);
  });

  it('provides equivalent English target, purpose, conditions, and result labels', async () => {
    await i18n.changeLanguage('en-US');
    render(<BfnPlatformPage project={createDemoBfnProject()} />);
    const user = userEvent.setup();
    await selectMonitor(user, /Reporter signal, Output/);
    await user.click(screen.getByRole('button', { name: 'Analyze network influence…' }));
    const dialog = screen.getByRole('dialog', { name: 'Network Influence Analysis' });
    expect(dialog).toHaveTextContent('each network input affects the selected output');
    expect(dialog).toHaveTextContent('Analysis conditions');
    await user.type(within(dialog).getByRole('spinbutton', { name: /Analysis value/ }), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Analyze' }));
    expect(within(dialog).getByRole('region', { name: 'Results' })).toHaveTextContent(
      'Total response gain',
    );
  });
});
