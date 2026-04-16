import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type AppButtonVariant = 'primary' | 'secondary' | 'neutral' | 'ghost';

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  /** Narrower padding, no forced full width — for toolbars and wizard rows. */
  compact?: boolean;
};

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(function AppButton(
  { variant = 'primary', compact = false, className = '', type = 'button', ...rest },
  ref
) {
  const variantClass =
    variant === 'primary'
      ? 'app-btn--primary'
      : variant === 'secondary'
        ? 'app-btn--secondary'
        : variant === 'neutral'
          ? 'app-btn--neutral'
          : 'app-btn--ghost';
  const compactClass = compact ? 'app-btn--compact' : '';
  return (
    <button
      ref={ref}
      type={type}
      className={`app-btn ${variantClass} ${compactClass} ${className}`.trim()}
      {...rest}
    />
  );
});
