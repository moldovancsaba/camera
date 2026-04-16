/**
 * Gym module: reuse Camera SSO session and app-level access flags.
 * See docs/AUTHORIZATION.md — always use appRole / appAccess for this app.
 */

import type { Session } from '@/lib/auth/session';
import { apiForbidden } from '@/lib/api/responses';

export function assertGymAppAccess(session: Session): void {
  if (session.appAccess === false) {
    throw apiForbidden('No access to this app');
  }
}
