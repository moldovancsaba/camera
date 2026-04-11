/**
 * Card Component
 * 
 * Reusable card container with consistent styling.
 * 
 * Why this component exists:
 * - Cards appear throughout admin pages, galleries, and forms
 * - Ensures consistent spacing, shadows, and borders
 * - Provides dark mode support by default
 * - Optional header and footer sections for common patterns
 * 
 * Usage:
 * ```tsx
 * <Card>
 *   <p>Simple card content</p>
 * </Card>
 * 
 * <Card 
 *   header={<h2>Card Title</h2>}
 *   footer={<Button>Action</Button>}
 * >
 *   Card body content
 * </Card>
 * 
 * <Card padding="none" hover>
 *   <img src="..." />
 * </Card>
 * ```
 */

import React from 'react';

export interface CardProps {
  /** Card content */
  children: React.ReactNode;
  /** Optional header section */
  header?: React.ReactNode;
  /** Optional footer section */
  footer?: React.ReactNode;
  /** Padding size (default: 'md') */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Add hover effect (scale + shadow) */
  hover?: boolean;
  /** Custom class names */
  className?: string;
  /** onClick handler (makes card clickable) */
  onClick?: () => void;
}

/**
 * Base card classes
 * 
 * Why these styles:
 * - bg-white: Clean background for light mode
 * - rounded-lg: Consistent 8px border radius
 * - shadow-sm: Subtle elevation (2px blur, 1px spread)
 * - border: Defines card boundaries in both light/dark
 * - dark:bg-gray-800: Dark mode background
 * - dark:border-gray-700: Dark mode border color
 */
const baseClasses = `
  bg-white dark:bg-gray-800
  rounded-lg shadow-sm
  border border-gray-200 dark:border-gray-700
`;

/**
 * Padding classes
 * 
 * Why these options:
 * - none: For image cards or custom internal padding
 * - sm: Compact cards (12px)
 * - md: Default spacing (16px) - most common
 * - lg: Spacious cards (24px) - for important content
 */
const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

/**
 * Header/footer padding classes
 * Matches body padding but applied separately
 */
const sectionPaddingClasses = {
  none: '',
  sm: 'px-3 py-2',
  md: 'px-4 py-3',
  lg: 'px-6 py-4',
};

/**
 * Hover effect classes
 * 
 * Why: Interactive cards (links, clickable items) benefit from hover feedback
 * - scale-[1.02]: Subtle grow effect (2%)
 * - shadow-md: Increased elevation on hover
 * - cursor-pointer: Shows card is clickable
 */
const hoverClasses = `
  transition-all duration-200
  hover:scale-[1.02] hover:shadow-md
  cursor-pointer
`;

/**
 * Card Component
 * 
 * Replaces repeated card patterns like:
 * Before: <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
 * After: <Card>
 */
export default function Card({
  children,
  header,
  footer,
  padding = 'md',
  hover = false,
  className = '',
  onClick,
}: CardProps) {
  const Component = onClick ? 'button' : 'div';
  
  return (
    <Component
      onClick={onClick}
      className={`
        ${baseClasses}
        ${hover || onClick ? hoverClasses : ''}
        ${!header && !footer ? paddingClasses[padding] : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      {...(onClick && { type: 'button' })}
    >
      {/* Header section with border bottom */}
      {header && (
        <div className={`
          ${sectionPaddingClasses[padding]}
          border-b border-gray-200 dark:border-gray-700
        `.trim().replace(/\s+/g, ' ')}>
          {header}
        </div>
      )}
      
      {/* Main content area */}
      <div className={paddingClasses[padding]}>
        {children}
      </div>
      
      {/* Footer section with border top */}
      {footer && (
        <div className={`
          ${sectionPaddingClasses[padding]}
          border-t border-gray-200 dark:border-gray-700
        `.trim().replace(/\s+/g, ' ')}>
          {footer}
        </div>
      )}
    </Component>
  );
}
