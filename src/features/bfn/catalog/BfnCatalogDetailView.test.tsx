import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import { createDemoBfnProject } from '../fixtures';
import {
  resolveCatalogComponentSemanticPresentation,
  unavailableBfnSemanticPresentation,
} from '../semantic/semanticPresentation';
import { BfnCatalogDetailView } from './BfnCatalogDetailView';
import { buildBfnCatalogDetail, type BfnCatalogDetail } from './catalogDetail';

const presentation = loadReleaseCatalogPresentation();

describe('BFN catalog full-detail view', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it.each([
    {
      label: 'needs calibration',
      detail: responseDetail('calibration-candidate'),
    },
    {
      label: 'qualitative evidence',
      detail: responseDetail('compatibility-only'),
    },
    {
      label: 'reference component',
      detail: componentDetail('reference'),
    },
    {
      label: 'sender component',
      detail: componentDetail('sender'),
    },
    {
      label: 'freshly unavailable runtime',
      detail: unavailableDetail(),
    },
  ])('keeps $label view-only with no Add action', ({ detail }) => {
    renderDetail(detail);

    expect(screen.queryByRole('button', { name: '添加到网络' })).not.toBeInTheDocument();
    expect(screen.queryByText('当前软件使用的响应模型')).not.toBeInTheDocument();
  });

  it('renders sender capability, component evidence, and sources without a receiver model', () => {
    renderDetail(componentDetail('sender'));

    expect(screen.getByText('功能分类')).toBeInTheDocument();
    expect(screen.getByText('信号产生')).toBeInTheDocument();
    expect(screen.getByText('AHL 合成系统')).toBeInTheDocument();
    expect(screen.getByText('暂无定量发送函数')).toBeInTheDocument();
    expect(screen.getByText('组件信息')).toBeInTheDocument();
    expect(screen.getByText('来源文献')).toBeInTheDocument();
    expect(screen.getByText('证据缺口')).toBeInTheDocument();
    expect(screen.queryByText('当前软件使用的响应模型')).not.toBeInTheDocument();
  });

  it('renders fixed-condition Sender evidence and its raw points without an Add action', () => {
    const view = renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'sender_output',
        senderOutputId: 'sout.kokarakis2023.1017ec.luxi.v1.concentration.v1',
      }),
    );

    expect(screen.getByText('发送端文献证据')).toBeInTheDocument();
    expect(screen.getByText('当前不可作为发送端运行')).toBeInTheDocument();
    expect(screen.getByText(/固定条件时间序列/u)).toBeInTheDocument();
    expect(screen.getByText('原始证据点')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(view.container.querySelector('.bfn-sender-raw-input__primary')).toHaveTextContent(
      '100 nM',
    );
    expect(view.container.querySelector('.bfn-sender-raw-input__secondary')).toHaveTextContent(
      'peak near 13 h',
    );
    expect(view.container.querySelector('.bfn-sender-raw-input__primary')).not.toHaveTextContent(
      'peak near 13 h',
    );
    expect(screen.getAllByText('功能分类暂不可用').length).toBe(2);
    expect(screen.queryByRole('button', { name: '添加到网络' })).not.toBeInTheDocument();
    expect(screen.queryByText('当前软件使用的响应模型')).not.toBeInTheDocument();
  });

  it('keeps zero and nonzero methionine inputs visible beside their descriptive labels', () => {
    renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'sender_output',
        senderOutputId: 'sout.vanaalst2025.aaa063.cepi.v1.c8hsl.v1',
      }),
    );
    const table = screen.getByRole('table');

    expect(within(table).getAllByText('0 g/L')).toHaveLength(2);
    expect(
      within(table)
        .getAllByText('0 g/L')
        .every((value) => value.classList.contains('bfn-sender-raw-input__primary')),
    ).toBe(true);
    expect(within(table).getAllByText('no methionine')).toHaveLength(2);
    expect(
      within(table)
        .getAllByText('no methionine')
        .every((value) => value.classList.contains('bfn-sender-raw-input__secondary')),
    ).toBe(true);
    expect(within(table).getAllByText('1 g/L')).toHaveLength(2);
    expect(
      within(table)
        .getAllByText('1 g/L')
        .every((value) => value.classList.contains('bfn-sender-raw-input__primary')),
    ).toBe(true);
    expect(within(table).getAllByText('1 g/L methionine')).toHaveLength(2);
    expect(
      within(table)
        .getAllByText('1 g/L methionine')
        .every((value) => value.classList.contains('bfn-sender-raw-input__secondary')),
    ).toBe(true);
  });

  it('renders ND explicitly and never converts it into a zero-valued raw point', () => {
    renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'sender_output',
        senderOutputId: 'sout.morohoshi2017.stfrb508.triple-deletion.v1.profile.v1',
      }),
    );
    const table = screen.getByRole('table');
    const ndCells = within(table).getAllByText('ND（未检出）');

    expect(ndCells.length).toBeGreaterThan(0);
    expect(ndCells.every((cell) => cell.textContent === 'ND（未检出）')).toBe(true);
    expect(screen.getByText(/ND 表示未检出，不代表数值 0/u)).toBeInTheDocument();
  });

  it('presents cell-free enzyme parameters scientifically while retaining raw audit data', async () => {
    const user = userEvent.setup();
    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'sender_output',
      senderOutputId: 'sout.christensen2014.bjai.ivcoa.kinetics.v1',
    });
    const before = structuredClone(detail);
    const view = renderDetail(detail);
    const primary = primaryDetailText(view.container);

    expect(screen.getByText('文献函数参数')).toBeInTheDocument();
    expect(primary).toContain('Michaelis–Menten');
    expect(primary).toContain('Kₘ');
    expect(primary).toContain('7');
    expect(primary).toContain('µM');
    expect(primary).toContain('kcat');
    expect(primary).toContain('0.021');
    expect(primary).toContain('s⁻¹');
    expect(primary).toContain('3000');
    expect(primary).toContain('M⁻¹ s⁻¹');
    expect(primary).not.toContain('reported_michaelis_menten');
    expect(primary).not.toContain('{"Km"');
    expect(screen.getAllByText('v = kcat*[E]*S/(Km+S)').length).toBeGreaterThan(0);
    expect(screen.getByText(/无细胞酶实验/u)).toBeInTheDocument();
    expect(screen.getByText(/无细胞酶动力学不能直接作为细胞发送端函数/u)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加到网络' })).not.toBeInTheDocument();
    const advanced = view.container.querySelector<HTMLDetailsElement>(
      '.bfn-catalog-detail__advanced',
    );
    if (!advanced) throw new Error('Expected Sender advanced audit section.');
    expect(advanced.open).toBe(false);
    await user.click(within(advanced).getByText('高级信息'));
    expect(advanced.open).toBe(true);
    expect(advanced).toHaveTextContent('reported_michaelis_menten');
    expect(advanced).toHaveTextContent('{"Km"');
    expect(detail).toEqual(before);
  });

  it('shows the non-decomposable whole-pair boundary without an output signal', () => {
    renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'sender_output',
        senderOutputId: 'sout.daer2018.aubi.v1.end-to-end.v1',
      }),
    );

    expect(screen.getByText('未解析为独立输出信号')).toBeInTheDocument();
    expect(screen.getAllByText('端到端配对证据').length).toBeGreaterThan(0);
    expect(screen.getByText(/不能拆解为独立发送函数或接收参数/u)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加到网络' })).not.toBeInTheDocument();
  });

  it('renders all response sources instead of keeping the preview summary only', () => {
    const response = presentation.responseVariants.find((entry) => entry.sources.length > 1);
    if (!response) throw new Error('Expected a multi-source response.');
    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'response',
      responseId: response.id,
    });

    renderDetail(detail);

    for (const source of response.sources) {
      expect(screen.getByText(source.title)).toBeInTheDocument();
    }
  });

  it('shows a missing context value as unrecorded without inventing a default', () => {
    const response = presentation.responseVariants.find(
      (entry) => entry.parameterContext.canonical.details?.cultureMedium === null,
    );
    if (!response) throw new Error('Expected a response with an unrecorded culture medium.');
    renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'response',
        responseId: response.id,
      }),
    );

    const mediumLabel = screen.getByText('培养基');
    const row = mediumLabel.closest('div');
    if (!row) throw new Error('Culture-medium property row was not rendered.');
    expect(within(row).getByText('未记录')).toBeInTheDocument();
  });

  it('presents sequence status, source, and verification as separate user-facing facts', () => {
    const component = presentation.components.find(
      (entry) => entry.sequenceReference && entry.sequenceMetadata,
    );
    if (!component) throw new Error('Expected a component with sequence provenance.');
    const view = renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'component',
        componentId: component.id,
      }),
    );

    expect(screen.getByText('序列状态')).toBeInTheDocument();
    expect(screen.getByText('序列来源')).toBeInTheDocument();
    expect(screen.getByText('序列核验边界')).toBeInTheDocument();
    expect(screen.getByText(component.sequenceReference!)).toBeInTheDocument();
    expect(primaryDetailText(view.container)).not.toContain(component.sequenceStatus);
    expect(view.container.querySelector('.bfn-catalog-detail__advanced')?.textContent).toContain(
      component.sequenceStatus,
    );
  });

  it('supports the complete runnable Detail and Add decision in English', async () => {
    await i18n.changeLanguage('en-US');
    const response = presentation.responseVariants.find((entry) => entry.runnable);
    if (!response) throw new Error('Expected a runnable response.');
    renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'response',
        responseId: response.id,
      }),
      'en-US',
    );

    expect(screen.getByText('Response model used by this software')).toBeInTheDocument();
    expect(screen.getByText('Functional classification')).toBeInTheDocument();
    expect(screen.getByText('Signal response')).toBeInTheDocument();
    expect(screen.getByText('AHL receiver / regulatory system')).toBeInTheDocument();
    expect(screen.getByText('Original parameters reported in the literature')).toBeInTheDocument();
    expect(screen.getByText('Sequence source')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to network' })).toBeInTheDocument();
  });

  it('keeps runnable Detail and Add eligibility intact when semantic presentation is unavailable', () => {
    const response = presentation.responseVariants.find((entry) => entry.runnable);
    if (!response) throw new Error('Expected a runnable response.');
    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'response',
      responseId: response.id,
    });

    render(
      <BfnCatalogDetailView
        detail={detail}
        semantic={unavailableBfnSemanticPresentation()}
        language={'zh-CN'}
        project={createDemoBfnProject()}
        onBack={vi.fn()}
        onInstantiate={vi.fn()}
      />,
    );

    expect(screen.getByText('功能分类暂不可用')).toBeInTheDocument();
    expect(screen.getByText('当前软件使用的响应模型')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加到网络' })).toBeInTheDocument();
  });

  it('keeps known release codes and source-English pair text out of the primary Chinese UI', () => {
    const sender = presentation.components.find((entry) =>
      entry.evidenceGaps.includes('direct_hsl_concentration_unavailable'),
    );
    if (!sender) throw new Error('Expected a sender with direct-concentration evidence gap.');
    const senderView = renderDetail(
      buildBfnCatalogDetail(presentation, { kind: 'component', componentId: sender.id }),
    );
    expect(primaryDetailText(senderView.container)).toContain('缺少发送端 AHL 浓度的直接测量');
    expect(primaryDetailText(senderView.container)).not.toContain(
      'direct_hsl_concentration_unavailable',
    );
    expect(
      senderView.container.querySelector('.bfn-catalog-detail__advanced')?.textContent,
    ).toContain('direct_hsl_concentration_unavailable');
    senderView.unmount();

    const pairComponent = presentation.components.find((entry) =>
      entry.observedPairs.some(
        (pair) => pair.observedEffect === 'above background but below constitutive EGFP control',
      ),
    );
    if (!pairComponent) throw new Error('Expected the whole-system pair observation.');
    const pairView = renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'component',
        componentId: pairComponent.id,
      }),
    );
    expect(primaryDetailText(pairView.container)).toContain('高于背景水平，但低于组成型 EGFP 对照');
    expect(primaryDetailText(pairView.container)).not.toContain(
      'above background but below constitutive EGFP control',
    );
    expect(primaryDetailText(pairView.container)).not.toContain('activation_strong');
    pairView.unmount();

    const compatibilityComponent = presentation.components.find((entry) =>
      entry.compatibilityRelations.some((relation) => relation.relationType === 'constraint_hit'),
    );
    if (!compatibilityComponent) throw new Error('Expected constraint-hit compatibility evidence.');
    const compatibilityView = renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'component',
        componentId: compatibilityComponent.id,
      }),
    );
    expect(primaryDetailText(compatibilityView.container)).toContain('拟合触及参数约束');
    expect(primaryDetailText(compatibilityView.container)).not.toContain('constraint_hit');
  });

  it('humanizes every source model and uses a safe fallback while retaining raw audit text', () => {
    const response = presentation.responseVariants.find(
      (entry) => entry.response.sourceResponse?.modelType === 'approximate_half_maximum',
    );
    if (!response) throw new Error('Expected an approximate half-maximum response.');
    const modelView = renderDetail(
      buildBfnCatalogDetail(presentation, { kind: 'response', responseId: response.id }),
    );
    expect(primaryDetailText(modelView.container)).toContain('近似半最大响应位置');
    expect(primaryDetailText(modelView.container)).not.toContain('approximate_half_maximum');
    modelView.unmount();

    const sender = componentDetail('sender');
    const unknownDetail: BfnCatalogDetail = {
      ...sender,
      component: {
        ...sender.component,
        evidenceGaps: ['some_new_internal_code'],
      },
    };
    const fallbackView = renderDetail(unknownDetail);
    expect(primaryDetailText(fallbackView.container)).toContain('存在尚未完整呈现的证据信息');
    expect(primaryDetailText(fallbackView.container)).not.toContain('some_new_internal_code');
    expect(
      fallbackView.container.querySelector('.bfn-catalog-detail__advanced')?.textContent,
    ).toContain('some_new_internal_code');
  });
});

