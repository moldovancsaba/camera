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
 * import { LoadingSpinner } from '@/components/shared';
 * 
 * export default function MyPage() {
 *   return (
 *     <Card header={<h1>Title</h1>}>
 *       <Badge variant="success">Active</Badge>
 *       <LoadingSpinner size="md" />
 *     </Card>
 *   );
 * }
 * ```
 */

export { default as LoadingSpinner } from './LoadingSpinner';
export type { LoadingSpinnerProps, SpinnerSize } from './LoadingSpinner';
