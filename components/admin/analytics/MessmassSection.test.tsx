import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCounters, NO_COUNTERS } from '@/lib/analytics/counters';
import type { CounterState } from '@/lib/analytics/counters-sync';
import type { PhotoFacts } from '@/lib/analytics/facts';
import { buildEventReport } from '@/lib/analytics/report';
import MessmassSection from './MessmassSection';

const photo = (extra: Partial<PhotoFacts> = {}): PhotoFacts => ({
  id: 'p', eventKey: 'e', eventKeys: ['e'], createdAt: '2026-10-16T18:00:00.000Z', source: 'user', excluded: null, method: 'camera', device: 'ios', review: 'waiting', submittedAt: '2026-10-16T18:00:00.000Z', decisions: [], rejectReasons: [],
  identity: 'email', userKey: 'a@x.test', email: 'a@x.test', consents: [], wallOptIn: false, galleryConsentAt: null, frame: { kind: 'none', label: 'No frame' }, message: null, layout: null, mirrored: null, framing: null,
  plays: 0, lastPlayedAt: null, playsBySlideshow: {}, people: undefined, peopleBy: null, peopleAt: null, emails: { arrived: false, photoLink: null, photoLinkSkipReason: null, photoLinkKind: null, declined: null },
  ...extra,
});
const state = (overrides: Partial<CounterState> = {}): CounterState => ({ enabled: false, updatedAt: '', linked: true, counters: NO_COUNTERS, lastPushAt: null, lastPushed: null, ...overrides });
const render = (value: CounterState) => renderToStaticMarkup(<MantineProvider><MessmassSection state={value} timeZone="UTC" /></MantineProvider>);

test('the preview shows the name and the label of each counter, says the push is off and that no counter waits', () => {
  const person = { id: 'a', box: { x: 10, y: 10, w: 30, h: 30 }, gender: 'female', age: 'adult' };
  const counters = buildCounters(buildEventReport({ photos: [photo({ review: 'rejected', rejectReasons: ['nudity'], people: [person] })] }, { timeZone: 'UTC' }));
  const html = render(state({ counters }));
  assert.match(html, /camera_images_taken/);
  assert.match(html, /camera_gender_female/);
  assert.match(html, /Camera: gender, Female/);
  assert.match(html, /camera_rejected_nudity/);
  assert.match(html, /Camera: rejected, Nudity or sexual content/);
  assert.match(html, /Label in messmass/);
  assert.match(html, /Off, as it is by default/);
  assert.match(html, /None\. Every counter can be counted from data that exists\./);
  assert.doesNotMatch(html, /declined&lt;Reason&gt;|declined<Reason>/);
});

test('while nothing is marked or declined the families show as one placeholder row each, not sent yet', () => {
  const html = render(state({ counters: buildCounters(buildEventReport({ photos: [photo()] }, { timeZone: 'UTC' })) }));
  assert.match(html, /camera_gender_&lt;option&gt;/);
  assert.match(html, /camera_rejected_&lt;option&gt;/);
  assert.match(html, /not sent yet/);
  assert.doesNotMatch(html, /camera_gender_female/);
});

test('when it is switched on the tab says so, and the last push is shown with its time', () => {
  const html = render(state({ enabled: true, lastPushAt: '2026-10-20T18:00:00.000Z', lastPushed: { totals: { camera_images_taken: 4 }, averages: {}, labels: {} } }));
  assert.match(html, /Switched on/);
  assert.doesNotMatch(html, /Off, as it is by default/);
});
