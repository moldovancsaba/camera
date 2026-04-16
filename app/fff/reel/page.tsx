/**
 * Redirect to the user's FunFitFan slideshow (Camera slideshow player, 3s transitions from bootstrap).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { redirect } from 'next/navigation';
import ReelEmptyCTA from '@/components/funfitfan/ReelEmptyCTA';

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
      <div className="fff-app-inner">
        <div className="fff-app-empty-hero">
          <p className="fff-reel-empty-title">No FunFitFan reel yet.</p>
          <p className="fff-reel-empty-lede">
          Log an activity or add a gym selfie first — your slideshow will play both here in order.
        </p>
          <ReelEmptyCTA />
        </div>
      </div>
    );
  }

  redirect(`/slideshow/${profile.slideshowId}`);
}
