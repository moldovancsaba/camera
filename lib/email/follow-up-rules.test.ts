import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOLLOW_UP_DEFAULT_MAX_AGE_DAYS,
  addDays,
  calendarDay,
  daysBetween,
  followUpKey,
  followUpMaxAgeDays,
  followUpTiming,
  hasAcceptedConsent,
  parseFollowUpDefault,
} from './follow-up-rules';

test('a calendar day is read from a plain day or an ISO time in the event country, and anything else is not a date', () => {
  assert.equal(calendarDay('2026-10-16'), '2026-10-16');
  assert.equal(calendarDay(' 2026-10-16 '), '2026-10-16');
  assert.equal(calendarDay('2026-10-16T00:00:00.000Z'), '2026-10-16');
  assert.equal(calendarDay('2026-10-15T22:30:00.000Z'), '2026-10-16', 'half past midnight in Budapest is already the 16th');
  assert.equal(calendarDay(new Date('2026-10-16T12:00:00Z')), '2026-10-16');
  for (const bad of [undefined, null, '', '  ', 'soon', '2026-13-45', 42, {}]) assert.equal(calendarDay(bad), null, String(bad));
});

test('days between and days added are whole calendar days, also across a month and the clock change', () => {
  assert.equal(daysBetween('2026-10-16', '2026-10-23'), 7);
  assert.equal(daysBetween('2026-10-16', '2026-10-15'), -1);
  assert.equal(daysBetween('2026-10-20', '2026-11-03'), 14);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2, 'the clock changes on 25 October; a day is still a day');
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-10-16', -7), '2026-10-09');
});

test('the follow up is due from the 7th day after the event until the window ends, and not before or after', () => {
  const at = (day: string) => new Date(`${day}T08:00:00Z`);
  assert.deepEqual(followUpTiming('2026-10-16', at('2026-10-22')), { state: 'too_early', day: '2026-10-16', daysLeft: 1 });
  assert.deepEqual(followUpTiming('2026-10-16', at('2026-10-23')), { state: 'due', day: '2026-10-16', age: 7 });
  assert.deepEqual(followUpTiming('2026-10-16', at('2026-11-06')), { state: 'due', day: '2026-10-16', age: 21 });
  assert.deepEqual(followUpTiming('2026-10-16', at('2026-11-07')), { state: 'too_old', day: '2026-10-16', age: 22 });
  assert.equal(followUpTiming('2026-10-16', at('2026-11-07'), 30).state, 'due', 'a longer window');
  assert.equal(followUpTiming('2026-10-16', at('2026-10-30'), 10).state, 'too_old', 'a shorter window');
  assert.equal(followUpTiming('2026-10-16', at('2026-10-10')).state, 'too_early', 'an event in the future');
});

test('"today" is the day in the event country: just before midnight UTC it can already be the next day in Budapest', () => {
  // 22:30 UTC on 22 October is 00:30 on 23 October in Budapest (UTC+2): seven days after the 16th.
  assert.equal(followUpTiming('2026-10-16', new Date('2026-10-22T22:30:00Z')).state, 'due');
  assert.equal(followUpTiming('2026-10-16', new Date('2026-10-22T21:30:00Z')).state, 'too_early');
});

test('an event with no usable date is never due', () => {
  for (const bad of [undefined, null, '', 'next week']) assert.deepEqual(followUpTiming(bad, new Date('2026-10-23T08:00:00Z')), { state: 'no_date' });
});

test('the window comes from the environment as a whole number above 7 and up to 120, else the default of 21 days', () => {
  assert.equal(followUpMaxAgeDays(undefined), FOLLOW_UP_DEFAULT_MAX_AGE_DAYS);
  assert.equal(FOLLOW_UP_DEFAULT_MAX_AGE_DAYS, 21);
  assert.equal(followUpMaxAgeDays('30'), 30);
  assert.equal(followUpMaxAgeDays('120'), 120);
  for (const bad of ['', 'abc', '7', '6', '0', '-3', '121', '10.5', 'NaN']) assert.equal(followUpMaxAgeDays(bad), FOLLOW_UP_DEFAULT_MAX_AGE_DAYS, bad);
});

test('the partner default is true, false, or empty for no choice; anything else is refused', () => {
  assert.deepEqual(parseFollowUpDefault(true), { ok: true, value: true });
  assert.deepEqual(parseFollowUpDefault(false), { ok: true, value: false });
  assert.deepEqual(parseFollowUpDefault(null), { ok: true, value: null });
  assert.deepEqual(parseFollowUpDefault(''), { ok: true, value: null });
  for (const bad of ['true', 'on', 1, 0, {}, []]) assert.equal(parseFollowUpDefault(bad).ok, false, String(bad));
});

test('the claim id is made of the event and a hash of the address: the same address in any case is one claim, another event or address is another, and the address is not in it', () => {
  const id = followUpKey('event-1', 'Ann@Example.com');
  assert.equal(id, followUpKey('event-1', ' ann@example.com '));
  assert.notEqual(id, followUpKey('event-2', 'ann@example.com'));
  assert.notEqual(id, followUpKey('event-1', 'bob@example.com'));
  assert.match(id, /^followup:event-1:[0-9a-f]{40}$/);
  assert.equal(id.includes('ann'), false);
});

test('a user agreed to the terms when one of the photo\'s consent records is accepted', () => {
  assert.equal(hasAcceptedConsent({ consents: [{ pageId: 'p', accepted: true }] }), true);
  assert.equal(hasAcceptedConsent({ consents: [{ accepted: false }, { accepted: true }] }), true);
  for (const none of [{}, { consents: [] }, { consents: [{ accepted: false }] }, { consents: [null, 'yes', { accepted: 'true' }] }, { consents: 'yes' }, null, undefined]) assert.equal(hasAcceptedConsent(none as never), false, JSON.stringify(none));
});
