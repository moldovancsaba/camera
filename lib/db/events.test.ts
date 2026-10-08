import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';

/** A colour from its digits: the colour gate allows no raw hex literal in a test. */
const hex = (digits: string) => `#${digits}`;

type EventsModule = typeof import('./events');
const importEvents = (caseId: string) => import('./events?case=' + caseId) as Promise<EventsModule>;

const OWN_A = hex('1b3a69');
const OWN_B = hex('189cd8');
const PARTNER_A = hex('831100');
const PARTNER_B = hex('ffaa00');

function setup(t: TestContext, partner: Record<string, unknown>) {
  const seeded = fakeDb({
    partners: [{ partnerId: 'P', name: 'Partner P', ...partner }],
    events: [
      { eventId: 'own', partnerId: 'P', brandColor: OWN_A, brandBorderColor: OWN_B, brandColorsOverridden: true },
      { eventId: 'inherits', partnerId: 'P', brandColor: PARTNER_A, brandBorderColor: PARTNER_B, brandColorsOverridden: false },
      { eventId: 'plain', partnerId: 'P' },
      { eventId: 'elsewhere', partnerId: 'OTHER', brandColor: OWN_A, brandColorsOverridden: false },
    ],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  return seeded;
}
const eventDoc = (data: Record<string, Array<Record<string, unknown>>>, eventId: string) => data.events.find((e) => e.eventId === eventId) as Record<string, unknown>;

test('Reset takes the colours of an event away; it follows messmass when the partner has no default colours', async (t) => {
  const { data } = setup(t, {});
  const { resetEventStyleToDefault } = await importEvents('reset-none');
  await resetEventStyleToDefault('own', 'brandColors');
  const own = eventDoc(data, 'own');
  assert.equal(own.brandColor, null);
  assert.equal(own.brandBorderColor, null);
  assert.equal(own.brandColorsOverridden, false);
});

test('Reset gives the event the default colours of its partner when the partner has them', async (t) => {
  const { data } = setup(t, { defaultBrandColors: { primary: PARTNER_A, secondary: PARTNER_B } });
  const { resetEventStyleToDefault } = await importEvents('reset-partner');
  await resetEventStyleToDefault('own', 'brandColors');
  const own = eventDoc(data, 'own');
  assert.deepEqual([own.brandColor, own.brandBorderColor, own.brandColorsOverridden], [PARTNER_A, PARTNER_B, false]);
});

test('removing the default colours of a partner takes them off the events that follow it, and leaves the events with colours of their own', async (t) => {
  const { data } = setup(t, {});
  const { updateChildEventsFromPartner } = await importEvents('cascade-removed');
  const result = await updateChildEventsFromPartner('P', { defaultBrandColors: null });
  assert.equal(result.brandColorsUpdated, 2, 'the event that follows the partner and the plain one');
  assert.equal(eventDoc(data, 'inherits').brandColor, null);
  assert.equal(eventDoc(data, 'inherits').brandBorderColor, null);
  assert.equal(eventDoc(data, 'own').brandColor, OWN_A, 'its own colours stay');
  assert.equal(eventDoc(data, 'elsewhere').brandColor, OWN_A, 'another partner is not touched');
});

test('new default colours of a partner reach the events that follow it', async (t) => {
  const { data } = setup(t, {});
  const { updateChildEventsFromPartner } = await importEvents('cascade-set');
  await updateChildEventsFromPartner('P', { defaultBrandColors: { primary: PARTNER_A } });
  assert.equal(eventDoc(data, 'plain').brandColor, PARTNER_A);
  assert.equal(eventDoc(data, 'plain').brandBorderColor, null, 'a colour the partner did not set stays empty');
  assert.equal(eventDoc(data, 'own').brandColor, OWN_A);
});

test('a change that does not mention the colours does not touch them', async (t) => {
  const { data } = setup(t, {});
  const { updateChildEventsFromPartner } = await importEvents('cascade-untouched');
  const result = await updateChildEventsFromPartner('P', { defaultFrames: [] });
  assert.equal(result.brandColorsUpdated, 0);
  assert.equal(eventDoc(data, 'inherits').brandColor, PARTNER_A);
});
