/**
 * API Middleware
 * 
 * Reusable middleware functions for API routes.
 * 
 * Why this module exists:
 * - Eliminates duplicated authentication/authorization logic across 13+ API routes
 * - Provides type-safe middleware composition
 * - Centralizes security concerns (auth, validation, rate limiting)
 * - Makes testing easier by isolating middleware logic
 * 
 * Usage:
 * ```typescript
 * // In API route
 * export async function GET(request: NextRequest) {
 *   const session = await requireAuth(request);
 *   // Your authenticated logic here
 * }
 * 
 * export async function POST(request: NextRequest) {
 *   const session = await requireAdmin(request);
 *   // Your admin-only logic here
 * }
 * ```
 */

import { NextRequest } from 'next/server';
import { getSession, Session } from '@/lib/auth/session';
import { apiUnauthorized, apiForbidden } from './responses';

/**
 * Check if user is authenticated
 * Returns session if authenticated, throws error if not
 * 
 * @param request - Next.js request object
 * @returns Session object with user data
 * @throws Response with 401 status if not authenticated
 * 
 * Why: Every protected endpoint needs to verify authentication
 * This middleware eliminates the repeated pattern:
 * ```
 * const session = await getSession();
 * if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 * ```
 */
export async function requireAuth(request?: NextRequest): Promise<Session> {
  const session = await getSession();
  
  if (!session) {
    // Throw the response so calling code can catch and return it
    throw apiUnauthorized('Authentication required');
  }
  
  return session;
}

/**
 * Check if user has admin role
 * Returns session if user is admin, throws error if not
 * 
 * @param request - Next.js request object
 * @returns Session object with admin user data
 * @throws Response with 401 if not authenticated, 403 if not admin
 * 
 * Why: Admin-only endpoints need both authentication AND authorization checks
 * 
 * WHAT: Check app-specific role (appRole), NOT SSO-level role (user.role)
 * WHY: SSO v5.24.0 introduced multi-app permissions - each app has its own roles
 * HOW: Use session.appRole which was queried from SSO during login callback
 */
export async function requireAdmin(request?: NextRequest): Promise<Session> {
  // First check authentication
  const session = await requireAuth(request);
  
  // CRITICAL: Check app-specific role, not SSO-level role
  // App role is queried from SSO permission endpoint during OAuth callback
  if (session.appRole !== 'admin' && session.appRole !== 'superadmin') {
    throw apiForbidden('Admin access required for this app');
  }

  if (session.appAccess === false) {
    throw apiForbidden('No access to this app');
  }

  return session;
}

/**
 * Optional authentication
 * Returns session if authenticated, null if not (no error thrown)
 * 
 * @param request - Next.js request object
 * @returns Session object or null
 * 
 * Why: Some endpoints need to behave differently for authenticated vs anonymous users
 * but don't require authentication. For example, public content with personalization.
 */
export async function optionalAuth(request?: NextRequest): Promise<Session | null> {
  return await getSession();
}

/**
 * Check if user has specific role(s)
 * 
 * @param roles - Single role or array of allowed roles
 * @param request - Next.js request object
 * @returns Session if user has one of the specified roles
 * @throws Response with 403 if user doesn't have required role
 * 
 * Why: Some endpoints may require specific roles beyond just 'admin'
 * This provides flexible role-based access control
 */

/**
 * Validate required fields in request body
 * Throws error if any required field is missing or empty
 * 
 * @param body - Request body object
 * @param fields - Array of required field names
 * @throws Response with 400 if validation fails
 * 
 * Why: Every POST/PUT endpoint needs input validation
 * This eliminates repeated validation patterns like:
 * ```
 * if (!name || name.trim() === '') {
 *   return NextResponse.json({ error: 'Name is required' }, { status: 400 });
 * }
 * ```
 */
export function validateRequiredFields(
  body: Record<string, any>,
  fields: string[]
): void {
  const missing: string[] = [];
  const empty: string[] = [];
  
  for (const field of fields) {
    if (!(field in body) || body[field] === null || body[field] === undefined) {
      missing.push(field);
    } else if (typeof body[field] === 'string' && body[field].trim() === '') {
      empty.push(field);
    }
  }
  
  if (missing.length > 0 || empty.length > 0) {
    const errors: string[] = [];
    if (missing.length > 0) {
      errors.push(`Missing required fields: ${missing.join(', ')}`);
    }
    if (empty.length > 0) {
      errors.push(`Empty required fields: ${empty.join(', ')}`);
    }
    
    // Import here to avoid circular dependency
    const { apiBadRequest } = require('./responses');
    throw apiBadRequest(errors.join('. '), {
      missingFields: missing,
      emptyFields: empty,
    });
  }
}

/**
 * Parse pagination parameters from URL search params
 * Returns validated page and limit values with defaults
 * 
 * @param searchParams - URL search params object
 * @param defaultLimit - Default items per page (default: 20)
 * @param maxLimit - Maximum allowed items per page (default: 100)
 * @returns Object with page and limit numbers
 * 
 * Why: Every list endpoint needs consistent pagination parameter handling
 * This eliminates repeated patterns like:
 * ```
 * const page = parseInt(searchParams.get('page') || '1');
 * const limit = parseInt(searchParams.get('limit') || '20');
 * ```
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaultLimit: number = 20,
  maxLimit: number = 100
): { page: number; limit: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const requestedLimit = parseInt(searchParams.get('limit') || String(defaultLimit));
  const limit = Math.min(maxLimit, Math.max(1, requestedLimit));
  
  return { page, limit };
}
