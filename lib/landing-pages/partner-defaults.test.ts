import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ensureInheritedDefaultLandingPage } from './partner-defaults';

const eventId = new ObjectId();
const event = { _id: eventId, eventId: 'event-uuid-1', name: 'MTK x Vasas', partnerId: 'partner-1' };
const slideshow = { slideshowId: 'screen-1', eventId: event.eventId, eventName: event.name, name: 'Main screen', isDefault: true };
const partnerDefault = {
  title: 'Welcome',
  description: 'Join us',
  url: '{eventCaptureUrl}',
  urlButtonText: 'Take a photo',
  isActive: true,
};

test('partner landing default materializes an event-scoped page with its own capture URL and slideshow', async () => {
  const { db, data } = fakeDb({
    [COLLECTIONS.EVENTS]: [event],
    [COLLECTIONS.PARTNERS]: [{ partnerId: event.partnerId, contentDefaults: { revision: 4, landingPage: partnerDefault } }],
    [COLLECTIONS.SLIDESHOWS]: [slideshow],
  });

  const page = await ensureInheritedDefaultLandingPage(db, event);
  assert.ok(page);
  assert.equal(page.eventMongoId, eventId.toString());
  assert.equal(page.slug, `event-${event.eventId}`);
  assert.equal(page.url, `https://camera.messmass.com/capture/${eventId}`);
  assert.equal(page.targetType, 'slideshow');
  assert.equal(page.targetId, slideshow.slideshowId);
  assert.equal(page.isDefault, true);
  assert.equal(page.inheritedFromPartnerId, event.partnerId);
  assert.equal(page.inheritedPartnerRevision, 4);
  assert.equal(data[COLLECTIONS.LANDING_PAGES].length, 1);
});

test('an event-owned default wins until reset explicitly prefers the partner default', async () => {
  const localDefault = { landingPageId: 'local', eventMongoId: eventId.toString(), eventId: event.eventId, slug: 'my-local-page', isDefault: true };
  const { db, data } = fakeDb({
    [COLLECTIONS.EVENTS]: [event],
    [COLLECTIONS.PARTNERS]: [{ partnerId: event.partnerId, contentDefaults: { revision: 4, landingPage: partnerDefault } }],
    [COLLECTIONS.SLIDESHOWS]: [slideshow],
    [COLLECTIONS.LANDING_PAGES]: [localDefault],
  });

  const resolved = await ensureInheritedDefaultLandingPage(db, event);
  assert.equal(resolved?.landingPageId, 'local');

  const reset = await ensureInheritedDefaultLandingPage(db, event, { preferPartnerDefault: true });
  assert.equal(reset?.inheritedFromPartnerId, event.partnerId);
  assert.equal(data[COLLECTIONS.LANDING_PAGES].length, 2);
});

test('a partner update refreshes an inherited event copy but never edits a local override', async () => {
  const inherited = {
    landingPageId: `partner-default-${event.eventId}`,
    eventMongoId: eventId.toString(), eventId: event.eventId, slug: `event-${event.eventId}`,
    title: 'Old title', targetId: slideshow.slideshowId, isDefault: true,
    inheritedFromPartnerId: event.partnerId, inheritedPartnerRevision: 3,
  };
  const localOverride = { ...inherited, landingPageId: 'local-override', slug: 'local-override', title: 'Keep me', isDefault: false, inheritedFromPartnerId: undefined };
  const { db, data } = fakeDb({
    [COLLECTIONS.EVENTS]: [event],
    [COLLECTIONS.PARTNERS]: [{ partnerId: event.partnerId, contentDefaults: { revision: 4, landingPage: { ...partnerDefault, title: 'Updated title' } } }],
    [COLLECTIONS.SLIDESHOWS]: [slideshow],
    [COLLECTIONS.LANDING_PAGES]: [inherited, localOverride],
  });

  const refreshed = await ensureInheritedDefaultLandingPage(db, event);
  assert.equal(refreshed?.title, 'Updated title');
  const saved = data[COLLECTIONS.LANDING_PAGES];
  assert.equal(saved.find((page) => page.landingPageId === inherited.landingPageId)?.title, 'Updated title');
  assert.equal(saved.find((page) => page.landingPageId === 'local-override')?.title, 'Keep me');
});
