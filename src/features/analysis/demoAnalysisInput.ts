import type {
  AnalysisInput,
  ChannelId,
  FluorescenceSample,
} from '../../domain/types';

const channelIds: readonly ChannelId[] = ['channel1', 'channel2', 'channel3'];

export function createDemoAnalysisInput(
  sessionId: string,
  sampleId: string,
  samples: Record<ChannelId, FluorescenceSample[]>,
): AnalysisInput {
  const slopes: Record<ChannelId, number> = {
    channel1: 10,
    channel2: 20,
    channel3: 5,
  };

  return {
    schemaVersion: 1,
    sessionId,
    sampleId,
    mode: 'three_channel',
    requiredChannelIds: [...channelIds],
    protocolVersion: 'PROTO-DEMO-0.2',
    algorithmVersion: 'ANALYSIS-DEMO-0.1',
    calibrationVersion: 'CAL-DEMO-0.1',
    summaryWindow: 5,
    channels: channelIds.map((channelId) => ({
      channelId,
      calibration: {
        model: 'linear',
        slope: slopes[channelId],
        intercept: 0,
        inputValidRange: [0, 1500],
        concentrationUnit: 'demo-unit',
        isDemo: true,
      },
      samples: samples[channelId],
    })),
    qualityModel: {
      isDemo: true,
      channels: {
        channel1: { weight: 1, targetRange: [20, 100], acceptanceRange: [0, 180] },
        channel2: { weight: 1, targetRange: [20, 100], acceptanceRange: [0, 180] },
        channel3: { weight: 1, targetRange: [20, 150], acceptanceRange: [0, 220] },
      },
      grades: [
        { minScore: 85, grade: 'A-DEMO', suggestion: '演示建议：曲线位于演示目标区间。' },
        { minScore: 70, grade: 'B-DEMO', suggestion: '演示建议：复核曲线稳定性。' },
        { minScore: 0, grade: 'C-DEMO', suggestion: '演示建议：重新采样并检查标定。' },
      ],
    },
  };
}
