import type {
  AnalysisChannelInput,
  AnalysisInput,
  AnalysisMode,
  ChannelId,
  FluorescenceSample,
  LinearCalibration,
  QualityGradeRule,
  QualityModel,
} from '../../domain/types';

export class AnalysisInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisInputError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AnalysisInputError(`${field} 必须是有限数值`);
  }
  return value;
}

function integer(value: unknown, field: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    const expectation =
      minimum === 0 ? '非负整数' : minimum === 1 ? '正整数' : `不小于 ${minimum} 的整数`;
    throw new AnalysisInputError(`${field} 必须是${expectation}`);
  }
  return value;
}

function nonemptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AnalysisInputError(`${field} 必须是非空字符串`);
  }
  return value.trim();
}

function isoTimestamp(value: unknown, field: string): string {
  const text = nonemptyString(value, field);
  if (Number.isNaN(Date.parse(text))) {
    throw new AnalysisInputError(`${field} 必须是 ISO 8601 时间`);
  }
  return text;
}

function range(value: unknown, field: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new AnalysisInputError(`${field} 必须是 [下限, 上限]`);
  }
  const low = finiteNumber(value[0], `${field}[0]`);
  const high = finiteNumber(value[1], `${field}[1]`);
  if (low >= high) {
    throw new AnalysisInputError(`${field} 必须满足下限小于上限`);
  }
  return [low, high];
}

function channelId(value: unknown, field = 'channelId'): ChannelId {
  if (value !== 'channel1' && value !== 'channel2' && value !== 'channel3') {
    throw new AnalysisInputError(`${field} 必须是 channel1、channel2 或 channel3`);
  }
  return value;
}

function sample(value: unknown, id: ChannelId, index: number): FluorescenceSample {
  const prefix = `channels[${id}].samples[${index}]`;
  if (!isRecord(value)) {
    throw new AnalysisInputError(`${prefix} 必须是对象`);
  }
  const elapsedMs = finiteNumber(value.elapsedMs, `${prefix}.elapsedMs`);
  if (elapsedMs < 0) {
    throw new AnalysisInputError(`${prefix}.elapsedMs 不得为负数`);
  }
  if (value.unit !== 'a.u.') {
    throw new AnalysisInputError(`${prefix}.unit 当前必须为 a.u.`);
  }
  return {
    sequence: integer(value.sequence, `${prefix}.sequence`, 0),
    timestamp: isoTimestamp(value.timestamp, `${prefix}.timestamp`),
    elapsedMs,
    rawSignal: finiteNumber(value.rawSignal, `${prefix}.rawSignal`),
    background: finiteNumber(value.background, `${prefix}.background`),
    unit: 'a.u.',
  };
}

function calibration(value: unknown, id: ChannelId): LinearCalibration {
  const field = `channels[${id}].calibration`;
  if (!isRecord(value)) {
    throw new AnalysisInputError(`${field} 必须是对象`);
  }
  if (value.model !== 'linear') {
    throw new AnalysisInputError(`channels[${id}] 当前只支持 linear 标定模型`);
  }
  const slope = finiteNumber(value.slope, `${field}.slope`);
  if (slope === 0) {
    throw new AnalysisInputError(`${field}.slope 不得为 0`);
  }
  return {
    model: 'linear',
    slope,
    intercept: finiteNumber(value.intercept, `${field}.intercept`),
    inputValidRange: range(value.inputValidRange, `${field}.inputValidRange`),
    concentrationUnit: nonemptyString(value.concentrationUnit, `${field}.concentrationUnit`),
    isDemo: value.isDemo === true,
  };
}

function analysisChannel(value: unknown): AnalysisChannelInput {
  if (!isRecord(value)) {
    throw new AnalysisInputError('channels[] 必须是对象');
  }
  const id = channelId(value.channelId);
  if (!Array.isArray(value.samples) || value.samples.length === 0) {
    throw new AnalysisInputError(`channels[${id}].samples 不得为空`);
  }
  return {
    channelId: id,
    calibration: calibration(value.calibration, id),
    samples: value.samples.map((item, index) => sample(item, id, index)),
  };
}

