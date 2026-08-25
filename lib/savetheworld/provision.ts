/**
 * savetheworld -> camera provisioning, mirroring lib/messmass/provision.ts.
 * savetheworld needs exactly one partner and one event (its shared pledge
 * campaign) — link-by-name-else-create, same hybrid identity rule as the
 * messmass integration, minus the organization layer savetheworld has no use for.
 */
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { inheritPartnerDefaults } from '@/lib/db/events';
import { apiBadRequest, apiNotFound } from '@/lib/api';

function ci(name: string) {
  return { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
}

export async function upsertPartner(input: { name: string; logoUrl?: string }) {
  const db = await connectToDatabase();
  const name = String(input.name || '').trim();
  if (!name) throw apiBadRequest('name is required');
  const now = generateTimestamp();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ name: ci(name) });
  if (partner) {
    if (input.logoUrl && !partner.logoUrl) {
      await db.collection(COLLECTIONS.PARTNERS).updateOne({ _id: partner._id }, { $set: { logoUrl: input.logoUrl, updatedAt: now } });
    }
    return { partnerId: partner.partnerId, name: partner.name, created: false, linked: true };
  }
  const doc: Record<string, unknown> = {
    partnerId: generateId(), name, isActive: true,
    logoUrl: input.logoUrl || undefined,
    source: 'savetheworld', createdBy: 'savetheworld-internal-api',
    createdAt: now, updatedAt: now,
  };
  await db.collection(COLLECTIONS.PARTNERS).insertOne(doc);
  return { partnerId: doc.partnerId as string, name: doc.name as string, created: true, linked: false };
}

export async function provisionEvent(input: { savetheworldEventId: string; partnerId: string; eventName: string; eventDate?: string }) {
  const db = await connectToDatabase();
  const now = generateTimestamp();
  if (!input.savetheworldEventId) throw apiBadRequest('savetheworldEventId is required');

  // Idempotent: one camera event per savetheworld provisioning key.
  const existing = await db.collection(COLLECTIONS.EVENTS).findOne({ savetheworldEventId: input.savetheworldEventId });
  if (existing) {
    return { eventId: existing.eventId, mongoId: String(existing._id), partnerId: existing.partnerId, created: false };
  }
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: input.partnerId });
  if (!partner) throw apiNotFound('camera partner (provision the partner first)');

  const defaults = await inheritPartnerDefaults(partner.partnerId);
  const doc: Record<string, unknown> = {
    eventId: generateId(),
    name: String(input.eventName || '').trim() || 'Untitled event',
    partnerId: partner.partnerId,
    partnerName: partner.name,
    eventDate: input.eventDate || undefined,
    isActive: true,
    showLogo: false,
    customPages: [],
    submissionCount: 0,
    brandColor: defaults.brandColor,
    brandBorderColor: defaults.brandBorderColor,
    brandColorsOverridden: defaults.brandColorsOverridden,
    frames: defaults.frames,
    framesOverridden: defaults.framesOverridden,
    logos: defaults.logos || [],
    logosOverridden: defaults.logosOverridden,
    tryOn: { enabled: false, setupId: null, allowedLeatherSuitIds: [], vettingEnabled: true, includeApprovedResultsInSlideshows: false, resultSlideshowMode: 'disabled' },
    savetheworldEventId: input.savetheworldEventId,
    source: 'savetheworld',
    createdAt: now,
    updatedAt: now,
  };
  const res = await db.collection(COLLECTIONS.EVENTS).insertOne(doc);
  return { eventId: doc.eventId as string, mongoId: String(res.insertedId), partnerId: partner.partnerId, created: true };
}
