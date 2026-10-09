import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { fakeDb } from './fake-db';
import { importMessmassLogo, makeMessmassLogoDefault, messmassLogoState } from './messmass-logo';
import { loadEventLibrary, loadPartnerLibrary } from './db';

const NOW = '2026-10-08T12:00:00.000Z';
const R2 = 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/abc123.png';

const picture = async (width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: { r: 200, g: 20, b: 40, alpha: 1 } } }).png().toBuffer();

/** A fetch that answers with these bytes and this content type, and records what it was asked. */
function fakeFetch(bytes: Buffer | null, contentType = 'image/png') {
  const asked: Array<{ url: string; redirect?: string }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    asked.push({ url: String(url), redirect: init?.redirect });
    if (!bytes) throw new Error('network down');
    return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': contentType, 'content-length': String(bytes.length) } });
  }) as typeof fetch;
  return { impl, asked };
}

const partner = (extra: Record<string, unknown> = {}) => ({ partnerId: 'P', name: 'MTK Budapest', logoUrl: R2, ...extra });

function seed(partners = [partner()]) {
  return fakeDb({
    logos: [{ logoId: 'g1', name: 'Global logo', imageUrl: 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/g1.png', isActive: true }],
    partners,
    events: [{ eventId: 'e-uuid', partnerId: 'P', name: 'MTK x Vasas', logos: [], frames: [] }],
  });
}

test('the logo from messmass is stored as a logo of the partner, measured, pointing at the same file, and the import itself assigns nothing', async () => {
  const { db, data } = seed();
  const fetch = fakeFetch(await picture(640, 320));
  const result = await importMessmassLogo(db, partner(), { createdBy: 'u1', now: NOW, fetchImpl: fetch.impl });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.created, true);
  const logo = data.logos.find((l) => l.source === 'messmass') as Record<string, unknown>;
  assert.equal(logo.scope, 'partner');
  assert.equal(logo.partnerId, 'P');
  assert.equal(logo.eventId, undefined);
  assert.equal(logo.sourceUrl, R2);
  assert.equal(logo.imageUrl, R2, 'the files of the logo bucket never change: no copy is made');
  assert.equal(logo.thumbnailUrl, R2);
  assert.deepEqual([logo.width, logo.height, logo.mimeType, logo.isActive], [640, 320, 'image/png', true]);
  assert.equal(logo.fileSize, (await picture(640, 320)).length);
  assert.equal(logo.name, 'MTK Budapest logo');
  assert.deepEqual(fetch.asked, [{ url: R2, redirect: 'error' }], 'downloaded once, no redirect followed');
  assert.deepEqual(data.events[0].logos, [], 'no event gets it');
  assert.equal((data.partners[0] as { defaultLogos?: unknown }).defaultLogos, undefined, 'it is no default either');
});

test('it is in the partner library at once, and the events of the partner can take it; it is not in the global list of anyone else', async () => {
  const { db } = seed();
  await importMessmassLogo(db, partner(), { createdBy: 'u1', now: NOW, fetchImpl: fakeFetch(await picture(10, 10)).impl });
  const library = await loadPartnerLibrary(db, partner(), 'logos');
  const own = library.items.filter((i) => i.via === 'own');
  assert.equal(own.length, 1);
  assert.equal(own[0].source, 'messmass');
  assert.equal(own[0].scope, 'partner');
  assert.equal(library.available.some((i) => i.source === 'messmass'), false, 'a partner item is never offered as a global one');
  const event = await loadEventLibrary(db, { eventId: 'e-uuid', partnerId: 'P', logos: [] }, 'logos');
  assert.equal(event.available.some((i) => i.id === own[0].id), true);
});

test('a second import of the same address returns the logo already imported; a new address imports a new one', async () => {
  const { db, data } = seed();
  const fetch = fakeFetch(await picture(10, 10));
  const first = await importMessmassLogo(db, partner(), { createdBy: 'u1', now: NOW, fetchImpl: fetch.impl });
  const second = await importMessmassLogo(db, partner(), { createdBy: 'u1', now: NOW, fetchImpl: fetch.impl });
  assert.equal(second.ok && second.created, false);
  assert.equal(first.ok && second.ok && second.item.logoId, first.ok ? first.item.logoId : 'x');
  assert.equal(fetch.asked.length, 1, 'the second call does not download again');
  const other = await importMessmassLogo(db, partner({ logoUrl: R2.replace('abc123', 'def456') }), { createdBy: 'u1', now: NOW, fetchImpl: fetch.impl });
  assert.equal(other.ok && other.created, true);
  assert.equal(data.logos.filter((l) => l.source === 'messmass').length, 2);
});

test('another partner with the same logo address gets its own item', async () => {
  const { db, data } = seed([partner(), partner({ partnerId: 'Q', name: 'MTK Women' })]);
  const fetch = fakeFetch(await picture(10, 10));
  await importMessmassLogo(db, partner(), { createdBy: 'u1', now: NOW, fetchImpl: fetch.impl });
  const forQ = await importMessmassLogo(db, partner({ partnerId: 'Q', name: 'MTK Women' }), { createdBy: 'u1', now: NOW, fetchImpl: fetch.impl });
  assert.equal(forQ.ok && forQ.created, true);
  assert.deepEqual(data.logos.filter((l) => l.source === 'messmass').map((l) => l.partnerId).sort(), ['P', 'Q']);
});

test('nothing is stored for a partner without a logo, a logo on a host camera does not trust, or a plain http address', async () => {
  const fetch = fakeFetch(await picture(10, 10));
  for (const logoUrl of [undefined, '', 'https://elsewhere.example/logo.png', 'http://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/a.png', 'https://user:pw@i.ibb.co/a/b.png']) {
    const { db, data } = seed();
    const result = await importMessmassLogo(db, partner({ logoUrl }), { createdBy: 'u1', now: NOW, fetchImpl: fetch.impl });
    assert.equal(result.ok, false, String(logoUrl));
    assert.equal(!result.ok && result.status, 400);
    assert.equal(data.logos.length, 1, 'nothing written');
  }
  assert.equal(fetch.asked.length, 0, 'nothing was downloaded');
});

test('a download that fails, a file that is not a picture, or a picture of another kind is refused with a plain message', async () => {
  const cases: Array<[Buffer | null, string, number]> = [
    [null, 'image/png', 502],
    [Buffer.from('<html>not found</html>'), 'text/html', 502],
    [Buffer.from('this is not a png'), 'image/png', 400],
    [await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } } }).gif().toBuffer(), 'image/gif', 400],
  ];
  for (const [bytes, type, status] of cases) {
    const { db, data } = seed();
    const result = await importMessmassLogo(db, partner(), { createdBy: 'u1', now: NOW, fetchImpl: fakeFetch(bytes, type).impl });
    assert.equal(result.ok, false, type);
    assert.equal(!result.ok && result.status, status, type);
    assert.ok(!result.ok && result.reason.length > 10);
    assert.equal(data.logos.length, 1, 'nothing written');
  }
});

