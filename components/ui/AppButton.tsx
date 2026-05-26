'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Button } from '@/components/gds/ui';

export type AppButtonVariant = 'primary' | 'secondary' | 'neutral' | 'ghost' | 'danger';

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  compact?: boolean;
};

const variantProps: Record<
  AppButtonVariant,
  {
    color: string;
    variant: 'filled' | 'light' | 'subtle';
  }
> = {
  primary: { color: 'cameraTeal', variant: 'filled' },
  secondary: { color: 'cameraSlate', variant: 'light' },
  neutral: { color: 'dark', variant: 'light' },
  ghost: { color: 'gray', variant: 'subtle' },
  danger: { color: 'red', variant: 'filled' },
};

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(function AppButton(
  { variant = 'primary', compact = false, className = '', type = 'button', children, ...rest },
  ref
) {
  const isBlock = className.includes('app-btn--block');
  const normalizedClassName = className
    .replace(/\bapp-btn--inline\b/g, '')
    .replace(/\bapp-btn--block\b/g, '')
    .trim();
  const props = variantProps[variant];

  return (
    <Button
      ref={ref}
      type={type}
      color={props.color}
      variant={props.variant}
      size={compact ? 'sm' : 'md'}
      fullWidth={isBlock}
      radius={compact ? 'md' : 'xl'}
      className={normalizedClassName || undefined}
      styles={{
        root: compact
          ? {
              minWidth: 0,
            }
          : undefined,
      }}
      {...rest}
    >
      {children}
    </Button>
  );
});
