import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { BfnPlatformPage } from './BfnPlatformPage';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalog/catalogBfnAdapter';
import { createBfnComputationSignature } from './computationSignature';
import { createDemoBfnProject } from './fixtures';
import type { BfnProject, BfnStaticModel } from './types';

function catalogBackedProject(): BfnProject {
  const project = createDemoBfnProject();
  project.network.inputSources = [];
  project.network.modules = [];
  project.network.edges = [];
  project.registry.validityDomains = [];
  const candidate = buildBfnCatalogRuntimeCandidate(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id);
  const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-temporal-ui-catalog',
    modulePosition: { x: 360, y: 180 },
    createInputSource: false,
  });
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  instantiated.nextProject.network.mode = 'dynamic';
  return instantiated.nextProject;
}

function selectEdge(user: ReturnType<typeof userEvent.setup>, index: number) {
  return user.click(screen.getAllByRole('button', { name: '选择连接' })[index]!);
}

describe('BFN temporal and compatibility UI integration', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('shows built-in first-order execution as stateful with unrecorded temporal evidence', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';

    render(<BfnPlatformPage project={project} />);

    const region = screen.getByRole('region', { name: '时间行为' });
    expect(region).toHaveTextContent('有状态动力学');
    expect(region).toHaveTextContent('时间证据未记录');
    expect(region).not.toHaveTextContent(/stateful_dynamic|not_recorded/u);
  });

  it('shows static execution as a steady-state response', () => {
    render(<BfnPlatformPage project={createDemoBfnProject()} />);

    const region = screen.getByRole('region', { name: '时间行为' });
    expect(region).toHaveTextContent('稳态响应');
  });

  it('shows a dynamic Catalog receiver as an instantaneous steady-state T0 approximation', () => {
    render(<BfnPlatformPage project={catalogBackedProject()} />);

    const region = screen.getByRole('region', { name: '时间行为' });
    expect(region).toHaveTextContent('瞬时稳态近似');
    expect(region).toHaveTextContent('T0 稳态响应证据');
    expect(region).toHaveTextContent('不引入内部延迟或状态记忆');
    expect(region).not.toHaveTextContent(/quasi_static|t0_steady_state/u);
  });

  it('shows compatible nM-to-M representation conversion without changing edge identity', async () => {
    const project = createDemoBfnProject();
    project.network.modules[0]!.inputPorts[0]!.unit = 'M';
    const before = structuredClone(project);
    const signature = createBfnComputationSignature(project);
    const user = userEvent.setup();
    render(<BfnPlatformPage project={project} />);

    await selectEdge(user, 0);

    expect(screen.getByText('可以直接连接')).toBeInTheDocument();
    expect(screen.getByText(/nM → M；运行时自动换算数值表示/u)).toBeInTheDocument();
    expect(project.network.edges[0]?.mapping).toBe('identity');
    expect(project).toEqual(before);
    expect(createBfnComputationSignature(project)).toBe(signature);
  });

  it('does not highlight unit normalization when the signal entity is incompatible', async () => {
    const project = createDemoBfnProject();
    const target = project.network.modules[0]!.inputPorts[0]!;
    target.entity = 'C4-HSL';
    target.unit = 'M';
    const user = userEvent.setup();
    render(<BfnPlatformPage project={project} />);

    await selectEdge(user, 0);

    expect(screen.getByText('不能直接连接')).toBeInTheDocument();
    expect(screen.queryByText(/运行时自动换算数值表示/u)).not.toBeInTheDocument();
  });

  it('explains that production rate cannot become concentration without an explicit process', async () => {
    const project = createDemoBfnProject();
    project.network.inputSources[0]!.outputPort.quantityType = 'production_rate';
    project.network.inputSources[0]!.outputPort.unit = 'nM/h';
    const user = userEvent.setup();
    render(<BfnPlatformPage project={project} />);

    await selectEdge(user, 0);

    expect(screen.getByText('不能直接连接')).toBeInTheDocument();
    expect(screen.getByText(/需要显式加入累积或清除过程/u)).toBeInTheDocument();
    expect(screen.getByText(/不会自动积分或插入隐藏模块/u)).toBeInTheDocument();
  });

  it('keeps a reported-text context difference nonblocking and exposes per-field status', async () => {
    const project = createDemoBfnProject();
    const context = {
      ...structuredClone(project.registry.contexts[0]!),
      id: 'context-ui-reported-difference',
      host: 'A differently reported host',
    };
    project.registry.contexts.push(context);
    const reporter = project.network.modules[1]!;
    const model = reporter.modelVariants.find(
      (candidate): candidate is BfnStaticModel =>
        candidate.mode === 'static' && candidate.id === reporter.activeModelIds.static,
    );
    if (!model) throw new Error('Expected reporter static model.');
    model.contextId = context.id;
    const user = userEvent.setup();
    render(<BfnPlatformPage project={project} />);

    await selectEdge(user, 1);

    const assessment = screen.getByText('部分条件无法确认').closest('section');
    if (!assessment) throw new Error('Expected context assessment.');
    expect(assessment).toHaveTextContent('文本表述差异或缺失字段不会阻止连接');
    expect(within(assessment).getByText('宿主')).toBeInTheDocument();
    expect(within(assessment).getByText('未确认')).toBeInTheDocument();
  });
});
