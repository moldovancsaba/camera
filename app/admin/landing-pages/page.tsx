import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';

interface LandingPageInventoryItem {
  _id: { toString(): string };
  slug: string;
  title?: string | null;
  eventMongoId: string;
  eventId: string;
  eventName: string;
  targetType: 'slideshow' | 'layout';
  targetName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EventLookup {
  eventId: string;
  partnerId?: string;
  partnerName?: string;
}

export default async function LandingPagesInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; partner?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let landingPages: LandingPageInventoryItem[] = [];
  let eventLookup = new Map<string, EventLookup>();
  let dbError: unknown = null;

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const partnerFilter = typeof resolvedSearchParams?.partner === 'string' ? resolvedSearchParams.partner.trim() : '';

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = {};

    if (search) {
      query.$or = [
        { slug: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { eventName: { $regex: search, $options: 'i' } },
        { targetName: { $regex: search, $options: 'i' } },
      ];
    }

    landingPages = await db
      .collection(COLLECTIONS.LANDING_PAGES)
      .find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(200)
      .toArray() as unknown as LandingPageInventoryItem[];

    const eventIds = [...new Set(landingPages.map((page) => page.eventId).filter(Boolean))];
    if (eventIds.length > 0) {
      const events = await db
        .collection(COLLECTIONS.EVENTS)
        .find({ eventId: { $in: eventIds } })
        .toArray() as unknown as EventLookup[];
      eventLookup = new Map(events.map((event) => [event.eventId, event]));
    }

    if (partnerFilter) {
      const lowered = partnerFilter.toLowerCase();
      landingPages = landingPages.filter((page) => {
        const event = eventLookup.get(page.eventId);
        return (event?.partnerName || '').toLowerCase() === lowered;
      });
    }
  } catch (error) {
    console.error('Error fetching landing pages:', error);
    dbError = error;
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Landing Pages</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Shared experience surfaces across Camera Core. Each landing page belongs to an event today, but this
            inventory makes ownership, embedded targets, and public URLs manageable from one place.
          </p>
        </div>
      </div>

      {!dbError ? (
        <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-5 shadow-sm dark:border-cyan-800 dark:bg-cyan-900/20">
            <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">Shared resource</p>
            <p className="mt-2 text-sm text-cyan-800 dark:text-cyan-200">
              Landing pages are now visible as first-class Camera Core assets instead of living only inside event
              detail pages.
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Current inventory</p>
            <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
              {landingPages.length} landing page{landingPages.length === 1 ? '' : 's'} matched the current filters.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Editing model</p>
            <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
              Create and edit pages from their parent event today. Use this inventory to find ownership, public URLs,
              and embedded slideshow/layout relationships globally.
            </p>
          </div>
        </div>
      ) : null}

      <form className="mb-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:flex-row">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search slug, title, event, or embedded target"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        />
        <input
          type="text"
          name="partner"
          defaultValue={partnerFilter}
          placeholder="Exact partner name filter"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-cyan-700"
          >
            Search
          </button>
          {search || partnerFilter ? (
            <Link
              href="/admin/landing-pages"
              className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && landingPages.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 text-6xl">🌐</div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">No landing pages found</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Create a landing page from an event workspace, then manage and audit it here.
          </p>
        </div>
      ) : null}

      {!dbError && landingPages.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Landing Page
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Partner / Event
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Embedded Target
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {landingPages.map((page) => {
                const ownerEvent = eventLookup.get(page.eventId);
                return (
                  <tr key={page._id.toString()} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <td className="px-6 py-4 align-top">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {page.title?.trim() || page.slug}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">/landing/{page.slug}</p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Updated {new Date(page.updatedAt || page.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {ownerEvent?.partnerName || 'Unknown partner'}
                      </p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{page.eventName}</p>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <p className="text-sm text-gray-900 dark:text-white">
                        {page.targetType === 'layout' ? 'Layout' : 'Slideshow'}
                      </p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{page.targetName}</p>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          page.isActive
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {page.isActive ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right align-top text-sm font-medium">
                      <div className="flex justify-end gap-3">
                        <Link
                          href={`/admin/events/${page.eventMongoId}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Open Event
                        </Link>
                        <Link
                          href={`/admin/events/${page.eventMongoId}/landing-pages/${page._id}`}
                          className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/landing/${page.slug}`}
                          target="_blank"
                          className="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
