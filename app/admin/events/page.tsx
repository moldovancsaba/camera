/**
 * Admin Events Listing
 * Version: 1.1.0
 * 
 * List all events with search, filter by partner, and pagination
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';

export default async function EventsPage() {
  let events: any[] = [];
  let partners: any[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    
    // Get events
    events = await db
      .collection(COLLECTIONS.EVENTS)
      .find({})
      .sort({ eventDate: -1, createdAt: -1 })
      .limit(100)
      .toArray();

    // Get partners for filtering
    partners = await db
      .collection(COLLECTIONS.PARTNERS)
      .find({ isActive: true })
      .sort({ name: 1 })
      .toArray();

  } catch (error) {
    console.error('Error fetching events:', error);
    dbError = error;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Events</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Manage partner events and frame assignments</p>
        </div>
        <Link
          href="/admin/events/new"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span>+</span>
          <span>Add Event</span>
        </Link>
      </div>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && events.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-4">🎯</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No events yet</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Get started by adding your first event</p>
          <Link
            href="/admin/events/new"
            className="inline-flex px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Add Your First Event
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Event Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Partner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Frames
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {events.map((event: any) => (
                <tr key={event._id.toString()} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div>
                        <Link
                          href={`/admin/events/${event._id}`}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-sm font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                        >
                          <span className="mr-1.5">🎯</span>
                          {event.name}
                        </Link>
                        {event.description && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-2">
                            {event.description}
                          </div>
                        )}
                        {event.location && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            📍 {event.location}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/admin/partners?search=${encodeURIComponent(event.partnerName)}`}
                      className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline"
                    >
                      {event.partnerName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {event.eventDate ? new Date(event.eventDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 dark:text-white">
                      {event.frames?.length || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      event.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {event.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Link
                      href={`/admin/events/${event._id}`}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      View
                    </Link>
                    <Link
                      href={`/admin/events/${event._id}/edit`}
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