test('the state says whether the logo can be imported, or the item when it is', async () => {
  const { db } = seed();
  assert.deepEqual(await messmassLogoState(db, partner()), { logoUrl: R2, item: null, problem: null });
  assert.deepEqual(await messmassLogoState(db, partner({ logoUrl: undefined })), { logoUrl: null, item: null, problem: 'This partner has no logo from messmass.' });
  assert.match((await messmassLogoState(db, partner({ logoUrl: 'https://elsewhere.example/a.png' }))).problem ?? '', /trusts/);
  await importMessmassLogo(db, partner(), { createdBy: 'u1', now: NOW, fetchImpl: fakeFetch(await picture(10, 10)).impl });
  const state = await messmassLogoState(db, partner());
  assert.equal(state.item?.source, 'messmass');
  assert.equal(state.problem, null);
});

test('the imported logo becomes one of the partner\'s logos, after the ones it has; a partner not on the slot model keeps what its old default rows amount to', async () => {
  const { db, data } = seed([partner({ defaultLogos: [{ logoId: 'chosen', scenario: 'onboarding-thankyou', order: 0 }, { logoId: 'second', scenario: 'loading-capture', order: 1 }] })]);
  const result = await importMessmassLogo(db, data.partners[0], { createdBy: 'u1', now: NOW, fetchImpl: fakeFetch(await picture(10, 10)).impl });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(await makeMessmassLogoDefault(db, data.partners[0], result.item, NOW), { added: true });
  assert.deepEqual((data.partners[0] as { slots: { logo: { items: string[] } } }).slots.logo.items, ['chosen', 'second', result.item.logoId as string]);
  assert.deepEqual(await makeMessmassLogoDefault(db, data.partners[0], result.item, NOW), { added: false }, 'a second time changes nothing');
  assert.equal(((data.partners[0] as { defaultLogos: unknown[] }).defaultLogos).length, 2, 'the old rows are left as they were');
  assert.deepEqual(data.events[0].logos, [], 'nothing is copied into an event: it looks at the partner');
});

test('a partner with nothing becomes a partner with the one logo; a partner already on the model gets it appended', async () => {
  const { db, data } = seed();
  const first = await importMessmassLogo(db, data.partners[0], { createdBy: 'u1', now: NOW, fetchImpl: fakeFetch(await picture(10, 10)).impl });
  assert.ok(first.ok);
  if (!first.ok) return;
  await makeMessmassLogoDefault(db, data.partners[0], first.item, NOW);
  assert.deepEqual((data.partners[0] as { slots: { logo: { items: string[] } } }).slots.logo.items, [first.item.logoId]);

  (data.partners[0] as { slots?: unknown }).slots = { logo: { items: ['own'] } };
  const other = await importMessmassLogo(db, { ...data.partners[0], logoUrl: R2.replace('abc123', 'new999') }, { createdBy: 'u1', now: NOW, fetchImpl: fakeFetch(await picture(10, 10)).impl });
  assert.ok(other.ok);
  if (!other.ok) return;
  await makeMessmassLogoDefault(db, data.partners[0], other.item, NOW);
  assert.deepEqual((data.partners[0] as { slots: { logo: { items: string[] } } }).slots.logo.items, ['own', other.item.logoId as string]);
});
