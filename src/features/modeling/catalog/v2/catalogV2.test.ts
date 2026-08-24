import { describe, expect, it } from 'vitest';
import qsSystemsJson from '../qsSystems.json';
import pollutantSensorsJson from '../pollutantSensors.json';
import controlOutputPartsJson from '../controlOutputParts.json';
import type { ComponentCatalogV2 } from './catalogTypes';
import type { CatalogEntry } from '../catalogTypes';
import { adaptCatalogEntriesToV2 } from './catalogAdapter';
import { catalogV2DevelopmentFixture } from './fixtures';
import { validateCatalogV2 } from './catalogValidator';

const cloneFixture = (): ComponentCatalogV2 => structuredClone(catalogV2DevelopmentFixture);

describe('component catalog schema v2 development fixture', () => {
  it('validates every admission status and fixture boundary', () => {
    const result = validateCatalogV2(catalogV2DevelopmentFixture);
    expect(result.ok).toBe(true);
    expect(catalogV2DevelopmentFixture.releaseManifest.fixtureLabel).toBe('development-fixture');
    expect(catalogV2DevelopmentFixture.releaseManifest.status).toBe('development-fixture');
    expect(
      new Set(catalogV2DevelopmentFixture.components.map((item) => item.admission.status)),
    ).toEqual(
      new Set([
        'runtime-quantitative',
        'runtime-demo',
        'compatibility-only',
        'calibration-candidate',
        'reference-only',
        'rejected',
      ]),
    );
    expect(
      catalogV2DevelopmentFixture.components.find(
        (item) => item.admission.status === 'runtime-demo',
      )?.admission.demoBoundary.isDemo,
    ).toBe(true);
    expect(
      catalogV2DevelopmentFixture.components.find(
        (item) => item.admission.status === 'runtime-quantitative',
      )?.admission.demoBoundary.isDemo,
    ).toBe(false);
  });

  it('covers no-response compatibility and multiple sender outputs', () => {
    const noResponse = catalogV2DevelopmentFixture.compatibilityRelations.find(
      (item) => item.kind === 'no-response',
    );
    expect(noResponse?.receiverResponseId).toBeNull();
    expect(
      catalogV2DevelopmentFixture.senderOutputs.filter(
        (item) => item.senderComponentId === 'fixture.component.multi-output',
      ),
    ).toHaveLength(2);
    expect(catalogV2DevelopmentFixture.senderOutputs.map((item) => item.outputOrdinal)).toContain(
      2,
    );
  });

  it('rejects dangling references, duplicate ids, NaN, and out-of-range weights', () => {
    const dangling = cloneFixture();
    dangling.components[0]!.inputSignalIds = ['fixture.signal.missing'];
    expect(validateCatalogV2(dangling).ok).toBe(false);
    const danglingResult = validateCatalogV2(dangling);
    expect(danglingResult.ok).toBe(false);
    if (!danglingResult.ok)
      expect(danglingResult.errors.some((error) => error.code === 'reference')).toBe(true);

    const duplicate = cloneFixture();
    duplicate.components.push({ ...duplicate.components[0]!, id: duplicate.components[1]!.id });
    expect(validateCatalogV2(duplicate).ok).toBe(false);

    const invalidWeight = cloneFixture();
    const quantitative = invalidWeight.effectivePairs[0]!.fixedWeightCandidate;
    if (quantitative) quantitative.weight = Number.NaN;
    expect(validateCatalogV2(invalidWeight).ok).toBe(false);

    const outOfRange = cloneFixture();
    const candidate = outOfRange.effectivePairs[0]!.fixedWeightCandidate;
    if (candidate) candidate.weight = 1.1;
    expect(validateCatalogV2(outOfRange).ok).toBe(false);
  });

  it('requires quantitative relations to carry a fixed candidate and non-demo boundary', () => {
    const missingCandidate = cloneFixture();
    delete missingCandidate.effectivePairs[0]!.fixedWeightCandidate;
    expect(validateCatalogV2(missingCandidate).ok).toBe(false);

    const demoQuantitative = cloneFixture();
    demoQuantitative.effectivePairs[0]!.admission.demoBoundary = {
      ...demoQuantitative.effectivePairs[0]!.admission.demoBoundary,
      isDemo: true,
    };
    demoQuantitative.effectivePairs[0]!.demoBoundary = {
      ...demoQuantitative.effectivePairs[0]!.demoBoundary,
      isDemo: true,
    };
    expect(validateCatalogV2(demoQuantitative).ok).toBe(false);
  });
});

describe('legacy catalog adapter', () => {
  it('keeps migrated entries reference/calibration-only and never invents weights', () => {
    const legacyEntries: CatalogEntry[] = [
      ...(qsSystemsJson.entries as unknown as CatalogEntry[]),
      ...(pollutantSensorsJson.entries as unknown as CatalogEntry[]),
      ...(controlOutputPartsJson.entries as unknown as CatalogEntry[]),
    ];
    const migrated = adaptCatalogEntriesToV2(legacyEntries);
    expect(validateCatalogV2(migrated).ok).toBe(true);
    expect(migrated.components).toHaveLength(legacyEntries.length);
    expect(
      migrated.components.every(
        (component) =>
          component.admission.status === 'reference-only' ||
          component.admission.status === 'calibration-candidate',
      ),
    ).toBe(true);
    expect(migrated.receiverResponses).toHaveLength(0);
    expect(migrated.effectivePairs).toHaveLength(0);
    expect(
      migrated.components.some((component) => component.mechanismLabels.includes('quorum-sensing')),
    ).toBe(true);
    expect(
      migrated.components.every(
        (component) =>
          component.admission.simulationReady === false &&
          component.admission.constructionReady === false,
      ),
    ).toBe(true);
    expect(
      migrated.senderOutputs.every((sender) => sender.fixedWeightCandidate === undefined),
    ).toBe(true);
  });
});
