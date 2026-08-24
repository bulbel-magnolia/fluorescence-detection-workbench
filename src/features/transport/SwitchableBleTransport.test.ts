import { describe, expect, it, vi } from 'vitest';
import type {
  BleDevice,
  DeviceCommand,
  DeviceConnectionState,
  DevicePacket,
  TransportMode,
} from '../../domain/types';
import type { BleTransport } from './BleTransport';
import { SwitchableBleTransport } from './SwitchableBleTransport';

interface FakeTransport extends BleTransport {
  disconnect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
}

function fakeTransport(): FakeTransport {
  return {
    scan: vi.fn<() => Promise<BleDevice[]>>(() => Promise.resolve([])),
    stopScan: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    connect: vi.fn<(deviceId: string) => Promise<void>>(() => Promise.resolve()),
    disconnect: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    sendCommand: vi.fn<(command: DeviceCommand) => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn<(listener: (packet: DevicePacket) => void) => () => void>(
      () => () => undefined,
    ),
    getConnectionState: vi.fn<() => DeviceConnectionState>(() => ({
      status: 'disconnected',
    })),
    dispose: vi.fn<() => void>(),
  };
}

describe('SwitchableBleTransport', () => {
  it('disconnects and disposes the previous instance and creates a fresh mode instance', async () => {
    const demo = fakeTransport();
    const hc08d = fakeTransport();
    const factories: Record<TransportMode, () => BleTransport> = {
      demo: vi.fn(() => demo),
      hc08d: vi.fn(() => hc08d),
    };
    const transport = new SwitchableBleTransport(factories, 'demo');

    await transport.setMode('hc08d');

    expect(demo.disconnect).toHaveBeenCalledOnce();
    expect(demo.dispose).toHaveBeenCalledOnce();
    expect(factories.hc08d).toHaveBeenCalledOnce();
    expect(transport.mode).toBe('hc08d');
    transport.dispose();
  });
});
