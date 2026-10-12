import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PEOPLE, RECTANGLE_COLOURS, markPeopleOn, parsePeople, summarizePeople } from './people';
import { resolveVocabulary } from './vocabulary';

const person = (extra: Record<string, unknown> = {}) => ({ id: 'a', box: { x: 10, y: 20, w: 30, h: 40 }, gender: 'female', age: 'adult', ...extra });

test('the rectangles are drawn in the colours of the design system, the first yellow and the second blue', () => {
  assert.match(RECTANGLE_COLOURS[0], /yellow/, 'the first rectangle is yellow');
  assert.match(RECTANGLE_COLOURS[1], /blue/, 'the second is blue');
  assert.ok(RECTANGLE_COLOURS.every((colour) => colour.startsWith('var(--mantine-color-')), 'colours are design system variables, never literals');
});

test('what is saved: nobody is fine; a person has a rectangle inside the photo, one gender and one age; an emotion and items are optional and known; ids and rounding are kept', () => {
  assert.deepEqual(parsePeople([]), { ok: true, value: [] });
  const ok = parsePeople([person({ emotion: 'happy', merch: ['cap', 'flag', 'cap'] }), person({ id: '', box: { x: 50.123, y: 0, w: 49.876, h: 100 }, gender: 'male', age: 'old' })]);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.value[0], { id: 'a', box: { x: 10, y: 20, w: 30, h: 40 }, gender: 'female', age: 'adult', emotion: 'happy', merch: ['cap', 'flag'] });
    assert.deepEqual(ok.value[1], { id: 'p2', box: { x: 50.12, y: 0, w: 49.88, h: 100 }, gender: 'male', age: 'old' });
  }
  const clipped = parsePeople([person({ box: { x: 80, y: 80, w: 20.005, h: 20 } })]);
  assert.ok(clipped.ok);
  assert.ok(parsePeople([person({ gender: 'unsure', emotion: 'neutral' })]).ok, 'the standard list has Not sure and Neutral');
});

test('anything else is refused with a reason', () => {
  const refused = (input: unknown) => {
    const result = parsePeople(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    return result.ok ? '' : result.reason;
  };
  refused(null);
  refused('x');
  refused({});
  refused(Array.from({ length: MAX_PEOPLE + 1 }, () => person()));
  refused([null]);
  refused([person({ extra: 1 })]);
  refused([person({ box: null })]);
  refused([person({ box: { x: 'a', y: 0, w: 5, h: 5 } })]);
  refused([person({ box: { x: -1, y: 0, w: 5, h: 5 } })]);
  refused([person({ box: { x: 0, y: 0, w: 0.2, h: 5 } })]);
  refused([person({ box: { x: 90, y: 0, w: 20, h: 5 } })]);
  refused([person({ gender: 'robot' })]);
  refused([person({ age: 'ancient' })]);
  refused([person({ gender: undefined })]);
  refused([person({ emotion: 'bored' })]);
  refused([person({ merch: ['hat'] })]);
  refused([person({ merch: 'cap' })]);
});

test('the list decides what is valid: an option an event added is accepted for that event only, and a hidden option is refused for a new mark but still reads in an old one', () => {
  const event = resolveVocabulary({ event: { options: [{ group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true }, { group: 'emotion', key: 'angry', hidden: true }] } });
  assert.ok(parsePeople([person({ merch: ['vasas_scarf'] })], event, { forSave: true }).ok);
  assert.equal(parsePeople([person({ merch: ['vasas_scarf'] })]).ok, false, 'the standard list does not know it');
  assert.equal(parsePeople([person({ emotion: 'angry' })], event, { forSave: true }).ok, false, 'hidden: not offered for a new mark');
  assert.ok(parsePeople([person({ emotion: 'angry' })], event).ok, 'hidden: an old photo that has it still reads');
});

test('the counts: people, photos looked at (also with nobody in them), gender, age, both together, emotions, and items (a person can have several); photos not looked at are left out', () => {
  const photos = [
    { people: [person({ emotion: 'happy', merch: ['cap', 'flag'] }), person({ gender: 'male', age: 'old', emotion: 'sad' })] },
    { people: [] },
    { people: [person({ gender: 'male', age: 'kid', merch: ['jersey'] })] },
    {},
    { people: 'not a list' },
    null,
    { people: [person({ gender: 'robot' })] },
  ];
  const s = summarizePeople(photos);
  assert.equal(s.photos, 3);
  assert.equal(s.photosWithPeople, 2);
  assert.equal(s.people, 3);
  assert.equal(s.peoplePerPhoto, 1);
  assert.deepEqual(s.byGender, { female: 1, male: 2, unsure: 0 });
  assert.deepEqual(s.byAge, { kid: 1, young: 0, adult: 1, old: 1 });
  assert.equal(s.byPerson['male-old'], 1);
  assert.equal(s.byPerson['unsure-kid'], 0);
  assert.deepEqual(s.byEmotion, { happy: 1, neutral: 0, sad: 1, angry: 0, unamused: 0 });
  assert.equal(s.withMerch, 2);
  assert.deepEqual(s.byMerch, { jersey: 1, scarf: 0, cap: 1, flag: 1 });
  assert.equal(summarizePeople([]).photos, 0);
  assert.equal(summarizePeople([]).peoplePerPhoto, 0);
});

test('the counts follow the event’s list, and an option hidden later still counts what it was given to', () => {
  const event = resolveVocabulary({ event: { options: [{ group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true }, { group: 'merch', key: 'scarf', hidden: true }] } });
  const s = summarizePeople([{ people: [person({ merch: ['vasas_scarf', 'scarf'] })] }], event);
  assert.equal(s.byMerch.vasas_scarf, 1);
  assert.equal(s.byMerch.scarf, 1, 'hidden after the fact, still counted');
  assert.equal(s.byMerch.jersey, 0);
  assert.equal(s.withMerch, 1, 'one person with any item');
});

test('marking is on for every event unless the event was switched off on purpose (owner answer 264); nothing needs to be stored for it to be on', () => {
  assert.equal(markPeopleOn(null), true);
  assert.equal(markPeopleOn(undefined), true);
  assert.equal(markPeopleOn({}), true);
  assert.equal(markPeopleOn({ markPeopleInVetting: true }), true);
  assert.equal(markPeopleOn({ markPeopleInVetting: undefined }), true);
  assert.equal(markPeopleOn({ markPeopleInVetting: false }), false);
});
