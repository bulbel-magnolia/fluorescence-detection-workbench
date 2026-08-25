import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import { BFN_CANVAS_SIZE, BFN_NODE_SIZE, findBfnModulePlacement } from './nodePlacement';

describe('BFN module placement', () => {
  it('places a new module in bounds without covering an existing node', () => {
    const project = createDemoBfnProject();
    const position = findBfnModulePlacement(project, {
      x: 0,
      y: 0,
      width: 760,
      height: 410,
    });

    expect(position.x).toBeGreaterThanOrEqual(12);
    expect(position.y).toBeGreaterThanOrEqual(20);
    expect(position.x + BFN_NODE_SIZE.width).toBeLessThanOrEqual(BFN_CANVAS_SIZE.width - 12);
    expect(position.y + BFN_NODE_SIZE.height).toBeLessThanOrEqual(BFN_CANVAS_SIZE.height - 20);
    expect(
      project.network.modules.some(
        (module) => module.position.x === position.x && module.position.y === position.y,
      ),
    ).toBe(false);
  });
});
