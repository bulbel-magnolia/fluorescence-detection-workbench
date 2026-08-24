import { create, type StateCreator } from 'zustand';
import type {
  AnalysisResult,
  BleDevice,
  ChannelId,
  DetectionState,
  DeviceCommandName,
  DeviceConnectionState,
  DevicePacket,
  DeviceStatus,
  FluorescenceSample,
  Hc08dDiagnostics,
  Hc08dSampleFrame,
  HardwareRawResult,
  HistoryRecord,
  NavigationSection,
  TransportMode,
} from '../domain/types';
import { analyze } from '../features/analysis/analyze';
import { createDemoAnalysisInput } from '../features/analysis/demoAnalysisInput';
import { transitionDetectionState } from '../features/detection/stateMachine';
import { createDemoHistoryRecord } from '../features/history/demoHistoryRecord';
import { getHistoryRepository } from '../features/persistence/historyRepository';
import { HC08D_PROTOCOL_VERSION } from '../features/protocol/hc08dProtocol';
import { Hc08dBleTransport } from '../features/transport/Hc08dBleTransport';
import { MockBleTransport, type MockFault } from '../features/transport/MockBleTransport';
import {
  SwitchableBleTransport,
  type CharacteristicSelectionRequest,
} from '../features/transport/SwitchableBleTransport';

const transportModeKey = 'fluorescence-desktop.transport-mode.v1';

function emptySamples(): Record<ChannelId, FluorescenceSample[]> {
  return { channel1: [], channel2: [], channel3: [] };
}

