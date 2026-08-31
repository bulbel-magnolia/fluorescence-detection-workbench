import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { BfnPlatformPage } from './BfnPlatformPage';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalog/catalogBfnAdapter';
import { createDemoBfnProject } from './fixtures';
import type { BfnProject } from './types';

const RECEIVER_RESPONSE_ID = 'resp.kylilis2018.lux.3oc6';
const RECEIVER_MODULE_ID = 'module-designed-sender-receiver';

describe('BFN Platform Designed Sender authoring workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('adds one ordinary module atomically, round-trips exact identities, and blocks rate-to-concentration wiring', async () => {
    const user = userEvent.setup();
    const candidate = buildBfnCatalogRuntimeCandidate(RECEIVER_RESPONSE_ID);
    const baseline = projectWithReceiver(candidate);
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
    await user.click(within(catalogDialog).getByRole('button', { name: '开始设计' }));

    const authoringDialog = screen.getByRole('dialog', { name: '设计发送模块' });
    const form = within(authoringDialog).getByRole('form', { name: '设计发送模块' });
    await user.type(within(form).getByLabelText('名称'), 'Lux 信号发送模块');
    await user.type(within(form).getByLabelText('输入名称'), '诱导控制');
    await user.selectOptions(within(form).getByLabelText('控制实体'), '3OC6-HSL');
    await user.type(within(form).getByLabelText('输出名称'), '3OC6-HSL 产生速率');
    await user.selectOptions(
      within(form).getByRole('combobox', { name: '已知 AHL/HSL 信号' }),
      'ahl.3oc6.l',
    );
    await user.click(within(form).getByRole('button', { name: '添加到网络' }));

    await waitFor(() =>
      expect(latestProject.network.modules).toHaveLength(baseline.network.modules.length + 1),
    );
    expect(onProjectChange).toHaveBeenCalledTimes(1);
    expect(onRunCreated).not.toHaveBeenCalled();
    expect(latestProject.network.edges).toEqual(baseline.network.edges);
    expect(latestProject.network.inputSources).toEqual(baseline.network.inputSources);
    expect(latestProject.network.outputMonitors).toEqual(baseline.network.outputMonitors);
    expect(latestProject.registry.entities).toEqual(baseline.registry.entities);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText('设计发送模块已加入网络，请显式连接控制输入和下游产生速率过程。'),
    ).toBeInTheDocument();

    const addedModule = latestProject.network.modules.at(-1);
    if (!addedModule) throw new Error('Designed Sender was not materialized.');
    const outputPort = addedModule.outputPorts[0];
    if (!outputPort) throw new Error('Designed Sender output was not materialized.');
    expect(addedModule).toMatchObject({
      kind: 'functional_module',
      authoring: { origin: 'user_defined', name: 'Lux 信号发送模块' },
      implementationState: 'unspecified',
      implementationIds: [],
    });
    expect(outputPort).toMatchObject({
      authoring: { name: '3OC6-HSL 产生速率' },
      entity: candidate.inputEntity,
      quantityType: 'production_rate',
      unit: 'nM/h',
    });
    expect('catalogReference' in addedModule.modelVariants[0]!).toBe(false);

    const inspector = view.container.querySelector<HTMLElement>('.bfn-inspector');
    if (!inspector) throw new Error('Inspector was not rendered.');
    expect(
      within(inspector).getByRole('heading', { name: 'Lux 信号发送模块' }),
    ).toBeInTheDocument();
    expect(within(inspector).getByText('诱导控制', { selector: 'strong' })).toBeInTheDocument();
    expect(within(inspector).getByText('3OC6-HSL · 浓度 · nM')).toBeInTheDocument();
    expect(
      within(inspector).getByText('3OC6-HSL 产生速率', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      within(inspector).getByText(`${candidate.inputEntity} · 生成速率 · nM/h`),
    ).toBeInTheDocument();
    expect(within(inspector).getByText('候选设计')).toBeInTheDocument();
    expect(within(inspector).getByText('实验条件未记录。')).toBeInTheDocument();

    const addedSnapshot = structuredClone(latestProject);
    const addedModuleId = addedModule.id;
    const addedOutputEntity = outputPort.entity;

    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(latestProject).toEqual(baseline));
    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(latestProject).toEqual(addedSnapshot));
    expect(latestProject.network.modules.at(-1)?.id).toBe(addedModuleId);
    expect(latestProject.network.modules.at(-1)?.outputPorts[0]?.entity).toBe(addedOutputEntity);

    const receiver = latestProject.network.modules.find(
      (module) => module.id === RECEIVER_MODULE_ID,
    );
    const receiverInput = receiver?.inputPorts[0];
    if (!receiverInput) throw new Error('Receiver input was not materialized.');
    await user.click(screen.getByText('精确连接'));
    await user.selectOptions(
      screen.getByRole('combobox', { name: '从' }),
      `${addedModuleId}::${outputPort.id}`,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: '连接到' }),
      `${RECEIVER_MODULE_ID}::${receiverInput.id}`,
    );

    expect(screen.getByText('不能直接连接')).toBeInTheDocument();
    expect(screen.getByText(/需要显式加入累积或清除过程/u)).toBeInTheDocument();
    expect(screen.getByText(/不会自动积分或插入隐藏模块/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '建立连接' })).toBeDisabled();
    expect(latestProject.network.edges).toEqual(baseline.network.edges);
    expect(onRunCreated).not.toHaveBeenCalled();
  }, 25_000);
});

function projectWithReceiver(candidate: ReturnType<typeof buildBfnCatalogRuntimeCandidate>) {
  const outcome = instantiateCatalogResponseInBfnProject(createDemoBfnProject(), candidate, {
    moduleId: RECEIVER_MODULE_ID,
    modulePosition: { x: 720, y: 180 },
    createInputSource: false,
  });
  if (!outcome.ok) throw new Error(outcome.error.code);
  return outcome.nextProject;
}
