import type {
  BleDevice,
  DeviceCommand,
  DeviceConnectionState,
  DevicePacket,
  TransportMode,
} from '../../domain/types';
import type { BleTransport } from './BleTransport';
import { TransportError } from './BleTransport';
import type { MockFault } from './MockBleTransport';

export interface CharacteristicSelectionRequest {
  serviceUuid: string;
  notifyCharacteristicUuid: string;
  writeCharacteristicUuid: string;
}

interface CharacteristicSelectableTransport extends BleTransport {
  selectCharacteristics(selection: CharacteristicSelectionRequest): Promise<void>;
}

function supportsCharacteristicSelection(
  transport: BleTransport,
): transport is CharacteristicSelectableTransport {
  return 'selectCharacteristics' in transport;
}

interface FaultInjectableTransport extends BleTransport {
  setFault(fault: MockFault): void;
}

function supportsFaultInjection(transport: BleTransport): transport is FaultInjectableTransport {
  return 'setFault' in transport;
}

export class SwitchableBleTransport implements BleTransport {
  private active: BleTransport;
  private readonly listeners = new Set<(packet: DevicePacket) => void>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly factories: Record<TransportMode, () => BleTransport>,
    public mode: TransportMode,
  ) {
    this.active = factories[mode]();
    this.bind();
  }

  async setMode(mode: TransportMode): Promise<void> {
    if (mode === this.mode) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    try {
      await this.active.disconnect();
    } finally {
      this.active.dispose();
      this.mode = mode;
      this.active = this.factories[mode]();
      this.bind();
    }
  }

  scan(): Promise<BleDevice[]> {
    return this.active.scan();
  }

  stopScan(): Promise<void> {
    return this.active.stopScan();
  }

  connect(deviceId: string): Promise<void> {
    return this.active.connect(deviceId);
  }

  disconnect(): Promise<void> {
    return this.active.disconnect();
  }

  sendCommand(command: DeviceCommand): Promise<void> {
    return this.active.sendCommand(command);
  }

  setFault(fault: MockFault): void {
    if (!supportsFaultInjection(this.active)) return;
    this.active.setFault(fault);
  }

  selectCharacteristics(selection: CharacteristicSelectionRequest): Promise<void> {
    if (!supportsCharacteristicSelection(this.active)) {
      return Promise.reject(
        new TransportError(
          'CHARACTERISTIC_SELECTION_UNAVAILABLE',
          'The active transport does not expose GATT characteristic selection.',
          false,
        ),
      );
    }
    return this.active.selectCharacteristics(selection);
  }

  subscribe(listener: (packet: DevicePacket) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConnectionState(): DeviceConnectionState {
    return this.active.getConnectionState();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.active.dispose();
    this.listeners.clear();
  }

  private bind(): void {
    this.unsubscribe = this.active.subscribe((packet) => {
      for (const listener of this.listeners) listener(packet);
    });
  }
}
