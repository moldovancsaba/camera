import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PENDING_PHOTO_MAX_BYTES, guestIdentity, isValidEmail, newShareToken, parseImageDataUrl, pendingPhotoPath, storePendingPhoto, type PendingStoreDeps } from './pending';

const JPEG = `data:image/jpeg;base64,${Buffer.from('jpeg bytes').toString('base64')}`;

test('only a JPEG, PNG or WebP data URL is a photo', () => {
  assert.deepEqual(parseImageDataUrl(JPEG), { mime: 'image/jpeg', base64: Buffer.from('jpeg bytes').toString('base64') });
  assert.equal(parseImageDataUrl('data:image/png;base64,AAAA')?.mime, 'image/png');
  assert.equal(parseImageDataUrl('data:image/webp;base64,AAAA')?.mime, 'image/webp');
  for (const bad of ['data:image/svg+xml;base64,AAAA', 'data:text/html;base64,AAAA', 'data:image/jpeg,AAAA', 'AAAA', '', null, undefined, 7, 'data:image/jpeg;base64,<script>']) {
    assert.equal(parseImageDataUrl(bad), null, String(bad));
  }
});

test('the pending path is under pending/, per event, random, and safe whatever the event key holds', () => {
  assert.match(pendingPhotoPath('evt-1', 'image/jpeg'), /^pending\/evt-1\/[0-9a-f]{24}\.jpg$/);
  assert.equal(pendingPhotoPath('evt-1', 'image/png', 'abc'), 'pending/evt-1/abc.png');
  assert.equal(pendingPhotoPath('../../x/../evt 1', 'image/webp', 'r'), 'pending/xevt1/r.webp');
  assert.equal(pendingPhotoPath('///', 'image/jpeg', 'r'), 'pending/event/r.jpg');
  assert.notEqual(pendingPhotoPath('e', 'image/jpeg'), pendingPhotoPath('e', 'image/jpeg'), 'two photos never share a path');
});

test('the photo is stored unlisted with a random suffix, as the type it is, and its size is reported', async () => {
  const calls: Array<{ pathname: string; size: number; options: unknown }> = [];
  const deps: PendingStoreDeps = { put: async (pathname, body, options) => (calls.push({ pathname, size: body.length, options }), { url: `https://store.example/${pathname}` }) };
  const stored = await storePendingPhoto(JPEG, 'evt-1', deps);
  assert.equal(stored.size, 'jpeg bytes'.length);
  assert.equal(stored.mime, 'image/jpeg');
  assert.match(stored.url, /^https:\/\/store\.example\/pending\/evt-1\//);
  assert.deepEqual(calls[0].options, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: true });
});

test('something that is not a photo, or is empty or too large, is refused before anything is stored', async () => {
  let puts = 0;
  const deps: PendingStoreDeps = { put: async () => (puts += 1, { url: 'x' }) };
  await assert.rejects(storePendingPhoto('data:text/plain;base64,AAAA', 'e', deps), /JPEG, PNG or WebP/);
  await assert.rejects(storePendingPhoto('data:image/jpeg;base64,', 'e', deps), /JPEG, PNG or WebP/);
  const huge = `data:image/jpeg;base64,${Buffer.alloc(PENDING_PHOTO_MAX_BYTES + 1).toString('base64')}`;
  await assert.rejects(storePendingPhoto(huge, 'e', deps), /unsupported size/);
  assert.equal(puts, 0);
});

test('share tokens are long, URL safe and never repeat', () => {
  const tokens = new Set(Array.from({ length: 200 }, () => newShareToken()));
  assert.equal(tokens.size, 200);
  for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{24}$/);
});

test('email syntax: a normal address passes; spaces, a missing domain or part, and long text do not', () => {
  for (const ok of ['a@b.co', 'first.last+tag@sub.example.com', ' x@y.hu ']) assert.equal(isValidEmail(ok), true, ok);
  for (const bad of ['', 'a', 'a@b', 'a b@c.de', '@b.de', 'a@.de', `${'x'.repeat(250)}@b.de`, null, undefined, 3]) assert.equal(isValidEmail(bad), false, String(bad));
});

test('the guest is known by the typed email or by the social login; an anonymous session is nobody', () => {
  assert.deepEqual(guestIdentity({ email: ' g@x.hu ', name: ' Ann ' }, null), { email: 'g@x.hu', name: 'Ann' });
  assert.deepEqual(guestIdentity({ email: 'g@x.hu' }, null), { email: 'g@x.hu', name: null });
  assert.deepEqual(guestIdentity(null, { user: { email: 'login@x.com', name: 'Lo Gin' } }), { email: 'login@x.com', name: 'Lo Gin' });
  assert.deepEqual(guestIdentity({ email: 'typed@x.hu' }, { user: { email: 'login@x.com' } }), { email: 'typed@x.hu', name: null }, 'the typed email wins');
  assert.equal(guestIdentity({ email: 'nope' }, null), null);
  assert.equal(guestIdentity(null, { user: { email: 'anonymous@event' } }), null);
  assert.equal(guestIdentity(undefined, undefined), null);
});
