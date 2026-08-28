import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { BfnPlatformPage } from './BfnPlatformPage';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalog/catalogBfnAdapter';
import { createBfnComputationSignature } from './computationSignature';
import { createCatalogModule, createDemoBfnProject } from './fixtures';
import type { BfnProject } from './types';

describe('BFN Platform semantic presentation', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('shows Catalog-backed identity independently of display-name edits and project computation state', () => {
    const project = catalogBackedProject();
    const module = project.network.modules[0]!;
    module.displayName = { en: 'Renamed response', zh: '重命名响应模块' };
    const before = structuredClone(project);
    const signature = createBfnComputationSignature(project);

    render(<BfnPlatformPage project={project} />);

    const semantic = semanticRegion();
    expect(semantic).toHaveTextContent('功能类别信号响应');
    expect(semantic).toHaveTextContent('生物元件类别AHL 接收/调控系统');
    expect(project).toEqual(before);
    expect(createBfnComputationSignature(project)).toBe(signature);
  });

  it('shows the built-in Reporter function and biological component class', () => {
    render(<BfnPlatformPage project={projectWithOnlyModule('reporter')} />);

    const semantic = semanticRegion();
    expect(semantic).toHaveTextContent('功能类别表达响应');
    expect(semantic).toHaveTextContent('生物元件类别报告表达系统');
    expect(mathematicalModelDetails()).toHaveTextContent('线性响应');
    expect(screen.getByText('机制模型')).toBeInTheDocument();
  });

  it('shows Multi-input integration while retaining an unclassified biological family', () => {
    render(<BfnPlatformPage project={projectWithOnlyModule('dual-input-gate')} />);

    const semantic = semanticRegion();
    expect(semantic).toHaveTextContent('功能类别多输入整合');
    expect(semantic).toHaveTextContent('生物元件类别未分类');
    expect(screen.getByText('当前计算方式')).toBeInTheDocument();
  });

  it('shows explicit unclassified values for an unknown module without name or model inference', () => {
    const project = projectWithOnlyModule('reporter');
    const module = project.network.modules[0]!;
    module.labelKey = 'bfn.modules.unknown.name';
    module.displayName = { en: 'LuxR Sensor', zh: 'LuxR 传感器' };

    render(<BfnPlatformPage project={project} />);

    const semantic = semanticRegion();
    expect(within(semantic).getAllByText('未分类')).toHaveLength(2);
    expect(mathematicalModelDetails()).toHaveTextContent('线性响应');
  });

  it('keeps function classification stable while Static and Dynamic select different mathematical models', () => {
    const staticProject = createDemoBfnProject();
    const view = render(<BfnPlatformPage project={staticProject} />);

    expect(semanticRegion()).toHaveTextContent('功能类别信号响应');
    expect(mathematicalModelDetails()).toHaveTextContent('Hill 响应');

    const dynamicProject = structuredClone(staticProject);
    dynamicProject.network.mode = 'dynamic';
    view.rerender(<BfnPlatformPage project={dynamicProject} />);

    expect(semanticRegion()).toHaveTextContent('功能类别信号响应');
    expect(mathematicalModelDetails()).toHaveTextContent('一阶动态模型');
  });

  it('contains a broken Catalog semantic identity without hiding the rest of the Inspector', () => {
    const project = catalogBackedProject();
    const model = project.network.modules[0]?.modelVariants.find(
      (candidate) => candidate.mode === 'static' && candidate.catalogReference !== undefined,
    );
    if (!model || model.mode !== 'static' || !model.catalogReference) {
      throw new Error('Catalog-backed model fixture is missing.');
    }
    model.catalogReference = {
      ...model.catalogReference,
      componentId: 'component.missing.semantic-identity',
    };

    render(<BfnPlatformPage project={project} />);

    expect(semanticRegion()).toHaveTextContent('功能分类暂不可用');
    expect(screen.getByText('作用')).toBeInTheDocument();
    expect(screen.getByText('输入与输出')).toBeInTheDocument();
    expect(screen.getByText('模型依据')).toBeInTheDocument();
  });
});

function semanticRegion(): HTMLElement {
  return screen.getByRole('region', { name: '功能分类' });
}

function mathematicalModelDetails(): HTMLElement {
  const details = screen.getByText('数学模型').closest('details');
  if (!details) throw new Error('Mathematical-model details were not rendered.');
  return details;
}

function projectWithOnlyModule(id: 'ahl-sensor' | 'reporter' | 'dual-input-gate'): BfnProject {
  const project = createDemoBfnProject();
  project.network.modules = [createCatalogModule(id, 'semantic-inspector')];
  project.network.inputSources = [];
  project.network.edges = [];
  return project;
}

function catalogBackedProject(): BfnProject {
  const project = createDemoBfnProject();
  project.isDemo = false;
  project.network.inputSources = [];
  project.network.modules = [];
  project.network.edges = [];
  project.registry.validityDomains = [];
  const responseId = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;
  const candidate = buildBfnCatalogRuntimeCandidate(responseId);
  const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-semantic-catalog',
    modulePosition: { x: 360, y: 180 },
    createInputSource: false,
  });
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  return instantiated.nextProject;
}
