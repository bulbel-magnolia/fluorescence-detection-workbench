import { describe, expect, it } from 'vitest';
import {
  createDefaultCatalogInverseTarget,
  type BfnCatalogInverseTarget,
  type BfnCatalogInverseValidationContext,
  type BfnCatalogInverseValidationIssueCode,
} from './catalogInverseDesignTypes';
import { validateCatalogInverseTarget } from './catalogInverseDesignValidation';

const SIGNAL_ID = 'ahl.3oc6.l';
const STEREO_UNSPECIFIED_SIGNAL_ID = 'ahl.3oc6.stereo-unspecified';
const DISPLAY_LABEL = '3OC6-HSL (L)';

const context: BfnCatalogInverseValidationContext = {
  searchableSignals: [{ signalId: SIGNAL_ID, responseCount: 3 }],
  contextOptions: [
    {
      signalId: SIGNAL_ID,
      hostSpecies: 'Escherichia coli',
      hostStrain: 'K-12',
      candidateCount: 2,
    },
    {
      signalId: SIGNAL_ID,
      hostSpecies: 'Escherichia coli',
      hostStrain: null,
      candidateCount: 1,
    },
    {
      signalId: SIGNAL_ID,
      hostSpecies: null,
      hostStrain: null,
      candidateCount: 1,
    },
    {
      signalId: STEREO_UNSPECIFIED_SIGNAL_ID,
      hostSpecies: 'Escherichia coli',
      hostStrain: 'K-12',
      candidateCount: 4,
    },
  ],
};

function validTarget(overrides: Partial<BfnCatalogInverseTarget> = {}): BfnCatalogInverseTarget {
  return {
    inputSignalId: SIGNAL_ID,
    responseWindow: {
      lowConcentrationM: 1e-9,
      lowResponseMaximum: 0.2,
      highConcentrationM: 1e-7,
      highResponseMinimum: 0.8,
    },
    biologicalDirection: 'any',
    ...overrides,
  };
}

function expectError(target: unknown, code: BfnCatalogInverseValidationIssueCode): void {
  const result = validateCatalogInverseTarget(target, context);
  expect(result.valid).toBe(false);
  expect(result.target).toBeNull();
  expect(result.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ code, severity: 'error' })]),
  );
}

