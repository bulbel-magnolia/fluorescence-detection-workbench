import { describe, expect, it } from 'vitest';
import { retryDelayMs, transitionSyncState } from './syncService';

describe('offline sync state model', () => {
  it('moves local records through pending and synced states', () => {
    expect(transitionSyncState('local-only', 'enqueue')).toBe('pending');
    expect(transitionSyncState('pending', 'start')).toBe('retrying');
    expect(transitionSyncState('retrying', 'succeed')).toBe('synced');
  });

  it('retains pending delete after a retryable failure', () => {
    expect(transitionSyncState('pending-delete', 'retryable-failure')).toBe('pending-delete');
  });

  it('caps exponential retry delay at five minutes', () => {
    expect(retryDelayMs(0)).toBe(1000);
    expect(retryDelayMs(3)).toBe(8000);
    expect(retryDelayMs(20)).toBe(300000);
  });
});
