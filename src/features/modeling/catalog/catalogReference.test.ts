import { describe, expect, it } from 'vitest';
import { createTemplate, validateNetworkModel } from '../modelingCore';
import type { TemplateLabels } from '../types';
import type { LiteratureCandidateReference } from './catalogTypes';
import {
  attachCatalogReference,
  detachCatalogReference,
  isLiteratureCandidateReference,
} from './catalogReference';

const labels: TemplateLabels = {
  modelName: 'Reference test',
  description: 'Illustrative model',
  nodes: {
    sensorA: 'A',
    sensorB: 'B',
    sensorC: 'C',
    integration: 'Integration',
    gate: 'Gate',
    memory: 'Memory',
    response: 'Response',
    reporter: 'Reporter',
  },
};

const reference: LiteratureCandidateReference = {
  catalogId: 'evidence-backed-components',
  catalogVersion: 'evidence-backed-components@2026-08-02.1',
  entryId: 'sensor.cadr',
  displayNameSnapshot: 'CadR module',
  sourceStatus: 'passed',
  boundaryNote: 'Source-context card only.',
};

describe('catalog model reference', () => {
  it('attaches and detaches only the sibling reference', () => {
    const model = createTemplate('licorice-quality', labels, '2026-08-02T00:00:00.000Z');
    const before = structuredClone(model);
    const attached = attachCatalogReference(model, model.nodes[0]!.id, reference);

    expect(attached.nodes[0]?.catalogReference).toEqual(reference);
    expect(
      attached.nodes.map((node) => {
        const withoutReference = { ...node };
        delete withoutReference.catalogReference;
        return withoutReference;
      }),
    ).toEqual(before.nodes);
    expect(attached.edges).toEqual(before.edges);
    expect(attached.thresholds).toEqual(before.thresholds);
    expect(attached.recordReference).toEqual(before.recordReference);
    expect(attached.outputNodeId).toBe(before.outputNodeId);
    expect(attached.schemaVersion).toBe(2);
    const parameters = attached.nodes[0]?.parameters;
    expect(typeof parameters?.baseline).toBe('number');
    expect(typeof parameters?.gain).toBe('number');
    expect(typeof parameters?.parameterStatus).toBe('string');
    expect(typeof parameters?.provenance).toBe('string');
    const outputPort = attached.nodes[0]?.outputPorts[0];
    expect(typeof outputPort?.id).toBe('string');
    expect(typeof outputPort?.signalId).toBe('string');
    expect(typeof outputPort?.strength).toBe('number');
    expect(typeof outputPort?.parameterStatus).toBe('string');
    expect(typeof outputPort?.provenance).toBe('string');
    expect(model).toEqual(before);

    const detached = detachCatalogReference(attached, model.nodes[0]!.id);
    expect(detached.nodes[0]).not.toHaveProperty('catalogReference');
    expect(detached.nodes[0]).toEqual(model.nodes[0]);
  });

  it('copies references, rejects malformed values, and preserves parameters', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    const mutable = { ...reference, entryId: 'removed.entry' };
    const beforeParameters = structuredClone(model.nodes[0]!.parameters);
    const attached = attachCatalogReference(model, model.nodes[0]!.id, mutable);
    mutable.displayNameSnapshot = 'mutated outside';

    expect(attached.nodes[0]?.catalogReference?.displayNameSnapshot).toBe('CadR module');
    expect(attached.nodes[0]?.parameters).toEqual(beforeParameters);
    expect(isLiteratureCandidateReference(reference)).toBe(true);
    expect(isLiteratureCandidateReference({ ...reference, entryId: '' })).toBe(false);
    expect(
      isLiteratureCandidateReference({ ...reference, sourceStatus: 'experimentally-validated' }),
    ).toBe(false);
    expect(() =>
      attachCatalogReference(model, model.nodes[0]!.id, {
        ...reference,
        displayNameSnapshot: '',
      }),
    ).toThrow('INVALID_CATALOG_REFERENCE');
    expect(() => detachCatalogReference(model, 'missing-node')).toThrow('MODEL_NODE_NOT_FOUND');
  });

  it('retains strict validation for V2 parameters, ports, and edges', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    expect(validateNetworkModel(model)).toBe(true);

    const invalidParameter = structuredClone(model);
    invalidParameter.nodes[0]!.parameters = {
      ...invalidParameter.nodes[0]!.parameters,
      baseline: Number.NaN,
    };
    expect(validateNetworkModel(invalidParameter)).toBe(false);

    const invalidInputPort = structuredClone(model);
    invalidInputPort.nodes.find((node) => node.id === 'gate')!.inputPorts[0]!.sensitivity = -1;
    expect(validateNetworkModel(invalidInputPort)).toBe(false);

    const invalidOutputPort = structuredClone(model);
    invalidOutputPort.nodes.find((node) => node.id === 'gate')!.outputPorts[0]!.strength = -1;
    expect(validateNetworkModel(invalidOutputPort)).toBe(false);

    const invalidEdge = structuredClone(model);
    const edgeWithLegacyWeight = {
      ...invalidEdge.edges[0]!,
      weight: 0.5,
    };
    invalidEdge.edges[0] = edgeWithLegacyWeight;
    expect(validateNetworkModel(invalidEdge)).toBe(false);
  });
});
