interface MetadataLabelProps {
  label: string;
  accessibleLabel?: string;
  tone?: 'neutral' | 'accent' | 'warning';
}

export function MetadataLabel({ label, accessibleLabel, tone = 'neutral' }: MetadataLabelProps) {
  return (
    <span className="metadata-label" data-tone={tone} aria-label={accessibleLabel}>
      {label}
    </span>
  );
}
