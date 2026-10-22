import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCounters, NO_COUNTERS } from '@/lib/analytics/counters';
import type { CounterState } from '@/lib/analytics/counters-sync';
import type { PhotoFacts } from '@/lib/analytics/facts';
import { buildEventReport } from '@/lib/analytics/report';

const photo = (extra: Partial<PhotoFacts> = {}): PhotoFacts => ({
  id: 'p', eventKey: 'e', eventKeys: ['e'], createdAt: '2026-10-16T18:00:00.000Z', source: 'user', excluded: null, method: 'camera', device: 'ios', review: 'waiting', submittedAt: '2026-10-16T18:00:00.000Z', decisions: [], rejectReasons: [],
  identity: 'email', userKey: 'a@x.test', email: 'a@x.test', consents: [], wallOptIn: false, galleryConsentAt: null, frame: { kind: 'none', label: 'No frame' }, message: null, layout: null, mirrored: null, framing: null,
  plays: 0, lastPlayedAt: null, playsBySlideshow: {}, emails: { arrived: false, photoLink: null, photoLinkSkipReason: null, photoLinkKind: null, declined: null },
  ...extra,
});
const state = (overrides: Partial<CounterState> = {}): CounterState => ({ enabled: false, updatedAt: '', updatedBy: null, linked: true, counters: NO_COUNTERS, lastPushAt: null, lastPushed: null, ...overrides });
// The switch reads the app router, which does not exist outside Next: the router is mocked and the component imported fresh in each test.
let imported = 0;
const mocked = new WeakSet<TestContext>();
async function render(t: TestContext, value: CounterState): Promise<string> {
  if (!mocked.has(t)) {
    t.mock.module('next/navigation', { exports: { useRouter: () => ({ refresh: () => undefined }) } });
    mocked.add(t);
  }
  imported += 1;
  const { default: Section } = (await import('./MessmassSection?case=' + imported)) as typeof import('./MessmassSection');
  return renderToStaticMarkup(<MantineProvider><Section state={value} timeZone="UTC" /></MantineProvider>);
}

test('the preview shows the name and the label of each counter, says the push is off and that no counter waits', async (t) => {
  const counters = buildCounters(buildEventReport({ photos: [photo({ review: 'rejected', rejectReasons: ['nudity'] })] }, { timeZone: 'UTC' }));
  const html = await render(t, state({ counters }));
  assert.match(html, /camera_images_taken/);
  assert.match(html, /camera_rejected_nudity/);
  assert.match(html, /Camera: rejected, Nudity or sexual content/);
  assert.match(html, /Label in messmass/);
  assert.match(html, /Off, as it is by default/);
  assert.match(html, /None\. Every counter can be counted from data that exists\./);
  assert.doesNotMatch(html, /declined&lt;Reason&gt;|declined<Reason>/);
});

test('while no photo is declined the rejection reason family shows as a placeholder row, not sent yet', async (t) => {
  const html = await render(t, state({ counters: buildCounters(buildEventReport({ photos: [photo()] }, { timeZone: 'UTC' })) }));
  assert.match(html, /camera_rejected_&lt;option&gt;/);
  assert.match(html, /not sent yet/);
  assert.doesNotMatch(html, /camera_gender_female/);
});

test('when it is switched on the tab says so, and the last push is shown with its time', async (t) => {
  const html = await render(t, state({ enabled: true, lastPushAt: '2026-10-20T18:00:00.000Z', lastPushed: { totals: { camera_images_taken: 4 }, averages: {}, labels: {} } }));
  assert.match(html, /Switched on/);
  assert.doesNotMatch(html, /Off, as it is by default/);
});

test('the switch is on the tab: off it offers to switch sending on, on it offers to switch it off and says who changed it and when; the texts follow the state', async (t) => {
  const off = await render(t, state());
  assert.match(off, /data-counters-switch="off"/);
  assert.match(off, /Sending to messmass is off for every event that is linked to messmass/);
  assert.match(off, /Switch sending on/);
  assert.doesNotMatch(off, /Confirm: switch sending on/, 'the confirmation only appears after the first press');
  assert.match(off, /Never changed: it is off, as it is by default/);
  assert.match(off, /Sending is off\./);

  const on = await render(t, state({ enabled: true, updatedAt: '2026-10-20T18:00:00.000Z', updatedBy: 'owner@example.test' }));
  assert.match(on, /data-counters-switch="on"/);
  assert.match(on, /Sending to messmass is on for every event that is linked to messmass/);
  assert.match(on, /Switch sending off/);
  assert.match(on, /by owner@example\.test/);
  assert.match(on, /Sending is on\./);
  assert.doesNotMatch(on, /Off, as it is by default/);
});
