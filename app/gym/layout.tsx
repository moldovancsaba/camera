/**
 * Gym module layout: same SSO session as Camera; respects app-level access (appAccess).
 */

import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { redirect } from 'next/navigation';
import GymHeaderBar from '@/components/gym/GymHeaderBar';

export default async function GymLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }
  if (session.appAccess === false) {
    redirect('/');
  }

  return (
    <div className="gym-app-shell">
      <GymHeaderBar />
      <div className="gym-app-main">{children}</div>
    </div>
  );
}
