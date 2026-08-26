import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import { createDemoBfnProject } from '../fixtures';
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

    expect(screen.getByText('暂无定量发送函数')).toBeInTheDocument();
    expect(screen.getByText('组件信息')).toBeInTheDocument();
    expect(screen.getByText('来源文献')).toBeInTheDocument();
    expect(screen.getByText('证据缺口')).toBeInTheDocument();
    expect(screen.queryByText('当前软件使用的响应模型')).not.toBeInTheDocument();
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
    renderDetail(
      buildBfnCatalogDetail(presentation, {
        kind: 'component',
        componentId: component.id,
      }),
    );

    expect(screen.getByText('序列状态')).toBeInTheDocument();
    expect(screen.getByText('序列来源')).toBeInTheDocument();
    expect(screen.getByText('序列核验边界')).toBeInTheDocument();
    expect(screen.getByText(component.sequenceReference!)).toBeInTheDocument();
    expect(screen.queryByText(component.sequenceStatus)).not.toBeInTheDocument();
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
    expect(screen.getByText('Original parameters reported in the literature')).toBeInTheDocument();
    expect(screen.getByText('Sequence source')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to network' })).toBeInTheDocument();
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
      language={language}
      project={createDemoBfnProject()}
      onBack={vi.fn()}
      onInstantiate={vi.fn()}
    />,
  );
}
