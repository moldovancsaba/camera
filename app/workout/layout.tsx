/**
 * Workout (member): FunFitFan shell — same column as `/log` on FFF hosts, no extra chrome header.
 */

import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { redirect } from 'next/navigation';

export default async function WorkoutLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }
  if (session.appAccess === false) {
    redirect('/');
  }

  return (
    <div className="fff-app-shell">
      <div className="fff-app-inner">{children}</div>
    </div>
  );
}
