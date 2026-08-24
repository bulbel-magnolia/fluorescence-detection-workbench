import type { ChannelId, HistoryRecord } from '../../domain/types';

export type HistorySignalMode = 'corrected' | 'raw' | 'background';
export type HistorySeriesId =
  | ChannelId
  | 'signal480'
  | 'signal515'
  | 'signal555'
  | 'clearSignal';

export interface HistoryPoint {
  elapsedMs: number;
  sequence: number;
  value: number;
}

export interface HistorySeries {
  id: HistorySeriesId;
  labelKey: string;
  color: string;
  points: HistoryPoint[];
}

export interface HistoryPresentation {
  activeMode: HistorySignalMode;
  availableModes: HistorySignalMode[];
  correctionConfigured: boolean;
  series: HistorySeries[];
  summary: {
    sampleCount: number;
    durationMs: number;
    peakValue: number | null;
    latestValue: number | null;
    saturationCount: number;
  };
}

const analyzedChannels: Array<{ id: ChannelId; labelKey: string; color: string }> = [
  { id: 'channel1', labelKey: 'channels.channel1', color: '#00f5ff' },
  { id: 'channel2', labelKey: 'channels.channel2', color: '#ff4fa3' },
  { id: 'channel3', labelKey: 'channels.channel3', color: '#ffc247' },
];

const hardwareChannels = [
  { id: 'signal480', labelKey: 'detection.signal480', color: '#00f5ff' },
  { id: 'signal515', labelKey: 'detection.signal515', color: '#ff4fa3' },
  { id: 'signal555', labelKey: 'detection.signal555', color: '#ffc247' },
  { id: 'clearSignal', labelKey: 'detection.clearSignal', color: '#8c6cff' },
] as const;

export function downsampleHistoryPoints(
  points: HistoryPoint[],
  limit = 600,
): HistoryPoint[] {
  if (points.length <= limit) return points;
  if (limit <= 1) return points.slice(0, Math.max(0, limit));

  const lastIndex = points.length - 1;
  return Array.from(
    { length: limit },
    (_, index) => points[Math.round((index / (limit - 1)) * lastIndex)]!,
  );
}

function findNearestPoint(points: HistoryPoint[], elapsedMs: number): HistoryPoint | null {
  if (points.length === 0) return null;

  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.elapsedMs < elapsedMs) low = middle + 1;
    else high = middle;
  }

  const after = points[low]!;
  const before = points[Math.max(0, low - 1)]!;
  return Math.abs(before.elapsedMs - elapsedMs) <= Math.abs(after.elapsedMs - elapsedMs)
    ? before
    : after;
}

export function findNearestHistoryValues(
  series: HistorySeries[],
  elapsedMs: number,
): Array<{ id: HistorySeriesId; labelKey: string; color: string; value: number }> {
  return series.flatMap((item) => {
    const point = findNearestPoint(item.points, elapsedMs);
    return point
      ? [{ id: item.id, labelKey: item.labelKey, color: item.color, value: point.value }]
      : [];
  });
}

export function buildHistoryPresentation(
  record: HistoryRecord,
  requestedMode: HistorySignalMode,
): HistoryPresentation {
  const result = record.result;
  const isRaw = result.resultStatus === 'RAW_ONLY';
  const isError = result.resultStatus === 'ERROR';
  const availableModes: HistorySignalMode[] = isRaw
    ? ['raw']
    : isError
      ? []
      : ['corrected', 'raw', 'background'];
  const activeMode = availableModes.includes(requestedMode)
    ? requestedMode
    : (availableModes[0] ?? 'raw');

  let series: HistorySeries[];
  let saturationCount = 0;
  let rawSampleCount: number | null = null;

  if (result.resultStatus === 'RAW_ONLY') {
    series = hardwareChannels.map((channel) => ({
      ...channel,
      points: result.frames.map((frame) => ({
        elapsedMs: frame.elapsedMs,
        sequence: frame.sequence,
        value: frame[channel.id],
      })),
    }));
    saturationCount = result.frames.filter(
      (frame) => frame.saturatedFields.length > 0,
    ).length;
    rawSampleCount = result.frames.length;
  } else if (result.resultStatus === 'ERROR') {
    series = [];
  } else {
    series = analyzedChannels.flatMap((channel) => {
      const analyzed = result.channels[channel.id];
      if (!analyzed) return [];
      return [
        {
          ...channel,
          points: analyzed.curve.map((sample) => ({
            elapsedMs: sample.elapsedMs,
            sequence: sample.sequence,
            value:
              activeMode === 'raw'
                ? sample.rawSignal
                : activeMode === 'background'
                  ? sample.background
                  : sample.correctedSignal,
          })),
        },
      ];
    });
  }

  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const latestValues = series.flatMap((item) => item.points.at(-1)?.value ?? []);
  const sampleCount =
    rawSampleCount ?? Math.max(0, ...series.map((item) => item.points.length));
  const durationMs = Math.max(
    0,
    ...series.flatMap((item) => item.points.map((point) => point.elapsedMs)),
  );

  return {
    activeMode,
    availableModes,
    correctionConfigured: !isRaw && !isError,
    series,
    summary: {
      sampleCount,
      durationMs,
      peakValue: values.length ? Math.max(...values) : null,
      latestValue: latestValues.length ? Math.max(...latestValues) : null,
      saturationCount,
    },
  };
}
