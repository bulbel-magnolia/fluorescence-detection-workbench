import type { BfnQuantityType, BfnUnit } from '../../types';

export const SIGNAL_POOL_CONCENTRATION_UNITS = Object.freeze(['nM', 'uM'] as const);

export type SignalPoolConcentrationUnit = (typeof SIGNAL_POOL_CONCENTRATION_UNITS)[number];
export type SignalPoolProductionRateUnit = 'nM/h' | 'uM/h';
export type SignalPoolSignalMode = '' | 'known' | 'existing' | 'custom';

export interface SignalPoolAuthoringState {
  readonly name: string;
  readonly description: string;
  readonly signalMode: string;
  readonly knownCatalogSignalId: string;
  readonly existingEntityId: string;
  readonly customSignalName: string;
  readonly concentrationUnit: string;
  readonly initialConcentration: string;
}

export type SignalPoolSignalDraft =
  | {
      readonly source: 'known';
      readonly catalogSignalId: string;
      readonly entityId: string;
      readonly displayName: string;
    }
  | {
      readonly source: 'existing';
      readonly entityId: string;
      readonly displayName: string;
    }
  | {
      readonly source: 'custom';
      readonly entityId: string;
      readonly displayName: string;
    };

export interface SignalPoolPortDraft {
  readonly id: string;
  readonly entityId: string;
  readonly quantityType: Extract<BfnQuantityType, 'production_rate' | 'concentration'>;
  readonly unit: Extract<BfnUnit, 'nM/h' | 'uM/h' | 'nM' | 'uM'>;
  readonly direction: 'input' | 'output';
}

export interface SignalPoolDraft {
  readonly id: string;
  readonly origin: 'user_defined';
  readonly name: string;
  readonly description: string | null;
  readonly signal: SignalPoolSignalDraft;
  readonly inputPort: SignalPoolPortDraft & {
    readonly quantityType: 'production_rate';
    readonly unit: SignalPoolProductionRateUnit;
    readonly direction: 'input';
  };
  readonly outputPort: SignalPoolPortDraft & {
    readonly quantityType: 'concentration';
    readonly unit: SignalPoolConcentrationUnit;
    readonly direction: 'output';
  };
  readonly initialConcentration: number;
}

export function createInitialSignalPoolAuthoringState(): SignalPoolAuthoringState {
  return {
    name: '',
    description: '',
    signalMode: '',
    knownCatalogSignalId: '',
    existingEntityId: '',
    customSignalName: '',
    concentrationUnit: 'nM',
    initialConcentration: '0',
  };
}

export function isSignalPoolConcentrationUnit(value: string): value is SignalPoolConcentrationUnit {
  return SIGNAL_POOL_CONCENTRATION_UNITS.some((candidate) => candidate === value);
}

export function signalPoolUnitPair(unit: SignalPoolConcentrationUnit): {
  readonly concentration: SignalPoolConcentrationUnit;
  readonly productionRate: SignalPoolProductionRateUnit;
} {
  return {
    concentration: unit,
    productionRate: unit === 'nM' ? 'nM/h' : 'uM/h',
  };
}
