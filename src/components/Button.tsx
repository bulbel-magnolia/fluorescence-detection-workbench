import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  leadingIcon?: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  disabledReason?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'tertiary',
    size = 'md',
    leadingIcon,
    fullWidth = false,
    loading = false,
    loadingLabel,
    disabledReason,
    disabled,
    className,
    children,
    type,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref,
) {
  const reasonId = useId();
  const describedBy = disabledReason
    ? [ariaDescribedBy, reasonId].filter(Boolean).join(' ')
    : ariaDescribedBy;

  return (
    <>
      <button
        {...props}
        ref={ref}
        type={type ?? 'button'}
        className={[
          'button',
          `button--${variant}`,
          `button--${size}`,
          fullWidth ? 'button--full-width' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-describedby={describedBy || undefined}
      >
        {loading ? <span className="button__spinner" aria-hidden="true" /> : leadingIcon}
        <span>{loading ? (loadingLabel ?? children) : children}</span>
      </button>
      {disabledReason ? (
        <span id={reasonId} className="visually-hidden">
          {disabledReason}
        </span>
      ) : null}
    </>
  );
});
