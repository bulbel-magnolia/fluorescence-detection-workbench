import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  bfnModuleFlowLabel,
  bfnNodeDisplayName,
  bfnPortMetaLabel,
  bfnPortPrimaryLabel,
} from './presentation';
import { BFN_CANVAS_SIZE, BFN_NODE_SIZE, type BfnCanvasViewport } from './nodePlacement';
import type {
  BfnCanvasPosition,
  BfnIdealEdge,
  BfnIdealEdgeEndpoint,
  BfnPort,
  BfnProject,
} from './types';

export interface BfnConnectionCandidateStatus {
  compatible: boolean;
  message: string | null;
}

interface BfnNetworkCanvasProps {
  project: BfnProject;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onClearSelection: () => void;
  onMoveNode: (nodeId: string, position: BfnCanvasPosition) => void;
  onMoveNodeCommit: (nodeId: string, start: BfnCanvasPosition, end: BfnCanvasPosition) => void;
  evaluateConnection: (
    source: BfnIdealEdgeEndpoint,
    target: BfnIdealEdgeEndpoint,
  ) => BfnConnectionCandidateStatus;
  onCreateConnection: (source: BfnIdealEdgeEndpoint, target: BfnIdealEdgeEndpoint) => boolean;
  onViewportChange: (viewport: BfnCanvasViewport) => void;
}

interface NodeDragState {
  nodeId: string;
  startPointer: BfnCanvasPosition;
  startPosition: BfnCanvasPosition;
  lastPosition: BfnCanvasPosition;
}

interface ConnectionDragState {
  source: BfnIdealEdgeEndpoint;
  sourcePoint: BfnCanvasPosition;
  pointerPoint: BfnCanvasPosition;
  candidates: Record<string, BfnConnectionCandidateStatus>;
  hoveredTargetKey: string | null;
}

