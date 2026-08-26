import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../app/App';
import i18n from '../i18n';
import { useAppStore } from '../store/appStore';
import { ModelingPage } from './ModelingPage';

describe('Batch 3.5 scientific desktop structure', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
    useAppStore.setState({ section: 'modeling' });
  });

  it('keeps modeling in one desktop shell without the legacy web header', () => {
    render(<App />);

    expect(document.querySelector('.top-bar')).not.toBeInTheDocument();
    expect(document.querySelector('.bfn-project-toolbar')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '检测' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '建模' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '系统' })).toBeInTheDocument();
  });

  it('places editor history and analysis controls in one desktop toolbar', () => {
    render(<ModelingPage />);

    const runToolbar = screen.getByRole('region', { name: '分析工具栏' });
    expect(within(runToolbar).getByRole('button', { name: '撤销' })).toBeInTheDocument();
    expect(within(runToolbar).getByRole('button', { name: '重做' })).toBeInTheDocument();
    expect(within(runToolbar).getByRole('button', { name: '稳态分析' })).toBeInTheDocument();
    expect(within(runToolbar).getByRole('button', { name: '设置输入' })).toBeInTheDocument();
    expect(within(runToolbar).getByRole('button', { name: '运行稳态分析' })).toBeInTheDocument();
  });

  it('uses property rows with aligned values and an on-demand explanation', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    const inspector = screen.getByRole('heading', { name: 'AHL 响应' }).closest('aside');
    expect(inspector).not.toBeNull();
    if (!inspector) throw new Error('Property inspector was not rendered.');

    const grid = inspector.querySelector('.bfn-property-grid');
    expect(grid).toBeInTheDocument();
    expect(grid?.querySelectorAll('.bfn-property-row')).toHaveLength(4);
    expect(within(inspector).getByText('0.030')).toBeInTheDocument();
    expect(within(inspector).getByText('10.000')).toBeInTheDocument();
    expect(within(grid as HTMLElement).getByText('nM')).toBeInTheDocument();

    await user.click(within(inspector).getByRole('button', { name: /半响应浓度/ }));
    expect(within(inspector).getByRole('note')).toHaveTextContent(
      '达到约一半最大响应时所需的3OC6-HSL 浓度。',
    );
  });

  it('keeps mathematical-model disclosure and direct connection handles available', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    const mathematicalModel = screen.getByText('数学模型').closest('details');
    expect(mathematicalModel).not.toHaveAttribute('open');
    await user.click(screen.getByText('数学模型'));
    expect(mathematicalModel).toHaveAttribute('open');
    expect(mathematicalModel).toHaveTextContent('y =');

    const canvas = screen.getByRole('application', { name: '生物网络画布' });
    expect(canvas.querySelector('[data-bfn-port-handle="true"]')).toBeInTheDocument();
    expect(canvas.querySelector('[data-bfn-input-handle="true"]')).toBeInTheDocument();
  });

  it('keeps the module drawer actionable while presenting modules as list rows', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('button', { name: '添加模块' }));
    const drawer = screen.getByRole('dialog', { name: 'AHL/HSL 文献目录' });
    await user.click(within(drawer).getByText('内置示例模块'));
    expect(drawer.querySelectorAll('.bfn-module-row')).toHaveLength(3);
    expect(within(drawer).getAllByRole('button', { name: '添加到网络' })).toHaveLength(3);

    await user.click(within(drawer).getAllByRole('button', { name: '添加到网络' })[2]!);
    expect(screen.queryByRole('dialog', { name: 'AHL/HSL 文献目录' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.queryByRole('button', { name: '双输入响应, 功能模块' })).not.toBeInTheDocument();
  });

  it('keeps the data-first result dock functional', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    const dock = document.querySelector('.bfn-result-panel');
    expect(dock).toHaveAttribute('data-open', 'false');
    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));
    expect(dock).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('img', { name: '输入—输出响应' })).toBeInTheDocument();
    expect(within(dock as HTMLElement).getByText('当前结果')).toBeInTheDocument();
  });

  it('keeps inverse design ranked and localizes the same structure to English', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('tab', { name: '按目标设计' }));
    await user.click(screen.getByRole('button', { name: '生成候选方案' }));
    expect(document.querySelectorAll('.bfn-candidate')).toHaveLength(3);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('推荐方案')).toBeInTheDocument();

    await i18n.changeLanguage('en-US');
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Network design' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Design to target' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate candidates' })).toBeInTheDocument();
    });
  });
});
