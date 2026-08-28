import type { BfnCatalogInverseTarget } from '../catalogInverseDesignTypes';
import {
  formatConcentrationValue,
  toM,
  type BfnCatalogInverseConcentrationUnit,
} from './catalogInverseDesignUnits';

export interface BfnCatalogInverseTargetDraft {
  inputSignalId: string | null;
  concentrationUnit: BfnCatalogInverseConcentrationUnit;
  lowConcentration: string;
  lowResponseMaximum: string;
  highConcentration: string;
  highResponseMinimum: string;
  ec50Enabled: boolean;
  ec50Minimum: string;
  ec50Maximum: string;
  hillEnabled: boolean;
  hillMinimum: string;
  hillMaximum: string;
  biologicalDirection: BfnCatalogInverseTarget['biologicalDirection'];
  hostSpecies: string | null;
  hostStrain: string | null;
}

export function createInitialCatalogInverseTargetDraft(): BfnCatalogInverseTargetDraft {
  return {
    inputSignalId: null,
    concentrationUnit: 'nM',
    lowConcentration: '',
    lowResponseMaximum: '0.20',
    highConcentration: '',
    highResponseMinimum: '0.80',
    ec50Enabled: false,
    ec50Minimum: '',
    ec50Maximum: '',
    hillEnabled: false,
    hillMinimum: '',
    hillMaximum: '',
    biologicalDirection: 'any',
    hostSpecies: null,
    hostStrain: null,
  };
}

export function changeCatalogInverseDraftSignal(
  draft: BfnCatalogInverseTargetDraft,
  inputSignalId: string | null,
  concentrationUnit: BfnCatalogInverseConcentrationUnit,
): BfnCatalogInverseTargetDraft {
  return {
    ...draft,
    inputSignalId,
    concentrationUnit,
    lowConcentration: '',
    highConcentration: '',
    ec50Enabled: false,
    ec50Minimum: '',
    ec50Maximum: '',
    hostSpecies: null,
    hostStrain: null,
  };
}

export function changeCatalogInverseDraftUnit(
  draft: BfnCatalogInverseTargetDraft,
  unit: BfnCatalogInverseConcentrationUnit,
): BfnCatalogInverseTargetDraft {
  if (draft.concentrationUnit === unit) return draft;

  const convert = (value: string): string => {
    const parsed = parseDraftNumber(value);
    return parsed === null
      ? value.trim().length === 0
        ? ''
        : value
      : formatConcentrationValue(toM(parsed, draft.concentrationUnit), unit);
  };

  return {
    ...draft,
    concentrationUnit: unit,
    lowConcentration: convert(draft.lowConcentration),
    highConcentration: convert(draft.highConcentration),
    ec50Minimum: convert(draft.ec50Minimum),
    ec50Maximum: convert(draft.ec50Maximum),
  };
}

export function buildCatalogInverseTargetFromDraft(
  draft: BfnCatalogInverseTargetDraft,
): BfnCatalogInverseTarget | null {
  const lowConcentration = parseDraftNumber(draft.lowConcentration);
  const lowResponseMaximum = parseDraftNumber(draft.lowResponseMaximum);
  const highConcentration = parseDraftNumber(draft.highConcentration);
  const highResponseMinimum = parseDraftNumber(draft.highResponseMinimum);
  if (
    draft.inputSignalId === null ||
    lowConcentration === null ||
    lowResponseMaximum === null ||
    highConcentration === null ||
    highResponseMinimum === null
  )
    return null;

  const ec50Minimum = draft.ec50Enabled ? parseDraftNumber(draft.ec50Minimum) : null;
  const ec50Maximum = draft.ec50Enabled ? parseDraftNumber(draft.ec50Maximum) : null;
  if (draft.ec50Enabled && (ec50Minimum === null || ec50Maximum === null)) return null;

  const hillMinimum = draft.hillEnabled ? parseDraftNumber(draft.hillMinimum) : null;
  const hillMaximum = draft.hillEnabled ? parseDraftNumber(draft.hillMaximum) : null;
  if (draft.hillEnabled && (hillMinimum === null || hillMaximum === null)) return null;

  const contextFilter =
    draft.hostSpecies === null && draft.hostStrain === null
      ? undefined
      : {
          ...(draft.hostSpecies === null ? {} : { hostSpecies: draft.hostSpecies }),
          ...(draft.hostStrain === null ? {} : { hostStrain: draft.hostStrain }),
        };

  return {
    inputSignalId: draft.inputSignalId,
    responseWindow: {
      lowConcentrationM: toM(lowConcentration, draft.concentrationUnit),
      lowResponseMaximum,
      highConcentrationM: toM(highConcentration, draft.concentrationUnit),
      highResponseMinimum,
    },
    ...(ec50Minimum === null || ec50Maximum === null
      ? {}
      : {
          ec50RangeM: {
            minimum: toM(ec50Minimum, draft.concentrationUnit),
            maximum: toM(ec50Maximum, draft.concentrationUnit),
          },
        }),
    ...(hillMinimum === null || hillMaximum === null
      ? {}
      : { hillCoefficientRange: { minimum: hillMinimum, maximum: hillMaximum } }),
    biologicalDirection: draft.biologicalDirection,
    ...(contextFilter === undefined ? {} : { contextFilter }),
  };
}

export function catalogInverseScientificTargetsEqual(
  left: BfnCatalogInverseTarget | null,
  right: BfnCatalogInverseTarget | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.inputSignalId === right.inputSignalId &&
    approximatelyEqual(left.responseWindow.lowConcentrationM, right.responseWindow.lowConcentrationM) &&
    approximatelyEqual(left.responseWindow.lowResponseMaximum, right.responseWindow.lowResponseMaximum) &&
    approximatelyEqual(left.responseWindow.highConcentrationM, right.responseWindow.highConcentrationM) &&
    approximatelyEqual(left.responseWindow.highResponseMinimum, right.responseWindow.highResponseMinimum) &&
    optionalRangeEqual(left.ec50RangeM, right.ec50RangeM) &&
    optionalRangeEqual(left.hillCoefficientRange, right.hillCoefficientRange) &&
    left.biologicalDirection === right.biologicalDirection &&
    (left.contextFilter?.hostSpecies ?? null) === (right.contextFilter?.hostSpecies ?? null) &&
    (left.contextFilter?.hostStrain ?? null) === (right.contextFilter?.hostStrain ?? null)
  );
}

function parseDraftNumber(value: string): number | null {
  if (value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function approximatelyEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * 16 * scale;
}

function optionalRangeEqual(
  left: { minimum: number; maximum: number } | undefined,
  right: { minimum: number; maximum: number } | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return approximatelyEqual(left.minimum, right.minimum) && approximatelyEqual(left.maximum, right.maximum);
}
