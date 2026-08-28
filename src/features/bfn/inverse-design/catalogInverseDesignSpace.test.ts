import { describe, expect, it, vi } from 'vitest';
import {
  buildBfnCatalogRuntimeCandidate,
  isTrustedBfnCatalogRuntimeCandidate,
} from '../catalog/catalogBfnAdapter';
import type { BfnCatalogRuntimeCandidate } from '../catalog/catalogBfnTypes';
import {
  buildReceiverResponseBinding,
  isTrustedReceiverResponseBinding,
} from '../../modeling/receiverResponseEvaluator';
import { loadAhlHslCatalogRelease } from '../../modeling/catalog/v2/catalogReleaseLoader';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import {
  buildCatalogInverseSearchSpace,
  computeCommonTrustedRange,
  countCandidatesCoveringTargetRange,
  defaultCatalogInverseRuntimeAdapter,
  listCatalogInverseContextOptions,
  listCatalogInverseSignalProfiles,
  listSearchableCatalogSignals,
  type CatalogInverseRuntimeAdapter,
} from './catalogInverseDesignSpace';

const L_3OC6_SIGNAL_ID = 'ahl.3oc6.l';
const UNSPECIFIED_3OC6_SIGNAL_ID = 'ahl.3oc6.stereo-unspecified';

function byCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

