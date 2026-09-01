import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { createDemoBfnProject } from './fixtures';
import { BfnPlatformPage } from './BfnPlatformPage';
import type { BfnProject } from './types';

describe('BFN Platform user-defined module authoring workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('commits one atomic project edit and preserves the exact object graph through Undo/Redo', async () => {
    const user = userEvent.setup();
    const baseline = createDemoBfnProject();
    const onProjectChange = vi.fn();
    const onRunCreated = vi.fn();
    let latestProject = baseline;

    function Harness() {
      const [project, setProject] = useState(baseline);
      const updateProject = (next: BfnProject): void => {
        latestProject = next;
        onProjectChange(next);
        setProject(next);
      };
      return (
        <BfnPlatformPage
          project={project}
          runs={[]}
          onProjectChange={updateProject}
          onRunCreated={onRunCreated}
        />
      );
    }

    const view = render(<Harness />);
    const networkIndex = view.container.querySelector<HTMLElement>('.bfn-network-index');
    if (!networkIndex) throw new Error('Network index was not rendered.');

    await user.click(within(networkIndex).getByRole('button', { name: '添加模块' }));
    const catalogDialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.click(within(catalogDialog).getByRole('button', { name: '开始定义' }));

    const authoringDialog = screen.getByRole('dialog', { name: '自定义功能模块' });
    const form = within(authoringDialog).getByRole('form', { name: '自定义功能模块' });
    await user.type(within(form).getByLabelText('名称'), '用户响应模块');
    await user.type(within(form).getByLabelText('输入名称'), '诱导输入');
    await user.selectOptions(within(form).getByLabelText('输入实体'), '3OC6-HSL');
    await user.type(within(form).getByLabelText('输出名称'), '生成速率');
    await user.type(within(form).getByLabelText('输出实体显示名称'), 'Product X');
    await user.selectOptions(within(form).getByLabelText('输出量类型'), 'production_rate');
    await user.selectOptions(within(form).getByLabelText('输出单位'), 'nM/h');
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));

    await waitFor(() =>
      expect(latestProject.network.modules).toHaveLength(baseline.network.modules.length + 1),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText('自定义功能模块已加入网络，请在画布中显式连接所需输入。'),
    ).toBeInTheDocument();
    expect(onProjectChange).toHaveBeenCalledTimes(1);
    expect(onRunCreated).not.toHaveBeenCalled();
    expect(latestProject.network.edges).toEqual(baseline.network.edges);
    expect(latestProject.network.inputSources).toEqual(baseline.network.inputSources);
    expect(latestProject.network.outputMonitors).toEqual(baseline.network.outputMonitors);

    const addedModule = latestProject.network.modules.at(-1);
    if (!addedModule) throw new Error('Authored module was not materialized.');
    expect(addedModule.authoring?.name).toBe('用户响应模块');
    expect(addedModule.inputPorts[0]?.authoring?.name).toBe('诱导输入');
    expect(addedModule.outputPorts[0]?.authoring?.name).toBe('生成速率');
    expect(addedModule.implementationState).toBe('unspecified');
    expect(addedModule.implementationIds).toEqual([]);

    const inspector = view.container.querySelector<HTMLElement>('.bfn-inspector');
    if (!inspector) throw new Error('Inspector was not rendered.');
    expect(within(inspector).getByRole('heading', { name: '用户响应模块' })).toBeInTheDocument();
    expect(within(inspector).getByText('诱导输入', { selector: 'strong' })).toBeInTheDocument();
    expect(within(inspector).getByText('3OC6-HSL · 浓度 · nM')).toBeInTheDocument();
    expect(within(inspector).getByText('生成速率', { selector: 'strong' })).toBeInTheDocument();
    expect(within(inspector).getByText('Product X · 生成速率 · nM/h')).toBeInTheDocument();
    expect(within(inspector).getByText('未记录')).toBeInTheDocument();
    expect(within(inspector).getByText('实验条件未记录。')).toBeInTheDocument();

    const addedSnapshot = structuredClone(latestProject);
    const addedModuleId = addedModule.id;
    const addedEntityIds = latestProject.registry.entities.map((entity) => entity.id);

    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(latestProject).toEqual(baseline));
    expect(screen.queryByRole('heading', { name: '用户响应模块' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(latestProject).toEqual(addedSnapshot));
    expect(latestProject.network.modules.at(-1)?.id).toBe(addedModuleId);
    expect(latestProject.registry.entities.map((entity) => entity.id)).toEqual(addedEntityIds);

    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(latestProject).toEqual(baseline));
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() => expect(latestProject).toEqual(addedSnapshot));
    expect(latestProject.network.modules.at(-1)?.id).toBe(addedModuleId);
    expect(latestProject.registry.entities.map((entity) => entity.id)).toEqual(addedEntityIds);
  }, 20_000);

  it('materializes a dynamic module as paired models and keeps add, Undo, and Redo atomic', async () => {
    const user = userEvent.setup();
    const baseline = createDemoBfnProject();
    const onProjectChange = vi.fn();
    const onRunCreated = vi.fn();
    let latestProject = baseline;

    function Harness() {
      const [project, setProject] = useState(baseline);
      const updateProject = (next: BfnProject): void => {
        latestProject = next;
        onProjectChange(next);
        setProject(next);
      };
      return (
        <BfnPlatformPage
          project={project}
          runs={[]}
          onProjectChange={updateProject}
          onRunCreated={onRunCreated}
        />
      );
    }

    const view = render(<Harness />);
    const networkIndex = view.container.querySelector<HTMLElement>('.bfn-network-index');
    if (!networkIndex) throw new Error('Network index was not rendered.');

    await user.click(within(networkIndex).getByRole('button', { name: '添加模块' }));
    const catalogDialog = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.click(within(catalogDialog).getByRole('button', { name: '开始定义' }));

    const authoringDialog = screen.getByRole('dialog', { name: '自定义功能模块' });
    const form = within(authoringDialog).getByRole('form', { name: '自定义功能模块' });
    await user.click(within(form).getByRole('radio', { name: '一阶动态响应' }));
    await user.type(within(form).getByLabelText('名称'), '动态用户响应模块');
    await user.type(within(form).getByLabelText('输入名称'), '诱导输入');
    await user.selectOptions(within(form).getByLabelText('输入实体'), '3OC6-HSL');
    await user.type(within(form).getByLabelText('输出名称'), '生成速率');
    await user.type(within(form).getByLabelText('输出实体显示名称'), 'Product X');
    await user.selectOptions(within(form).getByLabelText('输出量类型'), 'production_rate');
    await user.selectOptions(within(form).getByLabelText('输出单位'), 'nM/h');
    await user.clear(within(form).getByLabelText('时间常数 τ'));
    await user.type(within(form).getByLabelText('时间常数 τ'), '2');
    await user.clear(within(form).getByLabelText('初始输出'));
    await user.type(within(form).getByLabelText('初始输出'), '0.25');
    await user.selectOptions(within(form).getByRole('combobox', { name: '时间有效性' }), 'defined');
    await user.type(within(form).getByLabelText('起始时间'), '0');
    await user.type(within(form).getByLabelText('结束时间'), '8');
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));

    await waitFor(() =>
      expect(latestProject.network.modules).toHaveLength(baseline.network.modules.length + 1),
    );
    expect(onProjectChange).toHaveBeenCalledTimes(1);
    expect(onRunCreated).not.toHaveBeenCalled();
    expect(latestProject.network.mode).toBe(baseline.network.mode);
    expect(latestProject.network.edges).toEqual(baseline.network.edges);
    expect(latestProject.network.inputSources).toEqual(baseline.network.inputSources);
    expect(latestProject.network.outputMonitors).toEqual(baseline.network.outputMonitors);

    const addedModule = latestProject.network.modules.at(-1);
    if (!addedModule) throw new Error('Dynamic authored module was not materialized.');
    expect(addedModule.modelVariants.map((model) => model.mode)).toEqual(['static', 'dynamic']);
    expect(addedModule.activeModelIds.dynamic).toBeDefined();
    const staticModel = addedModule.modelVariants.find((model) => model.mode === 'static');
    const dynamicModel = addedModule.modelVariants.find((model) => model.mode === 'dynamic');
    if (!staticModel || !dynamicModel || dynamicModel.mode !== 'dynamic') {
      throw new Error('Paired static/dynamic models were not materialized.');
    }
    expect(dynamicModel.steadyStateResponse).toEqual(staticModel.response);
    expect(dynamicModel.tau).toMatchObject({ value: 2, unit: 'h' });
    expect(dynamicModel.initialState).toBe(0.25);
    const dynamicDomain = latestProject.registry.validityDomains.find(
      (domain) => domain.id === dynamicModel.validityDomainId,
    );
    expect(dynamicDomain?.timeRangeHours).toEqual([0, 8]);

    const addedSnapshot = structuredClone(latestProject);
    const addedModuleId = addedModule.id;
    const changeCountAfterAdd = onProjectChange.mock.calls.length;
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(latestProject).toEqual(baseline));
    expect(onProjectChange).toHaveBeenCalledTimes(changeCountAfterAdd + 1);

    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(latestProject).toEqual(addedSnapshot));
    expect(onProjectChange).toHaveBeenCalledTimes(changeCountAfterAdd + 2);
    expect(latestProject.network.modules.at(-1)?.id).toBe(addedModuleId);
    expect(latestProject.network.edges).toEqual(baseline.network.edges);
    expect(latestProject.network.inputSources).toEqual(baseline.network.inputSources);
    expect(latestProject.network.outputMonitors).toEqual(baseline.network.outputMonitors);
    expect(latestProject.network.mode).toBe(baseline.network.mode);
  }, 20_000);
});
