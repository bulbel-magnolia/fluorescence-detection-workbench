import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { BfnPlatformPage } from '../BfnPlatformPage';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import { createAccumulatorBfnProject } from '../testing/accumulatorFixtures';
import type { BfnFunctionalModule, BfnProject, BfnStaticModel } from '../types';

function activeStaticModel(module: BfnFunctionalModule): BfnStaticModel {
  const model = module.modelVariants.find(
    (candidate): candidate is BfnStaticModel =>
      candidate.id === module.activeModelIds.static && candidate.mode === 'static',
  );
  if (!model) throw new Error('Expected an active static model.');
  return model;
}

function multiInputProject(): BfnProject {
  const project = createDemoBfnProject();
  const module = createCatalogModule('dual-input-gate', 'local-influence-ui');
  const model = activeStaticModel(module);
  project.network.modules = [module];
  project.network.inputSources = [];
  project.network.outputMonitors = [];
  project.network.edges = [];
  project.registry.validityDomains = [
    {
      id: model.validityDomainId,
      labelKey: 'bfn.domains.localInfluenceUi',
      inputRanges: module.inputPorts.map((port) => ({
        portId: port.id,
        minimum: 0,
        maximum: 1,
        unit: port.unit,
      })),
      contextId: model.contextId,
    },
  ];
  return project;
}

async function openAnalysis() {
  const user = userEvent.setup();
  const action = screen.getByRole('button', { name: '分析输入作用…' });
  await user.click(action);
  return {
    user,
    action,
    dialog: screen.getByRole('dialog', { name: '输入作用分析' }),
  };
}

