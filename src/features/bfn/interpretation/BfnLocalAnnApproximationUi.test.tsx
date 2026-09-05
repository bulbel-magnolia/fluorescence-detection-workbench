import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { BfnPlatformPage } from '../BfnPlatformPage';
import { createDemoBfnProject } from '../fixtures';
import { createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import type { BfnProject, BfnStaticModel } from '../types';

function activeStaticModel(project: BfnProject, moduleIndex: number): BfnStaticModel {
  const module = project.network.modules[moduleIndex]!;
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.mode === 'static' && candidate.id === module.activeModelIds.static,
  );
  if (!model) throw new Error('Expected an active static model.');
  return model;
}

function directProject(): BfnProject {
  const project = createDemoBfnProject();
  const source = project.network.inputSources[0]!;
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort = {
    ...source.outputPort,
    id: 'monitor-direct-ann-in',
    direction: 'input',
  };
  project.network.modules = [];
  project.network.edges = [
    {
      id: 'edge-direct-ann',
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: monitor.id, portId: monitor.inputPort.id },
      mapping: 'identity',
      enabled: true,
    },
  ];
  return project;
}

function setReporterContextMismatch(project: BfnProject): void {
  const model = activeStaticModel(project, 1);
  const baseline = project.registry.contexts[0]!;
  const context = {
    ...structuredClone(baseline),
    id: 'context-local-ann-ui-mismatch',
    temperatureCelsius: (baseline.temperatureCelsius ?? 37) + 4,
  };
  project.registry.contexts.push(context);
  model.contextId = context.id;
  const domain = project.registry.validityDomains.find(
    (candidate) => candidate.id === model.validityDomainId,
  );
  if (!domain) throw new Error('Expected reporter validity domain.');
  domain.contextId = context.id;
}

async function openApproximation(monitorName = /报告信号, 输出/u) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: monitorName }));
  const action = screen.getByRole('button', { name: '生成神经网络近似…' });
  await user.click(action);
  return {
    user,
    action,
    dialog: screen.getByRole('dialog', { name: '神经网络近似' }),
  };
}

