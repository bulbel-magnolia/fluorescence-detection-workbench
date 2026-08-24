import { describe, expect, it } from 'vitest';
import { Hc08dProtocolParser, ProtocolError, encodeHc08dLedCommand } from './hc08dProtocol';

const encoder = new TextEncoder();

describe('HC-08D ASCII protocol', () => {
  it('parses a comma-delimited compatibility frame and marks saturated fields', () => {
    const parser = new Hc08dProtocolParser();
    const messages = parser.push(
      encoder.encode('480:4428,515:13390,555:65535,CLR:65535\r\n'),
      '2026-07-24T10:00:00.000Z',
      1_000,
    );

    expect(messages).toEqual([
      {
        kind: 'sample',
        frame: {
          sequence: 0,
          receivedAt: '2026-07-24T10:00:00.000Z',
          elapsedMs: 0,
          signal480: 4428,
          signal515: 13390,
          signal555: 65535,
          clearSignal: 65535,
          saturatedFields: ['555', 'CLR'],
          rawLine: '480:4428,515:13390,555:65535,CLR:65535',
        },
      },
    ]);
  });

  it('parses the space-delimited frame emitted by the current hardware', () => {
    const parser = new Hc08dProtocolParser();
    const messages = parser.push(
      encoder.encode('480:1545 515:6733 555:65535 CLR:65535\r\n'),
      '2026-08-03T10:00:00.000Z',
      1_000,
    );

    expect(messages).toEqual([
      {
        kind: 'sample',
        frame: {
          sequence: 0,
          receivedAt: '2026-08-03T10:00:00.000Z',
          elapsedMs: 0,
          signal480: 1545,
          signal515: 6733,
          signal555: 65535,
          clearSignal: 65535,
          saturatedFields: ['555', 'CLR'],
          rawLine: '480:1545 515:6733 555:65535 CLR:65535',
        },
      },
    ]);
  });

  it('reassembles fragments and accepts CRLF', () => {
    const parser = new Hc08dProtocolParser();

    expect(parser.push(encoder.encode('480:44'), '2026-07-24T10:00:00.000Z', 1_000)).toEqual([]);
    const messages = parser.push(
      encoder.encode('28,515:13390,555:15820,CLR:65535\r\n'),
      '2026-07-24T10:00:00.500Z',
      1_500,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.kind).toBe('sample');
    if (messages[0]?.kind === 'sample') {
      expect(messages[0].frame.signal480).toBe(4428);
      expect(messages[0].frame.elapsedMs).toBe(0);
    }
  });

  it('separates multiple CRLF lines and adjacent frames once a boundary arrives', () => {
    const parser = new Hc08dProtocolParser();
    expect(
      parser.push(
        encoder.encode('480:1,515:2,555:3,CLR:4\r\n480:5,515:6,555:7,CLR:8\r\n'),
        '2026-07-24T10:00:00.000Z',
        1_000,
      ),
    ).toHaveLength(2);

    const adjacent = parser.push(
      encoder.encode('480:9,515:10,555:11,CLR:12' + '480:13,515:14,555:15,CLR:16\r\n'),
      '2026-07-24T10:00:00.500Z',
      1_500,
    );
    expect(adjacent).toHaveLength(2);
  });

  it('rejects malformed and out-of-range frames without poisoning the buffer', () => {
    const parser = new Hc08dProtocolParser();

    expect(() =>
      parser.push(
        encoder.encode('480:1,515:2,555:3,CLR:65536\r\n'),
        '2026-07-24T10:00:00.000Z',
        1_000,
      ),
    ).toThrow(ProtocolError);
    expect(
      parser.push(encoder.encode('480:1,515:2,555:3,CLR:4\r\n'), '2026-07-24T10:00:00.500Z', 1_500),
    ).toHaveLength(1);
  });

  it('rejects unknown lines and bounds buffered data', () => {
    const parser = new Hc08dProtocolParser(32);

    expect(() =>
      parser.push(encoder.encode('UNKNOWN\r\n'), '2026-07-24T10:00:00.000Z', 1_000),
    ).toThrowError(/MALFORMED_FRAME/);
    expect(() =>
      parser.push(encoder.encode('x'.repeat(33)), '2026-07-24T10:00:00.500Z', 1_500),
    ).toThrowError(/PROTOCOL_BUFFER_OVERFLOW/);
  });

  it('parses fragmented firmware responses and multiple lines', () => {
    const parser = new Hc08dProtocolParser();

    expect(parser.push(encoder.encode('LED_ON_'), '2026-07-24T10:00:00.000Z', 1_000)).toEqual([]);
    expect(
      parser.push(
        encoder.encode('OK\r\nLED_OFF_OK\r\nERROR_COMMAND\r\n'),
        '2026-07-24T10:00:00.010Z',
        1_010,
      ),
    ).toEqual([
      { kind: 'command-response', response: 'LED_ON_OK', rawLine: 'LED_ON_OK' },
      { kind: 'command-response', response: 'LED_OFF_OK', rawLine: 'LED_OFF_OK' },
      {
        kind: 'command-response',
        response: 'ERROR_COMMAND',
        rawLine: 'ERROR_COMMAND',
      },
    ]);
  });

  it('encodes LED commands with exactly one CRLF terminator', () => {
    expect([...encodeHc08dLedCommand('LED_ON')]).toEqual([64, 76, 69, 68, 95, 79, 78, 13, 10]);
    expect([...encodeHc08dLedCommand('LED_OFF')]).toEqual([64, 76, 69, 68, 95, 79, 70, 70, 13, 10]);
  });
});
