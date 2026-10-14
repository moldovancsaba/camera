import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { isRecorded, loadJourneyRows, loadJourneySummary, summarizeJourney, type JourneyRow } from './journey';

const row = (day: string, name: JourneyRow['name'], key: string, count: number): JourneyRow => ({ day, name, key, count });

// Two days of a match: 100 visits on the 16th (60 iPhone, 30 Android, 10 desktop), 20 on the 17th.
const ROWS: JourneyRow[] = [
  row('2026-10-16', 'journey.start', 'ios', 60), row('2026-10-16', 'journey.start', 'android', 30), row('2026-10-16', 'journey.start', 'desktop', 10),
  row('2026-10-17', 'journey.start', 'ios', 20),
  row('2026-10-16', 'journey.resume', '', 7),
  row('2026-10-16', 'step.reach', 'welcome', 90), row('2026-10-16', 'step.reach', 'camera', 70), row('2026-10-16', 'step.reach', 'saved', 50), row('2026-10-17', 'step.reach', 'camera', 15),
  row('2026-10-16', 'journey.complete', 'under-1m', 10), row('2026-10-16', 'journey.complete', '1-3m', 30), row('2026-10-16', 'journey.complete', 'over-30m', 2), row('2026-10-17', 'journey.complete', '1-3m', 12),
  row('2026-10-16', 'journey.flow.complete', 'under-1m', 10), row('2026-10-16', 'journey.flow.complete', '1-3m', 30), row('2026-10-16', 'journey.flow.complete', 'over-30m', 2), row('2026-10-17', 'journey.flow.complete', '1-3m', 12),
  row('2026-10-16', 'camera.permission', 'granted', 8), row('2026-10-16', 'camera.permission', 'denied', 2),
  row('2026-10-16', 'photo.taken', 'system', 80), row('2026-10-16', 'photo.taken', 'still', 5), row('2026-10-16', 'photo.retake', '', 17),
  row('2026-10-16', 'photo.save', 'ok', 60), row('2026-10-16', 'photo.save', 'failed', 3),
  row('2026-10-16', 'consent.shown', 'page', 40), row('2026-10-16', 'consent.accept', 'page', 35), row('2026-10-16', 'consent.shown', 'box', 50), row('2026-10-16', 'consent.accept', 'box', 51),
  row('2026-10-16', 'share.click', 'copy', 12), row('2026-10-16', 'share.click', 'whatsapp', 8), row('2026-10-16', 'share.view', '', 30), row('2026-10-16', 'download', '', 9),
];

test('the figures of the whole recording: visits, steps, completed and its rate, devices, camera, retakes, consent, shares and downloads', () => {
  const s = summarizeJourney(ROWS);
  assert.equal(s.since, '2026-10-16');
  assert.equal(s.lastDay, '2026-10-17');
  assert.equal(s.opens, 120);
  assert.equal(s.resumed, 7);
  assert.deepEqual(s.devices.map((d) => [d.id, d.count]), [['ios', 80], ['android', 30], ['desktop', 10], ['unknown', 0]]);
  assert.deepEqual(s.steps.filter((x) => x.count > 0).map((x) => [x.id, x.count]), [['welcome', 90], ['camera', 85], ['saved', 50]]);
  assert.equal(s.steps.find((x) => x.id === 'camera')?.shareOfOpens, 85 / 120);
  assert.equal(s.completed, 54);
  assert.equal(s.completionRate, 54 / 120);
  assert.equal(s.finished, 54);
  assert.equal(s.finishRate, 54 / 120);
  assert.deepEqual(s.timeToComplete.map((b) => [b.id, b.count]), [['under-1m', 10], ['1-3m', 42], ['3-10m', 0], ['10-30m', 0], ['over-30m', 2]]);
  assert.deepEqual(s.camera, { granted: 8, denied: 2, unavailable: 0, deniedRate: 0.2 });
  assert.equal(s.photos.taken, 85);
  assert.equal(s.photos.retakes, 17);
  assert.equal(s.photos.retakesPerPhoto, 17 / 85);
  assert.deepEqual(s.saves, { ok: 60, failed: 3 });
  assert.deepEqual(s.shares.byChannel.filter((c) => c.count > 0).map((c) => [c.id, c.count]), [['copy', 12], ['whatsapp', 8]]);
  assert.equal(s.shares.clicks, 20);
  assert.equal(s.shares.views, 30);
  assert.equal(s.shares.downloads, 9);
});

