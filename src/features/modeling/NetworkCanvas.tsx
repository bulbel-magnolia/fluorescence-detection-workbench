import {
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { getModelConnectionIssue } from './modelingCore';
import type {
  ModelConnectionRequest,
  ModelEdge,
  ModelInputPort,
  ModelNode,
  ModelOutputPort,
  NetworkModel,
} from './types';
import type { RunNarrative } from './useRunNarrative';

interface NetworkCanvasProps {
  model: NetworkModel;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  nodeKindLabels: Record<ModelNode['kind'], string>;
  narrative: RunNarrative;
  partArrivingNodeId: string | null;
  highlightedNodeIds?: readonly string[];
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onClearSelection?: () => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onCreateConnection: (request: ModelConnectionRequest) => void;
}

interface CanvasPoint {
  x: number;
  y: number;
}
interface DraftConnection {
  sourceNodeId: string;
  sourcePortId: string;
  pointer: CanvasPoint;
}
interface HoveredTarget {
  nodeId: string;
  portId: string;
}

const baseCanvasSize = { width: 900, height: 500 };
const nodeWidth = 156;
const baseNodeHeight = 78;
const portSpacing = 18;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function canvasPoint(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  canvasHeight: number,
): CanvasPoint {
  const bounds = svg.getBoundingClientRect();
  const width = bounds.width || baseCanvasSize.width;
  const height = bounds.height || canvasHeight;
  return {
    x: ((clientX - bounds.left) / width) * baseCanvasSize.width,
    y: ((clientY - bounds.top) / height) * canvasHeight,
  };
}
function nodeHeight(modelNode: ModelNode): number {
  const portCount = Math.max(modelNode.inputPorts.length, modelNode.outputPorts.length, 1);
  return Math.max(baseNodeHeight, 42 + portCount * portSpacing);
}
function portY(modelNode: ModelNode, index: number, count: number): number {
  return modelNode.y + (index - (count - 1) / 2) * portSpacing;
}
function inputPoint(modelNode: ModelNode, index: number): CanvasPoint {
  return {
    x: modelNode.x - nodeWidth / 2,
    y: portY(modelNode, index, modelNode.inputPorts.length),
  };
}
function outputPoint(modelNode: ModelNode, index: number): CanvasPoint {
  return {
    x: modelNode.x + nodeWidth / 2,
    y: portY(modelNode, index, modelNode.outputPorts.length),
  };
}
function pointToPointPath(source: CanvasPoint, target: CanvasPoint): string {
  const curve = Math.max(46, Math.abs(target.x - source.x) * 0.42);
  const direction = target.x >= source.x ? 1 : -1;
  return `M ${source.x} ${source.y} C ${source.x + curve * direction} ${source.y}, ${target.x - curve * direction} ${target.y}, ${target.x} ${target.y}`;
}
function portIndex<T extends { id: string }>(ports: T[], id: string): number {
  return ports.findIndex((port) => port.id === id);
}
function edgePath(
  source: ModelNode,
  sourcePort: ModelOutputPort,
  target: ModelNode,
  targetPort: ModelInputPort,
): string {
  return pointToPointPath(
    outputPoint(source, Math.max(0, portIndex(source.outputPorts, sourcePort.id))),
    inputPoint(target, Math.max(0, portIndex(target.inputPorts, targetPort.id))),
  );
}
function edgeMidpoint(
  source: ModelNode,
  sourcePort: ModelOutputPort,
  target: ModelNode,
  targetPort: ModelInputPort,
): CanvasPoint {
  const from = outputPoint(source, Math.max(0, portIndex(source.outputPorts, sourcePort.id)));
  const to = inputPoint(target, Math.max(0, portIndex(target.inputPorts, targetPort.id)));
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 8 };
}
function shortNodeName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}
export function getCanvasSignalLabel(signalId: string): string {
  if (signalId.startsWith('legacy.signal.')) {
    const sensor = signalId.match(/edge-sensor-([a-z0-9]+)-/u);
    if (sensor?.[1]) return `IN ${sensor[1].toUpperCase()}`;
    if (signalId.includes('edge-integration-response')) return 'Σ';
    if (signalId.includes('edge-response-reporter')) return 'OUT';
    return 'SIGNAL';
  }
  return signalId.length > 22 ? `${signalId.slice(0, 21)}…` : signalId;
}