describe('catalog inverse design search space', () => {
  it('admits exactly the current whitelist entries that rebuild through both trusted paths', () => {
    const loaded = loadAhlHslCatalogRelease();
    const presentationById = new Map(
      defaultCatalogInverseRuntimeAdapter
        .buildPresentation(loaded)
        .responseVariants.map((response) => [response.id, response]),
    );
    const space = buildCatalogInverseSearchSpace();
    const expectedIds = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.map((entry) => entry.id);

    expect(space.candidates.map((candidate) => candidate.responseId)).toEqual(expectedIds);
    expect(space.candidates).toHaveLength(expectedIds.length);
    expect(space.unavailableResponseIds).toEqual([]);
    expect(space.release).toEqual({
      catalogId: loaded.catalog.releaseManifest.catalogId,
      releaseId: loaded.catalog.releaseManifest.releaseId,
      releaseVersion: loaded.catalog.releaseManifest.releaseVersion,
    });

    for (const candidate of space.candidates) {
      const runtimeCandidate = buildBfnCatalogRuntimeCandidate(candidate.responseId);
      const binding = buildReceiverResponseBinding(loaded.catalog, candidate.responseId);
      const response = presentationById.get(candidate.responseId);
      expect(response).toBeDefined();
      expect(isTrustedBfnCatalogRuntimeCandidate(runtimeCandidate)).toBe(true);
      expect(isTrustedReceiverResponseBinding(candidate.binding)).toBe(true);
      expect(candidate.binding).toEqual(binding);
      expect(candidate).toMatchObject({
        responseId: runtimeCandidate.responseId,
        componentId: runtimeCandidate.catalogReference.componentId,
        inputSignalId: runtimeCandidate.catalogReference.inputSignalId,
        parameterContextId: runtimeCandidate.catalogReference.parameterContextId,
        sourceIds: runtimeCandidate.catalogReference.sourceIds,
        biologicalDirection: runtimeCandidate.catalogReference.biologicalDirection,
        context: {
          hostSpecies: response?.parameterContext.hostSpecies,
          hostStrain: response?.parameterContext.hostStrain,
        },
        model: {
          ec50M: runtimeCandidate.catalogReference.sourceParameters.ec50,
          hillCoefficient: runtimeCandidate.catalogReference.sourceParameters.hillCoefficient,
          workingRangeM: {
            minimum: runtimeCandidate.catalogReference.sourceParameters.workingRange.min,
            maximum: runtimeCandidate.catalogReference.sourceParameters.workingRange.max,
          },
        },
      });
      expect(candidate).not.toHaveProperty('score');
      expect(candidate).not.toHaveProperty('burden');
      expect(candidate).not.toHaveProperty('noise');
      expect(candidate).not.toHaveProperty('calibrationMap');
    }
  });

  it('returns a fresh immutable search-space snapshot on every build', () => {
    const loadRelease = vi.fn(() => defaultCatalogInverseRuntimeAdapter.loadRelease());
    const adapter: CatalogInverseRuntimeAdapter = {
      ...defaultCatalogInverseRuntimeAdapter,
      loadRelease,
    };

    const first = buildCatalogInverseSearchSpace(adapter);
    const second = buildCatalogInverseSearchSpace(adapter);

    expect(loadRelease).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
    expect(first.candidates).not.toBe(second.candidates);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.candidates)).toBe(true);
    expect(first.candidates.every(Object.isFrozen)).toBe(true);
    expect(first.candidates[0]?.binding).not.toBe(second.candidates[0]?.binding);
    expect(Object.isFrozen(first.candidates[0]?.binding)).toBe(true);
    expect(Object.isFrozen(first.candidates[0]?.binding.sourceIds)).toBe(true);
    expect(Object.isFrozen(first.candidates[0]?.binding.workingRange)).toBe(true);
    expect(Object.isFrozen(first.candidates[0]?.binding.originalParameters)).toBe(true);
  });

  it('lists only exact signals with at least one admitted runtime response', () => {
    const loaded = loadAhlHslCatalogRelease();
    const space = buildCatalogInverseSearchSpace();
    const signals = listSearchableCatalogSignals(space);
    const l3oc6 = signals.find((signal) => signal.signalId === L_3OC6_SIGNAL_ID);

    expect(loaded.release.signals.some((signal) => signal.id === UNSPECIFIED_3OC6_SIGNAL_ID)).toBe(
      true,
    );
    expect(l3oc6?.responseCount).toBe(
      space.candidates.filter((candidate) => candidate.inputSignalId === L_3OC6_SIGNAL_ID).length,
    );
    expect(l3oc6?.responseCount).toBeGreaterThan(0);
    expect(signals.some((signal) => signal.signalId === UNSPECIFIED_3OC6_SIGNAL_ID)).toBe(false);
    expect(signals).toEqual(
      [...signals].sort((left, right) => byCodePoint(left.signalId, right.signalId)),
    );
  });

  it('computes the closed intersection of trusted working ranges without selecting it as a target', () => {
    const space = buildCatalogInverseSearchSpace();
    const candidates = space.candidates.filter(
      (candidate) => candidate.inputSignalId === L_3OC6_SIGNAL_ID,
    );
    const expected = {
      minimum: Math.max(...candidates.map((candidate) => candidate.model.workingRangeM.minimum)),
      maximum: Math.min(...candidates.map((candidate) => candidate.model.workingRangeM.maximum)),
    };

    expect(computeCommonTrustedRange(space, L_3OC6_SIGNAL_ID)).toEqual(expected);
    expect(computeCommonTrustedRange(space, UNSPECIFIED_3OC6_SIGNAL_ID)).toBeNull();
    expect(space).not.toHaveProperty('target');
  });

  it('reports null when trusted ranges for one exact signal have no common intersection', () => {
    const space = buildCatalogInverseSearchSpace();
    const candidates = space.candidates.filter(
      (candidate) => candidate.inputSignalId === L_3OC6_SIGNAL_ID,
    );
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const first = candidates[0]!;
    const second = candidates[1]!;
    const disjoint = Object.freeze({
      ...space,
      candidates: Object.freeze([
        Object.freeze({
          ...first,
          model: Object.freeze({
            ...first.model,
            workingRangeM: Object.freeze({ minimum: 1e-12, maximum: 1e-10 }),
          }),
        }),
        Object.freeze({
          ...second,
          model: Object.freeze({
            ...second.model,
            workingRangeM: Object.freeze({ minimum: 1e-8, maximum: 1e-6 }),
          }),
        }),
      ]),
    });

    expect(computeCommonTrustedRange(disjoint, L_3OC6_SIGNAL_ID)).toBeNull();
  });

  it('counts closed range coverage using only exact signal and working-range facts', () => {
    const space = buildCatalogInverseSearchSpace();
    const common = computeCommonTrustedRange(space, L_3OC6_SIGNAL_ID);
    expect(common).not.toBeNull();
    if (common === null) throw new Error('expected a common range');

    expect(countCandidatesCoveringTargetRange(space, L_3OC6_SIGNAL_ID, common)).toBe(
      space.candidates.filter((candidate) => candidate.inputSignalId === L_3OC6_SIGNAL_ID).length,
    );
    expect(
      countCandidatesCoveringTargetRange(space, L_3OC6_SIGNAL_ID, {
        minimum: common.minimum / 10,
        maximum: common.maximum,
      }),
    ).toBeLessThan(
      space.candidates.filter((candidate) => candidate.inputSignalId === L_3OC6_SIGNAL_ID).length,
    );
    expect(countCandidatesCoveringTargetRange(space, UNSPECIFIED_3OC6_SIGNAL_ID, common)).toBe(0);
  });

  it('derives only real host and strain combinations for the exact signal', () => {
    const space = buildCatalogInverseSearchSpace();
    const options = listCatalogInverseContextOptions(space, L_3OC6_SIGNAL_ID);

    expect(options).toEqual([
      {
        signalId: L_3OC6_SIGNAL_ID,
        hostSpecies: 'Escherichia coli',
        hostStrain: 'DH5α',
        candidateCount: 1,
      },
      {
        signalId: L_3OC6_SIGNAL_ID,
        hostSpecies: 'Escherichia coli',
        hostStrain: 'TOP10',
        candidateCount: space.candidates.filter(
          (candidate) =>
            candidate.inputSignalId === L_3OC6_SIGNAL_ID &&
            candidate.context.hostStrain === 'TOP10',
        ).length,
      },
    ]);
    expect(listCatalogInverseContextOptions(space, UNSPECIFIED_3OC6_SIGNAL_ID)).toEqual([]);
  });

  it('builds signal profiles without inventing or applying target concentrations', () => {
    const space = buildCatalogInverseSearchSpace();
    const profile = listCatalogInverseSignalProfiles(space).find(
      (candidate) => candidate.signalId === L_3OC6_SIGNAL_ID,
    );

    expect(profile).toEqual({
      signalId: L_3OC6_SIGNAL_ID,
      candidateCount: space.candidates.filter(
        (candidate) => candidate.inputSignalId === L_3OC6_SIGNAL_ID,
      ).length,
      commonTrustedRangeM: computeCommonTrustedRange(space, L_3OC6_SIGNAL_ID),
    });
    expect(profile).not.toHaveProperty('responseWindow');
    expect(profile).not.toHaveProperty('displayUnit');
  });

  it('isolates one candidate build failure and keeps all trusted siblings available', () => {
    const failedResponseId = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;
    const adapter: CatalogInverseRuntimeAdapter = {
      ...defaultCatalogInverseRuntimeAdapter,
      buildRuntimeCandidate(responseId) {
        if (responseId === failedResponseId) throw new Error('injected candidate failure');
        return defaultCatalogInverseRuntimeAdapter.buildRuntimeCandidate(responseId);
      },
    };

    const space = buildCatalogInverseSearchSpace(adapter);

    expect(space.candidates.map((candidate) => candidate.responseId)).toEqual(
      AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.map((entry) => entry.id).filter(
        (responseId) => responseId !== failedResponseId,
      ),
    );
    expect(space.unavailableResponseIds).toEqual([failedResponseId]);
    expect(space.searchableSignals.reduce((total, signal) => total + signal.responseCount, 0)).toBe(
      space.candidates.length,
    );
  });

  it('records the canonical exact-signal identity for every isolated admission failure', () => {
    const failedResponseId = 'resp.kylilis2018.rhl.c4';
    const adapter: CatalogInverseRuntimeAdapter = {
      ...defaultCatalogInverseRuntimeAdapter,
      buildRuntimeCandidate(responseId) {
        if (responseId === failedResponseId) throw new Error('injected C4 admission failure');
        return defaultCatalogInverseRuntimeAdapter.buildRuntimeCandidate(responseId);
      },
    };

    const space = buildCatalogInverseSearchSpace(adapter);

    expect(space.unavailableResponses).toEqual([
      { responseId: failedResponseId, inputSignalId: 'ahl.c4.dl' },
    ]);
    expect(Object.isFrozen(space.unavailableResponses)).toBe(true);
    expect(Object.isFrozen(space.unavailableResponses[0])).toBe(true);
  });

  it('isolates a trust predicate rejection without mutating the frozen release', () => {
    const failedResponseId = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.at(-1)!.id;
    const frozenBefore = structuredClone(loadAhlHslCatalogRelease().release);
    const adapter: CatalogInverseRuntimeAdapter = {
      ...defaultCatalogInverseRuntimeAdapter,
      isTrustedRuntimeCandidate(candidate: unknown): candidate is BfnCatalogRuntimeCandidate {
        return (
          defaultCatalogInverseRuntimeAdapter.isTrustedRuntimeCandidate(candidate) &&
          candidate.responseId !== failedResponseId
        );
      },
    };

    const space = buildCatalogInverseSearchSpace(adapter);

    expect(space.unavailableResponseIds).toEqual([failedResponseId]);
    expect(space.candidates.some((candidate) => candidate.responseId === failedResponseId)).toBe(
      false,
    );
    expect(loadAhlHslCatalogRelease().release).toEqual(frozenBefore);
  });

  it('never lets an injected predicate widen the canonical candidate trust boundary', () => {
    const failedResponseId = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;
    const adapter: CatalogInverseRuntimeAdapter = {
      ...defaultCatalogInverseRuntimeAdapter,
      buildRuntimeCandidate(responseId) {
        const candidate = structuredClone(
          defaultCatalogInverseRuntimeAdapter.buildRuntimeCandidate(responseId),
        );
        if (responseId === failedResponseId) candidate.inputEntity = 'fabricated.signal.identity';
        return candidate;
      },
      isTrustedRuntimeCandidate(candidate: unknown): candidate is BfnCatalogRuntimeCandidate {
        return candidate !== null && typeof candidate === 'object';
      },
    };

    const space = buildCatalogInverseSearchSpace(adapter);

    expect(space.unavailableResponseIds).toEqual([failedResponseId]);
    expect(space.candidates.some((candidate) => candidate.responseId === failedResponseId)).toBe(
      false,
    );
    expect(space.candidates).toHaveLength(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST.length - 1);
  });
});
