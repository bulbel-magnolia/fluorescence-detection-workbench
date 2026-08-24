interface TelemetryItem {
  label: string;
  value: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  title?: string;
  live?: boolean;
}

interface TelemetryStripProps {
  label: string;
  items: TelemetryItem[];
  compact?: boolean;
}

export function TelemetryStrip({ label, items, compact = false }: TelemetryStripProps) {
  return (
    <div
      className={`telemetry-strip${compact ? ' telemetry-strip--compact' : ''}`}
      aria-label={label}
    >
      {items.map((item) => {
        const tone = item.tone ?? 'neutral';
        const statusLabel = /status|state|connection|device|result|状态|连接|设备|结果|采集/i.test(
          item.label,
        );
        const isLive = item.live ?? (tone === 'danger' || (tone === 'success' && statusLabel));
        const accessibleValue = `${item.label}: ${item.value}`;

        return (
          <span
            key={`${item.label}-${item.value}`}
            className='telemetry-cell'
            data-tone={tone}
            title={item.title ?? item.value}
            role={isLive ? 'status' : undefined}
            aria-live={isLive ? 'polite' : undefined}
            aria-label={accessibleValue}
          >
            <span className='telemetry-cell__label'>{item.label}</span>
            <strong className='telemetry-cell__value' aria-label={item.value}>
              {item.value}
            </strong>
          </span>
        );
      })}
    </div>
  );
}
