import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLIDESHOW_DIAGNOSTIC_MAX_EVENTS, hostOf, sanitizeSlideshowDiagnostic, shortId } from './diagnostics';

const SESSION = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
const batch = (events: unknown[], extra: Record<string, unknown> = {}) => ({ v: 1, slideshowId: 'show_1', variant: 'fullscreen', session: SESSION, uptimeS: 61.26, events, ...extra });

test('a valid batch keeps its allowlisted fields and drops everything else', () => {
  const out = sanitizeSlideshowDiagnostic(
    batch([
      { t: 1200.4, type: 'slide_shown', id: 'a1b2c3', dup: false, q: 11, gapMs: 5003, fetches: 2, loadMs: 340, bytes: 812345, host: 'x.public.blob.vercel-storage.com', imageUrl: 'https://secret/x?token=1', userEmail: 'a@b.c' },
      { t: 2000, type: 'playlist', limit: 1, excl: 10, status: 200, ms: 180, got: 1, fresh: 1, serverMs: 95, cookie: 'no' },
    ])
  );
  assert.ok(out);
  assert.equal(out.uptimeS, 61.3);
  assert.deepEqual(out.events[0], { t: 1200.4, type: 'slide_shown', id: 'a1b2c3', dup: false, q: 11, gapMs: 5003, fetches: 2, loadMs: 340, bytes: 812345, host: 'x.public.blob.vercel-storage.com' });
  assert.deepEqual(out.events[1], { t: 2000, type: 'playlist', limit: 1, excl: 10, status: 200, ms: 180, got: 1, fresh: 1, serverMs: 95 });
  assert.equal(JSON.stringify(out).includes('secret'), false);
  assert.equal(JSON.stringify(out).includes('@'), false);
});

test('numbers are clamped, strings must match, enums must be known', () => {
  const out = sanitizeSlideshowDiagnostic(
    batch([
      { t: 5, type: 'heartbeat', vis: 'hidden', rafGapMs: 9e12, longTasks: -4, heapMb: 'big', online: 'yes', net: '5g' },
      { t: 6, type: 'slide_shown', id: 'not a valid id!', host: 'https://evil/path' },
      { t: 7, type: 'preload', outcome: 'exploded', ms: 20 },
      { t: 8, type: 'error', msg: 'x'.repeat(300) },
    ])
  );
  assert.ok(out);
  assert.deepEqual(out.events[0], { t: 5, type: 'heartbeat', vis: 'hidden', rafGapMs: 3_600_000, longTasks: 0 });
  assert.deepEqual(out.events[1], { t: 6, type: 'slide_shown' });
  assert.deepEqual(out.events[2], { t: 7, type: 'preload', ms: 20 });
  assert.equal((out.events[3].msg as string).length, 80);
});

test('unknown event types and events without a time are dropped; no valid event means no batch', () => {
  const out = sanitizeSlideshowDiagnostic(batch([{ t: 1, type: 'launch_missiles' }, { type: 'lock', ms: 5 }, { t: 3, type: 'lock', ms: 6200 }]));
  assert.deepEqual(out?.events, [{ t: 3, type: 'lock', ms: 6200 }]);
  assert.equal(sanitizeSlideshowDiagnostic(batch([{ t: 1, type: 'nope' }])), null);
  assert.equal(sanitizeSlideshowDiagnostic(batch([])), null);
});

test('a batch keeps at most 100 events', () => {
  const events = Array.from({ length: 250 }, (_, i) => ({ t: i, type: 'lock', ms: i }));
  assert.equal(sanitizeSlideshowDiagnostic(batch(events))?.events.length, SLIDESHOW_DIAGNOSTIC_MAX_EVENTS);
});

test('the wrong version, session, slideshow id or variant is refused', () => {
  const ok = [{ t: 1, type: 'lock', ms: 1 }];
  assert.equal(sanitizeSlideshowDiagnostic(batch(ok, { v: 2 })), null);
  assert.equal(sanitizeSlideshowDiagnostic(batch(ok, { session: 'short' })), null);
  assert.equal(sanitizeSlideshowDiagnostic(batch(ok, { slideshowId: 'a/b' })), null);
  assert.equal(sanitizeSlideshowDiagnostic(batch(ok, { variant: 'tv' })), null);
  assert.equal(sanitizeSlideshowDiagnostic(batch(ok, { events: 'x' })), null);
  assert.equal(sanitizeSlideshowDiagnostic(null), null);
  assert.equal(sanitizeSlideshowDiagnostic([]), null);
});

test('an id is cut to its last 6 characters and an address to its host', () => {
  assert.equal(shortId('65f0c0ffee0123456789abcd'), '89abcd');
  assert.equal(hostOf('https://abc.public.blob.vercel-storage.com/a/b.jpg?token=secret'), 'abc.public.blob.vercel-storage.com');
  assert.equal(hostOf('data:image/svg+xml;utf8,<svg/>'), 'data');
  assert.equal(hostOf('/relative/path.png'), 'localhost');
});
