import type { ChannelId, HistoryRecord } from '../../domain/types';

export type DetectionModelingMetric =
  | { kind: 'quality-score' }
  | { kind: 'corrected-signal'; channelId: ChannelId }
  | { kind: 'concentration'; channelId: ChannelId };

export type DetectionMappingStatus = 'team-calibrated' | 'literature-context' | 'normalized-demo';

export interface DetectionTargetMapping {
  id: string;
  version: string;
  metric: DetectionModelingMetric;
  sourceUnit: string;
  inputRange: readonly [number, number];
  status: DetectionMappingStatus;
  algorithmVersion?: string;
  calibrationVersion?: string;
  sourceReference: string;
}

export interface DetectionMetricReading {
  metric: DetectionModelingMetric;
  value: number;
  unit: string;
  algorithmVersion: string;
  calibrationVersion: string;
  usesDemoCalibration: boolean;
}

interface DetectionModelingReferenceFields {
  recordId: string;
  sampleId: string;
  recordCreatedAt: string;
  origin: HistoryRecord['origin'];
  resultStatus: HistoryRecord['resultStatus'];
  metric: DetectionModelingMetric;
  measuredValue: number;
  measuredUnit: string;
  normalizedValue: number;
  mappingId: string;
  mappingVersion: string;
  mappingStatus: DetectionMappingStatus;
  mappingSourceReference: string;
  isDemo: boolean;
}

export type ReverseTargetModelingReference = DetectionModelingReferenceFields & {
  mode: 'reverse-target';
  networkId?: never;
};

export type NetworkValidationModelingReference = DetectionModelingReferenceFields & {
  mode: 'network-validation';
  networkId: string;
};

export type DetectionModelingReference =
  ReverseTargetModelingReference | NetworkValidationModelingReference;

export type DetectionMappingIssue =
  | 'unsupported-result'
  | 'metric-unavailable'
  | 'invalid-mapping-range'
  | 'mapping-metric-mismatch'
  | 'unit-mismatch'
  | 'algorithm-version-mismatch'
  | 'calibration-version-mismatch'
  | 'outside-mapping-range'
  | 'network-id-required';

export type DetectionModelingResult =
  { ok: true; value: DetectionModelingReference } | { ok: false; issue: DetectionMappingIssue };

function sameMetric(left: DetectionModelingMetric, right: DetectionModelingMetric): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'quality-score' && right.kind === 'quality-score') return true;
  return 'channelId' in left && 'channelId' in right && left.channelId === right.channelId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDetectionModelingMetric(value: unknown): value is DetectionModelingMetric {
  if (!isRecord(value)) return false;
  if (value.kind === 'quality-score') return value.channelId === undefined;
  return (
    (value.kind === 'corrected-signal' || value.kind === 'concentration') &&
    (value.channelId === 'channel1' ||
      value.channelId === 'channel2' ||
      value.channelId === 'channel3')
  );
}

export function isDetectionModelingReference(value: unknown): value is DetectionModelingReference {
  if (!isRecord(value)) return false;
  if (value.mode !== 'reverse-target' && value.mode !== 'network-validation') return false;
  if (
    !isNonEmptyString(value.recordId) ||
    !isNonEmptyString(value.sampleId) ||
    !isNonEmptyString(value.recordCreatedAt) ||
    !Number.isFinite(Date.parse(value.recordCreatedAt)) ||
    !['demo-live', 'real-live', 'json-import', 'csv-import'].includes(String(value.origin)) ||
    !['OK', 'PARTIAL'].includes(String(value.resultStatus)) ||
    !isDetectionModelingMetric(value.metric) ||
    typeof value.measuredValue !== 'number' ||
    !Number.isFinite(value.measuredValue) ||
    !isNonEmptyString(value.measuredUnit) ||
    typeof value.normalizedValue !== 'number' ||
    !Number.isFinite(value.normalizedValue) ||
    value.normalizedValue < 0 ||
    value.normalizedValue > 1 ||
    !isNonEmptyString(value.mappingId) ||
    !isNonEmptyString(value.mappingVersion) ||
    !['team-calibrated', 'literature-context', 'normalized-demo'].includes(
      String(value.mappingStatus),
    ) ||
    !isNonEmptyString(value.mappingSourceReference) ||
    typeof value.isDemo !== 'boolean'
  )
    return false;
  return value.mode === 'network-validation'
    ? isNonEmptyString(value.networkId)
    : value.networkId === undefined;
}

