import type { Hc08dProtocolMessage, Hc08dSampleFrame, Hc08dSignalField } from '../../domain/types';

export const HC08D_PROTOCOL_VERSION = 'HC08D-ASCII-DRAFT-0.2' as const;

// Current STM32 firmware uses spaces between fields. Retain comma-delimited
// frames for compatibility with the earlier protocol draft and saved fixtures.
const framePattern =
  /^480:(\d{1,5})(?:,[ \t]*|[ \t]+)515:(\d{1,5})(?:,[ \t]*|[ \t]+)555:(\d{1,5})(?:,[ \t]*|[ \t]+)CLR:(\d{1,5})$/;

export class ProtocolError extends Error {
  constructor(
    readonly code: 'INVALID_UTF8' | 'MALFORMED_FRAME' | 'PROTOCOL_BUFFER_OVERFLOW',
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'ProtocolError';
  }
}

function parseUint16(value: string, field: Hc08dSignalField): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new ProtocolError('MALFORMED_FRAME', `${field} is outside 0..65535`);
  }
  return parsed;
}

export class Hc08dProtocolParser {
  private buffer = '';
  private sequence = 0;
  private startedAtMs: number | null = null;

  constructor(private readonly maximumBufferedBytes = 8_192) {}

  push(chunk: Uint8Array, receivedAt: string, receivedAtMs: number): Hc08dProtocolMessage[] {
    let decoded: string;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(chunk);
    } catch {
      throw new ProtocolError('INVALID_UTF8', 'notification is not valid UTF-8');
    }

    this.buffer += decoded;
    if (new TextEncoder().encode(this.buffer).byteLength > this.maximumBufferedBytes) {
      this.buffer = '';
      throw new ProtocolError('PROTOCOL_BUFFER_OVERFLOW', 'receive buffer exceeded its limit');
    }

    const messages: Hc08dProtocolMessage[] = [];
    while (true) {
      const newline = this.buffer.indexOf('\n');
      const nextFrameStart = this.buffer.indexOf('480:', 4);
      const boundary =
        newline >= 0 && (nextFrameStart < 0 || newline < nextFrameStart)
          ? newline + 1
          : nextFrameStart;
      if (boundary <= 0) break;

      const rawLine = this.buffer.slice(0, boundary).replace(/[\r\n]+$/u, '');
      this.buffer = this.buffer.slice(boundary);
      if (rawLine.length > 0) {
        messages.push(this.parseLine(rawLine, receivedAt, receivedAtMs));
      }
    }
    return messages;
  }

  reset(): void {
    this.buffer = '';
    this.sequence = 0;
    this.startedAtMs = null;
  }

  private parseLine(
    rawLine: string,
    receivedAt: string,
    receivedAtMs: number,
  ): Hc08dProtocolMessage {
    if (rawLine === 'LED_ON_OK' || rawLine === 'LED_OFF_OK' || rawLine === 'ERROR_COMMAND') {
      return { kind: 'command-response', response: rawLine, rawLine };
    }

    const match = framePattern.exec(rawLine);
    if (!match) {
      throw new ProtocolError('MALFORMED_FRAME', rawLine);
    }

    const signal480 = parseUint16(match[1]!, '480');
    const signal515 = parseUint16(match[2]!, '515');
    const signal555 = parseUint16(match[3]!, '555');
    const clearSignal = parseUint16(match[4]!, 'CLR');
    this.startedAtMs ??= receivedAtMs;

    const saturatedFields: Hc08dSignalField[] = [];
    if (signal480 === 65_535) saturatedFields.push('480');
    if (signal515 === 65_535) saturatedFields.push('515');
    if (signal555 === 65_535) saturatedFields.push('555');
    if (clearSignal === 65_535) saturatedFields.push('CLR');

    const frame: Hc08dSampleFrame = {
      sequence: this.sequence++,
      receivedAt,
      elapsedMs: receivedAtMs - this.startedAtMs,
      signal480,
      signal515,
      signal555,
      clearSignal,
      saturatedFields,
      rawLine,
    };
    return { kind: 'sample', frame };
  }
}

export function encodeHc08dLedCommand(command: 'LED_ON' | 'LED_OFF'): Uint8Array {
  return new TextEncoder().encode(command === 'LED_ON' ? '@LED_ON\r\n' : '@LED_OFF\r\n');
}
