import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { createTemplate } from './modelingCore';
import { getCanvasSignalLabel, NetworkCanvas } from './NetworkCanvas';
import type { TemplateLabels } from './types';
import type { RunNarrative } from './useRunNarrative';

const labels: TemplateLabels = {
  modelName: 'Signal gate',
  description: 'Illustrative model',
  nodes: {
    sensorA: 'Sensor A',
    sensorB: 'Sensor B',
    sensorC: 'Sensor C',
    integration: 'Integration',
    gate: 'Gate',
    memory: 'Memory',
    response: 'Response',
    reporter: 'Reporter',
  },
};
const narrative: RunNarrative = {
  status: 'idle',
  chapter: 'idle',
  activeEdgeId: null,
  edgeProgress: 0,
  resonantNodeId: null,
  revealProgress: 1,
  start: vi.fn(),
  skip: vi.fn(),
  fail: vi.fn(),
  cancel: vi.fn(),
};

function renderCanvas() {
  const model = createTemplate('signal-gate', labels, '2026-08-01T00:00:00.000Z');
  const onCreateConnection = vi.fn();
  const onMoveNode = vi.fn();
  const onSelectNode = vi.fn();
  const onSelectEdge = vi.fn();
  const onClearSelection = vi.fn();
  const result = render(
    <NetworkCanvas
      model={model}
      selectedNodeId={null}
      selectedEdgeId={null}
      nodeKindLabels={{ input: 'Input', processing: 'Process', output: 'Output' }}
      narrative={narrative}
      partArrivingNodeId={null}
      onSelectNode={onSelectNode}
      onSelectEdge={onSelectEdge}
      onClearSelection={onClearSelection}
      onMoveNode={onMoveNode}
      onCreateConnection={onCreateConnection}
    />,
  );
  return {
    ...result,
    model,
    onCreateConnection,
    onMoveNode,
    onSelectNode,
    onSelectEdge,
    onClearSelection,
  };
}

describe('NetworkCanvas molecular ports', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('replaces legacy implementation identifiers with compact public labels', () => {
    expect(getCanvasSignalLabel('legacy.signal.edge-sensor-a-integration.0')).toBe('IN A');
    expect(getCanvasSignalLabel('legacy.signal.edge-integration-response.3')).toBe('Σ');
    expect(getCanvasSignalLabel('legacy.signal.edge-response-reporter.4')).toBe('OUT');
  });

  it('creates a route with the exact source and target ports', () => {
    const { onCreateConnection } = renderCanvas();
    const source = screen.getByRole('button', {
      name: /Create connection from Sensor A.*signal\.sensor-a/,
    });
    const target = screen.getByRole('button', { name: /Connect to Gate.*signal\.sensor-a/ });
    fireEvent.pointerDown(source, { clientX: 180, clientY: 145 });
    fireEvent.pointerEnter(target);
    fireEvent.pointerUp(target, { clientX: 550, clientY: 240 });
    expect(onCreateConnection).toHaveBeenCalledWith({
      sourceNodeId: 'sensor-a',
      sourcePortId: 'sensor-a-out',
      targetNodeId: 'gate',
      targetPortId: 'gate-in-a',
    });
  });

  it('shows every molecular input port and marks a mismatched signal as invalid', () => {
    const { container } = renderCanvas();
    const gateInputs = screen.getAllByRole('button', { name: /Connect to Gate.*signal\.sensor-/ });
    expect(gateInputs).toHaveLength(2);
    const source = screen.getByRole('button', {
      name: /Create connection from Sensor A.*signal\.sensor-a/,
    });
    const mismatched = screen.getByRole('button', { name: /Connect to Gate.*signal\.sensor-b/ });
    fireEvent.pointerDown(source, { clientX: 180, clientY: 145 });
    fireEvent.pointerEnter(mismatched);
    expect(mismatched).toHaveClass('is-invalid-target');
    expect(container.querySelectorAll('[data-signal-id="signal.sensor-a"]').length).toBeGreaterThan(
      0,
    );
  });

  it('does not expose edge weight controls or activation/inhibition styling', () => {
    const { container } = renderCanvas();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByText('1.00')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/weight/i)).not.toBeInTheDocument();
    expect(container.querySelector('.model-edge.is-inhibitory')).not.toBeInTheDocument();
    expect(container.querySelector('.model-edge.is-activating')).not.toBeInTheDocument();
  });

  it('keeps node dragging separate from port dragging', () => {
    const { onMoveNode } = renderCanvas();
    const svg = screen.getByRole('img', { name: 'NETWORK MAP' });
    const node = screen.getByRole('button', { name: 'Sensor A, Input' });
    const port = screen.getByRole('button', {
      name: /Create connection from Sensor A.*signal\.sensor-a/,
    });
    fireEvent.pointerDown(node, { button: 0, clientX: 110, clientY: 145 });
    fireEvent.pointerMove(svg, { clientX: 240, clientY: 180 });
    expect(onMoveNode).toHaveBeenCalled();
    fireEvent.pointerUp(svg);
    onMoveNode.mockClear();
    fireEvent.pointerDown(port, { clientX: 180, clientY: 145 });
    fireEvent.pointerMove(svg, { clientX: 240, clientY: 180 });
    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it('expands the canvas when overflow nodes are placed below the initial workspace', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-01T00:00:00.000Z');
    model.nodes = model.nodes.map((node, index) =>
      index === 0 ? { ...node, y: 605 } : node,
    );
    const { container } = render(
      <NetworkCanvas
        model={model}
        selectedNodeId={null}
        selectedEdgeId={null}
        nodeKindLabels={{ input: 'Input', processing: 'Process', output: 'Output' }}
        narrative={narrative}
        partArrivingNodeId={null}
        onSelectNode={vi.fn()}
        onSelectEdge={vi.fn()}
        onMoveNode={vi.fn()}
        onCreateConnection={vi.fn()}
      />,
    );
    expect(container.querySelector('svg.network-canvas')).toHaveAttribute('viewBox', '0 0 900 660');
  });

  it('supports keyboard connection initiation and completion', () => {
    const { onCreateConnection } = renderCanvas();
    const source = screen.getByRole('button', {
      name: /Create connection from Sensor A.*signal\.sensor-a/,
    });
    const target = screen.getByRole('button', { name: /Connect to Gate.*signal\.sensor-a/ });
    fireEvent.keyDown(source, { key: 'Enter' });
    fireEvent.keyDown(target, { key: 'Enter' });
    expect(onCreateConnection).toHaveBeenCalledWith({
      sourceNodeId: 'sensor-a',
      sourcePortId: 'sensor-a-out',
      targetNodeId: 'gate',
      targetPortId: 'gate-in-a',
    });
  });

  it('clears selection only when the canvas background receives a click or Escape', () => {
    const { onClearSelection } = renderCanvas();
    const svg = screen.getByRole('img', { name: 'NETWORK MAP' });
    fireEvent.click(svg);
    fireEvent.keyDown(svg, { key: 'Escape' });
    expect(onClearSelection).toHaveBeenCalledTimes(2);
  });
});
