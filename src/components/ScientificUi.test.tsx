import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BoundaryNotice } from './BoundaryNotice';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { StatusPill } from './StatusPill';
import { TaskProgress } from './TaskProgress';
import { ValidationSummary } from './ValidationSummary';

describe('scientific UI primitives', () => {
  it('exposes action hierarchy and a readable disabled reason', () => {
    render(
      <Button variant="primary" disabled disabledReason="网络存在 2 个阻断问题。">
        运行静态仿真
      </Button>,
    );

    const button = screen.getByRole('button', { name: '运行静态仿真' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('button--primary');
    expect(button).toHaveAccessibleDescription('网络存在 2 个阻断问题。');
  });

  it('pairs status text with a semantic tone and icon', () => {
    render(<StatusPill label="存在外推" tone="warning" />);

    const status = screen.getByText('存在外推');
    expect(status).toHaveAttribute('data-tone', 'warning');
    expect(status.querySelector('svg')).toBeInTheDocument();
  });

  it('keeps scientific boundaries visible instead of hiding them in a tooltip', () => {
    render(
      <BoundaryNotice kind="assumption" title="多输入假设">
        默认独立，输入间交互关系未验证
      </BoundaryNotice>,
    );

    expect(screen.getByRole('note', { name: '多输入假设' })).toHaveTextContent(
      '默认独立，输入间交互关系未验证',
    );
    expect(screen.getByText('默认独立，输入间交互关系未验证')).not.toHaveAttribute('title');
  });

  it('renders validation readiness and actionable issues', async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    const { rerender } = render(
      <ValidationSummary title="运行前验证" readyMessage="网络可以运行。" issues={[]} />,
    );

    expect(screen.getByText('网络可以运行。')).toBeInTheDocument();

    rerender(
      <ValidationSummary
        title="运行前验证"
        readyMessage="网络可以运行。"
        issues={[
          {
            id: 'quantity-mismatch',
            severity: 'error',
            message: '量类型不匹配。请插入积累模块。',
            actionLabel: '定位到连接',
            onAction: onLocate,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: '定位到连接' }));
    expect(onLocate).toHaveBeenCalledOnce();
  });

  it('describes an empty state with one explicit next action', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <EmptyState
        title="当前网络还没有输入源"
        description="添加输入源后，可以设置固定值、工作范围或动态信号。"
        action={<Button onClick={onAdd}>添加输入源</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: '添加输入源' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('focuses the safe action in destructive confirmations', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="重置演示项目？"
        description="当前本地项目和运行记录将被覆盖。"
        recoverability="此操作无法撤销。"
        confirmLabel="重置演示项目"
        cancelLabel="保留当前项目"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const cancel = screen.getByRole('button', { name: '保留当前项目' });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.click(screen.getByRole('button', { name: '重置演示项目' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('announces concrete long-running work and supports cancellation', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <TaskProgress
        label="正在计算工作域，共 400 个采样点。"
        progress={62}
        cancelLabel="取消仿真"
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '62');
    await user.click(screen.getByRole('button', { name: '取消仿真' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
