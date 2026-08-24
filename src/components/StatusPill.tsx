import type { IconName } from './Icon';
import { Icon } from './Icon';

interface StatusPillProps {
  label: string;
  tone?: StatusTone;
  icon?: IconName;
}

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'signal';

const defaultIcons: Partial<Record<StatusTone, IconName>> = {
  info: 'info',
  success: 'check',
  warning: 'warning',
  danger: 'warning',
  signal: 'pulse',
};

export function StatusPill({ label, tone = 'neutral', icon }: StatusPillProps) {
  const resolvedIcon = icon ?? defaultIcons[tone];

  return (
    <span className="status-pill" data-tone={tone}>
      {resolvedIcon ? (
        <Icon name={resolvedIcon} size={14} />
      ) : (
        <span className="status-pill__dot" />
      )}
      {label}
    </span>
  );
}

export const StatusBadge = StatusPill;
