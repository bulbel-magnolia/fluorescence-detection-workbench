import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { useAppStore } from '../store/appStore';
import { ModelingPage } from './ModelingPage';

describe('Batch 3.6 desktop surface consolidation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
    useAppStore.setState({ section: 'modeling' });
  });

  it('places project and run controls in one continuous top surface', () => {
    render(<ModelingPage />);

    const topSurface = document.querySelector<HTMLElement>('.bfn-top-surface');
    expect(topSurface).not.toBeNull();
    if (!topSurface) throw new Error('The BFN top surface was not rendered.');

    expect(topSurface).toContainElement(document.querySelector('.bfn-project-toolbar'));
    expect(topSurface).toContainElement(document.querySelector('.bfn-run-toolbar'));
    expect(within(topSurface).getByRole('button', { name: '撤销' })).toBeInTheDocument();
    expect(within(topSurface).getByRole('button', { name: '运行稳态分析' })).toBeInTheDocument();
  });

  it('separates project metadata from operational save status', async () => {
    render(<ModelingPage />);

    const toolbar = document.querySelector<HTMLElement>('.bfn-project-toolbar');
    expect(toolbar).not.toBeNull();
    if (!toolbar) throw new Error('The BFN project toolbar was not rendered.');

    expect(within(toolbar).queryByText('当前项目')).not.toBeInTheDocument();
    expect(within(toolbar).getByText('DEMO')).toHaveClass('metadata-label');
    expect(toolbar.querySelector('.status-pill')).not.toBeInTheDocument();
    const savedStatus = await within(toolbar).findByText('已自动保存');
    expect(savedStatus).toHaveClass('inline-status');
    expect(savedStatus).toHaveAttribute('data-tone', 'success');
  });

  it('uses evidence classification instead of success styling for a normal model basis', () => {
    render(<ModelingPage />);

    const evidence = document.querySelector('.bfn-evidence-banner');
    expect(evidence).toHaveAttribute('data-evidence-tone', 'evidence');
    expect(evidence).toHaveTextContent('数据驱动模型');
    expect(evidence).not.toHaveAttribute('data-evidence-tone', 'validated');
  });

  it('joins the network workspace and result dock in one workbench surface', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    const workbench = document.querySelector<HTMLElement>('.bfn-workbench-surface');
    expect(workbench).not.toBeNull();
    if (!workbench) throw new Error('The BFN workbench surface was not rendered.');

    expect(workbench).toContainElement(document.querySelector('.bfn-network-workspace'));
    expect(workbench).toContainElement(document.querySelector('.bfn-result-panel'));

    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));
    const resultDock = document.querySelector<HTMLElement>('.bfn-result-panel');
    expect(resultDock).not.toBeNull();
    if (!resultDock) throw new Error('The result dock was not rendered.');
    const resultActions = resultDock.querySelector('.bfn-result-panel__actions');
    expect(resultActions?.querySelector('.status-pill')).not.toBeInTheDocument();
    expect(resultActions?.querySelector('.inline-status[data-tone="accent"]')).toHaveTextContent(
      '当前结果',
    );
  });
});
