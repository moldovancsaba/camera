/**
 * Gym module layout: FunFitFan shell (same gradient + content column as /fff/log), SSO + appAccess.
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
    <div className="fff-app-shell">
      <GymHeaderBar />
      <div className="fff-app-inner">{children}</div>
    </div>
  );
}
