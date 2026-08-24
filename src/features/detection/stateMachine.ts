import type { DetectionState } from '../../domain/types';

const transitions: Readonly<Record<DetectionState, readonly DetectionState[]>> = {
  idle: ['scanning', 'connecting', 'bluetoothUnavailable', 'permissionRequired'],
  bluetoothUnavailable: ['idle'],
  permissionRequired: ['idle'],
  scanning: ['connecting', 'idle', 'error'],
  connecting: ['connected', 'disconnected', 'error'],
  connected: ['preparing', 'ready', 'disconnected', 'error'],
  preparing: ['ready', 'disconnected', 'error'],
  zeroing: ['ready', 'disconnected', 'error'],
  calibrating: ['ready', 'disconnected', 'error'],
  ready: ['zeroing', 'calibrating', 'running', 'disconnected', 'error'],
  running: ['stopping', 'incomplete', 'disconnected', 'error'],
  stopping: ['finished', 'incomplete', 'disconnected', 'error'],
  finished: ['ready', 'idle', 'disconnected'],
  incomplete: ['ready', 'idle', 'disconnected'],
  disconnected: ['scanning', 'connecting', 'idle'],
  error: ['idle', 'scanning', 'disconnected'],
};

export class InvalidDetectionTransitionError extends Error {
  constructor(
    readonly from: DetectionState,
    readonly to: DetectionState,
  ) {
    super(`Invalid detection transition: ${from} -> ${to}`);
    this.name = 'InvalidDetectionTransitionError';
  }
}

export function canTransition(from: DetectionState, to: DetectionState): boolean {
  return transitions[from].includes(to);
}

export function transitionDetectionState(from: DetectionState, to: DetectionState): DetectionState {
  if (!canTransition(from, to)) {
    throw new InvalidDetectionTransitionError(from, to);
  }
  return to;
}