export function NetworkCanvas({
  model,
  selectedNodeId,
  selectedEdgeId,
  nodeKindLabels,
  narrative,
  partArrivingNodeId,
  highlightedNodeIds = [],
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onMoveNode,
  onCreateConnection,
}: NetworkCanvasProps) {
  const { t } = useTranslation();
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<HoveredTarget | null>(null);
  const nodesById = new Map(model.nodes.map((modelNode) => [modelNode.id, modelNode]));
  const canvasHeight = Math.max(
    baseCanvasSize.height,
    Math.ceil((Math.max(0, ...model.nodes.map((modelNode) => modelNode.y)) + 55) / 10) * 10,
  );

  const clearPointerState = (): void => {
    setDraggingNodeId(null);
    setDraftConnection(null);
    setHoveredTarget(null);
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const point = canvasPoint(event.clientX, event.clientY, event.currentTarget, canvasHeight);
    if (draggingNodeId) {
      onMoveNode(
        draggingNodeId,
        Math.round(clamp(point.x, 90, baseCanvasSize.width - 90)),
        Math.round(clamp(point.y, 55, canvasHeight - 55)),
      );
      return;
    }
    if (draftConnection)
      setDraftConnection((current) => (current ? { ...current, pointer: point } : null));
  };
  const beginNodeDrag = (event: ReactPointerEvent<SVGGElement>, nodeId: string): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingNodeId(nodeId);
    onSelectNode(nodeId);
  };
  const beginConnection = (
    event: ReactPointerEvent<SVGGElement>,
    modelNode: ModelNode,
    outputPort: ModelOutputPort,
  ): void => {
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    onSelectNode(modelNode.id);
    setDraftConnection({
      sourceNodeId: modelNode.id,
      sourcePortId: outputPort.id,
      pointer: outputPoint(modelNode, Math.max(0, portIndex(modelNode.outputPorts, outputPort.id))),
    });
    setHoveredTarget(null);
  };
  const createConnection = (target: HoveredTarget): void => {
    if (!draftConnection) return;
    onCreateConnection({
      sourceNodeId: draftConnection.sourceNodeId,
      sourcePortId: draftConnection.sourcePortId,
      targetNodeId: target.nodeId,
      targetPortId: target.portId,
    });
  };
  const releaseConnection = (
    event: ReactPointerEvent<SVGGElement>,
    target: HoveredTarget,
  ): void => {
    event.stopPropagation();
    createConnection(target);
    clearPointerState();
  };
  const finishPointer = (): void => {
    if (draftConnection && hoveredTarget) createConnection(hoveredTarget);
    clearPointerState();
  };
  const renderEdge = (modelEdge: ModelEdge) => {
    const source = nodesById.get(modelEdge.source);
    const target = nodesById.get(modelEdge.target);
    const sourcePort = source?.outputPorts.find((port) => port.id === modelEdge.sourcePortId);
    const targetPort = target?.inputPorts.find((port) => port.id === modelEdge.targetPortId);
    if (!source || !target || !sourcePort || !targetPort) return null;
    const path = edgePath(source, sourcePort, target, targetPort);
    const midpoint = edgeMidpoint(source, sourcePort, target, targetPort);
    return (
      <g
        key={modelEdge.id}
        className={[
          'model-edge',
          selectedEdgeId === modelEdge.id ? 'is-selected' : '',
          modelEdge.enabled ? '' : 'is-disabled',
        ]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={0}
        aria-label={`${t('modeling.connection')}: ${getCanvasSignalLabel(modelEdge.signalId)}`}
        data-edge-id={modelEdge.id}
        onClick={(event) => {
          event.stopPropagation();
          onSelectEdge(modelEdge.id);
        }}
        onKeyDown={(event: ReactKeyboardEvent<SVGGElement>) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onSelectEdge(modelEdge.id);
        }}
      >
        <path className="model-edge__hit" d={path} />
        <path className="model-edge__line" d={path} markerEnd="url(#model-arrow)" />
        {narrative.activeEdgeId === modelEdge.id ? (
          <>
            <path
              className="signal-tail"
              d={path}
              pathLength="1"
              style={{ '--signal-offset': 1 - narrative.edgeProgress } as CSSProperties}
            />
            <path
              className="signal-core"
              d={path}
              pathLength="1"
              style={{ '--signal-offset': 1 - narrative.edgeProgress } as CSSProperties}
            />
          </>
        ) : null}
        <text className="model-edge__text" x={midpoint.x} y={midpoint.y} textAnchor="middle">
          {getCanvasSignalLabel(modelEdge.signalId)}
        </text>
        <title>{getCanvasSignalLabel(modelEdge.signalId)}</title>
      </g>
    );
  };
  const renderInputPort = (modelNode: ModelNode, inputPort: ModelInputPort, index: number) => {
    const point = inputPoint(modelNode, index);
    const hovered = hoveredTarget?.nodeId === modelNode.id && hoveredTarget.portId === inputPort.id;
    const issue = draftConnection
      ? getModelConnectionIssue(
          model,
          draftConnection.sourceNodeId,
          modelNode.id,
          draftConnection.sourcePortId,
          inputPort.id,
        )
      : null;
    return (
      <g
        key={inputPort.id}
        className={[
          'model-port',
          'model-port--input',
          draftConnection && issue === null ? 'is-valid-target' : '',
          draftConnection && issue !== null ? 'is-invalid-target' : '',
          hovered ? 'is-hovered' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-node-id={modelNode.id}
        data-port-id={inputPort.id}
        data-signal-id={inputPort.signalId}
        role="button"
        tabIndex={0}
        aria-label={`${t('modeling.inputPortLabel', { node: modelNode.name })}: ${getCanvasSignalLabel(inputPort.signalId)}`}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerEnter={() => {
          if (draftConnection) setHoveredTarget({ nodeId: modelNode.id, portId: inputPort.id });
        }}
        onPointerLeave={() => {
          setHoveredTarget((current) =>
            current?.nodeId === modelNode.id && current.portId === inputPort.id ? null : current,
          );
        }}
        onPointerUp={(event) =>
          releaseConnection(event, { nodeId: modelNode.id, portId: inputPort.id })
        }
        onKeyDown={(event) => {
          if (!draftConnection || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          createConnection({ nodeId: modelNode.id, portId: inputPort.id });
          clearPointerState();
        }}
      >
        <circle className="model-port__hit" cx={point.x} cy={point.y} r="16" />
        <circle className="model-port__dot" cx={point.x} cy={point.y} r="5" />
        <text
          className="model-port__label model-port__label--input"
          x={point.x - 10}
          y={point.y + 3}
          textAnchor="end"
        >
          {getCanvasSignalLabel(inputPort.signalId)}
        </text>
        <title>{getCanvasSignalLabel(inputPort.signalId)}</title>
      </g>
    );
  };
  const renderOutputPort = (modelNode: ModelNode, outputPort: ModelOutputPort, index: number) => {
    const point = outputPoint(modelNode, index);
    return (
      <g
        key={outputPort.id}
        className="model-port model-port--output"
        data-node-id={modelNode.id}
        data-port-id={outputPort.id}
        data-signal-id={outputPort.signalId}
        role="button"
        tabIndex={0}
        aria-label={`${t('modeling.outputPortLabel', { node: modelNode.name })}: ${getCanvasSignalLabel(outputPort.signalId)}`}
        onPointerDown={(event) => beginConnection(event, modelNode, outputPort)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onSelectNode(modelNode.id);
          setDraftConnection({
            sourceNodeId: modelNode.id,
            sourcePortId: outputPort.id,
            pointer: point,
          });
          setHoveredTarget(null);
        }}
      >
        <circle className="model-port__hit" cx={point.x} cy={point.y} r="16" />
        <circle className="model-port__dot" cx={point.x} cy={point.y} r="5" />
        <text
          className="model-port__label model-port__label--output"
          x={point.x + 10}
          y={point.y + 3}
          textAnchor="start"
        >
          {getCanvasSignalLabel(outputPort.signalId)}
        </text>
        <title>{getCanvasSignalLabel(outputPort.signalId)}</title>
      </g>
    );
  };
  const draftSourcePoint = (): CanvasPoint => {
    if (!draftConnection) return { x: 0, y: 0 };
    const source = nodesById.get(draftConnection.sourceNodeId);
    const sourcePort = source?.outputPorts.find((port) => port.id === draftConnection.sourcePortId);
    if (!source || !sourcePort) return draftConnection.pointer;
    return outputPoint(source, Math.max(0, portIndex(source.outputPorts, sourcePort.id)));
  };

  return (
    <svg
      className="network-canvas"
      viewBox={'0 0 ' + baseCanvasSize.width + ' ' + canvasHeight}
      style={{ aspectRatio: baseCanvasSize.width + ' / ' + canvasHeight }}
      role="img"
      aria-label={t('modeling.canvasKicker')}
      onPointerMove={move}
      onPointerUp={finishPointer}
      onPointerCancel={clearPointerState}
      onPointerLeave={clearPointerState}
      onClick={(event) => {
        setDraggingNodeId(null);
        const target = event.target;
        if (
          target === event.currentTarget ||
          (target instanceof SVGElement && target.classList.contains('network-canvas__grid'))
        )
          onClearSelection?.();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          clearPointerState();
          onClearSelection?.();
        }
      }}
    >
      <defs>
        <pattern id="model-grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.35" />
        </pattern>
        <pattern id="model-grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
          <rect width="100" height="100" fill="url(#model-grid-small)" />
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="currentColor" strokeWidth="0.7" />
        </pattern>
        <marker
          id="model-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
        <marker
          id="model-preview-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
        <filter id="node-glow" x="-40%" y="-60%" width="180%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect
        className="network-canvas__grid"
        width={baseCanvasSize.width}
        height={canvasHeight}
        fill="url(#model-grid-large)"
      />
      <g className="network-canvas__edges">{model.edges.map(renderEdge)}</g>
      {draftConnection ? (
        <path
          className="model-connection-preview"
          d={pointToPointPath(draftSourcePoint(), draftConnection.pointer)}
          markerEnd="url(#model-preview-arrow)"
        />
      ) : null}
      <g className="network-canvas__nodes">
        {model.nodes.map((modelNode) => {
          const selected = modelNode.id === selectedNodeId;
          const resonating = narrative.resonantNodeId === modelNode.id;
          const partArriving = partArrivingNodeId === modelNode.id;
          const highlighted = highlightedNodeIds.includes(modelNode.id);
          const halfHeight = nodeHeight(modelNode) / 2;
          const points = [
            [modelNode.x - nodeWidth / 2 + 10, modelNode.y - halfHeight],
            [modelNode.x + nodeWidth / 2, modelNode.y - halfHeight],
            [modelNode.x + nodeWidth / 2, modelNode.y + halfHeight - 10],
            [modelNode.x + nodeWidth / 2 - 10, modelNode.y + halfHeight],
            [modelNode.x - nodeWidth / 2, modelNode.y + halfHeight],
            [modelNode.x - nodeWidth / 2, modelNode.y - halfHeight + 10],
          ]
            .map((point) => point.join(','))
            .join(' ');
          const kindLabel = nodeKindLabels[modelNode.kind] ?? modelNode.kind;
          const nodeDetailLabel = modelNode.receiverResponseBinding
            ? `${getCanvasSignalLabel(modelNode.receiverResponseBinding.inputSignalId)} → ${getCanvasSignalLabel(modelNode.receiverResponseBinding.outputSignalId)}`
            : kindLabel;
          return (
            <g
              key={modelNode.id}
              className={[
                'model-node',
                `model-node--${modelNode.kind}`,
                selected ? 'is-selected' : '',
                resonating ? 'is-resonating' : '',
                partArriving ? 'is-part-arriving' : '',
                highlighted ? 'is-part-arriving' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-node-id={modelNode.id}
              role="button"
              tabIndex={0}
              aria-label={`${modelNode.name}, ${kindLabel}`}
              onPointerDown={(event) => beginNodeDrag(event, modelNode.id)}
              onDoubleClick={() => onSelectNode(modelNode.id)}
              onKeyDown={(event: ReactKeyboardEvent<SVGGElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectNode(modelNode.id);
                }
              }}
              filter={selected ? 'url(#node-glow)' : undefined}
            >
              <polygon points={points} />
              <circle cx={modelNode.x - nodeWidth / 2 + 18} cy={modelNode.y} r="10" />
              {resonating ? (
                <>
                  <circle
                    className="model-node__resonance model-node__resonance--inner"
                    cx={modelNode.x}
                    cy={modelNode.y}
                    r="38"
                  />
                  <circle
                    className="model-node__resonance model-node__resonance--outer"
                    cx={modelNode.x}
                    cy={modelNode.y}
                    r="45"
                  />
                </>
              ) : null}
              <text
                className="model-node__name"
                x={modelNode.x}
                y={modelNode.y - 5}
                textAnchor="middle"
              >
                {shortNodeName(modelNode.name)}
              </text>
              <text
                className="model-node__kind"
                x={modelNode.x}
                y={modelNode.y + 16}
                textAnchor="middle"
              >
                {nodeDetailLabel}
              </text>
              <title>{modelNode.name}</title>
              {model.outputNodeId === modelNode.id ? (
                <path
                  className="model-node__output"
                  d={`M ${modelNode.x + nodeWidth / 2 - 16} ${modelNode.y - 19} h 8 v 8`}
                />
              ) : null}
              {modelNode.inputPorts.map((inputPort, index) =>
                renderInputPort(modelNode, inputPort, index),
              )}
              {modelNode.outputPorts.map((outputPort, index) =>
                renderOutputPort(modelNode, outputPort, index),
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
