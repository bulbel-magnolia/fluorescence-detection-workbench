import type {
  BleDevice,
  DeviceCommand,
  DeviceConnectionState,
  DevicePacket,
  Hc08dCommandResponse,
  Hc08dDiagnostics,
  Hc08dProtocolMessage,
} from '../../domain/types';
import {
  Hc08dProtocolParser,
  ProtocolError,
  encodeHc08dLedCommand,
} from '../protocol/hc08dProtocol';
import type { BleTransport } from './BleTransport';
import { TransportError } from './BleTransport';
import type { CharacteristicSelectionRequest } from './SwitchableBleTransport';
import {
  tauriBleApi,
  type NativeBleApi,
  type NativeConnectResult,
  type NativeDevice,
} from './tauriBleApi';

const STALE_DELAY_MS = 1_500;
const COMMAND_TIMEOUT_MS = 2_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000] as const;
const MAXIMUM_RAW_LINES = 200;
const MAXIMUM_RAW_BYTES = 64 * 1_024;

interface PendingCommand {
  command: DeviceCommand & { name: 'LED_ON' | 'LED_OFF' };
  resolve: () => void;
  reject: (error: TransportError) => void;
  timeout: ReturnType<typeof setTimeout> | null;
}

function isLedCommand(
  command: DeviceCommand,
): command is DeviceCommand & { name: 'LED_ON' | 'LED_OFF' } {
  return command.name === 'LED_ON' || command.name === 'LED_OFF';
}

function emptyDiagnostics(): Hc08dDiagnostics {
  return {
    serviceUuid: null,
    notifyCharacteristicUuid: null,
    writeCharacteristicUuid: null,
    rssi: null,
    latestFrameAt: null,
    recentRawLines: [],
    candidates: [],
  };
}

function toBleDevice(device: NativeDevice): BleDevice {
  return {
    id: device.id,
    name: device.name,
    rssi: device.rssi,
    batteryLevel: null,
    firmwareVersion: null,
    isDemo: false,
  };
}

function asTransportError(value: unknown, fallbackCode: string): TransportError {
  if (value instanceof TransportError) return value;
  const raw = value instanceof Error ? value.message : String(value);
  const match = /^([A-Z][A-Z0-9_]+):\s*(.+)$/u.exec(raw);
  return new TransportError(match?.[1] ?? fallbackCode, match?.[2] ?? raw, true);
}

export class Hc08dBleTransport implements BleTransport {
  private connection: DeviceConnectionState = { status: 'disconnected' };
  private readonly listeners = new Set<(packet: DevicePacket) => void>();
  private readonly parser = new Hc08dProtocolParser();
  private diagnostics = emptyDiagnostics();
  private generation = 0;
  private connectedDevice: BleDevice | null = null;
  private explicitDisconnect = false;
  private disposed = false;
  private nativeListeners: Promise<void> | null = null;
  private readonly unlisteners: Array<() => void> = [];
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reconnectTimers = new Set<ReturnType<typeof setTimeout>>();
  private pendingCommand: PendingCommand | null = null;

  constructor(private readonly api: NativeBleApi = tauriBleApi) {}

  async scan(): Promise<BleDevice[]> {
    this.assertActive();
    await this.ensureNativeListeners();
    this.connection = { status: 'scanning', operationId: `hc08d-scan-${Date.now()}` };
    try {
      const devices = (await this.api.scan()).map(toBleDevice);
      this.connection = { status: 'disconnected' };
      return devices;
    } catch (cause) {
      const failure = asTransportError(cause, 'SCAN_FAILED');
      this.connection = { status: 'error', code: failure.code, message: failure.message };
      throw failure;
    }
  }

  async stopScan(): Promise<void> {
    await this.api.stopScan();
    if (this.connection.status === 'scanning') this.connection = { status: 'disconnected' };
  }

