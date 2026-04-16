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
  const shareUrl = `${site}/fff/share/${encodeURIComponent(token)}`;

  const title =
    partnerId === FUNFITFAN_PARTNER_ID && activity
      ? `${activity} · FunFitFan`
      : eventName;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-lg">
        <p>
          <Link href="/fff/history" className="text-sm text-emerald-400 hover:underline">
            ← History
          </Link>
        </p>
        <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
        {createdAt ? (
          <p className="mt-1 text-sm text-slate-400">{new Date(createdAt).toLocaleString()}</p>
        ) : null}
        {resultLine ? <p className="mt-3 text-sm text-slate-300">{resultLine}</p> : null}

        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="mt-6 w-full rounded-xl border border-slate-800" />
        ) : (
          <p className="mt-6 text-slate-500">No image URL on file.</p>
        )}

        <div className="mt-8">
          <HistoryDeleteSubmissionButton
            submissionId={submissionId}
            label={title}
            redirectAfterDelete="/fff/history"
          />
        </div>

        <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Share with friends</h2>
          <p className="mt-1 text-xs text-slate-500">
            Anyone with the link can view this image (no sign-in). Links expire after about one year.
          </p>
          <div className="mt-4">
            <ShareLinkActions shareUrl={shareUrl} title={title} />
          </div>
        </section>
      </div>
    </div>
  );
}
