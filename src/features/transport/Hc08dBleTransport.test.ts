import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevicePacket } from '../../domain/types';
import { Hc08dBleTransport } from './Hc08dBleTransport';
import type { NativeBleApi, NativeBleEventMap, NativeConnectResult } from './tauriBleApi';

const connectResult: NativeConnectResult = {
  generation: 1,
  device: { id: 'hc08d-1', name: 'HC-08D', rssi: -48 },
  selection: {
    serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
    notifyCharacteristicUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
    writeCharacteristicUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
    writeWithResponse: true,
  },
  candidates: [],
};

class FakeNativeBleApi implements NativeBleApi {
  writes: number[][] = [];
  private listeners = new Map<keyof NativeBleEventMap, Set<(payload: unknown) => void>>();

  scan = vi.fn(() => Promise.resolve([{ id: 'hc08d-1', name: 'HC-08D', rssi: -48 }]));
  stopScan = vi.fn(() => Promise.resolve());
  connect = vi.fn(() => Promise.resolve(connectResult));
  selectCharacteristics = vi.fn(() => Promise.resolve(connectResult));
  disconnect = vi.fn(() => Promise.resolve());
  write = vi.fn((bytes: number[]) => {
    this.writes.push(bytes);
    return Promise.resolve();
  });

  listen<K extends keyof NativeBleEventMap>(
    event: K,
    listener: (payload: NativeBleEventMap[K]) => void,
  ): Promise<() => void> {
    const listeners = this.listeners.get(event) ?? new Set<(payload: unknown) => void>();
    listeners.add(listener as (payload: unknown) => void);
    this.listeners.set(event, listeners);
    return Promise.resolve(() => listeners.delete(listener as (payload: unknown) => void));
  }

