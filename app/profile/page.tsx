/**
 * User Profile Page
 *
 * Displays user's photo submission history in a gallery view.
 */

import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { connectToDatabase } from '@/lib/db/mongodb';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { ObjectId } from 'mongodb';

interface ProfileSubmission {
  _id: ObjectId;
  imageUrl: string;
  frameName?: string;
  createdAt: string;
}

// This page uses cookies and database, so it must be dynamic
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  // Check authentication
  const session = await getSession();

  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  // Fetch user's submissions
  let submissions: ProfileSubmission[] = [];
  let error = null;

  try {
    const db = await connectToDatabase();
    const rawSubmissions = await db
      .collection('submissions')
      .find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    submissions = rawSubmissions.flatMap((submission) =>
      typeof submission.imageUrl === 'string' && typeof submission.createdAt === 'string'
        ? [
            {
              _id: submission._id,
              imageUrl: submission.imageUrl,
              frameName: typeof submission.frameName === 'string' ? submission.frameName : undefined,
              createdAt: submission.createdAt,
            },
          ]
        : []
    );
  } catch (err) {
    console.error('Error fetching submissions:', err);
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  return (
    <div className="min-h-screen bg-transparent py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="app-canvas-page-title">My Gallery</h1>
              <p className="app-canvas-subtitle">{session.user.name || session.user.email}</p>
            </div>
            <Link href="/" className="app-canvas-back">
              ← Back
            </Link>
          </div>

          <div className="flex gap-4">
            <Link href="/capture" className="app-btn app-btn--primary app-btn--inline">
              📸 Take New Photo
            </Link>
          </div>
        </div>

        {error ? (
          <div className="app-alert-error" role="alert">
            <p className="app-alert-error-title">Error loading gallery</p>
            <p className="app-alert-error-detail">{error}</p>
          </div>
        ) : null}

        {!error && submissions.length === 0 ? (
          <div className="app-surface-card app-surface-card-pad-lg">
            <div className="text-6xl mb-4">📷</div>
            <h2 className="app-surface-card-title">No photos yet</h2>
            <p className="app-surface-card-lede">Start creating amazing photos with frames!</p>
            <Link href="/capture" className="app-btn app-btn--primary app-btn--inline">
              Take Your First Photo
            </Link>
          </div>
        ) : null}

        {!error && submissions.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="app-canvas-count">
                {submissions.length} {submissions.length === 1 ? 'photo' : 'photos'}
              </p>
            </div>

            <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
              {submissions.map((submission) => (
                <div
                  key={submission._id.toString()}
                  className="app-surface-card overflow-hidden transition-shadow hover:shadow-md group mb-4 break-inside-avoid"
                >
                  <Link href={`/share/${submission._id}`}>
                    <div className="app-thumb-placeholder">
                      <Image
                        src={submission.imageUrl}
                        alt={`Photo with ${submission.frameName}`}
                        width={800}
                        height={800}
                        unoptimized
                        className="w-full h-auto group-hover:scale-105 transition-transform"
                      />
                    </div>
                  </Link>
                  <div className="app-surface-card-pad-sm">
                    <p className="app-surface-card-row-title mb-1">{submission.frameName}</p>
                    <p className="app-surface-meta">
                      {new Date(submission.createdAt).toLocaleDateString()}
                    </p>
                    <div className="app-inline-actions">
                      <a
                        href={submission.imageUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="app-btn app-btn--primary app-btn--compact app-btn--inline"
                      >
                        💾 Download
                      </a>
                      <Link
                        href={`/share/${submission._id}`}
                        className="app-btn app-btn--secondary app-btn--compact app-btn--inline text-center"
                      >
                        🔗 Share
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
