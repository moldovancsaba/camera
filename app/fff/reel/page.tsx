/**
 * Redirect to the user's FunFitFan slideshow (Camera slideshow player, 3s transitions from bootstrap).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function FffReelRedirectPage() {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }
  if (session.appAccess === false) {
    redirect('/');
  }

  const db = await connectToDatabase();
  const profile = await db.collection(COLLECTIONS.FFF_USER_PROFILES).findOne({ userId: session.user.id });
  if (!profile?.slideshowId) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center text-slate-200">
        <p className="text-lg">No FunFitFan reel yet.</p>
        <p className="mt-2 text-sm text-slate-400">Log an activity first, then your slideshow will appear here.</p>
        <Link href="/fff/log" className="mt-6 inline-block text-emerald-400 hover:underline">
          Log an activity
        </Link>
      </div>
    );
  }

  redirect(`/slideshow/${profile.slideshowId}`);
}
