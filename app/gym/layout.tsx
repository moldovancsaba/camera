/**
 * Gym module layout: same SSO session as Camera; respects app-level access (appAccess).
 */

import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function GymLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }
  if (session.appAccess === false) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-950">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/gym" className="text-lg font-semibold text-slate-900 dark:text-white">
            Gym
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/gym" className="text-blue-600 hover:underline dark:text-blue-400">
              Lessons
            </Link>
            <Link href="/" className="text-slate-600 hover:underline dark:text-slate-400">
              Home
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-8">{children}</div>
    </div>
  );
}
