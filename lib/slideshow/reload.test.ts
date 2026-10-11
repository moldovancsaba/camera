import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RELOAD_EVERY_MS, reloadHeldBy, reloadReason } from './reload';

const base = { variant: 'fullscreen' as const, openedAt: 1_000_000, now: 1_000_000 + 60_000, token: null, openedToken: null };

test('a page that has been open for less than three hours and saw no request does not reload', () => {
  assert.equal(reloadReason(base), null);
  assert.equal(reloadReason({ ...base, now: base.openedAt + RELOAD_EVERY_MS - 1 }), null);
});

test('after three hours the page reloads', () => {
  assert.equal(reloadReason({ ...base, now: base.openedAt + RELOAD_EVERY_MS }), 'scheduled');
});

test('a new token from the admin reloads the page, an unchanged one does not, and a page opened with it does not reload again', () => {
  assert.equal(reloadReason({ ...base, token: '2026-10-09T15:00:00.000Z', openedToken: null }), 'admin');
  assert.equal(reloadReason({ ...base, token: '2026-10-09T15:00:00.000Z', openedToken: '2026-10-09T14:00:00.000Z' }), 'admin');
  assert.equal(reloadReason({ ...base, token: '2026-10-09T15:00:00.000Z', openedToken: '2026-10-09T15:00:00.000Z' }), null);
  assert.equal(reloadReason({ ...base, token: null, openedToken: '2026-10-09T15:00:00.000Z' }), null, 'an answer without a token says nothing');
});

test('the admin request wins over the schedule, and a layout cell never reloads', () => {
  assert.equal(reloadReason({ ...base, now: base.openedAt + RELOAD_EVERY_MS, token: 'x', openedToken: null }), 'admin');
  assert.equal(reloadReason({ ...base, variant: 'embedded', now: base.openedAt + RELOAD_EVERY_MS, token: 'x', openedToken: null }), null);
});

const clear = { online: true, nextReady: true };

test('a reload that is due goes ahead when the network is up and the next picture is ready (as before the guard)', () => {
  assert.equal(reloadHeldBy('scheduled', clear), null);
  assert.equal(reloadHeldBy('admin', clear), null);
});

test('no reload while the browser is offline, scheduled or asked for', () => {
  assert.equal(reloadHeldBy('scheduled', { ...clear, online: false }), 'offline');
  assert.equal(reloadHeldBy('admin', { ...clear, online: false }), 'offline');
});

test('the scheduled reload waits for the next picture; the admin request does not (it is what is pressed when the screen is in trouble)', () => {
  assert.equal(reloadHeldBy('scheduled', { ...clear, nextReady: false }), 'next picture not ready');
  assert.equal(reloadHeldBy('admin', { ...clear, nextReady: false }), null);
});

test('offline is named before a missing picture', () => {
  assert.equal(reloadHeldBy('scheduled', { online: false, nextReady: false }), 'offline');
});

test('with every condition clear the guard changes nothing: a reload that was due is never lost to it', () => {
  const states = [
    { ...base },
    { ...base, now: base.openedAt + RELOAD_EVERY_MS },
    { ...base, token: 'x', openedToken: null },
    { ...base, variant: 'embedded' as const, now: base.openedAt + RELOAD_EVERY_MS },
  ];
  for (const input of states) {
    const reason = reloadReason(input);
    if (reason !== null) assert.equal(reloadHeldBy(reason, clear), null);
  }
});
