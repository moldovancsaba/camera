import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from './fake-db';
import { COLLECTIONS } from '@/lib/db/schemas';
import { QR_TEXT_MAX_ITEMS, QR_TEXT_MAX_LENGTH, chooseQrText, createQrText, deleteQrText, listQrTexts, parseQrText, qrTextCandidates, setQrTextActive, storeQrTextPick, type QrTextView } from './qr-texts';

const NOW = '2026-10-11T12:00:00.000Z';
const row = (qrTextId: string, text: string, language: string, extra: Record<string, unknown> = {}) => ({ qrTextId, text, language, isActive: true, createdAt: `2026-10-0${qrTextId.length}T00:00:00.000Z`, ...extra });
const view = (id: string, text: string, language: 'en' | 'hu', isActive = true): QrTextView => ({ id, text, language, isActive, createdAt: NOW });

test('a QR text is one short line in a language we have: whitespace is collapsed, empty, too long, unknown field or unknown language is refused', () => {
  assert.deepEqual(parseQrText({ text: '  Scan   &\n smile ', language: 'en' }), { ok: true, value: { text: 'Scan & smile', language: 'en' } });
  assert.equal(parseQrText({ text: 'x'.repeat(QR_TEXT_MAX_LENGTH), language: 'hu' }).ok, true);
  for (const bad of [null, [], 'x', {}, { text: '', language: 'en' }, { text: '   ', language: 'en' }, { text: 'x'.repeat(QR_TEXT_MAX_LENGTH + 1), language: 'en' }, { text: 'a', language: 'xx' }, { text: 'a' }, { text: 'a', language: 'en', other: 1 }, { text: 5, language: 'en' }]) {
    assert.equal(parseQrText(bad).ok, false, JSON.stringify(bad));
  }
});

test('the library is added to, switched off and on, and deleted; the same text in the same language twice and a full library are refused', async () => {
  const w = fakeDb({});
  const first = await createQrText(w.db, { text: 'Scan & smile', language: 'en' }, 'admin-1', NOW);
  assert.ok(first.ok);
  assert.deepEqual({ ...first.value, id: typeof first.value.id }, { id: 'string', text: 'Scan & smile', language: 'en', isActive: true, createdAt: NOW });
  assert.equal((w.data[COLLECTIONS.QR_TEXTS][0] as { createdBy: string }).createdBy, 'admin-1');
  const duplicate = await createQrText(w.db, { text: 'scan & SMILE', language: 'en' }, 'admin-1', NOW);
  assert.deepEqual(duplicate.ok ? null : duplicate.status, 409);
  assert.ok((await createQrText(w.db, { text: 'Scan & smile', language: 'hu' }, 'admin-1', NOW)).ok, 'the same words in another language are another text');
  assert.equal((await createQrText(w.db, { text: '', language: 'en' }, 'admin-1', NOW)).ok, false);

  const off = await setQrTextActive(w.db, first.value.id, false, NOW);
  assert.ok(off.ok && !off.value.isActive);
  assert.equal((w.data[COLLECTIONS.QR_TEXTS][0] as { isActive: boolean }).isActive, false);
  assert.deepEqual((await setQrTextActive(w.db, 'nope', true, NOW)).ok, false);
  assert.ok((await deleteQrText(w.db, first.value.id)).ok);
  assert.equal((await deleteQrText(w.db, first.value.id)).ok, false, 'already gone: 404');
  assert.equal(w.data[COLLECTIONS.QR_TEXTS].length, 1);

  const full = fakeDb({ [COLLECTIONS.QR_TEXTS]: Array.from({ length: QR_TEXT_MAX_ITEMS }, (_, i) => row(`t${i}`, `Text ${i}`, 'en')) });
  const refused = await createQrText(full.db, { text: 'One more', language: 'en' }, 'a', NOW);
  assert.deepEqual(refused.ok ? null : refused.status, 409);
});

