import { beforeEach, describe, expect, it } from 'vitest';
import type { HistoryRecord } from '../../domain/types';
import { LocalHistoryRepository } from './historyRepository';

const record: HistoryRecord = {
  id: 'record-local-1',
  sampleId: 'sample-local-1',
  createdAt: '2026-07-18T10:00:00Z',
  origin: 'json-import',
  isDemo: true,
  resultStatus: 'ERROR',
  qualityGrade: null,
  syncState: 'local-only',
  result: {
    schemaVersion: 1,
    sessionId: 'session-local-1',
    sampleId: 'sample-local-1',
    resultStatus: 'ERROR',
    error: { code: 'INVALID_INPUT', message: 'demo invalid input' },
    protocolVersion: 'PROTO-DEMO-0.2',
    algorithmVersion: 'ANALYSIS-DEMO-0.1',
    calibrationVersion: 'CAL-DEMO-0.1',
    isDemo: true,
    disclaimer: 'demo',
  },
};

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

describe('local history repository fallback', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a versioned record', async () => {
    const repository = new LocalHistoryRepository();
    await repository.upsert(record);
    expect(await repository.load()).toEqual([record]);
    expect(await repository.pendingCount()).toBe(1);
  });

  it('removes records by id', async () => {
    const repository = new LocalHistoryRepository();
    await repository.upsert(record);
    await repository.remove(record.id);
    expect(await repository.load()).toEqual([]);
  });

  it('round-trips a real HC-08D raw-only record without analysis fields', async () => {
    const repository = new LocalHistoryRepository();
    await repository.upsert(rawRecord);
    expect(await repository.load()).toEqual([rawRecord]);
    expect((await repository.load())[0]?.result.resultStatus).toBe('RAW_ONLY');
  });
});
