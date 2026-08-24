import { beforeEach, describe, expect, it } from 'vitest';
import { attachCatalogReference } from './catalog/catalogReference';
import type { LiteratureCandidateReference } from './catalog/catalogTypes';
import type {
  NetworkValidationModelingReference,
  ReverseTargetModelingReference,
} from './detectionModeling';
import { createTemplate, simulateNetwork } from './modelingCore';
import {
  getModelingLoadDiagnostics,
  loadModelingProject,
  loadModelingRuns,
  saveModelingProject,
  saveModelingRun,
} from './modelingRepository';
import type { DetectionRecordReference, ModelingRun, TemplateLabels } from './types';

const projectKey = 'fluorescence-desktop.modeling-project.v1';
const runsKey = 'fluorescence-desktop.modeling-runs.v1';
const labels: TemplateLabels = {
  modelName: 'Repository test',
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
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}
const reference: LiteratureCandidateReference = {
  catalogId: 'evidence-backed-components',
  catalogVersion: 'evidence-backed-components@2026-08-02.1',
  entryId: 'sensor.cadr',
  displayNameSnapshot: 'CadR module',
  sourceStatus: 'passed',
  boundaryNote: 'Reference only.',
};

function reverseTargetReference(): ReverseTargetModelingReference {
  return {
    mode: 'reverse-target',
    recordId: 'record-trace',
    sampleId: 'sample-trace',
    recordCreatedAt: '2026-08-02T00:00:00.000Z',
    origin: 'json-import',
    resultStatus: 'OK',
    metric: { kind: 'quality-score' },
    measuredValue: 80,
    measuredUnit: 'score',
    normalizedValue: 0.8,
    mappingId: 'quality-map',
    mappingVersion: '1.0',
    mappingStatus: 'team-calibrated',
    mappingSourceReference: 'development-fixture',
    isDemo: false,
  };
}

function validationReference(networkId: string): NetworkValidationModelingReference {
  return {
    ...reverseTargetReference(),
    mode: 'network-validation',
    networkId,
  };
}

