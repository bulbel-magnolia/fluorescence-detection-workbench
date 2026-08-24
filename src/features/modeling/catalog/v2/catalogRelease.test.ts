import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import releaseJson from './data/ahl-hsl-component-database-v1.1.json';
import { adaptCatalogReleaseToV2 } from './catalogReleaseAdapter';
import { buildCatalogReleaseIndex, getCatalogReleaseIndex } from './catalogReleaseIndex';
import { loadAhlHslCatalogRelease } from './catalogReleaseLoader';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from './catalogRuntimeDemoWhitelist';
import type { CatalogV2CompatibilityRelation, CatalogV2ReceiverResponse } from './catalogTypes';
import {
  validateCatalogRelease,
  type AhlHslComponentCatalogRelease,
} from './catalogReleaseValidator';
import { validateCatalogV2 } from './catalogValidator';

const release = releaseJson as unknown as AhlHslComponentCatalogRelease;
const dataPath = join(
  process.cwd(),
  'src/features/modeling/catalog/v2/data/ahl-hsl-component-database-v1.1.json',
);

describe('AHL/HSL V1.1 release contract', () => {
  it('preserves the byte-for-byte release payload and frozen array counts', () => {
    const bytes = readFileSync(dataPath);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '7f31755a24c8a3c066ecbba70c21f361ffe3a05665fbb681903310a93a404596',
    );
    expect(release.signals).toHaveLength(29);
    expect(release.components).toHaveLength(42);
    expect(release.parameter_contexts).toHaveLength(7);
    expect(release.receiver_responses).toHaveLength(52);
    expect(release.sender_outputs).toHaveLength(0);
    expect(release.effective_pairs).toHaveLength(13);
    expect(release.compatibility_relations).toHaveLength(39);
    expect(release.sources).toHaveLength(22);
  });

  it('accepts the release while reporting stale self-assertions as warnings', () => {
    const result = validateCatalogRelease(release);
    expect(result.ok).toBe(true);
    expect(result.fatalErrors).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.code === 'stale-self-assertion')).toBe(true);
    expect(result.warnings.some((warning) => warning.path.includes('validation.assertions'))).toBe(
      true,
    );
  });

  it('keeps the exact 20-response runtime-demo whitelist as the execution boundary', () => {
    const result = validateCatalogRelease(release);
    const runtimeResponses = release.receiver_responses.filter(
      (response) => response.software_status === 'runtime_demo',
    );
    expect(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST).toHaveLength(20);
    expect(runtimeResponses).toHaveLength(20);
    expect(new Set(runtimeResponses.map((response) => response.id))).toEqual(
      new Set(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.map((entry) => entry.id)),
    );
    for (const entry of AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST) {
      const response = release.receiver_responses.find((item) => item.id === entry.id);
      expect(response).toBeDefined();
      expect(response?.demo_implementation).toBe(entry.demoImplementation);
      expect(response?.model_type).toBe(entry.modelType);
      expect(response?.numerical_execution_allowed).toBe(true);
      expect(response?.normalized_demo_only).toBe(true);
      expect(response?.fixed_weight_candidate).toBe(false);
    }
    expect(result.ok).toBe(true);
  });

  it('rejects a non-runtime response falsely marked runtime_demo and excludes it from execution', () => {
    const invalid = structuredClone(release);
    const forged = invalid.receiver_responses.find(
      (response) => response.software_status !== 'runtime_demo',
    )!;
    forged.software_status = 'runtime_demo';
    forged.demo_implementation = 'four_parameter_logistic_then_within_context_clip_0_1';
    forged.model_type = 'four_parameter_logistic';
    forged.numerical_execution_allowed = true;
    forged.normalized_demo_only = true;
    forged.fixed_weight_candidate = false;

    const result = validateCatalogRelease(invalid);
    expect(result.ok).toBe(false);
    expect(result.fatalErrors.map((error) => error.code)).toContain('runtime-demo-whitelist-extra');

    const adapted = adaptCatalogReleaseToV2(invalid);
    const adaptedForged = adapted.receiverResponses.find((response) => response.id === forged.id);
    expect(adaptedForged?.admission.status).toBe('runtime-demo');
    expect(adaptedForged?.admission.simulationReady).toBe(false);
    const index = buildCatalogReleaseIndex(adapted);
    expect(
      index
        .findRuntimeResponses({
          componentId: forged.receiver_component_id,
          signalId: forged.input_signal_id,
          contextId: forged.parameter_context_id,
        })
        .some((response) => response.id === forged.id),
    ).toBe(false);
  });

  it('rejects a whitelisted response when its implementation or model is replaced', () => {
    const wrongImplementation = structuredClone(release);
    const implementationResponse = wrongImplementation.receiver_responses.find(
      (response) => response.id === AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]?.id,
    )!;
    implementationResponse.demo_implementation = 'wrong_runtime_demo_implementation';
    const implementationResult = validateCatalogRelease(wrongImplementation);
    expect(implementationResult.ok).toBe(false);
    expect(implementationResult.fatalErrors.map((error) => error.code)).toContain(
      'runtime-demo-whitelist-implementation',
    );

    const wrongModel = structuredClone(release);
    const modelResponse = wrongModel.receiver_responses.find(
      (response) => response.id === AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]?.id,
    )!;
    modelResponse.model_type = 'wrong_runtime_demo_model';
    const modelResult = validateCatalogRelease(wrongModel);
    expect(modelResult.ok).toBe(false);
    expect(modelResult.fatalErrors.map((error) => error.code)).toContain(
      'runtime-demo-whitelist-model',
    );
  });

  it('rejects malformed adapter-consumed shapes before adaptation', () => {
    const malformedCases: Array<[string, (value: AhlHslComponentCatalogRelease) => void]> = [
      [
        'release_metadata',
        (value) => {
          (value as unknown as Record<string, unknown>).release_metadata = null;
        },
      ],
      [
        'fit_constraints',
        (value) => {
          (value.receiver_responses[0] as unknown as Record<string, unknown>).fit_constraints =
            null;
        },
      ],
      [
        'evidence_gap',
        (value) => {
          (value.components[0] as unknown as Record<string, unknown>).evidence_gap = null;
        },
      ],
      [
        'signal.source_ids',
        (value) => {
          (value.signals[0] as unknown as Record<string, unknown>).source_ids = null;
        },
      ],
      [
        'source.mapped_rejected_ids',
        (value) => {
          (value.sources[0] as unknown as Record<string, unknown>).mapped_rejected_ids = null;
        },
      ],
    ];

    for (const [label, mutate] of malformedCases) {
      const invalid = structuredClone(release);
      mutate(invalid);
      const result = validateCatalogRelease(invalid);
      expect(result.ok, label).toBe(false);

      let thrown: unknown;
      try {
        loadAhlHslCatalogRelease(invalid);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, label).toBeInstanceOf(Error);
      expect(thrown, label).not.toBeInstanceOf(TypeError);
      expect((thrown as Error).message, label).toMatch(/^raw release validation failed:/u);
    }
  });

  it('enforces runtime-demo execution rules and non-decomposable observations', () => {
    const invalid = structuredClone(release);
    invalid.receiver_responses[0]!.numerical_execution_allowed = false;
    invalid.effective_pairs[0]!.decomposition_prohibited = false;
    invalid.compatibility_relations[0]!.numeric_use_allowed = true;
    const result = validateCatalogRelease(invalid);
    expect(result.ok).toBe(false);
    expect(result.fatalErrors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        'runtime-demo-execution',
        'pair-decomposition',
        'compatibility-numeric',
      ]),
    );
  });

  it('enforces frozen V1.1 dimensions even when self-reported counts are changed', () => {
    const invalid = structuredClone(release);
    invalid.signals.pop();
    invalid.statistics.after_revision.array_counts.signals = 28;
    const result = validateCatalogRelease(invalid);
    expect(result.ok).toBe(false);
    expect(result.fatalErrors.some((error) => error.code === 'release-count')).toBe(true);
  });

  it('enforces frozen after-revision status dimensions', () => {
    const invalid = structuredClone(release);
    invalid.components[0]!.software_status = 'reference_only';
    const componentStatus = invalid.statistics.after_revision.component_status as Record<
      string,
      number
    >;
    componentStatus.runtime_demo = 6;
    componentStatus.reference_only = 7;
    const result = validateCatalogRelease(invalid);
    expect(result.ok).toBe(false);
    expect(result.fatalErrors.some((error) => error.code === 'release-status-count')).toBe(true);
  });

  it('adapts status, nulls, provenance, and observation boundaries without inventing outputs', () => {
    const adapted = adaptCatalogReleaseToV2(release);
    const canonicalValidation = validateCatalogV2(adapted);
    expect(
      canonicalValidation.ok,
      canonicalValidation.ok ? undefined : JSON.stringify(canonicalValidation.errors),
    ).toBe(true);
    expect(
      adapted.components.find((component) => component.id.startsWith('recv.kylilis'))?.admission
        .status,
    ).toBe('runtime-demo');
    const shong = adapted.receiverResponses.find(
      (response) => response.id === 'resp.shong2013.esar-wt-pesar.3oc6',
    );
    expect(shong?.sourceResponse?.basal).toBeNull();
    expect(shong?.sourceResponse?.modelType).toBe('hill_equation_n_fixed_1');
    expect(shong?.sourceResponse?.workingRange).toEqual({ min: 0, max: 0.00001 });
    expect(shong?.sourceProvenance?.length).toBeGreaterThan(0);
    expect(adapted.senderOutputs).toHaveLength(0);
    expect(
      adapted.components
        .filter((component) => component.componentType === 'sender')
        .every((component) => component.outputSignalIds.length === 0),
    ).toBe(true);
    expect(
      adapted.effectivePairs.every((pair) => pair.observed?.decompositionProhibited === true),
    ).toBe(true);
    expect(
      adapted.compatibilityRelations.some((relation) => relation.senderComponentId === null),
    ).toBe(true);
  });

  it('maps node semantics and index lookups by exact signal/context identity', () => {
    const adapted = adaptCatalogReleaseToV2(release);
    const input = adapted.components.find(
      (component) => component.id === 'recv.kylilis2018.rhl.v1',
    );
    expect(input?.nodeType).toBe('processing');
    const sender = adapted.components.find((component) => component.id === 'send.daer2018.rpai.v1');
    expect(sender?.nodeType).toBe('processing');
    const index = getCatalogReleaseIndex();
    expect(
      index.findResponses({
        componentId: 'recv.kylilis2018.rhl.v1',
        signalId: 'ahl.c4.dl',
        contextId: 'ctx.kylilis2018.ecoli-top10.1',
      }),
    ).toHaveLength(1);
    expect(
      index.findRuntimeResponses({
        componentId: 'recv.kylilis2018.rhl.v1',
        signalId: 'ahl.c4.dl',
        contextId: 'ctx.scott2016.ecoli.1',
      }),
    ).toHaveLength(0);
    expect(
      index.findCompatibilityRelations({
        componentId: 'recv.kylilis2018.cin.v1',
        signalId: 'ahl.3oc6.l',
        contextId: 'ctx.kylilis2018.ecoli-top10.1',
      }),
    ).toHaveLength(1);
  });

  it('freezes index query arrays and prevents result mutation', () => {
    const index = getCatalogReleaseIndex();
    const responseLookup = {
      componentId: 'recv.kylilis2018.rhl.v1',
      signalId: 'ahl.c4.dl',
      contextId: 'ctx.kylilis2018.ecoli-top10.1',
    };
    const responses = index.findResponses(responseLookup);
    expect(Object.isFrozen(responses)).toBe(true);
    expect(() => (responses as CatalogV2ReceiverResponse[]).push(responses[0]!)).toThrow();
    expect(() => (responses as CatalogV2ReceiverResponse[]).pop()).toThrow();
    expect(index.findResponses(responseLookup)).toHaveLength(1);

    const runtimeResponse = index.catalog.receiverResponses.find(
      (response) =>
        response.admission.status === 'runtime-demo' && response.admission.simulationReady === true,
    )!;
    expect(runtimeResponse).toBeDefined();
    const runtimeLookup = {
      componentId: runtimeResponse.receiverComponentId,
      signalId: runtimeResponse.inputSignalId,
      contextId: runtimeResponse.parameterContextId,
    };
    const runtimeResponses = index.findRuntimeResponses(runtimeLookup);
    expect(Object.isFrozen(runtimeResponses)).toBe(true);
    expect(() =>
      (runtimeResponses as CatalogV2ReceiverResponse[]).push(runtimeResponses[0]!),
    ).toThrow();
    expect(index.findRuntimeResponses(runtimeLookup)).toHaveLength(runtimeResponses.length);

    const compatibilityLookup = {
      componentId: 'recv.kylilis2018.cin.v1',
      signalId: 'ahl.3oc6.l',
      contextId: 'ctx.kylilis2018.ecoli-top10.1',
    };
    const compatibilityRelations = index.findCompatibilityRelations(compatibilityLookup);
    expect(Object.isFrozen(compatibilityRelations)).toBe(true);
    expect(() =>
      (compatibilityRelations as CatalogV2CompatibilityRelation[]).push(compatibilityRelations[0]!),
    ).toThrow();
    expect(index.findCompatibilityRelations(compatibilityLookup)).toHaveLength(1);

    const emptyLookup = {
      componentId: 'missing-component',
      signalId: 'missing-signal',
      contextId: 'missing-context',
    };
    const emptyResponses = index.findResponses(emptyLookup);
    const emptyRuntimeResponses = index.findRuntimeResponses(emptyLookup);
    const emptyCompatibilityRelations = index.findCompatibilityRelations(emptyLookup);
    expect(Object.isFrozen(emptyResponses)).toBe(true);
    expect(Object.isFrozen(emptyRuntimeResponses)).toBe(true);
    expect(Object.isFrozen(emptyCompatibilityRelations)).toBe(true);
    expect(() =>
      (emptyResponses as CatalogV2ReceiverResponse[]).push(
        undefined as unknown as CatalogV2ReceiverResponse,
      ),
    ).toThrow();
    expect(emptyResponses).toHaveLength(0);
    expect(emptyRuntimeResponses).toHaveLength(0);
    expect(emptyCompatibilityRelations).toHaveLength(0);
  });

  it('loader returns frozen canonical data and warnings', () => {
    const loaded = loadAhlHslCatalogRelease();
    expect(loaded.catalog.releaseManifest.releaseVersion).toBe('1.1');
    expect(Object.isFrozen(loaded.catalog)).toBe(true);
    expect(loaded.warnings.some((warning) => warning.code === 'stale-self-assertion')).toBe(true);
  });
});