describe('catalog inverse target validation', () => {
  it('creates a target with only the explicitly supplied concentrations', () => {
    const target = createDefaultCatalogInverseTarget(SIGNAL_ID, 2e-9, 5e-8);

    expect(target).toEqual({
      inputSignalId: SIGNAL_ID,
      responseWindow: {
        lowConcentrationM: 2e-9,
        lowResponseMaximum: 0.2,
        highConcentrationM: 5e-8,
        highResponseMinimum: 0.8,
      },
      biologicalDirection: 'any',
    });
    expect(target.responseWindow.lowConcentrationM).not.toBe(1e-9);
    expect(target.responseWindow.highConcentrationM).not.toBe(1e-7);
    expect(target).not.toHaveProperty('ec50RangeM');
    expect(target).not.toHaveProperty('hillCoefficientRange');
    expect(target).not.toHaveProperty('contextFilter');
  });

  it('accepts a complete target and returns an independent validated snapshot', () => {
    const target = validTarget({
      ec50RangeM: { minimum: 2e-9, maximum: 4e-7 },
      hillCoefficientRange: { minimum: 0.5, maximum: 3 },
      biologicalDirection: 'activation',
      contextFilter: { hostSpecies: 'Escherichia coli', hostStrain: 'K-12' },
    });

    const result = validateCatalogInverseTarget(target, context);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error('expected a valid target');
    expect(result.target).toEqual(target);
    expect(result.target).not.toBe(target);
    expect(result.target.responseWindow).not.toBe(target.responseWindow);
    expect(result.target.ec50RangeM).not.toBe(target.ec50RangeM);
    expect(result.target.hillCoefficientRange).not.toBe(target.hillCoefficientRange);
    expect(result.target.contextFilter).not.toBe(target.contextFilter);
    expect(result.issues).toEqual([]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid low concentration %s',
    (lowConcentrationM) => {
      expectError(
        validTarget({
          responseWindow: {
            ...validTarget().responseWindow,
            lowConcentrationM,
          },
        }),
        'low-concentration-invalid',
      );
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid high concentration %s',
    (highConcentrationM) => {
      expectError(
        validTarget({
          responseWindow: {
            ...validTarget().responseWindow,
            highConcentrationM,
          },
        }),
        'high-concentration-invalid',
      );
    },
  );

  it.each([1e-7, 1e-8])(
    'rejects a high concentration %s that does not exceed the low concentration',
    (highConcentrationM) => {
      const target = validTarget({
        responseWindow: {
          lowConcentrationM: 1e-7,
          lowResponseMaximum: 0.2,
          highConcentrationM,
          highResponseMinimum: 0.8,
        },
      });

      expectError(target, 'concentration-order-invalid');
    },
  );

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid low response threshold %s',
    (lowResponseMaximum) => {
      expectError(
        validTarget({
          responseWindow: {
            ...validTarget().responseWindow,
            lowResponseMaximum,
          },
        }),
        'low-response-invalid',
      );
    },
  );

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid high response threshold %s',
    (highResponseMinimum) => {
      expectError(
        validTarget({
          responseWindow: {
            ...validTarget().responseWindow,
            highResponseMinimum,
          },
        }),
        'high-response-invalid',
      );
    },
  );

  it.each([
    { minimum: 0, maximum: 1 },
    { minimum: -1, maximum: 1 },
    { minimum: Number.NaN, maximum: 1 },
    { minimum: 1, maximum: Number.POSITIVE_INFINITY },
    { minimum: 2, maximum: 1 },
  ])('rejects invalid EC50 ranges %#', (ec50RangeM) => {
    expectError(validTarget({ ec50RangeM }), 'ec50-range-invalid');
  });

  it.each([
    { minimum: 0, maximum: 1 },
    { minimum: -1, maximum: 1 },
    { minimum: Number.NaN, maximum: 1 },
    { minimum: 1, maximum: Number.POSITIVE_INFINITY },
    { minimum: 2, maximum: 1 },
  ])('rejects invalid Hill coefficient ranges %#', (hillCoefficientRange) => {
    expectError(validTarget({ hillCoefficientRange }), 'hill-range-invalid');
  });

  it('allows equal EC50 and Hill range endpoints', () => {
    const target = validTarget({
      ec50RangeM: { minimum: 1e-8, maximum: 1e-8 },
      hillCoefficientRange: { minimum: 1, maximum: 1 },
    });

    const result = validateCatalogInverseTarget(target, context);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects directions outside the exact vocabulary', () => {
    expectError(validTarget({ biologicalDirection: 'inhibition' as 'any' }), 'direction-invalid');
  });

  it.each([0.8, 0.9])(
    'reports low response maximum %s as weak separation while keeping the target valid',
    (lowResponseMaximum) => {
      const target = validTarget({
        responseWindow: {
          lowConcentrationM: 1e-9,
          lowResponseMaximum,
          highConcentrationM: 1e-7,
          highResponseMinimum: 0.8,
        },
      });

      const result = validateCatalogInverseTarget(target, context);

      expect(result.valid).toBe(true);
      expect(result.target).toEqual(target);
      expect(result.issues).toEqual([
        expect.objectContaining({ code: 'weak-response-separation', severity: 'warning' }),
      ]);
    },
  );

  it('requires an exact searchable signal ID, not a display label, case variant, or stereo merge', () => {
    expect(validateCatalogInverseTarget(validTarget(), context).valid).toBe(true);
    expectError(validTarget({ inputSignalId: DISPLAY_LABEL }), 'signal-not-searchable');
    expectError(validTarget({ inputSignalId: SIGNAL_ID.toUpperCase() }), 'signal-not-searchable');
    expectError(
      validTarget({ inputSignalId: STEREO_UNSPECIFIED_SIGNAL_ID }),
      'signal-not-searchable',
    );
    expectError(validTarget({ inputSignalId: '   ' }), 'missing-signal');
  });

  it('requires exact host and strain combinations for the exact signal', () => {
    const exact = validateCatalogInverseTarget(
      validTarget({ contextFilter: { hostSpecies: 'Escherichia coli', hostStrain: 'K-12' } }),
      context,
    );
    expect(exact.valid).toBe(true);

    const speciesOnly = validateCatalogInverseTarget(
      validTarget({ contextFilter: { hostSpecies: 'Escherichia coli' } }),
      context,
    );
    expect(speciesOnly.valid).toBe(true);

    const unrestrictedContext = validateCatalogInverseTarget(
      validTarget({ contextFilter: {} }),
      context,
    );
    expect(unrestrictedContext.valid).toBe(true);

    expectError(
      {
        ...validTarget(),
        contextFilter: { hostSpecies: null, hostStrain: null },
      },
      'host-strain-invalid-combination',
    );

    expectError(
      validTarget({ contextFilter: { hostSpecies: 'Escherichia coli', hostStrain: 'DH5α' } }),
      'host-strain-invalid-combination',
    );
    expectError(
      validTarget({ contextFilter: { hostSpecies: 'Bacillus subtilis' } }),
      'host-strain-invalid-combination',
    );
  });
});
