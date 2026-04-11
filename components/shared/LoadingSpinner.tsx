/**
 * Loading Spinner Component
 * 
 * Reusable loading indicator with consistent styling.
 * 
 * Why this component exists:
 * - Loading states appear throughout the app (pages, buttons, modals)
 * - Ensures consistent spinner appearance and animation
 * - Provides different sizes for different contexts
 * - Includes accessibility attributes (aria-live, role)
 * 
 * Usage:
 * ```tsx
 * <LoadingSpinner />
 * <LoadingSpinner size="lg" text="Loading data..." />
 * <LoadingSpinner size="sm" />
 * ```
 */

import React from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface LoadingSpinnerProps {
  /** Spinner size */
  size?: SpinnerSize;
  /** Optional text to display below spinner */
  text?: string;
  /** Custom class names */
  className?: string;
}

/**
 * Size configurations
 * 
 * Why these sizes:
 * - sm: Inline loading (16px) - e.g., inside buttons
 * - md: Default loading (24px) - e.g., loading sections
 * - lg: Page loading (48px) - e.g., full page load states
 */
const sizeConfig: Record<SpinnerSize, { spinner: string; text: string }> = {
  sm: {
    spinner: 'h-4 w-4',
    text: 'text-xs',
  },
  md: {
    spinner: 'h-6 w-6',
    text: 'text-sm',
  },
  lg: {
    spinner: 'h-12 w-12',
    text: 'text-base',
  },
};

/**
 * Loading Spinner Component
 * 
 * Uses CSS animation for smooth rotation
 * Spinner SVG based on Tailwind UI patterns
 * 
 * Accessibility:
 * - aria-live="polite": Announces loading state to screen readers
 * - role="status": Identifies as status indicator
 * - Text provides context for screen readers
 */
export default function LoadingSpinner({
  size = 'md',
  text,
  className = '',
}: LoadingSpinnerProps) {
  const config = sizeConfig[size];
  
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Animated spinner circle */}
      <svg
        className={`animate-spin ${config.spinner} text-blue-600 dark:text-blue-400`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {/* Background circle (light gray) */}
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        {/* Animated arc (blue) - creates spinning effect */}
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      
      {/* Optional loading text */}
      {text && (
        <p className={`${config.text} text-gray-600 dark:text-gray-400 font-medium`}>
          {text}
        </p>
      )}
      
      {/* Screen reader text when no text prop provided */}
      {!text && <span className="sr-only">Loading...</span>}
    </div>
  );
}
