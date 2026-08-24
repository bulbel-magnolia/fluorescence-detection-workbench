import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { BfnCanvasPosition, BfnFunctionalModule, BfnIdealEdge, BfnProject } from './types';
import { bfnPortLabel } from './presentation';
import { activeModelForModule } from './validation';

interface BfnNetworkCanvasProps {
  project: BfnProject;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onClearSelection: () => void;
  onMoveNode: (nodeId: string, position: BfnCanvasPosition) => void;
}

interface DragState {
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

const canvasSize = { width: 980, height: 520 };
const nodeSize = { width: 172, height: 112 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function nodePosition(project: BfnProject, nodeId: string): BfnCanvasPosition | null {
  return (
    project.network.inputSources.find((node) => node.id === nodeId)?.position ??
    project.network.modules.find((node) => node.id === nodeId)?.position ??
    project.network.outputMonitors.find((node) => node.id === nodeId)?.position ??
    null
  );
}

function edgePath(project: BfnProject, edge: BfnIdealEdge): string {
  const source = nodePosition(project, edge.source.nodeId) ?? { x: 0, y: 0 };
  const target = nodePosition(project, edge.target.nodeId) ?? { x: 0, y: 0 };
  const startX = source.x + nodeSize.width;
  const startY = source.y + nodeSize.height / 2;
  const endX = target.x;
  const endY = target.y + nodeSize.height / 2;
  const bend = Math.max(55, Math.abs(endX - startX) * 0.46);
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}

function modelFamily(module: BfnFunctionalModule, project: BfnProject): string {
  const active = activeModelForModule(module, project.network.mode);
  if (active) return active.family;
  return activeModelForModule(module, 'static')?.family ?? 'identity';
}

export function BfnNetworkCanvas({
  project,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onMoveNode,
}: BfnNetworkCanvasProps) {
  const { t } = useTranslation();
  const dragState = useRef<DragState | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const drag = dragState.current;
      if (!drag) return;
      onMoveNode(drag.nodeId, {
        x: clamp(
          drag.startX + event.clientX - drag.startClientX,
          12,
          canvasSize.width - nodeSize.width - 12,
        ),
        y: clamp(
          drag.startY + event.clientY - drag.startClientY,
          20,
          canvasSize.height - nodeSize.height - 20,
        ),
      });
    };
    const end = (): void => {
      dragState.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
  }, [onMoveNode]);

  const beginDrag = (
    event: React.PointerEvent,
    nodeId: string,
    position: BfnCanvasPosition,
  ): void => {
    if (event.button !== 0) return;
    dragState.current = {
      nodeId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: position.x,
      startY: position.y,
    };
  };

  return (
    <div
      className="bfn-canvas"
      role="application"
      aria-label={t('bfn.canvas.label')}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClearSelection();
      }}
    >
      <div className="bfn-canvas__grid" aria-hidden="true" />
      <svg
        className="bfn-canvas__edges"
        viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
        aria-label={t('bfn.canvas.connections')}
      >
        <defs>
          <marker
            id="bfn-edge-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" />
          </marker>
        </defs>
        {project.network.edges.map((edge) => (
          <g key={edge.id} data-selected={selectedEdgeId === edge.id} data-enabled={edge.enabled}>
            <path className="bfn-canvas-edge__halo" d={edgePath(project, edge)} />
            <path
              className="bfn-canvas-edge"
              d={edgePath(project, edge)}
              markerEnd="url(#bfn-edge-arrow)"
              role="button"
              tabIndex={0}
              aria-label={t('bfn.canvas.edgeLabel')}
              onClick={(event) => {
                event.stopPropagation();
                onSelectEdge(edge.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelectEdge(edge.id);
              }}
            />
          </g>
        ))}
      </svg>

      {project.network.inputSources.map((source) => (
        <button
          key={source.id}
          className="bfn-canvas-node bfn-canvas-node--source"
          data-selected={selectedNodeId === source.id}
          type="button"
          style={{ left: source.position.x, top: source.position.y }}
          aria-label={`${t(source.labelKey)}, ${t('bfn.nodeKinds.inputSource')}`}
          onPointerDown={(event) => beginDrag(event, source.id, source.position)}
          onClick={() => onSelectNode(source.id)}
        >
          <span className="bfn-canvas-node__index">{t('bfn.nodeKinds.input')}</span>
          <small>{t('bfn.nodeKinds.inputSource')}</small>
          <strong>{t(source.labelKey)}</strong>
          <span className="bfn-canvas-node__port bfn-canvas-node__port--out">
            {bfnPortLabel(source.outputPort, t)}
          </span>
        </button>
      ))}

      {project.network.modules.map((module) => (
        <button
          key={module.id}
          className="bfn-canvas-node bfn-canvas-node--module"
          data-selected={selectedNodeId === module.id}
          type="button"
          style={{ left: module.position.x, top: module.position.y }}
          aria-label={`${t(module.labelKey)}, ${t('bfn.nodeKinds.functionalModule')}`}
          onPointerDown={(event) => beginDrag(event, module.id, module.position)}
          onClick={() => onSelectNode(module.id)}
        >
          <span className="bfn-canvas-node__index">{t('bfn.nodeKinds.module')}</span>
          <small>{t(`bfn.modelFamilies.${modelFamily(module, project)}`)}</small>
          <strong>{t(module.labelKey)}</strong>
          <span className="bfn-canvas-node__port bfn-canvas-node__port--in">
            {module.inputPorts[0] ? bfnPortLabel(module.inputPorts[0], t) : '—'}
          </span>
          <span className="bfn-canvas-node__port bfn-canvas-node__port--out">
            {module.outputPorts[0] ? bfnPortLabel(module.outputPorts[0], t) : '—'}
          </span>
        </button>
      ))}

      {project.network.outputMonitors.map((monitor) => (
        <button
          key={monitor.id}
          className="bfn-canvas-node bfn-canvas-node--monitor"
          data-selected={selectedNodeId === monitor.id}
          type="button"
          style={{ left: monitor.position.x, top: monitor.position.y }}
          aria-label={`${t(monitor.labelKey)}, ${t('bfn.nodeKinds.outputMonitor')}`}
          onPointerDown={(event) => beginDrag(event, monitor.id, monitor.position)}
          onClick={() => onSelectNode(monitor.id)}
        >
          <span className="bfn-canvas-node__index">{t('bfn.nodeKinds.output')}</span>
          <small>{t('bfn.nodeKinds.outputMonitor')}</small>
          <strong>{t(monitor.labelKey)}</strong>
          <span className="bfn-canvas-node__port bfn-canvas-node__port--in">
            {bfnPortLabel(monitor.inputPort, t)}
          </span>
        </button>
      ))}
    </div>
  );
}
