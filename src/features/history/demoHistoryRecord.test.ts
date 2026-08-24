import { describe, expect, it } from 'vitest';
import { createDemoHistoryRecord } from './demoHistoryRecord';

describe('demo history record', () => {
  it('creates deterministic analyzed curves with an explicit Demo boundary', () => {
    const record = createDemoHistoryRecord({
      now: '2026-08-01T10:00:00.000Z',
      recordId: 'record-demo',
      sessionId: 'session-demo',
      sampleId: 'DEMO-HISTORY-001',
    });
    expect(record).toMatchObject({
      id: 'record-demo',
      sampleId: 'DEMO-HISTORY-001',
      origin: 'demo-live',
      isDemo: true,
    });
    expect(record.result.resultStatus).not.toBe('RAW_ONLY');
    if (record.result.resultStatus === 'OK' || record.result.resultStatus === 'PARTIAL') {
      expect(record.result.channels.channel1?.curve).toHaveLength(61);
      expect(record.result.disclaimer).not.toHaveLength(0);
    }
  });
});
