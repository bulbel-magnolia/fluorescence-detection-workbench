import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevicePacket } from '../../domain/types';
import { MockBleTransport } from './MockBleTransport';

describe('MockBleTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function connectedTransport(): Promise<MockBleTransport> {
    const transport = new MockBleTransport();
    const scan = transport.scan();
    await vi.advanceTimersByTimeAsync(360);
    const devices = await scan;
    const connect = transport.connect(devices[0]!.id);
    await vi.advanceTimersByTimeAsync(420);
    await connect;
    return transport;
  }

  it('scans, connects and produces three-channel samples', async () => {
    const transport = await connectedTransport();
    const packets: DevicePacket[] = [];
    transport.subscribe((packet) => packets.push(packet));
    const command = transport.sendCommand({
      id: 'command-start',
      name: 'START',
      issuedAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(120);
    await command;
    await vi.advanceTimersByTimeAsync(1000);

    const samples = packets.filter((packet) => packet.kind === 'sample');
    expect(samples.length).toBeGreaterThanOrEqual(9);
    expect(new Set(samples.map((packet) => packet.channelId))).toEqual(
      new Set(['channel1', 'channel2', 'channel3']),
    );
    transport.dispose();
  });

  it('returns to disconnected state after a scan completes', async () => {
    const transport = new MockBleTransport();
    const scan = transport.scan();
    await vi.advanceTimersByTimeAsync(360);
    await scan;

    expect(transport.getConnectionState()).toEqual({ status: 'disconnected' });
    transport.dispose();
  });

  it('clears sampling resources after disposal', async () => {
    const transport = await connectedTransport();
    const packets: DevicePacket[] = [];
    transport.subscribe((packet) => packets.push(packet));
    const command = transport.sendCommand({
      id: 'command-start',
      name: 'START',
      issuedAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(120);
    await command;
    await vi.advanceTimersByTimeAsync(500);
    const countBeforeDispose = packets.length;

    transport.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(packets).toHaveLength(countBeforeDispose);
  });

  it('reports a sudden disconnection as a link loss', async () => {
    const transport = await connectedTransport();
    const packets: DevicePacket[] = [];
    transport.subscribe((packet) => packets.push(packet));
    transport.setFault('sudden-disconnection');

    expect(transport.getConnectionState().status).toBe('disconnected');
    expect(packets.at(-1)).toEqual({ kind: 'disconnected', reason: 'link-loss' });
    transport.dispose();
  });
});
