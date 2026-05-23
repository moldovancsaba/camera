/**
 * Admin Dashboard
 * 
 * Overview dashboard showing key metrics and recent activity.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function AdminDashboard() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  // Get database statistics with error handling
  let framesCount = 0;
  let submissionsCount = 0;
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    
    [framesCount, submissionsCount] = await Promise.all([
      db.collection('frames').countDocuments(),
      db.collection('submissions').countDocuments(),
    ]);
  } catch (error) {
    console.error('Error connecting to database:', error);
    dbError = error;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Camera Core overview across partners, shared resources, and app operations.
        </p>
      </div>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Frames</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{framesCount}</p>
            </div>
            <div className="text-4xl">🖼️</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Submissions</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{submissionsCount}</p>
            </div>
            <div className="text-4xl">📷</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Active Users</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">-</p>
            </div>
            <div className="text-4xl">👥</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Link
          href="/admin/partners"
          className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
          >
            <span className="text-2xl">🤝</span>
            <span className="font-medium text-amber-900 dark:text-amber-100">Open Partners</span>
          </Link>

          <Link
            href="/admin/frames/new"
            className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
          >
            <span className="text-2xl">➕</span>
            <span className="font-medium text-blue-900 dark:text-blue-100">Add New Frame</span>
          </Link>

        <Link
          href="/admin/frames"
          className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
        >
          <span className="text-2xl">🖼️</span>
          <span className="font-medium text-purple-900 dark:text-purple-100">Global Frames</span>
        </Link>

        <Link
          href="/admin/landing-pages"
          className="flex items-center gap-3 p-4 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 rounded-lg transition-colors"
        >
          <span className="text-2xl">🌐</span>
          <span className="font-medium text-cyan-900 dark:text-cyan-100">Landing Pages</span>
        </Link>

        <Link
          href="/admin/submissions"
          className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
          >
            <span className="text-2xl">📷</span>
            <span className="font-medium text-green-900 dark:text-green-100">Global Galleries</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
