import { Button } from './Button';
import { Icon } from './Icon';

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ValidationSummaryProps {
  title: string;
  issues: ValidationIssue[];
  readyMessage?: string;
}

export function ValidationSummary({ title, issues, readyMessage }: ValidationSummaryProps) {
  if (issues.length === 0 && readyMessage) {
    return (
      <section className="validation-summary" data-state="ready" aria-label={title}>
        <Icon name="check" size={18} />
        <div>
          <strong>{title}</strong>
          <p>{readyMessage}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="validation-summary" data-state="issues" aria-label={title}>
      <div className="validation-summary__heading">
        <Icon name="warning" size={18} />
        <div>
          <strong>{title}</strong>
          <span>{issues.length}</span>
        </div>
      </div>
      <ul>
        {issues.map((issue) => (
          <li key={issue.id} data-severity={issue.severity}>
            <span>{issue.message}</span>
            {issue.actionLabel && issue.onAction ? (
              <Button variant="tertiary" size="sm" onClick={issue.onAction}>
                {issue.actionLabel}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
