/**
 * Atlas index definitions for the Camera database.
 * Run via: npm run db:ensure-indexes (requires MONGODB_URI + MONGODB_DB).
 *
 * Safe to run repeatedly: MongoDB reconciles existing matching indexes.
 * Unique indexes fail if duplicate values exist — fix data first, then re-run.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export interface IndexEnsureResult {
  collection: string;
  name: string;
  status: 'created' | 'exists' | 'error';
  detail?: string;
}

/** How long a raw journey row lives (issue 521, phase 2; docs/JOURNEY_RECORDING.md): 30 days, then the database removes it. The daily counts stay. */
export const JOURNEY_RETENTION_SECONDS = 30 * 24 * 60 * 60;

/**
 * The indexes of the journey recording: the TTL index that removes a raw row after 30 days, the one the median read uses, and the unique key of the daily count. Also created, once per server
 * instance, by the first write (lib/journey/store.ts), so the 30 days hold even if `npm run db:ensure-indexes` was not run; failures are reported, not thrown.
 */
export async function ensureJourneyIndexes(db: Db): Promise<IndexEnsureResult[]> {
  const specs: Array<{ collection: string; keys: Record<string, 1 | -1>; options: Record<string, unknown> }> = [
    { collection: COLLECTIONS.JOURNEY_EVENTS, keys: { at: 1 }, options: { expireAfterSeconds: JOURNEY_RETENTION_SECONDS, name: 'journey_events_at_ttl' } },
    { collection: COLLECTIONS.JOURNEY_EVENTS, keys: { eventId: 1, name: 1, at: -1 }, options: { name: 'journey_events_event_name_at' } },
    { collection: COLLECTIONS.JOURNEY_DAILY, keys: { eventId: 1, day: 1, name: 1, key: 1 }, options: { unique: true, name: 'journey_daily_event_day_name_key_unique' } },
  ];
  const results: IndexEnsureResult[] = [];
  for (const spec of specs) {
    try {
      const name = await db.collection(spec.collection).createIndex(spec.keys, spec.options);
      results.push({ collection: spec.collection, name, status: 'created' });
    } catch (e: unknown) {
      const err = e as { code?: number; codeName?: string; message?: string };
      const msg = err.message ?? String(e);
      const same = err.code === 85 || err.code === 86 || err.codeName === 'IndexOptionsConflict' || err.codeName === 'IndexKeySpecsConflict' || msg.includes('already exists');
      results.push({ collection: spec.collection, name: same ? '(same spec)' : '(error)', status: same ? 'exists' : 'error', detail: msg });
    }
  }
  return results;
}

/**
 * Create recommended indexes for production workloads (slideshow, capture, admin lists).
 */
