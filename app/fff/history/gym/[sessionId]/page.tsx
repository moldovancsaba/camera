/**
 * Owner view of one gym workout + shareable link (selfie if present).
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { signFffSharePayload } from '@/lib/fff-share-token';
import { getSiteUrlFromRequest } from '@/lib/site-url';
import ShareLinkActions from '@/components/funfitfan/ShareLinkActions';
import DeleteGymSessionButton from '@/components/gym/DeleteGymSessionButton';

export const dynamic = 'force-dynamic';

const SHARE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export default async function HistoryGymDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }
  if (session.appAccess === false) {
    redirect('/');
  }

  const { sessionId } = await params;
  if (!sessionId?.trim()) {
    notFound();
  }

  const db = await connectToDatabase();
  const doc = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({
    sessionId,
    userId: session.user.id,
  });
  if (!doc) {
    notFound();
  }

  const lessonTitle = typeof doc.lessonTitle === 'string' ? doc.lessonTitle : 'Workout';
  const status = typeof doc.status === 'string' ? doc.status : '';
  const startedAt = typeof doc.startedAt === 'string' ? doc.startedAt : '';
  const selfieImageUrl = typeof doc.selfieImageUrl === 'string' ? doc.selfieImageUrl : '';

  const exp = Date.now() + SHARE_TTL_MS;
  const token = signFffSharePayload({ k: 'gym', id: sessionId, exp });
  const site = await getSiteUrlFromRequest();
  const shareUrl = `${site}/fff/share/${encodeURIComponent(token)}`;

  const title = `${lessonTitle} · Gym`;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-lg">
        <p>
          <Link href="/fff/history" className="text-sm text-emerald-400 hover:underline">
            ← History
          </Link>
        </p>
        <h1 className="mt-4 text-2xl font-semibold">{lessonTitle}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {status}
          {startedAt ? ` · ${new Date(startedAt).toLocaleString()}` : ''}
        </p>

        <p className="mt-4">
          <Link href={`/gym/session/${sessionId}`} className="text-sm text-sky-400 hover:underline">
            Open full workout in Gym →
          </Link>
        </p>

        {selfieImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfieImageUrl} alt="" className="mt-6 w-full rounded-xl border border-slate-800" />
        ) : (
          <p className="mt-6 text-slate-500">No gym selfie for this session.</p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <DeleteGymSessionButton
            sessionId={sessionId}
            lessonTitle={lessonTitle}
            redirectAfterDelete="/fff/history"
            appearance="fffHistory"
          />
        </div>

        <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Share with friends</h2>
          <p className="mt-1 text-xs text-slate-500">
            Anyone with the link can view this workout summary (no sign-in). Links expire after about one year.
          </p>
          <div className="mt-4">
            <ShareLinkActions shareUrl={shareUrl} title={title} />
          </div>
        </section>
      </div>
    </div>
  );
}
