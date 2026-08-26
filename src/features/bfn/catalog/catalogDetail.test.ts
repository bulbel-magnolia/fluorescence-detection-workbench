import { describe, expect, it, vi } from 'vitest';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import { buildBfnCatalogRuntimeCandidate } from './catalogBfnAdapter';
import { buildBfnCatalogDetail } from './catalogDetail';

const SHONG_RESPONSE_ID = 'resp.shong2013.esar-wt-pesar.3oc6';

describe('BFN catalog full-detail projection', () => {
  const presentation = loadReleaseCatalogPresentation();

  it('projects a runnable 4PL response into distinct runtime and literature scales', () => {
    const response = presentation.responseVariants.find(
      (entry) =>
        entry.runnable &&
        entry.response.sourceResponse?.modelType === 'four_parameter_logistic' &&
        entry.response.sourceResponse.basal !== 0 &&
        entry.response.sourceResponse.maximum !== 1,
    );
    if (!response) throw new Error('Expected a non-unit runnable 4PL response.');

    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'response',
      responseId: response.id,
    });

    expect(detail.kind).toBe('response');
    if (detail.kind !== 'response') return;
    expect(detail.status).toBe('runnable-demo');
    expect(detail.canAddToNetwork).toBe(true);
    expect(detail.runtimeModel).toMatchObject({
      model: 'hill-response',
      minimumResponse: 0,
      maximumResponse: 1,
      mathematicalDirection: 'increasing',
      biologicalDirection: 'activation',
    });
    expect(detail.runtimeModel?.halfResponseConcentration).toBe(
      response.response.sourceResponse?.ec50,
    );
    expect(detail.sourceResponse?.basal).toBe(response.response.sourceResponse?.basal);
    expect(detail.sourceResponse?.maximum).toBe(response.response.sourceResponse?.maximum);
    expect(detail.sourceResponse?.basal).not.toBe(detail.runtimeModel?.minimumResponse);
    expect(detail.sourceResponse?.maximum).not.toBe(detail.runtimeModel?.maximumResponse);
    expect(Object.isFrozen(detail)).toBe(true);
    expect(Object.isFrozen(detail.sources)).toBe(true);
  });

  it('preserves the Shong increasing mathematics and derepression biology', () => {
    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'response',
      responseId: SHONG_RESPONSE_ID,
    });

    expect(detail.kind).toBe('response');
    if (detail.kind !== 'response') return;
    expect(detail.runtimeModel).toMatchObject({
      minimumResponse: 0,
      maximumResponse: 1,
      halfResponseConcentration: 2.1e-7,
      hillCoefficient: 1,
      mathematicalDirection: 'increasing',
      biologicalDirection: 'derepression',
    });
    expect(detail.sourceResponse?.modelType).toBe('hill_equation_n_fixed_1');
  });

  it.each([
    ['calibration-candidate', 'needs-calibration'],
    ['compatibility-only', 'qualitative-only'],
  ] as const)(
    'keeps a %s response view-only with no runtime model',
    (usageStatus, expectedStatus) => {
      const response = presentation.responseVariants.find(
        (entry) => entry.usageStatus === usageStatus,
      );
      if (!response) throw new Error(`Expected a ${usageStatus} response.`);

      const detail = buildBfnCatalogDetail(presentation, {
        kind: 'response',
        responseId: response.id,
      });

      expect(detail.kind).toBe('response');
      if (detail.kind !== 'response') return;
      expect(detail.status).toBe(expectedStatus);
      expect(detail.canAddToNetwork).toBe(false);
      expect(detail.runtimeCandidate).toBeNull();
      expect(detail.runtimeModel).toBeNull();
    },
  );

  it('keeps a reference-only component view-only', () => {
    const component = presentation.components.find(
      (entry) => entry.usageStatus === 'reference-only',
    );
    if (!component) throw new Error('Expected a reference-only component.');

    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'component',
      componentId: component.id,
    });

    expect(detail).toMatchObject({
      kind: 'component',
      status: 'reference-only',
      currentNumericCapability: 'reference-only',
    });
    expect('canAddToNetwork' in detail).toBe(false);
  });

  it('projects sender evidence without inventing a quantitative sender function', () => {
    const sender = presentation.components.find((component) => component.role === 'sender');
    if (!sender) throw new Error('Expected a sender component.');

    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'component',
      componentId: sender.id,
    });

    expect(detail.kind).toBe('component');
    if (detail.kind !== 'component') return;
    expect(detail.component.role).toBe('sender');
    expect(detail.currentNumericCapability).toBe('no-quantitative-sender-function');
    expect('runtimeModel' in detail).toBe(false);
    expect('canAddToNetwork' in detail).toBe(false);
  });

  it('preserves null context evidence instead of inventing defaults', () => {
    const response = presentation.responseVariants.find(
      (entry) =>
        entry.parameterContext.canonical.details?.cultureMedium === null ||
        entry.parameterContext.canonical.details?.measurementPlatform === null,
    );
    if (!response) throw new Error('Expected a response with incomplete context evidence.');

    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'response',
      responseId: response.id,
    });

    expect(detail.context?.cultureMedium).toBe(
      response.parameterContext.canonical.details?.cultureMedium ?? null,
    );
    expect(detail.context?.measurementPlatform).toBe(
      response.parameterContext.canonical.details?.measurementPlatform ?? null,
    );
  });

  it('retains every response source and marks each source identity once', () => {
    const response = presentation.responseVariants.find((entry) => entry.sources.length > 1);
    if (!response) throw new Error('Expected a multi-source response.');

    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'response',
      responseId: response.id,
    });

    expect(detail.sources.map((source) => source.id)).toEqual(
      response.sources.map((source) => source.id),
    );
    expect(new Set(detail.sources.map((source) => source.id)).size).toBe(detail.sources.length);
  });

  it('retains whole-system pair and qualitative compatibility boundaries', () => {
    const component = presentation.components.find(
      (entry) => entry.observedPairs.length > 0 && entry.compatibilityRelations.length > 0,
    );
    if (!component) throw new Error('Expected component with pair and compatibility evidence.');

    const detail = buildBfnCatalogDetail(presentation, {
      kind: 'component',
      componentId: component.id,
    });

    expect(detail.observedPairs.length).toBe(component.observedPairs.length);
    expect(detail.observedPairs.every((pair) => pair.decompositionProhibited)).toBe(true);
    expect(detail.compatibility.length).toBe(component.compatibilityRelations.length);
    expect(detail.compatibility.every((entry) => entry.numericUseAllowed === false)).toBe(true);
  });

  it('rebuilds trust on Detail entry and fails closed when the fresh build fails', () => {
    const response = presentation.responseVariants.find((entry) => entry.runnable);
    if (!response) throw new Error('Expected a runnable response.');
    const freshBuilder = vi.fn(buildBfnCatalogRuntimeCandidate);

    const trustedDetail = buildBfnCatalogDetail(
      presentation,
      { kind: 'response', responseId: response.id },
      freshBuilder,
    );
    expect(freshBuilder).toHaveBeenCalledOnce();
    expect(freshBuilder).toHaveBeenCalledWith(response.id);
    expect(trustedDetail.kind === 'response' && trustedDetail.canAddToNetwork).toBe(true);

    const unavailableDetail = buildBfnCatalogDetail(
      presentation,
      { kind: 'response', responseId: response.id },
      () => {
        throw new Error('fresh trust check failed');
      },
    );
    expect(unavailableDetail).toMatchObject({
      kind: 'response',
      status: 'unavailable',
      runtimeCandidate: null,
      runtimeModel: null,
      canAddToNetwork: false,
    });
  });
});
