import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { BfnPlatformPage } from './BfnPlatformPage';
import { createDemoBfnProject } from './fixtures';
import type { BfnProject } from './types';

describe('BFN Platform Signal Pool authoring workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('adds a custom Signal Pool as one atomic edit with no automatic graph or runtime action', async () => {
    const user = userEvent.setup();
    const baseline = createDemoBfnProject();
    baseline.network.mode = 'static';
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
    expect(within(catalogDialog).getByText('信号池')).toBeInTheDocument();
    await user.click(within(catalogDialog).getByRole('button', { name: '创建信号池' }));

    const authoringDialog = screen.getByRole('dialog', { name: '信号池' });
    const form = within(authoringDialog).getByRole('form', { name: '信号池' });
    const add = within(form).getByRole('button', { name: '添加到网络' });
    expect(add).toBeDisabled();
    await user.type(within(form).getByLabelText('名称'), '正交信号池');
    await user.type(within(form).getByLabelText('可选说明'), '逐字保留的说明');
    await user.click(within(form).getByRole('radio', { name: '自定义信号' }));
    await user.type(within(form).getByRole('textbox', { name: '自定义信号' }), 'Signal Z');
    await user.clear(within(form).getByLabelText('初始浓度'));
    await user.type(within(form).getByLabelText('初始浓度'), '2');
    expect(add).toBeEnabled();
    await user.click(add);

    await waitFor(() =>
      expect(latestProject.network.modules).toHaveLength(baseline.network.modules.length + 1),
    );
    expect(onProjectChange).toHaveBeenCalledTimes(1);
    expect(onRunCreated).not.toHaveBeenCalled();
    expect(latestProject.network.mode).toBe('static');
    expect(latestProject.network.inputSources).toEqual(baseline.network.inputSources);
    expect(latestProject.network.outputMonitors).toEqual(baseline.network.outputMonitors);
    expect(latestProject.network.edges).toEqual(baseline.network.edges);
    expect(latestProject.registry.validityDomains).toHaveLength(
      baseline.registry.validityDomains.length + 1,
    );
    expect(latestProject.registry.entities).toHaveLength(baseline.registry.entities.length + 1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText('信号池已加入网络。请显式连接产生速率输入和浓度输出。'),
    ).toBeInTheDocument();

    const module = latestProject.network.modules.at(-1);
    if (!module) throw new Error('Signal Pool was not materialized.');
    expect(module).toMatchObject({
      authoring: { name: '正交信号池', description: '逐字保留的说明' },
      activeModelIds: { dynamic: expect.any(String) },
      inputPorts: [{ displayName: { zh: '产生速率' }, quantityType: 'production_rate' }],
      outputPorts: [{ displayName: { zh: '浓度' }, quantityType: 'concentration' }],
    });
    expect(Object.keys(module.activeModelIds)).toEqual(['dynamic']);
    const customEntity = latestProject.registry.entities.at(-1);
    expect(customEntity).toMatchObject({ displayName: 'Signal Z', origin: 'user_defined' });

    const inspector = view.container.querySelector<HTMLElement>('.bfn-inspector');
    if (!inspector) throw new Error('Inspector was not rendered.');
    expect(within(inspector).getByRole('heading', { name: '正交信号池' })).toBeInTheDocument();
    expect(within(inspector).getByText('产生速率', { selector: 'strong' })).toBeInTheDocument();
    expect(within(inspector).getByText('浓度', { selector: 'strong' })).toBeInTheDocument();

    const addedSnapshot = structuredClone(latestProject);
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(latestProject).toEqual(baseline));
    expect(latestProject.registry.entities).not.toContainEqual(customEntity);

    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(latestProject).toEqual(addedSnapshot));
    expect(latestProject.registry.entities.at(-1)).toEqual(customEntity);
    expect(onRunCreated).not.toHaveBeenCalled();
  }, 20_000);
});
