import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomPage } from '@/lib/db/schemas';
import { PARTNER_PICTURE_FIELDS, parsePartnerPictures, storedPartnerPictures, withPartnerPictures } from './partner-pictures';

const page = (pageType: string, config: Record<string, unknown> = {}): CustomPage => ({ pageId: `${pageType}-1`, pageType, order: 0, isActive: true, config, createdAt: 'x', updatedAt: 'x' }) as unknown as CustomPage;
const PICS = { welcomeBackground: 'https://img.example/bg.png', welcomeScreen: 'https://img.example/screen.png', ctaBackground: 'https://img.example/cta.png' };

test('the pictures are known keys with https addresses; an empty address takes one away; anything else is refused with the reason', () => {
  assert.deepEqual(parsePartnerPictures({ welcomeBackground: ' https://img.example/bg.png ', ctaBackground: '' }), { ok: true, value: { welcomeBackground: 'https://img.example/bg.png' } });
  assert.deepEqual(parsePartnerPictures(null), { ok: true, value: {} });
  for (const bad of ['x', [], { nope: 'https://a.example/x.png' }, { welcomeBackground: 5 }, { welcomeBackground: 'http://a.example/x.png' }, { welcomeBackground: 'https://u:p@a.example/x.png' }, { welcomeBackground: 'not a url' }, { welcomeBackground: `https://a.example/${'x'.repeat(1000)}.png` }]) {
    assert.equal(parsePartnerPictures(bad).ok, false, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(PARTNER_PICTURE_FIELDS.length, 6);
});

test('a stored value that no longer passes loses only the picture that fails', () => {
  assert.deepEqual(storedPartnerPictures({ welcomeBackground: 'https://img.example/bg.png', old: 'https://img.example/old.png', ctaBackground: 'javascript:alert(1)' }), { welcomeBackground: 'https://img.example/bg.png' });
  assert.deepEqual(storedPartnerPictures(undefined), {});
  assert.deepEqual(storedPartnerPictures([]), {});
});

test('a page with no picture in a field shows the partner\'s; a picture on the page is its own and wins; other pages are untouched', () => {
  const pages = [page('welcome', { title: 'Hi', bottomImageUrl: 'https://img.example/own-left.png', backgroundImageUrl: '' }), page('cta', { title: 'Visit' }), page('accept', { title: 'Terms' })];
  const shown = withPartnerPictures(pages, PICS);
  const welcome = shown[0].config as unknown as Record<string, string>;
  assert.equal(welcome.backgroundImageUrl, 'https://img.example/bg.png', 'an empty field takes the partner\'s picture');
  assert.equal(welcome.screenImageUrl, 'https://img.example/screen.png', 'a missing field too');
  assert.equal(welcome.bottomImageUrl, 'https://img.example/own-left.png', 'the page\'s own picture wins');
  assert.equal((shown[1].config as unknown as Record<string, string>).backgroundImageUrl, 'https://img.example/cta.png');
  assert.equal(shown[2], pages[2], 'a page of another type is the same object');
});

test('the stored pages are never changed; no pictures, no change at all', () => {
  const pages = [page('welcome', { title: 'Hi' })];
  const copy = structuredClone(pages);
  withPartnerPictures(pages, PICS);
  assert.deepEqual(pages, copy);
  assert.deepEqual(withPartnerPictures(pages, {}), pages);
  assert.deepEqual(withPartnerPictures(pages, null), pages);
  assert.equal(withPartnerPictures(pages, {})[0], pages[0]);
});

test('a welcome page whose fields are all filled keeps the same object', () => {
  const full = page('welcome', { backgroundImageUrl: 'https://a.example/1.png', bottomImageUrl: 'https://a.example/2.png', cornerImageUrl: 'https://a.example/3.png', screenImageUrl: 'https://a.example/4.png' });
  assert.equal(withPartnerPictures([full], PICS)[0], full);
});