export function readDetectionMetric(
  record: HistoryRecord,
  metric: DetectionModelingMetric,
): DetectionMetricReading | null {
  const result = record.result;
  if (result.resultStatus === 'ERROR' || result.resultStatus === 'RAW_ONLY') return null;

  if (metric.kind === 'quality-score') {
    if (result.quality.score === null) return null;
    return {
      metric,
      value: result.quality.score,
      unit: 'score',
      algorithmVersion: result.algorithmVersion,
      calibrationVersion: result.calibrationVersion,
      usesDemoCalibration: result.quality.isDemo,
    };
  }

  const channel = result.channels[metric.channelId];
  if (!channel) return null;
  if (metric.kind === 'corrected-signal') {
    return {
      metric,
      value: channel.summaryCorrectedSignal,
      unit: channel.signalUnit,
      algorithmVersion: result.algorithmVersion,
      calibrationVersion: result.calibrationVersion,
      usesDemoCalibration: channel.calibrationIsDemo,
    };
  }
  if (channel.concentration === null || channel.concentrationStatus !== 'OK') return null;
  return {
    metric,
    value: channel.concentration,
    unit: channel.concentrationUnit,
    algorithmVersion: result.algorithmVersion,
    calibrationVersion: result.calibrationVersion,
    usesDemoCalibration: channel.calibrationIsDemo,
  };
}

function validateMapping(
  reading: DetectionMetricReading,
  mapping: DetectionTargetMapping,
): DetectionMappingIssue | null {
  const [minimum, maximum] = mapping.inputRange;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    return 'invalid-mapping-range';
  }
  if (!sameMetric(reading.metric, mapping.metric)) return 'mapping-metric-mismatch';
  if (reading.unit !== mapping.sourceUnit) return 'unit-mismatch';
  if (
    mapping.algorithmVersion !== undefined &&
    mapping.algorithmVersion !== reading.algorithmVersion
  ) {
    return 'algorithm-version-mismatch';
  }
  if (
    mapping.calibrationVersion !== undefined &&
    mapping.calibrationVersion !== reading.calibrationVersion
  ) {
    return 'calibration-version-mismatch';
  }
  if (reading.value < minimum || reading.value > maximum) return 'outside-mapping-range';
  return null;
}

function createReference(
  mode: DetectionModelingReference['mode'],
  record: HistoryRecord,
  mapping: DetectionTargetMapping,
  networkId?: string,
): DetectionModelingResult {
  if (record.resultStatus === 'ERROR' || record.resultStatus === 'RAW_ONLY') {
    return { ok: false, issue: 'unsupported-result' };
  }
  if (mode === 'network-validation' && !networkId?.trim()) {
    return { ok: false, issue: 'network-id-required' };
  }
  const reading = readDetectionMetric(record, mapping.metric);
  if (!reading) return { ok: false, issue: 'metric-unavailable' };
  const mappingIssue = validateMapping(reading, mapping);
  if (mappingIssue) return { ok: false, issue: mappingIssue };

  const [minimum, maximum] = mapping.inputRange;
  const normalizedValue = (reading.value - minimum) / (maximum - minimum);
  const fields: DetectionModelingReferenceFields = {
    recordId: record.id,
    sampleId: record.sampleId,
    recordCreatedAt: record.createdAt,
    origin: record.origin,
    resultStatus: record.resultStatus,
    metric: mapping.metric,
    measuredValue: reading.value,
    measuredUnit: reading.unit,
    normalizedValue,
    mappingId: mapping.id,
    mappingVersion: mapping.version,
    mappingStatus: mapping.status,
    mappingSourceReference: mapping.sourceReference,
    isDemo: record.isDemo || reading.usesDemoCalibration || mapping.status === 'normalized-demo',
  };
  const value: DetectionModelingReference =
    mode === 'network-validation'
      ? { ...fields, mode, networkId: networkId! }
      : { ...fields, mode };
  return { ok: true, value };
}

export function createReverseDesignTarget(
  record: HistoryRecord,
  mapping: DetectionTargetMapping,
): DetectionModelingResult {
  return createReference('reverse-target', record, mapping);
}

export function createNetworkValidationReference(
  record: HistoryRecord,
  mapping: DetectionTargetMapping,
  networkId: string,
): DetectionModelingResult {
  return createReference('network-validation', record, mapping, networkId);
}
