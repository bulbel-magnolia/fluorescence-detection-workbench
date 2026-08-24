import { describe, expect, it } from 'vitest';
import type { HistoryRecord } from '../../domain/types';
import { recordToCsv } from './exportRecord';

const record: HistoryRecord = {
  id: 'record-12345678',
  sampleId: 'sample-001',
  createdAt: '2026-07-18T10:00:00Z',
  origin: 'json-import',
  isDemo: true,
  resultStatus: 'ERROR',
  qualityGrade: null,
  syncState: 'local-only',
  result: {
    schemaVersion: 1,
    sessionId: 'session-1',
    sampleId: 'sample-001',
    resultStatus: 'ERROR',
    error: { code: 'INVALID_INPUT', message: 'fixture' },
    protocolVersion: 'PROTO-DEMO-0.2',
    algorithmVersion: 'ANALYSIS-DEMO-0.1',
    calibrationVersion: 'CAL-DEMO-0.1',
    isDemo: true,
    disclaimer: 'demo',
  },
};

describe('export record module', () => {
  it('keeps record data serializable', () => {
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it('exports real HC-08D frames without fabricated analysis values', () => {
    const rawRecord: HistoryRecord = {
      id: 'record-hc08d-1',
      sampleId: 'sample-hc08d-1',
      createdAt: '2026-07-24T10:00:00Z',
      origin: 'real-live',
      isDemo: false,
      resultStatus: 'RAW_ONLY',
      qualityGrade: null,
      syncState: 'local-only',
      result: {
        schemaVersion: 1,
        sessionId: 'session-hc08d-1',
        sampleId: 'sample-hc08d-1',
        resultStatus: 'RAW_ONLY',
        frames: [
          {
            sequence: 0,
            receivedAt: '2026-07-24T10:00:00.500Z',
            elapsedMs: 500,
            signal480: 4428,
            signal515: 13390,
            signal555: 65535,
            clearSignal: 65535,
            saturatedFields: ['555', 'CLR'],
            rawLine: '480:4428,515:13390,555:65535,CLR:65535',
          },
        ],
        protocolVersion: 'HC08D-ASCII-DRAFT-0.2',
        algorithmVersion: null,
        calibrationVersion: null,
        isDemo: false,
        disclaimer: '仅保存硬件原始信号，未执行浓度换算或质量判定。',
      },
    };

    const csv = recordToCsv(rawRecord);
    expect(csv).toContain('signal480,signal515,signal555,clearSignal,saturatedFields');
    expect(csv).toContain('4428,13390,65535,65535,555|CLR');
    expect(csv).not.toContain('correctedSignal');
    expect(csv).not.toContain('algorithmVersion');
  });
});