interface ConnectionFeedback {
  message: string;
  point: BfnCanvasPosition;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function endpointKey(endpoint: BfnIdealEdgeEndpoint): string {
  return `${endpoint.nodeId}::${endpoint.portId}`;
}

function portTop(index: number, total: number): number {
  if (total <= 1) return BFN_NODE_SIZE.height / 2;
  return 34 + (index / (total - 1)) * 44;
}

function nodePosition(project: BfnProject, nodeId: string): BfnCanvasPosition | null {
  return (
    project.network.inputSources.find((node) => node.id === nodeId)?.position ??
    project.network.modules.find((node) => node.id === nodeId)?.position ??
    project.network.outputMonitors.find((node) => node.id === nodeId)?.position ??
    null
  );
}

function endpointPosition(
  project: BfnProject,
  endpoint: BfnIdealEdgeEndpoint,
): BfnCanvasPosition | null {
  const position = nodePosition(project, endpoint.nodeId);
  if (!position) return null;
  const source = project.network.inputSources.find((node) => node.id === endpoint.nodeId);
  if (source?.outputPort.id === endpoint.portId) {
    return { x: position.x + BFN_NODE_SIZE.width, y: position.y + portTop(0, 1) };
  }
  const module = project.network.modules.find((node) => node.id === endpoint.nodeId);
  if (module) {
    const inputIndex = module.inputPorts.findIndex((port) => port.id === endpoint.portId);
    if (inputIndex >= 0) {
      return { x: position.x, y: position.y + portTop(inputIndex, module.inputPorts.length) };
    }
    const outputIndex = module.outputPorts.findIndex((port) => port.id === endpoint.portId);
    if (outputIndex >= 0) {
      return {
        x: position.x + BFN_NODE_SIZE.width,
        y: position.y + portTop(outputIndex, module.outputPorts.length),
      };
    }
  }
  const monitor = project.network.outputMonitors.find((node) => node.id === endpoint.nodeId);
  if (monitor?.inputPort.id === endpoint.portId) {
    return { x: position.x, y: position.y + portTop(0, 1) };
  }
  return null;
}

function connectionPath(start: BfnCanvasPosition, end: BfnCanvasPosition): string {
  const bend = Math.max(55, Math.abs(end.x - start.x) * 0.46);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

function edgePath(project: BfnProject, edge: BfnIdealEdge): string {
  return connectionPath(
    endpointPosition(project, edge.source) ?? { x: 0, y: 0 },
    endpointPosition(project, edge.target) ?? { x: 0, y: 0 },
  );
}

function inputEndpoints(project: BfnProject): BfnIdealEdgeEndpoint[] {
  return [
    ...project.network.modules.flatMap((module) =>
      module.inputPorts.map((port) => ({ nodeId: module.id, portId: port.id })),
    ),
    ...project.network.outputMonitors.map((monitor) => ({
      nodeId: monitor.id,
      portId: monitor.inputPort.id,
    })),
  ];
}

function canvasPointFromClient(
  canvas: HTMLDivElement,
  clientX: number,
  clientY: number,
): BfnCanvasPosition {
  const rect = canvas.getBoundingClientRect();
  const renderedScaleX =
    rect.width > 0 && canvas.clientWidth > 0 ? canvas.clientWidth / rect.width : 1;
  const renderedScaleY =
    rect.height > 0 && canvas.clientHeight > 0 ? canvas.clientHeight / rect.height : 1;
  const logicalScaleX = BFN_CANVAS_SIZE.width / Math.max(BFN_CANVAS_SIZE.width, canvas.scrollWidth);
  const logicalScaleY =
    BFN_CANVAS_SIZE.height / Math.max(BFN_CANVAS_SIZE.height, canvas.scrollHeight);
  return {
    x: clamp(
      ((clientX - rect.left) * renderedScaleX + canvas.scrollLeft) * logicalScaleX,
      0,
      BFN_CANVAS_SIZE.width,
    ),
    y: clamp(
      ((clientY - rect.top) * renderedScaleY + canvas.scrollTop) * logicalScaleY,
      0,
      BFN_CANVAS_SIZE.height,
    ),
  };
}

function canvasViewport(canvas: HTMLDivElement): BfnCanvasViewport {
  const scaleX = BFN_CANVAS_SIZE.width / Math.max(BFN_CANVAS_SIZE.width, canvas.scrollWidth);
  const scaleY = BFN_CANVAS_SIZE.height / Math.max(BFN_CANVAS_SIZE.height, canvas.scrollHeight);
  return {
    x: canvas.scrollLeft * scaleX,
    y: canvas.scrollTop * scaleY,
    width: Math.min(BFN_CANVAS_SIZE.width, (canvas.clientWidth || 720) * scaleX),
    height: Math.min(BFN_CANVAS_SIZE.height, (canvas.clientHeight || 410) * scaleY),
  };
}

export function BfnNetworkCanvas({
  project,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onMoveNode,
  onMoveNodeCommit,
  evaluateConnection,
  onCreateConnection,
  onViewportChange,
}: BfnNetworkCanvasProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  const connectionDragRef = useRef<ConnectionDragState | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(null);
  const [connectionFeedback, setConnectionFeedback] = useState<ConnectionFeedback | null>(null);

  const setActiveConnection = (next: ConnectionDragState | null): void => {
    connectionDragRef.current = next;
    setConnectionDrag(next);
  };
  const clearFeedbackTimer = (): void => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
  };
  const cancelConnection = (): void => {
    setActiveConnection(null);
    setConnectionFeedback(null);
    clearFeedbackTimer();
  };
  const finishConnection = (target: BfnIdealEdgeEndpoint): void => {
    const drag = connectionDragRef.current;
    if (!drag) return;
    const status = drag.candidates[endpointKey(target)];
    if (status?.compatible && onCreateConnection(drag.source, target)) {
      cancelConnection();
      return;
    }
    const message = status?.message;
    const point = drag.pointerPoint;
    setActiveConnection(null);
    if (!message) {
      setConnectionFeedback(null);
      return;
    }
    setConnectionFeedback({ message, point });
    clearFeedbackTimer();
    feedbackTimerRef.current = window.setTimeout(() => setConnectionFeedback(null), 1800);
  };
  const finishNodeDrag = (): void => {
    const drag = nodeDragRef.current;
    nodeDragRef.current = null;
    if (
      drag &&
      (drag.startPosition.x !== drag.lastPosition.x || drag.startPosition.y !== drag.lastPosition.y)
    ) {
      onMoveNodeCommit(drag.nodeId, drag.startPosition, drag.lastPosition);
    }
  };

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pointer = canvasPointFromClient(canvas, event.clientX, event.clientY);
      const nodeDrag = nodeDragRef.current;
      if (nodeDrag) {
        const next = {
          x: clamp(
            nodeDrag.startPosition.x + pointer.x - nodeDrag.startPointer.x,
            12,
            BFN_CANVAS_SIZE.width - BFN_NODE_SIZE.width - 12,
          ),
          y: clamp(
            nodeDrag.startPosition.y + pointer.y - nodeDrag.startPointer.y,
            20,
            BFN_CANVAS_SIZE.height - BFN_NODE_SIZE.height - 20,
          ),
        };
        nodeDrag.lastPosition = next;
        onMoveNode(nodeDrag.nodeId, next);
      }
      const connection = connectionDragRef.current;
      if (connection) setActiveConnection({ ...connection, pointerPoint: pointer });
    };
    const end = (event: PointerEvent): void => {
      if (connectionDragRef.current) {
        const hit = document.elementFromPoint?.(event.clientX, event.clientY);
        const handle = hit?.closest('[data-bfn-input-handle="true"]') as HTMLElement | null;
        const nodeId = handle?.dataset.nodeId;
        const portId = handle?.dataset.portId;
        if (nodeId && portId) finishConnection({ nodeId, portId });
        else cancelConnection();
      }
      finishNodeDrag();
    };
    const cancel = (): void => {
      cancelConnection();
      finishNodeDrag();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && connectionDragRef.current) cancelConnection();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape);
    };
  }, [onMoveNode, onMoveNodeCommit, onCreateConnection]);

  useEffect(() => {
    const report = (): void => {
      if (canvasRef.current) onViewportChange(canvasViewport(canvasRef.current));
    };
    report();
    window.addEventListener('resize', report);
    return () => window.removeEventListener('resize', report);
  }, [onViewportChange]);

  useEffect(() => () => clearFeedbackTimer(), []);

  const beginNodeDrag = (
    event: React.PointerEvent,
    nodeId: string,
    position: BfnCanvasPosition,
  ): void => {
    if (event.button !== 0 || connectionDragRef.current) return;
    if (event.target instanceof Element && event.target.closest('[data-bfn-port-handle="true"]')) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSelectNode(nodeId);
    nodeDragRef.current = {
      nodeId,
      startPointer: canvasPointFromClient(canvas, event.clientX, event.clientY),
      startPosition: position,
      lastPosition: position,
    };
  };

  const startConnection = (source: BfnIdealEdgeEndpoint): void => {
    nodeDragRef.current = null;
    clearFeedbackTimer();
    setConnectionFeedback(null);
    const start = endpointPosition(project, source);
    if (!start) return;
    const candidates = Object.fromEntries(
      inputEndpoints(project).map((target) => [
        endpointKey(target),
        evaluateConnection(source, target),
      ]),
    );
    onSelectNode(source.nodeId);
    setActiveConnection({
      source,
      sourcePoint: start,
      pointerPoint: start,
      candidates,
      hoveredTargetKey: null,
    });
  };

  const beginConnection = (event: React.PointerEvent, source: BfnIdealEdgeEndpoint): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startConnection(source);
  };

  const hoverInput = (target: BfnIdealEdgeEndpoint | null): void => {
    const drag = connectionDragRef.current;
    if (!drag) return;
    setActiveConnection({
      ...drag,
      pointerPoint: target
        ? (endpointPosition(project, target) ?? drag.pointerPoint)
        : drag.pointerPoint,
      hoveredTargetKey: target ? endpointKey(target) : null,
    });
  };

  const portLabel = (nodeLabel: string, port: BfnPort, direction: 'input' | 'output'): string =>
    t(`bfn.canvas.${direction}PortLabel`, {
      node: nodeLabel,
      port: bfnPortPrimaryLabel(port, t, language),
    });

  const inputHandle = (
    nodeId: string,
    nodeDisplayLabel: string,
    port: BfnPort,
    index: number,
    total: number,
  ) => {
    const endpoint = { nodeId, portId: port.id };
    const key = endpointKey(endpoint);
    const status = connectionDrag?.candidates[key];
    const state = !connectionDrag ? 'idle' : status?.compatible ? 'compatible' : 'incompatible';
    return (
      <button
        key={port.id}
        className="bfn-canvas-port bfn-canvas-port--in"
        type="button"
        style={{ top: portTop(index, total) }}
        aria-label={portLabel(nodeDisplayLabel, port, 'input')}
        data-bfn-port-handle="true"
        data-bfn-input-handle="true"
        data-node-id={nodeId}
        data-port-id={port.id}
        data-connection-state={state}
        data-hovered={connectionDrag?.hoveredTargetKey === key}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerEnter={() => hoverInput(endpoint)}
        onPointerLeave={() => hoverInput(null)}
        onFocus={() => hoverInput(endpoint)}
        onBlur={() => hoverInput(null)}
        onPointerUp={(event) => {
          event.preventDefault();
          event.stopPropagation();
          finishConnection(endpoint);
        }}
        onKeyDown={(event) => {
          if (!connectionDragRef.current || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          event.stopPropagation();
          finishConnection(endpoint);
        }}
      >
        <span className="bfn-canvas-port__dot" aria-hidden="true" />
        <span className="bfn-canvas-port__tooltip" role="tooltip">
          {bfnPortPrimaryLabel(port, t, language)}
        </span>
      </button>
    );
  };

  const outputHandle = (
    nodeId: string,
    nodeDisplayLabel: string,
    port: BfnPort,
    index: number,
    total: number,
  ) => {
    const endpoint = { nodeId, portId: port.id };
    return (
      <button
        key={port.id}
        className="bfn-canvas-port bfn-canvas-port--out"
        type="button"
        style={{ top: portTop(index, total) }}
        aria-label={portLabel(nodeDisplayLabel, port, 'output')}
        data-bfn-port-handle="true"
        data-node-id={nodeId}
        data-port-id={port.id}
        data-drag-source={connectionDrag?.source.portId === port.id}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => beginConnection(event, endpoint)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          startConnection(endpoint);
        }}
      >
        <span className="bfn-canvas-port__dot" aria-hidden="true" />
        <span className="bfn-canvas-port__tooltip" role="tooltip">
          {bfnPortPrimaryLabel(port, t, language)}
        </span>
      </button>
    );
  };

  const selectedTargetStatus = connectionDrag?.hoveredTargetKey
    ? connectionDrag.candidates[connectionDrag.hoveredTargetKey]
    : null;

  return (
    <div
      ref={canvasRef}
      className="bfn-canvas"
      role="application"
      aria-label={t('bfn.canvas.label')}
      data-connecting={Boolean(connectionDrag)}
      onScroll={(event) => onViewportChange(canvasViewport(event.currentTarget))}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.bfn-canvas-node, .bfn-canvas-edge, .bfn-canvas-port')
        ) {
          return;
        }
        onClearSelection();
      }}
    >
      <div className="bfn-canvas__grid" aria-hidden="true" />
      <svg
        className="bfn-canvas__edges"
        viewBox={`0 0 ${BFN_CANVAS_SIZE.width} ${BFN_CANVAS_SIZE.height}`}
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
          <marker
            id="bfn-preview-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" />
          </marker>
          <marker
            id="bfn-preview-arrow-compatible"
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
        {connectionDrag ? (
          <path
            className="bfn-canvas-edge bfn-canvas-edge--preview"
            data-target-compatible={selectedTargetStatus?.compatible ?? false}
            d={connectionPath(connectionDrag.sourcePoint, connectionDrag.pointerPoint)}
            markerEnd={
              selectedTargetStatus?.compatible
                ? 'url(#bfn-preview-arrow-compatible)'
                : 'url(#bfn-preview-arrow)'
            }
          />
        ) : null}
      </svg>

      {project.network.inputSources.map((source) => (
        <div
          key={source.id}
          className="bfn-canvas-node bfn-canvas-node--source"
          data-selected={selectedNodeId === source.id}
          role="button"
          tabIndex={0}
          style={{ left: source.position.x, top: source.position.y }}
          aria-label={`${bfnNodeDisplayName(source, language, t)}, ${t('bfn.nodeKinds.inputSource')}`}
          onPointerDown={(event) => beginNodeDrag(event, source.id, source.position)}
          onClick={() => onSelectNode(source.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelectNode(source.id);
          }}
        >
          <span className="bfn-canvas-node__index">{t('bfn.nodeKinds.input')}</span>
          <strong>{bfnNodeDisplayName(source, language, t)}</strong>
          <span className="bfn-canvas-node__flow">{bfnPortMetaLabel(source.outputPort, t)}</span>
          {outputHandle(
            source.id,
            bfnNodeDisplayName(source, language, t),
            source.outputPort,
            0,
            1,
          )}
        </div>
      ))}

      {project.network.modules.map((module) => (
        <div
          key={module.id}
          className="bfn-canvas-node bfn-canvas-node--module"
          data-selected={selectedNodeId === module.id}
          role="button"
          tabIndex={0}
          style={{ left: module.position.x, top: module.position.y }}
          aria-label={`${bfnNodeDisplayName(module, language, t)}, ${t('bfn.nodeKinds.functionalModule')}`}
          onPointerDown={(event) => beginNodeDrag(event, module.id, module.position)}
          onClick={() => onSelectNode(module.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelectNode(module.id);
          }}
        >
          <span className="bfn-canvas-node__index">{t('bfn.nodeKinds.module')}</span>
          <strong>{bfnNodeDisplayName(module, language, t)}</strong>
          <span className="bfn-canvas-node__flow">{bfnModuleFlowLabel(module, t, language)}</span>
          {module.inputPorts.map((port, index) =>
            inputHandle(
              module.id,
              bfnNodeDisplayName(module, language, t),
              port,
              index,
              module.inputPorts.length,
            ),
          )}
          {module.outputPorts.map((port, index) =>
            outputHandle(
              module.id,
              bfnNodeDisplayName(module, language, t),
              port,
              index,
              module.outputPorts.length,
            ),
          )}
        </div>
      ))}

      {project.network.outputMonitors.map((monitor) => (
        <div
          key={monitor.id}
          className="bfn-canvas-node bfn-canvas-node--monitor"
          data-selected={selectedNodeId === monitor.id}
          role="button"
          tabIndex={0}
          style={{ left: monitor.position.x, top: monitor.position.y }}
          aria-label={`${bfnNodeDisplayName(monitor, language, t)}, ${t('bfn.nodeKinds.outputMonitor')}`}
          onPointerDown={(event) => beginNodeDrag(event, monitor.id, monitor.position)}
          onClick={() => onSelectNode(monitor.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelectNode(monitor.id);
          }}
        >
          <span className="bfn-canvas-node__index">{t('bfn.nodeKinds.output')}</span>
          <strong>{bfnNodeDisplayName(monitor, language, t)}</strong>
          <span className="bfn-canvas-node__flow">{bfnPortMetaLabel(monitor.inputPort, t)}</span>
          {inputHandle(
            monitor.id,
            bfnNodeDisplayName(monitor, language, t),
            monitor.inputPort,
            0,
            1,
          )}
        </div>
      ))}

      {connectionDrag?.hoveredTargetKey && selectedTargetStatus?.message ? (
        <div
          className="bfn-connection-feedback"
          data-compatible={selectedTargetStatus.compatible}
          style={{
            left: clamp(connectionDrag.pointerPoint.x + 14, 12, BFN_CANVAS_SIZE.width - 250),
            top: clamp(connectionDrag.pointerPoint.y + 14, 12, BFN_CANVAS_SIZE.height - 72),
          }}
          role="status"
        >
          {selectedTargetStatus.message}
        </div>
      ) : null}
      {connectionFeedback ? (
        <div
          className="bfn-connection-feedback"
          data-compatible="false"
          style={{
            left: clamp(connectionFeedback.point.x + 14, 12, BFN_CANVAS_SIZE.width - 250),
            top: clamp(connectionFeedback.point.y + 14, 12, BFN_CANVAS_SIZE.height - 72),
          }}
          role="status"
        >
          {connectionFeedback.message}
        </div>
      ) : null}
    </div>
  );
}
