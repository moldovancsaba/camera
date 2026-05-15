/**
 * Logos Admin Page
 *
 * Shared logo inventory with assignment context.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import Link from 'next/link';
import Image from 'next/image';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';

interface Logo {
  _id: { toString(): string };
  logoId: string;
  name: string;
  description?: string;
  imageUrl: string;
  thumbnailUrl: string;
  isActive: boolean;
  usageCount?: number;
  createdAt: string;
}

interface PartnerLogoUsage {
  _id: { toString(): string };
  partnerId: string;
  name: string;
  defaultLogos?: Array<{ logoId: string }>;
}

interface EventLogoUsage {
  _id: { toString(): string };
  eventId: string;
  name: string;
  partnerName?: string;
  logos?: Array<{ logoId: string }>;
}

export default async function LogosPage() {
  let logos: Logo[] = [];
  const partnerUsageByLogoId = new Map<string, PartnerLogoUsage[]>();
  const eventUsageByLogoId = new Map<string, EventLogoUsage[]>();
  let error: unknown = null;

  try {
    const db = await connectToDatabase();
    logos = (await db
      .collection(COLLECTIONS.LOGOS)
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()) as unknown as Logo[];

    const partners = (await db
      .collection(COLLECTIONS.PARTNERS)
      .find({ defaultLogos: { $exists: true, $ne: [] } })
      .toArray()) as unknown as PartnerLogoUsage[];
    for (const partner of partners) {
      for (const logo of partner.defaultLogos || []) {
        const bucket = partnerUsageByLogoId.get(logo.logoId) || [];
        bucket.push(partner);
        partnerUsageByLogoId.set(logo.logoId, bucket);
      }
    }

    const events = (await db
      .collection(COLLECTIONS.EVENTS)
      .find({ logos: { $exists: true, $ne: [] } })
      .toArray()) as unknown as EventLogoUsage[];
    for (const event of events) {
      for (const logo of event.logos || []) {
        const bucket = eventUsageByLogoId.get(logo.logoId) || [];
        bucket.push(event);
        eventUsageByLogoId.set(logo.logoId, bucket);
      }
    }
  } catch (err) {
    console.error('Error fetching logos:', err);
    error = err;
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Global Logos</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Shared logo inventory across partners, event scenarios, and app experiences
          </p>
        </div>
        <Link
          href="/admin/logos/new"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Upload Shared Logo
        </Link>
      </div>

      {error != null ? <DatabaseConnectionAlert error={error} /> : null}

      {!error && logos.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-6xl mb-4">🎨</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No logos yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Upload your first shared logo to start assigning it across partners and apps
          </p>
          <Link
            href="/admin/logos/new"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upload Shared Logo
          </Link>
        </div>
      ) : !error ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {logos.map((logo) => {
            const partnerAssignments = partnerUsageByLogoId.get(logo.logoId) || [];
            const eventAssignments = eventUsageByLogoId.get(logo.logoId) || [];
            const primaryPartner = partnerAssignments[0];
            const primaryEvent = eventAssignments[0];

            return (
              <div
                key={logo.logoId}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="relative aspect-square bg-gray-100 dark:bg-gray-700">
                  <Image
                    src={logo.imageUrl}
                    alt={logo.name}
                    fill
                    className="object-contain p-4"
                    unoptimized
                  />
                  <div className="absolute top-2 right-2">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        logo.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {logo.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1 truncate">
                    {logo.name}
                  </h3>
                  {logo.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                      {logo.description}
                    </p>
                  )}
                  <div className="space-y-1 text-xs text-gray-500 dark:text-gray-500 mb-3">
                    <div>Partner defaults: {partnerAssignments.length}</div>
                    <div>Event assignments: {eventAssignments.length}</div>
                    <div>Usage counter: {logo.usageCount || 0}</div>
                    {primaryPartner && (
                      <div>
                        Partner:{' '}
                        <Link
                          href={`/admin/partners/${primaryPartner._id.toString()}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                        >
                          {primaryPartner.name}
                        </Link>
                      </div>
                    )}
                    {!primaryPartner && primaryEvent && (
                      <div>
                        Event:{' '}
                        <Link
                          href={`/admin/events/${primaryEvent._id.toString()}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                        >
                          {primaryEvent.name}
                        </Link>
                      </div>
                    )}
                    {!primaryPartner && !primaryEvent && <div>Unassigned shared logo</div>}
                  </div>
                  <Link
                    href={`/admin/logos/${logo._id.toString()}/edit`}
                    className="inline-block w-full text-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
