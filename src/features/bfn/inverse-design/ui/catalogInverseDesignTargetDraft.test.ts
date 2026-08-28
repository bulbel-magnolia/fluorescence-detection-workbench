import { describe, expect, it } from 'vitest';
import {
  buildCatalogInverseTargetFromDraft,
  catalogInverseScientificTargetsEqual,
  changeCatalogInverseDraftSignal,
  changeCatalogInverseDraftUnit,
  createInitialCatalogInverseTargetDraft,
  type BfnCatalogInverseTargetDraft,
} from './catalogInverseDesignTargetDraft';

function populatedDraft(): BfnCatalogInverseTargetDraft {
  return {
    ...createInitialCatalogInverseTargetDraft(),
    inputSignalId: 'ahl.3oc6.l',
    concentrationUnit: 'nM',
    lowConcentration: '10',
    highConcentration: '100',
    lowResponseMaximum: '0.20',
    highResponseMinimum: '0.80',
    ec50Enabled: true,
    ec50Minimum: '20',
    ec50Maximum: '40',
    hillEnabled: true,
    hillMinimum: '1.5',
    hillMaximum: '3',
    biologicalDirection: 'derepression',
    hostSpecies: 'Escherichia coli',
    hostStrain: 'TOP10',
  };
}

describe('catalog inverse design target draft', () => {
  it('starts without a recommended signal or invented concentration', () => {
    expect(createInitialCatalogInverseTargetDraft()).toMatchObject({
      inputSignalId: null,
      lowConcentration: '',
      highConcentration: '',
      lowResponseMaximum: '0.20',
      highResponseMinimum: '0.80',
      ec50Enabled: false,
      hillEnabled: false,
      biologicalDirection: 'any',
      hostSpecies: null,
      hostStrain: null,
    });
  });

  it('clears signal-dependent values while preserving response, Hill, and mechanism targets', () => {
    const changed = changeCatalogInverseDraftSignal(populatedDraft(), 'ahl.c4.dl', 'µM');

    expect(changed).toMatchObject({
      inputSignalId: 'ahl.c4.dl',
      concentrationUnit: 'µM',
      lowConcentration: '',
      highConcentration: '',
      lowResponseMaximum: '0.20',
      highResponseMinimum: '0.80',
      ec50Enabled: false,
      ec50Minimum: '',
      ec50Maximum: '',
      hillEnabled: true,
      hillMinimum: '1.5',
      hillMaximum: '3',
      biologicalDirection: 'derepression',
      hostSpecies: null,
      hostStrain: null,
    });
  });

  it('converts every concentration field without changing the scientific target', () => {
    const draft = populatedDraft();
    const before = buildCatalogInverseTargetFromDraft(draft);
    const converted = changeCatalogInverseDraftUnit(draft, 'µM');
    const after = buildCatalogInverseTargetFromDraft(converted);

    expect(converted).toMatchObject({
      concentrationUnit: 'µM',
      lowConcentration: '0.01',
      highConcentration: '0.1',
      ec50Minimum: '0.02',
      ec50Maximum: '0.04',
    });
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(catalogInverseScientificTargetsEqual(before, after)).toBe(true);
  });

  it('builds optional scientific constraints only when their controls are enabled', () => {
    expect(buildCatalogInverseTargetFromDraft(populatedDraft())).toEqual({
      inputSignalId: 'ahl.3oc6.l',
      responseWindow: {
        lowConcentrationM: 1e-8,
        lowResponseMaximum: 0.2,
        highConcentrationM: 1e-7,
        highResponseMinimum: 0.8,
      },
      ec50RangeM: { minimum: 2e-8, maximum: 4e-8 },
      hillCoefficientRange: { minimum: 1.5, maximum: 3 },
      biologicalDirection: 'derepression',
      contextFilter: { hostSpecies: 'Escherichia coli', hostStrain: 'TOP10' },
    });
  });

  it('builds an exact strain-only context filter without requiring a host', () => {
    const target = buildCatalogInverseTargetFromDraft({
      ...populatedDraft(),
      hostSpecies: null,
      hostStrain: 'TOP10',
    });

    expect(target?.contextFilter).toEqual({ hostStrain: 'TOP10' });
    expect(target?.contextFilter).not.toHaveProperty('hostSpecies');
  });

  it('treats incomplete drafts as unsearchable and scientific changes as stale', () => {
    const target = buildCatalogInverseTargetFromDraft(populatedDraft());
    expect(target).not.toBeNull();
    expect(
      buildCatalogInverseTargetFromDraft({ ...populatedDraft(), highConcentration: '' }),
    ).toBeNull();
    expect(
      catalogInverseScientificTargetsEqual(target, {
        ...target!,
        responseWindow: { ...target!.responseWindow, highConcentrationM: 2e-7 },
      }),
    ).toBe(false);
  });
});
