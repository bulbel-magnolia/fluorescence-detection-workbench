import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  visual?: ReactNode;
}

export function EmptyState({
  title,
  description,
  icon = 'flask',
  action,
  actionLabel,
  onAction,
  visual,
}: EmptyStateProps) {
  return (
    <section className="empty-state">
      <div className="empty-state__visual" aria-hidden="true">
        {visual ?? <Icon name={icon} size={24} />}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ??
        (actionLabel && onAction ? (
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null)}
    </section>
  );
}