test('the list is newest first and shows switched off texts too', async () => {
  const w = fakeDb({ [COLLECTIONS.QR_TEXTS]: [row('a', 'First', 'en'), row('bbb', 'Third', 'hu', { isActive: false }), row('bb', 'Second', 'en')] });
  assert.deepEqual((await listQrTexts(w.db)).map((item) => [item.text, item.isActive]), [['Third', false], ['Second', true], ['First', true]]);
});

test('the texts an event can get are the active ones in its language, English when there is none in it, and none otherwise', () => {
  const items = [view('e1', 'Scan', 'en'), view('e2', 'Join', 'en'), view('h1', 'Szkenneld!', 'hu'), view('h2', 'Csatlakozz!', 'hu', false), view('e3', 'Off', 'en', false)];
  assert.deepEqual(qrTextCandidates(items, 'hu').map((item) => item.id), ['h1']);
  assert.deepEqual(qrTextCandidates(items, 'en').map((item) => item.id), ['e1', 'e2']);
  assert.deepEqual(qrTextCandidates([view('h1', 'Szkenneld!', 'hu')], 'en').map((item) => item.id), [], 'no Hungarian text for an English event');
  assert.deepEqual(qrTextCandidates([view('e1', 'Scan', 'en'), view('h2', 'Csatlakozz!', 'hu', false)], 'hu').map((item) => item.id), ['e1'], 'a Hungarian event with no active Hungarian text gets an English one');
  assert.deepEqual(qrTextCandidates([], 'en'), []);
});

test('with no QR text in the library there is no pick; a random one is picked otherwise, in the event\'s language (or its partner\'s), and the stored pick stays while it is still a candidate', async () => {
  const empty = fakeDb({ events: [{ eventId: 'E', partnerId: 'P' }] });
  assert.equal(await chooseQrText(empty.db, empty.data[COLLECTIONS.EVENTS][0]), null);

  const w = fakeDb({
    [COLLECTIONS.QR_TEXTS]: [row('a', 'Scan', 'en'), row('bb', 'Join', 'en'), row('c', 'Szkenneld!', 'hu')],
    partners: [{ partnerId: 'P', uiLanguage: 'hu' }, { partnerId: 'Q' }],
    events: [{ eventId: 'E', partnerId: 'P' }, { eventId: 'F', partnerId: 'Q', uiLanguage: 'en' }, { eventId: 'G', partnerId: 'Q', qrText: { qrTextId: 'a', pickedAt: NOW } }],
  });
  const [hungarianByPartner, english, stored] = w.data[COLLECTIONS.EVENTS];
  assert.equal((await chooseQrText(w.db, hungarianByPartner))!.text, 'Szkenneld!', 'an event with no language follows its partner');
  assert.equal((await chooseQrText(w.db, english, { random: () => 0 }))!.text, 'Join', 'newest first, the first random pick');
  assert.equal((await chooseQrText(w.db, english, { random: () => 0.99 }))!.text, 'Scan');
  assert.equal((await chooseQrText(w.db, stored, { random: () => 0 }))!.text, 'Scan', 'the stored pick stays');
  await setQrTextActive(w.db, 'a', false, NOW);
  assert.equal((await chooseQrText(w.db, stored, { random: () => 0 }))!.text, 'Join', 'a stored pick that was switched off is replaced');
});

test('the pick is stored once on the event, and the same pick writes nothing', async () => {
  const w = fakeDb({ events: [{ eventId: 'E' }] });
  const event = () => w.data[COLLECTIONS.EVENTS][0];
  await storeQrTextPick(w.db, event(), view('a', 'Scan', 'en'), NOW);
  assert.deepEqual(event().qrText, { qrTextId: 'a', pickedAt: NOW });
  const writes = w.calls.length;
  await storeQrTextPick(w.db, event(), view('a', 'Scan', 'en'), '2026-10-12T00:00:00.000Z');
  assert.equal(w.calls.length, writes);
});
