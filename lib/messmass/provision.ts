/**
 * messmass -> camera provisioning. messmass is the source of truth for
 * organisations, partners and events; these helpers create/link the mirror
 * records in camera and stamp the messmass ids for a shared identity.
 *
 * Hybrid identity (per product decision): link an existing camera record by
 * messmass id, else by name (case-insensitive), else create a new one.
 *
 * Events reuse camera's inheritPartnerDefaults() so a provisioned event gets its
 * partner's default design (brand colors / frames / logos), still editable in
 * camera via the *Overridden flags.
 */
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateId, generateTimestamp } from '@/lib/db/schemas';
import { inheritPartnerDefaults } from '@/lib/db/events';
import { apiBadRequest, apiNotFound } from '@/lib/api';

function ci(name: string) {
  return { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
}

export async function upsertOrganization(input: { messmassOrganizationId?: string; name: string }) {
  const db = await connectToDatabase();
  const name = String(input.name || '').trim();
  const now = generateTimestamp();
  let org = input.messmassOrganizationId
    ? await db.collection(COLLECTIONS.ORGANIZATIONS).findOne({ messmassOrganizationId: input.messmassOrganizationId })
    : null;
  if (!org && name) org = await db.collection(COLLECTIONS.ORGANIZATIONS).findOne({ name: ci(name) });
  if (org) {
    await db.collection(COLLECTIONS.ORGANIZATIONS).updateOne(
      { _id: org._id },
      { $set: { messmassOrganizationId: input.messmassOrganizationId || org.messmassOrganizationId, updatedAt: now } },
    );
    return { organizationId: org.organizationId, name: org.name, created: false, linked: true };
  }
  const doc = { organizationId: generateId(), name, messmassOrganizationId: input.messmassOrganizationId, source: 'messmass', createdAt: now, updatedAt: now };
  await db.collection(COLLECTIONS.ORGANIZATIONS).insertOne(doc);
  return { organizationId: doc.organizationId, name: doc.name, created: true, linked: false };
}

export async function upsertPartner(input: { messmassPartnerId?: string; name: string; logoUrl?: string; organizationId?: string; cameraPartnerId?: string }) {
  const db = await connectToDatabase();
  const name = String(input.name || '').trim();
  const now = generateTimestamp();
  // Adoption targets a specific existing camera partner by id; else link by
  // messmass id, else by name (case-insensitive), else create.
  let partner = input.cameraPartnerId
    ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: input.cameraPartnerId })
    : null;
  if (!partner && input.messmassPartnerId) partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ messmassPartnerId: input.messmassPartnerId });
  if (!partner && name) partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ name: ci(name) });
  if (partner) {
    const set: Record<string, unknown> = { updatedAt: now };
    if (input.messmassPartnerId) set.messmassPartnerId = input.messmassPartnerId;
    if (input.organizationId) set.organizationId = input.organizationId;
    if (input.logoUrl && !partner.logoUrl) set.logoUrl = input.logoUrl;
    await db.collection(COLLECTIONS.PARTNERS).updateOne({ _id: partner._id }, { $set: set });
    return { partnerId: partner.partnerId, name: partner.name, created: false, linked: true };
  }
  const doc: Record<string, unknown> = {
    partnerId: generateId(), name, isActive: true,
    logoUrl: input.logoUrl || undefined, organizationId: input.organizationId,
    messmassPartnerId: input.messmassPartnerId, source: 'messmass', createdAt: now, updatedAt: now,
  };
  await db.collection(COLLECTIONS.PARTNERS).insertOne(doc);
  return { partnerId: doc.partnerId as string, name: doc.name as string, created: true, linked: false };
}

export async function findPartners(query: { name?: string; messmassPartnerId?: string; limit?: number }) {
  const db = await connectToDatabase();
  const q: Record<string, unknown> = {};
  if (query.messmassPartnerId) q.messmassPartnerId = query.messmassPartnerId;
  else if (query.name) q.name = ci(query.name);
  const docs = await db.collection(COLLECTIONS.PARTNERS).find(q).limit(Math.min(query.limit ?? 50, 200)).toArray();
  return docs.map((p) => ({ partnerId: p.partnerId, name: p.name, messmassPartnerId: p.messmassPartnerId ?? null, organizationId: p.organizationId ?? null }));
}

export async function provisionEvent(input: { messmassEventId: string; messmassPartnerId?: string; partnerId?: string; eventName: string; eventDate?: string; cameraEventId?: string }) {
  const db = await connectToDatabase();
  const now = generateTimestamp();
  if (!input.messmassEventId) {
    throw apiBadRequest('messmassEventId is required');
  }
  // Adoption: an existing camera event (created in camera before messmass knew
  // about it) is being linked to a newly-created messmass event. Stamp the
  // messmass id onto it instead of creating a duplicate. Never clobber an event
  // already linked to a different messmass event.
  if (input.cameraEventId) {
    const target = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId: input.cameraEventId });
    if (!target) throw apiNotFound('camera event (adopt target)');
    const alreadyLinked = target.messmassEventId && target.messmassEventId !== input.messmassEventId;
    if (!target.messmassEventId) {
      await db.collection(COLLECTIONS.EVENTS).updateOne(
        { _id: target._id },
        { $set: { messmassEventId: input.messmassEventId, updatedAt: now } },
      );
    }
    return { eventId: target.eventId, mongoId: String(target._id), partnerId: target.partnerId, created: false, adopted: !alreadyLinked };
  }
  // Idempotent: one camera event per messmass event.
  const existing = await db.collection(COLLECTIONS.EVENTS).findOne({ messmassEventId: input.messmassEventId });
  if (existing) {
    return { eventId: existing.eventId, mongoId: String(existing._id), partnerId: existing.partnerId, created: false };
  }
  let partner = input.partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: input.partnerId }) : null;
  if (!partner && input.messmassPartnerId) partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ messmassPartnerId: input.messmassPartnerId });
  if (!partner) {
    throw apiNotFound('camera partner (provision the partner first)');
  }
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
    // partner default design (editable in camera)
    brandColor: defaults.brandColor,
    brandBorderColor: defaults.brandBorderColor,
    brandColorsOverridden: defaults.brandColorsOverridden,
    frames: defaults.frames,
    framesOverridden: defaults.framesOverridden,
    logos: defaults.logos || [],
    logosOverridden: defaults.logosOverridden,
    tryOn: { enabled: false, setupId: null, allowedLeatherSuitIds: [], vettingEnabled: true, includeApprovedResultsInSlideshows: false, resultSlideshowMode: 'disabled' },
    messmassEventId: input.messmassEventId,
    source: 'messmass',
    createdAt: now,
    updatedAt: now,
  };
  const res = await db.collection(COLLECTIONS.EVENTS).insertOne(doc);
  return { eventId: doc.eventId as string, mongoId: String(res.insertedId), partnerId: partner.partnerId, created: true };
}
