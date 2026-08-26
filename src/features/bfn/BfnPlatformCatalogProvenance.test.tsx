import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { BfnPlatformPage } from './BfnPlatformPage';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalog/catalogBfnAdapter';
import { createBfnComputationSignature } from './computationSignature';
import { createDemoBfnProject } from './fixtures';
import { BFN_PROJECT_STORAGE_KEY, parseBfnProject, saveBfnProject } from './repository';
import { addIdealConnection } from './validation';

describe('BFN Platform Catalog provenance workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('deep-links to the exact literature detail without mutating project, history, or result freshness', async () => {
    const user = userEvent.setup();
    const fixture = connectedCatalogProject();
    saveBfnProject(fixture.project);
    render(<BfnPlatformPage />);

    const sourceRegion = screen.getByRole('region', { name: '文献来源' });
    expect(within(sourceRegion).getByText('来源记录已匹配')).toBeInTheDocument();
    expect(screen.queryByText('未关联数据集')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '运行稳态分析' }));
    expect(await screen.findByText('当前结果')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('已自动保存')).toBeInTheDocument());
    const before = parseBfnProject(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)!);
    const signature = createBfnComputationSignature(before);

    await user.click(within(sourceRegion).getByRole('button', { name: '查看文献详情' }));
    const dialog = await screen.findByRole('dialog', { name: 'AHL/HSL 文献目录' });
    expect(within(dialog).getByText(fixture.responseId)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '返回目录' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '返回目录' }));
    expect(within(dialog).getByRole('searchbox', { name: '搜索文献目录' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '关闭添加模块' }));
    expect(screen.queryByRole('dialog', { name: 'AHL/HSL 文献目录' })).not.toBeInTheDocument();

    const after = parseBfnProject(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)!);
    expect(after).toEqual(before);
    expect(createBfnComputationSignature(after)).toBe(signature);
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled();
    expect(screen.getByText('当前结果')).toBeInTheDocument();
  });
});

function connectedCatalogProject() {
  const project = createDemoBfnProject();
  project.isDemo = false;
  project.network.inputSources = [];
  project.network.modules = [];
  project.network.edges = [];
  project.registry.validityDomains = [];
  const responseId = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;
  const candidate = buildBfnCatalogRuntimeCandidate(responseId);
  const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-catalog-provenance-workflow',
    modulePosition: { x: 360, y: 180 },
    createInputSource: true,
    inputSourceId: 'source-catalog-provenance-workflow',
    inputSourcePosition: { x: 60, y: 180 },
  });
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  const next = instantiated.nextProject;
  const source = next.network.inputSources[0]!;
  const module = next.network.modules[0]!;
  const monitor = next.network.outputMonitors[0]!;
  monitor.inputPort = {
    ...module.outputPorts[0]!,
    id: monitor.inputPort.id,
    direction: 'input',
  };
  const withInput = addIdealConnection(
    next,
    { nodeId: source.id, portId: source.outputPort.id },
    { nodeId: module.id, portId: module.inputPorts[0]!.id },
    'edge-catalog-provenance-input',
  );
  const connected = addIdealConnection(
    withInput,
    { nodeId: module.id, portId: module.outputPorts[0]!.id },
    { nodeId: monitor.id, portId: monitor.inputPort.id },
    'edge-catalog-provenance-output',
  );
  return { project: connected, responseId };
}
