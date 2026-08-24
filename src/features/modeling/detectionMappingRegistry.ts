import type { HistoryRecord } from '../../domain/types';
import {
  createNetworkValidationReference,
  createReverseDesignTarget,
  type DetectionModelingReference,
  type DetectionModelingResult,
  type DetectionTargetMapping,
} from './detectionModeling';

/**
 * This profile exists only so the bundled development data can demonstrate
 * the record-to-target workflow. It is not an experimental calibration and
 * must never be offered to records produced by another algorithm version.
 */
export const DEMO_QUALITY_TARGET_MAPPING = Object.freeze<DetectionTargetMapping>({
  id: 'development-fixture.quality-score.normalized',
  version: '1.0.0',
  metric: { kind: 'quality-score' },
  sourceUnit: 'score',
  inputRange: [0, 100] as const,
  status: 'normalized-demo',
  algorithmVersion: 'ANALYSIS-DEMO-0.1',
  calibrationVersion: 'CAL-DEMO-0.1',
  sourceReference: 'Bundled development fixture; linear normalization of the demo quality score.',
});

export interface DetectionMappingOption {
  mapping: DetectionTargetMapping;
  result: DetectionModelingResult;
}

function isBundledDemoRecord(record: HistoryRecord): boolean {
  return (
    record.isDemo &&
    record.result.resultStatus !== 'ERROR' &&
    record.result.resultStatus !== 'RAW_ONLY' &&
    record.result.algorithmVersion === DEMO_QUALITY_TARGET_MAPPING.algorithmVersion &&
    record.result.calibrationVersion === DEMO_QUALITY_TARGET_MAPPING.calibrationVersion
  );
}

export function reverseTargetOptions(record: HistoryRecord): DetectionMappingOption[] {
  if (!isBundledDemoRecord(record)) return [];
  return [
    {
      mapping: DEMO_QUALITY_TARGET_MAPPING,
      result: createReverseDesignTarget(record, DEMO_QUALITY_TARGET_MAPPING),
    },
  ];
}

export function networkValidationOptions(
  record: HistoryRecord,
  networkId: string,
): DetectionMappingOption[] {
  if (!isBundledDemoRecord(record)) return [];
  return [
    {
      mapping: DEMO_QUALITY_TARGET_MAPPING,
      result: createNetworkValidationReference(record, DEMO_QUALITY_TARGET_MAPPING, networkId),
    },
  ];
}

export function firstUsableReference(
  options: readonly DetectionMappingOption[],
): DetectionModelingReference | null {
  return (
    options.find(
      (
        option,
      ): option is DetectionMappingOption & {
        result: { ok: true; value: DetectionModelingReference };
      } => option.result.ok,
    )?.result.value ?? null
  );
}
