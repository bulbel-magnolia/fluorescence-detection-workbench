import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from './analyze';

const fixtureRoot = resolve(process.cwd(), '../张森威-数据解析与算法-v0.1/fixtures');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtureRoot, name), 'utf8')) as unknown;
}

describe('analysis v0.1 parity', () => {
  it.each(['normal', 'invalid_empty', 'out_of_range'])(
    'matches the repository %s fixture',
    (stem) => {
      expect(analyze(fixture(`${stem}_input.json`))).toEqual(fixture(`${stem}_expected.json`));
    },
  );

  it('clips a negative corrected signal and records a warning', () => {
    const input = fixture('out_of_range_input.json');
    if (!isRecord(input)) {
      throw new Error('fixture must be an object');
    }
    const channels = input.channels;
    if (!isUnknownArray(channels)) {
      throw new Error('fixture channels must be an array');
    }
    const first = channels[0];
    if (!isRecord(first)) {
      throw new Error('fixture channel must be an object');
    }
    const samples = first.samples;
    if (!isUnknownArray(samples) || !isRecord(samples[0])) {
      throw new Error('fixture samples must be objects');
    }
    samples[0].rawSignal = 10;
    const result = analyze(input);
    expect(result.resultStatus).not.toBe('ERROR');
    if (result.resultStatus !== 'ERROR') {
      expect(result.channels.channel1?.warnings).toContain('NEGATIVE_CORRECTED_CLIPPED');
    }
  });
});
