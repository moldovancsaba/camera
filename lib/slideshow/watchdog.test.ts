import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_RELOADS, RELOAD_AFTER_MS, RELOAD_WINDOW_MS, recentReloads, watchdogAction } from './watchdog';

const NOW = 1_000_000_000;

test('a young stall skips to the next slide, a stall of a minute reloads the page', () => {
  assert.equal(watchdogAction(15_000, [], NOW), 'skip');
  assert.equal(watchdogAction(RELOAD_AFTER_MS - 1, [], NOW), 'skip');
  assert.equal(watchdogAction(RELOAD_AFTER_MS, [], NOW), 'reload');
});

test('after three reloads in ten minutes it only skips, and older reloads do not count', () => {
  const recent = [NOW - 60_000, NOW - 120_000, NOW - 240_000];
  assert.equal(recent.length, MAX_RELOADS);
  assert.equal(watchdogAction(120_000, recent, NOW), 'skip');
  assert.equal(watchdogAction(120_000, [NOW - RELOAD_WINDOW_MS - 1, ...recent.slice(0, 2)], NOW), 'reload');
});

test('the stored history keeps only reload times inside the window, and a bad text is no history', () => {
  assert.deepEqual(recentReloads(JSON.stringify([NOW - 1000, NOW - RELOAD_WINDOW_MS - 5, 'x', null]), NOW), [NOW - 1000]);
  assert.deepEqual(recentReloads('{not json', NOW), []);
  assert.deepEqual(recentReloads('{"a":1}', NOW), []);
  assert.deepEqual(recentReloads(null, NOW), []);
});
