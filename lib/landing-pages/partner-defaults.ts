import { ObjectId, type Db, type Document } from 'mongodb';
import { createHash } from 'node:crypto';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { defaultCameraOrigin } from '@/lib/site-hosts';
import { ensureDefaultSlideshow } from '@/lib/slideshow/default-slideshow';

/** Materializes one event-specific public page from a partner template; later requests refresh it only while it remains inherited. */
export async function ensureInheritedDefaultLandingPage(
  db: Db,
  event: Document,
  options: { preferPartnerDefault?: boolean } = {},
): Promise<Document | null> {
  const eventMongoId = String(event._id ?? '');
  const eventId = String(event.eventId ?? '');
  const partnerId = String(event.partnerId ?? '');
  if (!ObjectId.isValid(eventMongoId) || !eventId || !partnerId) return null;

  const pages = db.collection(COLLECTIONS.LANDING_PAGES);
  if (!options.preferPartnerDefault) {
    const ownDefault = await pages.findOne({ eventMongoId, isDefault: true, inheritedFromPartnerId: { $exists: false } });
    if (ownDefault) return ownDefault;
  }

  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId }, { projection: { contentDefaults: 1 } });
  const defaults = partner?.contentDefaults as { revision?: number; landingPage?: Record<string, unknown> | null } | undefined;
  const template = defaults?.landingPage;
  const inherited = await pages.findOne({ eventMongoId, inheritedFromPartnerId: partnerId });
  if (!template || template.isActive === false) {
    if (inherited) await pages.deleteOne({ _id: inherited._id, inheritedFromPartnerId: partnerId });
    return null;
  }

  let slideshow = await db.collection(COLLECTIONS.SLIDESHOWS).findOne({ eventId, isDefault: true });
  if (!slideshow) {
    const ensured = await ensureDefaultSlideshow(db, event);
    if (!ensured.ok) return null;
    slideshow = await db.collection(COLLECTIONS.SLIDESHOWS).findOne({ slideshowId: ensured.slideshowId });
  }
  if (!slideshow) return null;

  const revision = Math.max(0, Number(defaults?.revision) || 0);
  if (inherited && Number(inherited.inheritedPartnerRevision) === revision && inherited.targetId === slideshow.slideshowId) return inherited;

  const now = generateTimestamp();
  const captureUrl = `${defaultCameraOrigin()}/capture/${eventMongoId}`;
  const url = typeof template.url === 'string' ? template.url.replaceAll('{eventCaptureUrl}', captureUrl) : null;
  const stableSlug = `event-${eventId}`;
  const collidingSlug = await pages.findOne({ slug: stableSlug, ...(inherited?._id ? { _id: { $ne: inherited._id } } : {}) }, { projection: { _id: 1 } });
  const slug = collidingSlug
    ? `event-${eventId}-${createHash('sha256').update(`${partnerId}:${eventId}`).digest('hex').slice(0, 8)}`
    : stableSlug;
  const eventFields = {
    eventMongoId,
    eventId,
    eventName: String(event.name ?? ''),
    slug,
    title: template.title ?? null,
    description: template.description ?? null,
    logoId: template.logoId ?? null,
    logoUrl: template.logoUrl ?? null,
    qrCodeImageUrl: template.qrCodeImageUrl ?? null,
    url,
    urlButtonText: template.urlButtonText ?? null,
    termsMarkdown: template.termsMarkdown ?? null,
    termsFileName: template.termsFileName ?? null,
    privacyMarkdown: template.privacyMarkdown ?? null,
    privacyFileName: template.privacyFileName ?? null,
    backgroundColor: template.backgroundColor ?? null,
    titleColor: template.titleColor ?? null,
    descriptionColor: template.descriptionColor ?? null,
    qrTitleColor: template.qrTitleColor ?? null,
    cookiesTitleColor: template.cookiesTitleColor ?? null,
    cookiesBodyColor: template.cookiesBodyColor ?? null,
    legalTitleColor: template.legalTitleColor ?? null,
    legalLinkTextColor: template.legalLinkTextColor ?? null,
    buttonColor: template.buttonColor ?? null,
    buttonTextColor: template.buttonTextColor ?? null,
    customCssPresetId: template.customCssPresetId ?? null,
    customCssClassName: template.customCssClassName ?? null,
    customCss: template.customCss ?? null,
    cookieConsentEnabled: template.cookieConsentEnabled === true,
    cookieConsentRequired: template.cookieConsentRequired !== false,
    targetType: 'slideshow',
    targetId: String(slideshow.slideshowId),
    targetName: String(slideshow.name ?? 'Event default slideshow'),
    isActive: true,
    isDefault: true,
    inheritedFromPartnerId: partnerId,
    inheritedPartnerRevision: revision,
    updatedAt: now,
  };

  if (inherited) {
    await pages.updateOne({ _id: inherited._id, inheritedFromPartnerId: partnerId }, { $set: eventFields });
    return { ...inherited, ...eventFields };
  }

  const newPage = { landingPageId: `partner-default-${eventId}`, ...eventFields, createdBy: 'system', createdAt: now };
  try {
    const inserted = await pages.insertOne(newPage);
    return { ...newPage, _id: inserted.insertedId };
  } catch (error) {
    // A second request can win the unique slug race. Read that event's copy rather than surfacing a public 500.
    const raced = await pages.findOne({ eventMongoId, inheritedFromPartnerId: partnerId });
    if (raced) return raced;
    throw error;
  }
}
