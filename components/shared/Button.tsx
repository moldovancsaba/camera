'use client';

import React from 'react';
import { Button as GdsButton } from '@/components/gds/ui';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const variantProps: Record<ButtonVariant, { color: string; variant: 'filled' | 'light' | 'subtle' }> = {
  primary: { color: 'cameraTeal', variant: 'filled' },
  secondary: { color: 'cameraSlate', variant: 'light' },
  danger: { color: 'red', variant: 'filled' },
  ghost: { color: 'gray', variant: 'subtle' },
};

const sizeMap: Record<ButtonSize, 'sm' | 'md' | 'lg'> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const styles = variantProps[variant];

  return (
    <GdsButton
      type="button"
      color={styles.color}
      variant={styles.variant}
      size={sizeMap[size]}
      loading={loading}
      leftSection={icon}
      fullWidth={fullWidth}
      disabled={disabled || loading}
      radius="xl"
      className={className}
      {...props}
    >
      {children}
    </GdsButton>
  );
}
