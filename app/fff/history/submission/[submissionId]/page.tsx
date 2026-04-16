/**
 * Owner view of one submission + shareable link for friends.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';
import { submissionIsPersonalFffHistory } from '@/lib/funfitfan/history-scope';
import { signFffSharePayload } from '@/lib/fff-share-token';
import { getSiteUrlFromRequest } from '@/lib/site-url';
import { fffBrowser, fffShareAbsoluteUrl } from '@/lib/funfitfan/fff-browser-urls';
import ShareLinkActions from '@/components/funfitfan/ShareLinkActions';
import HistoryDeleteSubmissionButton from '@/components/funfitfan/HistoryDeleteSubmissionButton';

export const dynamic = 'force-dynamic';

const SHARE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export default async function HistorySubmissionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }
  if (session.appAccess === false) {
    redirect('/');
  }

  const { submissionId } = await params;
  if (!ObjectId.isValid(submissionId)) {
    notFound();
  }

  const db = await connectToDatabase();
  const profile = await db.collection(COLLECTIONS.FFF_USER_PROFILES).findOne({ userId: session.user.id });
  const eventUuid = typeof profile?.eventUuid === 'string' ? profile.eventUuid.trim() : null;

  const doc = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({
    _id: new ObjectId(submissionId),
    userId: session.user.id,
  });
  if (!doc || !submissionIsPersonalFffHistory(doc as Record<string, unknown>, eventUuid)) {
    notFound();
  }

  const imageUrl = typeof doc.imageUrl === 'string' ? doc.imageUrl : '';
  const eventName = typeof doc.eventName === 'string' ? doc.eventName : 'Photo';
  const partnerId = typeof doc.partnerId === 'string' ? doc.partnerId : '';
  const meta = (doc.metadata || {}) as Record<string, unknown>;
  const activity = typeof meta.funfitfanActivity === 'string' ? meta.funfitfanActivity : '';
  const resultLine = typeof meta.funfitfanResult === 'string' ? meta.funfitfanResult : '';
  const createdAt = typeof doc.createdAt === 'string' ? doc.createdAt : '';

  const exp = Date.now() + SHARE_TTL_MS;
  const token = signFffSharePayload({ k: 'sub', id: submissionId, exp });
  const site = await getSiteUrlFromRequest();
  const shareUrl = fffShareAbsoluteUrl(site, token);

  const title =
    partnerId === FUNFITFAN_PARTNER_ID && activity
      ? `${activity} · FunFitFan`
      : eventName;

  return (
    <div className="fff-app-inner">
      <p>
        <Link href={fffBrowser.history} className="fff-app-link">
          ← History
        </Link>
      </p>
      <h1 className="mt-6 fff-app-page-title">{title}</h1>
      {createdAt ? <p className="mt-1 text-sm fff-app-muted">{new Date(createdAt).toLocaleString()}</p> : null}
      {resultLine ? <p className="mt-3 text-sm fff-app-muted">{resultLine}</p> : null}

      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="fff-app-media" />
      ) : (
        <p className="mt-6 fff-app-footnote">No image URL on file.</p>
      )}

      <div className="mt-8">
        <HistoryDeleteSubmissionButton
          submissionId={submissionId}
          label={title}
          redirectAfterDelete={fffBrowser.history}
        />
      </div>

      <section className="fff-app-panel">
        <h2 className="fff-app-panel-title">Share with friends</h2>
        <p className="fff-app-panel-lede">
          Anyone with the link can view this image (no sign-in). Links expire after about one year.
        </p>
        <div className="mt-4">
          <ShareLinkActions shareUrl={shareUrl} title={title} />
        </div>
      </section>
    </div>
  );
}
