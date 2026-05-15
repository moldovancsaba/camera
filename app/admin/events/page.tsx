/**
 * Admin Events Listing
 * 
 * List all events with search, filter by partner, and pagination
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  isGlobalAdminSession,
  listAccessiblePartnerIds,
  listSessionPartnerAssignments,
} from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';

interface EventListItem {
  _id: { toString(): string };
  name: string;
  description?: string;
  partnerName: string;
  location?: string;
  eventDate?: string;
  frames?: Array<{ frameId: string }>;
  isActive: boolean;
}

interface PartnerListItem {
  _id: { toString(): string };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; partner?: string }>;
}) {
  let events: EventListItem[] = [];
  let partners: PartnerListItem[] = [];
  let dbError: unknown = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const partnerFilter = typeof resolvedSearchParams?.partner === 'string' ? resolvedSearchParams.partner.trim() : '';
  const session = await getSession();
  let canCreate = isGlobalAdminSession(session);

  try {
    const db = await connectToDatabase();
    const accessiblePartnerIds = await listAccessiblePartnerIds(db, session!, 'events');
    const assignments = await listSessionPartnerAssignments(db, session!);
    canCreate = canCreate || assignments.some(
      (assignment) =>
        assignment.isActive &&
        assignment.appKey === 'events' &&
        (assignment.role === 'manager' || assignment.role === 'admin')
    );
    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }
    if (partnerFilter) {
      query.partnerName = { $regex: `^${partnerFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }
    if (!isGlobalAdminSession(session)) {
      query.partnerId = { $in: accessiblePartnerIds };
    }
    
    // Get events
    events = await db
      .collection(COLLECTIONS.EVENTS)
      .find(query)
      .sort({ eventDate: -1, createdAt: -1 })
      .limit(100)
      .toArray() as unknown as EventListItem[];

    // Get partners for filtering
    partners = await db
      .collection(COLLECTIONS.PARTNERS)
      .find(
        !isGlobalAdminSession(session)
          ? { isActive: true, partnerId: { $in: accessiblePartnerIds } }
          : { isActive: true }
      )
      .sort({ name: 1 })
      .toArray() as unknown as PartnerListItem[];

  } catch (error) {
    console.error('Error fetching events:', error);
    dbError = error;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Events App</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage event app instances that use partner defaults, shared resources, and gallery flows.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/admin/events/new"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <span>+</span>
            <span>Add Event Instance</span>
          </Link>
        ) : null}
      </div>

      {!dbError && (
        <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
              App Model
            </p>
            <h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Campaign / Event Runtime</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Each record here is an event app instance for a partner. It inherits partner resources and can override
              them when the experience needs to diverge.
            </p>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Partner-first operations</p>
            <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
              Create new event instances from a partner workspace whenever possible so the inheritance context stays
              explicit.
            </p>
            <div className="mt-4">
              <Link
                href="/admin/partners"
                className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Open Partners
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Current inventory</p>
            <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
              {events.length} event app instance{events.length === 1 ? '' : 's'} across {partners.length} active
              partner{partners.length === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
      )}

      <form className="mb-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:flex-row">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search event name, description, or location"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        />
        <input type="hidden" name="partner" value={partnerFilter} />
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
          {(search || partnerFilter) ? (
            <Link
              href="/admin/events"
              className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>
      {partnerFilter ? (
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Filtering by partner: <span className="font-semibold text-gray-900 dark:text-white">{partnerFilter}</span>
        </div>
      ) : null}

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && events.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-4">🎯</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No events yet</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Get started by creating the first event app instance for a partner.
          </p>
          {canCreate ? (
            <Link
              href="/admin/events/new"
              className="inline-flex px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Add Your First Event Instance
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Event Instance
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
              {events.map((event) => (
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
