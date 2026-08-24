import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BleDevice,
  DeviceCommand,
  DeviceConnectionState,
  DevicePacket,
  Hc08dSampleFrame,
} from '../domain/types';
import type { BleTransport } from '../features/transport/BleTransport';
import { SwitchableBleTransport } from '../features/transport/SwitchableBleTransport';
import { createAppStore } from './appStore';

const hardwareDevice: BleDevice = {
  id: 'hc08d-1',
  name: 'HC-08D',
  rssi: -52,
  batteryLevel: null,
  firmwareVersion: null,
  isDemo: false,
};

function hardwareFrame(sequence: number): Hc08dSampleFrame {
  return {
    sequence,
    receivedAt: `2026-07-24T10:00:00.${String(sequence * 500).padStart(3, '0')}Z`,
    elapsedMs: sequence * 500,
    signal480: 4428 + sequence,
    signal515: 13390 + sequence,
    signal555: 65535,
    clearSignal: 65535,
    saturatedFields: ['555', 'CLR'],
    rawLine: `480:${4428 + sequence},515:${13390 + sequence},555:65535,CLR:65535`,
  };
}

class FakeBleTransport implements BleTransport {
  readonly sendCommand = vi.fn((command: DeviceCommand) => {
    void command;
    return Promise.resolve();
  });
  scanResult: BleDevice[] = [hardwareDevice];
  scanFailure: Error | null = null;
  private readonly listeners = new Set<(packet: DevicePacket) => void>();
  private connection: DeviceConnectionState = {
    status: 'connected',
    device: hardwareDevice,
    generation: 1,
  };

  scan(): Promise<BleDevice[]> {
    return this.scanFailure ? Promise.reject(this.scanFailure) : Promise.resolve(this.scanResult);
  }

  stopScan(): Promise<void> {
    return Promise.resolve();
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.connection = { status: 'disconnected' };
    return Promise.resolve();
  }

  subscribe(listener: (packet: DevicePacket) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConnectionState(): DeviceConnectionState {
    return this.connection;
  }

  dispose(): void {
    this.listeners.clear();
  }

  emit(packet: DevicePacket): void {
    for (const listener of this.listeners) listener(packet);
  }
}

function createHardwareStore() {
  const hardware = new FakeBleTransport();
  const demo = new FakeBleTransport();
  const transport = new SwitchableBleTransport(
    {
      demo: () => demo,
      hc08d: () => hardware,
    },
    'hc08d',
  );
  return { hardware, store: createAppStore(transport), transport };
}

describe('HC-08D application flow', () => {
  beforeEach(() => localStorage.clear());

  it('loads one labeled demonstration record into state and persistence', async () => {
    const { store } = createHardwareStore();
    store.setState({ history: [] });

    await store.getState().loadDemoHistoryRecord();

    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().history[0]).toMatchObject({ origin: 'demo-live', isDemo: true });

    store.setState({ history: [] });
    await store.getState().hydrateHistory();
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().history[0]).toMatchObject({ origin: 'demo-live', isDemo: true });
  });

