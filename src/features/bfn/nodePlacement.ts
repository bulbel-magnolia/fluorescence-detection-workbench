import type { BfnCanvasPosition, BfnProject } from './types';

export const BFN_CANVAS_SIZE = { width: 980, height: 520 } as const;
export const BFN_NODE_SIZE = { width: 172, height: 112 } as const;

export interface BfnCanvasViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

const placementPadding = 18;
const pairGap = 44;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function overlaps(left: BfnCanvasPosition, right: BfnCanvasPosition): boolean {
  return !(
    left.x + BFN_NODE_SIZE.width + placementPadding <= right.x ||
    right.x + BFN_NODE_SIZE.width + placementPadding <= left.x ||
    left.y + BFN_NODE_SIZE.height + placementPadding <= right.y ||
    right.y + BFN_NODE_SIZE.height + placementPadding <= left.y
  );
}

export function bfnNodePositionsOverlap(
  left: BfnCanvasPosition,
  right: BfnCanvasPosition,
): boolean {
  return overlaps(left, right);
}

function candidateAt(center: BfnCanvasPosition, column: number, row: number): BfnCanvasPosition {
  return {
    x: clamp(
      center.x + column * (BFN_NODE_SIZE.width + 24),
      12,
      BFN_CANVAS_SIZE.width - BFN_NODE_SIZE.width - 12,
    ),
    y: clamp(
      center.y + row * (BFN_NODE_SIZE.height + 24),
      20,
      BFN_CANVAS_SIZE.height - BFN_NODE_SIZE.height - 20,
    ),
  };
}

export function findBfnModulePlacement(
  project: BfnProject,
  viewport: BfnCanvasViewport,
): BfnCanvasPosition {
  const occupied = [
    ...project.network.inputSources.map((node) => node.position),
    ...project.network.modules.map((node) => node.position),
    ...project.network.outputMonitors.map((node) => node.position),
  ];
  const center = {
    x: clamp(
      viewport.x + viewport.width / 2 - BFN_NODE_SIZE.width / 2,
      12,
      BFN_CANVAS_SIZE.width - BFN_NODE_SIZE.width - 12,
    ),
    y: clamp(
      viewport.y + viewport.height / 2 - BFN_NODE_SIZE.height / 2,
      20,
      BFN_CANVAS_SIZE.height - BFN_NODE_SIZE.height - 20,
    ),
  };

  for (let radius = 0; radius <= 5; radius += 1) {
    for (let row = -radius; row <= radius; row += 1) {
      for (let column = -radius; column <= radius; column += 1) {
        if (radius > 0 && Math.max(Math.abs(column), Math.abs(row)) !== radius) continue;
        const candidate = candidateAt(center, column, row);
        if (!occupied.some((position) => overlaps(candidate, position))) return candidate;
      }
    }
  }
  return candidateAt(center, 0, 0);
}

export interface BfnNodePairPlacement {
  inputSource: BfnCanvasPosition;
  module: BfnCanvasPosition;
}

export function findBfnCatalogPairPlacement(
  project: BfnProject,
  viewport: BfnCanvasViewport,
): BfnNodePairPlacement {
  const occupied = [
    ...project.network.inputSources.map((node) => node.position),
    ...project.network.modules.map((node) => node.position),
    ...project.network.outputMonitors.map((node) => node.position),
  ];
  const totalWidth = BFN_NODE_SIZE.width * 2 + pairGap;
  const maximumLeft = BFN_CANVAS_SIZE.width - totalWidth - 12;
  const desired = {
    x: clamp(viewport.x + viewport.width / 2 - totalWidth / 2, 12, maximumLeft),
    y: clamp(
      viewport.y + viewport.height / 2 - BFN_NODE_SIZE.height / 2,
      20,
      BFN_CANVAS_SIZE.height - BFN_NODE_SIZE.height - 20,
    ),
  };
  const candidates: BfnCanvasPosition[] = [];
  for (let y = 20; y <= BFN_CANVAS_SIZE.height - BFN_NODE_SIZE.height - 20; y += 24) {
    for (let x = 12; x <= maximumLeft; x += 24) candidates.push({ x, y });
  }
  candidates.push(desired);
  candidates.sort(
    (left, right) =>
      Math.hypot(left.x - desired.x, left.y - desired.y) -
      Math.hypot(right.x - desired.x, right.y - desired.y),
  );
  for (const inputSource of candidates) {
    const module = { x: inputSource.x + BFN_NODE_SIZE.width + pairGap, y: inputSource.y };
    if (
      !occupied.some((position) => overlaps(inputSource, position) || overlaps(module, position))
    ) {
      return { inputSource, module };
    }
  }

  const module = findBfnModulePlacement(project, viewport);
  const sourceCandidates = candidates
    .map((position) => ({ x: position.x, y: position.y }))
    .sort(
      (left, right) =>
        Math.hypot(left.x - (module.x - BFN_NODE_SIZE.width - pairGap), left.y - module.y) -
        Math.hypot(right.x - (module.x - BFN_NODE_SIZE.width - pairGap), right.y - module.y),
    );
  const inputSource = sourceCandidates.find(
    (position) =>
      !overlaps(position, module) && !occupied.some((existing) => overlaps(position, existing)),
  );
  return { inputSource: inputSource ?? { x: 12, y: 20 }, module };
}
