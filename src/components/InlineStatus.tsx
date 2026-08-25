import type { IconName } from './Icon';
import { Icon } from './Icon';

export type InlineStatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

interface InlineStatusProps {
  label: string;
  tone?: InlineStatusTone;
  icon?: IconName;
  announce?: boolean;
}

const defaultIcons: Partial<Record<InlineStatusTone, IconName>> = {
  success: 'check',
  warning: 'warning',
  danger: 'warning',
};

export function InlineStatus({
  label,
  tone = 'neutral',
  icon,
  announce = false,
}: InlineStatusProps) {
  const resolvedIcon = icon ?? defaultIcons[tone];

  return (
    <span className="inline-status" data-tone={tone} role={announce ? 'status' : undefined}>
      {resolvedIcon ? (
        <Icon name={resolvedIcon} size={12} />
      ) : (
        <span className="inline-status__marker" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