  it('starts and stops a real session locally without sending START or STOP', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
      sampleId: 'HC08D-001',
    });

    await store.getState().startDetection();
    hardware.emit({ kind: 'hardware-frame', frame: hardwareFrame(0) });
    await store.getState().stopDetection();

    expect(hardware.sendCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'START' }),
    );
    expect(hardware.sendCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'STOP' }),
    );
    expect(store.getState().latestRecord?.resultStatus).toBe('RAW_ONLY');
    expect(store.getState().latestRecord?.result).toMatchObject({
      isDemo: false,
      protocolVersion: 'HC08D-ASCII-DRAFT-0.2',
      frames: [expect.objectContaining({ signal480: 4428, signal555: 65535 })],
    });
  });

  it('maps one hardware frame to three raw chart channels without fake background', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
    });

    await store.getState().startDetection();
    hardware.emit({ kind: 'hardware-frame', frame: hardwareFrame(1) });

    expect(store.getState().samples.channel1.at(-1)).toMatchObject({
      sequence: 1,
      rawSignal: 4429,
      background: 0,
    });
    expect(store.getState().samples.channel2.at(-1)?.rawSignal).toBe(13391);
    expect(store.getState().samples.channel3.at(-1)?.rawSignal).toBe(65535);
    expect(store.getState().clearSignal).toBe(65535);
  });

  it('retains active hardware data and saves an incomplete raw record on link loss', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
      sampleId: 'HC08D-LINK-LOSS-001',
    });

    await store.getState().startDetection();
    hardware.emit({ kind: 'hardware-frame', frame: hardwareFrame(2) });
    hardware.emit({ kind: 'disconnected', reason: 'link-loss' });

    expect(store.getState()).toMatchObject({
      connection: { status: 'disconnected' },
      detectionState: 'incomplete',
      sampleId: 'HC08D-LINK-LOSS-001',
      latestRecord: { resultStatus: 'RAW_ONLY', sampleId: 'HC08D-LINK-LOSS-001' },
    });
    expect(store.getState().samples.channel1).toHaveLength(1);
    expect(store.getState().hardwareFrames).toHaveLength(1);
    expect(store.getState().latestRecord?.result).toMatchObject({
      resultStatus: 'RAW_ONLY',
      frames: [expect.objectContaining({ sequence: 2 })],
    });
    expect(store.getState().history).toHaveLength(1);
  });

  it('retains active hardware data when the user requests disconnect', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
      sampleId: 'HC08D-REQUESTED-DISCONNECT-001',
    });

    await store.getState().startDetection();
    hardware.emit({ kind: 'hardware-frame', frame: hardwareFrame(3) });
    await store.getState().disconnect();

    expect(store.getState()).toMatchObject({
      connection: { status: 'disconnected' },
      detectionState: 'incomplete',
      lastError: null,
      latestRecord: { resultStatus: 'RAW_ONLY' },
    });
    expect(store.getState().samples.channel1).toHaveLength(1);
  });

  it('saves an interrupted raw record before switching transport modes', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
      sampleId: 'HC08D-MODE-SWITCH-001',
    });

    await store.getState().startDetection();
    hardware.emit({ kind: 'hardware-frame', frame: hardwareFrame(4) });
    await store.getState().setTransportMode('demo');

    expect(store.getState()).toMatchObject({
      transportMode: 'demo',
      detectionState: 'idle',
      history: [
        {
          sampleId: 'HC08D-MODE-SWITCH-001',
          resultStatus: 'RAW_ONLY',
        },
      ],
    });
    expect(store.getState().history[0]?.result).toMatchObject({
      frames: [expect.objectContaining({ sequence: 4 })],
    });
    const savedRecordId = store.getState().history[0]?.id;
    store.setState({ history: [] });
    await store.getState().hydrateHistory();
    expect(store.getState().history.some((record) => record.id === savedRecordId)).toBe(true);
  });

  it('preserves an errored acquisition when disconnecting before retry', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
      sampleId: 'HC08D-ERROR-DISCONNECT-001',
    });

    await store.getState().startDetection();
    hardware.emit({ kind: 'hardware-frame', frame: hardwareFrame(5) });
    store.setState({
      detectionState: 'error',
      lastError: { code: 'DATA_STALE', message: 'data stale' },
    });

    await store.getState().disconnect();
    await store.getState().scan();

    expect(store.getState()).toMatchObject({
      detectionState: 'idle',
      latestRecord: {
        sampleId: 'HC08D-ERROR-DISCONNECT-001',
        resultStatus: 'RAW_ONLY',
      },
    });
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().hardwareFrames).toHaveLength(1);
    expect(store.getState().samples.channel1).toHaveLength(1);
  });

  it('preserves an errored acquisition when retry starts from a disconnected link', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
      sampleId: 'HC08D-ERROR-RETRY-001',
    });

    await store.getState().startDetection();
    hardware.emit({ kind: 'hardware-frame', frame: hardwareFrame(6) });
    store.setState({
      connection: { status: 'disconnected' },
      detectionState: 'error',
      lastError: { code: 'CONNECTION_LOST', message: 'connection lost' },
    });

    await store.getState().scan();

    expect(store.getState()).toMatchObject({
      detectionState: 'idle',
      latestRecord: {
        sampleId: 'HC08D-ERROR-RETRY-001',
        resultStatus: 'RAW_ONLY',
      },
    });
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().hardwareFrames).toHaveLength(1);
  });

  it('rejects a blank sample ID before starting acquisition', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
      sampleId: '   ',
    });

    await store.getState().startDetection();

    expect(store.getState()).toMatchObject({
      detectionState: 'ready',
      sessionId: null,
      lastError: { code: 'SAMPLE_ID_REQUIRED' },
    });
    expect(hardware.sendCommand).not.toHaveBeenCalled();
  });

  it('tracks scan completion separately from an initial empty state and scan errors', async () => {
    const { hardware, store } = createHardwareStore();
    hardware.scanResult = [];

    expect(store.getState().hasScanned).toBe(false);
    await store.getState().scan();
    expect(store.getState()).toMatchObject({
      hasScanned: true,
      devices: [],
      detectionState: 'idle',
    });

    hardware.scanFailure = new Error('permission denied');
    await store.getState().scan();
    expect(store.getState()).toMatchObject({
      hasScanned: true,
      detectionState: 'error',
      lastError: { code: 'SCAN_FAILED' },
    });
  });

  it('clears the current acquisition session on disconnect and preserves saved history', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
      sampleId: 'HC08D-DISCONNECT-001',
    });

    await store.getState().startDetection();
    hardware.emit({ kind: 'hardware-frame', frame: hardwareFrame(2) });
    await store.getState().stopDetection();
    const savedHistoryCount = store.getState().history.length;

    await store.getState().disconnect();

    expect(store.getState()).toMatchObject({
      connection: { status: 'disconnected' },
      detectionState: 'disconnected',
      sessionId: null,
      sessionStartedAt: null,
      latestResult: null,
      latestRecord: null,
      hardwareFrames: [],
      clearSignal: null,
      latestFrameAt: null,
    });
    expect(store.getState().samples).toEqual({ channel1: [], channel2: [], channel3: [] });
    expect(store.getState().sampleId).toMatch(/^HC08D-\d{8}-001$/);
    expect(store.getState().history).toHaveLength(savedHistoryCount);
  });

  it('sends only the supported LED commands in real mode', async () => {
    const { hardware, store } = createHardwareStore();
    store.setState({
      connection: { status: 'connected', device: hardwareDevice, generation: 1 },
      detectionState: 'ready',
    });

    await store.getState().setLed(true);
    await store.getState().setLed(false);

    expect(hardware.sendCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'LED_ON' }),
    );
    expect(hardware.sendCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'LED_OFF' }),
    );
  });
});
