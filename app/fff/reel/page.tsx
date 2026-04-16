/**
 * FunFitFan reel: open the user's slideshow in a **new browser tab** (never in-place).
 * Installed PWA uses Camera origin when configured so playback opens in the full browser.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { redirect } from 'next/navigation';
import ReelEmptyCTA from '@/components/funfitfan/ReelEmptyCTA';
import FffReelAutoOpen from '@/components/funfitfan/FffReelAutoOpen';

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

  return <FffReelAutoOpen slideshowId={String(profile.slideshowId)} />;
}
