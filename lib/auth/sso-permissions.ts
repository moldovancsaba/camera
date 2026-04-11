/**
 * SSO App Permissions Client
 * 
 * Queries SSO for user's app-specific permissions.
 * SSO is the single source of truth for user roles within each app.
 * 
 * Flow:
 * 1. User logs in via OAuth
 * 2. Camera calls SSO permission endpoint with access token
 * 3. SSO returns user's role for Camera app (user/admin/none)
 * 4. Camera stores role in session
 * 5. Camera uses role for authorization checks
 */

import { SSO_CONFIG } from './sso';

/**
 * App permission from SSO
 */
export interface AppPermission {
  userId: string;
  clientId: string;
  appName: string;
  hasAccess: boolean;
  status: 'approved' | 'pending' | 'revoked';
  role: 'none' | 'user' | 'admin' | 'superadmin';
  requestedAt?: string;
  grantedAt?: string | null;
  grantedBy?: string | null;
  lastAccessedAt?: string | null;
}

/**
 * Get user's permission for this app from SSO
 * 
 * @param userId - User's SSO ID (from ID token)
 * @param accessToken - Valid OAuth access token
 * @returns App permission with role and access status
 */
export async function getAppPermission(
  userId: string,
  accessToken: string
): Promise<AppPermission> {
  const config = SSO_CONFIG();
  
  // WHAT: Query SSO for user's permission for this specific app
  // WHY: SSO is the authoritative source for app-level roles
  const url = `${config.baseUrl}/api/users/${userId}/apps/${config.clientId}/permissions`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    // WHAT: Handle 404 (no permission record) vs other errors
    if (response.status === 404) {
      // User hasn't attempted to access this app yet
      // Return default "no access" permission
      return {
        userId,
        clientId: config.clientId,
        appName: 'camera',
        hasAccess: false,
        status: 'revoked',
        role: 'none',
      };
    }
    
    const error = await response.text();
    throw new Error(`Failed to get app permission: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * Request access to this app
 * Creates a pending permission record in SSO for admin approval
 * 
 * @param userId - User's SSO ID
 * @param accessToken - Valid OAuth access token
 * @returns Created permission (status will be 'pending')
 */
export async function requestAppAccess(
  userId: string,
  accessToken: string
): Promise<AppPermission> {
  const config = SSO_CONFIG();
  
  // WHAT: Create access request in SSO
  // WHY: Admin needs to approve access before user can use the app
  const url = `${config.baseUrl}/api/users/${userId}/apps/${config.clientId}/request-access`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: '', // Optional: will be filled by SSO from access token
      name: '',  // Optional: will be filled by SSO from access token
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to request app access: ${response.status} ${error}`);
  }
  
  return response.json();
}

/**
 * Check if user has access to the app
 * 
 * @param permission - App permission from SSO
 * @returns True if user has approved access
 */
export function hasAppAccess(permission: AppPermission): boolean {
  return permission.hasAccess && permission.status === 'approved';
}

/**
 * Check if user is admin in this app
 * 
 * @param permission - App permission from SSO
 * @returns True if user has admin or superadmin role
 */
export function isAppAdmin(permission: AppPermission): boolean {
  return hasAppAccess(permission) && 
         (permission.role === 'admin' || permission.role === 'superadmin');
}