export async function ensureCameraIndexes(db: Db): Promise<IndexEnsureResult[]> {
  const results: IndexEnsureResult[] = [];

  const track = async (
    collection: string,
    fn: () => Promise<string>
  ): Promise<void> => {
    try {
      const name = await fn();
      results.push({ collection, name, status: 'created' });
    } catch (e: unknown) {
      const err = e as { code?: number; codeName?: string; message?: string };
      const msg = err.message ?? String(e);
      if (
        err.code === 85 ||
        err.code === 86 ||
        err.codeName === 'IndexOptionsConflict' ||
        err.codeName === 'IndexKeySpecsConflict' ||
        msg.includes('already exists')
      ) {
        results.push({ collection, name: '(same spec)', status: 'exists', detail: msg });
        return;
      }
      results.push({
        collection,
        name: '(error)',
        status: 'error',
        detail: msg,
      });
    }
  };

  // Reusable experience templates are selected by their stable id. A unique
  // key keeps duplicate provisioning and retries from creating ambiguous refs.
  await track(COLLECTIONS.EXPERIENCE_TEMPLATES, () =>
    db.collection(COLLECTIONS.EXPERIENCE_TEMPLATES).createIndex(
      { templateId: 1 }, { unique: true, name: 'experience_templates_templateId_unique' },
    )
  );

  // --- organizations (messmass provisioning master lookup) ---
  await track(COLLECTIONS.ORGANIZATIONS, () =>
    db.collection(COLLECTIONS.ORGANIZATIONS).createIndex(
      { organizationId: 1 },
      {
        unique: true,
        name: 'organizations_organizationId_unique',
        partialFilterExpression: { organizationId: { $type: 'string' } },
      }
    )
  );
  await track(COLLECTIONS.ORGANIZATIONS, () =>
    db.collection(COLLECTIONS.ORGANIZATIONS).createIndex(
      { messmassOrganizationId: 1 },
      { sparse: true, name: 'organizations_messmassOrganizationId_sparse' }
    )
  );

  // --- partners ---
  await track(COLLECTIONS.PARTNERS, () =>
    db.collection(COLLECTIONS.PARTNERS).createIndex(
      { partnerId: 1 },
      {
        unique: true,
        name: 'partners_partnerId_unique',
        partialFilterExpression: { partnerId: { $type: 'string' } },
      }
    )
  );
  await track(COLLECTIONS.PARTNERS, () =>
    db.collection(COLLECTIONS.PARTNERS).createIndex({ isActive: 1, createdAt: -1 }, { name: 'partners_isActive_createdAt' })
  );
  await track(COLLECTIONS.PARTNERS, () =>
    db.collection(COLLECTIONS.PARTNERS).createIndex(
      { messmassPartnerId: 1 },
      { sparse: true, name: 'partners_messmassPartnerId_sparse' }
    )
  );

  // --- events ---
  await track(COLLECTIONS.EVENTS, () =>
    db.collection(COLLECTIONS.EVENTS).createIndex(
      { eventId: 1 },
      {
        unique: true,
        name: 'events_eventId_unique',
        partialFilterExpression: { eventId: { $type: 'string' } },
      }
    )
  );
  await track(COLLECTIONS.EVENTS, () =>
    db.collection(COLLECTIONS.EVENTS).createIndex({ partnerId: 1, createdAt: -1 }, { name: 'events_partnerId_createdAt' })
  );
  await track(COLLECTIONS.EVENTS, () =>
    db.collection(COLLECTIONS.EVENTS).createIndex({ isActive: 1, partnerId: 1 }, { name: 'events_isActive_partnerId' })
  );
  await track(COLLECTIONS.EVENTS, () =>
    db.collection(COLLECTIONS.EVENTS).createIndex(
      { shortUrlSlug: 1 },
      {
        unique: true,
        sparse: true,
        name: 'events_shortUrlSlug_unique_sparse',
      }
    )
  );
  // Unique: provisionEvent() treats messmassEventId as "one camera event per
  // messmass event" — enforce that invariant at the DB level too, not just in
  // the findOne-then-insert app logic (which has a race under concurrent calls).
  await track(COLLECTIONS.EVENTS, () =>
    db.collection(COLLECTIONS.EVENTS).createIndex(
      { messmassEventId: 1 },
      { unique: true, sparse: true, name: 'events_messmassEventId_unique_sparse' }
    )
  );
  // One registration for each event and e-mail address (epic 463): the welcome e-mail is claimed on this row, so it goes once. Run `npm run db:ensure-indexes` once (an owner step); the
  // claim keeps the e-mail single without it, the index only keeps the rows single under two calls at the same moment.
  await track(COLLECTIONS.EMAIL_REGISTRATIONS, () =>
    db.collection(COLLECTIONS.EMAIL_REGISTRATIONS).createIndex({ eventId: 1, email: 1 }, { unique: true, name: 'email_registrations_event_email_unique' })
  );
  // Same invariant as messmassEventId above, for the savetheworld provisioning API.
  await track(COLLECTIONS.EVENTS, () =>
    db.collection(COLLECTIONS.EVENTS).createIndex(
      { savetheworldEventId: 1 },
      { unique: true, sparse: true, name: 'events_savetheworldEventId_unique_sparse' }
    )
  );

  // --- frames ---
  await track(COLLECTIONS.FRAMES, () =>
    db.collection(COLLECTIONS.FRAMES).createIndex({ frameId: 1 }, { unique: true, name: 'frames_frameId_unique' })
  );
  await track(COLLECTIONS.FRAMES, () =>
    db.collection(COLLECTIONS.FRAMES).createIndex({ isActive: 1, createdAt: -1 }, { name: 'frames_isActive_createdAt' })
  );
  await track(COLLECTIONS.FRAMES, () =>
    db.collection(COLLECTIONS.FRAMES).createIndex({ partnerId: 1, isActive: 1 }, { name: 'frames_partnerId_isActive' })
  );
  await track(COLLECTIONS.FRAMES, () =>
    db.collection(COLLECTIONS.FRAMES).createIndex({ imageUrl: 1 }, { name: 'frames_imageUrl' })
  );
  await track(COLLECTIONS.FRAMES, () =>
    db.collection(COLLECTIONS.FRAMES).createIndex({ thumbnailUrl: 1 }, { name: 'frames_thumbnailUrl' })
  );

  // --- logos ---
  await track(COLLECTIONS.LOGOS, () =>
    db.collection(COLLECTIONS.LOGOS).createIndex({ isActive: 1, createdAt: -1 }, { name: 'logos_isActive_createdAt' })
  );
  await track(COLLECTIONS.LOGOS, () =>
    db.collection(COLLECTIONS.LOGOS).createIndex({ imageUrl: 1 }, { name: 'logos_imageUrl' })
  );
  await track(COLLECTIONS.LOGOS, () =>
    db.collection(COLLECTIONS.LOGOS).createIndex({ thumbnailUrl: 1 }, { name: 'logos_thumbnailUrl' })
  );

  // --- images (the Images library, camera#368): by id, the global list, and the own uploads of a partner or an event ---
  await track(COLLECTIONS.IMAGES, () =>
    db.collection(COLLECTIONS.IMAGES).createIndex({ pictureId: 1 }, { unique: true, name: 'images_pictureId_unique' })
  );
  await track(COLLECTIONS.IMAGES, () =>
    db.collection(COLLECTIONS.IMAGES).createIndex({ scope: 1, isActive: 1, createdAt: -1 }, { name: 'images_scope_isActive_createdAt' })
  );
  await track(COLLECTIONS.IMAGES, () =>
    db.collection(COLLECTIONS.IMAGES).createIndex({ scope: 1, partnerId: 1, createdAt: -1 }, { name: 'images_scope_partnerId_createdAt' })
  );
  await track(COLLECTIONS.IMAGES, () =>
    db.collection(COLLECTIONS.IMAGES).createIndex({ scope: 1, eventId: 1, createdAt: -1 }, { name: 'images_scope_eventId_createdAt' })
  );
  await track(COLLECTIONS.IMAGES, () =>
    db.collection(COLLECTIONS.IMAGES).createIndex({ imageUrl: 1 }, { name: 'images_imageUrl' })
  );
  await track(COLLECTIONS.IMAGES, () =>
    db.collection(COLLECTIONS.IMAGES).createIndex({ thumbnailUrl: 1 }, { name: 'images_thumbnailUrl' })
  );

  // --- submissions (hot paths: slideshow aggregate, user gallery, admin) ---
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex({ userId: 1, createdAt: -1 }, { name: 'submissions_userId_createdAt' })
  );
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex(
        { eventId: 1, isArchived: 1, playCount: 1, createdAt: 1 },
        { name: 'submissions_eventId_archive_play_created' }
      )
  );
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex(
        { eventIds: 1, isArchived: 1, playCount: 1, createdAt: 1 },
        { name: 'submissions_eventIds_archive_play_created' }
      )
  );
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex({ isArchived: 1, createdAt: -1 }, { name: 'submissions_isArchived_createdAt' })
  );
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex({ 'userInfo.email': 1 }, { sparse: true, name: 'submissions_userInfo_email_sparse' })
  );
  // Legacy addresses can retain user-entered letter case. The resolver uses
  // this matching collation while keeping stable account IDs case-sensitive.
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex({ 'userInfo.email': 1 }, { sparse: true, collation: { locale: 'en', strength: 2 }, name: 'submissions_userInfo_email_case_insensitive' })
  );
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex({ userEmail: 1 }, { sparse: true, collation: { locale: 'en', strength: 2 }, name: 'submissions_userEmail_case_insensitive' })
  );
  // Exact participant e-mail lookups for the internal privacy resolver. This
  // indexes the canonical contact only; reviewer and legacy mirrors are handled
  // by separate exact filters and are never returned from the resolver.
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex({ 'guestContact.email': 1 }, { sparse: true, collation: { locale: 'en', strength: 2 }, name: 'submissions_guestContact_email_case_insensitive' })
  );
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex(
        { submissionKind: 1, reviewStatus: 1, createdAt: -1 },
        { name: 'submissions_kind_review_createdAt' }
      )
  );
  // The photo moderation queue of an event (camera#268).
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex({ eventId: 1, reviewStatus: 1, createdAt: -1 }, { name: 'submissions_eventId_review_createdAt' })
  );
  // Share links of vetted photos carry an opaque token (camera#269); only photos that have one are indexed.
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex(
        { shareToken: 1 },
        { unique: true, partialFilterExpression: { shareToken: { $type: 'string' } }, name: 'submissions_shareToken_unique' }
      )
  );
  await track(COLLECTIONS.SUBMISSIONS, () =>
    db
      .collection(COLLECTIONS.SUBMISSIONS)
      .createIndex(
        { eventId: 1, submissionKind: 1, isSlideshowEligible: 1, isArchived: 1, createdAt: 1 },
        { name: 'submissions_event_kind_slideshow_createdAt' }
      )
  );

  // Durable, participant-free work receipts for verified erasure. `_id` is the photo key; the state index keeps the bounded scrubber efficient.
  await track(COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES, () =>
    db.collection(COLLECTIONS.PRIVACY_ERASURE_TOMBSTONES).createIndex(
      { status: 1, createdAt: 1 },
      { name: 'privacy_erasure_status_createdAt' },
    )
  );

  // Full-frame source replicas staged by the signed Blob completion callback.
  // The two expiry indexes keep the bounded orphan-cleanup pass efficient;
  // URL lookup lets the page-exit cleanup find a capture without scanning.
  await track(COLLECTIONS.ORIGINAL_ASSETS, () =>
    db.collection(COLLECTIONS.ORIGINAL_ASSETS).createIndex({ state: 1, expiresAt: 1 }, { name: 'camera_original_assets_state_expiresAt' })
  );
  await track(COLLECTIONS.ORIGINAL_ASSETS, () =>
    db.collection(COLLECTIONS.ORIGINAL_ASSETS).createIndex({ state: 1, nextCleanupAt: 1 }, { name: 'camera_original_assets_state_nextCleanupAt' })
  );
  await track(COLLECTIONS.ORIGINAL_ASSETS, () =>
    db.collection(COLLECTIONS.ORIGINAL_ASSETS).createIndex({ state: 1, cleanupStartedAt: 1 }, { name: 'camera_original_assets_state_cleanupStartedAt' })
  );
  await track(COLLECTIONS.ORIGINAL_ASSETS, () =>
    db.collection(COLLECTIONS.ORIGINAL_ASSETS).createIndex({ url: 1 }, { name: 'camera_original_assets_url' })
  );

  // --- slideshows ---
  await track(COLLECTIONS.SLIDESHOWS, () =>
    db
      .collection(COLLECTIONS.SLIDESHOWS)
      .createIndex({ slideshowId: 1 }, { unique: true, name: 'slideshows_slideshowId_unique' })
  );
  await track(COLLECTIONS.SLIDESHOWS, () =>
    db
      .collection(COLLECTIONS.SLIDESHOWS)
      .createIndex({ eventId: 1, createdAt: -1 }, { name: 'slideshows_eventId_createdAt' })
  );

  // --- slideshow layouts (composite videowall) ---
  await track(COLLECTIONS.SLIDESHOW_LAYOUTS, () =>
    db
      .collection(COLLECTIONS.SLIDESHOW_LAYOUTS)
      .createIndex({ layoutId: 1 }, { unique: true, name: 'slideshow_layouts_layoutId_unique' })
  );
  await track(COLLECTIONS.SLIDESHOW_LAYOUTS, () =>
    db
      .collection(COLLECTIONS.SLIDESHOW_LAYOUTS)
      .createIndex({ eventId: 1, createdAt: -1 }, { name: 'slideshow_layouts_eventId_createdAt' })
  );

  // --- landing pages ---
  await track(COLLECTIONS.LANDING_PAGES, () =>
    db
      .collection(COLLECTIONS.LANDING_PAGES)
      .createIndex({ landingPageId: 1 }, { unique: true, name: 'landing_pages_landingPageId_unique' })
  );
  await track(COLLECTIONS.LANDING_PAGES, () =>
    db
      .collection(COLLECTIONS.LANDING_PAGES)
      .createIndex({ slug: 1 }, { unique: true, name: 'landing_pages_slug_unique' })
  );
  await track(COLLECTIONS.LANDING_PAGES, () =>
    db
      .collection(COLLECTIONS.LANDING_PAGES)
      .createIndex({ eventMongoId: 1, createdAt: -1 }, { name: 'landing_pages_eventMongoId_createdAt' })
  );
  await track(COLLECTIONS.LANDING_PAGES, () =>
    db.collection(COLLECTIONS.LANDING_PAGES).createIndex(
      { eventMongoId: 1, isDefault: 1 },
      { name: 'landing_pages_eventMongoId_isDefault' },
    )
  );
  await track(COLLECTIONS.LANDING_PAGES, () =>
    db.collection(COLLECTIONS.LANDING_PAGES).createIndex(
      { eventMongoId: 1, inheritedFromPartnerId: 1 },
      { name: 'landing_pages_eventMongoId_inheritedPartner' },
    )
  );
  await track(COLLECTIONS.LANDING_PAGE_CSS_PRESETS, () =>
    db
      .collection(COLLECTIONS.LANDING_PAGE_CSS_PRESETS)
      .createIndex({ presetId: 1 }, { unique: true, name: 'landing_page_css_presets_presetId_unique' })
  );
  await track(COLLECTIONS.LANDING_PAGE_CSS_PRESETS, () =>
    db
      .collection(COLLECTIONS.LANDING_PAGE_CSS_PRESETS)
      .createIndex({ className: 1 }, { unique: true, name: 'landing_page_css_presets_className_unique' })
  );

  // --- partner user access ---
  await track(COLLECTIONS.PARTNER_USER_ACCESS, () =>
    db
      .collection(COLLECTIONS.PARTNER_USER_ACCESS)
      .createIndex({ accessId: 1 }, { unique: true, name: 'partner_user_access_accessId_unique' })
  );
  await track(COLLECTIONS.PARTNER_USER_ACCESS, () =>
    db
      .collection(COLLECTIONS.PARTNER_USER_ACCESS)
      .createIndex(
        { partnerId: 1, userEmail: 1, appKey: 1 },
        { unique: true, name: 'partner_user_access_partner_email_app_unique' }
      )
  );
  await track(COLLECTIONS.PARTNER_USER_ACCESS, () =>
    db
      .collection(COLLECTIONS.PARTNER_USER_ACCESS)
      .createIndex({ userEmail: 1, isActive: 1 }, { name: 'partner_user_access_email_active' })
  );
  await track(COLLECTIONS.PARTNER_USER_ACCESS, () =>
    db
      .collection(COLLECTIONS.PARTNER_USER_ACCESS)
      .createIndex({ partnerId: 1, isActive: 1, appKey: 1 }, { name: 'partner_user_access_partner_active_app' })
  );

  await track(COLLECTIONS.WEB_SESSIONS, () =>
    db.collection(COLLECTIONS.WEB_SESSIONS).createIndex({ sid: 1 }, { unique: true, name: 'web_sessions_sid_unique' })
  );
  await track(COLLECTIONS.WEB_SESSIONS, () =>
    db
      .collection(COLLECTIONS.WEB_SESSIONS)
      .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0, name: 'web_sessions_expireAt_ttl' })
  );

  results.push(...(await ensureJourneyIndexes(db)));

  return results;
}
