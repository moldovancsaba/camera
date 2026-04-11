/**
 * Button Component
 * 
 * Reusable button component with consistent styling and variants.
 * 
 * Why this component exists:
 * - Found 34+ instances of repeated button styling (bg-blue-600, etc.)
 * - Ensures consistent button appearance across entire application
 * - Makes theme changes possible in one location
 * - Includes accessibility attributes by default
 * - Supports loading states and disabled states
 * 
 * Usage:
 * ```tsx
 * <Button variant="primary" onClick={handleClick}>
 *   Save Changes
 * </Button>
 * 
 * <Button variant="danger" size="sm" disabled>
 *   Delete
 * </Button>
 * 
 * <Button variant="secondary" loading>
 *   Processing...
 * </Button>
 * ```
 */

'use client';

import React from 'react';

/**
 * Button variant types
 * 
 * Why these variants:
 * - primary: Main actions (save, submit, create) - uses blue (brand color)
 * - secondary: Alternative actions - uses gray
 * - danger: Destructive actions (delete, remove) - uses red
 * - ghost: Minimal emphasis actions - transparent with border
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * Button size types
 * 
 * Why these sizes:
 * - sm: Compact spaces, inline buttons
 * - md: Default size for most actions
 * - lg: Prominent actions, hero sections
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button style variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Show loading spinner and disable interaction */
  loading?: boolean;
  /** Full width button */
  fullWidth?: boolean;
  /** Icon to display before text */
  icon?: React.ReactNode;
  /** Children (button text/content) */
  children: React.ReactNode;
}

/**
 * Base button classes that apply to all variants
 * 
 * Why these styles:
 * - font-semibold: Buttons should stand out with bold text
 * - rounded-lg: Consistent border radius across app (8px)
 * - transition-colors: Smooth hover/active state changes
 * - focus-visible: Keyboard navigation accessibility
 * - disabled:opacity-50: Clear visual feedback for disabled state
 * - disabled:cursor-not-allowed: Proper cursor for disabled buttons
 */
const baseClasses = `
  inline-flex items-center justify-center gap-2
  font-semibold rounded-lg
  transition-colors duration-200
  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
  disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
`;

/**
 * Variant-specific classes
 * 
 * Why these color choices:
 * - Blue (primary): Brand color, suggests main action
 * - Gray (secondary): Neutral, suggests alternative
 * - Red (danger): Universal color for destructive actions
 * - Ghost: Minimal visual weight for tertiary actions
 * 
 * Dark mode support: All variants have dark: prefixed classes
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-blue-600 text-white
    hover:bg-blue-700
    focus-visible:ring-blue-600
    dark:bg-blue-600 dark:hover:bg-blue-700
  `,
  secondary: `
    bg-gray-200 text-gray-900
    hover:bg-gray-300
    focus-visible:ring-gray-500
    dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600
  `,
  danger: `
    bg-red-600 text-white
    hover:bg-red-700
    focus-visible:ring-red-600
    dark:bg-red-600 dark:hover:bg-red-700
  `,
  ghost: `
    bg-transparent text-gray-700 border border-gray-300
    hover:bg-gray-50
    focus-visible:ring-gray-500
    dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-800
  `,
};

/**
 * Size-specific classes
 * 
 * Why these sizes:
 * - sm: 32px height (8px + 16px + 8px) - compact
 * - md: 40px height (12px + 16px + 12px) - default
 * - lg: 48px height (12px + 24px + 12px) - prominent
 */
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-3 text-base',
  lg: 'px-6 py-3 text-lg',
};

/**
 * Button Component
 * 
 * Replaces inline button styling throughout the codebase:
 * Before: className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
 * After: <Button variant="primary">Save</Button>
 */
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
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      {...props}
    >
      {loading ? (
        <>
          {/* Loading spinner - replaces content during loading state */}
          <svg
            className="animate-spin h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
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
