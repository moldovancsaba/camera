import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { STANDARD_VOCABULARY, optionsOf, resolveVocabulary } from '@/lib/photo-vetting/vocabulary';

const apiReal = await import('@/lib/api');

const PARTNER_ID = new ObjectId();
const OTHER_PARTNER_ID = new ObjectId();
const EVENT_ID = new ObjectId();
const OTHER_EVENT_ID = new ObjectId();
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };
const MANAGER = { appRole: 'user', user: { id: 'm1', email: 'manager@example.com', name: 'Manager' } };
const VIEWER = { appRole: 'user', user: { id: 'v1', email: 'viewer@example.com', name: 'Viewer' } };
const STRANGER = { appRole: 'user', user: { id: 's1', email: 'stranger@example.com', name: 'Stranger' } };

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const access = (email: string, role: string, partnerId = 'p-uuid') => ({ accessId: `${email}-${partnerId}`, partnerId, partnerName: 'MTK', userId: null, userEmail: email, appKey: 'events', role, isActive: true });

function setup(t: TestContext, seed: Record<string, Array<Record<string, unknown>>> = {}) {
  const seeded = fakeDb({
    partners: [
      { _id: PARTNER_ID, partnerId: 'p-uuid', name: 'MTK' },
      { _id: OTHER_PARTNER_ID, partnerId: 'other-uuid', name: 'Other club' },
    ],
    events: [
      { _id: EVENT_ID, eventId: 'e-uuid', partnerId: 'p-uuid', name: 'MTK x Vasas' },
      { _id: OTHER_EVENT_ID, eventId: 'e2-uuid', partnerId: 'other-uuid', name: 'Other match' },
    ],
    partner_user_access: [access('manager@example.com', 'manager'), access('viewer@example.com', 'viewer')],
    admin_settings: [],
    ...seed,
  });
  const state: { session: unknown; limits: unknown[] } = { session: ADMIN, limits: [] };
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('@/lib/api', {
    exports: {
      ...apiReal,
      requireAuth: async () => {
        if (!state.session) throw apiReal.apiUnauthorized();
        return state.session;
      },
      checkRateLimit: async (_request: unknown, config: unknown) => {
        state.limits.push(config);
      },
    },
  });
  return { ...seeded, state };
}

