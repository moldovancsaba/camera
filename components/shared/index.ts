/**
 * Shared Components Index
 * 
 * Centralized export of all shared/reusable components.
 * 
 * Why this module exists:
 * - Single import point for all shared components
 * - Makes it easy to add new shared components
 * - Cleaner import statements throughout the app
 * - Eliminates 34+ instances of repeated inline styling
 * 
 * Usage:
 * ```tsx
 * import { Button, Card, Badge, LoadingSpinner } from '@/components/shared';
 * 
 * export default function MyPage() {
 *   return (
 *     <Card header={<h1>Title</h1>}>
 *       <Button variant="primary">Click Me</Button>
 *       <Badge variant="success">Active</Badge>
 *       <LoadingSpinner size="md" />
 *     </Card>
 *   );
 * }
 * ```
 */

// Core UI components
export { default as Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { default as Card } from './Card';
export type { CardProps } from './Card';

export { default as Badge } from './Badge';
export type { BadgeProps, BadgeVariant, BadgeSize } from './Badge';

export { default as LoadingSpinner } from './LoadingSpinner';
export type { LoadingSpinnerProps, SpinnerSize } from './LoadingSpinner';
