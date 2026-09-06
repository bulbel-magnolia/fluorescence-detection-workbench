export type ChannelId = 'channel1' | 'channel2' | 'channel3';
export type AnalysisMode = 'three_channel' | 'single_channel';
export type DataOrigin = 'demo-live' | 'real-live' | 'json-import' | 'csv-import';
export type SignalUnit = 'a.u.';
export type TransportMode = 'demo' | 'hc08d';
export type Hc08dSignalField = '480' | '515' | '555' | 'CLR';

export interface Hc08dSampleFrame {
  sequence: number;
  receivedAt: string;
  elapsedMs: number;
  signal480: number;
  signal515: number;
  signal555: number;
  clearSignal: number;
  saturatedFields: Hc08dSignalField[];
  rawLine: string;
}

export type Hc08dCommandResponse = 'LED_ON_OK' | 'LED_OFF_OK' | 'ERROR_COMMAND';

export type Hc08dProtocolMessage =
  | { kind: 'sample'; frame: Hc08dSampleFrame }
  | {
      kind: 'command-response';
      response: Hc08dCommandResponse;
      rawLine: string;
    };

export interface Hc08dCharacteristicInfo {
  serviceUuid: string;
  characteristicUuid: string;
  notify: boolean;
  indicate: boolean;
  write: boolean;
  writeWithoutResponse: boolean;
}

export interface Hc08dDiagnostics {
  serviceUuid: string | null;
  notifyCharacteristicUuid: string | null;
  writeCharacteristicUuid: string | null;
  rssi: number | null;
  latestFrameAt: string | null;
  recentRawLines: string[];
  candidates: Hc08dCharacteristicInfo[];
}

export type DetectionState =
  | 'idle'
  | 'bluetoothUnavailable'
  | 'permissionRequired'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'preparing'
  | 'zeroing'
  | 'calibrating'
  | 'ready'
  | 'running'
  | 'stopping'
  | 'finished'
  | 'incomplete'
  | 'disconnected'
  | 'error';

export type NavigationSection =
  'overview' | 'detection' | 'import' | 'history' | 'team' | 'settings';

export interface BleDevice {
  id: string;
  name: string;
  rssi: number | null;
  batteryLevel: number | null;
  firmwareVersion: string | null;
  isDemo: boolean;
}

export type DeviceConnectionState =
  | { status: 'disconnected' }
  | { status: 'scanning'; operationId: string }
  | { status: 'connecting'; deviceId: string; generation: number }
  | { status: 'discovering'; device: BleDevice; generation: number }
  | { status: 'connected'; device: BleDevice; generation: number }
  | {
      status: 'reconnecting';
      device: BleDevice;
      generation: number;
      attempt: number;
    }
  | { status: 'error'; code: string; message: string };

export type DeviceCommandName =
  'START' | 'STOP' | 'ZERO' | 'CALIBRATE' | 'GET_STATUS' | 'LED_ON' | 'LED_OFF';

export interface DeviceCommand {
  id: string;
  name: DeviceCommandName;
  issuedAt: string;
}

export type CommandAcknowledgement =
  | { commandId: string; status: 'accepted'; acceptedAt: string }
  | { commandId: string; status: 'rejected'; code: string; message: string }
  | { commandId: string; status: 'completed'; completedAt: string };

export interface FluorescenceSample {
  sequence: number;
  timestamp: string;
  elapsedMs: number;
  rawSignal: number;
  background: number;
  correctedSignal?: number;
  unit: SignalUnit;
}

export interface DeviceStatus {
  batteryLevel: number;
  temperatureCelsius: number;
  sensorState: 'ready' | 'measuring' | 'warning' | 'error';
  errorCode: string | null;
}

export type DevicePacket =
  | { kind: 'sample'; channelId: ChannelId; sample: FluorescenceSample }
  | { kind: 'status'; status: DeviceStatus }
  | { kind: 'acknowledgement'; acknowledgement: CommandAcknowledgement }
  | { kind: 'hardware-frame'; frame: Hc08dSampleFrame }
  | { kind: 'diagnostics'; diagnostics: Hc08dDiagnostics }
  | { kind: 'connection'; state: DeviceConnectionState }
  | { kind: 'error'; code: string; message: string; recoverable: boolean }
  | { kind: 'disconnected'; reason: 'requested' | 'link-loss' | 'sensor-error' };

