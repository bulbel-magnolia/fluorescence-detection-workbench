import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildNarrativePlan,
  sampleNarrative,
  type NarrativeChapter,
  type NarrativeMode,
  type NarrativePlan,
} from './motionDirector';
import type { NetworkModel } from './types';

export interface RunNarrative {
  status: 'idle' | 'running' | 'complete' | 'error';
  chapter: NarrativeChapter | 'idle' | 'error';
  activeEdgeId: string | null;
  edgeProgress: number;
  resonantNodeId: string | null;
  revealProgress: number;
  start: (mode: NarrativeMode) => void;
  skip: () => void;
  fail: () => void;
  cancel: () => void;
}

const idleState: Omit<RunNarrative, 'start' | 'skip' | 'fail' | 'cancel'> = {
  status: 'idle',
  chapter: 'idle',
  activeEdgeId: null,
  edgeProgress: 0,
  resonantNodeId: null,
  revealProgress: 1,
};

export function useRunNarrative(model: NetworkModel): RunNarrative {
  const frameRef = useRef(0);
  const planRef = useRef<NarrativePlan | null>(null);
  const [state, setState] = useState(idleState);

  const cancel = useCallback((): void => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    planRef.current = null;
  }, []);

  const skip = useCallback((): void => {
    const plan = planRef.current;
    if (!plan) return;
    cancel();
    setState(sampleNarrative(plan, plan.duration));
  }, [cancel]);

  const fail = useCallback((): void => {
    cancel();
    setState({ ...idleState, status: 'error', chapter: 'error' });
  }, [cancel]);

  const start = useCallback(
    (mode: NarrativeMode): void => {
      cancel();
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const plan = buildNarrativePlan(model, mode, reducedMotion);
      planRef.current = plan;
      const startedAt = performance.now();
      const tick = (now: number): void => {
        const next = sampleNarrative(plan, now - startedAt);
        setState(next);
        if (next.complete) {
          frameRef.current = 0;
          planRef.current = null;
          return;
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      setState(sampleNarrative(plan, 0));
      frameRef.current = requestAnimationFrame(tick);
    },
    [cancel, model],
  );

  useEffect(() => () => cancel(), [cancel]);

  return { ...state, start, skip, fail, cancel };
}
