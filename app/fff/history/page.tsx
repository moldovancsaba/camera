/**
 * Unified member history: FunFitFan + event submissions + gym workouts.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { personalHistorySubmissionMongoFilter } from '@/lib/funfitfan/history-scope';
import HistoryPlayReelButton from '@/components/funfitfan/HistoryPlayReelButton';
import HistoryListRow from '@/components/funfitfan/HistoryListRow';

export const dynamic = 'force-dynamic';

export type HistoryListItem = {
  key: string;
  kind: 'submission' | 'gym';
  sortAt: number;
  title: string;
  subtitle: string;
  thumbUrl: string | null;
  href: string;
  badge: string;
  submissionId?: string;
  sessionId?: string;
  lessonTitle?: string;
};

function parseTimeMs(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export default async function FffHistoryPage() {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }
  if (session.appAccess === false) {
    redirect('/');
  }

  const db = await connectToDatabase();
  const profile = await db.collection(COLLECTIONS.FFF_USER_PROFILES).findOne({ userId: session.user.id });
  const eventUuid = typeof profile?.eventUuid === 'string' ? profile.eventUuid.trim() : '';

  const submissionFilter = personalHistorySubmissionMongoFilter(session.user.id, eventUuid || null);

  const [submissions, gymSessions] = await Promise.all([
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .find(submissionFilter)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray(),
    db
      .collection(COLLECTIONS.GYM_WORKOUT_SESSIONS)
      .find({ userId: session.user.id })
      .sort({ startedAt: -1 })
      .limit(200)
      .toArray(),
  ]);

  const rows: HistoryListItem[] = [];

  for (const doc of submissions) {
    const id = doc._id instanceof ObjectId ? doc._id.toString() : String(doc._id);
    const meta = (doc.metadata || {}) as Record<string, unknown>;
    const activity = typeof meta.funfitfanActivity === 'string' ? meta.funfitfanActivity : '';
    const createdAt = typeof doc.createdAt === 'string' ? doc.createdAt : '';
    const eventName = typeof doc.eventName === 'string' ? doc.eventName : 'Photo';
    const badge = 'FunFitFan';
    const title =
      activity ||
      (typeof doc.frameName === 'string' && doc.frameName ? doc.frameName : eventName);
    const subtitle = [eventName, createdAt ? new Date(createdAt).toLocaleString() : '']
      .filter(Boolean)
      .join(' · ');
    const thumbUrl = typeof doc.imageUrl === 'string' ? doc.imageUrl : null;
    rows.push({
      key: `s-${id}`,
      kind: 'submission',
      sortAt: parseTimeMs(createdAt),
      title,
      subtitle,
      thumbUrl,
      href: `/fff/history/submission/${id}`,
      badge,
      submissionId: id,
    });
  }

  for (const doc of gymSessions) {
    const sessionId = typeof doc.sessionId === 'string' ? doc.sessionId : '';
    if (!sessionId) continue;
    const lessonTitle = typeof doc.lessonTitle === 'string' ? doc.lessonTitle : 'Workout';
    const status = typeof doc.status === 'string' ? doc.status : '';
    const startedAt = typeof doc.startedAt === 'string' ? doc.startedAt : '';
    const completedAt = typeof doc.completedAt === 'string' ? doc.completedAt : '';
    const sortIso = completedAt || startedAt;
    const selfie = typeof doc.selfieImageUrl === 'string' ? doc.selfieImageUrl : null;
    rows.push({
      key: `g-${sessionId}`,
      kind: 'gym',
      sortAt: parseTimeMs(sortIso) || parseTimeMs(startedAt),
      title: lessonTitle,
      subtitle: `${status}${startedAt ? ` · ${new Date(startedAt).toLocaleString()}` : ''}`,
      thumbUrl: selfie,
      href: `/fff/history/gym/${sessionId}`,
      badge: 'Gym',
      sessionId,
      lessonTitle,
    });
  }

  rows.sort((a, b) => b.sortAt - a.sortAt);

  const slideshowId = profile && typeof profile.slideshowId === 'string' ? profile.slideshowId : null;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">History</h1>
            <p className="mt-1 text-sm text-slate-400">
              Your reel moments and gym workouts — only you — newest first. Open a row for details and sharing, or
              delete it from the list.
            </p>
          </div>
          <HistoryPlayReelButton slideshowId={slideshowId} />
        </div>

        <p className="mt-6">
          <Link href="/fff" className="text-sm text-emerald-400 hover:underline">
            ← Home
          </Link>
        </p>

        {rows.length === 0 ? (
          <p className="mt-10 text-center text-slate-400">
            Nothing here yet. Use <strong>I DID IT</strong> or <strong>IN THE GYM</strong> to add entries.
          </p>
        ) : (
          <ul className="mt-8 space-y-2">
            {rows.map((row) => (
              <li key={row.key}>
                <HistoryListRow
                  href={row.href}
                  title={row.title}
                  subtitle={row.subtitle}
                  thumbUrl={row.thumbUrl}
                  badge={row.badge}
                  kind={row.kind}
                  submissionId={row.submissionId}
                  sessionId={row.sessionId}
                  lessonTitle={row.lessonTitle}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
