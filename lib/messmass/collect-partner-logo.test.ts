import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import sharp from 'sharp';
import { fakeDb } from '@/lib/library/fake-db';

const R2 = 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/vasas.png';

async function setup(t: TestContext, options: { logoUrl?: string; fetchFails?: boolean } = {}) {
  const seeded = fakeDb({
    logos: [],
    partners: [{ partnerId: 'P', name: 'Vasas', ...(options.logoUrl === undefined ? { logoUrl: R2 } : options.logoUrl ? { logoUrl: options.logoUrl } : {}) }],
    events: [{ eventId: 'e1', partnerId: 'P', logos: [] }],
  });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 10, g: 90, b: 40, alpha: 1 } } }).png().toBuffer();
  t.mock.method(globalThis, 'fetch', async () => {
    if (options.fetchFails) throw new Error('network down');
    return new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } });
  });
  const { collectPartnerLogo } = (await import('./provision?case=' + Math.random())) as typeof import('./provision');
  return { ...seeded, collectPartnerLogo };
}

test('a partner that messmass gave a logo gets it in its library and as its logo; its event looks at the partner, nothing is copied', async (t) => {
  const { data, collectPartnerLogo } = await setup(t);
  await collectPartnerLogo('P');
  assert.equal(data.logos.length, 1);
  assert.equal(data.logos[0].source, 'messmass');
  assert.deepEqual((data.partners[0] as { slots: { logo: { items: string[] } } }).slots.logo.items, [data.logos[0].logoId]);
  assert.deepEqual((data.events[0] as { logos: unknown[] }).logos, []);
});

test('calling it again changes nothing, so a default an editor took off stays off', async (t) => {
  const { data, collectPartnerLogo } = await setup(t);
  await collectPartnerLogo('P');
  (data.partners[0] as { slots: { logo: { items: string[] } } }).slots.logo.items = [];
  await collectPartnerLogo('P');
  assert.equal(data.logos.length, 1);
  assert.deepEqual((data.partners[0] as { slots: { logo: { items: string[] } } }).slots.logo.items, []);
});

test('a logo that cannot be downloaded is logged and never throws: provisioning is not held back', async (t) => {
  t.mock.method(console, 'warn', () => undefined);
  const { data, collectPartnerLogo } = await setup(t, { fetchFails: true });
  await collectPartnerLogo('P');
  assert.equal(data.logos.length, 0);
  assert.equal((data.partners[0] as { slots?: unknown }).slots, undefined);
});

test('a partner without a logo, or one that does not exist, is left alone', async (t) => {
  const { data, collectPartnerLogo } = await setup(t, { logoUrl: '' });
  await collectPartnerLogo('P');
  await collectPartnerLogo('nobody');
  assert.equal(data.logos.length, 0);
});
