import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelId, FluorescenceSample } from '../domain/types';
import { Icon } from './Icon';

const channels: readonly ChannelId[] = ['channel1', 'channel2', 'channel3'];
const colors: Record<ChannelId, string> = {
  channel1: '#0a9f9a',
  channel2: '#df3f86',
  channel3: '#e7a837',
};

interface SignalChartProps {
  samples: Record<ChannelId, FluorescenceSample[]>;
  selected: ChannelId | 'all';
  valueMode: 'corrected' | 'raw';
  saturatedSequences?: Partial<Record<ChannelId, number[]>> | undefined;
}

export function SignalChart({
  samples,
  selected,
  valueMode,
  saturatedSequences = {},
}: SignalChartProps) {
  const { t } = useTranslation();
  const gradientId = useId().replaceAll(':', '');
  const visible = selected === 'all' ? channels : [selected];
  const allPoints = visible.flatMap((channel) => samples[channel]);
  const hasData = allPoints.length > 0;
  const maxX = Math.max(1, ...allPoints.map((sample) => sample.elapsedMs));
  const valueOf = (sample: FluorescenceSample): number =>
    valueMode === 'raw' ? sample.rawSignal : Math.max(0, sample.rawSignal - sample.background);
  const values = allPoints.map(valueOf);
  const maxY = Math.max(100, ...values) * 1.08;
  const width = 900;
  const height = 330;
  const inset = { top: 22, right: 24, bottom: 36, left: 58 };
  const plotWidth = width - inset.left - inset.right;
  const plotHeight = height - inset.top - inset.bottom;

  const path = (channel: ChannelId): string =>
    samples[channel]
      .map((sample, index) => {
        const x = inset.left + (sample.elapsedMs / maxX) * plotWidth;
        const value = valueOf(sample);
        const y = inset.top + plotHeight - (value / maxY) * plotHeight;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');

  return (
    <section
      className="signal-chart panel"
      data-live={hasData ? 'true' : 'false'}
      aria-label={t(valueMode === 'raw' ? 'detection.rawChartTitle' : 'detection.chartTitle')}
    >
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">
            {t(valueMode === 'raw' ? 'common.rawSignal' : 'common.liveSignal')}
          </span>
          <h2>{t(valueMode === 'raw' ? 'detection.rawChartTitle' : 'detection.chartTitle')}</h2>
        </div>
        <div className="chart-legend">
          {visible.map((channel) => (
            <span key={channel}>
              <i style={{ backgroundColor: colors[channel] }} />
              {t(
                valueMode === 'raw'
                  ? `detection.signal${[480, 515, 555][channels.indexOf(channel)]}`
                  : `channels.channel${channels.indexOf(channel) + 1}`,
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="chart-stage">
        {!hasData ? (
          <div className="chart-empty">
            <span className="chart-empty__icon">
              <Icon name="pulse" size={28} />
            </span>
            <p>{t(valueMode === 'raw' ? 'detection.rawChartEmpty' : 'detection.chartEmpty')}</p>
          </div>
        ) : null}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t(valueMode === 'raw' ? 'detection.rawChartTitle' : 'detection.chartTitle')}
          className={hasData ? '' : 'is-empty'}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0a9f9a" stopOpacity=".18" />
              <stop offset="1" stopColor="#0a9f9a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: 6 }, (_, index) => {
            const y = inset.top + (plotHeight / 5) * index;
            const label = Math.round(maxY - (maxY / 5) * index);
            return (
              <g key={y}>
                <line x1={inset.left} x2={width - inset.right} y1={y} y2={y} />
                <text x={inset.left - 12} y={y + 4} textAnchor="end">
                  {label}
                </text>
              </g>
            );
          })}
          {Array.from({ length: 7 }, (_, index) => {
            const x = inset.left + (plotWidth / 6) * index;
            const seconds = Math.round((maxX / 1000 / 6) * index);
            return (
              <g key={x}>
                <line x1={x} x2={x} y1={inset.top} y2={height - inset.bottom} />
                <text x={x} y={height - 10} textAnchor="middle">
                  {seconds} s
                </text>
              </g>
            );
          })}
          {visible.map((channel) => (
            <path
              key={channel}
              d={path(channel)}
              fill="none"
              stroke={colors[channel]}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {visible.flatMap((channel) =>
            samples[channel]
              .filter((sample) => saturatedSequences[channel]?.includes(sample.sequence))
              .map((sample) => {
                const x = inset.left + (sample.elapsedMs / maxX) * plotWidth;
                const y = inset.top + plotHeight - (valueOf(sample) / maxY) * plotHeight;
                return (
                  <circle
                    key={`${channel}-${sample.sequence}`}
                    cx={x}
                    cy={y}
                    r="5"
                    fill="#fff"
                    stroke="#d28a12"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                    aria-hidden="true"
                  />
                );
              }),
          )}
        </svg>
      </div>
      {Object.values(saturatedSequences).some((sequences) => (sequences?.length ?? 0) > 0) ? (
        <p className="chart-saturation-note">{t('detection.saturationMarker')}</p>
      ) : null}
    </section>
  );
}
