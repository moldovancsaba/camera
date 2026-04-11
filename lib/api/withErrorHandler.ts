/**
 * Error Handling Wrapper for API Routes
 * 
 * Higher-order function that wraps API route handlers with consistent error handling.
 * 
 * Why this module exists:
 * - All 24 API routes have identical try-catch patterns
 * - Eliminates 200+ lines of duplicated error handling code
 * - Ensures consistent error responses across all endpoints
 * - Makes it easy to add global error logging or monitoring
 * - Handles both thrown NextResponse objects and standard errors
 * 
 * Usage:
 * ```typescript
 * export const GET = withErrorHandler(async (request: NextRequest) => {
 *   const session = await requireAuth(); // Can throw NextResponse
 *   const data = await fetchData(); // Can throw Error
 *   return apiSuccess(data);
 * });
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiError } from './responses';

/**
 * Route handler function type
 * Matches Next.js App Router route handler signature
 * 
 * Note: context param is optional because some routes don't have params
 * Updated for Next.js 15: params are always wrapped in Promise
 * 
 * This type supports both cases:
 * 1. Routes without params: context is optional
 * 2. Routes with params: context is required and contains params Promise
 */
type RouteHandler = (
  request: NextRequest,
  context?: any
) => Promise<NextResponse>;

/**
 * Wrap an API route handler with centralized error handling
 * 
 * @param handler - The route handler function
 * @returns Wrapped handler with error handling
 * 
 * Why: This wrapper eliminates the need for try-catch in every route handler.
 * 
 * Error handling logic:
 * 1. If handler throws a NextResponse (from middleware like requireAuth),
 *    return that response directly
 * 2. If handler throws a standard Error, log it and return 500
 * 3. If handler succeeds, return its response normally
 * 
 * Before (duplicated in every route):
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   try {
 *     const session = await getSession();
 *     if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *     // Logic here
 *     return NextResponse.json({ data });
 *   } catch (error) {
 *     console.error('Error:', error);
 *     return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
 *   }
 * }
 * ```
 * 
 * After (using this wrapper):
 * ```typescript
 * export const GET = withErrorHandler(async (request: NextRequest) => {
 *   const session = await requireAuth(); // Throws NextResponse on failure
 *   // Logic here
 *   return apiSuccess(data);
 * });
 * ```
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: any) => {
    try {
      // Execute the wrapped handler
      return await handler(request, context);
    } catch (error) {
      // If middleware threw a NextResponse (e.g., from requireAuth),
      // return it directly
      if (error instanceof NextResponse) {
        return error;
      }
      
      // Handle standard JavaScript errors
      if (error instanceof Error) {
        console.error('API Error:', {
          message: error.message,
          stack: error.stack,
          url: request.url,
          method: request.method,
        });
        
        // Return generic 500 error
        // Don't expose internal error details to client
        return apiError('Internal server error', 500);
      }
      
      // Handle unknown error types
      console.error('Unknown Error:', error);
      return apiError('An unexpected error occurred', 500);
    }
  };
}

/**
 * Async error boundary for non-route async operations
 * Similar to withErrorHandler but for standalone async functions
 * 
 * @param fn - Async function to wrap
 * @param fallback - Fallback value to return on error
 * @returns Result of fn or fallback on error
 * 
 * Why: Useful for operations like database queries where you want
 * to handle errors gracefully without throwing
 * 
 * Usage:
 * ```typescript
 * const users = await safeAsync(
 *   () => db.collection('users').find().toArray(),
 *   [] // Return empty array on error
 * );
 * ```
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error('Safe async error:', error);
    return fallback;
  }
}

/**
 * Database operation error handler
 * Wraps database operations with specific error messages
 * 
 * @param operation - Database operation name (for logging)
 * @param fn - Database operation function
 * @returns Result of database operation
 * @throws NextResponse with appropriate error message
 * 
 * Why: Database errors need special handling and clear error messages
 * 
 * Usage:
 * ```typescript
 * const user = await dbOperation('fetch user', async () => {
 *   return await db.collection('users').findOne({ _id: userId });
 * });
 * ```
 */
export async function dbOperation<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`Database operation failed [${operation}]:`, error);
    throw apiError(`Database operation failed: ${operation}`, 500);
  }
}
