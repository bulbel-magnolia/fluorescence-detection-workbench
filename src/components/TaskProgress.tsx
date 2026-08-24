import { Button } from './Button';

interface TaskProgressProps {
  label: string;
  progress?: number;
  completed?: number;
  total?: number;
  cancelLabel?: string;
  onCancel?: () => void;
}

export function TaskProgress({
  label,
  progress,
  completed,
  total,
  cancelLabel,
  onCancel,
}: TaskProgressProps) {
  const derivedProgress =
    progress ?? (completed !== undefined && total ? (completed / total) * 100 : 0);
  const normalizedProgress = Math.min(100, Math.max(0, Math.round(derivedProgress)));

  return (
    <section className="task-progress" aria-label={label}>
      <div className="task-progress__header">
        <strong>{label}</strong>
        <span>{normalizedProgress}%</span>
      </div>
      <progress
        aria-label={label}
        aria-valuenow={normalizedProgress}
        value={normalizedProgress}
        max={100}
      />
      {completed !== undefined && total !== undefined ? (
        <p>
          {completed} / {total}
        </p>
      ) : null}
      {cancelLabel && onCancel ? (
        <Button variant="tertiary" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
      ) : null}
    </section>
  );
}
