import { describe, expect, it } from 'vitest';
import { loadAhlHslCatalogRelease } from './v2/catalogReleaseLoader';
import {
  buildReleaseCatalogPresentation,
  createReleaseComponentReference,
  filterReleaseCatalogComponents,
  getReleaseCatalogFilterOptions,
  getReleaseResponseNodeName,
  isCanonicalRunnableReleaseResponse,
  isTrustedReleaseCatalogPresentation,
  loadReleaseCatalogPresentation,
} from './releaseCatalogPresentation';

describe('release catalog presentation', () => {
  it('builds the complete frozen V1.1 presentation without decomposing observations', () => {
    const loaded = loadAhlHslCatalogRelease();
    const presentation = loadReleaseCatalogPresentation();

    expect(Object.isFrozen(loaded.release)).toBe(true);
    expect(Object.isFrozen(loaded.release.components)).toBe(true);
    expect(Object.isFrozen(loaded.catalog)).toBe(true);
    expect(presentation.components).toHaveLength(42);
    expect(presentation.responseVariants).toHaveLength(52);
    expect(presentation.responseVariants.filter((response) => response.runnable)).toHaveLength(20);
    expect(presentation.observedPairs).toHaveLength(13);
    expect(presentation.compatibilityRelations).toHaveLength(39);
    expect(
      presentation.components.reduce(
        (count, component) => count + component.responseVariants.length,
        0,
      ),
    ).toBe(52);
    expect(
      presentation.observedPairs.every(
        (pair) =>
          pair.decompositionProhibited === true && pair.pair.fixedWeightCandidate === undefined,
      ),
    ).toBe(true);
    expect(
      presentation.compatibilityRelations.every(
        (relation) => relation.numericUseAllowed === false && !('weight' in relation.relation),
      ),
    ).toBe(true);
  });

  it('preserves bilingual names, roles, status, context, host, sequence and provenance fields', () => {
    const presentation = loadReleaseCatalogPresentation();
    const receiver = presentation.components.find(
      (component) => component.id === 'recv.kylilis2018.rhl.v1',
    );
    const sender = presentation.components.find(
      (component) => component.id === 'send.daer2018.rpai.v1',
    );

    expect(receiver).toMatchObject({
      names: {
        en: 'RhlR/pRhl AHL receiver (Kylilis 2018)',
        zh: 'RhlR/pRhl AHL接收器',
      },
      role: 'receiver',
      usageStatus: 'runtime-demo',
    });
    expect(typeof receiver?.sequenceStatus).toBe('string');
    expect(receiver?.hostSpecies).toBeTruthy();
    expect(receiver?.parameterContexts).toHaveLength(1);
    expect(receiver?.sources.length).toBeGreaterThan(0);
    expect(receiver?.responseVariants.length).toBeGreaterThan(0);
    expect(sender?.role).toBe('sender');
    expect(sender?.responseVariants).toHaveLength(0);
    expect(sender?.evidenceGaps.length).toBeGreaterThan(0);
    expect(sender?.outputMolecules).toEqual([]);
    const nullOutputResponse = presentation.responseVariants.find(
      (response) => response.outputMolecule === null,
    );
    expect(nullOutputResponse).toBeDefined();
  });

  it('builds bilingual response-specific node names from the first molecule abbreviation', () => {
    const presentation = loadReleaseCatalogPresentation();
    const component = presentation.components.find(
      (candidate) => candidate.id === 'recv.kylilis2018.rhl.v1',
    )!;
    const c4 = component.responseVariants.find(
      (response) => response.id === 'resp.kylilis2018.rhl.c4',
    )!;
    const threeOc6 = component.responseVariants.find(
      (response) => response.id === 'resp.kylilis2018.rhl.3oc6',
    )!;

    expect(getReleaseResponseNodeName(component, c4, 'zh-CN')).toBe('C4-HSL · RhlR/pRhl AHL接收器');
    expect(getReleaseResponseNodeName(component, c4, 'en-US')).toBe(
      'C4-HSL · RhlR/pRhl AHL receiver (Kylilis 2018)',
    );
    expect(getReleaseResponseNodeName(component, threeOc6, 'en-US')).toBe(
      '3OC6-HSL · RhlR/pRhl AHL receiver (Kylilis 2018)',
    );
    expect(getReleaseResponseNodeName(component, c4, 'en-US')).not.toBe(
      getReleaseResponseNodeName(component, threeOc6, 'en-US'),
    );
    expect(getReleaseResponseNodeName(component, c4, 'en-US').slice(0, 17)).not.toBe(
      getReleaseResponseNodeName(component, threeOc6, 'en-US').slice(0, 17),
    );

    const withoutAbbreviation = {
      ...c4,
      inputMolecule: { ...c4.inputMolecule, abbreviations: [] },
    };
    expect(getReleaseResponseNodeName(component, withoutAbbreviation, 'zh-CN')).toBe(
      'N-丁酰-DL-高丝氨酸内酯 · RhlR/pRhl AHL接收器',
    );
  });

  it('searches IDs, bilingual names, molecule aliases and source identifiers', () => {
    const presentation = loadReleaseCatalogPresentation();
    expect(
      filterReleaseCatalogComponents(presentation, { query: 'RhlR/pRhl AHL接收器' }).map(
        (component) => component.id,
      ),
    ).toContain('recv.kylilis2018.rhl.v1');
    expect(
      filterReleaseCatalogComponents(presentation, {
        query: 'recv.kylilis2018.rhl.v1',
      }).map((component) => component.id),
    ).toEqual(['recv.kylilis2018.rhl.v1']);

    const aliased = presentation.components.find((component) =>
      component.inputMolecules.some((signal) => signal.abbreviations.length > 0),
    );
    const alias = aliased?.inputMolecules.find((signal) => signal.abbreviations.length > 0)
      ?.abbreviations[0];
    expect(aliased).toBeDefined();
    expect(alias).toBeTruthy();
    expect(
      filterReleaseCatalogComponents(presentation, { query: alias! }).map(
        (component) => component.id,
      ),
    ).toContain(aliased?.id);

    const cited = presentation.components.find((component) =>
      component.sources.some((source) => source.doi !== null),
    );
    const doi = cited?.sources.find((source) => source.doi !== null)?.doi;
    expect(cited).toBeDefined();
    expect(doi).toBeTruthy();
    expect(
      filterReleaseCatalogComponents(presentation, { query: doi! }).map(
        (component) => component.id,
      ),
    ).toContain(cited?.id);
  });

  it('uses only usage status, input molecule and host as structured filters', () => {
    const presentation = loadReleaseCatalogPresentation();
    const runtime = filterReleaseCatalogComponents(presentation, {
      usageStatus: 'runtime-demo',
    });
    expect(runtime).toHaveLength(7);
    expect(runtime.every((component) => component.usageStatus === 'runtime-demo')).toBe(true);

    const inputMolecule = presentation.responseVariants[0]?.inputMolecule.id;
    const host = presentation.components.find(
      (component) => component.hostSpecies !== null,
    )?.hostSpecies;
    expect(inputMolecule).toBeTruthy();
    expect(host).toBeTruthy();
    expect(
      filterReleaseCatalogComponents(presentation, { inputMolecule: inputMolecule! }).every(
        (component) => component.inputMolecules.some((signal) => signal.id === inputMolecule),
      ),
    ).toBe(true);
    expect(
      filterReleaseCatalogComponents(presentation, { host: host! }).every((component) =>
        [component.hostSpecies, component.hostStrain].some((value) =>
          value?.toLocaleLowerCase().includes(host!.toLocaleLowerCase()),
        ),
      ),
    ).toBe(true);

    const options = getReleaseCatalogFilterOptions(presentation);
    expect(Object.keys(options).sort()).toEqual(['hosts', 'inputMolecules', 'usageStatuses']);
    expect(options.usageStatuses).toEqual([
      'runtime-demo',
      'calibration-candidate',
      'compatibility-only',
      'reference-only',
    ]);
  });

  it('creates a stable bilingual citation snapshot for secondary attachment', () => {
    const presentation = loadReleaseCatalogPresentation();
    const component = presentation.components[0]!;
    const reference = createReleaseComponentReference(presentation, component, 'zh-CN');

    expect(reference).toMatchObject({
      catalogId: 'ahl-hsl-component-database',
      catalogVersion: '1.1',
      entryId: component.id,
      displayNameSnapshot: component.names.zh,
      sourceStatus: 'passed',
    });
    expect(reference.boundaryNote).toContain('sources=');
    expect(reference.boundaryNote).toContain('citation snapshot');
  });

  it('rejects forged frozen releases and presentations at trust boundaries', () => {
    const loaded = loadAhlHslCatalogRelease();
    const forgedLoaded = structuredClone(loaded);
    forgedLoaded.release.components[0]!.display_name_en = 'Forged component';
    deepFreeze(forgedLoaded);
    expect(() => buildReleaseCatalogPresentation(forgedLoaded)).toThrow(
      'RELEASE_CATALOG_IDENTITY_OR_FREEZE_INVALID',
    );

    const trusted = loadReleaseCatalogPresentation();
    expect(isTrustedReleaseCatalogPresentation(trusted)).toBe(true);
    const forgedPresentation = structuredClone(trusted);
    forgedPresentation.components[0]!.names.en = 'Forged component';
    expect(isTrustedReleaseCatalogPresentation(forgedPresentation)).toBe(false);
    expect(() =>
      createReleaseComponentReference(
        forgedPresentation,
        forgedPresentation.components[0]!,
        'en-US',
      ),
    ).toThrow('RELEASE_COMPONENT_REFERENCE_NOT_CANONICAL');
  });

  it('does not mark a response runnable after source parameters are tampered', () => {
    const trusted = loadReleaseCatalogPresentation();
    const forgedCatalog = structuredClone(trusted.catalog);
    const forgedResponse = forgedCatalog.receiverResponses.find(
      (response) => response.id === 'resp.kylilis2018.rhl.c4',
    )!;
    forgedResponse.sourceResponse!.ec50 = forgedResponse.sourceResponse!.ec50! * 2;
    expect(isCanonicalRunnableReleaseResponse(forgedCatalog, forgedResponse)).toBe(false);
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
