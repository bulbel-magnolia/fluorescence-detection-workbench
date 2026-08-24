import { describe, expect, it } from 'vitest';
import type { HistoryRecord } from '../../domain/types';
import {
  createNetworkValidationReference,
  createReverseDesignTarget,
  isDetectionModelingReference,
  readDetectionMetric,
  type DetectionTargetMapping,
} from './detectionModeling';

function analyzedRecord(): HistoryRecord {
  return {
    id: 'record-1',
    sampleId: 'sample-1',
    createdAt: '2026-08-03T00:00:00.000Z',
    origin: 'json-import',
    isDemo: false,
    resultStatus: 'OK',
    qualityGrade: 'A',
    syncState: 'local-only',
    result: {
      schemaVersion: 1,
      sessionId: 'session-1',
      sampleId: 'sample-1',
      mode: 'single_channel',
      resultStatus: 'OK',
      channels: {
        channel1: {
          channelId: 'channel1',
          sampleCount: 3,
          summaryMethod: 'development fixture',
          summaryCorrectedSignal: 40,
          signalUnit: 'a.u.',
          concentration: 5,
          concentrationUnit: 'fixture-unit',
          concentrationStatus: 'OK',
          calibrationModel: 'linear',
          calibrationIsDemo: false,
          warnings: [],
          curve: [],
        },
      },
      quality: {
        status: 'OK',
        score: 80,
        grade: 'A',
        suggestion: 'development fixture',
        componentScores: { channel1: 80 },
        isDemo: false,
      },
      protocolVersion: 'fixture-protocol',
      algorithmVersion: 'fixture-algorithm-v1',
      calibrationVersion: 'fixture-calibration-v1',
      isDemo: false,
      disclaimer: 'Development fixture only.',
    },
  };
}

function mapping(overrides: Partial<DetectionTargetMapping> = {}): DetectionTargetMapping {
  return {
    id: 'fixture-quality-mapping',
    version: '1',
    metric: { kind: 'quality-score' },
    sourceUnit: 'score',
    inputRange: [0, 100],
    status: 'team-calibrated',
    algorithmVersion: 'fixture-algorithm-v1',
    calibrationVersion: 'fixture-calibration-v1',
    sourceReference: 'development-fixture',
    ...overrides,
  };
}

describe('detection modeling references', () => {
  it('creates a versioned reverse-design target only through an explicit mapping', () => {
    const result = createReverseDesignTarget(analyzedRecord(), mapping());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Unexpected mapping issue: ${result.issue}`);
    expect(result.value.mode).toBe('reverse-target');
    expect(result.value.normalizedValue).toBe(0.8);
    expect(result.value.measuredValue).toBe(80);
    expect(result.value.mappingId).toBe('fixture-quality-mapping');
    expect(result.value.mappingVersion).toBe('1');
    expect(result.value.isDemo).toBe(false);
  });

  it('does not treat raw hardware frames as a modeling target', () => {
    const record: HistoryRecord = {
      ...analyzedRecord(),
      resultStatus: 'RAW_ONLY',
      qualityGrade: null,
      result: {
        schemaVersion: 1,
        sessionId: 'raw-session',
        sampleId: 'sample-1',
        resultStatus: 'RAW_ONLY',
        frames: [],
        protocolVersion: 'HC08D-ASCII-DRAFT-0.2',
        algorithmVersion: null,
        calibrationVersion: null,
        isDemo: false,
        disclaimer: 'Raw hardware record.',
      },
    };
    expect(createReverseDesignTarget(record, mapping())).toEqual({
      ok: false,
      issue: 'unsupported-result',
    });
  });

  it('rejects unit mismatch and values outside the declared mapping range', () => {
    expect(
      createReverseDesignTarget(
        analyzedRecord(),
        mapping({
          metric: { kind: 'corrected-signal', channelId: 'channel1' },
          sourceUnit: 'RFU',
          inputRange: [0, 100],
        }),
      ),
    ).toEqual({ ok: false, issue: 'unit-mismatch' });
    expect(createReverseDesignTarget(analyzedRecord(), mapping({ inputRange: [0, 50] }))).toEqual({
      ok: false,
      issue: 'outside-mapping-range',
    });
  });

  it('requires an explicit known-network identity for validation', () => {
    expect(createNetworkValidationReference(analyzedRecord(), mapping(), '')).toEqual({
      ok: false,
      issue: 'network-id-required',
    });
    const result = createNetworkValidationReference(analyzedRecord(), mapping(), 'network-1');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Unexpected mapping issue: ${result.issue}`);
    expect(result.value.mode).toBe('network-validation');
    expect(result.value.networkId).toBe('network-1');
  });

  it('strictly validates persisted mode, network, and mapping-version fields', () => {
    const reverse = createReverseDesignTarget(analyzedRecord(), mapping());
    const validation = createNetworkValidationReference(analyzedRecord(), mapping(), 'network-1');
    if (!reverse.ok || !validation.ok) throw new Error('Expected valid reference fixtures.');

    expect(isDetectionModelingReference(reverse.value)).toBe(true);
    expect(isDetectionModelingReference(validation.value)).toBe(true);
    expect(isDetectionModelingReference({ ...reverse.value, mode: 'reference-only' })).toBe(false);
    expect(isDetectionModelingReference({ ...reverse.value, networkId: 'network-1' })).toBe(false);
    const withoutNetworkId: Record<string, unknown> = { ...validation.value };
    delete withoutNetworkId.networkId;
    expect(isDetectionModelingReference(withoutNetworkId)).toBe(false);
    expect(isDetectionModelingReference({ ...validation.value, networkId: '  ' })).toBe(false);
    expect(isDetectionModelingReference({ ...reverse.value, mappingVersion: '' })).toBe(false);
    expect(isDetectionModelingReference({ ...reverse.value, mappingVersion: 1 })).toBe(false);
    expect(isDetectionModelingReference({ ...reverse.value, normalizedValue: 1.01 })).toBe(false);
    expect(isDetectionModelingReference({ ...reverse.value, resultStatus: 'RAW_ONLY' })).toBe(
      false,
    );
  });

  it('reads concentration only when calibration reports an in-range value', () => {
    expect(
      readDetectionMetric(analyzedRecord(), { kind: 'concentration', channelId: 'channel1' }),
    ).toEqual(
      expect.objectContaining({ value: 5, unit: 'fixture-unit', usesDemoCalibration: false }),
    );
  });
});
