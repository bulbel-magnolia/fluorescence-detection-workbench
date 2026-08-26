import { describe, expect, it } from 'vitest';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
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

  it('projects the complete frozen release contract without inventing sender responses', () => {
    expect(model.counts).toEqual({
      components: 42,
      responses: 52,
      runnableResponses: 20,
    });
    expect(model.groups).toHaveLength(42);
    expect(model.groups.flatMap((group) => group.responses)).toHaveLength(52);
    expect(queryBfnCatalogDiscovery(model)).toMatchObject({
      componentCount: 42,
      responseCount: 52,
    });
    expect(Object.isFrozen(model)).toBe(true);

    const senders = model.groups.filter((group) => group.role === 'sender');
    expect(senders.length).toBeGreaterThan(0);
    expect(senders.every((sender) => sender.responses.length === 0)).toBe(true);
    expect(senders.every((sender) => sender.status !== 'runnable-demo')).toBe(true);
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