function defaultSampleId(mode: TransportMode): string {
  const prefix = mode === 'hc08d' ? 'HC08D' : 'DEMO';
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-001`;
}

function emptyHardwareDiagnostics(): Hc08dDiagnostics {
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

function persistedTransportMode(): TransportMode {
  if (typeof localStorage === 'undefined') return 'demo';
  const value = localStorage.getItem(transportModeKey);
  return value === 'hc08d' || value === 'demo' ? value : 'demo';
}

function id(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function command(name: DeviceCommandName) {
  return { id: id('command'), name, issuedAt: new Date().toISOString() };
}

type CommandActivityStatus = 'sent' | 'accepted' | 'completed' | 'failed';

interface CommandActivity {
  id: string;
  name: DeviceCommandName;
  status: CommandActivityStatus;
}

export interface AppState {
  section: NavigationSection;
  detectionState: DetectionState;
  connection: DeviceConnectionState;
  devices: BleDevice[];
  hasScanned: boolean;
  deviceStatus: DeviceStatus | null;
  samples: Record<ChannelId, FluorescenceSample[]>;
  selectedChannel: ChannelId | 'all';
  sampleId: string;
  sessionId: string | null;
  sessionStartedAt: string | null;
  latestResult: AnalysisResult | null;
  latestRecord: HistoryRecord | null;
  history: HistoryRecord[];
  transportMode: TransportMode;
  hardwareFrames: Hc08dSampleFrame[];
  clearSignal: number | null;
  latestFrameAt: string | null;
  hardwareDiagnostics: Hc08dDiagnostics;
  lastError: { code: string; message: string } | null;
  lastAcknowledgedCommand: string | null;
  lastCommand: CommandActivity | null;
  mockFault: MockFault;
  syncPendingCount: number;
  persistenceReady: boolean;
  setSection: (section: NavigationSection) => void;
  setSelectedChannel: (channel: ChannelId | 'all') => void;
  setSampleId: (sampleId: string) => void;
  setTransportMode: (mode: TransportMode) => Promise<void>;
  setLed: (enabled: boolean) => Promise<void>;
  selectHardwareCharacteristics: (selection: CharacteristicSelectionRequest) => Promise<void>;
  scan: () => Promise<void>;
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  startDetection: () => Promise<void>;
  stopDetection: () => Promise<void>;
  zero: () => Promise<void>;
  calibrate: () => Promise<void>;
  setMockFault: (fault: MockFault) => void;
  clearError: () => void;
  runDemo: () => Promise<void>;
  loadDemoHistoryRecord: () => Promise<void>;
  hydrateHistory: () => Promise<void>;
  addImportedResult: (
    result: AnalysisResult,
    origin: 'json-import' | 'csv-import',
  ) => Promise<boolean>;
}

function createAppState(transport: SwitchableBleTransport): StateCreator<AppState> {
  return (set, get) => {
    let operationGeneration = 0;
    const move = (next: DetectionState): void => {
      const current = get().detectionState;
      set({ detectionState: transitionDetectionState(current, next) });
    };
    const isActiveAcquisition = (): boolean => {
      const state = get();
      return (
        state.detectionState === 'running' ||
        state.detectionState === 'stopping' ||
        (state.detectionState === 'error' &&
          state.sessionId !== null &&
          state.latestRecord === null)
      );
    };

    const persistRecord = async (record: HistoryRecord): Promise<boolean> => {
      try {
        await getHistoryRepository().upsert(record);
        return true;
      } catch (error) {
        set({
          lastError: {
            code: 'PERSISTENCE_FAILED',
            message: error instanceof Error ? error.message : 'Persistence failed.',
          },
        });
        return false;
      }
    };

    const persistRecordInBackground = (record: HistoryRecord): Promise<boolean> => {
      return getHistoryRepository()
        .upsert(record)
        .then(() => true)
        .catch((error: unknown) => {
          const failedRecord: HistoryRecord = { ...record, syncState: 'sync-error' };
          set((state) => ({
            lastError: {
              code: 'PERSISTENCE_FAILED',
              message: error instanceof Error ? error.message : 'Persistence failed.',
            },
            history: state.history.map((item) =>
              item.id === record.id ? failedRecord : item,
            ),
            latestRecord:
              state.latestRecord?.id === record.id ? failedRecord : state.latestRecord,
          }));
          return false;
        });
    };

    const createInterruptedRecord = (): HistoryRecord | null => {
      if (!isActiveAcquisition()) return null;
      const state = get();
      const sessionId = state.sessionId ?? id('session');
      if (state.transportMode === 'hc08d') {
        const result: HardwareRawResult = {
          schemaVersion: 1,
          sessionId,
          sampleId: state.sampleId,
          resultStatus: 'RAW_ONLY',
          frames: [...state.hardwareFrames],
          protocolVersion: HC08D_PROTOCOL_VERSION,
          algorithmVersion: null,
          calibrationVersion: null,
          isDemo: false,
          disclaimer: '连接中断；仅保留已接收的设备原始数据。',
        };
        return {
          id: id('record'),
          sampleId: state.sampleId,
          createdAt: new Date().toISOString(),
          origin: 'real-live',
          isDemo: false,
          resultStatus: 'RAW_ONLY',
          qualityGrade: null,
          syncState: 'local-only',
          result,
        };
      }

      const analyzed = analyze(
        createDemoAnalysisInput(sessionId, state.sampleId, state.samples),
      );
      const result =
        analyzed.resultStatus === 'ERROR'
          ? analyzed
          : { ...analyzed, resultStatus: 'PARTIAL' as const };
      return {
        id: id('record'),
        sampleId: state.sampleId,
        createdAt: new Date().toISOString(),
        origin: 'demo-live',
        isDemo: true,
        resultStatus: result.resultStatus,
        qualityGrade:
          result.resultStatus === 'ERROR' || result.quality.grade === null
            ? null
            : result.quality.grade,
        syncState: 'local-only',
        result,
      };
    };

    const preserveInterruptedAcquisition = (
      connection: DeviceConnectionState,
      reason: 'requested' | 'link-loss',
    ): Promise<boolean> | null => {
      const record = createInterruptedRecord();
      if (!record) {
        if (get().detectionState === 'incomplete' && get().latestRecord) {
          set({
            connection,
            detectionState: 'incomplete',
            lastError:
              reason === 'requested'
                ? null
                : { code: 'CONNECTION_LOST', message: reason },
          });
          return null;
        }
        set({
          ...clearedAcquisitionSession(),
          connection,
          detectionState: 'disconnected',
          lastError:
            reason === 'requested'
              ? null
              : { code: 'CONNECTION_LOST', message: reason },
        });
        return null;
      }
      set((state) => ({
        connection,
        detectionState: 'incomplete',
        latestResult: record.result.resultStatus === 'RAW_ONLY' ? null : record.result,
        latestRecord: record,
        history: [record, ...state.history],
        syncPendingCount: state.syncPendingCount + 1,
        lastError:
          reason === 'requested' ? null : { code: 'CONNECTION_LOST', message: reason },
      }));
      return persistRecordInBackground(record);
    };
    const clearedAcquisitionSession = () => ({
      deviceStatus: null,
      samples: emptySamples(),
      sampleId: defaultSampleId(get().transportMode),
      sessionId: null,
      sessionStartedAt: null,
      latestResult: null,
      latestRecord: null,
      hardwareFrames: [],
      clearSignal: null,
      latestFrameAt: null,
      hardwareDiagnostics: emptyHardwareDiagnostics(),
      lastAcknowledgedCommand: null,
      lastCommand: null,
    });

    const onPacket = (packet: DevicePacket): void => {
      switch (packet.kind) {
        case 'sample':
          set((state) => ({
            samples: {
              ...state.samples,
              [packet.channelId]: [...state.samples[packet.channelId], packet.sample].slice(-300),
            },
          }));
          break;
        case 'status':
          set({ deviceStatus: packet.status });
          break;
        case 'hardware-frame': {
          const frame = packet.frame;
          const rawSamples: Record<ChannelId, FluorescenceSample> = {
            channel1: {
              sequence: frame.sequence,
              timestamp: frame.receivedAt,
              elapsedMs: frame.elapsedMs,
              rawSignal: frame.signal480,
              background: 0,
              unit: 'a.u.',
            },
            channel2: {
              sequence: frame.sequence,
              timestamp: frame.receivedAt,
              elapsedMs: frame.elapsedMs,
              rawSignal: frame.signal515,
              background: 0,
              unit: 'a.u.',
            },
            channel3: {
              sequence: frame.sequence,
              timestamp: frame.receivedAt,
              elapsedMs: frame.elapsedMs,
              rawSignal: frame.signal555,
              background: 0,
              unit: 'a.u.',
            },
          };
          set((state) => ({
            hardwareFrames:
              state.detectionState === 'running'
                ? [...state.hardwareFrames, frame].slice(-3_600)
                : state.hardwareFrames,
            clearSignal: frame.clearSignal,
            latestFrameAt: frame.receivedAt,
            samples: {
              channel1: [...state.samples.channel1, rawSamples.channel1].slice(-300),
              channel2: [...state.samples.channel2, rawSamples.channel2].slice(-300),
              channel3: [...state.samples.channel3, rawSamples.channel3].slice(-300),
            },
          }));
          break;
        }
        case 'diagnostics':
          set({
            hardwareDiagnostics: packet.diagnostics,
            latestFrameAt: packet.diagnostics.latestFrameAt,
          });
          break;
        case 'connection':
          if (packet.state.status === 'disconnected') {
            void preserveInterruptedAcquisition(packet.state, 'requested');
          } else {
            set({
              connection: packet.state,
              detectionState: packet.state.status === 'connected' ? 'ready' : get().detectionState,
            });
          }
          break;
        case 'acknowledgement': {
          const acknowledgement = packet.acknowledgement;
          if (get().lastCommand?.id !== acknowledgement.commandId) break;
          if (acknowledgement.status === 'accepted') {
            set((state) => ({
              lastCommand: state.lastCommand
                ? { ...state.lastCommand, status: 'accepted' }
                : state.lastCommand,
            }));
          } else if (acknowledgement.status === 'completed') {
            set((state) => ({
              lastAcknowledgedCommand: acknowledgement.commandId,
              lastCommand: state.lastCommand
                ? { ...state.lastCommand, status: 'completed' }
                : state.lastCommand,
            }));
          } else {
            set((state) => ({
              lastError: {
                code: acknowledgement.code,
                message: acknowledgement.message,
              },
              lastCommand: state.lastCommand
                ? { ...state.lastCommand, status: 'failed' }
                : state.lastCommand,
            }));
          }
          break;
        }
        case 'error':
          set((state) => ({
            detectionState:
              packet.recoverable && packet.code === 'DATA_STALE' ? state.detectionState : 'error',
            lastError: { code: packet.code, message: packet.message },
          }));
          break;
        case 'disconnected':
          void preserveInterruptedAcquisition(
            { status: 'disconnected' },
            packet.reason === 'requested' ? 'requested' : 'link-loss',
          );
          break;
      }
    };

    transport.subscribe(onPacket);

    const send = async (name: DeviceCommandName): Promise<void> => {
      const nextCommand = command(name);
      set({ lastCommand: { id: nextCommand.id, name, status: 'sent' } });
      try {
        await transport.sendCommand(nextCommand);
      } catch (error) {
        set((state) => ({
          lastCommand:
            state.lastCommand?.id === nextCommand.id
              ? { ...state.lastCommand, status: 'failed' }
              : state.lastCommand,
        }));
        throw error;
      }
    };

    return {
      section: 'overview',
      detectionState: 'idle',
      connection: { status: 'disconnected' },
      devices: [],
      hasScanned: false,
      deviceStatus: null,
      samples: emptySamples(),
      selectedChannel: 'all',
      sampleId: defaultSampleId(transport.mode),
      sessionId: null,
      sessionStartedAt: null,
      latestResult: null,
      latestRecord: null,
      history: [],
      transportMode: transport.mode,
      hardwareFrames: [],
      clearSignal: null,
      latestFrameAt: null,
      hardwareDiagnostics: emptyHardwareDiagnostics(),
      lastError: null,
      lastAcknowledgedCommand: null,
      lastCommand: null,
      mockFault: 'none',
      syncPendingCount: 0,
      persistenceReady: false,

      setSection: (section) => set({ section }),
      setSelectedChannel: (selectedChannel) => set({ selectedChannel }),
      setSampleId: (sampleId) => set({ sampleId }),
      clearError: () => set({ lastError: null }),

      setTransportMode: async (mode) => {
        if (mode === get().transportMode) {
          localStorage.setItem(transportModeKey, mode);
          return;
        }
        if (isActiveAcquisition()) {
          const persistence = preserveInterruptedAcquisition(get().connection, 'requested');
          if (persistence && !(await persistence)) return;
        }
        operationGeneration += 1;
        try {
          await transport.setMode(mode);
          localStorage.setItem(transportModeKey, mode);
          set({
            transportMode: mode,
            connection: { status: 'disconnected' },
            detectionState: 'idle',
            devices: [],
            hasScanned: false,
            deviceStatus: null,
            samples: emptySamples(),
            sampleId: defaultSampleId(mode),
            hardwareFrames: [],
            clearSignal: null,
            latestFrameAt: null,
            hardwareDiagnostics: emptyHardwareDiagnostics(),
            sessionId: null,
            sessionStartedAt: null,
            latestResult: null,
            latestRecord: null,
            lastCommand: null,
            lastError: null,
            mockFault: 'none',
          });
        } catch (error) {
          set({
            lastError: {
              code: 'TRANSPORT_MODE_SWITCH_FAILED',
              message: error instanceof Error ? error.message : 'Transport mode switch failed.',
            },
          });
        }
      },

      setLed: async (enabled) => {
        if (get().transportMode !== 'hc08d') return;
        try {
          await send(enabled ? 'LED_ON' : 'LED_OFF');
        } catch (error) {
          set({
            lastError: {
              code: 'LED_COMMAND_FAILED',
              message: error instanceof Error ? error.message : 'LED command failed.',
            },
          });
        }
      },

      selectHardwareCharacteristics: async (selection) => {
        try {
          await transport.selectCharacteristics(selection);
          const connection = transport.getConnectionState();
          set({
            connection,
            detectionState: connection.status === 'connected' ? 'ready' : get().detectionState,
            lastError: null,
          });
        } catch (error) {
          set({
            lastError: {
              code: 'CHARACTERISTIC_SELECTION_FAILED',
              message: error instanceof Error ? error.message : 'Characteristic selection failed.',
            },
          });
        }
      },

      runDemo: async () => {
        set({ section: 'detection', lastError: null });
        if (get().transportMode !== 'demo') await get().setTransportMode('demo');
        const current = get();
        if (current.connection.status === 'connected') {
          if (
            current.detectionState === 'connected' ||
            current.detectionState === 'finished' ||
            current.detectionState === 'incomplete'
          ) {
            move('ready');
            return;
          }
          if (
            current.detectionState === 'ready' ||
            current.detectionState === 'running' ||
            current.detectionState === 'zeroing' ||
            current.detectionState === 'calibrating'
          ) {
            return;
          }
          await get().disconnect();
        }
        await get().scan();
        const device = get().devices.find((item) => item.isDemo) ?? get().devices[0];
        if (device) await get().connect(device.id);
      },

      scan: async () => {
        if (isActiveAcquisition()) {
          void preserveInterruptedAcquisition(get().connection, 'requested');
        }
        if (get().detectionState === 'incomplete') move('disconnected');
        const generation = ++operationGeneration;
        move('scanning');
        set({ devices: [], hasScanned: false, lastError: null });
        try {
          const devices = await transport.scan();
          if (generation !== operationGeneration) return;
          set({
            devices,
            hasScanned: true,
            detectionState: 'idle',
            connection: transport.getConnectionState(),
          });
        } catch (error) {
          if (generation !== operationGeneration) return;
          set({
            hasScanned: true,
            detectionState: 'error',
            lastError: {
              code: 'SCAN_FAILED',
              message: error instanceof Error ? error.message : 'Scan failed.',
            },
          });
        }
      },

      connect: async (deviceId) => {
        const generation = ++operationGeneration;
        move('connecting');
        set({ lastError: null });
        try {
          await transport.connect(deviceId);
          if (generation !== operationGeneration) return;
          const connection = transport.getConnectionState();
          set({
            connection,
            detectionState: connection.status === 'connected' ? 'ready' : get().detectionState,
          });
        } catch (error) {
          if (generation !== operationGeneration) return;
          set({
            detectionState: 'error',
            lastError: {
              code: 'CONNECT_FAILED',
              message: error instanceof Error ? error.message : 'Connection failed.',
            },
          });
        }
      },

      disconnect: async () => {
        operationGeneration += 1;
        if (isActiveAcquisition()) {
          void preserveInterruptedAcquisition({ status: 'disconnected' }, 'requested');
        }
        await transport.disconnect();
        if (get().detectionState === 'incomplete' && get().latestRecord) return;
        set({
          ...clearedAcquisitionSession(),
          connection: { status: 'disconnected' },
          detectionState: 'disconnected',
          lastError: null,
        });
      },

      startDetection: async () => {
        const sampleId = get().sampleId.trim();
        if (!sampleId) {
          set({
            lastError: {
              code: 'SAMPLE_ID_REQUIRED',
              message: 'Sample ID is required before acquisition.',
            },
          });
          return;
        }
        move('running');
        const sessionId = id('session');
        set({
          sampleId,
          sessionId,
          sessionStartedAt: new Date().toISOString(),
          samples: emptySamples(),
          hardwareFrames: [],
          latestResult: null,
          latestRecord: null,
          lastError: null,
        });
        if (get().transportMode === 'hc08d') return;
        try {
          await send('START');
        } catch (error) {
          set({
            detectionState: 'error',
            lastError: {
              code: 'START_FAILED',
              message: error instanceof Error ? error.message : 'Start command failed.',
            },
          });
        }
      },

      stopDetection: async () => {
        move('stopping');
        if (get().transportMode === 'hc08d') {
          const state = get();
          const sessionId = state.sessionId ?? id('session');
          const result: HardwareRawResult = {
            schemaVersion: 1,
            sessionId,
            sampleId: state.sampleId,
            resultStatus: 'RAW_ONLY',
            frames: [...state.hardwareFrames],
            protocolVersion: HC08D_PROTOCOL_VERSION,
            algorithmVersion: null,
            calibrationVersion: null,
            isDemo: false,
            disclaimer: '真实设备原始数据；未应用背景、标定或质量分析。',
          };
          const record: HistoryRecord = {
            id: id('record'),
            sampleId: state.sampleId,
            createdAt: new Date().toISOString(),
            origin: 'real-live',
            isDemo: false,
            resultStatus: 'RAW_ONLY',
            qualityGrade: null,
            syncState: 'local-only',
            result,
          };
          const persisted = await persistRecord(record);
          const stateRecord: HistoryRecord = persisted
            ? record
            : { ...record, syncState: 'sync-error' };
          set((current) => ({
            detectionState: result.frames.length > 0 ? 'finished' : 'incomplete',
            latestResult: null,
            latestRecord: stateRecord,
            history: [stateRecord, ...current.history],
            syncPendingCount: current.syncPendingCount + (persisted ? 1 : 0),
          }));
          return;
        }
        try {
          await send('STOP');
          const state = get();
          const sessionId = state.sessionId ?? id('session');
          const result = analyze(
            createDemoAnalysisInput(sessionId, state.sampleId, state.samples),
          );
          const record: HistoryRecord = {
            id: id('record'),
            sampleId: state.sampleId,
            createdAt: new Date().toISOString(),
            origin: 'demo-live',
            isDemo: true,
            resultStatus: result.resultStatus,
            qualityGrade:
              result.resultStatus === 'ERROR' || result.quality.grade === null
                ? null
                : result.quality.grade,
            syncState: 'local-only',
            result,
          };
          const persisted = await persistRecord(record);
          const stateRecord: HistoryRecord = persisted
            ? record
            : { ...record, syncState: 'sync-error' };
          set((current) => ({
            detectionState: result.resultStatus === 'ERROR' ? 'incomplete' : 'finished',
            latestResult: result,
            latestRecord: stateRecord,
            history: [stateRecord, ...current.history],
            syncPendingCount: current.syncPendingCount + (persisted ? 1 : 0),
          }));
        } catch (error) {
          set({
            detectionState: 'incomplete',
            lastError: {
              code: 'STOP_FAILED',
              message: error instanceof Error ? error.message : 'Stop command failed.',
            },
          });
        }
      },

      zero: async () => {
        if (get().transportMode === 'hc08d') {
          set({
            lastError: {
              code: 'FIRMWARE_COMMAND_UNSUPPORTED',
              message: 'HC-08D firmware does not currently support zeroing.',
            },
          });
          return;
        }
        move('zeroing');
        try {
          await send('ZERO');
          set({ detectionState: 'ready', samples: emptySamples() });
        } catch (error) {
          set({
            detectionState: 'error',
            lastError: {
              code: 'ZERO_FAILED',
              message: error instanceof Error ? error.message : 'Zero command failed.',
            },
          });
        }
      },

      calibrate: async () => {
        if (get().transportMode === 'hc08d') {
          set({
            lastError: {
              code: 'FIRMWARE_COMMAND_UNSUPPORTED',
              message: 'HC-08D firmware does not currently support calibration.',
            },
          });
          return;
        }
        move('calibrating');
        try {
          await send('CALIBRATE');
          set({ detectionState: 'ready' });
        } catch (error) {
          set({
            detectionState: 'error',
            lastError: {
              code: 'CALIBRATION_FAILED',
              message: error instanceof Error ? error.message : 'Calibration failed.',
            },
          });
        }
      },

      setMockFault: (mockFault) => {
        if (get().transportMode !== 'demo') return;
        transport.setFault(mockFault);
        set({ mockFault });
      },

      loadDemoHistoryRecord: async () => {
        const record = createDemoHistoryRecord();
        try {
          await getHistoryRepository().upsert(record);
          set((state) => ({
            latestResult: record.result,
            latestRecord: record,
            history: [record, ...state.history],
            syncPendingCount: state.syncPendingCount + 1,
          }));
        } catch (error) {
          set({
            lastError: {
              code: 'PERSISTENCE_FAILED',
              message:
                error instanceof Error ? error.message : 'Persistence failed.',
            },
          });
        }
      },

      hydrateHistory: async () => {
        try {
          const repository = getHistoryRepository();
          const [history, syncPendingCount] = await Promise.all([
            repository.load(),
            repository.pendingCount(),
          ]);
          set({ history, syncPendingCount, persistenceReady: true });
        } catch (error) {
          set({
            persistenceReady: true,
            lastError: {
              code: 'PERSISTENCE_INIT_FAILED',
              message:
                error instanceof Error ? error.message : 'Persistence initialization failed.',
            },
          });
        }
      },

      addImportedResult: async (result, origin) => {
        const record: HistoryRecord = {
          id: id('record'),
          sampleId: result.sampleId ?? 'invalid-import',
          createdAt: new Date().toISOString(),
          origin,
          isDemo: result.isDemo,
          resultStatus: result.resultStatus,
          qualityGrade:
            result.resultStatus === 'ERROR' || result.quality.grade === null
              ? null
              : result.quality.grade,
          syncState: 'local-only',
          result,
        };
        const persisted = await persistRecord(record);
        if (!persisted) return false;
        set((state) => ({
          latestResult: result,
          latestRecord: record,
          history: [record, ...state.history],
          syncPendingCount: state.syncPendingCount + 1,
        }));
        return true;
      },
    };
  };
}

export function createAppStore(transport: SwitchableBleTransport) {
  return create<AppState>()(createAppState(transport));
}

const runtimeTransport = new SwitchableBleTransport(
  {
    demo: () => new MockBleTransport(),
    hc08d: () => new Hc08dBleTransport(),
  },
  persistedTransportMode(),
);

export const useAppStore = createAppStore(runtimeTransport);

export function disposeAppRuntime(): void {
  runtimeTransport.dispose();
}
