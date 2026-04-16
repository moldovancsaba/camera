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
import { fffBrowser, fffShareAbsoluteUrl } from '@/lib/funfitfan/fff-browser-urls';
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
  const shareUrl = fffShareAbsoluteUrl(site, token);

  const title = `${lessonTitle} · Gym`;

  return (
    <div className="fff-app-inner">
      <p>
        <Link href={fffBrowser.history} className="fff-app-link">
          ← History
        </Link>
      </p>
      <h1 className="mt-6 fff-app-page-title">{lessonTitle}</h1>
      <p className="mt-1 text-sm fff-app-muted">
        {status}
        {startedAt ? ` · ${new Date(startedAt).toLocaleString()}` : ''}
      </p>

      <p className="mt-4">
        <Link href={`/workout/session/${sessionId}`} className="fff-app-link">
          Open full workout in Gym →
        </Link>
      </p>

      {selfieImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={selfieImageUrl} alt="" className="fff-app-media" />
      ) : (
        <p className="mt-6 fff-app-footnote">No gym selfie for this session.</p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <DeleteGymSessionButton
          sessionId={sessionId}
          lessonTitle={lessonTitle}
          redirectAfterDelete={fffBrowser.history}
          appearance="fffHistory"
        />
      </div>

      <section className="fff-app-panel">
        <h2 className="fff-app-panel-title">Share with friends</h2>
        <p className="fff-app-panel-lede">
          Anyone with the link can view this workout summary (no sign-in). Links expire after about one year.
        </p>
        <div className="mt-4">
          <ShareLinkActions shareUrl={shareUrl} title={title} />
        </div>
      </section>
    </div>
  );
}
