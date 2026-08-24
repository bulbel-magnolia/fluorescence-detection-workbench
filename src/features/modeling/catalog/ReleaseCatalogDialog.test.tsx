import { createRef, useRef, useState, type JSX } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import {
  filterReleaseCatalogComponents,
  getReleaseCatalogFilterOptions,
  loadReleaseCatalogPresentation,
} from './releaseCatalogPresentation';
import { ReleaseCatalogDialog, type ReleaseCatalogDialogProps } from './ReleaseCatalogDialog';

const presentation = loadReleaseCatalogPresentation();

function baseProps(overrides: Partial<ReleaseCatalogDialogProps> = {}): ReleaseCatalogDialogProps {
  return {
    open: true,
    presentation,
    triggerRef: createRef<HTMLButtonElement>(),
    selectedNodeName: 'Signal integration',
    onClose: vi.fn(),
    onApply: vi.fn(),
    onAttachCitation: vi.fn(),
    onDetach: vi.fn(),
    ...overrides,
  };
}

function resultOptions(): HTMLElement[] {
  return within(screen.getByRole('listbox')).queryAllByRole('option');
}

function StatefulDialog({ onClosed }: { onClosed: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)}>
        打开元件库
      </button>
      <ReleaseCatalogDialog
        {...baseProps()}
        open={open}
        triggerRef={triggerRef}
        onClose={() => {
          onClosed();
          setOpen(false);
        }}
      />
    </>
  );
}

describe('ReleaseCatalogDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('shows the complete 42 / 52 / 20 release summary and only four primary filters', async () => {
    const user = userEvent.setup();
    render(<ReleaseCatalogDialog {...baseProps()} />);

    expect(
      screen.getByText('发布版 1.1 · 42 个元件 · 52 条响应 · 20 条可运行'),
    ).toBeInTheDocument();
    expect(screen.getByText('42 个候选')).toBeInTheDocument();
    expect(resultOptions()).toHaveLength(42);

    const filters = screen.getByRole('region', { name: '元件库筛选' });
    expect(within(filters).getByRole('textbox', { name: '搜索元件' })).toBeInTheDocument();
    expect(within(filters).getAllByRole('combobox')).toHaveLength(3);
    expect(within(filters).getByRole('combobox', { name: '可用状态' })).toBeInTheDocument();
    expect(within(filters).getByRole('combobox', { name: '输入分子' })).toBeInTheDocument();
    expect(within(filters).getByRole('combobox', { name: '宿主' })).toBeInTheDocument();
    expect(within(filters).queryByRole('combobox', { name: '类别' })).not.toBeInTheDocument();
    expect(within(filters).queryByRole('combobox', { name: '序列状态' })).not.toBeInTheDocument();

    const search = within(filters).getByRole('textbox', { name: '搜索元件' });
    await user.type(search, 'recv.kylilis2018.rhl.v1');
    expect(resultOptions()).toHaveLength(1);
    expect(resultOptions()[0]).toHaveAccessibleName(/recv\.kylilis2018\.rhl\.v1/u);

    await user.click(within(filters).getByRole('button', { name: '清除筛选' }));
    await user.selectOptions(
      within(filters).getByRole('combobox', { name: '可用状态' }),
      'runtime-demo',
    );
    expect(resultOptions()).toHaveLength(7);

    await user.click(within(filters).getByRole('button', { name: '清除筛选' }));
    const options = getReleaseCatalogFilterOptions(presentation);
    const inputMolecule = options.inputMolecules[0]!;
    await user.selectOptions(
      within(filters).getByRole('combobox', { name: '输入分子' }),
      inputMolecule.id,
    );
    expect(resultOptions()).toHaveLength(
      filterReleaseCatalogComponents(presentation, {
        inputMolecule: inputMolecule.id,
      }).length,
    );

    await user.click(within(filters).getByRole('button', { name: '清除筛选' }));
    const host = options.hosts.find((candidate) => candidate === 'Pseudomonas putida')!;
    expect(host).toBeDefined();
    await user.selectOptions(within(filters).getByRole('combobox', { name: '宿主' }), host);
    expect(resultOptions()).toHaveLength(
      filterReleaseCatalogComponents(presentation, { host }).length,
    );
  }, 20_000);

  it('keeps citation secondary and applies the selected runnable response as the primary action', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onAttachCitation = vi.fn();
    const component = presentation.components.find((candidate) =>
      candidate.responseVariants.some((response) => response.runnable),
    )!;
    render(<ReleaseCatalogDialog {...baseProps({ onApply, onAttachCitation })} />);

    const search = screen.getByRole('textbox', { name: '搜索元件' });
    await user.type(search, component.id);
    expect(screen.getByRole('heading', { name: component.names.zh })).toBeInTheDocument();

    const attach = screen.getByRole('button', { name: '附加来源引用' });
    const apply = screen.getByRole('button', { name: '应用到网络' });
    expect(attach).toBeEnabled();
    expect(attach).toHaveClass('button--secondary');
    expect(apply).toBeEnabled();
    expect(apply).toHaveClass('button--primary');

    await user.click(attach);
    expect(onAttachCitation).toHaveBeenCalledWith(component);
    expect(onApply).not.toHaveBeenCalled();

    await user.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      componentId: component.id,
      runnable: true,
    });
  });

  it('allows citation but blocks network application for a reference-only response', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onAttachCitation = vi.fn();
    const component = presentation.components.find(
      (candidate) =>
        candidate.usageStatus === 'reference-only' && candidate.responseVariants.length > 0,
    )!;
    render(<ReleaseCatalogDialog {...baseProps({ onApply, onAttachCitation })} />);

    await user.type(screen.getByRole('textbox', { name: '搜索元件' }), component.id);
    expect(screen.getByRole('heading', { name: component.names.zh })).toBeInTheDocument();
    expect(
      screen.getByText('该条目保留证据和兼容性信息，不会作为定量响应写入网络。'),
    ).toBeInTheDocument();

    const apply = screen.getByRole('button', { name: '应用到网络' });
    const attach = screen.getByRole('button', { name: '附加来源引用' });
    expect(apply).toBeDisabled();
    expect(attach).toBeEnabled();
    await user.click(apply);
    expect(onApply).not.toHaveBeenCalled();
    await user.click(attach);
    expect(onAttachCitation).toHaveBeenCalledWith(component);
  });

  it('supports result-list keyboard navigation, Escape, close, and focus restoration', async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<StatefulDialog onClosed={onClosed} />);

    const trigger = screen.getByRole('button', { name: '打开元件库' });
    await user.click(trigger);
    expect(screen.getByRole('heading', { name: '证据元件库' })).toHaveFocus();

    const options = resultOptions();
    options[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveFocus();
    expect(options[1]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Escape}');
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '关闭元件库' }));
    expect(onClosed).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