  emit<K extends keyof NativeBleEventMap>(event: K, payload: NativeBleEventMap[K]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

async function connectedTransport(api: FakeNativeBleApi): Promise<Hc08dBleTransport> {
  const transport = new Hc08dBleTransport(api);
  const [device] = await transport.scan();
  await transport.connect(device!.id);
  return transport;
}

describe('Hc08dBleTransport', () => {
  afterEach(() => vi.useRealTimers());

  it('scans, connects and emits parsed hardware frames', async () => {
    vi.useFakeTimers();
    const api = new FakeNativeBleApi();
    const transport = await connectedTransport(api);
    const packets: DevicePacket[] = [];
    transport.subscribe((packet) => packets.push(packet));

    api.emit('ble://notification', {
      generation: 1,
      deviceId: 'hc08d-1',
      bytes: [...new TextEncoder().encode('480:1,515:2,555:3,CLR:4\r\n')],
    });

    const framePacket = packets.find((packet) => packet.kind === 'hardware-frame');
    expect(framePacket?.kind).toBe('hardware-frame');
    if (framePacket?.kind === 'hardware-frame') {
      expect(framePacket.frame.signal480).toBe(1);
      expect(framePacket.frame.signal515).toBe(2);
      expect(framePacket.frame.signal555).toBe(3);
      expect(framePacket.frame.clearSignal).toBe(4);
    }
    transport.dispose();
  });

  it('keeps the connection in discovery until a usable data channel is selected', async () => {
    const api = new FakeNativeBleApi();
    api.connect.mockResolvedValueOnce({ ...connectResult, selection: null });
    const transport = new Hc08dBleTransport(api);

    await transport.connect('hc08d-1');

    const connection = transport.getConnectionState();
    expect(connection.status).toBe('discovering');
    transport.dispose();
  });

  it('keeps delayed BLE fragments buffered until CRLF completes the frame', async () => {
    vi.useFakeTimers();
    const api = new FakeNativeBleApi();
    const transport = await connectedTransport(api);
    const packets: DevicePacket[] = [];
    transport.subscribe((packet) => packets.push(packet));

    api.emit('ble://notification', {
      generation: 1,
      deviceId: 'hc08d-1',
      bytes: [...new TextEncoder().encode('480:4428,515:13390')],
    });
    await vi.advanceTimersByTimeAsync(250);

    expect(packets.filter((packet) => packet.kind === 'error')).toEqual([]);

    api.emit('ble://notification', {
      generation: 1,
      deviceId: 'hc08d-1',
      bytes: [...new TextEncoder().encode(',555:15820,CLR:65535\r\n')],
    });

    const framePacket = packets.find((packet) => packet.kind === 'hardware-frame');
    expect(framePacket?.kind).toBe('hardware-frame');
    if (framePacket?.kind === 'hardware-frame') {
      expect(framePacket.frame.rawLine).toBe('480:4428,515:13390,555:15820,CLR:65535');
    }
    transport.dispose();
  });

  it('writes exact CRLF bytes and completes only after the matching response', async () => {
    vi.useFakeTimers();
    const api = new FakeNativeBleApi();
    const transport = await connectedTransport(api);
    const packets: DevicePacket[] = [];
    transport.subscribe((packet) => packets.push(packet));

    const pending = transport.sendCommand({
      id: 'led-on',
      name: 'LED_ON',
      issuedAt: new Date().toISOString(),
    });
    await Promise.resolve();
    expect(api.writes).toEqual([[64, 76, 69, 68, 95, 79, 78, 13, 10]]);
    const accepted = packets.find(
      (packet) =>
        packet.kind === 'acknowledgement' &&
        packet.acknowledgement.commandId === 'led-on' &&
        packet.acknowledgement.status === 'accepted',
    );
    expect(accepted).toBeDefined();
    expect(
      packets.some(
        (packet) =>
          packet.kind === 'acknowledgement' &&
          packet.acknowledgement.commandId === 'led-on' &&
          packet.acknowledgement.status === 'completed',
      ),
    ).toBe(false);

    api.emit('ble://notification', {
      generation: 1,
      deviceId: 'hc08d-1',
      bytes: [...new TextEncoder().encode('LED_ON_OK\r\n')],
    });
    await pending;
    expect(
      packets.some(
        (packet) =>
          packet.kind === 'acknowledgement' &&
          packet.acknowledgement.commandId === 'led-on' &&
          packet.acknowledgement.status === 'completed',
      ),
    ).toBe(true);
    transport.dispose();
  });

  it('rejects ERROR_COMMAND and times out after two seconds', async () => {
    vi.useFakeTimers();
    const api = new FakeNativeBleApi();
    const transport = await connectedTransport(api);

    const rejected = transport.sendCommand({
      id: 'led-off',
      name: 'LED_OFF',
      issuedAt: new Date().toISOString(),
    });
    const rejectedExpectation = expect(rejected).rejects.toMatchObject({
      code: 'DEVICE_COMMAND_REJECTED',
    });
    await Promise.resolve();
    api.emit('ble://notification', {
      generation: 1,
      deviceId: 'hc08d-1',
      bytes: [...new TextEncoder().encode('ERROR_COMMAND\r\n')],
    });
    await rejectedExpectation;

    const timedOut = transport.sendCommand({
      id: 'led-on-2',
      name: 'LED_ON',
      issuedAt: new Date().toISOString(),
    });
    const timeoutExpectation = expect(timedOut).rejects.toMatchObject({
      code: 'COMMAND_RESPONSE_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await timeoutExpectation;
    transport.dispose();
  });

  it('reconnects unexpected link loss at one, two and four seconds', async () => {
    vi.useFakeTimers();
    const api = new FakeNativeBleApi();
    api.connect
      .mockResolvedValueOnce(connectResult)
      .mockRejectedValueOnce(new Error('attempt 1'))
      .mockRejectedValueOnce(new Error('attempt 2'))
      .mockResolvedValueOnce({ ...connectResult, generation: 4 });
    const transport = await connectedTransport(api);

    api.emit('ble://disconnected', {
      generation: 1,
      device: connectResult.device,
      status: 'link-loss',
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(api.connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.connect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(api.connect).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(api.connect).toHaveBeenCalledTimes(4);
    expect(transport.getConnectionState().status).toBe('connected');
    transport.dispose();
  });
});
