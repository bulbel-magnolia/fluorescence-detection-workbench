import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type BoundaryNoticeKind =
  | 'demo'
  | 'extrapolation'
  | 'context'
  | 'assumption'
  | 'evidence'
  | 'ann-rejected'
  | 'unconstructed';

interface BoundaryNoticeProps {
  kind?: BoundaryNoticeKind;
  title: string;
  children: ReactNode;
}

const kindIcons: Record<BoundaryNoticeKind, IconName> = {
  demo: 'flask',
  extrapolation: 'warning',
  context: 'info',
  assumption: 'info',
  evidence: 'check',
  'ann-rejected': 'warning',
  unconstructed: 'network',
};

export function BoundaryNotice({ kind = 'context', title, children }: BoundaryNoticeProps) {
  return (
    <aside className="boundary-notice" data-kind={kind} role="note" aria-label={title}>
      <Icon name={kindIcons[kind]} size={18} />
      <div>
        <strong>{title}</strong>
        <div className="boundary-notice__body">{children}</div>
      </div>
    </aside>
  );
}