function qualityModel(value: unknown): QualityModel | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.channels)) {
    throw new AnalysisInputError('qualityModel.channels 不得为空');
  }
  const channels: QualityModel['channels'] = {};
  for (const [key, ruleValue] of Object.entries(value.channels)) {
    const id = channelId(key, 'qualityModel.channels[]');
    if (!isRecord(ruleValue)) {
      throw new AnalysisInputError(`qualityModel.channels[${id}] 必须是对象`);
    }
    const weight = finiteNumber(ruleValue.weight, `qualityModel.channels[${id}].weight`);
    if (weight <= 0) {
      throw new AnalysisInputError(`qualityModel.channels[${id}].weight 必须大于 0`);
    }
    channels[id] = {
      weight,
      targetRange: range(ruleValue.targetRange, `qualityModel.channels[${id}].targetRange`),
      acceptanceRange: range(
        ruleValue.acceptanceRange,
        `qualityModel.channels[${id}].acceptanceRange`,
      ),
    };
  }
  if (!Array.isArray(value.grades) || value.grades.length === 0) {
    throw new AnalysisInputError('qualityModel.grades 不得为空');
  }
  const grades: QualityGradeRule[] = value.grades.map((item, index) => {
    if (!isRecord(item)) {
      throw new AnalysisInputError(`qualityModel.grades[${index}] 必须是对象`);
    }
    return {
      minScore: finiteNumber(item.minScore, `qualityModel.grades[${index}].minScore`),
      grade: nonemptyString(item.grade, `qualityModel.grades[${index}].grade`),
      suggestion: nonemptyString(item.suggestion, `qualityModel.grades[${index}].suggestion`),
    };
  });
  return { isDemo: value.isDemo === true, channels, grades };
}

export function parseAnalysisInput(value: unknown): AnalysisInput {
  if (!isRecord(value)) {
    throw new AnalysisInputError('顶层输入必须是对象');
  }
  if (value.schemaVersion !== 1) {
    throw new AnalysisInputError('schemaVersion 当前必须为 1');
  }
  if (value.mode !== 'three_channel' && value.mode !== 'single_channel') {
    throw new AnalysisInputError('mode 必须为 three_channel 或 single_channel');
  }
  const mode: AnalysisMode = value.mode;
  if (!Array.isArray(value.requiredChannelIds) || value.requiredChannelIds.length === 0) {
    throw new AnalysisInputError('requiredChannelIds 必须是非空数组');
  }
  const requiredChannelIds = value.requiredChannelIds.map((item) =>
    channelId(item, 'requiredChannelIds[]'),
  );
  if (new Set(requiredChannelIds).size !== requiredChannelIds.length) {
    throw new AnalysisInputError('requiredChannelIds 不得重复');
  }
  if (mode === 'three_channel' && requiredChannelIds.length !== 3) {
    throw new AnalysisInputError('three_channel 模式必须声明三个必需通道');
  }
  if (mode === 'single_channel' && requiredChannelIds.length !== 1) {
    throw new AnalysisInputError('single_channel 模式必须声明一个必需通道');
  }
  if (!Array.isArray(value.channels) || value.channels.length === 0) {
    throw new AnalysisInputError('channels 必须是非空数组');
  }
  const channels = value.channels.map(analysisChannel);
  if (new Set(channels.map((item) => item.channelId)).size !== channels.length) {
    throw new AnalysisInputError('channelId 重复');
  }
  const present = new Set(channels.map((item) => item.channelId));
  const missing = requiredChannelIds.filter((id) => !present.has(id));
  if (missing.length > 0) {
    throw new AnalysisInputError(`缺少必需通道：${missing.join(', ')}`);
  }
  const summaryWindow =
    value.summaryWindow === undefined ? 3 : integer(value.summaryWindow, 'summaryWindow', 1);
  return {
    schemaVersion: 1,
    sessionId: nonemptyString(value.sessionId, 'sessionId'),
    sampleId: nonemptyString(value.sampleId, 'sampleId'),
    mode,
    requiredChannelIds,
    protocolVersion: nonemptyString(value.protocolVersion, 'protocolVersion'),
    algorithmVersion: nonemptyString(value.algorithmVersion, 'algorithmVersion'),
    calibrationVersion: nonemptyString(value.calibrationVersion, 'calibrationVersion'),
    summaryWindow,
    channels,
    qualityModel: qualityModel(value.qualityModel),
  };
}
