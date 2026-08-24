import type {
  AnalysisFailure,
  AnalysisInput,
  AnalysisResult,
  AnalyzedChannel,
  ChannelId,
  QualityChannelRule,
  QualityEvaluation,
  QualityModel,
} from '../../domain/types';
import { AnalysisInputError, parseAnalysisInput } from './validation';

export const ANALYSIS_DISCLAIMER = '演示参数与结果仅用于软件联调，不构成实验、质量或监管结论。';

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function analyzeChannel(
  channel: AnalysisInput['channels'][number],
  summaryWindow: number,
): AnalyzedChannel {
  const samples = [...channel.samples].sort(
    (left, right) => left.elapsedMs - right.elapsedMs || left.sequence - right.sequence,
  );
  const sequences = samples.map((sample) => sample.sequence);
  if (new Set(sequences).size !== sequences.length) {
    throw new AnalysisInputError(`channels[${channel.channelId}] 存在重复 sequence`);
  }

  const warnings = new Set<string>();
  const sortedSequences = [...sequences].sort((left, right) => left - right);
  for (let index = 1; index < sortedSequences.length; index += 1) {
    if (sortedSequences[index]! - sortedSequences[index - 1]! > 1) {
      warnings.add('SEQUENCE_GAP');
    }
  }

  const curve = samples.map((sample) => {
    const difference = sample.rawSignal - sample.background;
    if (difference < 0) {
      warnings.add('NEGATIVE_CORRECTED_CLIPPED');
    }
    return {
      ...sample,
      elapsedMs: round6(sample.elapsedMs),
      rawSignal: round6(sample.rawSignal),
      background: round6(sample.background),
      correctedSignal: round6(Math.max(0, difference)),
    };
  });
  const windowSize = Math.min(summaryWindow, curve.length);
  const summaryCorrectedSignal = round6(
    median(curve.slice(-windowSize).map((sample) => sample.correctedSignal)),
  );
  const [validLow, validHigh] = channel.calibration.inputValidRange;
  const inRange = summaryCorrectedSignal >= validLow && summaryCorrectedSignal <= validHigh;
  if (!inRange) {
    warnings.add('NO_EXTRAPOLATION');
  }

  return {
    channelId: channel.channelId,
    sampleCount: curve.length,
    summaryMethod: `median_last_${windowSize}`,
    summaryCorrectedSignal,
    signalUnit: 'a.u.',
    concentration: inRange
      ? round6((summaryCorrectedSignal - channel.calibration.intercept) / channel.calibration.slope)
      : null,
    concentrationUnit: channel.calibration.concentrationUnit,
    concentrationStatus: inRange ? 'OK' : 'OUT_OF_CALIBRATION_RANGE',
    calibrationModel: 'linear',
    calibrationIsDemo: channel.calibration.isDemo,
    warnings: [...warnings].sort(),
    curve,
  };
}

function channelQualityScore(
  concentration: number,
  rule: QualityChannelRule,
  channelId: ChannelId,
): number {
  const [targetLow, targetHigh] = rule.targetRange;
  const [acceptLow, acceptHigh] = rule.acceptanceRange;
  if (!(acceptLow <= targetLow && targetLow < targetHigh && targetHigh <= acceptHigh)) {
    throw new AnalysisInputError(`qualityModel.channels[${channelId}] 范围关系无效`);
  }
  if (concentration >= targetLow && concentration <= targetHigh) {
    return 100;
  }
  if (concentration < targetLow) {
    return concentration <= acceptLow
      ? 0
      : (100 * (concentration - acceptLow)) / (targetLow - acceptLow);
  }
  return concentration >= acceptHigh
    ? 0
    : (100 * (acceptHigh - concentration)) / (acceptHigh - targetHigh);
}

