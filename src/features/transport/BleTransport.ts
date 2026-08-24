import type {
  BleDevice,
  DeviceCommand,
  DeviceConnectionState,
  DevicePacket,
} from '../../domain/types';

export interface BleTransport {
  scan(): Promise<BleDevice[]>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  sendCommand(command: DeviceCommand): Promise<void>;
  subscribe(listener: (packet: DevicePacket) => void): () => void;
  getConnectionState(): DeviceConnectionState;
  dispose(): void;
}

export class TransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

export class RealBleTransportUnavailable implements BleTransport {
  private readonly error = new TransportError(
    'REAL_PROTOCOL_NOT_CONFIGURED',
    'Real BLE is disabled until versioned UUID and packet configuration is supplied.',
    false,
  );

  scan(): Promise<BleDevice[]> {
    return Promise.reject(this.error);
  }

  stopScan(): Promise<void> {
    return Promise.resolve();
  }

  connect(): Promise<void> {
    return Promise.reject(this.error);
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  sendCommand(): Promise<void> {
    return Promise.reject(this.error);
  }

  subscribe(): () => void {
    return () => undefined;
  }

  getConnectionState(): DeviceConnectionState {
    return { status: 'error', code: this.error.code, message: this.error.message };
  }

  dispose(): void {
    // No native resource exists until a versioned protocol is configured.
  }
}

export interface SerialTransport extends BleTransport {
  readonly transportKind: 'serial';
}

export class SerialTransportUnavailable
  extends RealBleTransportUnavailable
  implements SerialTransport
{
  readonly transportKind = 'serial' as const;
}