describe('BFN local ANN approximation workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('opens from an Output Monitor with only relevant, conservatively blank conditions', async () => {
    const project = createDemoBfnProject();
    const unrelated = structuredClone(project.network.inputSources[0]!);
    unrelated.id = 'source-unrelated-ann-ui';
    unrelated.displayName = { zh: '无关输入', en: 'Unrelated input' };
    unrelated.outputPort.id = 'source-unrelated-ann-ui-out';
    project.network.inputSources.push(unrelated);
    render(<BfnPlatformPage project={project} />);

    const { dialog } = await openApproximation();

    expect(dialog).toHaveTextContent(
      '将当前生物网络在指定输入条件附近近似为权重和偏置，便于理解和比较各模块的局部作用。',
    );
    expect(dialog).not.toHaveTextContent('无关输入');
    expect(within(dialog).getAllByRole('spinbutton', { name: /分析值/u })).toHaveLength(1);
    expect(within(dialog).getByRole('spinbutton', { name: /分析值/u })).toHaveValue(null);
    expect(within(dialog).getByRole('button', { name: '生成近似' })).toBeDisabled();
    expect(document.querySelector('.bfn-canvas-ann-weight')).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(
      /Jacobian|Taylor|R²|NRMSE|training|训练|拟合优度|network_local_ann_approximation/u,
    );
  });

  it.each([
    ['same unit', 'nM', 12, 12],
    ['compatible different unit', 'uM', 1, null],
  ] as const)(
    'uses the corrected conservative prefill for a %s fixed value',
    async (_label, unit, value, expected) => {
      const project = createDemoBfnProject();
      project.network.inputSources[0]!.staticSpecification = {
        type: 'fixed_value',
        value,
        unit,
      };
      render(<BfnPlatformPage project={project} />);
      const { dialog } = await openApproximation();

      expect(within(dialog).getByRole('spinbutton', { name: /分析值/u })).toHaveValue(expected);
    },
  );

  it('shows network weights, bias, module details, and an explicit local canvas view after success', async () => {
    const project = createDemoBfnProject();
    const before = structuredClone(project);
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openApproximation();
    const input = within(dialog).getByRole('spinbutton', { name: /分析值/u });

    await user.type(input, '10');
    await user.click(within(dialog).getByRole('button', { name: '生成近似' }));

    const result = within(dialog).getByRole('region', { name: '近似结果' });
    expect(result).toHaveTextContent('总体输入权重');
    expect(result).toHaveTextContent('近似偏置');
    expect(result).toHaveTextContent('当前输出');
    expect(result).toHaveTextContent('这是当前分析条件附近的局部近似，不会改变原有生物模型。');
    expect(result).toHaveTextContent('模块局部参数');
    expect(result).toHaveTextContent('AHL 响应');
    expect(result).toHaveTextContent('报告表达');
    expect(result).toHaveTextContent('数据驱动模型');
    expect(result).toHaveTextContent('机制模型');
    expect(result).toHaveTextContent('分析依据');
    expect(within(dialog).getByRole('button', { name: '神经网络近似' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      '连线旁数值表示下游模块在当前条件下的局部权重；原网络连接本身不带权重。',
    );
    expect(document.querySelectorAll('.bfn-canvas-ann-weight')).toHaveLength(2);

    await user.click(within(dialog).getByRole('button', { name: '生物网络' }));
    expect(document.querySelector('.bfn-canvas-ann-weight')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '神经网络近似' }));
    expect(document.querySelectorAll('.bfn-canvas-ann-weight')).toHaveLength(2);

    await user.clear(input);
    expect(within(dialog).queryByRole('region', { name: '近似结果' })).not.toBeInTheDocument();
    expect(document.querySelector('.bfn-canvas-ann-weight')).not.toBeInTheDocument();
    expect(project).toEqual(before);
  });

  it('discards the result and overlay on close and does not persist conditions', async () => {
    render(<BfnPlatformPage project={createDemoBfnProject()} />);
    const { user, action, dialog } = await openApproximation();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/u }), '10');
    await user.click(within(dialog).getByRole('button', { name: '生成近似' }));
    expect(document.querySelector('.bfn-canvas-ann-weight')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '关闭神经网络近似' }));
    expect(screen.queryByRole('dialog', { name: '神经网络近似' })).not.toBeInTheDocument();
    expect(document.querySelector('.bfn-canvas-ann-weight')).not.toBeInTheDocument();
    expect(action).toHaveFocus();

    await user.click(action);
    expect(
      within(screen.getByRole('dialog', { name: '神经网络近似' })).getByRole('spinbutton', {
        name: /分析值/u,
      }),
    ).toHaveValue(null);
  });

  it('clears the approximation when the controlled Project changes', async () => {
    const firstProject = createDemoBfnProject();
    const { rerender } = render(<BfnPlatformPage project={firstProject} />);
    const { user, dialog } = await openApproximation();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/u }), '10');
    await user.click(within(dialog).getByRole('button', { name: '生成近似' }));
    expect(document.querySelector('.bfn-canvas-ann-weight')).toBeInTheDocument();

    const nextProject = createDemoBfnProject();
    nextProject.id = 'bfn-project-after-switch';
    rerender(<BfnPlatformPage project={nextProject} />);

    expect(screen.queryByRole('dialog', { name: '神经网络近似' })).not.toBeInTheDocument();
    expect(document.querySelector('.bfn-canvas-ann-weight')).not.toBeInTheDocument();
  });

  it('generates no formal approximation outside a recorded internal model domain', async () => {
    render(<BfnPlatformPage project={createDemoBfnProject()} />);
    const { user, dialog } = await openApproximation();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/u }), '150');
    await user.click(within(dialog).getByRole('button', { name: '生成近似' }));

    expect(within(dialog).queryByRole('region', { name: '近似结果' })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('未生成神经网络近似');
    expect(dialog).toHaveTextContent('当前值 150 nM');
    expect(document.querySelector('.bfn-canvas-ann-weight')).not.toBeInTheDocument();
  });

  it('contains an incomplete local linearization behind a natural module-level explanation', async () => {
    const project = createDemoBfnProject();
    const model = activeStaticModel(project, 0);
    if (model.response.family !== 'hill_activation') throw new Error('Expected Hill response.');
    model.response.n.value = 1;
    delete model.response.n.interval95;
    project.network.modules[0]!.activeModelIds = { static: model.id };
    project.registry.validityDomains.find(
      (candidate) => candidate.id === model.validityDomainId,
    )!.inputRanges[0]!.minimum = 0;
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openApproximation();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/u }), '0');
    await user.click(within(dialog).getByRole('button', { name: '生成近似' }));

    expect(dialog).toHaveTextContent(
      '当前工作点存在无法唯一线性化的模块响应，因此未生成完整的神经网络近似。',
    );
    expect(dialog).toHaveTextContent('AHL 响应');
    expect(dialog).not.toHaveTextContent(/derivative_not_unique|incomplete_local_linearization/u);
    expect(within(dialog).queryByRole('region', { name: '近似结果' })).not.toBeInTheDocument();
  });

  it('retains applicability and experimental-context boundaries alongside a valid result', async () => {
    const project = createDemoBfnProject();
    const reporterModel = activeStaticModel(project, 1);
    project.registry.validityDomains.find(
      (candidate) => candidate.id === reporterModel.validityDomainId,
    )!.inputRanges = [];
    setReporterContextMismatch(project);
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openApproximation();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/u }), '10');
    await user.click(within(dialog).getByRole('button', { name: '生成近似' }));

    const result = within(dialog).getByRole('region', { name: '近似结果' });
    expect(result).toHaveTextContent('部分模型没有记录完整的输入适用范围。');
    expect(result).toHaveTextContent('相关模块记录的实验条件存在不一致');
  });

  it('retains an uncertain experimental-context caveat with a valid result', async () => {
    const project = createDemoBfnProject();
    const model = activeStaticModel(project, 1);
    const context = {
      ...structuredClone(project.registry.contexts[0]!),
      id: 'context-local-ann-ui-uncertain',
      host: 'A differently reported host',
    };
    project.registry.contexts.push(context);
    model.contextId = context.id;
    project.registry.validityDomains.find(
      (candidate) => candidate.id === model.validityDomainId,
    )!.contextId = context.id;
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openApproximation();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/u }), '10');
    await user.click(within(dialog).getByRole('button', { name: '生成近似' }));

    expect(within(dialog).getByRole('region', { name: '近似结果' })).toHaveTextContent(
      '部分相关模块的实验条件不足以确认一致性。',
    );
  });

  it('states the steady-state boundary once for first-order modules', async () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    render(<BfnPlatformPage project={project} />);
    const { dialog } = await openApproximation();

    expect(dialog).toHaveTextContent('动态模块按稳态响应进行局部近似，不包含时间过程。');
  });

  it('keeps an upstream accumulator unavailable with a natural explanation', async () => {
    const project = createAccumulatorBfnProject();
    project.network.outputMonitors[0]!.labelKey = 'bfn.monitors.reporter';
    render(<BfnPlatformPage project={project} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /报告信号, 输出/u }));

    expect(screen.getByRole('button', { name: '生成神经网络近似…' })).toBeDisabled();
    expect(
      screen.getByText(/上游包含信号池等动态积分过程，当前局部神经网络近似不适用/u, {
        selector: 'p',
      }),
    ).toBeInTheDocument();
  });

  it('describes direct transmission without inventing a module approximation', async () => {
    render(<BfnPlatformPage project={directProject()} />);
    const { user, dialog } = await openApproximation();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/u }), '10');
    await user.click(within(dialog).getByRole('button', { name: '生成近似' }));

    const result = within(dialog).getByRole('region', { name: '近似结果' });
    expect(result).toHaveTextContent(
      '该目标没有经过功能模块转换；显示的是输入到输出的直接局部线性映射。',
    );
    expect(result).not.toHaveTextContent('模块局部参数');
    expect(document.querySelector('.bfn-canvas-ann-weight')).not.toBeInTheDocument();
  });

  it('provides equivalent English entry, conditions, result, and canvas semantics', async () => {
    await i18n.changeLanguage('en-US');
    render(<BfnPlatformPage project={createDemoBfnProject()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Reporter signal, Output/u }));
    await user.click(screen.getByRole('button', { name: 'Build neural network approximation…' }));
    const dialog = screen.getByRole('dialog', { name: 'Neural Network Approximation' });
    expect(dialog).toHaveTextContent('weights and biases near the specified input conditions');
    await user.type(within(dialog).getByRole('spinbutton', { name: /Analysis value/u }), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Generate approximation' }));
    expect(within(dialog).getByRole('region', { name: 'Approximation result' })).toHaveTextContent(
      'Overall input weights',
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'Values beside connections are local weights for downstream modules at the current condition',
    );
  });
});
