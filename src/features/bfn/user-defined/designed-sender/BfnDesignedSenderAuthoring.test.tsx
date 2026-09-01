import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../i18n';
import { createDemoBfnProject } from '../../fixtures';
import type { UserDefinedFunctionalModuleDraft } from '../userModuleContract';
import { materializeUserDefinedStaticModule } from '../userModuleMaterialization';
import { BfnDesignedSenderAuthoring } from './BfnDesignedSenderAuthoring';
import type { DesignedSenderSignalIdentity } from './designedSenderSignalCatalog';

describe('Designed Sender authoring form', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('shows the sender-specific fixed scientific scope without mutating the Project', () => {
    const project = createDemoBfnProject();
    const snapshot = structuredClone(project);
    const onAdd = vi.fn(() => ({ ok: false as const, issues: [] }));
    render(<BfnDesignedSenderAuthoring project={project} onBack={vi.fn()} onAdd={onAdd} />);
    const form = screen.getByRole('form', { name: '设计发送模块' });

    expect(within(form).getByLabelText('输入量')).toHaveTextContent('浓度');
    expect(within(form).getByLabelText('输出量')).toHaveTextContent('产生速率');
    expect(form).toHaveTextContent('输出为信号产生速率，不代表细胞外浓度。');
    expect(
      within(form)
        .getAllByRole('radio', { name: /Hill/u })
        .map((radio) => radio.getAttribute('value')),
    ).toEqual(['hill_activation', 'hill_repression']);
    expect(form).not.toHaveTextContent('线性传递');
    expect(form).not.toHaveTextContent('多输入独立作用');
    expect(form).not.toHaveTextContent('动态');
    expect(form).not.toHaveTextContent('任意公式');
    expect(within(form).queryByText('响应模式')).not.toBeInTheDocument();
    expect(within(form).queryByText('动力学')).not.toBeInTheDocument();
    expect(within(form).queryByRole('radio', { name: '稳态响应' })).not.toBeInTheDocument();
    expect(within(form).queryByRole('radio', { name: '一阶动态响应' })).not.toBeInTheDocument();
    expect(within(form).queryByLabelText('时间常数 τ')).not.toBeInTheDocument();
    expect(within(form).queryByLabelText('初始输出')).not.toBeInTheDocument();

    const controlUnit = within(form).getByRole('combobox', { name: '浓度单位' });
    expect(
      within(controlUnit)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['M', 'mM', 'uM', 'nM', 'pM']);
    const outputUnit = within(form).getByRole('combobox', { name: '产生速率单位' });
    expect(
      within(outputUnit)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['nM/h', 'uM/h']);

    const knownSignal = within(form).getByRole('combobox', { name: '已知 AHL/HSL 信号' });
    expect(within(knownSignal).getAllByRole('option')).toHaveLength(26);
    expect(within(knownSignal).getAllByRole('option')[0]?.getAttribute('value')).toMatch(/^ahl\./u);
    expect(within(form).getByRole('combobox', { name: '模型依据' })).toHaveValue(
      'proposed_unbuilt_design',
    );
    const uncertainty = within(form).getByRole('combobox', { name: '不确定性' });
    expect(
      within(uncertainty)
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['not_recorded', 'none', 'parameter_interval_envelope']);
    expect(project).toEqual(snapshot);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('switches between exact known identity selection and a normal custom signal', async () => {
    const user = userEvent.setup();
    render(
      <BfnDesignedSenderAuthoring
        project={createDemoBfnProject()}
        onBack={vi.fn()}
        onAdd={vi.fn(() => ({ ok: false as const, issues: [] }))}
      />,
    );
    const form = screen.getByRole('form', { name: '设计发送模块' });

    expect(within(form).getByRole('combobox', { name: '已知 AHL/HSL 信号' })).toBeInTheDocument();
    await user.click(within(form).getByRole('radio', { name: '自定义信号' }));
    expect(
      within(form).queryByRole('combobox', { name: '已知 AHL/HSL 信号' }),
    ).not.toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: '自定义信号' })).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: '自定义信号' }), 'Project signal X');
    await user.click(within(form).getByRole('radio', { name: '已知 AHL/HSL 信号' }));
    expect(within(form).getByRole('combobox', { name: '已知 AHL/HSL 信号' })).toBeInTheDocument();
  });

  it('requires complete parameter intervals and preserves Context and evidence gates', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(() => ({ ok: false as const, issues: [] }));
    render(
      <BfnDesignedSenderAuthoring
        project={createDemoBfnProject()}
        onBack={vi.fn()}
        onAdd={onAdd}
      />,
    );
    const form = screen.getByRole('form', { name: '设计发送模块' });
    await fillRequiredFields(user, form);
    await user.selectOptions(
      within(form).getByRole('combobox', { name: '不确定性' }),
      'parameter_interval_envelope',
    );

    expect(within(form).getAllByLabelText('区间下限')).toHaveLength(4);
    expect(within(form).getAllByLabelText('区间上限')).toHaveLength(4);
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));
    expect(
      within(form).getAllByText('参数区间需要为 K、n、基础与最大产生速率填写上下限').length,
    ).toBeGreaterThan(0);
    expect(onAdd).not.toHaveBeenCalled();

    await user.selectOptions(within(form).getByLabelText('不确定性'), 'not_recorded');
    await user.type(within(form).getByLabelText('宿主'), 'unknown');
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));
    expect(within(form).getByText('请输入具体实验条件')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    await user.clear(within(form).getByLabelText('宿主'));
    await user.selectOptions(within(form).getByLabelText('模型依据'), 'measured_single_context');
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));
    expect(within(form).getByText('该模型依据需要填写来源')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('submits one generic module with the selected authoritative identity and no graph side effects', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const outcomes: ReturnType<typeof materializeUserDefinedStaticModule>[] = [];
    const onAdd = vi.fn(
      (
        draft: UserDefinedFunctionalModuleDraft,
        authoritativeSignal: DesignedSenderSignalIdentity | null,
      ) => {
        const outcome = materializeUserDefinedStaticModule(draft, project, {
          authoritativeEntities: authoritativeSignal
            ? [
                {
                  id: authoritativeSignal.entityId,
                  displayName: authoritativeSignal.displayName,
                },
              ]
            : [],
        });
        outcomes.push(outcome);
        return outcome;
      },
    );
    render(<BfnDesignedSenderAuthoring project={project} onBack={vi.fn()} onAdd={onAdd} />);
    const form = screen.getByRole('form', { name: '设计发送模块' });

    await fillRequiredFields(user, form);
    await user.selectOptions(within(form).getByLabelText('浓度单位'), 'uM');
    await user.selectOptions(within(form).getByLabelText('产生速率单位'), 'uM/h');
    await user.click(within(form).getByRole('radio', { name: 'Hill 抑制' }));
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const outcome = outcomes[0];
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome?.ok) return;
    const module = outcome.nextProject.network.modules.at(-1)!;
    const signal = onAdd.mock.calls[0]?.[1];
    expect(module).toMatchObject({
      kind: 'functional_module',
      authoring: { name: '用户设计发送模块' },
      implementationState: 'unspecified',
      implementationIds: [],
      evidenceGrade: 'proposed_unbuilt_design',
    });
    expect(module.inputPorts[0]).toMatchObject({
      authoring: { name: '诱导控制' },
      quantityType: 'concentration',
      unit: 'uM',
    });
    expect(module.outputPorts[0]).toMatchObject({
      authoring: { name: 'AHL 产生速率' },
      entity: signal?.entityId,
      quantityType: 'production_rate',
      unit: 'uM/h',
    });
    expect(module.modelVariants[0]).toMatchObject({
      family: 'hill_repression',
      uncertaintyMethod: 'not_recorded',
    });
    expect(module.modelVariants).toHaveLength(1);
    expect(module.activeModelIds.static).toBe(module.modelVariants[0]?.id);
    expect(module.activeModelIds).not.toHaveProperty('dynamic');
    expect(module.modelVariants[0]).not.toHaveProperty('tau');
    expect(module.modelVariants[0]).not.toHaveProperty('initialState');
    expect(module.modelVariants[0]).not.toHaveProperty('steadyStateResponse');
    expect(module).not.toHaveProperty('dynamics');
    expect(module).not.toHaveProperty('timeRangeHours');
    expect(
      outcome.nextProject.registry.entities.some((entity) => entity.id === signal?.entityId),
    ).toBe(false);
    expect(outcome.nextProject.network.inputSources).toEqual(project.network.inputSources);
    expect(outcome.nextProject.network.edges).toEqual(project.network.edges);
    expect(outcome.nextProject.network.outputMonitors).toEqual(project.network.outputMonitors);
  });

  it('cancels without submitting or modifying the Project', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const snapshot = structuredClone(project);
    const onBack = vi.fn();
    const onAdd = vi.fn(() => ({ ok: false as const, issues: [] }));
    render(<BfnDesignedSenderAuthoring project={project} onBack={onBack} onAdd={onAdd} />);

    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
    expect(project).toEqual(snapshot);
  });
});

async function fillRequiredFields(
  user: ReturnType<typeof userEvent.setup>,
  form: HTMLElement,
): Promise<void> {
  await user.type(within(form).getByLabelText('名称'), '用户设计发送模块');
  await user.type(within(form).getByLabelText('输入名称'), '诱导控制');
  await user.selectOptions(within(form).getByLabelText('控制实体'), '3OC6-HSL');
  await user.type(within(form).getByLabelText('输出名称'), 'AHL 产生速率');
}
