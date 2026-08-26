import {
  bfnEntityLabel,
  bfnPortPrimaryLabel,
  bfnQuantityLabel,
  bfnUnitLabel,
  type BfnLabelTranslate,
} from './presentation';
import type { BfnPort, BfnQuantityType, BfnSimulationResult, BfnUnit } from './types';

export interface BfnResolvedResultSignal {
  id: string;
  label: string;
  unitLabel: string;
  axisLabel: string;
  entityLabel: string | null;
  quantityLabel: string | null;
  labelKey: string | null;
  semantic: {
    entity: string;
    quantityType: BfnQuantityType;
    unit: BfnUnit;
  } | null;
  source: 'snapshot' | 'legacy-id';
}

export interface BfnResolvedResultSignals {
  input: BfnResolvedResultSignal;
  output: BfnResolvedResultSignal;
  complete: boolean;
}

function resolvedSnapshotSignal(
  id: string,
  labelKey: string,
  entity: string,
  quantityType: BfnQuantityType,
  unit: BfnUnit,
  direction: BfnPort['direction'],
  translate: BfnLabelTranslate,
): BfnResolvedResultSignal {
  const port: BfnPort = {
    id: id + '-snapshot-port',
    entity,
    quantityType,
    unit,
    direction,
  };
  const label = bfnPortPrimaryLabel(port, translate);
  const unitLabel = bfnUnitLabel(unit, translate);
  return {
    id,
    label,
    unitLabel,
    axisLabel: `${label} (${unitLabel})`,
    entityLabel: bfnEntityLabel(entity, translate),
    quantityLabel: bfnQuantityLabel(quantityType, translate),
    labelKey,
    semantic: { entity, quantityType, unit },
    source: 'snapshot',
  };
}

function resolvedLegacySignal(
  id: string,
  kind: 'input' | 'output',
  translate: BfnLabelTranslate,
): BfnResolvedResultSignal {
  const role = translate(
    kind === 'input' ? 'bfn.results.signals.unknownInput' : 'bfn.results.signals.unknownOutput',
  );
  const unitLabel = translate('bfn.results.signals.unknownUnit');
  const label = `${role} · ${id}`;
  return {
    id,
    label,
    unitLabel,
    axisLabel: `${label} (${unitLabel})`,
    entityLabel: null,
    quantityLabel: null,
    labelKey: null,
    semantic: null,
    source: 'legacy-id',
  };
}

/**
 * Resolve result-owned signal semantics without consulting the current project.
 * Legacy runs remain identifiable while their unrecorded labels and units stay explicit.
 */
export function resolveBfnResultSignals(
  result: BfnSimulationResult,
  translate: BfnLabelTranslate,
): BfnResolvedResultSignals {
  const snapshot = result.signalSnapshot;
  if (!snapshot) {
    return {
      input: resolvedLegacySignal(result.primaryInputSourceId, 'input', translate),
      output: resolvedLegacySignal(result.outputMonitorId, 'output', translate),
      complete: false,
    };
  }
  return {
    input: resolvedSnapshotSignal(
      snapshot.primaryInput.sourceId,
      snapshot.primaryInput.labelKey,
      snapshot.primaryInput.entity,
      snapshot.primaryInput.quantityType,
      snapshot.primaryInput.unit,
      'output',
      translate,
    ),
    output: resolvedSnapshotSignal(
      snapshot.output.monitorId,
      snapshot.output.labelKey,
      snapshot.output.entity,
      snapshot.output.quantityType,
      snapshot.output.unit,
      'input',
      translate,
    ),
    complete: true,
  };
}