describe('BFN static local influence workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('opens from the selected-module Inspector with empty, fixed-unit analysis conditions', async () => {
    render(<BfnPlatformPage project={createDemoBfnProject()} />);
    const { dialog } = await openAnalysis();

    expect(dialog).toHaveTextContent('查看当前条件下，各输入对所选模块输出的影响方向和强度。');
    expect(dialog).toHaveTextContent('分析对象');
    expect(dialog).toHaveTextContent('分析条件');
    expect(dialog).toHaveTextContent('0.1–100 nM');
    expect(dialog).toHaveTextContent('当前显示的是该动态模块的稳态响应关系');
    expect(within(dialog).getByRole('spinbutton', { name: /分析值/ })).toHaveValue(null);
    expect(within(dialog).getByRole('button', { name: '分析' })).toBeDisabled();
    expect(dialog).not.toHaveTextContent(/∂|Jacobian|gradient|梯度|导数|module_static_response/);
  });

  it('calculates current output, direction, gain, sensitivity, applicability, and model evidence', async () => {
    const project = createDemoBfnProject();
    const before = structuredClone(project);
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openAnalysis();
    const input = within(dialog).getByRole('spinbutton', { name: /分析值/ });

    await user.type(input, '10');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));

    const results = within(dialog).getByRole('region', { name: '结果' });
    expect(results).toHaveTextContent('当前输出');
    expect(results).toHaveTextContent('增强');
    expect(results).toHaveTextContent('局部响应增益');
    expect(results).toHaveTextContent('相对敏感度');
    expect(results).toHaveTextContent('当前分析条件在模型已记录的适用范围内');
    expect(results).toHaveTextContent('数据驱动模型');
    expect(project).toEqual(before);
  });

  it('clears a previous result when a condition changes and blocks an outside-domain result', async () => {
    render(<BfnPlatformPage project={createDemoBfnProject()} />);
    const { user, dialog } = await openAnalysis();
    const input = within(dialog).getByRole('spinbutton', { name: /分析值/ });
    const analyze = within(dialog).getByRole('button', { name: '分析' });

    await user.type(input, '10');
    await user.click(analyze);
    expect(within(dialog).getByRole('region', { name: '结果' })).toBeInTheDocument();

    await user.clear(input);
    expect(within(dialog).queryByRole('region', { name: '结果' })).not.toBeInTheDocument();
    expect(analyze).toBeDisabled();

    await user.type(input, '101');
    await user.click(analyze);
    expect(within(dialog).queryByRole('region', { name: '结果' })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('当前分析值超出该模型已记录的适用范围');
    expect(dialog).toHaveTextContent('允许范围 0.1–100 nM');
    expect(dialog).not.toHaveTextContent(
      /outside_validity_domain|static_output_arity_invalid|model_contract_invalid/,
    );
  });

  it('shows an incomplete applicability record next to the calculated result', async () => {
    const project = createDemoBfnProject();
    const model = activeStaticModel(project.network.modules[0]!);
    const domain = project.registry.validityDomains.find(
      ({ id }) => id === model.validityDomainId,
    )!;
    domain.inputRanges = [];
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openAnalysis();

    expect(dialog).toHaveTextContent('未记录');
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/ }), '10');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));
    expect(within(dialog).getByRole('region', { name: '结果' })).toHaveTextContent(
      '该模型没有记录完整的输入适用范围',
    );
  });

  it('keeps multi-input conditions and result rows in model input order', async () => {
    render(<BfnPlatformPage project={multiInputProject()} />);
    const { user, dialog } = await openAnalysis();
    const inputs = within(dialog).getAllByRole('spinbutton', { name: /分析值/ });

    expect(inputs).toHaveLength(2);
    expect(dialog).toHaveTextContent('0–1 相对值');
    await user.type(inputs[0]!, '0.3');
    await user.type(inputs[1]!, '0.7');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));
    const rows = within(dialog).getByRole('region', { name: '结果' }).querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('输入信号 A');
    expect(rows[1]).toHaveTextContent('输入信号 B');
  });

  it('disables accumulator analysis with a natural scientific explanation', () => {
    render(<BfnPlatformPage project={createAccumulatorBfnProject()} />);

    expect(screen.getByRole('button', { name: '分析输入作用…' })).toBeDisabled();
    expect(screen.getByText(/信号池属于动态积分过程/, { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText(/static_interpretation_unsupported/)).not.toBeInTheDocument();
  });

  it('contains a malformed static response behind a natural disabled reason', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[1]!;
    const model = activeStaticModel(module);
    model.family = 'identity';
    model.response = { family: 'identity', inputPortId: module.inputPorts[0]!.id };
    module.modelVariants = [model];
    module.activeModelIds = { static: model.id };
    project.network.modules = [module];
    render(<BfnPlatformPage project={project} />);

    expect(screen.getByRole('button', { name: '分析输入作用…' })).toBeDisabled();
    expect(screen.getByText(/当前模块的响应定义不完整/, { selector: 'p' })).toBeInTheDocument();
    expect(
      screen.queryByText(/identity_contract_invalid|model_contract_invalid/),
    ).not.toBeInTheDocument();
  });

  it('discards analysis values on close, restores focus, and does not persist them', async () => {
    const project = createDemoBfnProject();
    const before = structuredClone(project);
    render(<BfnPlatformPage project={project} />);
    const { user, action, dialog } = await openAnalysis();
    await user.type(within(dialog).getByRole('spinbutton', { name: /分析值/ }), '10');

    await user.click(within(dialog).getByRole('button', { name: '关闭输入作用分析' }));
    expect(screen.queryByRole('dialog', { name: '输入作用分析' })).not.toBeInTheDocument();
    expect(action).toHaveFocus();
    expect(project).toEqual(before);

    await user.click(action);
    expect(
      within(screen.getByRole('dialog', { name: '输入作用分析' })).getByRole('spinbutton', {
        name: /分析值/,
      }),
    ).toHaveValue(null);
  });

  it('provides equivalent English entry, purpose, fields, and result labels', async () => {
    await i18n.changeLanguage('en-US');
    render(<BfnPlatformPage project={createDemoBfnProject()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Analyze input influence…' }));
    const dialog = screen.getByRole('dialog', { name: 'Input Influence Analysis' });

    expect(dialog).toHaveTextContent(
      'See how strongly and in which direction each input affects the selected module output',
    );
    expect(dialog).toHaveTextContent('Recorded range');
    await user.type(within(dialog).getByRole('spinbutton', { name: /Analysis value/ }), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Analyze' }));
    expect(within(dialog).getByRole('region', { name: 'Results' })).toHaveTextContent(
      'Local response gain',
    );
  });
});
