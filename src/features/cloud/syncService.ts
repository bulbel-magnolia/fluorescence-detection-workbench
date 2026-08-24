import type { HistoryRecord, SyncState } from '../../domain/types';
import { getSupabaseClient } from './supabaseClient';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type SyncEvent =
  'enqueue' | 'start' | 'succeed' | 'retryable-failure' | 'terminal-failure' | 'delete';

const transitions: Record<SyncState, Partial<Record<SyncEvent, SyncState>>> = {
  'local-only': { enqueue: 'pending', delete: 'pending-delete' },
  pending: {
    start: 'retrying',
    succeed: 'synced',
    'retryable-failure': 'sync-error',
    'terminal-failure': 'sync-error',
    delete: 'pending-delete',
  },
  retrying: {
    succeed: 'synced',
    'retryable-failure': 'pending',
    'terminal-failure': 'sync-error',
    delete: 'pending-delete',
  },
  synced: { enqueue: 'pending', delete: 'pending-delete' },
  'sync-error': { start: 'retrying', enqueue: 'pending', delete: 'pending-delete' },
  'pending-delete': {
    start: 'retrying',
    succeed: 'synced',
    'retryable-failure': 'pending-delete',
    'terminal-failure': 'sync-error',
  },
};

export function transitionSyncState(state: SyncState, event: SyncEvent): SyncState {
  return transitions[state][event] ?? state;
}

export function retryDelayMs(attempt: number): number {
  const normalized = Math.max(0, Math.floor(attempt));
  return Math.min(5 * 60_000, 1000 * 2 ** normalized);
}

export interface SyncEnvelope {
  workspaceId: string;
  idempotencyKey: string;
  operation: 'upsert' | 'delete';
  record: HistoryRecord;
}

export function createSyncEnvelope(
  workspaceId: string,
  record: HistoryRecord,
  operation: 'upsert' | 'delete' = 'upsert',
): SyncEnvelope {
  return {
    workspaceId,
    idempotencyKey: `${record.id}:${operation}:${record.createdAt}`,
    operation,
    record,
  };
}

export async function syncRecord(
  workspaceId: string,
  record: HistoryRecord,
  operation: 'upsert' | 'delete' = 'upsert',
): Promise<{ syncedAt: string } | { error: string; retryable: boolean }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { error: 'SUPABASE_NOT_CONFIGURED', retryable: false };
  }
  const envelope = createSyncEnvelope(workspaceId, record, operation);
  const response: unknown = await supabase.functions.invoke<unknown>('sync-record', {
    body: envelope,
  });
  if (!isRecord(response)) {
    return { error: 'INVALID_SYNC_RESPONSE', retryable: true };
  }
  const error = response.error;
  if (isRecord(error) && typeof error.message === 'string') {
    const retryable = !/401|403|invalid|access/i.test(error.message);
    return { error: error.message, retryable };
  }
  const data = response.data;
  if (!isRecord(data)) {
    return { error: 'INVALID_SYNC_RESPONSE', retryable: true };
  }
  const syncedAt = data.syncedAt;
  return typeof syncedAt === 'string'
    ? { syncedAt }
    : { error: 'INVALID_SYNC_RESPONSE', retryable: true };
}
