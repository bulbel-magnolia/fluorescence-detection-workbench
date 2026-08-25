import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { createCatalogModule, createDemoBfnProject } from './fixtures';
import { BfnNetworkCanvas } from './BfnNetworkCanvas';
import { checkIdealConnection } from './validation';
import type { BfnProject } from './types';

function renderCanvas(project: BfnProject) {
  const onCreateConnection = vi.fn(() => true);
  const onMoveNode = vi.fn();
  render(
    <BfnNetworkCanvas
      project={project}
      selectedNodeId={null}
      selectedEdgeId={null}
      onSelectNode={vi.fn()}
      onSelectEdge={vi.fn()}
      onClearSelection={vi.fn()}
      onMoveNode={onMoveNode}
      onMoveNodeCommit={vi.fn()}
      evaluateConnection={(source, target) => {
        const issue = checkIdealConnection(project, source, target).find(
          (candidate) => candidate.severity === 'error',
        );
        return { compatible: !issue, message: issue?.code ?? null };
      }}
      onCreateConnection={onCreateConnection}
      onViewportChange={vi.fn()}
    />,
  );
  return { onCreateConnection, onMoveNode };
}

describe('BFN network canvas direct manipulation', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('highlights compatible targets and creates a connection on drop', () => {
    const project = createDemoBfnProject();
    project.network.edges = project.network.edges.filter(
      (edge) => edge.id !== 'edge-sensor-reporter',
    );
    const { onCreateConnection } = renderCanvas(project);
    const source = screen.getByRole('button', {
      name: 'AHL 响应，输出端口：启动子活性',
    });
    const target = screen.getByRole('button', {
      name: '报告表达，输入端口：启动子活性',
    });

    fireEvent.pointerDown(source, { button: 0, clientX: 460, clientY: 180 });
    expect(target).toHaveAttribute('data-connection-state', 'compatible');
    fireEvent.pointerEnter(target);
    fireEvent.pointerMove(window, { clientX: 560, clientY: 180 });
    expect(document.querySelector('.bfn-canvas-edge--preview')).toBeInTheDocument();
    fireEvent.pointerUp(target, { button: 0, clientX: 560, clientY: 180 });

    expect(onCreateConnection).toHaveBeenCalledWith(
      { nodeId: 'module-ahl-sensor', portId: 'module-ahl-sensor-out' },
      { nodeId: 'module-reporter', portId: 'module-reporter-in' },
    );
    expect(document.querySelector('.bfn-canvas-edge--preview')).not.toBeInTheDocument();
  });

  it('supports starting and completing a connection from the keyboard', () => {
    const project = createDemoBfnProject();
    project.network.edges = project.network.edges.filter(
      (edge) => edge.id !== 'edge-sensor-reporter',
    );
    const { onCreateConnection } = renderCanvas(project);
    const source = screen.getByRole('button', {
      name: 'AHL 响应，输出端口：启动子活性',
    });
    const target = screen.getByRole('button', {
      name: '报告表达，输入端口：启动子活性',
    });

    fireEvent.keyDown(source, { key: 'Enter' });
    fireEvent.focus(target);
    expect(target).toHaveAttribute('data-connection-state', 'compatible');
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onCreateConnection).toHaveBeenCalledOnce();
  });

  it('mutes incompatible ports and shows the rejection reason only while hovered', () => {
    const project = createDemoBfnProject();
    renderCanvas(project);
    const source = screen.getByRole('button', {
      name: 'AHL 响应，输出端口：启动子活性',
    });
    const target = screen.getByRole('button', {
      name: '报告信号，输入端口：报告信号',
    });

    fireEvent.pointerDown(source, { button: 0 });
    expect(target).toHaveAttribute('data-connection-state', 'incompatible');
    expect(screen.queryByText('entity_mismatch')).not.toBeInTheDocument();
    fireEvent.pointerEnter(target);
    expect(screen.getByText('entity_mismatch')).toBeInTheDocument();
    fireEvent.pointerLeave(target);
    expect(screen.queryByText('entity_mismatch')).not.toBeInTheDocument();
  });

  it.each(['blank drop', 'Escape', 'pointer cancel'])('cancels on %s without mutation', (kind) => {
    const project = createDemoBfnProject();
    project.network.edges = project.network.edges.filter(
      (edge) => edge.id !== 'edge-sensor-reporter',
    );
    const { onCreateConnection } = renderCanvas(project);
    const source = screen.getByRole('button', {
      name: 'AHL 响应，输出端口：启动子活性',
    });
    fireEvent.pointerDown(source, { button: 0 });
    if (kind === 'blank drop') fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    else if (kind === 'Escape') fireEvent.keyDown(window, { key: 'Escape' });
    else fireEvent.pointerCancel(window);
    expect(onCreateConnection).not.toHaveBeenCalled();
    expect(document.querySelector('.bfn-canvas-edge--preview')).not.toBeInTheDocument();
  });

  it('renders distinct accessible handles for a multi-input module', () => {
    const project = createDemoBfnProject();
    const module = createCatalogModule('dual-input-gate', 'canvas-test');
    project.network.modules.push(module);
    renderCanvas(project);
    const node = screen.getByRole('button', { name: '双输入响应, 功能模块' });
    const first = within(node).getByRole('button', {
      name: '双输入响应，输入端口：输入信号 A',
    });
    const second = within(node).getByRole('button', {
      name: '双输入响应，输入端口：输入信号 B',
    });
    expect(first).not.toHaveStyle({ top: second.style.top });
  });
});
