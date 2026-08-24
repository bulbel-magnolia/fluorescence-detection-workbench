import { describe, expect, it } from 'vitest';
import {
  appendActivity,
  createActivity,
  maximumActivityEvents,
  type ModelingActivity,
} from './activity';

describe('modeling activity', () => {
  it('deduplicates rapid updates to the same parameter', () => {
    const first = createActivity(
      'parameter.changed',
      { subjectId: 'node-1', key: 'gain', value: 1 },
      1_000,
    );
    const second = createActivity(
      'parameter.changed',
      { subjectId: 'node-1', key: 'gain', value: 1.2 },
      1_200,
    );
    expect(appendActivity([first], second)).toEqual([second]);
  });

  it('retains a bounded ordered session history', () => {
    let events: ModelingActivity[] = [];
    for (let index = 0; index < maximumActivityEvents + 20; index += 1) {
      events = appendActivity(
        events,
        createActivity('simulation.run', { subjectId: String(index) }, index * 1_000),
      );
    }
    expect(events).toHaveLength(maximumActivityEvents);
    expect(events.at(-1)?.detail.subjectId).toBe(String(maximumActivityEvents + 19));
  });

  it('accepts all catalog lifecycle activity types', () => {
    const types = [
      'catalog.attached',
      'catalog.detached',
      'catalog.unavailable',
      'catalog.versionUnsupported',
    ] as const;
    expect(
      types.map((type, index) =>
        createActivity(type, { subjectId: 'sensor-a', value: index }, 10_000 + index * 1_000),
      ),
    ).toHaveLength(4);
  });
});
