/**
 * Gym selfie: reuses CameraCapture + imgbb via /api/gym/sessions/:id/selfie
 */

import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { redirect, notFound } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import GymSelfieClient from '@/components/gym/GymSelfieClient';
import { frameOverlayImageUrl, readFunFitFanDefaultFrameId } from '@/lib/funfitfan/bootstrap';

export const dynamic = 'force-dynamic';

export default async function GymSelfiePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  const { sessionId } = await params;
  const db = await connectToDatabase();
  const row = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
  if (!row || row.userId !== session.user.id) {
    notFound();
  }

  let guideFrame: { frameOverlay: string; frameWidth?: number; frameHeight?: number } | null = null;
  const defaultFrameId = await readFunFitFanDefaultFrameId(db);
  if (defaultFrameId) {
    const frameDoc =
      (await db.collection(COLLECTIONS.FRAMES).findOne({ frameId: defaultFrameId, isActive: true })) ??
      (await db.collection(COLLECTIONS.FRAMES).findOne({ frameId: defaultFrameId }));
    if (frameDoc) {
      const rec = frameDoc as Record<string, unknown>;
      const url = frameOverlayImageUrl(rec);
      const w = Number(rec.width);
      const h = Number(rec.height);
      if (url) {
        guideFrame =
          w > 0 && h > 0 ? { frameOverlay: url, frameWidth: w, frameHeight: h } : { frameOverlay: url };
      }
    }
  }

  return <GymSelfieClient sessionId={sessionId} guideFrame={guideFrame} />;
}
