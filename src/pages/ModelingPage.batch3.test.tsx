import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { BFN_PROJECT_STORAGE_KEY } from '../features/bfn/repository';
import { BfnPlatformPage as ModelingPage } from '../features/bfn/BfnPlatformPage';

describe('biological network design Batch 3 workbench', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses a compact project toolbar with primary workspace tabs and file actions', () => {
    render(<ModelingPage />);

    const toolbar = document.querySelector('.bfn-project-toolbar');
    expect(screen.getByRole('heading', { name: '生物网络演示项目' })).toBeInTheDocument();
    expect(toolbar).toHaveTextContent('AHL 响应与报告网络');
    expect(screen.getByRole('tab', { name: '网络设计' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '按目标设计' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(toolbar).toContainElement(screen.getByRole('button', { name: '导入模型' }));
    expect(toolbar).toContainElement(screen.getByRole('button', { name: '导出模型' }));
  });

  it('keeps secondary module information collapsed until requested', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    expect(screen.getByText('关键参数')).toBeInTheDocument();
    const keyParameters = document.querySelector('.bfn-inspector-block .bfn-parameter-list');
    expect(keyParameters?.querySelectorAll('article').length).toBeLessThanOrEqual(4);

    for (const label of ['详细参数', '实验条件与数据', '数学模型', '高级信息']) {
      expect(screen.getByText(label).closest('details')).not.toHaveAttribute('open');
    }

    await user.click(screen.getByText('数学模型'));
    const mathematicalModel = screen.getByText('数学模型').closest('details');
    expect(mathematicalModel).toHaveAttribute('open');
    expect(mathematicalModel).toHaveTextContent('95%');
    expect(mathematicalModel?.querySelector('.bfn-math-parameters')).toBeInTheDocument();
    expect(screen.getByText(/y =/)).toBeInTheDocument();
  });

  it('shows the current analysis mode in the input property grid', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('button', { name: '3OC6-HSL浓度 · nM' }));
    const inspector = document.querySelector('.bfn-inspector__body');
    const propertyGrid = inspector?.querySelector('.bfn-property-grid');

    expect(propertyGrid).toHaveTextContent('分析模式');
    expect(propertyGrid).toHaveTextContent('稳态分析');
    expect(propertyGrid?.closest('details')).toBeNull();
  });

  it('keeps the output quantity in the output object primary layer', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    await user.click(screen.getByRole('button', { name: '报告信号相对表达水平' }));
    const inspector = document.querySelector('.bfn-inspector__body');

    expect(inspector).toHaveTextContent('报告信号');
    expect(inspector).toHaveTextContent('表达水平');
    expect(inspector).toHaveTextContent('相对值');
    expect(inspector?.querySelector('.bfn-property-grid')).toBeInTheDocument();
    expect(inspector?.querySelector('details')).toBeNull();
  });

  it('opens the result dock after a run and lets the user collapse it again', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);

    const dock = document.querySelector('.bfn-result-panel');
    expect(dock).toHaveAttribute('data-open', 'false');
    expect(screen.getByRole('button', { name: '展开分析结果' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));
    expect(dock).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('button', { name: '收起分析结果' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('button', { name: '收起分析结果' }));
    expect(dock).toHaveAttribute('data-open', 'false');
  });

  it('debounces project autosave for 320 ms and exposes saving and saved states', () => {
    vi.useFakeTimers();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<ModelingPage />);

    expect(screen.getByText('保存中…')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(screen.getByText('已自动保存')).toBeInTheDocument();

    setItem.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '动态分析' }));
    expect(screen.getByText('保存中…')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(319);
    });
    expect(setItem).not.toHaveBeenCalledWith(BFN_PROJECT_STORAGE_KEY, expect.any(String));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('已自动保存')).toBeInTheDocument();
    expect(setItem).toHaveBeenCalledWith(BFN_PROJECT_STORAGE_KEY, expect.any(String));
  });

  it('shows an explicit error state when local autosave fails', () => {
    vi.useFakeTimers();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    render(<ModelingPage />);

    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(screen.getByText('本地保存失败')).toBeInTheDocument();
  });
});