function legacyProject(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'legacy-project',
    templateId: 'signal-gate',
    name: 'Legacy project',
    description: 'Legacy fixture',
    nodes: [
      {
        id: 'sensor-a',
        name: 'Sensor A',
        kind: 'sensor',
        x: 0,
        y: 0,
        parameters: { input: 0.6, gain: 1 },
      },
      {
        id: 'gate',
        name: 'Gate',
        kind: 'signal',
        x: 1,
        y: 0,
        parameters: { input: 0, gain: 1 },
      },
      {
        id: 'reporter',
        name: 'Reporter',
        kind: 'reporter',
        x: 2,
        y: 0,
        parameters: { input: 0, gain: 1 },
      },
    ],
    edges: [
      { id: 'legacy-a', source: 'sensor-a', target: 'gate', weight: 0.5, enabled: true },
      { id: 'legacy-g', source: 'gate', target: 'reporter', weight: 1, enabled: true },
    ],
    outputNodeId: 'reporter',
    thresholds: [0.35, 0.68],
    recordReference: { source: 'legacy-record', recordId: 'record-x' },
    updatedAt: '2026-08-01T00:00:00.000Z',
    isDemo: true,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('modeling repository catalog compatibility', () => {
  it('migrates a schemaVersion 1 project and saves it back under the same key', () => {
    const legacy = legacyProject();
    localStorage.setItem(projectKey, JSON.stringify(legacy));

    const loaded = loadModelingProject();

    expect(loaded?.schemaVersion).toBe(2);
    expect(loaded?.nodes.map((node) => node.kind)).toEqual(['input', 'processing', 'output']);
    const persistedProject = asRecord(JSON.parse(localStorage.getItem(projectKey) ?? '{}'));
    expect(persistedProject.schemaVersion).toBe(2);
  });

  it('drops only a malformed optional reference and exposes a diagnostic', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    const malformed = {
      ...model,
      nodes: model.nodes.map((node, index) =>
        index === 0 ? { ...node, catalogReference: { ...reference, entryId: '' } } : node,
      ),
    };
    const raw = JSON.stringify(malformed);
    localStorage.setItem(projectKey, raw);

    const loaded = loadModelingProject();
    expect(loaded?.nodes).toEqual(model.nodes);
    expect(loaded?.edges).toEqual(model.edges);
    expect(localStorage.getItem(projectKey)).toBe(raw);
    expect(getModelingLoadDiagnostics().projectDroppedNodeIds).toEqual([model.nodes[0]!.id]);
  });

  it('preserves unknown well-shaped historical references byte-for-byte', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    const historical: LiteratureCandidateReference = {
      ...reference,
      catalogId: 'retired-catalog',
      catalogVersion: 'retired-catalog@1999.4',
      entryId: 'removed.entry',
      displayNameSnapshot: 'Historical display name',
    };
    const stored = {
      ...model,
      nodes: model.nodes.map((node, index) =>
        index === 0 ? { ...node, catalogReference: historical } : node,
      ),
    };
    localStorage.setItem(projectKey, JSON.stringify(stored));
    expect(loadModelingProject()?.nodes[0]?.catalogReference).toEqual(historical);
  });

  it('round-trips references through project and run snapshots', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    const attached = attachCatalogReference(model, model.nodes[0]!.id, reference);
    const detectionReference: DetectionRecordReference = {
      mode: 'reference-only',
      recordId: 'record-round-trip',
      sampleId: 'sample-round-trip',
      createdAt: '2026-08-02T00:00:00.000Z',
      linkedAt: '2026-08-02T00:00:30.000Z',
      origin: 'json-import',
      isDemo: true,
      resultStatus: 'RAW_ONLY',
    };
    const linked = {
      ...attached,
      recordReference: detectionReference,
      legacyRecordReference: detectionReference,
    };
    saveModelingProject(attached);
    saveModelingRun(linked, simulateNetwork(linked, { now: '2026-08-02T00:01:00.000Z' }));
    expect(loadModelingProject()?.nodes[0]?.catalogReference).toEqual(reference);
    expect(loadModelingRuns()[0]?.modelSnapshot?.nodes[0]?.catalogReference).toMatchObject({
      catalogVersion: reference.catalogVersion,
      displayNameSnapshot: reference.displayNameSnapshot,
    });
    expect(loadModelingRuns()[0]?.recordReference).toEqual(detectionReference);
    expect(loadModelingRuns()[0]?.legacyRecordReference).toEqual(detectionReference);
  });

  it('round-trips cloned reverse-target and known-network validation references', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    const result = simulateNetwork(model, { now: '2026-08-02T00:01:00.000Z' });
    const reverseTarget = reverseTargetReference();
    const validation = validationReference(model.id);

    const saved = saveModelingRun(model, result, {
      reverseTargetReference: reverseTarget,
      validationReference: validation,
    })[0];
    expect(saved?.reverseTargetReference).toEqual(reverseTarget);
    expect(saved?.reverseTargetReference).not.toBe(reverseTarget);
    expect(saved?.validationReference).toEqual(validation);
    expect(saved?.validationReference).not.toBe(validation);
    expect(saved?.validationReference?.networkId).toBe(saved?.modelSnapshot?.id);

    const loaded = loadModelingRuns()[0];
    expect(loaded?.reverseTargetReference).toEqual(reverseTarget);
    expect(loaded?.validationReference).toEqual(validation);
    expect(loaded?.validationReference?.networkId).toBe(loaded?.modelSnapshot?.id);
  });

  it('drops a run whose trace reference has an invalid mode, network, or mapping version', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    const result = simulateNetwork(model, { now: '2026-08-02T00:01:00.000Z' });
    const valid = saveModelingRun(model, result, {
      reverseTargetReference: reverseTargetReference(),
      validationReference: validationReference(model.id),
    })[0]!;
    const invalidRuns = [
      {
        ...structuredClone(valid),
        reverseTargetReference: validationReference(model.id),
      },
      {
        ...structuredClone(valid),
        validationReference: reverseTargetReference(),
      },
      {
        ...structuredClone(valid),
        validationReference: validationReference('another-network'),
      },
      {
        ...structuredClone(valid),
        reverseTargetReference: { ...reverseTargetReference(), mappingVersion: '' },
      },
    ];

    for (const invalid of invalidRuns) {
      localStorage.setItem(runsKey, JSON.stringify([invalid]));
      expect(loadModelingRuns()).toEqual([]);
    }
  });

  it('rejects a validation context that targets a different network before saving', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    const result = simulateNetwork(model, { now: '2026-08-02T00:01:00.000Z' });
    expect(() =>
      saveModelingRun(model, result, {
        validationReference: validationReference('another-network'),
      }),
    ).toThrow('MODELING_RUN_VALIDATION_REFERENCE_INVALID');
    expect(loadModelingRuns()).toEqual([]);
  });

  it('keeps a run when only its snapshot reference is malformed', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    const result = simulateNetwork(model, { now: '2026-08-02T00:01:00.000Z' });
    const run: ModelingRun = {
      id: 'run-with-bad-reference',
      createdAt: result.completedAt,
      modelName: model.name,
      templateId: model.templateId,
      nodeCount: model.nodes.length,
      edgeCount: model.edges.length,
      recordReference: model.recordReference,
      result,
      modelSnapshot: {
        ...model,
        nodes: model.nodes.map((node, index) =>
          index === 0
            ? ({ ...node, catalogReference: { catalogId: 'broken' } } as typeof node)
            : node,
        ),
      },
    };
    const raw = JSON.stringify([run]);
    localStorage.setItem(runsKey, raw);
    expect(loadModelingRuns()).toHaveLength(1);
    expect(loadModelingRuns()[0]?.modelSnapshot?.nodes[0]).not.toHaveProperty('catalogReference');
    expect(localStorage.getItem(runsKey)).toBe(raw);
    expect(getModelingLoadDiagnostics().runDrops).toEqual([
      { runId: run.id, nodeIds: [model.nodes[0]!.id] },
    ]);
  });

  it('drops old runs that do not carry a model snapshot', () => {
    localStorage.setItem(
      runsKey,
      JSON.stringify([
        {
          id: 'without-snapshot',
          createdAt: '2026-08-02T00:00:00.000Z',
          modelName: 'Old run',
          templateId: 'signal-gate',
          nodeCount: 1,
          edgeCount: 0,
          result: { isDemo: true },
        },
      ]),
    );
    expect(loadModelingRuns()).toEqual([]);
  });

  it('migrates a legacy run snapshot and persists the migrated run list', () => {
    const legacy = legacyProject();
    localStorage.setItem(
      runsKey,
      JSON.stringify([
        {
          id: 'legacy-run',
          createdAt: '2026-08-02T00:00:00.000Z',
          modelName: 'Legacy project',
          templateId: 'signal-gate',
          nodeCount: 3,
          edgeCount: 2,
          result: { isDemo: true, frames: [] },
          modelSnapshot: legacy,
        },
      ]),
    );
    const runs = loadModelingRuns();
    expect(runs[0]?.modelSnapshot?.schemaVersion).toBe(2);
    const persistedRuns: unknown = JSON.parse(localStorage.getItem(runsKey) ?? '[]');
    expect(Array.isArray(persistedRuns)).toBe(true);
    const persistedRun = asRecord((persistedRuns as unknown[])[0]);
    expect(asRecord(persistedRun.modelSnapshot).schemaVersion).toBe(2);
  });

  it('does not mask invalid non-catalog project fields', () => {
    const model = createTemplate('signal-gate', labels, '2026-08-02T00:00:00.000Z');
    localStorage.setItem(
      projectKey,
      JSON.stringify({ ...model, recordReference: { mode: 'reference-only' } }),
    );
    expect(loadModelingProject()).toBeNull();
  });
});