const base = 'http://localhost/api/annotation-vocabulary';
const get = (level: string | null, id: string | null) => {
  const url = new URL(base);
  if (level !== null) url.searchParams.set('level', level);
  if (id !== null) url.searchParams.set('id', id);
  return new NextRequest(url);
};
const put = (body: unknown, query = '') => new NextRequest(base + query, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
type View = { data: { level: string; id: string | null; name: string | null; stored: { options: unknown[] }; parent: { options: Array<{ group: string; key: string; active: boolean; label: string; level: string }> }; resolved: { options: Array<{ group: string; key: string; active: boolean; label: string; level: string; custom: boolean }>; version: string }; groups: Record<string, unknown> } };
const json = async (response: Response) => (await response.json()) as View & { error?: string };
const doc = (data: Record<string, Array<Record<string, unknown>>>, collection: string, id: ObjectId) => data[collection].find((d) => String(d._id) === String(id)) as Record<string, unknown>;

test('GET at the general level: a global admin sees what is stored, the standard list above it, and the list as the level sees it, with the groups', async (t) => {
  setup(t, { admin_settings: [{ settingId: 'annotation-vocabulary', options: [{ group: 'merch', key: 'cap', label: 'Hat' }] }] });
  const { GET } = await importRoute('get-general');
  const response = await GET(get('general', null));
  assert.equal(response.status, 200);
  const { data } = await json(response);
  assert.deepEqual(data.stored.options, [{ group: 'merch', key: 'cap', label: 'Hat' }]);
  assert.deepEqual(data.parent, STANDARD_VOCABULARY);
  assert.equal(data.resolved.options.find((o) => o.key === 'cap')?.label, 'Hat');
  assert.equal(data.resolved.options.find((o) => o.key === 'cap')?.level, 'general');
  assert.deepEqual(Object.keys(data.groups), ['gender', 'age', 'emotion', 'merch', 'reject_reason']);
});

test('GET at the partner and the event level: the parent is the list the level above shows (general, then the partner)', async (t) => {
  setup(t, {
    admin_settings: [{ settingId: 'annotation-vocabulary', options: [{ group: 'merch', key: 'cap', label: 'Hat' }] }],
    partners: [{ _id: PARTNER_ID, partnerId: 'p-uuid', name: 'MTK', annotationVocabulary: { options: [{ group: 'merch', key: 'scarf', hidden: true }] } }, { _id: OTHER_PARTNER_ID, partnerId: 'other-uuid', name: 'Other club' }],
    events: [{ _id: EVENT_ID, eventId: 'e-uuid', partnerId: 'p-uuid', name: 'MTK x Vasas', annotationVocabulary: { options: [{ group: 'merch', key: 'jersey', label: 'Club shirt' }] } }, { _id: OTHER_EVENT_ID, eventId: 'e2-uuid', partnerId: 'other-uuid', name: 'Other match' }],
  });
  const { GET } = await importRoute('get-levels');
  const partner = await json(await GET(get('partner', String(PARTNER_ID))));
  assert.equal(partner.data.name, 'MTK');
  assert.deepEqual(partner.data.stored.options, [{ group: 'merch', key: 'scarf', hidden: true }]);
  assert.equal(partner.data.parent.options.find((o) => o.key === 'cap')?.label, 'Hat');
  assert.equal(partner.data.parent.options.find((o) => o.key === 'scarf')?.active, true, 'the partner\'s own change is not in its parent');
  assert.equal(partner.data.resolved.options.find((o) => o.key === 'scarf')?.active, false);
  // The partner's own uuid is accepted for the partner level as well.
  assert.equal((await GET(get('partner', 'p-uuid'))).status, 200);
  const event = await json(await GET(get('event', String(EVENT_ID))));
  assert.equal(event.data.name, 'MTK x Vasas');
  assert.deepEqual(event.data.stored.options, [{ group: 'merch', key: 'jersey', label: 'Club shirt' }]);
  assert.equal(event.data.parent.options.find((o) => o.key === 'scarf')?.active, false, 'the event\'s parent includes the partner\'s change');
  assert.equal(event.data.parent.options.find((o) => o.key === 'cap')?.label, 'Hat');
  assert.equal(event.data.resolved.options.find((o) => o.key === 'jersey')?.label, 'Club shirt');
  const sameAsServer = resolveVocabulary({ general: { options: [{ group: 'merch', key: 'cap', label: 'Hat' }] }, partner: { options: [{ group: 'merch', key: 'scarf', hidden: true }] }, event: { options: [{ group: 'merch', key: 'jersey', label: 'Club shirt' }] } });
  assert.deepEqual(event.data.resolved, sameAsServer, 'the editor and the vetting screen read the same list');
});

test('who may read and write: the level and the id are checked against the stored partner or event, never taken from the client', async (t) => {
  const { state, data } = setup(t);
  const { GET, PUT } = await importRoute('refusals');
  const status = async (promise: Promise<Response>) => (await promise).status;

  state.session = null;
  assert.equal(await status(GET(get('general', null))), 401);
  assert.equal(await status(PUT(put({ level: 'general', options: [] }))), 401);

  // A partner manager: their own partner and its events, nothing above and nothing of another partner.
  state.session = MANAGER;
  assert.equal(await status(GET(get('general', null))), 403);
  assert.equal(await status(PUT(put({ level: 'general', options: [] }))), 403);
  assert.equal(await status(GET(get('partner', String(PARTNER_ID)))), 200);
  assert.equal(await status(GET(get('event', String(EVENT_ID)))), 200);
  assert.equal(await status(GET(get('partner', String(OTHER_PARTNER_ID)))), 403);
  assert.equal(await status(GET(get('event', String(OTHER_EVENT_ID)))), 403);
  assert.equal(await status(PUT(put({ level: 'partner', id: String(OTHER_PARTNER_ID), options: [] }))), 403);
  assert.equal(await status(PUT(put({ level: 'event', id: String(OTHER_EVENT_ID), options: [] }))), 403);
  // Saying "general" with the id of a partner does not turn a partner manager into a global admin.
  assert.equal(await status(PUT(put({ level: 'general', id: String(PARTNER_ID), options: [{ group: 'merch', key: 'banner', hidden: false }] }))), 403);

  // A viewer may not edit anything; a stranger has no access to the partner at all.
  state.session = VIEWER;
  assert.equal(await status(GET(get('partner', String(PARTNER_ID)))), 403);
  assert.equal(await status(PUT(put({ level: 'event', id: String(EVENT_ID), options: [] }))), 403);
  state.session = STRANGER;
  assert.equal(await status(GET(get('event', String(EVENT_ID)))), 403);

  assert.equal(data.admin_settings.length, 0, 'nothing was written by any refused request');
  assert.equal(doc(data, 'partners', PARTNER_ID).annotationVocabulary, undefined);
  assert.equal(doc(data, 'events', EVENT_ID).annotationVocabulary, undefined);
});

test('a request that names no level, a wrong level, no id, a bad id or something that does not exist is refused with the reason', async (t) => {
  const { state } = setup(t);
  const { GET, PUT } = await importRoute('bad-requests');
  const answer = async (promise: Promise<Response>) => {
    const response = await promise;
    return [response.status, ((await response.json()) as { error?: string }).error];
  };
  assert.deepEqual(await answer(GET(get(null, null))), [400, 'level must be general, partner or event']);
  assert.deepEqual(await answer(GET(get('team', 'x'))), [400, 'level must be general, partner or event']);
  assert.deepEqual(await answer(GET(get('partner', null))), [400, 'id is required for the partner level']);
  assert.deepEqual(await answer(GET(get('event', 'not-an-id'))), [400, 'Invalid event ID format']);
  assert.deepEqual(await answer(GET(get('event', String(new ObjectId())))), [404, 'Event not found']);
  assert.deepEqual(await answer(GET(get('partner', String(new ObjectId())))), [404, 'Partner not found']);
  assert.deepEqual(await answer(GET(get('partner', 'no-such-uuid'))), [404, 'Partner not found']);
  state.session = ADMIN;
  assert.equal((await PUT(new NextRequest(base, { method: 'PUT', body: 'not json' }))).status, 400);
  assert.deepEqual(await answer(PUT(put({ level: 'general', options: 'x' }))), [400, 'options must be a list']);
  assert.deepEqual(await answer(PUT(put({ level: 'event', id: String(EVENT_ID), options: [] }, `?level=event&id=${OTHER_EVENT_ID}`))), [400, 'The level and the id in the address must be the ones in the body']);
});

test('PUT at the general level (a global admin): stored in admin_settings with who and when, answered as the new list, and the rate limit of the admin writes applies', async (t) => {
  const { data, state } = setup(t);
  const { PUT } = await importRoute('put-general');
  const response = await PUT(put({ level: 'general', options: [{ group: 'merch', key: 'cap', label: '  Hat  ' }, { group: 'gender', key: 'unsure', hidden: true }, { group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] }, '?level=general'));
  assert.equal(response.status, 200);
  const { data: view } = await json(response);
  assert.equal(view.resolved.options.find((o) => o.key === 'cap')?.label, 'Hat', 'the label is stored trimmed');
  assert.equal(view.resolved.options.find((o) => o.key === 'unsure')?.active, false);
  assert.equal(view.resolved.options.find((o) => o.key === 'club_flag')?.custom, true);
  const stored = data.admin_settings.find((d) => d.settingId === 'annotation-vocabulary') as { options: unknown[]; updatedBy: string; updatedAt: string };
  assert.equal(stored.options.length, 3);
  assert.equal(stored.updatedBy, 'admin@example.com');
  assert.match(stored.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(state.limits.length, 1);
  assert.deepEqual(state.limits[0], apiReal.RATE_LIMITS.ADMIN);
});

test('PUT at the partner level (a partner manager): stored on the partner only, and the event reads it through the parent', async (t) => {
  const { data, state } = setup(t);
  state.session = MANAGER;
  const { PUT, GET } = await importRoute('put-partner');
  const response = await PUT(put({ level: 'partner', id: String(PARTNER_ID), options: [{ group: 'age', key: 'kid', label: 'Little one' }, { group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] }));
  assert.equal(response.status, 200);
  assert.deepEqual(doc(data, 'partners', PARTNER_ID).annotationVocabulary, { options: [{ group: 'age', key: 'kid', label: 'Little one' }, { group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] });
  assert.equal(doc(data, 'partners', OTHER_PARTNER_ID).annotationVocabulary, undefined);
  assert.equal(doc(data, 'events', EVENT_ID).annotationVocabulary, undefined, 'nothing is copied down to the events');
  const event = await json(await GET(get('event', String(EVENT_ID))));
  assert.equal(event.data.parent.options.find((o) => o.key === 'kid')?.label, 'Little one');
  assert.equal(event.data.resolved.options.find((o) => o.key === 'club_flag')?.level, 'partner');
});

test('PUT at the event level (a partner manager or an admin): stored on the event only; what equals the level above is not stored, and an empty result clears the level', async (t) => {
  const { data, state } = setup(t, { admin_settings: [{ settingId: 'annotation-vocabulary', options: [{ group: 'merch', key: 'cap', label: 'Hat' }] }] });
  const { PUT } = await importRoute('put-event');
  for (const session of [MANAGER, ADMIN]) {
    state.session = session;
    const own = [{ group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true }, { group: 'merch', key: 'jersey', order: 25 }];
    const response = await PUT(put({ level: 'event', id: String(EVENT_ID), options: own }));
    assert.equal(response.status, 200);
    assert.deepEqual(doc(data, 'events', EVENT_ID).annotationVocabulary, { options: own });
  }
  assert.equal(doc(data, 'events', OTHER_EVENT_ID).annotationVocabulary, undefined);
  // The same words as the general level, the same hidden state and the same order: nothing differs, nothing is stored.
  const redundant = await PUT(put({ level: 'event', id: String(EVENT_ID), options: [{ group: 'merch', key: 'cap', label: 'Hat' }, { group: 'merch', key: 'scarf', label: 'Scarf', order: 10, hidden: false }] }));
  assert.equal(redundant.status, 200);
  assert.equal((await json(redundant)).data.stored.options.length, 0);
  assert.equal(doc(data, 'events', EVENT_ID).annotationVocabulary, undefined, 'the level is cleared, not stored empty');
});

test('PUT refuses what the rules refuse, with the reason, and writes nothing: unknown key or group, emoji, empty or long label, a custom option on a standard key, a repeated option, too many options, a required group left empty', async (t) => {
  const { data, state } = setup(t);
  state.session = MANAGER;
  const { PUT } = await importRoute('put-refusals');
  const refuse = async (options: unknown, expected: RegExp) => {
    const response = await PUT(put({ level: 'event', id: String(EVENT_ID), options }));
    assert.equal(response.status, 400, JSON.stringify(options).slice(0, 120));
    assert.match(((await response.json()) as { error: string }).error, expected);
  };
  await refuse([{ group: 'nope', key: 'a' }], /unknown group/);
  await refuse([{ group: 'merch', key: 'unknown_standard' }], /not a standard option/);
  await refuse([{ group: 'merch', key: 'scarf', custom: true, label: 'Scarf' }], /standard option, not a custom one/);
  await refuse([{ group: 'merch', key: 'x', custom: true }], /needs a label/);
  await refuse([{ group: 'merch', key: 'x', custom: true, label: 'Cap 🧢' }], /emoji/);
  await refuse([{ group: 'merch', key: 'x', custom: true, label: 'a < b' }], /Plain text only/);
  await refuse([{ group: 'merch', key: 'scarf', label: ' ' }], /name/);
  await refuse([{ group: 'merch', key: 'scarf', label: 'x'.repeat(61) }], /60/);
  await refuse([{ group: 'merch', key: 'scarf', extra: 1 }], /unknown field/);
  await refuse([{ group: 'merch', key: 'scarf', hidden: true }, { group: 'merch', key: 'scarf', hidden: true }], /repeats/);
  await refuse(Array.from({ length: 61 }, (_, i) => ({ group: 'merch', key: `k${i}`, custom: true, label: `K ${i}` })), /at most 60/);
  await refuse(Array.from({ length: 40 }, (_, i) => ({ group: 'merch', key: `k${i}`, custom: true, label: `K ${i}` })), /too many options/);
  await refuse([{ group: 'gender', key: 'female', hidden: true }, { group: 'gender', key: 'male', hidden: true }, { group: 'gender', key: 'unsure', hidden: true }], /At least one option of Gender/);
  await refuse(null, /must be a list/);
  assert.equal(doc(data, 'events', EVENT_ID).annotationVocabulary, undefined);
  assert.equal(data.admin_settings.length, 0);
});

test('a key never means two things: a new option of the partner or of the general level cannot take a key a level under it already uses for its own option', async (t) => {
  const { data, state } = setup(t, {
    events: [
      { _id: EVENT_ID, eventId: 'e-uuid', partnerId: 'p-uuid', name: 'MTK x Vasas', annotationVocabulary: { options: [{ group: 'merch', key: 'club_flag', label: 'Our flag', custom: true }] } },
      { _id: OTHER_EVENT_ID, eventId: 'e2-uuid', partnerId: 'other-uuid', name: 'Other match' },
    ],
  });
  const { PUT } = await importRoute('collision');
  const flag = (label: string) => [{ group: 'merch', key: 'club_flag', label, custom: true }];
  state.session = MANAGER;
  const partner = await PUT(put({ level: 'partner', id: String(PARTNER_ID), options: flag('Club flag') }));
  assert.equal(partner.status, 409);
  assert.match(((await partner.json()) as { error: string }).error, /an event of this partner already uses the key club_flag/);
  assert.equal(doc(data, 'partners', PARTNER_ID).annotationVocabulary, undefined);
  state.session = ADMIN;
  const general = await PUT(put({ level: 'general', options: flag('Club flag') }));
  assert.equal(general.status, 409);
  assert.match(((await general.json()) as { error: string }).error, /an event already uses the key club_flag/);
  assert.equal(data.admin_settings.length, 0);
  // A different name makes a different key, and an event of another partner does not matter to this partner.
  assert.equal((await PUT(put({ level: 'partner', id: String(OTHER_PARTNER_ID), options: flag('Club flag') }))).status, 200);
  assert.equal((await PUT(put({ level: 'partner', id: String(PARTNER_ID), options: [{ group: 'merch', key: 'club_flag_2', label: 'Club flag', custom: true }] }))).status, 200);
});

test('an option a level above added can be hidden, relabelled or moved at a level below: the entry carries custom and the words, and the level above is untouched', async (t) => {
  const { data, state } = setup(t, { partners: [{ _id: PARTNER_ID, partnerId: 'p-uuid', name: 'MTK', annotationVocabulary: { options: [{ group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] } }, { _id: OTHER_PARTNER_ID, partnerId: 'other-uuid', name: 'Other club' }] });
  state.session = MANAGER;
  const { PUT } = await importRoute('override-custom');
  const response = await PUT(put({ level: 'event', id: String(EVENT_ID), options: [{ group: 'merch', key: 'club_flag', label: 'Club flag', custom: true, hidden: true }] }));
  assert.equal(response.status, 200);
  const { data: view } = await json(response);
  const flag = view.resolved.options.find((o) => o.key === 'club_flag')!;
  assert.deepEqual([flag.active, flag.level, flag.custom], [false, 'event', true]);
  assert.equal(view.parent.options.find((o) => o.key === 'club_flag')?.active, true, 'the partner still offers it');
  assert.deepEqual(doc(data, 'partners', PARTNER_ID).annotationVocabulary, { options: [{ group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] });
});

test('a damaged stored level reads as nothing changed: the editor and the list still load', async (t) => {
  setup(t, {
    admin_settings: [{ settingId: 'annotation-vocabulary', options: 'garbage' }],
    partners: [{ _id: PARTNER_ID, partnerId: 'p-uuid', name: 'MTK', annotationVocabulary: 42 }, { _id: OTHER_PARTNER_ID, partnerId: 'other-uuid', name: 'Other club' }],
    events: [{ _id: EVENT_ID, eventId: 'e-uuid', partnerId: 'p-uuid', name: 'MTK x Vasas', annotationVocabulary: { options: [{ group: 'merch', key: 'scarf', hidden: 'yes' }, { nonsense: true }, { group: 'merch', key: 'jersey', label: 'Club shirt' }] } }, { _id: OTHER_EVENT_ID, eventId: 'e2-uuid', partnerId: 'other-uuid', name: 'Other match' }],
  });
  const { GET } = await importRoute('damaged');
  const general = await json(await GET(get('general', null)));
  assert.deepEqual(general.data.stored.options, []);
  assert.deepEqual(general.data.resolved, STANDARD_VOCABULARY);
  const partner = await json(await GET(get('partner', String(PARTNER_ID))));
  assert.deepEqual(partner.data.stored.options, []);
  const event = await json(await GET(get('event', String(EVENT_ID))));
  assert.deepEqual(event.data.stored.options, [{ group: 'merch', key: 'jersey', label: 'Club shirt' }], 'what is valid is kept, the rest is left out');
  assert.deepEqual(optionsOf(event.data.resolved as never, 'merch').map((o) => o.key), ['jersey', 'scarf', 'cap', 'flag']);
});
