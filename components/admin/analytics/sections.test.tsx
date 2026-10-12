import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PhotoFacts } from '@/lib/analytics/facts';
import { buildEventReport } from '@/lib/analytics/report';
import { resolveVocabulary } from '@/lib/photo-vetting/vocabulary';
import { VettingSection } from './sections';

const photo = (extra: Partial<PhotoFacts> = {}): PhotoFacts => ({
  id: 'p', eventKey: 'e', eventKeys: ['e'], createdAt: '2026-10-16T18:00:00.000Z', source: 'user', excluded: null, method: 'camera', device: 'ios', review: 'waiting', submittedAt: '2026-10-16T18:00:00.000Z', decisions: [], rejectReasons: [],
  identity: 'email', userKey: 'a@x.test', email: 'a@x.test', consents: [], wallOptIn: false, galleryConsentAt: null, frame: { kind: 'none', label: 'No frame' }, message: null, layout: null, mirrored: null, framing: null,
  plays: 0, lastPlayedAt: null, playsBySlideshow: {}, people: undefined, peopleBy: null, peopleAt: null, emails: { arrived: false, photoLink: null, photoLinkSkipReason: null, photoLinkKind: null, declined: null },
  ...extra,
});
const render = (photos: PhotoFacts[], vocabulary?: ReturnType<typeof resolveVocabulary>) => renderToStaticMarkup(<MantineProvider><VettingSection report={buildEventReport({ photos, vocabulary }, { timeZone: 'UTC' })} /></MantineProvider>);

test('the reasons chosen from the list are shown next to the words a reviewer wrote, with the photos that carry none counted apart', () => {
  const rejected = (rejectReasons: string[], reason: string | null) => photo({ review: 'rejected', rejectReasons, decisions: [{ action: 'reject', by: 'bob', at: '2026-10-16T18:05:00.000Z', reason }] });
  const html = render([rejected(['nudity', 'alcohol'], 'Not me'), rejected(['nudity'], null), rejected([], null)]);
  assert.match(html, /Reasons chosen for declines/);
  assert.match(html, /Nudity or sexual content/);
  assert.match(html, /Alcohol/);
  assert.match(html, /2 declined photos with a reason from the list, 1 without/);
  assert.match(html, /Reasons written for declines/);
  assert.match(html, /Not me/);
});

test('with no declined photo the panel says so instead of showing empty bars, and the people card uses the words of the event vocabulary', () => {
  const custom = resolveVocabulary({ event: { options: [{ group: 'merch', key: 'vuvuzela', label: 'Vuvuzela', custom: true }] } });
  const html = render([photo({ people: [{ id: 'a', box: { x: 10, y: 10, w: 30, h: 30 }, gender: 'female', age: 'adult', merch: ['vuvuzela'] }] })], custom);
  assert.match(html, /No declined photo carries a reason from the list yet/);
  assert.match(html, /Vuvuzela: 1/);
});