export interface LinearCalibration {
  model: 'linear';
  slope: number;
  intercept: number;
  inputValidRange: readonly [number, number];
  concentrationUnit: string;
  isDemo: boolean;
}

export interface AnalysisChannelInput {
  channelId: ChannelId;
  calibration: LinearCalibration;
  samples: FluorescenceSample[];
}

export interface QualityChannelRule {
  weight: number;
  targetRange: readonly [number, number];
  acceptanceRange: readonly [number, number];
}

export interface QualityGradeRule {
  minScore: number;
  grade: string;
  suggestion: string;
}

export interface QualityModel {
  isDemo: boolean;
  channels: Partial<Record<ChannelId, QualityChannelRule>>;
  grades: QualityGradeRule[];
}

export interface AnalysisInput {
  schemaVersion: 1;
  sessionId: string;
  sampleId: string;
  mode: AnalysisMode;
  requiredChannelIds: ChannelId[];
  protocolVersion: string;
  algorithmVersion: string;
  calibrationVersion: string;
  summaryWindow?: number;
  channels: AnalysisChannelInput[];
  qualityModel: QualityModel | null;
}

export interface AnalyzedChannel {
  channelId: ChannelId;
  sampleCount: number;
  summaryMethod: string;
  summaryCorrectedSignal: number;
  signalUnit: SignalUnit;
  concentration: number | null;
  concentrationUnit: string;
  concentrationStatus: 'OK' | 'OUT_OF_CALIBRATION_RANGE';
  calibrationModel: 'linear';
  calibrationIsDemo: boolean;
  warnings: string[];
  curve: Array<FluorescenceSample & { correctedSignal: number }>;
}

export type QualityEvaluation =
  | {
      status: 'PENDING_MODEL' | 'NOT_EVALUATED';
      score: null;
      grade: null;
      suggestion: string;
      isDemo: boolean;
    }
  | {
      status: 'DEMO_ONLY' | 'OK';
      score: number;
      grade: string;
      suggestion: string;
      componentScores: Partial<Record<ChannelId, number>>;
      isDemo: boolean;
    };

export interface AnalysisSuccess {
  schemaVersion: 1;
  sessionId: string;
  sampleId: string;
  mode: AnalysisMode;
  resultStatus: 'OK' | 'PARTIAL';
  channels: Partial<Record<ChannelId, AnalyzedChannel>>;
  quality: QualityEvaluation;
  protocolVersion: string;
  algorithmVersion: string;
  calibrationVersion: string;
  isDemo: boolean;
  disclaimer: string;
}

export interface AnalysisFailure {
  schemaVersion: 1;
  sessionId: string | null;
  sampleId: string | null;
  resultStatus: 'ERROR';
  error: { code: 'INVALID_INPUT'; message: string };
  protocolVersion: string | null;
  algorithmVersion: string | null;
  calibrationVersion: string | null;
  isDemo: true;
  disclaimer: string;
}

export type AnalysisResult = AnalysisSuccess | AnalysisFailure;

export interface HardwareRawResult {
  schemaVersion: 1;
  sessionId: string;
  sampleId: string;
  resultStatus: 'RAW_ONLY';
  frames: Hc08dSampleFrame[];
  protocolVersion: 'HC08D-ASCII-DRAFT-0.2';
  algorithmVersion: null;
  calibrationVersion: null;
  isDemo: false;
  disclaimer: string;
}

export type RecordResult = AnalysisResult | HardwareRawResult;

export interface DetectionSession {
  id: string;
  sampleId: string;
  startedAt: string;
  completedAt: string | null;
  origin: DataOrigin;
  state: DetectionState;
  samples: Record<ChannelId, FluorescenceSample[]>;
  result: AnalysisResult | null;
}

export type SyncState =
  'local-only' | 'pending' | 'retrying' | 'synced' | 'sync-error' | 'pending-delete';

export interface HistoryRecord {
  id: string;
  sampleId: string;
  createdAt: string;
  origin: DataOrigin;
  isDemo: boolean;
  resultStatus: RecordResult['resultStatus'];
  qualityGrade: string | null;
  syncState: SyncState;
  result: RecordResult;
}

export type WorkspaceRole = 'admin' | 'member';

export interface WorkspaceMember {
  id: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  status: 'active' | 'invited';
}

export interface AppError {
  layer: 'transport' | 'protocol' | 'analysis' | 'persistence' | 'auth' | 'sync';
  code: string;
  message: string;
  recoverable: boolean;
}
