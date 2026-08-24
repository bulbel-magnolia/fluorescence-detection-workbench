import { createRef, useRef, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { CatalogEntryDetail } from './CatalogEntryDetail';
import { loadEvidenceCatalog } from './catalogLoader';
import { EvidenceCatalogDialog, type EvidenceCatalogDialogProps } from './EvidenceCatalogDialog';

const loadedCatalog = loadEvidenceCatalog();
if (loadedCatalog.status !== 'ready') throw new Error(loadedCatalog.message);

const cadR = loadedCatalog.index.byId.get('sensor.cadr');
const reporterEntry = loadedCatalog.index.entries.find(
  (entry) =>
    entry.modeling.compatibleNodeKinds.includes('reporter') &&
    entry.evidence.reviewStatus === 'passed',
);
if (!cadR || !reporterEntry) throw new Error('Catalog fixture lacks required passed entries');

const baseProps = (): Omit<EvidenceCatalogDialogProps, 'open' | 'triggerRef'> => ({
  index: loadedCatalog.index,
  selectedNodeName: 'Saponin input',
  selectedNetworkRole: 'processing',
  onClose: vi.fn(),
  onAttach: vi.fn(),
  onDetach: vi.fn(),
});

function StatefulDialog({
  onClosed,
  triggerLabel,
}: {
  onClosed: () => void;
  triggerLabel: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      <EvidenceCatalogDialog
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

describe('EvidenceCatalogDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('searches identifiers and applies the public catalog filters', async () => {
    const user = userEvent.setup();
    render(
      <EvidenceCatalogDialog {...baseProps()} open triggerRef={createRef<HTMLButtonElement>()} />,
    );

    const search = screen.getByRole('searchbox', { name: '搜索文献元件库' });
    for (const query of ['sensor.cadr', 'CadR.10Z', '33444502']) {
      await user.clear(search);
      await user.type(search, query);
      expect(screen.getByRole('button', { name: /sensor\.cadr/i })).toBeInTheDocument();
    }

    await user.clear(search);
    await user.selectOptions(screen.getByRole('combobox', { name: '网络角色' }), 'processing');
    await user.selectOptions(
      screen.getByRole('combobox', { name: '输入分子' }),
      'Cd(II), supplied as CdSO4',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: '输出分子' }),
      'Preg-regulated gfp transcription and GFP fluorescence',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: '参数可用状态' }),
      'parameterizable-after-calibration',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '宿主' }), 'Escherichia coli');
    await user.selectOptions(screen.getByRole('combobox', { name: '菌株' }), 'EK317');
    const evidenceFilter = screen.getByRole('combobox', { name: '证据等级' });
    expect(
      within(evidenceFilter).getByRole('option', { name: /A.*多来源审阅证据/ }),
    ).toBeInTheDocument();
    await user.selectOptions(evidenceFilter, 'A');
    await user.selectOptions(screen.getByRole('combobox', { name: '候选形态' }), 'system');
    await user.selectOptions(screen.getByRole('combobox', { name: '序列状态' }), 'partial-public');
    expect(screen.queryByRole('combobox', { name: '节点类型' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '类别' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '建模兼容性' })).not.toBeInTheDocument();
    const card = screen.getByRole('button', { name: /sensor\.cadr/i });
    expect(card).toBeInTheDocument();
    expect(within(card).getByText('网络作用')).toBeInTheDocument();
    expect(within(card).getAllByText('处理').length).toBeGreaterThan(0);
    expect(within(card).getByText('待标定')).toBeInTheDocument();
    expect(within(card).getByText(/证据等级 A/)).toBeInTheDocument();
    expect(screen.getAllByText(/个候选/).length).toBeGreaterThan(0);
  }, 15_000);

  it('renders unknown reasons and keeps every quantitative observation display-only', async () => {
    const user = userEvent.setup();
    render(
      <EvidenceCatalogDialog {...baseProps()} open triggerRef={createRef<HTMLButtonElement>()} />,
    );
    await user.type(screen.getByRole('searchbox', { name: '搜索文献元件库' }), 'sensor.cadr');
    await user.click(screen.getByRole('button', { name: /sensor\.cadr/i }));

    expect(screen.getAllByText(/未知/).length).toBeGreaterThan(0);
    expect(screen.getByText('来源上下文观察')).toBeInTheDocument();
    expect(screen.getAllByText('来源引用').length).toBeGreaterThan(0);
    expect(screen.getAllByText('he-2021-cadr-biosensor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Escherichia coli').length).toBeGreaterThan(0);
    expect(screen.getByText('迁移说明')).toBeInTheDocument();
    expect(screen.getByText('项目标定')).toBeInTheDocument();
    expect(screen.getByText('参数使用边界')).toBeInTheDocument();
    expect(screen.queryByText('edge-weight')).not.toBeInTheDocument();
    expect(screen.queryByText('km')).not.toBeInTheDocument();
    expect(screen.queryByText('hill')).not.toBeInTheDocument();
    expect(screen.getByText(/来源记录了 \d+ 项标定条件/)).toBeInTheDocument();
    expect(screen.getByText('查看来源原文与实验条件')).toBeInTheDocument();
    expect(screen.getByText('不会自动成为模型参数')).toBeInTheDocument();
    expect(screen.getByText(/缺少匹配标定时，软件不会自动推断/)).toBeInTheDocument();
    expect(screen.getByText(/不代表 BIT-CHINA 已进行实验验证、合成或测序/)).toBeInTheDocument();
  });

  it.each([
    {
      language: 'zh-CN',
      triggerLabel: '打开目录',
      title: '文献元件库',
      closeLabel: '关闭文献元件库',
    },
    {
      language: 'en-US',
      triggerLabel: 'Open catalog',
      title: 'Evidence-backed library',
      closeLabel: 'Close evidence-backed library',
    },
  ])(
    'moves focus, closes on Escape, and restores focus in $language',
    async ({ language, triggerLabel, title, closeLabel }) => {
      await i18n.changeLanguage(language);
      const user = userEvent.setup();
      const onClosed = vi.fn();
      render(<StatefulDialog onClosed={onClosed} triggerLabel={triggerLabel} />);

      const trigger = screen.getByRole('button', { name: triggerLabel });
      await user.click(trigger);
      const heading = screen.getByRole('heading', { name: title });
      expect(heading).toHaveFocus();

      await user.keyboard('{Shift>}{Tab}{/Shift}');
      const dialog = screen.getByRole('dialog');
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect(trigger).not.toHaveFocus();
      expect(screen.getByRole('button', { name: closeLabel })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(onClosed).toHaveBeenCalledTimes(1);
      expect(trigger).toHaveFocus();
    },
  );

  it('keeps Tab inside the dialog when closed disclosures contain hidden links', async () => {
    const user = userEvent.setup();
    render(
      <EvidenceCatalogDialog
        open
        index={loadedCatalog.index}
        triggerRef={createRef<HTMLButtonElement>()}
        onClose={vi.fn()}
        onAttach={vi.fn()}
        onDetach={vi.fn()}
      />,
    );
    await user.type(screen.getByRole('searchbox', { name: '搜索文献元件库' }), 'qs.cin');
    await user.click(screen.getByRole('button', { name: /qs\.cin/i }));
    expect(screen.getByRole('button', { name: '附加引用' })).toBeDisabled();

    const visibleSummaries = screen.getAllByText('显示完整值');
    const lastSummary = visibleSummaries.at(-1);
    if (!lastSummary) throw new Error('Expected a visible disclosure summary');
    lastSummary.focus();
    await user.tab();
    expect(screen.getByRole('button', { name: '关闭文献元件库' })).toHaveFocus();
  });

  it('attaches only a versioned reference snapshot without observations or sequences', async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    render(
      <EvidenceCatalogDialog
        {...baseProps()}
        onAttach={onAttach}
        open
        triggerRef={createRef<HTMLButtonElement>()}
      />,
    );
    await user.type(screen.getByRole('searchbox', { name: '搜索文献元件库' }), 'sensor.cadr');
    await user.click(screen.getByRole('button', { name: /sensor\.cadr/i }));
    await user.click(screen.getByRole('button', { name: '附加引用' }));

    expect(onAttach).toHaveBeenCalledTimes(1);
    const reference = onAttach.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(reference).toMatchObject({
      catalogId: 'evidence-backed-components',
      catalogVersion: 'evidence-backed-components@2026-08-02.1',
      entryId: 'sensor.cadr',
      sourceStatus: 'passed',
    });
    expect(typeof reference.displayNameSnapshot).toBe('string');
    expect(Object.keys(reference).sort()).toEqual([
      'boundaryNote',
      'catalogId',
      'catalogVersion',
      'displayNameSnapshot',
      'entryId',
      'sourceStatus',
    ]);
  });

  it('blocks a candidate whose catalog source review is not passed', () => {
    const onAttach = vi.fn();
    const needsReviewEntry = {
      ...cadR,
      evidence: { ...cadR.evidence, reviewStatus: 'needs-review' as const },
    };
    render(
      <CatalogEntryDetail
        entry={needsReviewEntry}
        selectedNetworkRole="processing"
        canAttach
        onAttach={onAttach}
        onDetach={vi.fn()}
      />,
    );

    expect(screen.getByText('需要继续审阅')).toBeInTheDocument();
    expect(screen.getByText('该候选尚未通过目录资料审阅。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '附加引用' })).toBeDisabled();
    expect(onAttach).not.toHaveBeenCalled();
  });

  it('uses network roles to explain why an incompatible candidate cannot attach', () => {
    const onAttach = vi.fn();
    render(
      <CatalogEntryDetail
        entry={reporterEntry}
        selectedNetworkRole="input"
        targetNetworkRole="input"
        canAttach
        onAttach={onAttach}
        onDetach={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '附加引用' })).toBeDisabled();
    expect(screen.getByText(/候选.*网络角色|网络角色.*不兼容/)).toBeInTheDocument();
    expect(onAttach).not.toHaveBeenCalled();
  });

  it('supports arrow-key result selection and exposes long source values through disclosure', async () => {
    const user = userEvent.setup();
    render(
      <EvidenceCatalogDialog {...baseProps()} open triggerRef={createRef<HTMLButtonElement>()} />,
    );
    const list = screen.getByRole('list', { name: '候选结果' });
    const cards = within(list).getAllByRole('button');
    cards[0]?.focus();
    await user.keyboard('{ArrowDown}');
    expect(cards[1]).toHaveFocus();
    expect(cards[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('显示完整值').length).toBeGreaterThan(0);
  });

  it('opens full DOI and accession disclosures instead of relying on truncated text', async () => {
    const user = userEvent.setup();
    render(
      <EvidenceCatalogDialog {...baseProps()} open triggerRef={createRef<HTMLButtonElement>()} />,
    );
    await user.type(screen.getByRole('searchbox', { name: '搜索文献元件库' }), 'sensor.cadr');
    await user.click(screen.getByRole('button', { name: /sensor\.cadr/i }));

    const summaries = screen.getAllByText('显示完整值');
    const doiSummary = summaries.find((summary) =>
      summary.closest('details')?.textContent?.includes('10.1021/acssensors.0c02204'),
    );
    const accessionSummary = summaries.find((summary) =>
      summary.closest('details')?.textContent?.includes('WP_064701589.1'),
    );
    if (!doiSummary || !accessionSummary) throw new Error('Expected DOI and accession disclosures');

    const doiDetails = doiSummary.closest('details');
    const accessionDetails = accessionSummary.closest('details');
    if (!doiDetails || !accessionDetails)
      throw new Error('Disclosure is missing its details element');
    expect(doiDetails).not.toHaveAttribute('open');
    await user.click(doiSummary);
    expect(doiDetails).toHaveAttribute('open');
    expect(within(doiDetails).getByRole('link')).toHaveAttribute(
      'href',
      'https://doi.org/10.1021/acssensors.0c02204',
    );
    await user.click(accessionSummary);
    expect(accessionDetails).toHaveAttribute('open');
    expect(within(accessionDetails).getByText('WP_064701589.1')).toBeInTheDocument();
  });

  it('separates complete external records from a complete single-sequence candidate', async () => {
    const user = userEvent.setup();
    render(
      <EvidenceCatalogDialog {...baseProps()} open triggerRef={createRef<HTMLButtonElement>()} />,
    );
    const search = screen.getByRole('searchbox', { name: '搜索文献元件库' });
    await user.selectOptions(screen.getByRole('combobox', { name: '网络角色' }), 'all');

    await user.type(search, 'sensor.cadr');
    await user.click(screen.getByRole('button', { name: /sensor\.cadr/i }));
    expect(screen.getByText('该候选不代表一条完整的单一构建序列。')).toBeInTheDocument();
    expect(screen.getByText('外部记录标记为完整')).toBeInTheDocument();
    expect(screen.getAllByText('ncbi-nz-bdep01000008-1').length).toBeGreaterThan(0);

    await user.clear(search);
    await user.type(search, 'control.anderson-j231-library');
    await user.click(screen.getByRole('button', { name: /control\.anderson-j231-library/i }));
    expect(screen.getByText('该候选不代表一条完整的单一构建序列。')).toBeInTheDocument();
    expect(screen.getAllByText('外部记录标记为完整').length).toBeGreaterThan(1);

    await user.clear(search);
    await user.type(search, 'output.mneongreen');
    await user.click(screen.getByRole('button', { name: /output\.mneongreen/i }));
    expect(screen.getByText('该候选对应一条完整的单一序列。')).toBeInTheDocument();
    expect(screen.getAllByText('ncbi-kc295282-1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('正向').length).toBeGreaterThan(0);
  }, 15_000);

  it('renders unavailable and unsupported historical states without allowing a new attachment', () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <EvidenceCatalogDialog
        {...baseProps()}
        open
        index={null}
        unavailableMessage="internal loader detail"
        triggerRef={triggerRef}
      />,
    );
    expect(screen.getByText('文献元件库暂不可用')).toBeInTheDocument();
    expect(screen.queryByText('internal loader detail')).not.toBeInTheDocument();

    const selectedReference = {
      catalogId: 'evidence-backed-components',
      catalogVersion: 'evidence-backed-components@historical',
      entryId: 'historical.entry',
      displayNameSnapshot: 'Historical entry',
      sourceStatus: 'passed' as const,
    };
    rerender(
      <EvidenceCatalogDialog
        {...baseProps()}
        open
        index={loadedCatalog.index}
        selectedReference={selectedReference}
        triggerRef={triggerRef}
      />,
    );
    expect(screen.getByText('当前目录版本不支持写入新引用')).toBeInTheDocument();
    expect(screen.getByText(/历史引用不可用/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '移除引用' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '附加引用' })).toBeDisabled();

    rerender(
      <EvidenceCatalogDialog
        {...baseProps()}
        open
        index={loadedCatalog.index}
        selectedReference={{
          ...selectedReference,
          catalogVersion: loadedCatalog.index.catalogVersion,
        }}
        triggerRef={triggerRef}
      />,
    );
    expect(screen.queryByText('当前目录版本不支持写入新引用')).not.toBeInTheDocument();
    expect(screen.getByText(/历史引用不可用/)).toBeInTheDocument();
  });
});
