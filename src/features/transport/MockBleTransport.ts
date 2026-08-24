import type {
  BleDevice,
  ChannelId,
  DeviceCommand,
  DeviceConnectionState,
  DevicePacket,
  DeviceStatus,
} from '../../domain/types';
import type { BleTransport } from './BleTransport';
import { TransportError } from './BleTransport';

export type MockFault =
  'none' | 'low-battery' | 'sensor-error' | 'sudden-disconnection' | 'command-timeout';

const demoDevice: BleDevice = {
  id: 'demo-fluoro-001',
  name: 'FluoroSense · Demo',
  rssi: -47,
  batteryLevel: 86,
  firmwareVersion: 'FW-DEMO-0.3',
  isDemo: true,
};

const channelScale: Record<ChannelId, number> = {
  channel1: 1,
  channel2: 1.45,
  channel3: 0.72,
};

export class MockBleTransport implements BleTransport {
  private connection: DeviceConnectionState = { status: 'disconnected' };
  private listeners = new Set<(packet: DevicePacket) => void>();
  private delays = new Set<ReturnType<typeof setTimeout>>();
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private generation = 0;
  private fault: MockFault = 'none';
  private disposed = false;

  async scan(): Promise<BleDevice[]> {
    this.assertActive();
    const operationId = `scan-${Date.now()}`;
    this.connection = { status: 'scanning', operationId };
    await this.wait(360);
    this.assertActive();
    this.connection = { status: 'disconnected' };
    return [demoDevice];
  }

  stopScan(): Promise<void> {
    if (this.connection.status === 'scanning') {
      this.connection = { status: 'disconnected' };
    }
    return Promise.resolve();
  }

  async connect(deviceId: string): Promise<void> {
    this.assertActive();
    if (deviceId !== demoDevice.id) {
      throw new TransportError('DEVICE_NOT_FOUND', 'Demo device was not found.', true);
    }
    const generation = ++this.generation;
    this.connection = { status: 'connecting', deviceId, generation };
    await this.wait(420);
    this.assertActive();
    if (generation !== this.generation) {
      return;
    }
    this.connection = { status: 'connected', device: demoDevice, generation };
    this.emit({
      kind: 'status',
      status: this.status(this.fault === 'low-battery' ? 12 : 86),
    });
  }

  disconnect(): Promise<void> {
    this.generation += 1;
    this.stopSampling();
    this.connection = { status: 'disconnected' };
    this.emit({ kind: 'disconnected', reason: 'requested' });
    return Promise.resolve();
  }

  async sendCommand(command: DeviceCommand): Promise<void> {
    this.assertConnected();
    if (this.fault === 'command-timeout') {
      await this.wait(900);
      throw new TransportError('ACK_TIMEOUT', 'Demo command acknowledgement timed out.', true);
    }
    this.emit({
      kind: 'acknowledgement',
      acknowledgement: {
        commandId: command.id,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
      },
    });
    await this.wait(120);
    switch (command.name) {
      case 'START':
        this.startSampling();
        break;
      case 'STOP':
        this.stopSampling();
        break;
      case 'ZERO':
        this.sequence = 0;
        break;
      case 'CALIBRATE':
      case 'GET_STATUS':
        this.emit({
          kind: 'status',
          status: this.status(this.fault === 'low-battery' ? 12 : 86),
        });
        break;
    }
    this.emit({
      kind: 'acknowledgement',
      acknowledgement: {
        commandId: command.id,
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    });
  }

  subscribe(listener: (packet: DevicePacket) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getConnectionState(): DeviceConnectionState {
    return this.connection;
  }

  setFault(fault: MockFault): void {
    this.fault = fault;
    if (fault === 'low-battery' && this.connection.status === 'connected') {
      this.emit({ kind: 'status', status: this.status(12) });
    }
    if (fault === 'sensor-error' && this.connection.status === 'connected') {
      this.stopSampling();
      this.emit({
        kind: 'error',
        code: 'DEMO_SENSOR_ERROR',
        message: 'Demo sensor error injected.',
        recoverable: true,
      });
    }
    if (fault === 'sudden-disconnection' && this.connection.status === 'connected') {
      this.stopSampling();
      this.generation += 1;
      this.connection = { status: 'disconnected' };
      this.emit({ kind: 'disconnected', reason: 'link-loss' });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopSampling();
    for (const timer of this.delays) {
      clearTimeout(timer);
    }
    this.delays.clear();
    this.listeners.clear();
    this.connection = { status: 'disconnected' };
  }

  private startSampling(): void {
    this.stopSampling();
    const startedAt = Date.now();
    this.sampleTimer = setInterval(() => {
      if (this.fault === 'sensor-error') {
        this.setFault('sensor-error');
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      const sequence = this.sequence++;
      for (const channelId of Object.keys(channelScale) as ChannelId[]) {
        const scale = channelScale[channelId];
        const response = 105 + 720 * (1 - Math.exp(-sequence / 18));
        const ripple = Math.sin(sequence / 2.8) * 7;
        const background = 22 + Math.sin(sequence / 7) * 1.8;
        const rawSignal = background + (response + ripple) * scale;
        this.emit({
          kind: 'sample',
          channelId,
          sample: {
            sequence,
            timestamp: new Date().toISOString(),
            elapsedMs,
            rawSignal: Number(rawSignal.toFixed(3)),
            background: Number(background.toFixed(3)),
            unit: 'a.u.',
          },
        });
      }
      this.emit({
        kind: 'status',
        status: {
          ...this.status(this.fault === 'low-battery' ? 12 : 86),
          sensorState: 'measuring',
        },
      });
    }, 250);
  }

  private stopSampling(): void {
    if (this.sampleTimer !== null) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
  }

  private status(batteryLevel: number): DeviceStatus {
    return {
      batteryLevel,
      temperatureCelsius: 24.6,
      sensorState: batteryLevel < 20 ? 'warning' : 'ready',
      errorCode: null,
    };
  }

  private emit(packet: DevicePacket): void {
    for (const listener of this.listeners) {
      listener(packet);
    }
  }

  private assertConnected(): void {
    this.assertActive();
    if (this.connection.status !== 'connected') {
      throw new TransportError('NOT_CONNECTED', 'A device connection is required.', true);
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new TransportError('TRANSPORT_DISPOSED', 'Transport has been disposed.', false);
    }
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.delays.delete(timer);
        resolve();
      }, milliseconds);
      this.delays.add(timer);
    });
  }
}
