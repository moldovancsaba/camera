/**
 * Public view for a signed share link (submission image or gym workout).
 */

import { notFound } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { verifyFffShareToken } from '@/lib/fff-share-token';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Shared · FunFitFan',
};

export default async function FffPublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw || '');
  const payload = verifyFffShareToken(token);
  if (!payload) {
    notFound();
  }

  const db = await connectToDatabase();

  if (payload.k === 'sub') {
    if (!ObjectId.isValid(payload.id)) {
      notFound();
    }
    const doc = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({ _id: new ObjectId(payload.id) });
    if (!doc) {
      notFound();
    }
    const imageUrl = typeof doc.imageUrl === 'string' ? doc.imageUrl : '';
    const eventName = typeof doc.eventName === 'string' ? doc.eventName : 'Photo';
    const meta = (doc.metadata || {}) as Record<string, unknown>;
    const activity = typeof meta.funfitfanActivity === 'string' ? meta.funfitfanActivity : '';
    const resultLine = typeof meta.funfitfanResult === 'string' ? meta.funfitfanResult : '';
    const heading = activity || eventName;

    return (
      <div className="fff-app-inner fff-app-text-center">
        <div className="flex justify-center">
          <a
            href="https://fff.messmass.com"
            className="app-btn app-btn--primary fff-share-get-cta"
            rel="noopener noreferrer"
          >
            GET FUNFITFAN
          </a>
        </div>
        <h1 className="mt-6 fff-app-page-title">{heading}</h1>
        {resultLine ? <p className="mt-2 text-sm fff-app-muted">{resultLine}</p> : null}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="fff-app-media--hero" />
        ) : (
          <p className="mt-8 fff-app-footnote">Image unavailable.</p>
        )}
      </div>
    );
  }

  if (payload.k === 'gym') {
    const doc = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId: payload.id });
    if (!doc) {
      notFound();
    }
    const lessonTitle = typeof doc.lessonTitle === 'string' ? doc.lessonTitle : 'Workout';
    const status = typeof doc.status === 'string' ? doc.status : '';
    const startedAt = typeof doc.startedAt === 'string' ? doc.startedAt : '';
    const selfieImageUrl = typeof doc.selfieImageUrl === 'string' ? doc.selfieImageUrl : '';

    return (
      <div className="fff-app-inner fff-app-text-center">
        <div className="flex justify-center">
          <a
            href="https://fff.messmass.com"
            className="app-btn app-btn--primary fff-share-get-cta"
            rel="noopener noreferrer"
          >
            GET FUNFITFAN
          </a>
        </div>
        <h1 className="mt-6 fff-app-page-title">{lessonTitle}</h1>
        <p className="mt-2 text-sm fff-app-muted">
          {status}
          {startedAt ? ` · ${new Date(startedAt).toLocaleString()}` : ''}
        </p>
        {selfieImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfieImageUrl} alt="" className="fff-app-media--hero" />
        ) : (
          <p className="mt-8 fff-app-footnote">No selfie for this session.</p>
        )}
      </div>
    );
  }

  notFound();
}
