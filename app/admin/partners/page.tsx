/**
 * Admin Partners Listing
 * Version: 1.1.0
 * 
 * List all partners with search, filter, pagination, and quick toggle
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';

export default async function PartnersPage() {
  let partners: any[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    partners = await db
      .collection(COLLECTIONS.PARTNERS)
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    // Aggregate real-time counts for each partner
    for (const partner of partners) {
      // Count events for this partner
      const eventCount = await db
        .collection(COLLECTIONS.EVENTS)
        .countDocuments({ partnerId: partner.partnerId });
      
      partner.eventCount = eventCount;
      
      // Count frames for this partner (partner-level and event-level frames)
      const frameCount = await db
        .collection(COLLECTIONS.FRAMES)
        .countDocuments({ partnerId: partner.partnerId });
      
      partner.frameCount = frameCount;
    }
  } catch (error) {
    console.error('Error fetching partners:', error);
    dbError = error;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Partners</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Manage partner organizations and brands</p>
        </div>
        <Link
          href="/admin/partners/new"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span>+</span>
          <span>Add Partner</span>
        </Link>
      </div>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && partners.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-4">🤝</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No partners yet</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Get started by adding your first partner</p>
          <Link
            href="/admin/partners/new"
            className="inline-flex px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Add Your First Partner
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Partner Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Events
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Frames
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {partners.map((partner: any) => (
                <tr key={partner._id.toString()} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div>
                        <Link
                          href={`/admin/partners/${partner._id}`}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        >
                          {partner.name}
                        </Link>
                        {partner.description && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-1">
                            {partner.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 dark:text-white">
                      {partner.eventCount || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 dark:text-white">
                      {partner.frameCount || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      partner.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {partner.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(partner.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Link
                      href={`/admin/partners/${partner._id}`}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      View
                    </Link>
                    <Link
                      href={`/admin/partners/${partner._id}/edit`}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
