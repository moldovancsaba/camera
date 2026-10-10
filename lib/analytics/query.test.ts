import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyticsHref, isAnalyticsView, parseAnalyticsQuery } from './query';

test('the query: the view, the days, the clock and the event, each checked; anything else falls back', () => {
  assert.deepEqual(parseAnalyticsQuery({}, 'UTC'), { view: 'overview', from: '', to: '', timeZone: 'UTC', eventId: '' });
  assert.deepEqual(parseAnalyticsQuery({ view: 'vetting', from: '2026-10-16', to: '2026-10-17', tz: 'Europe/Budapest', eventId: ' abc ' }, 'UTC'), { view: 'vetting', from: '2026-10-16', to: '2026-10-17', timeZone: 'Europe/Budapest', eventId: 'abc' });
  assert.deepEqual(parseAnalyticsQuery({ view: 'nonsense', from: '16/10/2026', to: 'x', tz: 'Mars/Base' }, 'Europe/Budapest'), { view: 'overview', from: '', to: '', timeZone: 'Europe/Budapest', eventId: '' });
  assert.equal(parseAnalyticsQuery({ view: ['screens', 'emails'] }, 'UTC').view, 'screens', 'the first of a repeated parameter');
});

test('the views are the tabs of the page', () => {
  assert.ok(isAnalyticsView('tryon'));
  assert.ok(!isAnalyticsView('journey'));
  assert.ok(!isAnalyticsView(undefined));
});

test('a tab link keeps the filters and leaves out what is default, so the plain address stays clean', () => {
  const query = parseAnalyticsQuery({ from: '2026-10-16', tz: 'UTC' }, 'Europe/Budapest');
  assert.equal(analyticsHref('/admin/events/e1/analytics', query, {}, 'Europe/Budapest'), '/admin/events/e1/analytics?from=2026-10-16&tz=UTC');
  assert.equal(analyticsHref('/admin/events/e1/analytics', query, { view: 'vetting' }, 'Europe/Budapest'), '/admin/events/e1/analytics?view=vetting&from=2026-10-16&tz=UTC');
  assert.equal(analyticsHref('/admin/events/e1/analytics', parseAnalyticsQuery({}, 'UTC'), {}, 'UTC'), '/admin/events/e1/analytics');
  assert.equal(analyticsHref('/admin/tryon/analytics', parseAnalyticsQuery({ eventId: 'abc' }, 'UTC'), { view: 'tryon' }), '/admin/tryon/analytics?view=tryon&eventId=abc');
});
