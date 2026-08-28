import { describe, expect, it } from 'vitest';
import { loadReleaseCatalogPresentation } from '../../../modeling/catalog/releaseCatalogPresentation';
import type {
  BfnCatalogInverseCriterionResult,
  BfnCatalogInverseExclusionReason,
} from '../catalogInverseDesignTypes';
import {
  catalogInverseCriterionLabelKey,
  catalogInverseExclusionReasonLabelKey,
  catalogInverseSignalDisplayName,
  catalogInverseStatusLabelKey,
  resolveCatalogInverseResponsePresentation,
} from './catalogInverseDesignPresentation';

describe('catalog inverse design presentation', () => {
  const presentation = loadReleaseCatalogPresentation();

  it('preserves exact stereochemistry in localized signal names', () => {
    const lForm = catalogInverseSignalDisplayName(presentation, 'ahl.3oc6.l', 'zh-CN');
    const unspecified = catalogInverseSignalDisplayName(
      presentation,
      'ahl.3oc6.stereo-unspecified',
      'zh-CN',
    );

    expect(lForm).toMatch(/L/u);
    expect(lForm).not.toBe(unspecified);
    expect(lForm).not.toBe('ahl.3oc6.l');
  });

  it('resolves component, response, source, and context from the canonical presentation', () => {
    const resolved = resolveCatalogInverseResponsePresentation(
      presentation,
      'resp.kylilis2018.rhl.3oc6',
      'en-US',
    );

    expect(resolved.responseId).toBe('resp.kylilis2018.rhl.3oc6');
    expect(resolved.componentName).not.toContain('resp.');
    expect(resolved.variantName.length).toBeGreaterThan(0);
    expect(resolved.sourceSummary).toMatch(/Kylilis.*2018/u);
    expect(resolved.hostSpecies).toBe('Escherichia coli');
    expect(resolved.hostStrain).toBe('TOP10');
  });

  it('maps scientific states to presentation keys without leaking internal codes', () => {
    const reasons: readonly BfnCatalogInverseExclusionReason[] = [
      'target-outside-working-range',
      'mechanism-mismatch',
      'host-mismatch',
      'host-unrecorded',
      'strain-mismatch',
      'strain-unrecorded',
      'trust-unavailable',
      'evaluation-unavailable',
    ];
    const criteria: readonly BfnCatalogInverseCriterionResult['kind'][] = [
      'low-response-maximum',
      'high-response-minimum',
      'ec50-range',
      'hill-range',
    ];

    expect(catalogInverseStatusLabelKey('matched')).toBe('bfn.inverseDesign.status.matched');
    expect(reasons.map(catalogInverseExclusionReasonLabelKey)).toEqual(
      reasons.map((reason) => `bfn.inverseDesign.exclusionReasons.${reason}`),
    );
    expect(criteria.map(catalogInverseCriterionLabelKey)).toEqual(
      criteria.map((criterion) => `bfn.inverseDesign.criteria.${criterion}`),
    );
  });
});