  async connect(deviceId: string): Promise<void> {
    this.assertActive();
    await this.ensureNativeListeners();
    this.cancelReconnects();
    this.explicitDisconnect = false;
    this.connection = { status: 'connecting', deviceId, generation: this.generation + 1 };
    try {
      this.applyConnectResult(await this.api.connect(deviceId));
    } catch (cause) {
      const failure = asTransportError(cause, 'CONNECTION_FAILED');
      this.connection = { status: 'error', code: failure.code, message: failure.message };
      throw failure;
    }
  }

  async selectCharacteristics(selection: CharacteristicSelectionRequest): Promise<void> {
    const device = this.connectedDevice;
    if (!device) {
      throw new TransportError('NOT_CONNECTED', 'Connect to HC-08D first.', true);
    }
    const result = await this.api.selectCharacteristics({ deviceId: device.id, ...selection });
    if (!result.selection) {
      throw new TransportError(
        'CHARACTERISTIC_SELECTION_INVALID',
        'The selected characteristics did not produce a usable data channel.',
        true,
      );
    }
    this.applyConnectResult(result);
  }

  async disconnect(): Promise<void> {
    this.explicitDisconnect = true;
    this.cancelReconnects();
    this.clearDataTimers();
    this.cancelPendingCommand(
      new TransportError('COMMAND_CANCELLED', 'The device disconnected before it responded.', true),
    );
    await this.api.disconnect(true);
    this.parser.reset();
    this.connection = { status: 'disconnected' };
    this.connectedDevice = null;
    this.emit({ kind: 'disconnected', reason: 'requested' });
  }

  sendCommand(command: DeviceCommand): Promise<void> {
    this.assertActive();
    if (!isLedCommand(command)) {
      return Promise.reject(
        new TransportError(
          'FIRMWARE_COMMAND_UNSUPPORTED',
          'HC-08D firmware currently supports only LED_ON and LED_OFF.',
          false,
        ),
      );
    }
    if (this.connection.status !== 'connected') {
      return Promise.reject(
        new TransportError('NOT_CONNECTED', 'Connect to HC-08D before sending a command.', true),
      );
    }
    if (this.pendingCommand) {
      return Promise.reject(
        new TransportError(
          'COMMAND_BUSY',
          'Wait for the current device response before sending another command.',
          true,
        ),
      );
    }

    return new Promise<void>((resolve, reject) => {
      const pending: PendingCommand = {
        command: { ...command, name: command.name },
        resolve,
        reject,
        timeout: null,
      };
      this.pendingCommand = pending;
      void this.api
        .write([...encodeHc08dLedCommand(command.name)])
        .then(() => {
          if (this.pendingCommand !== pending) return;
          this.emit({
            kind: 'acknowledgement',
            acknowledgement: {
              commandId: command.id,
              status: 'accepted',
              acceptedAt: new Date().toISOString(),
            },
          });
          pending.timeout = setTimeout(() => {
            this.rejectPendingCommand(
              'COMMAND_RESPONSE_TIMEOUT',
              'STM32 did not respond within 2 seconds.',
            );
          }, COMMAND_TIMEOUT_MS);
        })
        .catch((cause: unknown) => {
          if (this.pendingCommand !== pending) return;
          const failure = asTransportError(cause, 'WRITE_FAILED');
          this.rejectPendingCommand(failure.code, failure.message);
        });
    });
  }

