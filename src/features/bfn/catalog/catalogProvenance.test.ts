import { beforeEach, describe, expect, it } from 'vitest';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { createDemoBfnProject } from '../fixtures';
import { resolveEffectiveBfnModel } from '../modelResolution';
import { loadBfnProject, parseBfnProject, saveBfnProject } from '../repository';
import type { BfnFunctionalModule, BfnProject, BfnStaticModel } from '../types';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
} from './catalogBfnAdapter';
import { bfnCatalogProvenanceSourceLabel, resolveBfnCatalogProvenance } from './catalogProvenance';

interface ProvenanceFixture {
  project: BfnProject;
  module: BfnFunctionalModule;
  model: BfnStaticModel;
}

function fixture(): ProvenanceFixture {
  const project = createDemoBfnProject();
  const candidate = buildBfnCatalogRuntimeCandidate(AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id);
  const instantiated = instantiateCatalogResponseInBfnProject(project, candidate, {
    moduleId: 'module-catalog-provenance',
    modulePosition: { x: 360, y: 220 },
    createInputSource: false,
  });
  if (!instantiated.ok) throw new Error(instantiated.error.code);
  const module = instantiated.nextProject.network.modules.at(-1);
  const model = module?.modelVariants[0];
  if (!module || !model || model.mode !== 'static') throw new Error('Provenance fixture failed.');
  return { project: instantiated.nextProject, module, model };
}

describe('Catalog provenance resolver', () => {
  beforeEach(() => localStorage.clear());

  it('resolves an unconnected trusted module to the current canonical literature record', () => {
    const value = fixture();
    const before = structuredClone(value.project);

    const provenance = resolveBfnCatalogProvenance(value.project, value.module, value.model);

    expect(provenance?.status).toBe('matched');
    expect(provenance?.canonical).toMatchObject({
      responseId: value.model.catalogReference?.responseId,
      catalogVersion: value.model.catalogReference?.releaseVersion,
      parameterContextId: value.model.catalogReference?.parameterContextId,
    });
    expect(provenance?.canonical?.componentNames.zh).toBeTruthy();
    expect(provenance?.canonical?.inputSignalNames.zh).toMatch(/（(?:L|DL|立体构型未说明)）/u);
    expect(provenance?.canonical?.primarySource?.title).toBeTruthy();
    expect(provenance?.canonical?.sourceCount).toBeGreaterThan(0);
    expect(value.project.network.edges.some((edge) => edge.target.nodeId === value.module.id)).toBe(
      false,
    );
    expect(value.project).toEqual(before);
  });

  it('returns null for a generic module and ignores presentation-only display names', () => {
    const genericProject = createDemoBfnProject();
    const genericModule = genericProject.network.modules[0]!;
    const genericModel = resolveEffectiveBfnModel(genericProject, genericModule)!;
    expect(resolveBfnCatalogProvenance(genericProject, genericModule, genericModel)).toBeNull();

    const value = fixture();
    value.module.displayName = { en: 'Renamed module', zh: '已重命名模块' };
    expect(resolveBfnCatalogProvenance(value.project, value.module, value.model)?.status).toBe(
      'matched',
    );
  });

  it.each([
    [
      'EC50',
      (value: ProvenanceFixture) => (value.model.catalogReference!.sourceParameters.ec50 *= 2),
    ],
    ['source IDs', (value: ProvenanceFixture) => value.model.catalogReference!.sourceIds.reverse()],
    [
      'input entity',
      (value: ProvenanceFixture) => (value.module.inputPorts[0]!.entity = 'tampered-input'),
    ],
    [
      'validity domain',
      (value: ProvenanceFixture) => {
        const domain = value.project.registry.validityDomains.find(
          (entry) => entry.id === value.model.validityDomainId,
        );
        if (domain) domain.inputRanges[0]!.maximum *= 2;
      },
    ],
  ])(
    'reports %s tampering as a mismatch and preserves a canonical detail target',
    (_label, mutate) => {
      const value = fixture();
      mutate(value);
      const before = structuredClone(value.project);

      const provenance = resolveBfnCatalogProvenance(value.project, value.module, value.model);

      expect(provenance?.status).toBe('source-mismatch');
      expect(provenance?.canonical?.detailTarget).toEqual({
        kind: 'response',
        responseId: value.model.catalogReference?.responseId,
      });
      expect(value.project).toEqual(before);
    },
  );

  it('keeps an unknown release readable and marks its source unavailable', () => {
    const value = fixture();
    value.model.catalogReference!.releaseVersion = 'future-unknown';

    const provenance = resolveBfnCatalogProvenance(value.project, value.module, value.model);

    expect(provenance).toMatchObject({
      status: 'source-unavailable',
      recordedReference: { releaseVersion: 'future-unknown' },
      canonical: null,
    });
  });

  it('fails safely for a malformed reference without exposing a false canonical source', () => {
    const value = fixture();
    Object.assign(value.model, { catalogReference: { kind: 'catalog_receiver_response' } });

    expect(() =>
      resolveBfnCatalogProvenance(value.project, value.module, value.model),
    ).not.toThrow();
    expect(resolveBfnCatalogProvenance(value.project, value.module, value.model)).toMatchObject({
      status: 'source-mismatch',
      canonical: null,
    });
  });

  it('round-trips the same source identity through storage and import parsing', () => {
    const value = fixture();
    const expected = resolveBfnCatalogProvenance(value.project, value.module, value.model);
    saveBfnProject(value.project);
    const stored = loadBfnProject();
    const imported = parseBfnProject(JSON.stringify(value.project));
    if (!stored) throw new Error('Expected stored project.');

    for (const project of [stored, imported]) {
      const module = project.network.modules.find((entry) => entry.id === value.module.id)!;
      const model = module.modelVariants.find((entry) => entry.id === value.model.id)!;
      expect(resolveBfnCatalogProvenance(project, module, model)).toEqual(expected);
    }
  });

  it('formats the first literature source compactly without changing its identity', () => {
    expect(
      bfnCatalogProvenanceSourceLabel({
        authors: 'Nicolas Kylilis; Zoltan A. Tuza; Guy-Bart Stan; Karen M. Polizzi',
        year: 2018,
      }),
    ).toBe('Kylilis et al. · 2018');
    expect(bfnCatalogProvenanceSourceLabel({ authors: 'GBS-SynBioLab', year: 2018 })).toBe(
      'GBS-SynBioLab · 2018',
    );
  });
});
