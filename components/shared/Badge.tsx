/**
 * Badge Component
 * 
 * Reusable badge component for status indicators, labels, and tags.
 * 
 * Why this component exists:
 * - Status badges appear in event lists, submission galleries, partner pages
 * - Ensures consistent badge appearance across application
 * - Provides semantic color variants for different statuses
 * - Supports both filled and outlined styles
 * 
 * Usage:
 * ```tsx
 * <Badge variant="success">Active</Badge>
 * <Badge variant="danger">Inactive</Badge>
 * <Badge variant="info" size="sm">Draft</Badge>
 * <Badge variant="warning" outlined>Pending</Badge>
 * ```
 */

import React from 'react';

/**
 * Badge variant types
 * 
 * Why these variants:
 * - success: Active, completed, approved states - uses green
 * - danger: Inactive, error, rejected states - uses red  
 * - warning: Pending, in-progress states - uses yellow
 * - info: Informational, neutral states - uses blue
 * - default: Generic labels - uses gray
 */
export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'default';

/**
 * Badge size types
 */
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  /** Badge content (text or icon) */
  children: React.ReactNode;
  /** Badge color variant */
  variant?: BadgeVariant;
  /** Badge size */
  size?: BadgeSize;
  /** Outlined style instead of filled */
  outlined?: boolean;
  /** Icon before text */
  icon?: React.ReactNode;
  /** Custom class names */
  className?: string;
}

/**
 * Base badge classes
 * 
 * Why these styles:
 * - inline-flex: Badge flows with text
 * - items-center: Vertically centers icon + text
 * - font-semibold: Bold text for emphasis
 * - rounded-full: Pill shape is standard for badges
 */
const baseClasses = `
  inline-flex items-center gap-1.5
  font-semibold rounded-full
`;

/**
 * Filled variant classes
 * 
 * Why filled by default:
 * - Higher visual weight for status indicators
 * - Better contrast for quick scanning
 * - Industry standard (GitHub, Jira, etc.)
 */
const filledVariantClasses: Record<BadgeVariant, string> = {
  success: `
    bg-green-100 text-green-800
    dark:bg-green-900/30 dark:text-green-400
  `,
  danger: `
    bg-red-100 text-red-800
    dark:bg-red-900/30 dark:text-red-400
  `,
  warning: `
    bg-yellow-100 text-yellow-800
    dark:bg-yellow-900/30 dark:text-yellow-400
  `,
  info: `
    bg-blue-100 text-blue-800
    dark:bg-blue-900/30 dark:text-blue-400
  `,
  default: `
    bg-gray-100 text-gray-800
    dark:bg-gray-700 dark:text-gray-300
  `,
};

/**
 * Outlined variant classes
 * 
 * Why outlined option:
 * - Lower visual weight when filled is too strong
 * - Useful for secondary status indicators
 * - Works better on colored backgrounds
 */
const outlinedVariantClasses: Record<BadgeVariant, string> = {
  success: `
    border border-green-300 text-green-700
    dark:border-green-600 dark:text-green-400
  `,
  danger: `
    border border-red-300 text-red-700
    dark:border-red-600 dark:text-red-400
  `,
  warning: `
    border border-yellow-300 text-yellow-700
    dark:border-yellow-600 dark:text-yellow-400
  `,
  info: `
    border border-blue-300 text-blue-700
    dark:border-blue-600 dark:text-blue-400
  `,
  default: `
    border border-gray-300 text-gray-700
    dark:border-gray-600 dark:text-gray-300
  `,
};

/**
 * Size classes
 * 
 * Why these sizes:
 * - sm: Inline badges, compact spaces (16px height)
 * - md: Standard badges (20px height)
 */
const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

/**
 * Badge Component
 * 
 * Replaces inline badge patterns like:
 * Before: <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Active</span>
 * After: <Badge variant="success">Active</Badge>
 */
export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  outlined = false,
  icon,
  className = '',
}: BadgeProps) {
  const variantClass = outlined
    ? outlinedVariantClasses[variant]
    : filledVariantClasses[variant];
  
  return (
    <span
      className={`
        ${baseClasses}
        ${variantClass}
        ${sizeClasses[size]}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
