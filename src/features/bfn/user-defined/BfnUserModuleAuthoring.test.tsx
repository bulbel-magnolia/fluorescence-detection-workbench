import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { createDemoBfnProject } from '../fixtures';
import type { UserDefinedFunctionalModuleDraft } from './userModuleContract';
import { materializeUserDefinedStaticModule } from './userModuleMaterialization';
import { BfnUserModuleAuthoring } from './BfnUserModuleAuthoring';

describe('static user-defined module authoring', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('offers only the four frozen static model families and separates Port roles from Entities', () => {
    const project = createDemoBfnProject();
    const snapshot = structuredClone(project);
    const onBack = vi.fn();
    const onAdd = vi.fn((draft: UserDefinedFunctionalModuleDraft) =>
      materializeUserDefinedStaticModule(draft, project),
    );
    render(<BfnUserModuleAuthoring project={project} onBack={onBack} onAdd={onAdd} />);

    const form = screen.getByRole('form', { name: '自定义功能模块' });
    const model = within(form).getByRole('combobox', { name: '响应模型' });
    expect(
      within(model)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Hill 激活', 'Hill 抑制', '线性传递', '多输入独立作用']);
    expect(form).not.toHaveTextContent('动态模型');
    expect(form).not.toHaveTextContent('一阶动力学');
    expect(form).not.toHaveTextContent('Identity');
    expect(form).not.toHaveTextContent('lookup table');
    expect(form).not.toHaveTextContent('任意公式');
    expect(within(form).getByLabelText('输入名称')).toBeInTheDocument();
    expect(within(form).getByLabelText('输入实体')).toBeInTheDocument();
    expect(within(form).getByLabelText('输出名称')).toBeInTheDocument();
    expect(within(form).getByLabelText('输出实体显示名称')).toBeInTheDocument();

    expect(project).toEqual(snapshot);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows family-specific fields and supports at least two independent inputs', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    render(
      <BfnUserModuleAuthoring
        project={project}
        onBack={vi.fn()}
        onAdd={(draft) => materializeUserDefinedStaticModule(draft, project)}
      />,
    );
    const form = screen.getByRole('form', { name: '自定义功能模块' });
    const model = within(form).getByRole('combobox', { name: '响应模型' });

    expect(within(form).getByLabelText('K')).toBeInTheDocument();
    expect(within(form).getByLabelText('n')).toBeInTheDocument();
    expect(within(form).getByLabelText('最小输出')).toBeInTheDocument();
    expect(within(form).getByLabelText('最大输出')).toBeInTheDocument();

    await user.selectOptions(model, 'linear_transfer');
    expect(within(form).getByLabelText('响应系数')).toBeInTheDocument();
    expect(within(form).getByLabelText('基础输出')).toBeInTheDocument();
    expect(within(form).queryByLabelText('K')).not.toBeInTheDocument();

    await user.selectOptions(model, 'independent_inputs');
    expect(within(form).getAllByLabelText(/输入.*名称/u)).toHaveLength(2);
    expect(within(form).getAllByLabelText('作用方式')).toHaveLength(2);
    expect(within(form).getAllByLabelText('权重')).toHaveLength(2);
    expect(form).toHaveTextContent('按各输入独立作用计算，未假定协同或竞争。');
    await user.click(within(form).getByRole('button', { name: '添加输入' }));
    expect(within(form).getAllByLabelText(/输入.*名称/u)).toHaveLength(3);
  });

  it('limits uncertainty choices and blocks incomplete intervals, placeholder Context, and missing provenance', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const onAdd = vi.fn((draft: UserDefinedFunctionalModuleDraft) =>
      materializeUserDefinedStaticModule(draft, project),
    );
    render(<BfnUserModuleAuthoring project={project} onBack={vi.fn()} onAdd={onAdd} />);
    const form = screen.getByRole('form', { name: '自定义功能模块' });

    const uncertainty = within(form).getByRole('combobox', { name: '不确定性' });
    expect(
      within(uncertainty)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['未记录', '未提供不确定性模型', '参数区间']);
    await user.selectOptions(uncertainty, 'parameter_interval_envelope');
    expect(within(form).getAllByLabelText('区间下限')).toHaveLength(4);
    expect(within(form).getAllByLabelText('区间上限')).toHaveLength(4);

    await fillRequiredIdentity(user, form);
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));
    expect(within(form).getByText('参数区间需要为全部模型参数填写上下限')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    await user.selectOptions(uncertainty, 'not_recorded');
    await user.type(within(form).getByLabelText('宿主'), 'unknown');
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));
    expect(within(form).getByText('请输入具体实验条件')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    await user.clear(within(form).getByLabelText('宿主'));
    await user.selectOptions(
      within(form).getByRole('combobox', { name: '模型依据' }),
      'measured_single_context',
    );
    expect(within(form).getByLabelText('来源类型')).toBeInTheDocument();
    expect(within(form).getByLabelText('来源记录')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));
    expect(within(form).getByText('该模型依据需要填写来源')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('creates one static FunctionalModule and no automatic network objects', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const outcomes: ReturnType<typeof materializeUserDefinedStaticModule>[] = [];
    const onAdd = vi.fn((draft: UserDefinedFunctionalModuleDraft) => {
      const outcome = materializeUserDefinedStaticModule(draft, project);
      outcomes.push(outcome);
      return outcome;
    });
    render(<BfnUserModuleAuthoring project={project} onBack={vi.fn()} onAdd={onAdd} />);
    const form = screen.getByRole('form', { name: '自定义功能模块' });

    await fillRequiredIdentity(user, form);
    await user.selectOptions(within(form).getByLabelText('输出量类型'), 'production_rate');
    await user.selectOptions(within(form).getByLabelText('输出单位'), 'nM/h');
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const outcome = outcomes[0];
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome?.ok) return;
    const next = outcome.nextProject;
    expect(next.network.modules).toHaveLength(project.network.modules.length + 1);
    expect(next.network.edges).toEqual(project.network.edges);
    expect(next.network.inputSources).toEqual(project.network.inputSources);
    expect(next.network.outputMonitors).toEqual(project.network.outputMonitors);
    const module = next.network.modules.at(-1)!;
    expect(module).toMatchObject({
      authoring: { name: '用户响应模块' },
      implementationState: 'unspecified',
      implementationIds: [],
      evidenceGrade: 'proposed_unbuilt_design',
    });
    expect(module.inputPorts[0]).toMatchObject({
      authoring: { name: '诱导输入' },
      entity: '3OC6-HSL',
    });
    expect(module.outputPorts[0]).toMatchObject({
      authoring: { name: '生成速率' },
      quantityType: 'production_rate',
      unit: 'nM/h',
    });
    expect(module.modelVariants[0]).toMatchObject({
      mode: 'static',
      uncertaintyMethod: 'not_recorded',
    });
    expect(module.modelVariants[0]).not.toHaveProperty('tau');
  });

  it('creates a new Entity only when requested and reuses an existing Entity exactly', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const outcomes: ReturnType<typeof materializeUserDefinedStaticModule>[] = [];
    render(
      <BfnUserModuleAuthoring
        project={project}
        onBack={vi.fn()}
        onAdd={(draft) => {
          const outcome = materializeUserDefinedStaticModule(draft, project);
          outcomes.push(outcome);
          return outcome;
        }}
      />,
    );
    const form = screen.getByRole('form', { name: '自定义功能模块' });
    await fillRequiredIdentity(user, form);
    await user.selectOptions(within(form).getByLabelText('输入实体来源'), 'new');
    await user.type(within(form).getByLabelText('输入实体显示名称'), 'Novel inducer');
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));

    const outcome = outcomes[0];
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome?.ok) return;
    expect(outcome.nextProject.registry.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ origin: 'user_defined', displayName: 'Novel inducer' }),
      ]),
    );
    expect(outcome.nextProject.registry.entities.some((entity) => entity.id === '3OC6-HSL')).toBe(
      false,
    );
  });
});

async function fillRequiredIdentity(
  user: ReturnType<typeof userEvent.setup>,
  form: HTMLElement,
): Promise<void> {
  await user.type(within(form).getByLabelText('名称'), '用户响应模块');
  await user.type(within(form).getByLabelText('输入名称'), '诱导输入');
  await user.selectOptions(within(form).getByLabelText('输入实体'), '3OC6-HSL');
  await user.type(within(form).getByLabelText('输出名称'), '生成速率');
  await user.type(within(form).getByLabelText('输出实体显示名称'), 'Product X');
}
