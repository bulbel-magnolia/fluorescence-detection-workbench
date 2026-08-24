import { describe, expect, it } from 'vitest';
import {
  InvalidDetectionTransitionError,
  canTransition,
  transitionDetectionState,
} from './stateMachine';

describe('detection state machine', () => {
  it('accepts the primary measurement flow', () => {
    const flow = [
      'idle',
      'scanning',
      'connecting',
      'connected',
      'ready',
      'running',
      'stopping',
      'finished',
    ] as const;

    for (let index = 0; index < flow.length - 1; index += 1) {
      expect(canTransition(flow[index]!, flow[index + 1]!)).toBe(true);
    }
  });

  it('rejects start-like transitions while disconnected', () => {
    expect(() => transitionDetectionState('disconnected', 'running')).toThrow(
      InvalidDetectionTransitionError,
    );
  });
});
