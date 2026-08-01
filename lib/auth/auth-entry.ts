// lib/auth/auth-entry.ts
// WHAT: The single "go sign in" redirect target for any protected page.
// WHY: /admin/login is the only page that decides how to reach SSO (direct
//     redirect vs. showing an error) -- every protected route should send
//     an unauthenticated visitor there, not straight to /api/auth/login,
//     so error handling and the "already signed in" check stay in one
//     place. Mirrors messmass's /admin/login as the sole admin auth entry.
export async function authEntryPathForCurrentHost(): Promise<string> {
  return '/admin/login';
}
