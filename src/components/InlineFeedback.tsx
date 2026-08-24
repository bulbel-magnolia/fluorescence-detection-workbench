import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface InlineFeedbackProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  children?: ReactNode;
}

export function InlineFeedback({ tone = 'info', title, children }: InlineFeedbackProps) {
  const icon = tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'warning';

  return (
    <div className="inline-feedback" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon} size={17} />
      <div>
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