function responseDetail(
  usageStatus: 'calibration-candidate' | 'compatibility-only',
): BfnCatalogDetail {
  const response = presentation.responseVariants.find((entry) => entry.usageStatus === usageStatus);
  if (!response) throw new Error(`Expected a ${usageStatus} response.`);
  return buildBfnCatalogDetail(presentation, {
    kind: 'response',
    responseId: response.id,
  });
}

function componentDetail(kind: 'reference' | 'sender'): BfnCatalogDetail {
  const component = presentation.components.find((entry) =>
    kind === 'sender' ? entry.role === 'sender' : entry.usageStatus === 'reference-only',
  );
  if (!component) throw new Error(`Expected a ${kind} component.`);
  return buildBfnCatalogDetail(presentation, {
    kind: 'component',
    componentId: component.id,
  });
}

function unavailableDetail(): BfnCatalogDetail {
  const response = presentation.responseVariants.find((entry) => entry.runnable);
  if (!response) throw new Error('Expected a runnable response.');
  return buildBfnCatalogDetail(presentation, { kind: 'response', responseId: response.id }, () => {
    throw new Error('fresh trust failed');
  });
}

function renderDetail(detail: BfnCatalogDetail, language: 'zh-CN' | 'en-US' = 'zh-CN') {
  return render(
    <BfnCatalogDetailView
      detail={detail}
      semantic={
        detail.kind === 'sender_output'
          ? unavailableBfnSemanticPresentation()
          : resolveCatalogComponentSemanticPresentation(detail.component.id, presentation, language)
      }
      language={language}
      project={createDemoBfnProject()}
      onBack={vi.fn()}
      onInstantiate={vi.fn()}
    />,
  );
}

function primaryDetailText(container: HTMLElement): string {
  return [
    ...container.querySelectorAll('.bfn-catalog-detail__summary, .bfn-catalog-detail__section'),
  ]
    .map((element) => element.textContent ?? '')
    .join(' ');
}
