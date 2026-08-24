export type ModelingActivityType =
  | 'template.loaded'
  | 'node.added'
  | 'node.deleted'
  | 'node.duplicated'
  | 'part.replaced'
  | 'parameter.changed'
  | 'edge.linked'
  | 'edge.changed'
  | 'edge.deleted'
  | 'record.linked'
  | 'record.unlinked'
  | 'catalog.applied'
  | 'catalog.attached'
  | 'catalog.detached'
  | 'catalog.unavailable'
  | 'catalog.versionUnsupported'
  | 'model.imported'
  | 'simulation.run'
  | 'simulation.error'
  | 'reverse.applied'
  | 'run.restored'
  | 'history.undo'
  | 'history.redo';

export interface ModelingActivity {
  id: string;
  type: ModelingActivityType;
  timestamp: number;
  detail: {
    subjectId: string;
    label?: string;
    key?: string;
    value?: string | number | boolean;
  };
}

export const maximumActivityEvents = 80;
const dedupeWindowMs = 400;
let sequence = 0;

export function createActivity(
  type: ModelingActivityType,
  detail: ModelingActivity['detail'],
  timestamp = Date.now(),
): ModelingActivity {
  sequence += 1;
  return {
    id: `${timestamp}-${sequence}`,
    type,
    timestamp,
    detail: { ...detail },
  };
}

function sameBurst(previous: ModelingActivity | undefined, next: ModelingActivity): boolean {
  return Boolean(
    previous &&
    previous.type === next.type &&
    previous.detail.subjectId === next.detail.subjectId &&
    previous.detail.key === next.detail.key &&
    next.timestamp - previous.timestamp <= dedupeWindowMs,
  );
}

export function appendActivity(
  events: ModelingActivity[],
  event: ModelingActivity,
): ModelingActivity[] {
  const next = [...events];
  if (sameBurst(next.at(-1), event)) {
    next[next.length - 1] = event;
  } else {
    next.push(event);
  }
  return next.slice(-maximumActivityEvents);
}
