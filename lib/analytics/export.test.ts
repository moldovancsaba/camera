import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveVocabulary } from '@/lib/photo-vetting/vocabulary';
import type { PhotoFacts } from './facts';
import { analyticsCsv, analyticsRows } from './export';
import { buildEventReport } from './report';
import { buildSourcesReport } from './sources';
import { summarizeJourney } from './journey';

const photo = (extra: Partial<PhotoFacts> = {}): PhotoFacts => ({
  id: 'p', eventKey: 'e', eventKeys: ['e'], createdAt: '2026-10-16T18:00:00.000Z', source: 'user', excluded: null, method: 'camera', device: 'ios', review: 'approved', submittedAt: '2026-10-16T18:00:00.000Z',
  decisions: [{ action: 'approve', by: '=cmd|x@club.test', at: '2026-10-16T18:01:00.000Z', reason: null }], rejectReasons: [], identity: 'email', userKey: 'a@x.test', email: 'a@x.test',
  consents: [{ label: '+I accept, the "terms"', pageType: 'accept', at: null }], wallOptIn: false, galleryConsentAt: null, frame: { kind: 'none', label: 'No frame' }, message: null, layout: null, mirrored: null, framing: null,
  plays: 3, lastPlayedAt: null, playsBySlideshow: {}, people: undefined, peopleBy: null, peopleAt: null, emails: { arrived: false, photoLink: 'sent', photoLinkSkipReason: null, photoLinkKind: 'afterSave', declined: null },
  ...extra,
});

const report = buildEventReport({ photos: [photo(), photo({ review: 'rejected', decisions: [{ action: 'reject', by: 'bob', at: '2026-10-16T18:05:00.000Z', reason: '@Not me' }] })] }, { timeZone: 'UTC' });

test('every figure is a row of section, item and value; the rows carry the counts of the report', () => {
  const rows = analyticsRows(report, buildSourcesReport([{ slug: 'abc123', placement: 'Giant screen', kind: 'qr', active: true }], [{ slug: 'abc123', day: '2026-10-16', device: 'iphone', count: 5 }], null));
  const value = (section: string, item: string) => rows.find((row) => row[0] === section && row[1] === item)?.[2];
  assert.equal(value('photos', 'taken'), 2);
  assert.equal(value('photos', 'approved'), 1);
  assert.equal(value('vetting', 'declines'), 1);
  assert.equal(value('screens', 'plays'), 6);
  assert.equal(value('per day', '2026-10-16: photos'), 2);
  assert.equal(value('visits by link', 'Giant screen (abc123)'), 5);
  assert.equal(value('scope', 'time zone'), 'UTC');
  assert.equal(value('photos', 'oldest waiting (seconds)'), null, 'a figure that does not exist is empty, not zero');
  assert.ok(rows.every((row) => row.length === 3));
  assert.equal(rows.filter((row) => row[0] === 'per hour').length, 48);
});

test('the file has a header and CRLF lines; a user’s words that look like a formula, and cells with commas or quotes, are made safe', () => {
  const csv = analyticsCsv(analyticsRows(report));
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'section,item,value');
  assert.equal(lines[lines.length - 1], '');
  assert.ok(csv.includes("'=cmd|x@club.test: approved"), 'a reviewer name that starts with = is not a formula');
  assert.ok(csv.includes("'@Not me"), 'a decline reason that starts with @ is not a formula');
  assert.ok(/consents by wording,"accept: \+I accept, the ""terms""",2/.test(csv), 'the consent sentence is quoted whole, its quotes doubled (it does not begin the cell, so it needs no guard)');
  for (const line of lines.slice(1, -1)) assert.equal(line.split(',').length >= 3, true);
});

test('the journey rows are in the file only for an event that has a record, and carry its counts (UTC days); no record, no rows and no zeros', () => {
  const journey = summarizeJourney([
    { day: '2026-10-16', name: 'journey.start', key: 'ios', count: 10 }, { day: '2026-10-16', name: 'step.reach', key: 'camera', count: 8 }, { day: '2026-10-16', name: 'journey.complete', key: '1-3m', count: 5 },
    { day: '2026-10-16', name: 'share.click', key: 'copy', count: 3 }, { day: '2026-10-16', name: 'download', key: '', count: 2 },
  ]);
  const rows = analyticsRows(report, undefined, journey);
  const value = (section: string, item: string) => rows.find((row) => row[0] === section && row[1] === item)?.[2];
  assert.equal(value('journey', 'opens'), 10);
  assert.equal(value('journey', 'visits with a saved photo'), 5);
  assert.equal(value('journey', 'recording since (UTC day)'), '2026-10-16');
  assert.equal(value('journey steps reached', 'Camera'), 8);
  assert.equal(value('journey shares by channel', 'Copy the link'), 3);
  assert.equal(value('journey shares', 'downloads'), 2);
  assert.equal(value('journey per day (UTC)', '2026-10-16: opens'), 10);
  assert.ok(rows.every((row) => row.length === 3));
  assert.equal(analyticsRows(report, undefined, summarizeJourney([])).some((row) => row[0].startsWith('journey')), false);
  assert.equal(analyticsRows(report).some((row) => row[0].startsWith('journey')), false);
});

test('the reasons chosen from the list and the people counts are rows in the words of the event vocabulary, so a custom option reads as its label', () => {
  const vocabulary = resolveVocabulary({ event: { options: [{ group: 'reject_reason', key: 'confetti', label: 'Too much confetti', custom: true }, { group: 'merch', key: 'vuvuzela', label: 'Vuvuzela', custom: true }] } });
  const person = (merch: string[]) => ({ id: 'a', box: { x: 10, y: 10, w: 30, h: 30 }, gender: 'female', age: 'adult', merch });
  const custom = buildEventReport({
    photos: [
      photo({ review: 'rejected', rejectReasons: ['confetti', 'nudity'], decisions: [{ action: 'reject', by: 'bob', at: '2026-10-16T18:05:00.000Z', reason: null }] }),
      photo({ review: 'rejected', rejectReasons: ['nudity'], decisions: [{ action: 'reject', by: 'bob', at: '2026-10-16T18:05:00.000Z', reason: null }] }),
      photo({ review: 'rejected', rejectReasons: [], decisions: [{ action: 'reject', by: 'bob', at: '2026-10-16T18:05:00.000Z', reason: null }] }),
      photo({ people: [person(['vuvuzela'])] }),
      photo({ people: [person([]), person([])] }),
    ],
    vocabulary,
  }, { timeZone: 'UTC' });
  const rows = analyticsRows(custom);
  const value = (section: string, item: string) => rows.find((row) => row[0] === section && row[1] === item)?.[2];
  assert.equal(value('decline reasons from the list', 'Too much confetti'), 1);
  assert.equal(value('decline reasons from the list', 'Nudity or sexual content'), 2);
  assert.equal(value('decline reasons from the list', 'declined photos with no reason from the list'), 1);
  assert.equal(value('people items', 'Vuvuzela'), 1);
  assert.equal(value('people gender', 'Female'), 3);
  assert.equal(value('people', 'photos with one person'), 1);
  assert.equal(value('people', 'photos with a group (two or more)'), 1);
  assert.ok(rows.every((row) => row.length === 3));
});
