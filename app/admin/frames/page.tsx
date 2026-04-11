/**
 * Admin Frames Listing
 * 
 * List all frames with search, filter, and pagination.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import Image from 'next/image';

export default async function FramesPage() {
  let frames: any[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    frames = await db
      .collection('frames')
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
  } catch (error) {
    console.error('Error fetching frames:', error);
    dbError = error;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Frames</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Manage photo frames and overlays</p>
        </div>
        <Link
          href="/admin/frames/new"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span>+</span>
          <span>Add Frame</span>
        </Link>
      </div>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && frames.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-4">🖼️</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No frames yet</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Get started by adding your first frame</p>
          <Link
            href="/admin/frames/new"
            className="inline-flex px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Add Your First Frame
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {frames.map((frame: any) => (
            <div
              key={frame._id.toString()}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="relative bg-gray-100 dark:bg-gray-700" style={{ aspectRatio: '1', maxHeight: '300px' }}>
                <Image
                  src={frame.imageUrl}
                  alt={frame.name}
                  fill
                  className="object-contain p-4"
                  unoptimized
                />
              </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{frame.name}</h3>
                  {frame.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">{frame.description}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
                    <span className="capitalize">{frame.category}</span>
                    <span className={frame.isActive ? 'text-green-600' : 'text-red-600'}>
                      {frame.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </div>
                  <Link
                    href={`/admin/frames/${frame._id}/edit`}
                    className="block w-full px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors text-center"
                  >
                    Edit
                  </Link>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
