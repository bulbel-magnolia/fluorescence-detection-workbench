import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsvText, parseJsonText } from './parseImport';

describe('import parsing', () => {
  it('parses the repository JSON fixture', () => {
    const text = readFileSync(
      resolve(process.cwd(), '../张森威-数据解析与算法-v0.1/fixtures/normal_input.json'),
      'utf8',
    );
    const preview = parseJsonText(text, 'normal_input.json');
    expect(preview.result.resultStatus).toBe('OK');
    expect(preview.channelCount).toBe(3);
    expect(preview.rowCount).toBe(9);
  });

  it('maps a CSV file into the shared analysis pipeline', () => {
    const csv = [
      'channelId,sequence,timestamp,elapsedMs,rawSignal,background,sampleId',
      'channel1,0,2026-07-18T10:00:00Z,0,120,20,csv-001',
      'channel1,1,2026-07-18T10:00:01Z,1000,220,20,csv-001',
      'channel1,2,2026-07-18T10:00:02Z,2000,320,20,csv-001',
    ].join('\n');
    const preview = parseCsvText(csv, 'single.csv');
    expect(preview.result.resultStatus).toBe('OK');
    expect(preview.rowCount).toBe(3);
    if (preview.result.resultStatus !== 'ERROR') {
      expect(preview.result.sampleId).toBe('csv-001');
      expect(preview.result.channels.channel1?.summaryCorrectedSignal).toBe(200);
    }
  });

  it('rejects CSV without required fields', () => {
    expect(() => parseCsvText('channelId,sequence\nchannel1,0')).toThrow(/Missing CSV columns/);
  });
});
