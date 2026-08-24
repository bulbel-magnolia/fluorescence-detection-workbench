import { describe, expect, it } from 'vitest';
import { createTemplate, simulateNetwork, validateNetworkModel } from '../modelingCore';
import type { TemplateLabels } from '../types';
import { loadEvidenceCatalog } from './catalogLoader';
import { assessCatalogApplication, getCatalogNetworkRoles } from './catalogPresentation';
import type { CatalogApplicationAssessment } from './catalogTypes';
import { applyCatalogEntryToNetwork } from './catalogModelApplication';

const labels: TemplateLabels = {
  modelName: 'Fixture network',
  description: 'Development fixture',
  nodes: {
    sensorA: 'Input A',
    sensorB: 'Input B',
    sensorC: 'Input C',
    integration: 'Integration',
    gate: 'Gate',
    memory: 'Memory',
    response: 'Response',
    reporter: 'Output',
  },
};

describe('catalog model application', () => {
  it('adds a signal-specific calibration candidate without creating an edge or runnable weight', () => {
    const loaded = loadEvidenceCatalog();
    if (loaded.status !== 'ready') throw new Error(loaded.message);
    const entry = loaded.index.entries.find((candidate) => {
      const roles = getCatalogNetworkRoles(candidate);
      return (
        candidate.modeling.compatibility === 'parameterizable-after-calibration' &&
        roles.some((role) => {
          const inputs = Array.isArray(candidate.signals.inputs) ? candidate.signals.inputs : [];
          const outputs = Array.isArray(candidate.signals.outputs) ? candidate.signals.outputs : [];
          return role === 'input'
            ? outputs.length + inputs.length > 0
            : role === 'output'
              ? inputs.length + outputs.length > 0
              : inputs.length > 0 && outputs.length > 0;
        })
      );
    });
    if (!entry) throw new Error('Catalog fixture lacks an applicable calibration candidate');
    const role = getCatalogNetworkRoles(entry).find((candidateRole) => {
      const inputs = Array.isArray(entry.signals.inputs) ? entry.signals.inputs : [];
      const outputs = Array.isArray(entry.signals.outputs) ? entry.signals.outputs : [];
      return candidateRole === 'input'
        ? outputs.length + inputs.length > 0
        : candidateRole === 'output'
          ? inputs.length + outputs.length > 0
          : inputs.length > 0 && outputs.length > 0;
    });
    if (!role) throw new Error('Catalog fixture lacks a role with explicit signals');
    const assessment = assessCatalogApplication(entry, role);
    const before = createTemplate('signal-gate', labels, '2026-08-03T00:00:00.000Z');
    const applied = applyCatalogEntryToNetwork(before, entry, assessment, {
      nodeId: 'catalog-candidate',
      displayName: entry.name.en,
      x: 420,
      y: 380,
      now: '2026-08-03T00:00:01.000Z',
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.model.edges).toEqual(before.edges);
    expect(applied.node.parameters).toMatchObject({
      parameterStatus: 'calibration-required',
      provenance: 'catalog-reference',
      gain: 0,
    });
    expect([...applied.node.inputPorts, ...applied.node.outputPorts]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parameterStatus: 'calibration-required' }),
      ]),
    );
    expect(applied.node.catalogReference?.entryId).toBe(entry.id);
    expect(validateNetworkModel(applied.model)).toBe(true);
    expect(() => simulateNetwork(applied.model)).toThrow('MODEL_PARAMETERS_NOT_RUNNABLE');
  });

  it('does not invent missing quantitative parameters', () => {
    const loaded = loadEvidenceCatalog();
    if (loaded.status !== 'ready') throw new Error(loaded.message);
    const entry = loaded.index.entries[0];
    if (!entry) throw new Error('Catalog is empty');
    const fakeAssessment: CatalogApplicationAssessment = {
      targetNetworkRole: 'input',
      applicationMode: 'quantitative',
      allowed: true,
      reason: 'ready',
      parameterStatus: 'quantitative-available',
    };
    const result = applyCatalogEntryToNetwork(
      createTemplate('signal-gate', labels),
      entry,
      fakeAssessment,
      { nodeId: 'forbidden', displayName: 'Forbidden', x: 0, y: 0 },
    );

    expect(result).toEqual({ ok: false, issue: 'quantitative-parameters-missing' });
  });
});
