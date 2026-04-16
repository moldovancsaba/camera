/**
 * Reusable button — styles come from `app/globals.css` (`.app-btn` system).
 */

'use client';

import React from 'react';

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

const variantClass: Record<ButtonVariant, string> = {
  primary: 'app-btn--primary',
  secondary: 'app-btn--secondary',
  danger: 'app-btn--danger',
  ghost: 'app-btn--ghost',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'app-btn--sm',
  md: '',
  lg: 'app-btn--lg',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const layoutClass = fullWidth ? '' : 'app-btn--inline';
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`app-btn ${variantClass[variant]} ${sizeClass[size]} ${layoutClass} ${className}`.trim()}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="h-5 w-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        <>
          {icon && <span aria-hidden="true">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}
