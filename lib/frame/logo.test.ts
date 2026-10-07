import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchLogo, isAllowedLogoUrl } from './logo';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const image = (body: BodyInit = png, headers: Record<string, string> = { 'content-type': 'image/png' }) =>
  (async () => new Response(body, { headers })) as typeof fetch;

test('only https URLs on the two image hosts camera already uses are fetched', () => {
  assert.equal(isAllowedLogoUrl('https://i.ibb.co/abc/logo.png'), true);
  assert.equal(isAllowedLogoUrl('https://bidx0njghn1voknt.public.blob.vercel-storage.com/logos/a.png'), true);
  assert.equal(isAllowedLogoUrl('https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/0a1b2c.png'), true);
  for (const bad of [
    'http://i.ibb.co/abc/logo.png',
    'https://ibb.co/abc',
    'https://i.ibb.co.evil.example/x.png',
    'https://evil.example/i.ibb.co/x.png',
    'https://user:pass@i.ibb.co/x.png',
    'http://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/logos/a.png',
    'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev.evil.example/logos/a.png',
    `https://pub-${'0'.repeat(32)}.r2.dev/logos/a.png`, // another bucket's address
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/x.png',
    'javascript:alert(1)',
    'not a url',
  ]) {
    assert.equal(isAllowedLogoUrl(bad), false, bad);
  }
});

test('a logo comes back as bytes, untouched', async () => {
  assert.deepEqual(await fetchLogo('https://i.ibb.co/abc/logo.png', image()), png);
});

test('a refusal, a redirect, a non-image, an oversize file, an empty file or a network error is no logo', async () => {
  const url = 'https://i.ibb.co/abc/logo.png';
  assert.equal(await fetchLogo(url, (async () => new Response(null, { status: 404 })) as typeof fetch), null);
  assert.equal(await fetchLogo(url, image(png, { 'content-type': 'text/html' })), null);
  assert.equal(await fetchLogo(url, image(png, { 'content-type': 'image/png', 'content-length': String(6 * 1024 * 1024) })), null);
  assert.equal(await fetchLogo(url, image(new Uint8Array(0))), null);
  assert.equal(await fetchLogo(url, (async () => { throw new TypeError('redirect mode is set to error'); }) as typeof fetch), null);
});

test('a URL that is not allowed is never requested', async () => {
  let called = false;
  const spy = (async () => ((called = true), new Response(png, { headers: { 'content-type': 'image/png' } }))) as typeof fetch;
  assert.equal(await fetchLogo('https://evil.example/logo.png', spy), null);
  assert.equal(called, false);
});
