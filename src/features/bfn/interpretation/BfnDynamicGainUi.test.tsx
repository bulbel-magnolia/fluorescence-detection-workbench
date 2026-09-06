import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { BfnPlatformPage } from '../BfnPlatformPage';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import type { BfnInputSource, BfnProject, BfnStaticModel } from '../types';

function multiInputStaticProject(): BfnProject {
  const project = createDemoBfnProject();
  const module = createCatalogModule('dual-input-gate', 'dynamic-influence-ui');
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel => candidate.mode === 'static',
  );
  if (!model) throw new Error('Expected static dual-input model.');
  const contextId = project.registry.contexts[0]?.id ?? null;
  model.validityDomainId = 'domain-dynamic-influence-ui';
  model.contextId = contextId;
  project.registry.validityDomains = [
    {
      id: model.validityDomainId,
      labelKey: 'bfn.testing.dynamicInfluenceUiDomain',
      inputRanges: module.inputPorts.map((port) => ({
        portId: port.id,
        minimum: 0,
        maximum: 1,
        unit: port.unit,
      })),
      contextId,
    },
  ];
  const sources: BfnInputSource[] = module.inputPorts.map((port, index) => ({
    kind: 'input_source',
    id: `source-dynamic-ui-${index}`,
    labelKey: `bfn.testing.dynamicUiSource${index}`,
    outputPort: { ...port, id: `source-dynamic-ui-${index}-out`, direction: 'output' },
    staticSpecification: {
      type: 'fixed_value',
      value: index === 0 ? 0.4 : 0.7,
      unit: port.unit,
    },
    dynamicSpecification: { type: 'constant', value: 0.5, unit: port.unit },
    position: { x: 0, y: index * 100 },
  }));
  const monitor = project.network.outputMonitors[0]!;
  monitor.inputPort = {
    ...module.outputPorts[0]!,
    id: 'monitor-dynamic-ui-in',
    direction: 'input',
  };
  project.network.inputSources = sources;
  project.network.modules = [module];
  project.network.edges = [
    ...sources.map((source, index) => ({
      id: `edge-dynamic-ui-${index}`,
      source: { nodeId: source.id, portId: source.outputPort.id },
      target: { nodeId: module.id, portId: module.inputPorts[index]!.id },
      mapping: 'identity' as const,
      enabled: true,
    })),
    {
      id: 'edge-dynamic-ui-monitor',
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

async function openDynamicAnalysis() {
  const user = userEvent.setup();
  await selectMonitor(user, /报告信号, 输出/);
  await user.click(screen.getByRole('button', { name: '分析动态作用…' }));
  return {
    user,
    dialog: screen.getByRole('dialog', { name: '动态作用分析' }),
  };
}

describe('BFN Dynamic Influence Analysis workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('supports static mode, prefills an exact fixed value, and shows instantaneous module details', async () => {
    const project = createDemoBfnProject();
    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: 10,
      unit: 'nM',
    };
    render(<BfnPlatformPage project={project} />);
    const user = userEvent.setup();
    await selectMonitor(user, /报告信号, 输出/);

    const action = screen.getByRole('button', { name: '分析动态作用…' });
    expect(action).toBeEnabled();
    await user.click(action);
    const dialog = screen.getByRole('dialog', { name: '动态作用分析' });
    expect(within(dialog).getByRole('spinbutton', { name: /分析值/ })).toHaveValue(10);
    await user.type(within(dialog).getByRole('spinbutton', { name: /周期/ }), '2');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));
    const result = within(dialog).getByRole('region', { name: '结果' });
    expect(result).toHaveTextContent('动态模块明细');
    expect(result).toHaveTextContent('瞬时响应');
    expect(result).toHaveTextContent('—');
    expect(screen.queryByText(/dynamic_mode_required/)).not.toBeInTheDocument();
  });

  it('calculates baseline output, dynamic gain magnitude, and phase without a direction column', async () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 10,
      unit: 'nM',
    };
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openDynamicAnalysis();

    expect(dialog).toHaveTextContent(
      '查看当前条件附近，输入随时间变化时对所选输出的动态影响强度和相位关系。',
    );
    expect(within(dialog).getByRole('spinbutton', { name: /周期/ })).toHaveValue(null);
    expect(within(dialog).getByRole('spinbutton', { name: /分析值/ })).toHaveValue(10);
    expect(within(dialog).getByRole('button', { name: '分析' })).toBeDisabled();

    await user.type(within(dialog).getByRole('spinbutton', { name: /周期/ }), '2');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));

    const result = within(dialog).getByRole('region', { name: '结果' });
    expect(result).toHaveTextContent('基线输出');
    expect(result).toHaveTextContent('慢变化作用');
    expect(result).toHaveTextContent(/\+\d/u);
    expect(result).toHaveTextContent('当前时间尺度的响应幅度');
    expect(result).toHaveTextContent('相位关系');
    expect(result).toHaveTextContent('deg');
    expect(result).toHaveTextContent('动态模块明细');
    expect(result).toHaveTextContent('时间常数');
    expect(result).toHaveTextContent('τ = 0.8 h');
    expect(result).toHaveTextContent('τ = 0.45 h');
    expect(result).toHaveTextContent('稳态局部作用');
    expect(result).toHaveTextContent('当前响应幅度');
    expect(result).toHaveTextContent('分析依据');
    expect(result).not.toHaveTextContent('作用方向');
    expect(result).not.toHaveTextContent(
      /network_dynamic_periodic_gain|first_order|complex_non_finite/,
    );
  });

  it('shows a natural complete-linearization failure with the located module name', async () => {
    const project = multiInputStaticProject();
    const module = project.network.modules[0]!;
    const model = module.modelVariants.find(
      (candidate): candidate is BfnStaticModel =>
        candidate.mode === 'static' && candidate.id === module.activeModelIds.static,
    );
    if (!model || model.response.family !== 'independent_inputs') {
      throw new Error('Expected active independent-input response.');
    }
    model.response.terms[0]!.n.value = 1;
    delete model.response.terms[0]!.n.interval95;
    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: 0,
      unit: 'dimensionless',
    };
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openDynamicAnalysis();
    await user.type(within(dialog).getByRole('spinbutton', { name: /周期/ }), '2');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));

    expect(dialog).toHaveTextContent(
      '当前工作点存在无法唯一线性化的模块响应，因此未生成完整的动态作用分析。',
    );
    expect(dialog).toHaveTextContent('定位模块：双输入响应');
    expect(dialog).not.toHaveTextContent(
      /incomplete_local_dynamic_linearization|derivative_not_unique/u,
    );
  });

  it('keeps both input identities in static multi-input module details', async () => {
    render(<BfnPlatformPage project={multiInputStaticProject()} />);
    const { user, dialog } = await openDynamicAnalysis();
    await user.type(within(dialog).getByRole('spinbutton', { name: /周期/ }), '2');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));

    const result = within(dialog).getByRole('region', { name: '结果' });
    expect(result).toHaveTextContent('输入信号 A');
    expect(result).toHaveTextContent('输入信号 B');
    expect(result).toHaveTextContent('稳态局部作用');
    expect(result).toHaveTextContent('当前响应幅度');
    expect(result).toHaveTextContent('相位关系');
  });

  it('requires a positive period and clears stale results on edit and close', async () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 10,
      unit: 'nM',
    };
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openDynamicAnalysis();
    const period = within(dialog).getByRole('spinbutton', { name: /周期/ });

    await user.type(period, '0');
    expect(within(dialog).getByRole('button', { name: '分析' })).toBeDisabled();
    await user.clear(period);
    await user.type(period, '2');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));
    expect(within(dialog).getByRole('region', { name: '结果' })).toBeInTheDocument();

    await user.clear(period);
    expect(within(dialog).queryByRole('region', { name: '结果' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '关闭动态作用分析' }));
    expect(screen.queryByRole('dialog', { name: '动态作用分析' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '分析动态作用…' }));
    expect(
      within(screen.getByRole('dialog', { name: '动态作用分析' })).getByRole('spinbutton', {
        name: /周期/,
      }),
    ).toHaveValue(null);
  });

  it('provides equivalent English labels', async () => {
    await i18n.changeLanguage('en-US');
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 10,
      unit: 'nM',
    };
    render(<BfnPlatformPage project={project} />);
    const user = userEvent.setup();
    await selectMonitor(user, /Reporter signal, Output/);
    await user.click(screen.getByRole('button', { name: 'Analyze dynamic influence…' }));
    const dialog = screen.getByRole('dialog', { name: 'Dynamic Influence Analysis' });
    expect(dialog).toHaveTextContent('time-varying inputs influence');
    await user.type(within(dialog).getByRole('spinbutton', { name: /Period/ }), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Analyze' }));
    expect(within(dialog).getByRole('region', { name: 'Results' })).toHaveTextContent(
      'Slow-change effect',
    );
  });
});
