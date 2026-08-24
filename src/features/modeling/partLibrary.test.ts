import { describe, expect, it } from 'vitest';
import { applyPart, compatibleParts, modelingParts } from './partLibrary';
import { createModelNode } from './modelingCore';
import type { LiteratureCandidateReference } from './types';

describe('modeling part library', () => {
  it('provides illustrative parts for the three v2 node kinds', () => {
    for (const kind of ['input', 'processing', 'output'] as const) {
      const parts = compatibleParts(kind);
      expect(parts).not.toHaveLength(0);
      expect(parts.every((part) => part.kind === kind)).toBe(true);
    }
    expect(modelingParts.every((part) => part.evidenceStatus === 'illustrative')).toBe(true);
    const forbidden = /km|hill|bias|responseTime|retention|weight/i;
    expect(
      modelingParts.some((part) => forbidden.test(JSON.stringify(part.suggestedParameters))),
    ).toBe(false);
  });

  it('preserves node identity and position during replacement', () => {
    const node = createModelNode('processing', 'Original', 1);
    const part = compatibleParts('processing')[0];
    if (!part) throw new Error('Expected a compatible processing part.');
    const replaced = applyPart(node, part, 'Replacement');
    expect(replaced).toMatchObject({
      id: node.id,
      x: node.x,
      y: node.y,
      kind: node.kind,
      name: 'Replacement',
      part: { id: part.id, evidenceStatus: 'illustrative' },
    });
    expect(replaced.parameters.gain).toBe(part.suggestedParameters.gain);
    expect(replaced.inputPorts.every((port) => port.sensitivity >= 0)).toBe(true);
    expect(replaced.outputPorts.every((port) => port.strength >= 0)).toBe(true);
  });

  it('rejects incompatible replacements', () => {
    const node = createModelNode('input', 'Input', 0);
    const part = compatibleParts('processing')[0];
    if (!part) throw new Error('Expected a compatible processing part.');
    expect(() => applyPart(node, part, 'Invalid')).toThrow(/incompatible/i);
  });

  it('preserves a literature candidate when replacing the illustrative part', () => {
    const catalogReference: LiteratureCandidateReference = {
      catalogId: 'evidence-backed-components',
      catalogVersion: 'evidence-backed-components@2026-08-02.1',
      entryId: 'sensor.cadr',
      displayNameSnapshot: 'CadR module',
      sourceStatus: 'passed',
    };
    const node = { ...createModelNode('input', 'Input', 0), catalogReference };
    const part = compatibleParts('input')[0];
    if (!part) throw new Error('Expected a compatible input part.');
    expect(applyPart(node, part, 'Replacement').catalogReference).toEqual(catalogReference);
  });
});
