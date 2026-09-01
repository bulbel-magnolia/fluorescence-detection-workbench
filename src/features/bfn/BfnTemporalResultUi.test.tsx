import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { BfnResultWorkspace } from './BfnResultWorkspace';
import { BfnRunProvenance } from './BfnRunProvenance';
import { createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';

function dynamicProject(kind: 'quasi' | 'mixed' | 'stateful') {
  const project = createDemoBfnProject();
  project.network.mode = 'dynamic';
  if (kind === 'quasi') {
    for (const module of project.network.modules) {
      const staticModelId = module.activeModelIds.static;
      if (staticModelId === undefined) throw new Error('Expected paired demo model.');
      module.activeModelIds = { static: staticModelId };
    }
  } else if (kind === 'mixed') {
    const reporter = project.network.modules[1]!;
    const staticModelId = reporter.activeModelIds.static;
    if (staticModelId === undefined) throw new Error('Expected paired demo model.');
    reporter.activeModelIds = { static: staticModelId };
  }
  return project;
}

function renderResult(kind: 'quasi' | 'mixed' | 'stateful') {
  const project = dynamicProject(kind);
  const result = runBfnSimulation(project, '2026-08-28T03:00:00.000Z');
  render(
    <BfnResultWorkspace
      project={project}
      result={result}
      runs={[result]}
      resultFreshness="current"
      resultPanelOpen
      onTogglePanel={vi.fn()}
      onRunSimulation={vi.fn()}
      onRequestClearRuns={vi.fn()}
      onSelectRun={vi.fn()}
    />,
  );
  return { project, result };
}

describe('BFN temporal result presentation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('labels an all-quasi-static curve and metrics with the correct scientific boundary', () => {
    renderResult('quasi');

    expect(screen.getByText('全部模块使用瞬时稳态近似')).toBeInTheDocument();
    expect(screen.getByText(/该曲线是各时间点稳态响应组成的瞬时稳态近似/u)).toBeInTheDocument();
    expect(screen.getByText('时间轨迹描述')).toBeInTheDocument();
    expect(screen.getByText(/不是模块动力学参数/u)).toBeInTheDocument();
  });

  it('identifies mixed time handling without changing the recorded numerical metrics', () => {
    const { result } = renderResult('mixed');

    expect(screen.getByText('部分模块使用瞬时稳态近似')).toBeInTheDocument();
    expect(screen.getByText('动态响应指标')).toBeInTheDocument();
    const steadyValue = result.dynamicMetrics?.steadyValue;
    if (steadyValue === null || steadyValue === undefined) {
      throw new Error('Expected a finite steady value for an accumulator-free dynamic path.');
    }
    expect(screen.getAllByText(steadyValue.toFixed(3)).length).toBeGreaterThan(0);
  });

  it('renders legacy time handling as unrecorded without inferring from the current project', () => {
    const project = dynamicProject('stateful');
    const legacy = runBfnSimulation(project);
    delete legacy.temporalSnapshot;
    delete legacy.contextApplicabilitySnapshot;
    render(
      <BfnResultWorkspace
        project={project}
        result={legacy}
        runs={[legacy]}
        resultFreshness="current"
        resultPanelOpen
        onTogglePanel={vi.fn()}
        onRunSimulation={vi.fn()}
        onRequestClearRuns={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    );

    expect(screen.getByText('时间处理未记录')).toBeInTheDocument();
    expect(screen.getByText(/不会根据当前项目推断其历史时间处理/u)).toBeInTheDocument();
    expect(screen.queryByText('全部模块使用有状态动力学')).not.toBeInTheDocument();
  });

  it('shows localized temporal and context provenance without exposing enum identifiers', async () => {
    const result = runBfnSimulation(dynamicProject('mixed'));
    const user = userEvent.setup();
    const { container } = render(<BfnRunProvenance result={result} />);

    await user.click(screen.getByText('运行信息'));

    expect(screen.getByText('时间执行摘要')).toBeInTheDocument();
    expect(screen.getByText('时间证据摘要')).toBeInTheDocument();
    expect(screen.getByText('实验上下文适用性')).toBeInTheDocument();
    expect(screen.getByText('已比较的模块实验上下文一致')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/quasi_static|stateful_dynamic|not_recorded/u);
  });

  it('marks legacy temporal and context provenance as not recorded without recalculation', async () => {
    const legacy = runBfnSimulation(dynamicProject('stateful'));
    delete legacy.temporalSnapshot;
    delete legacy.contextApplicabilitySnapshot;
    const user = userEvent.setup();
    render(<BfnRunProvenance result={legacy} />);

    await user.click(screen.getByText('运行信息'));

    expect(screen.getAllByText('本次运行未记录时间处理信息')).toHaveLength(2);
    expect(screen.getByText('本次运行未记录实验上下文适用性')).toBeInTheDocument();
    expect(screen.queryByText('有状态动力学 2')).not.toBeInTheDocument();
  });

  it('shows a nonblocking notice when comparison time handling differs', async () => {
    const project = dynamicProject('stateful');
    const current = runBfnSimulation(project, '2026-08-28T03:00:00.000Z');
    const comparison = runBfnSimulation(dynamicProject('quasi'), '2026-08-28T02:00:00.000Z');
    const user = userEvent.setup();
    render(
      <BfnResultWorkspace
        project={project}
        result={current}
        runs={[current, comparison]}
        resultFreshness="current"
        resultPanelOpen
        onTogglePanel={vi.fn()}
        onRunSimulation={vi.fn()}
        onRequestClearRuns={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('与历史运行对比'), comparison.id);

    expect(screen.getByText(/两条运行的时间处理摘要不同/u)).toBeInTheDocument();
  });

  it('shows incomplete temporal comparison information when either snapshot is absent', async () => {
    const project = dynamicProject('stateful');
    const current = runBfnSimulation(project, '2026-08-28T03:00:00.000Z');
    const legacy = runBfnSimulation(project, '2026-08-28T02:00:00.000Z');
    delete legacy.temporalSnapshot;
    const user = userEvent.setup();
    render(
      <BfnResultWorkspace
        project={project}
        result={current}
        runs={[current, legacy]}
        resultFreshness="current"
        resultPanelOpen
        onTogglePanel={vi.fn()}
        onRunSimulation={vi.fn()}
        onRequestClearRuns={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('与历史运行对比'), legacy.id);

    expect(screen.getByText(/时间语义对比不完整/u)).toBeInTheDocument();
  });
});
