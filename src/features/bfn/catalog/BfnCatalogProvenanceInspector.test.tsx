import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { createDemoBfnProject } from '../fixtures';
import { resolveEffectiveBfnModel } from '../modelResolution';
import type { BfnFunctionalModule, BfnProject, BfnStaticModel } from '../types';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalogBfnAdapter';
import { BfnCatalogProvenanceInspector } from './BfnCatalogProvenanceInspector';
import { resolveBfnCatalogProvenance } from './catalogProvenance';

interface InspectorFixture {
  project: BfnProject;
  module: BfnFunctionalModule;
  model: BfnStaticModel;
}

function fixture(): InspectorFixture {
  const project = createDemoBfnProject();
  const candidate = buildBfnCatalogRuntimeCandidate(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id);
  const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-catalog-provenance-inspector',
    modulePosition: { x: 360, y: 220 },
    createInputSource: false,
  });
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  const module = instantiated.nextProject.network.modules.at(-1);
  const model = module?.modelVariants[0];
  if (!module || !model || model.mode !== 'static') throw new Error('Inspector fixture failed.');
  return { project: instantiated.nextProject, module, model };
}

describe('BFN Catalog provenance inspector', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('shows a compact matched literature source and opens its exact response detail target', async () => {
    const user = userEvent.setup();
    const value = fixture();
    const onOpen = vi.fn();
    const provenance = resolveBfnCatalogProvenance(value.project, value.module, value.model)!;
    render(<BfnCatalogProvenanceInspector {...value} onOpenCatalogDetail={onOpen} />);

    const region = screen.getByRole('region', { name: '文献来源' });
    expect(within(region).getByText('来源记录已匹配')).toBeInTheDocument();
    expect(within(region).getByText(/AHL\/HSL 文献目录 V1\.1/u)).toBeInTheDocument();
    expect(within(region).getByText(provenance.canonical!.componentNames.zh)).toBeInTheDocument();
    expect(within(region).getByText(provenance.canonical!.inputSignalNames.zh)).toBeInTheDocument();
    expect(within(region).getByText(/Escherichia coli/u)).toBeInTheDocument();
    expect(within(region).getByText(/et al\. · \d{4}/u)).toBeInTheDocument();
    expect(region).toHaveTextContent('不代表团队实验验证');
    expect(region).not.toHaveTextContent('validated');
    expect(region).not.toHaveTextContent('实验验证通过');

    await user.click(within(region).getByRole('button', { name: '查看文献详情' }));
    expect(onOpen).toHaveBeenCalledWith(provenance.canonical!.detailTarget);
  });

  it('presents a mismatch without a matched claim and links to the canonical record', async () => {
    const user = userEvent.setup();
    const value = fixture();
    value.model.catalogReference!.sourceParameters.ec50 *= 2;
    const onOpen = vi.fn();
    render(<BfnCatalogProvenanceInspector {...value} onOpenCatalogDetail={onOpen} />);

    const region = screen.getByRole('region', { name: '文献来源' });
    expect(within(region).getByText('当前模块与文献来源不一致')).toBeInTheDocument();
    expect(within(region).queryByText('来源记录已匹配')).not.toBeInTheDocument();
    expect(region).not.toHaveTextContent('catalog_model_mismatch');
    await user.click(within(region).getByRole('button', { name: '查看目录中的原始记录' }));
    expect(onOpen).toHaveBeenCalledWith({
      kind: 'response',
      responseId: value.model.catalogReference?.responseId,
    });
  });

  it('keeps an unavailable release readable without constructing a detail action', () => {
    const value = fixture();
    value.model.catalogReference!.releaseVersion = 'future-unknown';
    render(<BfnCatalogProvenanceInspector {...value} onOpenCatalogDetail={vi.fn()} />);

    const region = screen.getByRole('region', { name: '文献来源' });
    expect(within(region).getByText('文献来源暂时无法核对')).toBeInTheDocument();
    expect(region).not.toHaveTextContent('catalog_release_unavailable');
    expect(
      within(region).queryByRole('button', { name: /文献详情|原始记录/u }),
    ).not.toBeInTheDocument();
    expect(region).toHaveTextContent('future-unknown');
  });

  it('does not add a Catalog source section to a generic BFN module', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[0]!;
    const model = resolveEffectiveBfnModel(project, module)!;
    const view = render(
      <BfnCatalogProvenanceInspector
        project={project}
        module={module}
        model={model}
        onOpenCatalogDetail={vi.fn()}
      />,
    );

    expect(view.container).toBeEmptyDOMElement();
  });

  it('uses the same non-validating source boundary in English', async () => {
    await i18n.changeLanguage('en-US');
    const value = fixture();
    render(<BfnCatalogProvenanceInspector {...value} onOpenCatalogDetail={vi.fn()} />);

    const region = screen.getByRole('region', { name: 'Literature source' });
    expect(within(region).getByText('Literature source matched')).toBeInTheDocument();
    expect(region).toHaveTextContent('does not indicate experimental validation by the team');
    expect(region).not.toHaveTextContent('catalog_model_mismatch');
  });
});
