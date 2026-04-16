/**
 * Gym home: published lessons; optional ?sport= filters to one sport (case-insensitive match).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import Link from 'next/link';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';

export const dynamic = 'force-dynamic';

export default async function GymHomePage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const sp = await searchParams;
  const sportFilterRaw = typeof sp.sport === 'string' ? sp.sport.trim() : '';
  const sportFilter = sportFilterRaw ? decodeURIComponent(sportFilterRaw).trim() : '';

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
  const sportKey = sportFilter.length > 0 ? sportFilter.toLowerCase() : '';
  const filtered =
    sportKey.length > 0
      ? typed.filter(
          (l) =>
            (typeof l.sport === 'string' ? l.sport.trim().toLowerCase() : '') === sportKey
        )
      : typed;

  return (
    <div>
      {dbError != null ? (
        <div className="mt-6">
          <DatabaseConnectionAlert error={dbError} />
        </div>
      ) : null}

      {!dbError && (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="fff-app-page-title">Lessons</h2>
            {sportFilter ? (
              <Link href="/fff/log" className="fff-app-link text-sm">
                Change activity
              </Link>
            ) : null}
          </div>
          {sportFilter ? (
            <p className="mt-2 fff-app-muted">
              Showing <span className="font-medium text-[var(--fff-landing-fg)]">{sportFilter}</span> only.
            </p>
          ) : null}
          {filtered.length === 0 ? (
            <p className="mt-3 fff-app-muted">
              {typed.length === 0
                ? 'No published lessons yet.'
                : `No published lessons for “${sportFilter}”.`}
            </p>
          ) : (
            <ul className="fff-history-list mt-4">
              {filtered.map((l) => (
                <li key={l.lessonId} className="fff-history-row">
                  <Link href={`/gym/lesson/${l.lessonId}`} className="fff-history-row-link">
                    <div className="fff-history-thumb">
                      <div className="fff-history-thumb-placeholder" aria-hidden>
                        🏋️
                      </div>
                    </div>
                    <div className="fff-history-body">
                      <div className="fff-history-title-row">
                        <span className="fff-history-title">{l.title}</span>
                        {typeof l.sport === 'string' && l.sport.trim() ? (
                          <span className="fff-history-badge">{l.sport}</span>
                        ) : null}
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
      )}
    </div>
  );
}
