import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserFontUrl, welcomeButtonColours } from './load';

test('a custom font is asked for at an address that answers with CORS headers', () => {
  const previous = process.env.MESSMASS_BASE_URL;
  try {
    process.env.MESSMASS_BASE_URL = 'https://messmass.com';
    assert.equal(browserFontUrl('/fonts/ASRoma-Regular.woff'), 'https://www.messmass.com/fonts/ASRoma-Regular.woff', 'messmass.com redirects to www, and a redirect has no CORS header');
    process.env.MESSMASS_BASE_URL = 'https://www.messmass.com/';
    assert.equal(browserFontUrl('/fonts/ASRoma-Regular.woff'), 'https://www.messmass.com/fonts/ASRoma-Regular.woff');
    assert.equal(browserFontUrl(null), null);
    delete process.env.MESSMASS_BASE_URL;
    assert.equal(browserFontUrl('/fonts/ASRoma-Regular.woff'), null, 'without the messmass address there is no font file to load');
  } finally {
    if (previous === undefined) delete process.env.MESSMASS_BASE_URL;
    else process.env.MESSMASS_BASE_URL = previous;
  }
});

test('the Start button colours come from the active welcome page, the first by order, and from nothing else', () => {
  const welcome = (order: number, config: Record<string, unknown>, isActive = true) => ({ pageType: 'welcome', order, isActive, config });
  assert.deepEqual(welcomeButtonColours([welcome(0, { buttonColor: 'a', buttonTextColor: 'b', buttonBorderColor: 'c' })]), { fill: 'a', label: 'b', ring: 'c' });
  assert.deepEqual(welcomeButtonColours([welcome(2, { buttonColor: 'late' }), welcome(1, { buttonColor: 'first' })]), { fill: 'first', label: undefined, ring: undefined });
  assert.equal(welcomeButtonColours([welcome(0, { buttonColor: 'off' }, false)]), null, 'an inactive welcome page is not used');
  assert.equal(welcomeButtonColours([{ pageType: 'accept', order: 0, isActive: true, config: { buttonColor: 'x' } }]), null);
  for (const nothing of [undefined, null, 'x', [], [null], [{}]]) assert.equal(welcomeButtonColours(nothing), null);
});


test('the e-mail footer picture is the event\'s own, else its partner\'s default; a partner with none, or an event with no partner, leaves it empty', async () => {
  const { fakeDb } = await import('@/lib/library/fake-db');
  const { loadEventTheme } = await import('./load');
  const { db } = fakeDb({
    partners: [{ partnerId: 'P', name: 'MTK', pictures: { emailFooter: 'https://store.public.blob.vercel-storage.com/partner-footer.png' } }, { partnerId: 'Q', name: 'Other' }],
    events: [],
  });
  const base = { eventId: 'e', name: 'Event' };
  assert.equal((await loadEventTheme(db, { ...base, partnerId: 'P' })).emailFooterImageUrl, 'https://store.public.blob.vercel-storage.com/partner-footer.png');
  assert.equal((await loadEventTheme(db, { ...base, partnerId: 'P', emailFooterImageUrl: 'https://store.public.blob.vercel-storage.com/own-footer.png' })).emailFooterImageUrl, 'https://store.public.blob.vercel-storage.com/own-footer.png');
  assert.equal((await loadEventTheme(db, { ...base, partnerId: 'Q' })).emailFooterImageUrl, null);
  assert.equal((await loadEventTheme(db, base)).emailFooterImageUrl, null);
});
