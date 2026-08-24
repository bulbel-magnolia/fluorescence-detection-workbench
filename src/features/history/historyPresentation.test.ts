import { describe, expect, it } from 'vitest';
import type { HistoryRecord } from '../../domain/types';
import {
  buildHistoryPresentation,
  downsampleHistoryPoints,
  findNearestHistoryValues,
} from './historyPresentation';

const analyzedRecord: HistoryRecord = {
  id: 'record-analysis',
  sampleId: 'SAMPLE-ANALYSIS',
  createdAt: '2026-08-01T08:00:00.000Z',
  origin: 'json-import',
  isDemo: true,
  resultStatus: 'OK',
  qualityGrade: 'A-DEMO',
  syncState: 'local-only',
  result: {
    schemaVersion: 1,
    sessionId: 'session-analysis',
    sampleId: 'SAMPLE-ANALYSIS',
    mode: 'three_channel',
    resultStatus: 'OK',
    channels: {
      channel1: {
        channelId: 'channel1',
        sampleCount: 2,
        summaryMethod: 'latest',
        summaryCorrectedSignal: 28,
        signalUnit: 'a.u.',
        concentration: null,
        concentrationUnit: 'demo-unit',
        concentrationStatus: 'OK',
        calibrationModel: 'linear',
        calibrationIsDemo: true,
        warnings: [],
        curve: [
          {
            sequence: 0,
            timestamp: '2026-08-01T08:00:00.000Z',
            elapsedMs: 0,
            rawSignal: 30,
            background: 10,
            correctedSignal: 20,
            unit: 'a.u.',
          },
          {
            sequence: 1,
            timestamp: '2026-08-01T08:00:01.000Z',
            elapsedMs: 1000,
            rawSignal: 40,
            background: 12,
            correctedSignal: 28,
            unit: 'a.u.',
          },
        ],
      },
    },
    quality: {
      status: 'NOT_EVALUATED',
      score: null,
      grade: null,
      suggestion: '',
      isDemo: true,
    },
    protocolVersion: 'PROTO-DEMO-0.2',
    algorithmVersion: 'ANALYSIS-DEMO-0.1',
    calibrationVersion: 'CAL-DEMO-0.1',
    isDemo: true,
    disclaimer: 'Demonstration data',
  },
};

const rawRecord: HistoryRecord = {
  id: 'record-raw',
  sampleId: 'HC08D-001',
  createdAt: '2026-08-01T09:00:00.000Z',
  origin: 'real-live',
  isDemo: false,
  resultStatus: 'RAW_ONLY',
  qualityGrade: null,
  syncState: 'local-only',
  result: {
    schemaVersion: 1,
    sessionId: 'session-raw',
    sampleId: 'HC08D-001',
    resultStatus: 'RAW_ONLY',
    frames: [
      {
        sequence: 0,
        receivedAt: '2026-08-01T09:00:00.000Z',
        elapsedMs: 0,
        signal480: 10,
        signal515: 20,
        signal555: 30,
        clearSignal: 40,
        saturatedFields: [],
        rawLine: '480:10,515:20,555:30,CLR:40',
      },
      {
        sequence: 1,
        receivedAt: '2026-08-01T09:00:01.000Z',
        elapsedMs: 1000,
        signal480: 15,
        signal515: 25,
        signal555: 35,
        clearSignal: 45,
        saturatedFields: ['CLR'],
        rawLine: '480:15,515:25,555:35,CLR:45',
      },
    ],
    protocolVersion: 'HC08D-ASCII-DRAFT-0.2',
    algorithmVersion: null,
    calibrationVersion: null,
    isDemo: false,
    disclaimer: 'Raw hardware data',
  },
};

describe('history presentation', () => {
  it('exposes saved analyzed values without recalculating them', () => {
    const view = buildHistoryPresentation(analyzedRecord, 'corrected');
    expect(view.availableModes).toEqual(['corrected', 'raw', 'background']);
    expect(view.correctionConfigured).toBe(true);
    expect(view.series[0]?.points.map((point) => point.value)).toEqual([20, 28]);
    expect(view.summary).toMatchObject({
      sampleCount: 2,
      durationMs: 1000,
      peakValue: 28,
      latestValue: 28,
    });
  });

  it('exposes only four real HC-08D raw channels', () => {
    const view = buildHistoryPresentation(rawRecord, 'corrected');
    expect(view.availableModes).toEqual(['raw']);
    expect(view.activeMode).toBe('raw');
    expect(view.correctionConfigured).toBe(false);
    expect(view.series.map((series) => series.id)).toEqual([
      'signal480',
      'signal515',
      'signal555',
      'clearSignal',
    ]);
    expect(view.series.at(-1)?.points.map((point) => point.value)).toEqual([40, 45]);
    expect(view.summary.saturationCount).toBe(1);
  });

  it('uses full-resolution values for hover while limiting path points', () => {
    const points = Array.from({ length: 1001 }, (_, sequence) => ({
      elapsedMs: sequence,
      sequence,
      value: sequence,
    }));
    expect(downsampleHistoryPoints(points, 100)).toHaveLength(100);
    expect(
      findNearestHistoryValues(
        [{ id: 'channel1', labelKey: 'channels.channel1', color: '#00f5ff', points }],
        499.6,
      )[0]?.value,
    ).toBe(500);
  });
});
