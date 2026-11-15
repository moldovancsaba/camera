/** Read and select the one required service-wide starter journey. */
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiNotFound, apiSuccess, requireAdmin, withErrorHandler } from '@/lib/api';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import { journeyConfigFromStoredTemplate, journeyTemplateForAdmin } from '@/lib/visual-assets/templates';

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const db = await connectToDatabase();
  const [setting, templates, sourceEvents, testEvents] = await Promise.all([
    db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: 'default-experience-template' }),
    db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).find({ level: 'global', ownerId: null }).sort({ updatedAt: -1 }).toArray(),
    // Do not silently hide older events from the source picker: any event may
    // be the accepted starting point for a reusable Global User Journey.
    db.collection(COLLECTIONS.EVENTS).find({}, { projection: { _id: 1, name: 1, eventId: 1, partnerName: 1, eventDate: 1 } }).sort({ updatedAt: -1 }).toArray(),
    db.collection(COLLECTIONS.EVENTS).find({ isActive: { $ne: false } }, { projection: { _id: 1, name: 1, eventId: 1, partnerName: 1, eventDate: 1 } }).sort({ updatedAt: -1 }).toArray(),
  ]);
  const safeTemplates = templates.flatMap((template) => {
    const safe = journeyTemplateForAdmin(template as Record<string, unknown>);
    return safe ? [safe] : [];
  });
  const requestedId = typeof setting?.templateId === 'string' ? setting.templateId : null;
  const selected = requestedId
    ? safeTemplates.find((template) => template.templateId === requestedId) ?? null
    : null;
  return apiSuccess({
    templateId: selected?.templateId ?? null,
    selectionNeedsRepair: Boolean(requestedId && !selected),
    templates: safeTemplates,
    sourceEvents: sourceEvents.filter((event) => event._id instanceof ObjectId).map((event) => ({ _id: String(event._id), eventId: event.eventId, name: event.name, partnerName: event.partnerName, eventDate: event.eventDate })),
    testEvents: testEvents.filter((event) => event._id instanceof ObjectId).map((event) => ({ _id: String(event._id), eventId: event.eventId, name: event.name, partnerName: event.partnerName, eventDate: event.eventDate })),
  });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as { templateId?: unknown } | null;
  if (!body || typeof body.templateId !== 'string' || !body.templateId.trim()) throw apiBadRequest('Select a global journey. A global default is required.');
  const db = await connectToDatabase();
  const template = await db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId: body.templateId, level: 'global', ownerId: null });
  if (!template) throw apiNotFound('Global experience template');
  if (!journeyConfigFromStoredTemplate(template.config)) throw apiBadRequest('This Global Journey has invalid saved page data and cannot be selected.');
  const now = generateTimestamp();
  await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne(
    { settingId: 'default-experience-template' },
    { $set: { settingId: 'default-experience-template', templateId: body.templateId, updatedAt: now, updatedBy: session.user.email ?? null } },
    { upsert: true },
  );
  return apiSuccess({ templateId: body.templateId });
});
