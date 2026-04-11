/**
 * API Response Helpers
 * 
 * Centralized response utilities for consistent API responses across all endpoints.
 * 
 * Why this module exists:
 * - Eliminates duplicated response patterns across 24 API routes
 * - Ensures consistent response structure for clients
 * - Makes it easy to add global response modifications (e.g., adding request IDs)
 * - Improves type safety with TypeScript generics
 * 
 * Usage:
 * ```typescript
 * return apiSuccess({ user: userData });
 * return apiError('User not found', 404);
 * return apiUnauthorized('Invalid credentials');
 * return apiForbidden('Admin access required');
 * ```
 */

import { NextResponse } from 'next/server';

/**
 * Standard API success response
 * 
 * @param data - Response data payload
 * @param status - HTTP status code (default: 200)
 * @returns NextResponse with standardized structure
 * 
 * Why: Success responses should have consistent structure across all endpoints
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

/**
 * Standard API error response
 * 
 * @param message - Error message for client
 * @param status - HTTP status code (default: 500)
 * @param details - Optional additional error details for debugging
 * @returns NextResponse with error structure
 * 
 * Why: Consistent error format makes client-side error handling easier
 */
export function apiError(
  message: string,
  status: number = 500,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(details && { details }),
    },
    { status }
  );
}

/**
 * Unauthorized response (401)
 * Used when authentication is required but not provided
 * 
 * @param message - Optional custom message
 * @returns NextResponse with 401 status
 * 
 * Why: Authentication errors should be clearly identified with 401 status
 */
export function apiUnauthorized(message: string = 'Unauthorized'): NextResponse {
  return apiError(message, 401);
}

/**
 * Forbidden response (403)
 * Used when user is authenticated but lacks required permissions
 * 
 * @param message - Optional custom message
 * @returns NextResponse with 403 status
 * 
 * Why: Authorization errors should be distinguished from authentication errors (401)
 */
export function apiForbidden(message: string = 'Forbidden'): NextResponse {
  return apiError(message, 403);
}

/**
 * Bad request response (400)
 * Used for validation errors or malformed requests
 * 
 * @param message - Validation error message
 * @param details - Optional validation error details
 * @returns NextResponse with 400 status
 * 
 * Why: Client errors should be clearly identified and include helpful validation messages
 */
export function apiBadRequest(
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  return apiError(message, 400, details);
}

/**
 * Not found response (404)
 * Used when requested resource doesn't exist
 * 
 * @param resource - Type of resource (e.g., 'User', 'Event')
 * @returns NextResponse with 404 status
 * 
 * Why: Missing resources should be clearly indicated with appropriate status
 */
export function apiNotFound(resource: string = 'Resource'): NextResponse {
  return apiError(`${resource} not found`, 404);
}

/**
 * Created response (201)
 * Used when a new resource is successfully created
 * 
 * @param data - Created resource data
 * @returns NextResponse with 201 status
 * 
 * Why: Resource creation should return 201 status per REST conventions
 */
export function apiCreated<T>(data: T): NextResponse {
  return apiSuccess(data, 201);
}

/**
 * No content response (204)
 * Used for successful operations that don't return data (e.g., DELETE)
 * 
 * @returns NextResponse with 204 status and no body
 * 
 * Why: Successful deletions and updates without response data should return 204
 */
export function apiNoContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Paginated response helper
 * Wraps data with pagination metadata
 * 
 * @param data - Array of items for current page
 * @param page - Current page number
 * @param limit - Items per page
 * @param total - Total number of items
 * @returns NextResponse with paginated structure
 * 
 * Why: Pagination metadata should be consistent across all list endpoints
 */
export function apiPaginated<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): NextResponse {
  return apiSuccess({
    items: data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  });
}
