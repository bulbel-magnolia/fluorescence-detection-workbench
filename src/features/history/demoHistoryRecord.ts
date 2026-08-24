import type {
  AnalysisResult,
  ChannelId,
  FluorescenceSample,
  HistoryRecord,
} from '../../domain/types';
import { analyze } from '../analysis/analyze';
import { createDemoAnalysisInput } from '../analysis/demoAnalysisInput';

interface DemoHistoryRecordOptions {
  now?: string;
  recordId?: string;
  sessionId?: string;
  sampleId?: string;
}

export type DemoHistoryRecord = HistoryRecord & { result: AnalysisResult };

const channelIds: readonly ChannelId[] = ['channel1', 'channel2', 'channel3'];
const responseScales: Record<ChannelId, number> = {
  channel1: 72,
  channel2: 94,
  channel3: 56,
};

function generatedId(prefix: string): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function createDemoHistoryRecord(
  options: DemoHistoryRecordOptions = {},
): DemoHistoryRecord {
  const now = options.now ?? new Date().toISOString();
  const startTime = new Date(now).getTime();
  const sessionId = options.sessionId ?? generatedId('session-demo');
  const sampleId =
    options.sampleId ?? `DEMO-HISTORY-${now.slice(0, 10).replaceAll('-', '')}`;
  const samples = Object.fromEntries(
    channelIds.map((channelId) => {
      const responseScale = responseScales[channelId];
      const channelSamples: FluorescenceSample[] = Array.from(
        { length: 61 },
        (_, sequence) => {
          const elapsedMs = sequence * 200;
          const background = 22 + Math.sin(sequence / 6) * 0.8;
          const correctedSignal =
            responseScale * (1 - Math.exp(-elapsedMs / 3200)) +
            Math.sin(sequence / 4) * 1.1;
          return {
            sequence,
            timestamp: new Date(startTime + elapsedMs).toISOString(),
            elapsedMs,
            rawSignal: background + Math.max(0, correctedSignal),
            background,
            unit: 'a.u.' as const,
          };
        },
      );
      return [channelId, channelSamples];
    }),
  ) as Record<ChannelId, FluorescenceSample[]>;

  const result = analyze(createDemoAnalysisInput(sessionId, sampleId, samples));
  const qualityGrade =
    result.resultStatus === 'ERROR' || result.quality.grade === null ? null : result.quality.grade;

  return {
    id: options.recordId ?? generatedId('record-demo'),
    sampleId,
    createdAt: now,
    origin: 'demo-live',
    isDemo: true,
    resultStatus: result.resultStatus,
    qualityGrade,
    syncState: 'local-only',
    result,
  };
}
