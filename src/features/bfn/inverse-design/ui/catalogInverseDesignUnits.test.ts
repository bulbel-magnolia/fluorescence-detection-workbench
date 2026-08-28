import { describe, expect, it } from 'vitest';
import {
  chooseReadableConcentrationUnit,
  formatConcentration,
  formatConcentrationValue,
  fromM,
  toM,
  type BfnCatalogInverseConcentrationUnit,
} from './catalogInverseDesignUnits';

describe('catalog inverse design concentration units', () => {
  it.each([
    ['pM', 1e-12],
    ['nM', 1e-9],
    ['µM', 1e-6],
    ['mM', 1e-3],
    ['M', 1],
  ] as const)('converts %s through the scientific M boundary', (unit, factor) => {
    expect(toM(2.5, unit)).toBeCloseTo(2.5 * factor, 18);
    expect(fromM(2.5 * factor, unit)).toBeCloseTo(2.5, 12);
  });

  it('chooses a readable unit from the median finite positive EC50', () => {
    expect(chooseReadableConcentrationUnit([Number.NaN, 1e-9, 2e-8, 1e-6])).toBe('nM');
    expect(chooseReadableConcentrationUnit([])).toBe('nM');
  });

  it('formats scientific concentrations without exposing raw M values', () => {
    expect(formatConcentration(2e-8, 'nM', 'en-US')).toBe('20 nM');
    expect(formatConcentration(1e-8, 'µM', 'zh-CN')).toBe('0.01 µM');
    expect(formatConcentrationValue(1e-7, 'µM')).toBe('0.1');
  });

  it('keeps every supported unit in a closed typed set', () => {
    const units: readonly BfnCatalogInverseConcentrationUnit[] = ['pM', 'nM', 'µM', 'mM', 'M'];
    expect(units.map((unit) => toM(1, unit))).toEqual([1e-12, 1e-9, 1e-6, 1e-3, 1]);
  });
});
