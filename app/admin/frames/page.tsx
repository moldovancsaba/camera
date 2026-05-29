/**
 * Admin Frames Listing
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import FramesInventoryList, { type SerializedFrameRow } from '@/components/gds/FramesInventoryList';
import { mongoIdString } from '@/lib/gds/serialize-admin-rows';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

interface FrameListItem {
  _id?: unknown;
  frameId?: string;
  imageUrl: string;
  name: string;
  description?: string;
  category?: string;
  isActive: boolean;
  ownershipLevel?: 'global' | 'partner' | 'event';
  partnerId?: string | null;
  eventId?: string | null;
  usageCount?: number;
}

interface PartnerRef {
  _id?: unknown;
  partnerId: string;
  name: string;
}

interface EventRef {
  _id?: unknown;
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

export default async function FramesPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let frameRows: SerializedFrameRow[] = [];
  let dbError = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } },
          ],
        }
      : {};
    const frameDocs = await db
      .collection(COLLECTIONS.FRAMES)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    const frames = frameDocs as unknown as FrameListItem[];

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

    const partnerById = new Map<string, PartnerRef>();
    const eventById = new Map<string, EventRef>();

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

    frameRows = [];
    for (const frame of frames) {
      const id = mongoIdString(frame._id);
      if (!id) continue;
      const scope = inferFrameScope(frame);
      const partner = frame.partnerId ? partnerById.get(frame.partnerId) : undefined;
      const event = frame.eventId ? eventById.get(frame.eventId) : undefined;
      frameRows.push({
        id,
        name: frame.name,
        description: frame.description ?? null,
        category: frame.category ?? null,
        imageUrl: frame.imageUrl,
        isActive: Boolean(frame.isActive),
        scope,
        usageCount: frame.usageCount || 0,
        partnerId: frame.partnerId ?? null,
        partnerName: partner?.name ?? null,
        partnerAdminId: mongoIdString(partner?._id),
        eventId: frame.eventId ?? null,
        eventName: event?.name ?? null,
        eventAdminId: mongoIdString(event?._id),
      });
    }
  } catch (error) {
    console.error('Error fetching frames:', error);
    dbError = serializeMongoError(error);
  }

  const activeCount = frameRows.filter((frame) => frame.isActive).length;
  const assignmentCount = frameRows.reduce((sum, frame) => sum + frame.usageCount, 0);

  return (
    <AdminListPageShell
      eyebrow="Resource Inventory"
      title="Global Frames"
      description="Shared frame inventory across partners and app experiences."
      primaryAction={{ href: '/admin/frames/new', label: 'Add Shared Frame', iconKey: 'plus' }}
      stats={
        !dbError
          ? [
              { label: 'Visible Frames', value: frameRows.length, iconKey: 'frame' },
              { label: 'Active Frames', value: activeCount, iconKey: 'world' },
              { label: 'Assignments', value: assignmentCount, iconKey: 'frame' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Search frame name, description, or category',
        clearHref: '/admin/frames',
      }}
      dbError={dbError}
    >
      <FramesInventoryList frames={frameRows} />
    </AdminListPageShell>
  );
}
