import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { BFN_PROJECT_STORAGE_KEY } from '../features/bfn/repository';
import { ModelingPage } from './ModelingPage';

describe('biological network design workspace', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('opens with a task-oriented network canvas and plain-language inspector', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    expect(screen.getByRole('heading', { name: '生物网络设计' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /搭建网络/ })).toHaveAttribute('aria-selected', 'true');
    const canvas = screen.getByRole('application', { name: '生物网络画布' });
    expect(canvas).toBeInTheDocument();
    expect(screen.getAllByText('AHL 响应').length).toBeGreaterThan(0);
    expect(screen.getAllByText('报告表达').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3OC6-HSL 浓度 → 启动子活性').length).toBeGreaterThan(0);
    expect(screen.getAllByText('启动子活性 → 报告信号').length).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: '3OC6-HSL · 浓度 · nM' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /3OC6-HSL · 3OC6-HSL/ })).not.toBeInTheDocument();
    expect(within(canvas).queryByText(/Hill 响应|一阶动态响应|线性响应/)).not.toBeInTheDocument();
    expect(screen.queryByText(/BFN-IR|uⱼ|DAG|完整模型/)).not.toBeInTheDocument();

    const moduleInspector = screen.getByRole('heading', { name: 'AHL 响应' }).closest('aside');
    expect(moduleInspector).not.toBeNull();
    if (!moduleInspector) throw new Error('Module inspector was not rendered.');
    expect(
      within(moduleInspector).getByText(
        '根据 3OC6-HSL 浓度计算启动子活性，用于描述 AHL 信号变化引起的启动子响应。',
      ),
    ).toBeInTheDocument();
    expect(
      within(moduleInspector).getByText('3OC6-HSL 浓度很低时的基础启动子活性。'),
    ).toBeInTheDocument();
    expect(within(moduleInspector).getByText('示例实验条件')).toBeInTheDocument();
    expect(within(moduleInspector).getByText('模型依据')).toBeInTheDocument();
    expect(within(moduleInspector).getByText('关联数据')).toBeInTheDocument();
    expect(within(moduleInspector).getByText('演示剂量—响应数据')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '选择连接' })[0]!);
    const inspector = screen.getByRole('heading', { name: '连接' }).closest('aside');
    expect(inspector).not.toBeNull();
    if (!inspector) throw new Error('Connection inspector was not rendered.');
    expect(within(inspector).getByText('从')).toBeInTheDocument();
    expect(within(inspector).getByText('连接到')).toBeInTheDocument();
    expect(
      within(inspector).queryByText(/weight|bias|delay|noise|identity/i),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull());
  });

  it('explains reporter expression with a biological flow and parameter meanings', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('button', { name: '报告表达, 功能模块' }));
    const inspector = screen.getByRole('heading', { name: '报告表达' }).closest('aside');
    expect(inspector).not.toBeNull();
    if (!inspector) throw new Error('Reporter inspector was not rendered.');

    expect(
      within(inspector).getByText(
        '根据启动子活性计算报告信号。在动态分析中，可以观察报告信号随时间变化的过程。',
      ),
    ).toBeInTheDocument();
    expect(within(inspector).getByText('启动子活性')).toBeInTheDocument();
    expect(within(inspector).getByText('报告信号')).toBeInTheDocument();
    expect(within(inspector).getAllByText('响应系数').length).toBeGreaterThan(0);
    expect(
      within(inspector).getByText('决定输入变化对报告信号变化幅度的影响。'),
    ).toBeInTheDocument();
    expect(within(inspector).getAllByText('基础输出').length).toBeGreaterThan(0);
    expect(within(inspector).getByText('输入为零或很低时仍保留的报告信号。')).toBeInTheDocument();
  });

  it('runs steady-state analysis and presents the result at task level', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('tab', { name: /查看响应/ }));
    expect(screen.getByRole('combobox', { name: '输入方式' })).toHaveValue('working_range');
    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));

    expect(await screen.findByRole('img', { name: '输入—输出响应' })).toBeInTheDocument();
    expect(screen.getByText('近似效果良好')).toBeInTheDocument();
    expect(screen.getByText('在参数适用范围内')).toBeInTheDocument();
    expect(screen.getByText('当前输出')).toBeInTheDocument();
  });

  it('computes a fixed point without showing a simplified relationship', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('tab', { name: /查看响应/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: '输入方式' }), 'fixed_value');
    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));

    expect(await screen.findByText('未生成')).toBeInTheDocument();
    expect(
      screen.getByText('单个输入值只计算对应输出；使用数值范围后可查看简化关系。'),
    ).toBeInTheDocument();
  });

  it('switches to dynamic analysis and exposes response metrics', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('button', { name: '动态分析' }));
    await user.click(screen.getByRole('tab', { name: /查看响应/ }));
    expect(screen.getByRole('combobox', { name: '输入方式' })).toHaveValue('step');
    await user.click(screen.getByRole('button', { name: '运行动态分析' }));

    expect(await screen.findByRole('img', { name: '动态响应' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '动态响应指标' })).toBeInTheDocument();
    expect(screen.getByText('DC gain')).toBeInTheDocument();
    expect(screen.queryByText('近似效果良好')).not.toBeInTheDocument();
  });

  it('explains how to resolve incompatible signal connections', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: '从' }),
      'source-ahl::source-ahl-out',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: '连接到' }),
      'module-reporter::module-reporter-in',
    );

    expect(await screen.findByText(/信号不一致/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '建立连接' })).toBeDisabled();
  });

  it('adds a module from the library without inventing a connection', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('tab', { name: /模块库/ }));
    const ahlCard = screen.getByRole('heading', { name: 'AHL 响应' }).closest('article');
    expect(ahlCard).not.toBeNull();
    if (!ahlCard) throw new Error('AHL catalog card was not rendered.');
    expect(within(ahlCard).getByText('根据 3OC6-HSL 浓度计算启动子活性。')).toBeInTheDocument();
    expect(within(ahlCard).getByText('3OC6-HSL 浓度 → 启动子活性')).toBeInTheDocument();
    expect(within(ahlCard).getByText('模型依据')).toBeInTheDocument();

    const addButtons = screen.getAllByRole('button', { name: '添加到网络' });
    await user.click(addButtons[2]!);

    expect(screen.getByRole('button', { name: '双输入响应, 功能模块' })).toBeInTheDocument();
    const inspector = screen.getByRole('heading', { name: '双输入响应' }).closest('aside');
    expect(inspector).not.toBeNull();
    if (!inspector) throw new Error('Dual-input inspector was not rendered.');
    expect(screen.getAllByText('输入信号 A + 输入信号 B → 综合响应').length).toBeGreaterThan(0);
    expect(within(inspector).getByText('两个输入按彼此独立的作用计算。')).toBeInTheDocument();
    const primaryParameters = inspector.querySelector<HTMLElement>('.bfn-parameter-list');
    expect(primaryParameters).not.toBeNull();
    if (!primaryParameters) throw new Error('Primary parameter list was not rendered.');
    expect(within(primaryParameters).getByText('输入 1 半响应点')).toBeInTheDocument();
    expect(within(primaryParameters).getByText('输入 2 贡献系数')).toBeInTheDocument();
    expect(within(primaryParameters).queryByText(/^(K1|n1|α1|K2|n2|α2)$/)).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(BFN_PROJECT_STORAGE_KEY) ?? '{}') as {
      network?: { modules?: unknown[]; edges?: unknown[] };
    };
    expect(stored.network?.modules).toHaveLength(3);
    expect(stored.network?.edges).toHaveLength(3);
  });

  it('returns several clearly ranked target-design candidates', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('tab', { name: /按目标设计/ }));
    await user.click(screen.getByRole('button', { name: '生成候选方案' }));

    expect(screen.getByText('平衡型方案（演示）')).toBeInTheDocument();
    expect(screen.getByText('推荐方案')).toBeInTheDocument();
    expect(screen.getAllByText('其他方案')).toHaveLength(2);
    expect(screen.getAllByText('查看详细评分')).toHaveLength(3);
  });

  it('localizes the task-oriented workflow to English', async () => {
    render(<ModelingPage />);
    await i18n.changeLanguage('en-US');

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Build network/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /View response/ })).toBeInTheDocument();
      expect(screen.getByText('Demo project')).toBeInTheDocument();
      expect(
        screen.queryByText(/Complete model first|Identity propagation/),
      ).not.toBeInTheDocument();
    });
  });

  it('keeps project reset in the secondary actions menu and requires confirmation', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByText('更多操作'));
    await user.click(screen.getByRole('button', { name: '重置演示项目' }));
    const dialog = screen.getByRole('alertdialog', { name: '重置演示项目？' });
    expect(dialog).toHaveTextContent('当前本地模型和运行记录将被内置演示项目覆盖');
    expect(within(dialog).getByRole('button', { name: '保留当前项目' })).toHaveFocus();
  });
});
