/**
 * Admin Submissions Page
 * Version: 1.3.4
 * 
 * View all photo submissions from all users.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Image from 'next/image';
import Link from 'next/link';

export default async function AdminSubmissionsPage() {
  let submissions: any[] = [];
  let error: unknown = null;

  try {
    const db = await connectToDatabase();
    // NEW: Exclude archived submissions from main view
    submissions = await db
      .collection('submissions')
      .find({ isArchived: false })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
  } catch (err) {
    console.error('Error fetching submissions:', err);
    error = err;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Submissions</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">All user photo submissions</p>
      </div>

      {error != null ? <DatabaseConnectionAlert error={error} /> : null}

      {!error && submissions.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-4">📷</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No submissions yet</h3>
          <p className="text-gray-600 dark:text-gray-400">Waiting for users to create their first photos!</p>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total: {submissions.length} submissions
            </p>
          </div>

          {/* Pinterest-style masonry grid */}
          <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4">
            {submissions.map((submission: any) => (
              <div
                key={submission._id.toString()}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-4 break-inside-avoid"
              >
                <Link href={`/share/${submission._id}`}>
                  <div className="relative bg-gray-100 dark:bg-gray-700">
                    <img
                      src={submission.imageUrl}
                      alt={`Photo by ${submission.userName}`}
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
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
                    <span className="capitalize">{submission.frameName}</span>
                    <span>{new Date(submission.createdAt).toLocaleDateString()}</span>
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