  subscribe(listener: (packet: DevicePacket) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConnectionState(): DeviceConnectionState {
    return this.connection;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.explicitDisconnect = true;
    this.cancelReconnects();
    this.clearDataTimers();
    this.cancelPendingCommand(
      new TransportError('TRANSPORT_DISPOSED', 'The HC-08D transport was closed.', false),
    );
    for (const unlisten of this.unlisteners.splice(0)) unlisten();
    void this.api.disconnect(true);
    this.parser.reset();
    this.listeners.clear();
    this.connection = { status: 'disconnected' };
    this.connectedDevice = null;
  }

  private async ensureNativeListeners(): Promise<void> {
    if (this.nativeListeners) return this.nativeListeners;
    this.nativeListeners = Promise.all([
      this.api.listen('ble://notification', (payload) => this.onNotification(payload)),
      this.api.listen('ble://disconnected', (payload) => this.onDisconnected(payload)),
      this.api.listen('ble://connection-state', (payload) => {
        if (payload.generation !== this.generation || payload.status !== 'connected') return;
        const device = toBleDevice(payload.device);
        this.connectedDevice = device;
        if (
          !this.diagnostics.serviceUuid ||
          !this.diagnostics.notifyCharacteristicUuid ||
          !this.diagnostics.writeCharacteristicUuid
        ) {
          this.setConnection({ status: 'discovering', device, generation: payload.generation });
          return;
        }
        this.setConnection({ status: 'connected', device, generation: payload.generation });
      }),
      this.api.listen('ble://error', (payload) => {
        if (payload.generation !== this.generation) return;
        this.emit({
          kind: 'error',
          code: payload.code,
          message: payload.message,
          recoverable: payload.recoverable,
        });
      }),
    ]).then((unlisteners) => {
      if (this.disposed) {
        for (const unlisten of unlisteners) unlisten();
      } else {
        this.unlisteners.push(...unlisteners);
      }
    });
    return this.nativeListeners;
  }

  private applyConnectResult(result: NativeConnectResult): void {
    this.generation = result.generation;
    const device = toBleDevice(result.device);
    this.connectedDevice = device;
    this.parser.reset();
    this.clearDataTimers();
    this.diagnostics = {
      serviceUuid: result.selection?.serviceUuid ?? null,
      notifyCharacteristicUuid: result.selection?.notifyCharacteristicUuid ?? null,
      writeCharacteristicUuid: result.selection?.writeCharacteristicUuid ?? null,
      rssi: result.device.rssi,
      latestFrameAt: null,
      recentRawLines: [],
      candidates: result.candidates,
    };
    this.emit({ kind: 'diagnostics', diagnostics: this.diagnostics });
    if (result.selection) {
      this.setConnection({ status: 'connected', device, generation: result.generation });
      this.scheduleStaleTimer();
    } else {
      this.setConnection({ status: 'discovering', device, generation: result.generation });
    }
  }

  private onNotification(payload: { generation: number; deviceId: string; bytes: number[] }): void {
    if (payload.generation !== this.generation || payload.deviceId !== this.connectedDevice?.id) {
      return;
    }
    const receivedAtMs = Date.now();
    const receivedAt = new Date(receivedAtMs).toISOString();
    try {
      // A BLE notification is only a byte chunk. Keep incomplete data buffered
      // until the protocol parser observes an explicit frame boundary.
      this.processMessages(
        this.parser.push(Uint8Array.from(payload.bytes), receivedAt, receivedAtMs),
      );
    } catch (cause) {
      this.emitProtocolError(cause);
    }
  }

  private processMessages(messages: Hc08dProtocolMessage[]): void {
    for (const message of messages) {
      this.appendRawLine(message.kind === 'sample' ? message.frame.rawLine : message.rawLine);
      if (message.kind === 'sample') {
        this.diagnostics = {
          ...this.diagnostics,
          latestFrameAt: message.frame.receivedAt,
        };
        this.emit({ kind: 'hardware-frame', frame: message.frame });
        this.emit({ kind: 'diagnostics', diagnostics: this.diagnostics });
        this.scheduleStaleTimer();
      } else {
        this.handleCommandResponse(message.response);
        this.emit({ kind: 'diagnostics', diagnostics: this.diagnostics });
      }
    }
  }

  private handleCommandResponse(response: Hc08dCommandResponse): void {
    const pending = this.pendingCommand;
    if (!pending) {
      this.emit({
        kind: 'error',
        code: 'UNMATCHED_COMMAND_RESPONSE',
        message: `STM32 returned ${response} without a pending command.`,
        recoverable: true,
      });
      return;
    }
    if (response === 'ERROR_COMMAND') {
      this.rejectPendingCommand('DEVICE_COMMAND_REJECTED', 'STM32 returned ERROR_COMMAND.');
      return;
    }
    const expected = pending.command.name === 'LED_ON' ? 'LED_ON_OK' : 'LED_OFF_OK';
    if (response !== expected) {
      this.emit({
        kind: 'error',
        code: 'UNMATCHED_COMMAND_RESPONSE',
        message: `Expected ${expected}, received ${response}.`,
        recoverable: true,
      });
      return;
    }
    if (pending.timeout) clearTimeout(pending.timeout);
    this.pendingCommand = null;
    this.emit({
      kind: 'acknowledgement',
      acknowledgement: {
        commandId: pending.command.id,
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    });
    pending.resolve();
  }

  private rejectPendingCommand(code: string, message: string): void {
    const pending = this.pendingCommand;
    if (!pending) return;
    if (pending.timeout) clearTimeout(pending.timeout);
    this.pendingCommand = null;
    this.emit({
      kind: 'acknowledgement',
      acknowledgement: { commandId: pending.command.id, status: 'rejected', code, message },
    });
    pending.reject(new TransportError(code, message, true));
  }

  private cancelPendingCommand(failure: TransportError): void {
    const pending = this.pendingCommand;
    if (!pending) return;
    if (pending.timeout) clearTimeout(pending.timeout);
    this.pendingCommand = null;
    pending.reject(failure);
  }

  private appendRawLine(rawLine: string): void {
    const recentRawLines = [...this.diagnostics.recentRawLines, rawLine];
    let bytes = recentRawLines.reduce(
      (total, line) => total + new TextEncoder().encode(line).byteLength,
      0,
    );
    while (recentRawLines.length > MAXIMUM_RAW_LINES || bytes > MAXIMUM_RAW_BYTES) {
      const removed = recentRawLines.shift();
      if (removed) bytes -= new TextEncoder().encode(removed).byteLength;
    }
    this.diagnostics = { ...this.diagnostics, recentRawLines };
  }

  private scheduleStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null;
      this.emit({
        kind: 'error',
        code: 'DATA_STALE',
        message: 'No complete HC-08D frame arrived for 1.5 seconds.',
        recoverable: true,
      });
    }, STALE_DELAY_MS);
  }

  private emitProtocolError(cause: unknown): void {
    const failure =
      cause instanceof ProtocolError
        ? cause
        : new ProtocolError('MALFORMED_FRAME', 'Unexpected parser failure');
    this.emit({
      kind: 'error',
      code: failure.code,
      message: failure.message,
      recoverable: true,
    });
  }

  private onDisconnected(payload: {
    generation: number;
    device: NativeDevice;
    status: 'requested' | 'link-loss';
  }): void {
    if (payload.generation !== this.generation) return;
    this.clearDataTimers();
    this.cancelPendingCommand(
      new TransportError('CONNECTION_LOST', 'HC-08D disconnected before it responded.', true),
    );
    this.connection = { status: 'disconnected' };
    this.emit({
      kind: 'disconnected',
      reason: payload.status === 'requested' ? 'requested' : 'link-loss',
    });
    if (payload.status === 'link-loss' && !this.explicitDisconnect && !this.disposed) {
      this.scheduleReconnect(1);
    }
  }

  private scheduleReconnect(attempt: number): void {
    const device = this.connectedDevice;
    const delay = RECONNECT_DELAYS_MS[attempt - 1];
    if (!device || delay === undefined || this.explicitDisconnect || this.disposed) return;
    this.setConnection({
      status: 'reconnecting',
      device,
      generation: this.generation,
      attempt,
    });
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(timer);
      void this.api
        .connect(device.id)
        .then((result) => this.applyConnectResult(result))
        .catch(() => this.scheduleReconnect(attempt + 1));
    }, delay);
    this.reconnectTimers.add(timer);
  }

  private cancelReconnects(): void {
    for (const timer of this.reconnectTimers) clearTimeout(timer);
    this.reconnectTimers.clear();
  }

  private clearDataTimers(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = null;
  }

  private setConnection(state: DeviceConnectionState): void {
    this.connection = state;
    this.emit({ kind: 'connection', state });
  }

  private emit(packet: DevicePacket): void {
    for (const listener of this.listeners) listener(packet);
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new TransportError('TRANSPORT_DISPOSED', 'The HC-08D transport was closed.', false);
    }
  }
}
