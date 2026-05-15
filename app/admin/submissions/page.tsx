/**
 * Admin Submissions Page
 * 
 * View all photo submissions from all users.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

interface SubmissionGalleryItem {
  _id: { toString(): string };
  imageUrl: string;
  userName: string;
  userEmail: string;
  partnerId?: string | null;
  partnerName?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  frameName?: string;
  createdAt: string;
  playCount?: number;
}

interface PartnerRef {
  _id: { toString(): string };
  partnerId: string;
  name: string;
}

interface EventRef {
  _id: { toString(): string };
  eventId: string;
  name: string;
}

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let submissions: SubmissionGalleryItem[] = [];
  const partnerById = new Map<string, PartnerRef>();
  const eventById = new Map<string, EventRef>();
  let error: unknown = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = { isArchived: false };
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { eventName: { $regex: search, $options: 'i' } },
        { partnerName: { $regex: search, $options: 'i' } },
        { frameName: { $regex: search, $options: 'i' } },
      ];
    }
    // NEW: Exclude archived submissions from main view
    const submissionDocs = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    submissions = submissionDocs as unknown as SubmissionGalleryItem[];

    const partnerIds = Array.from(
      new Set(
        submissions
          .map((submission) => submission.partnerId)
          .filter((partnerId): partnerId is string => typeof partnerId === 'string' && partnerId.trim().length > 0)
      )
    );
    const eventIds = Array.from(
      new Set(
        submissions
          .map((submission) => submission.eventId)
          .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.trim().length > 0)
      )
    );

    if (partnerIds.length > 0) {
      const partners = (await db
        .collection(COLLECTIONS.PARTNERS)
        .find({ partnerId: { $in: partnerIds } })
        .toArray()) as unknown as PartnerRef[];
      for (const partner of partners) {
        partnerById.set(partner.partnerId, partner);
      }
    }

    if (eventIds.length > 0) {
      const events = (await db
        .collection(COLLECTIONS.EVENTS)
        .find({ eventId: { $in: eventIds } })
        .toArray()) as unknown as EventRef[];
      for (const event of events) {
        eventById.set(event.eventId, event);
      }
    }
  } catch (err) {
    console.error('Error fetching submissions:', err);
    error = err;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Global Galleries</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Cross-app submission inventory for audit, moderation, and gallery operations.
        </p>
      </div>

      <form className="mb-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:flex-row">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search user, email, partner, event, or frame"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        />
        <div className="flex gap-3">
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 transition-colors">
            Search
          </button>
          {search ? (
            <Link href="/admin/submissions" className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {error != null ? <DatabaseConnectionAlert error={error} /> : null}

      {!error && submissions.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-4">📷</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No gallery items yet</h3>
          <p className="text-gray-600 dark:text-gray-400">Waiting for users to create their first photos!</p>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total: {submissions.length} gallery items
            </p>
          </div>

          {/* Pinterest-style masonry grid */}
          <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4">
            {submissions.map((submission) => {
              const partner = submission.partnerId ? partnerById.get(submission.partnerId) : undefined;
              const event = submission.eventId ? eventById.get(submission.eventId) : undefined;

              return (
                <div
                  key={submission._id.toString()}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-4 break-inside-avoid"
                >
                  <Link href={`/share/${submission._id}`}>
                    <div className="relative bg-gray-100 dark:bg-gray-700">
                      <Image
                        src={submission.imageUrl}
                        alt={`Photo by ${submission.userName}`}
                        width={1200}
                        height={1600}
                        unoptimized
                        className="w-full h-auto hover:scale-105 transition-transform"
                      />
                    </div>
                  </Link>
                  <div className="p-4">
                    <p className="font-semibold text-gray-900 dark:text-white mb-1">
                      {submission.userName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {submission.userEmail}
                    </p>
                    <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="capitalize">{submission.frameName || 'frameless'}</span>
                        <span>{new Date(submission.createdAt).toLocaleDateString()}</span>
                      </div>
                      {partner && (
                        <div>
                          Partner:{' '}
                          <Link
                            href={`/admin/partners/${partner._id.toString()}`}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                          >
                            {partner.name}
                          </Link>
                        </div>
                      )}
                      {event && (
                        <div>
                          Event:{' '}
                          <Link
                            href={`/admin/events/${event._id.toString()}`}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                          >
                            {event.name}
                          </Link>
                        </div>
                      )}
                      {!partner && !event && <div>General / unscoped gallery item</div>}
                    </div>
                    {typeof submission.playCount === 'number' && submission.playCount > 0 && (
                      <div className="mb-3 px-2 py-1 bg-purple-50 dark:bg-purple-900/20 rounded text-xs text-purple-700 dark:text-purple-300 font-semibold text-center">
                        🎬 Slideshow plays: {submission.playCount}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Link
                        href={`/share/${submission._id}`}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors text-center"
                      >
                        View
                      </Link>
                      <a
                        href={submission.imageUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-xs rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-center"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
