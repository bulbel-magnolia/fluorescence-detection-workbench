import { describe, expect, it } from 'vitest';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import { BfnOntologyContractError } from '../../modeling/ontology/v1/ontologyTypes';
import {
  DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
  type BfnSemanticPresentationAdapter,
} from '../semantic/semanticPresentation';
import {
  bfnCatalogSignalDisplayName,
  bfnCatalogDiscoveryStatus,
  buildBfnCatalogDiscoveryModel,
  queryBfnCatalogDiscovery,
  type BfnCatalogDiscoveryModel,
} from './catalogDiscovery';

describe('BFN catalog discovery projection', () => {
  const presentation = loadReleaseCatalogPresentation();
  const model = buildBfnCatalogDiscoveryModel(presentation);

  it('projects the frozen base and Sender V1.2 extension without inventing sender runtime', () => {
    expect(model.counts).toEqual({
      components: 76,
      responses: 52,
      runnableResponses: 20,
      receiverResponses: 52,
      runnableReceivers: 20,
      senderEvidenceRecords: 53,
      runnableSenders: 0,
    });
    expect(model.groups).toHaveLength(76);
    expect(model.groups.flatMap((group) => group.responses)).toHaveLength(52);
    expect(queryBfnCatalogDiscovery(model)).toMatchObject({
      componentCount: 76,
      responseCount: 52,
      senderEvidenceCount: 53,
    });
    expect(model.catalogVersion).toBe('1.1');
    expect(model.senderExtensionVersion).toBe('1.2');
    expect(Object.isFrozen(model)).toBe(true);

    const senders = model.groups.filter((group) => group.role === 'sender');
    const senderOutputs = senders.flatMap((sender) => sender.senderOutputs);
    expect(senders.length).toBeGreaterThan(0);
    expect(senders.every((sender) => sender.responses.length === 0)).toBe(true);
    expect(senders.every((sender) => sender.status !== 'runnable-demo')).toBe(true);
    expect(senderOutputs).toHaveLength(53);
    expect(senderOutputs.every((output) => output.runtimeAdmission.admitted === false)).toBe(true);
    expect(senderOutputs.every((output) => output.runtimeAdmission.outputPort === null)).toBe(true);
    expect(
      presentation.components.every(
        (component) => component.component.admission.status !== 'rejected',
      ),
    ).toBe(true);
  });

  it('maps usage states through the real runnable flag and fails safe', () => {
    expect(bfnCatalogDiscoveryStatus({ runnable: true, usageStatus: 'runtime-demo' })).toBe(
      'runnable-demo',
    );
    expect(bfnCatalogDiscoveryStatus({ runnable: false, usageStatus: 'runtime-demo' })).toBe(
      'unavailable',
    );
    expect(
      bfnCatalogDiscoveryStatus({ runnable: false, usageStatus: 'calibration-candidate' }),
    ).toBe('needs-calibration');
    expect(bfnCatalogDiscoveryStatus({ runnable: false, usageStatus: 'compatibility-only' })).toBe(
      'qualitative-only',
    );
    expect(bfnCatalogDiscoveryStatus({ runnable: false, usageStatus: 'reference-only' })).toBe(
      'reference-only',
    );
  });

  it('preserves base semantics and leaves new extension records uninferred', () => {
    const baseIds = new Set(presentation.components.map((component) => component.id));
    const baseGroups = model.groups.filter((group) => baseIds.has(group.id));
    const extensionGroups = model.groups.filter((group) => !baseIds.has(group.id));
    expect(baseGroups).toHaveLength(42);
    expect(baseGroups.every((group) => group.semantic !== null)).toBe(true);
    expect(extensionGroups).toHaveLength(34);
    expect(extensionGroups.every((group) => group.semantic === null)).toBe(true);
    expect(
      baseGroups
        .filter((group) => group.role === 'receiver')
        .every(
          (group) =>
            group.semantic?.functionalFamilyId === 'functional.signal_response' &&
            group.semantic.biologicalComponentFamilyId === 'bio.ahl_receiver_regulator',
        ),
    ).toBe(true);
    expect(
      baseGroups
        .filter((group) => group.role === 'sender')
        .every(
          (group) =>
            group.semantic?.functionalFamilyId === 'functional.signal_production' &&
            group.semantic.biologicalComponentFamilyId === 'bio.ahl_synthase',
        ),
    ).toBe(true);
    expect(new Set(model.filterOptions.functionalFamilies.map((option) => option.id))).toEqual(
      new Set(['functional.signal_response', 'functional.signal_production']),
    );

    const throwingAdapter: BfnSemanticPresentationAdapter = {
      ...DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
      resolveCatalogComponent: () => {
        throw new BfnOntologyContractError('ontology-invalid');
      },
    };
    const withoutSemantic = buildBfnCatalogDiscoveryModel(presentation, throwingAdapter);
    const runtimeFacts = (source: BfnCatalogDiscoveryModel) =>
      source.groups.map((group) => ({
        id: group.id,
        role: group.role,
        status: group.status,
        responses: group.responses.map((response) => ({
          id: response.id,
          runnable: response.runnable,
          status: response.status,
        })),
        senderOutputs: group.senderOutputs.map((output) => ({
          id: output.id,
          admitted: output.runtimeAdmission.admitted,
          status: output.status,
        })),
      }));

    expect(runtimeFacts(withoutSemantic)).toEqual(runtimeFacts(model));
    expect(withoutSemantic.counts).toEqual(model.counts);
    expect(withoutSemantic.groups.every((group) => group.semantic === null)).toBe(true);
    expect(withoutSemantic.filterOptions.functionalFamilies).toEqual([]);
    expect(queryBfnCatalogDiscovery(withoutSemantic)).toMatchObject({
      componentCount: 76,
      responseCount: 52,
      senderEvidenceCount: 53,
    });
    expect(
      queryBfnCatalogDiscovery(withoutSemantic, {
        functionalFamilyId: 'functional.signal_response',
      }),
    ).toMatchObject({ componentCount: 0, responseCount: 0 });
  });

  it('keeps real catalog signal identities distinct when abbreviations are shared', () => {
    const signalIds = [
      'ahl.c4.l',
      'ahl.c4.dl',
      'ahl.c4.stereo-unspecified',
      'ahl.3oc6.l',
      'ahl.3oc6.stereo-unspecified',
    ] as const;
    const signals = signalIds.map((id) => {
      const signal = presentation.signals.find((candidate) => candidate.id === id);
      if (!signal) throw new Error(`Release signal fixture is missing: ${id}`);
      return signal;
    });
    const [c4L, c4Dl, c4Unspecified, oc6L, oc6Unspecified] = signals;
    if (!c4L || !c4Dl || !c4Unspecified || !oc6L || !oc6Unspecified)
      throw new Error('Signal identity fixtures are incomplete.');

    expect(c4L.abbreviations[0]).toBe(c4Dl.abbreviations[0]);
    expect(c4Dl.abbreviations[0]).toBe(c4Unspecified.abbreviations[0]);
    expect(oc6L.abbreviations[0]).toBe(oc6Unspecified.abbreviations[0]);

    expect(
      signals.map((signal) =>
        bfnCatalogSignalDisplayName(signal.names, signal.abbreviations, 'en-US'),
      ),
    ).toEqual([
      'C4-HSL (L)',
      'C4-HSL (DL)',
      'C4-HSL (stereo unspecified)',
      '3OC6-HSL (L)',
      '3OC6-HSL (stereo unspecified)',
    ]);
    expect(
      signals.map((signal) =>
        bfnCatalogSignalDisplayName(signal.names, signal.abbreviations, 'zh-CN'),
      ),
    ).toEqual([
      'C4-HSL（L）',
      'C4-HSL（DL）',
      'C4-HSL（立体构型未说明）',
      '3OC6-HSL（L）',
      '3OC6-HSL（立体构型未说明）',
    ]);
  });

  it('falls back to the catalog localized name when shortening is not provably safe', () => {
    const names = { en: 'Future audited signal', zh: '未来审核信号' };
    expect(bfnCatalogSignalDisplayName(names, [], 'zh-CN')).toBe(names.zh);
    expect(bfnCatalogSignalDisplayName(names, ['FAS'], 'zh-CN')).toBe(names.zh);
    expect(bfnCatalogSignalDisplayName(names, ['FAS'], 'en-US')).toBe(names.en);
  });

  it.each(['Rhl', 'C4-HSL', '3OC6', 'Kylilis', '10.1038/s41467-018-05046-2'])(
    'finds catalog entries for %s',
    (query) => {
      expect(queryBfnCatalogDiscovery(model, { query }).componentCount).toBeGreaterThan(0);
    },
  );

  it.each([
    'AAA063 genomic CepI sender',
    'C8-HSL',
    'Aafke C. A. van Aalst',
    'Engineering N-acyl-homoserine lactone-based quorum-sensing circuit',
    '10.1038/s42003-025-09163-9',
    'Saccharomyces cerevisiae',
    'enzyme kinetics',
  ])('finds Sender V1.2 evidence through %s', (query) => {
    const result = queryBfnCatalogDiscovery(model, { query });
    expect(result.senderEvidenceCount).toBeGreaterThan(0);
    expect(result.groups.some((group) => group.role === 'sender')).toBe(true);
  });

  it.each([
    ['信号响应', 'receiver'],
    ['Signal response', 'receiver'],
    ['信号产生', 'sender'],
    ['Signal production', 'sender'],
    ['AHL 合成系统', 'sender'],
  ] as const)('finds %s through family names as a low-priority search field', (query, role) => {
    const result = queryBfnCatalogDiscovery(model, { query });
    expect(result.componentCount).toBeGreaterThan(0);
    expect(result.groups.every((group) => group.role === role)).toBe(true);
  });

  it('normalizes case and whitespace and applies multi-token AND semantics', () => {
    const canonical = queryBfnCatalogDiscovery(model, { query: 'rhl c4' });
    const normalized = queryBfnCatalogDiscovery(model, { query: '  RHL   C4  ' });
    expect(normalized.groups.map((group) => group.id)).toEqual(
      canonical.groups.map((group) => group.id),
    );
    expect(normalized.responseCount).toBe(canonical.responseCount);
    expect(canonical.componentCount).toBeGreaterThan(0);
    expect(
      canonical.groups.every(
        (group) =>
          group.names.en.toLocaleLowerCase().includes('rhl') ||
          group.aliases.some((alias) => alias.toLocaleLowerCase().includes('rhl')),
      ),
    ).toBe(true);
    expect(
      canonical.groups
        .flatMap((group) => group.responses)
        .every((response) =>
          [response.inputSignalCanonicalName, ...response.inputSignalAbbreviations].some((name) =>
            name.toLocaleLowerCase().includes('c4'),
          ),
        ),
    ).toBe(true);
  });

  it('ranks a component-name match before a source-only match and preserves stable ties', () => {
    const [first, second, third] = model.groups.slice(0, 3);
    if (!first || !second || !third) throw new Error('Discovery fixture requires three groups.');
    const sourceOnly = {
      ...first,
      search: {
        componentNames: [],
        componentMetadata: [],
        signals: [],
        hosts: [],
        sources: ['needle'],
        semanticTerms: [],
      },
    };
    const nameMatch = {
      ...second,
      search: {
        componentNames: ['Needle receiver'],
        componentMetadata: [],
        signals: [],
        hosts: [],
        sources: [],
        semanticTerms: [],
      },
    };
    const stableNameMatch = {
      ...third,
      search: {
        componentNames: ['Needle secondary receiver'],
        componentMetadata: [],
        signals: [],
        hosts: [],
        sources: [],
        semanticTerms: [],
      },
    };
    const synthetic: BfnCatalogDiscoveryModel = {
      ...model,
      groups: [sourceOnly, nameMatch, stableNameMatch],
    };

    expect(
      queryBfnCatalogDiscovery(synthetic, { query: 'needle' }).groups.map((group) => group.id),
    ).toEqual([nameMatch.id, stableNameMatch.id, sourceOnly.id]);
  });

  it('derives and combines status, input-signal, and host filters', () => {
    const runnable = queryBfnCatalogDiscovery(model, { status: 'runnable-demo' });
    expect(runnable.responseCount).toBe(20);
    expect(runnable.groups.every((group) => group.role === 'receiver')).toBe(true);
    expect(
      runnable.groups.flatMap((group) => group.responses).every((response) => response.runnable),
    ).toBe(true);

    const target = runnable.groups.flatMap((group) => group.responses)[0];
    if (!target?.hostSpecies)
      throw new Error('Runnable release response requires a recorded host.');
    const combined = queryBfnCatalogDiscovery(model, {
      status: 'runnable-demo',
      inputSignalId: target.inputSignalId,
      host: target.hostSpecies,
    });
    expect(combined.responseCount).toBeGreaterThan(0);
    expect(
      combined.groups
        .flatMap((group) => group.responses)
        .every(
          (response) =>
            response.runnable &&
            response.inputSignalId === target.inputSignalId &&
            response.hostSpecies === target.hostSpecies,
        ),
    ).toBe(true);
    expect(
      model.filterOptions.inputSignals.some((signal) => signal.id === target.inputSignalId),
    ).toBe(true);
    expect(model.filterOptions.hosts).toContain(target.hostSpecies);
  });

  it('combines the component-level function filter with signal, status, and host filters', () => {
    const signalResponse = queryBfnCatalogDiscovery(model, {
      functionalFamilyId: 'functional.signal_response',
    });
    expect(signalResponse.componentCount).toBeGreaterThan(0);
    expect(signalResponse.groups.every((group) => group.role === 'receiver')).toBe(true);

    const signalProduction = queryBfnCatalogDiscovery(model, {
      functionalFamilyId: 'functional.signal_production',
    });
    expect(signalProduction.componentCount).toBeGreaterThan(0);
    expect(signalProduction.groups.every((group) => group.role === 'sender')).toBe(true);
    expect(signalProduction.responseCount).toBe(0);

    const target = signalResponse.groups
      .flatMap((group) => group.responses)
      .find((response) => response.runnable && response.hostSpecies !== null);
    if (!target?.hostSpecies) throw new Error('Runnable semantic filter fixture is missing.');
    const combined = queryBfnCatalogDiscovery(model, {
      functionalFamilyId: 'functional.signal_response',
      status: 'runnable-demo',
      inputSignalId: target.inputSignalId,
      host: target.hostSpecies,
    });
    expect(combined.responseCount).toBeGreaterThan(0);
    expect(
      combined.groups.every(
        (group) =>
          group.semantic?.functionalFamilyId === 'functional.signal_response' &&
          group.responses.every(
            (response) =>
              response.runnable &&
              response.inputSignalId === target.inputSignalId &&
              response.hostSpecies === target.hostSpecies,
          ),
      ),
    ).toBe(true);

    expect(
      queryBfnCatalogDiscovery(model, {
        functionalFamilyId: 'functional.signal_production',
        inputSignalId: target.inputSignalId,
      }),
    ).toMatchObject({ componentCount: 0, responseCount: 0 });
  });

  it('keeps component grouping while pruning response rows for a signal', () => {
    const group = model.groups.find((candidate) => candidate.responses.length > 1);
    const response = group?.responses[0];
    if (!group || !response) throw new Error('Release requires a multi-response component.');

    const bySignal = queryBfnCatalogDiscovery(model, { inputSignalId: response.inputSignalId });
    const filteredGroup = bySignal.groups.find((candidate) => candidate.id === group.id);
    expect(filteredGroup).toBeDefined();
    expect(
      filteredGroup?.responses.every((entry) => entry.inputSignalId === response.inputSignalId),
    ).toBe(true);

    const byComponent = queryBfnCatalogDiscovery(model, { query: group.names.en });
    expect(
      byComponent.groups.find((candidate) => candidate.id === group.id)?.responses,
    ).toHaveLength(group.responses.length);
  });

  it('does not mutate the trusted presentation while searching and filtering', () => {
    const before = JSON.stringify(presentation);
    queryBfnCatalogDiscovery(model, {
      query: 'Rhl C4',
      status: 'needs-calibration',
      inputSignalId: model.filterOptions.inputSignals[0]?.id ?? 'all',
      host: model.filterOptions.hosts[0] ?? 'all',
    });
    expect(JSON.stringify(presentation)).toBe(before);
    expect(Object.isFrozen(presentation)).toBe(true);
  });
});
