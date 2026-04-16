/**
 * Workout lessons list: filtered by sport from I DO IT (cookie) or ?sport= (redirects / deep links).
 */

import { cookies } from 'next/headers';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import Link from 'next/link';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import { FFF_WORKOUT_ACTIVITY_COOKIE } from '@/lib/workout/activity-cookie';

export const dynamic = 'force-dynamic';

function decodeSport(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export default async function WorkoutHomePage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const sp = await searchParams;
  const querySportRaw = typeof sp.sport === 'string' ? sp.sport.trim() : '';
  const querySport = querySportRaw ? decodeSport(querySportRaw) : '';

  const jar = await cookies();
  const cookieRaw = jar.get(FFF_WORKOUT_ACTIVITY_COOKIE)?.value;
  const cookieSport = cookieRaw ? decodeSport(cookieRaw) : '';

  const sportFilter = (querySport || cookieSport).trim();
  const sportKey = sportFilter.toLowerCase();

  let lessons: unknown[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    lessons = await db
      .collection(COLLECTIONS.GYM_LESSONS)
      .find({ isPublished: true })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
  } catch (e) {
    dbError = e;
  }

  const typed = lessons as { lessonId: string; title: string; description?: string; sport?: string }[];
  const hasSportContext = sportKey.length > 0;
  const filtered = hasSportContext
    ? typed.filter(
        (l) =>
          (typeof l.sport === 'string' ? l.sport.trim().toLowerCase() : '') === sportKey
      )
    : [];

  return (
    <div>
      {dbError != null ? (
        <div className="mt-6">
          <DatabaseConnectionAlert error={dbError} />
        </div>
      ) : null}

      {!dbError && !hasSportContext ? (
        <section className="mt-8">
          <p className="fff-app-muted">
            Choose your activity on{' '}
            <Link href="/fff/log" className="fff-app-link">
              I DO IT
            </Link>{' '}
            to see your workouts here.
          </p>
        </section>
      ) : null}

      {!dbError && hasSportContext ? (
        <section className="mt-6">
          {filtered.length === 0 ? (
            <p className="mt-2 fff-app-muted">
              {typed.length === 0
                ? 'No published lessons yet.'
                : `No published lessons for “${sportFilter}”.`}
            </p>
          ) : (
            <ul className="fff-history-list mt-2">
              {filtered.map((l) => (
                <li key={l.lessonId} className="fff-history-row">
                  <Link href={`/workout/lesson/${l.lessonId}`} className="fff-history-row-link">
                    <div className="fff-history-thumb">
                      <div className="fff-history-thumb-placeholder" aria-hidden>
                        🏋️
                      </div>
                    </div>
                    <div className="fff-history-body">
                      <div className="fff-history-title-row">
                        <span className="fff-history-title">{l.title}</span>
                      </div>
                      {l.description ? (
                        <p className="fff-history-subtitle line-clamp-2">{l.description}</p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
