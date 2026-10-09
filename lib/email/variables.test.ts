import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMAIL_VARIABLES, MENU_VARIABLES, URL_VARIABLES, emailValues, eventFactsOf, formatEventDate, sampleValues } from './variables';
import { parseRich, resolveRich } from './rich';

test('the date is written as a person reads it in each language', () => {
  assert.equal(formatEventDate('2026-10-16T00:00:00.000Z', 'hu'), '2026. október 16.');
  assert.equal(formatEventDate('2026-10-16T18:30:00.000Z', 'en'), '16 October 2026');
  assert.equal(formatEventDate(new Date('2026-10-16T22:30:00.000Z'), 'hu'), '2026. október 17.', 'on the calendar of Budapest: 22:30 UTC is already the next day there');
  assert.equal(formatEventDate('not a date', 'en'), undefined);
  assert.equal(formatEventDate(null, 'en'), undefined);
});

test('the values come from the user, the event and the two sides of the match', () => {
  const values = emailValues({
    recipientName: 'Anna',
    eventName: 'MTK Budapest x Vasas FC',
    shareUrl: 'https://camera.test/share/abc',
    termsUrl: 'https://seyuselfies.com/hu/policies/',
    facts: { date: '2026-10-16T00:00:00.000Z', location: 'Budapest', partnerName: 'MTK Budapest', home: 'MTK Budapest', visitor: 'Vasas FC' },
    language: 'hu',
  });
  assert.deepEqual(values, {
    name: 'Anna',
    event: 'MTK Budapest x Vasas FC',
    partner: 'MTK Budapest',
    home: 'MTK Budapest',
    visitor: 'Vasas FC',
    partner1: 'MTK Budapest',
    partner2: 'Vasas FC',
    teams: 'MTK Budapest – Vasas FC',
    date: '2026. október 16.',
    location: 'Budapest',
    link: 'https://camera.test/share/abc',
    terms: 'https://seyuselfies.com/hu/policies/',
  });
});

test('an event without real teams gets its two sides from a pairing in its name, and one without a pairing has no teams', () => {
  const pairing = emailValues({ eventName: 'Casademont Zaragoza - Basket Landes', facts: {} });
  assert.deepEqual([pairing.home, pairing.visitor, pairing.teams], ['Casademont Zaragoza', 'Basket Landes', 'Casademont Zaragoza – Basket Landes']);
  const none = emailValues({ eventName: 'Summer Festival', facts: {} });
  assert.deepEqual([none.home, none.visitor, none.teams, none.date, none.partner], [undefined, undefined, undefined, undefined, undefined]);
  assert.equal(Object.hasOwn(none, 'teams'), true, 'a variable with no value is present, so it is left out rather than reported as unknown');
});

test('the facts are read from an event document and its messmass snapshot', () => {
  const facts = eventFactsOf({
    name: ' Derby ',
    eventDate: '2026-10-16T00:00:00.000Z',
    location: 'Budapest',
    frameDesign: { context: { event: { homeTeam: { name: 'MTK' }, visitorTeam: { name: 'Vasas' } }, partner: { name: 'MTK Budapest' } } },
  });
  assert.deepEqual(facts, { name: 'Derby', date: '2026-10-16T00:00:00.000Z', location: 'Budapest', partnerName: 'MTK Budapest', home: 'MTK', visitor: 'Vasas' });
  assert.equal(eventFactsOf({ partnerName: 'Own', frameDesign: { context: { partner: { name: 'Snapshot' } } } }).partnerName, 'Own', 'the event’s own partner name wins');
  assert.deepEqual(eventFactsOf(null), { name: undefined, date: undefined, location: undefined, partnerName: undefined, home: undefined, visitor: undefined });
});

test('the catalogue: every variable has a sample in both languages, the menu lists each once, and the links are the two address variables', () => {
  for (const variable of EMAIL_VARIABLES) assert.ok(variable.sample.en && variable.sample.hu, variable.name);
  assert.equal(new Set(EMAIL_VARIABLES.map((variable) => variable.name)).size, EMAIL_VARIABLES.length);
  assert.deepEqual(MENU_VARIABLES.map((variable) => variable.name), ['name', 'event', 'partner', 'home', 'visitor', 'teams', 'date', 'location', 'link', 'terms']);
  assert.deepEqual(URL_VARIABLES, ['link', 'terms']);
  const samples = sampleValues('hu');
  assert.equal(samples.date, '2026. október 16.');
  const out = resolveRich(parseRich('{name} {event} {partner} {home} {visitor} {teams} {date} {location} {link} {terms} {partner1} {partner2}'), samples, URL_VARIABLES);
  assert.deepEqual([out.missing, out.unknown], [[], []], 'every name in the catalogue is known');
});
