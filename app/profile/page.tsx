/**
 * User Profile Page
 * 
 * Displays user's photo submission history in a gallery view.
 */

import { getSession } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongodb';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

// This page uses cookies and database, so it must be dynamic
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  // Check authentication
  const session = await getSession();
  
  if (!session) {
    redirect('/api/auth/login');
  }

  // Fetch user's submissions
  let submissions: any[] = [];
  let error = null;

  try {
    const db = await connectToDatabase();
    submissions = await db
      .collection('submissions')
      .find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
  } catch (err) {
    console.error('Error fetching submissions:', err);
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                My Gallery
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {session.user.name || session.user.email}
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Back
            </Link>
          </div>

          <div className="flex gap-4">
            <Link
              href="/capture"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              📸 Take New Photo
            </Link>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200 font-medium">Error loading gallery</p>
            <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Gallery */}
        {!error && submissions.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="text-6xl mb-4">📷</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No photos yet
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Start creating amazing photos with frames!
            </p>
            <Link
              href="/capture"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Take Your First Photo
            </Link>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {submissions.length} {submissions.length === 1 ? 'photo' : 'photos'}
              </p>
            </div>

            {/* Pinterest-style masonry grid */}
            <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
              {submissions.map((submission: any) => (
                <div
                  key={submission._id.toString()}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow group mb-4 break-inside-avoid"
                >
                  <Link href={`/share/${submission._id}`}>
                    <div className="relative bg-gray-100 dark:bg-gray-700">
                      <img
                        src={submission.imageUrl}
                        alt={`Photo with ${submission.frameName}`}
                        className="w-full h-auto group-hover:scale-105 transition-transform"
                      />
                    </div>
                  </Link>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                      {submission.frameName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(submission.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <a
                        href={submission.imageUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors text-center"
                      >
                        💾 Download
                      </a>
                      <Link
                        href={`/share/${submission._id}`}
                        className="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-xs rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-center"
                      >
                        🔗 Share
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
