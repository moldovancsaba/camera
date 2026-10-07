import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deviceFromUserAgent, isCountableVisit } from './device';

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

test('the phone is told from the user agent: Android, iPhone (iPad and iPod too), or other', () => {
  assert.equal(deviceFromUserAgent(ANDROID), 'android');
  assert.equal(deviceFromUserAgent(IPHONE), 'iphone');
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'iphone');
  assert.equal(deviceFromUserAgent(DESKTOP), 'other');
  assert.equal(deviceFromUserAgent(null), 'other');
  assert.equal(deviceFromUserAgent(''), 'other');
});

test('a person on a phone or a computer is counted', () => {
  for (const ua of [ANDROID, IPHONE, DESKTOP]) assert.equal(isCountableVisit('GET', headers({ 'user-agent': ua })), true, ua);
});

test('HEAD requests, prefetches, previews, crawlers, tools and visits with no user agent are not counted', () => {
  assert.equal(isCountableVisit('HEAD', headers({ 'user-agent': IPHONE })), false);
  assert.equal(isCountableVisit('GET', headers({ 'user-agent': IPHONE, purpose: 'prefetch' })), false);
  assert.equal(isCountableVisit('GET', headers({ 'user-agent': IPHONE, 'sec-purpose': 'prefetch;prerender' })), false);
  assert.equal(isCountableVisit('GET', headers({})), false);
  assert.equal(isCountableVisit('GET', headers({ 'user-agent': '   ' })), false);
  for (const ua of [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0 A',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'TelegramBot (like TwitterBot)',
    'curl/8.4.0',
    'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/126.0 Safari/537.36',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  ]) assert.equal(isCountableVisit('GET', headers({ 'user-agent': ua })), false, ua);
});
