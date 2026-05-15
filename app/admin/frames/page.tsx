/**
 * Admin Frames Listing
 * 
 * List all frames with search, filter, and pagination.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import Image from 'next/image';

interface FrameListItem {
  _id: { toString(): string };
  frameId?: string;
  imageUrl: string;
  name: string;
  description?: string;
  category?: string;
  isActive: boolean;
  ownershipLevel?: 'global' | 'partner' | 'event';
  partnerId?: string | null;
  partnerName?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  usageCount?: number;
}

interface PartnerRef {
  _id: { toString(): string };
  partnerId: string;
  name: string;
}

interface EventRef {
  _id: { toString(): string };
  eventId: string;
  name: string;
  partnerName?: string;
}

function inferFrameScope(frame: FrameListItem): 'global' | 'partner' | 'event' {
  if (frame.ownershipLevel) return frame.ownershipLevel;
  if (frame.eventId) return 'event';
  if (frame.partnerId) return 'partner';
  return 'global';
}

export default async function FramesPage() {
  let frames: FrameListItem[] = [];
  const partnerById = new Map<string, PartnerRef>();
  const eventById = new Map<string, EventRef>();
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
    const frameDocs = await db
      .collection(COLLECTIONS.FRAMES)
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    frames = frameDocs as unknown as FrameListItem[];

    const partnerIds = Array.from(
      new Set(
        frames
          .map((frame) => frame.partnerId)
          .filter((partnerId): partnerId is string => typeof partnerId === 'string' && partnerId.trim().length > 0)
      )
    );
    const eventIds = Array.from(
      new Set(
        frames
          .map((frame) => frame.eventId)
          .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.trim().length > 0)
      )
    );

    if (partnerIds.length > 0) {
      const partners = (await db
        .collection(COLLECTIONS.PARTNERS)
        .find({ partnerId: { $in: partnerIds } })
        .toArray()) as unknown as PartnerRef[];
      for (const partner of partners) {
        partnerById.set(partner.partnerId, partner);
      }
    }

    if (eventIds.length > 0) {
      const events = (await db
        .collection(COLLECTIONS.EVENTS)
        .find({ eventId: { $in: eventIds } })
        .toArray()) as unknown as EventRef[];
      for (const event of events) {
        eventById.set(event.eventId, event);
      }
    }
  } catch (error) {
    console.error('Error fetching frames:', error);
    dbError = error;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Global Frames</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Shared frame inventory across partners and app experiences.
          </p>
        </div>
          <Link
            href="/admin/frames/new"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <span>+</span>
            <span>Add Shared Frame</span>
          </Link>
      </div>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && frames.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-4">🖼️</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No frames yet</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Add your first shared frame to start assigning it across partners and apps.
          </p>
          <Link
            href="/admin/frames/new"
            className="inline-flex px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Add Your First Frame
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {frames.map((frame) => {
            const scope = inferFrameScope(frame);
            const partner = frame.partnerId ? partnerById.get(frame.partnerId) : undefined;
            const event = frame.eventId ? eventById.get(frame.eventId) : undefined;

            return (
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
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                        scope === 'global'
                          ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          : scope === 'partner'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                      }`}
                    >
                      {scope === 'global' ? 'Global' : scope === 'partner' ? 'Partner' : 'Event'}
                    </span>
                    <span className={frame.isActive ? 'text-xs text-green-600' : 'text-xs text-red-600'}>
                      {frame.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{frame.name}</h3>
                  {frame.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">{frame.description}</p>
                  )}
                  <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="capitalize">{frame.category || 'general'}</span>
                      <span>Used {frame.usageCount || 0} time{frame.usageCount === 1 ? '' : 's'}</span>
                    </div>
                    {scope === 'partner' && partner && (
                      <div>
                        Partner:{' '}
                        <Link
                          href={`/admin/partners/${partner._id.toString()}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                        >
                          {partner.name}
                        </Link>
                      </div>
                    )}
                    {scope === 'event' && event && (
                      <div>
                        Event:{' '}
                        <Link
                          href={`/admin/events/${event._id.toString()}`}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                        >
                          {event.name}
                        </Link>
                      </div>
                    )}
                    {scope === 'event' && event?.partnerName && (
                      <div>Partner: {event.partnerName}</div>
                    )}
                  </div>
                  <Link
                    href={`/admin/frames/${frame._id}/edit`}
                    className="block w-full px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors text-center"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