test('consent left is shown minus accepted for each form and never below zero (a form accepted more often than shown, as a resumed visit can)', () => {
  const s = summarizeJourney(ROWS);
  assert.deepEqual(s.consent.page, { shown: 40, accepted: 35 });
  assert.deepEqual(s.consent.box, { shown: 50, accepted: 51 });
  assert.equal(s.consent.abandoned, 5, 'the page: 40 - 35; the box: 50 - 51 counts as 0, not -1');
  assert.equal(s.consent.shown, 90);
  assert.equal(s.consent.accepted, 86);
});

test('a range of UTC days, both ends included, limits the figures; the recording still says when it began', () => {
  const day17 = summarizeJourney(ROWS, { from: '2026-10-17', to: '2026-10-17' });
  assert.equal(day17.opens, 20);
  assert.equal(day17.completed, 12);
  assert.equal(day17.since, '2026-10-16');
  assert.deepEqual(day17.days, [{ day: '2026-10-17', opens: 20, completed: 12 }]);
  const both = summarizeJourney(ROWS, { from: '2026-10-16', to: '2026-10-17' });
  assert.equal(both.opens, 120);
  assert.deepEqual(both.days.map((d) => d.day), ['2026-10-16', '2026-10-17']);
});

test('days before the recording began are not zeros to be trusted: the summary says the range ended before the start', () => {
  const before = summarizeJourney(ROWS, { from: '2026-10-01', to: '2026-10-10' });
  assert.equal(before.rangeBeforeStart, true);
  assert.equal(before.opens, 0);
  assert.equal(summarizeJourney(ROWS, { to: '2026-10-16' }).rangeBeforeStart, false);
});

test('an event with no record is not recorded: no zero is ever presented as a figure of it', () => {
  const none = summarizeJourney([]);
  assert.equal(none.since, null);
  assert.equal(isRecorded(none), false);
  assert.equal(isRecorded(null), false);
  assert.equal(isRecorded(undefined), false);
  assert.equal(none.completionRate, null, 'no visits, no rate');
  assert.equal(none.camera.deniedRate, null);
  assert.equal(none.photos.retakesPerPhoto, null);
  assert.equal(isRecorded(summarizeJourney(ROWS)), true);
});

test('the median time to the first saved photo is over the raw rows given, in whole seconds', () => {
  assert.equal(summarizeJourney(ROWS, {}, [30_000, 90_000, 600_000]).medianCompleteSeconds, 90);
  assert.equal(summarizeJourney(ROWS, {}, []).medianCompleteSeconds, null);
});

test('rows with a bad count or an unknown name are ignored when read; the rows of other events are not read', async () => {
  const w = fakeDb({
    journey_daily: [
      { eventId: 'e-1', day: '2026-10-16', name: 'journey.start', key: 'ios', count: 4 },
      { eventId: 'e-1', day: '2026-10-16', name: 'journey.start', key: 'android', count: -3 },
      { eventId: 'e-1', day: '2026-10-16', name: 'not.a.name', key: '', count: 9 },
      { eventId: 'e-1', day: 20261016, name: 'journey.start', key: 'ios', count: 1 },
      { eventId: 'e-2', day: '2026-10-16', name: 'journey.start', key: 'ios', count: 99 },
    ],
    journey_events: [
      { eventId: 'e-1', name: 'journey.flow.complete', key: '1-3m', ms: 61_000 },
      { eventId: 'e-1', name: 'journey.complete', key: '1-3m', ms: 'x' },
      { eventId: 'e-1', name: 'photo.retake', key: '', ms: 5 },
      { eventId: 'e-2', name: 'journey.complete', key: '1-3m', ms: 999_000 },
    ],
  });
  assert.deepEqual((await loadJourneyRows(w.db, 'e-1')).map((r) => [r.key, r.count]), [['ios', 4], ['android', 0]]);
  const summary = await loadJourneySummary(w.db, 'e-1');
  assert.equal(summary.opens, 4);
  assert.equal(summary.medianCompleteSeconds, 61);
  assert.equal((await loadJourneySummary(w.db, 'nobody')).since, null);
});