function evaluateQuality(
  channels: Partial<Record<ChannelId, AnalyzedChannel>>,
  requiredIds: readonly ChannelId[],
  model: QualityModel | null,
): QualityEvaluation {
  if (model === null) {
    return {
      status: 'PENDING_MODEL',
      score: null,
      grade: null,
      suggestion: '质量模型、权重和阈值尚待湿实验组确认。',
      isDemo: true,
    };
  }

  const componentScores: Partial<Record<ChannelId, number>> = {};
  let weightedSum = 0;
  let totalWeight = 0;
  for (const channelId of requiredIds) {
    const result = channels[channelId];
    if (!result) {
      throw new AnalysisInputError(`缺少必需通道：${channelId}`);
    }
    if (result.concentration === null) {
      return {
        status: 'NOT_EVALUATED',
        score: null,
        grade: null,
        suggestion: '至少一个通道超出标定范围，未生成质量结论。',
        isDemo: model.isDemo,
      };
    }
    const rule = model.channels[channelId];
    if (!rule) {
      throw new AnalysisInputError(`qualityModel.channels 缺少 ${channelId}`);
    }
    const component = round6(channelQualityScore(result.concentration, rule, channelId));
    componentScores[channelId] = component;
    weightedSum += component * rule.weight;
    totalWeight += rule.weight;
  }
  const score = round6(weightedSum / totalWeight);
  const grades = [...model.grades].sort((left, right) => right.minScore - left.minScore);
  const selected = grades.find((grade) => score >= grade.minScore);
  if (!selected) {
    throw new AnalysisInputError('qualityModel.grades 必须覆盖最低分');
  }
  return {
    status: model.isDemo ? 'DEMO_ONLY' : 'OK',
    score,
    grade: selected.grade,
    suggestion: selected.suggestion,
    componentScores,
    isDemo: model.isDemo,
  };
}

function failure(payload: unknown, error: AnalysisInputError): AnalysisFailure {
  const source: Record<string, unknown> | null =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? Object.fromEntries(Object.entries(payload))
      : null;
  const value = (key: string): string | null => {
    if (!source) {
      return null;
    }
    const candidate = source[key];
    return typeof candidate === 'string' ? candidate : null;
  };
  return {
    schemaVersion: 1,
    sessionId: value('sessionId'),
    sampleId: value('sampleId'),
    resultStatus: 'ERROR',
    error: { code: 'INVALID_INPUT', message: error.message },
    protocolVersion: value('protocolVersion'),
    algorithmVersion: value('algorithmVersion'),
    calibrationVersion: value('calibrationVersion'),
    isDemo: true,
    disclaimer: ANALYSIS_DISCLAIMER,
  };
}

export function analyzeOrThrow(payload: unknown): Exclude<AnalysisResult, AnalysisFailure> {
  const input = parseAnalysisInput(payload);
  const channels: Partial<Record<ChannelId, AnalyzedChannel>> = {};
  for (const channelId of input.requiredChannelIds) {
    const channel = input.channels.find((item) => item.channelId === channelId);
    if (!channel) {
      throw new AnalysisInputError(`缺少必需通道：${channelId}`);
    }
    channels[channelId] = analyzeChannel(channel, input.summaryWindow ?? 3);
  }
  const quality = evaluateQuality(channels, input.requiredChannelIds, input.qualityModel);
  const resultStatus = input.requiredChannelIds.some(
    (channelId) => channels[channelId]?.concentration === null,
  )
    ? 'PARTIAL'
    : 'OK';
  const isDemo =
    quality.isDemo ||
    input.requiredChannelIds.some((channelId) => channels[channelId]?.calibrationIsDemo === true);
  return {
    schemaVersion: 1,
    sessionId: input.sessionId,
    sampleId: input.sampleId,
    mode: input.mode,
    resultStatus,
    channels,
    quality,
    protocolVersion: input.protocolVersion,
    algorithmVersion: input.algorithmVersion,
    calibrationVersion: input.calibrationVersion,
    isDemo,
    disclaimer: ANALYSIS_DISCLAIMER,
  };
}

export function analyze(payload: unknown): AnalysisResult {
  try {
    return analyzeOrThrow(payload);
  } catch (error) {
    if (error instanceof AnalysisInputError) {
      return failure(payload, error);
    }
    throw error;
  }
}
