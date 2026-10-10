import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMOTION_OPTIONS, MAX_PEOPLE, MERCH_OPTIONS, PERSON_OPTIONS, RECTANGLE_COLOURS, markPeopleOn, parsePeople, personOption, summarizePeople } from './people';

const person = (extra: Record<string, unknown> = {}) => ({ id: 'a', box: { x: 10, y: 20, w: 30, h: 40 }, gender: 'female', age: 'adult', ...extra });

test('the 16 buttons are 8 person options, 4 emotions and 4 merchandise, each with an emoji and a label, in the order of the reviewers’ sketch', () => {
  assert.equal(PERSON_OPTIONS.length + EMOTION_OPTIONS.length + MERCH_OPTIONS.length, 16);
  assert.deepEqual(PERSON_OPTIONS.map((o) => `${o.gender}-${o.age}`), ['female-kid', 'female-young', 'female-adult', 'female-old', 'male-kid', 'male-young', 'male-adult', 'male-old']);
  assert.deepEqual(EMOTION_OPTIONS.map((o) => o.id), ['sad', 'unamused', 'happy', 'angry']);
  assert.deepEqual(MERCH_OPTIONS.map((o) => o.id).sort(), ['cap', 'flag', 'jersey', 'scarf']);
  for (const o of [...PERSON_OPTIONS, ...EMOTION_OPTIONS, ...MERCH_OPTIONS]) assert.ok(o.emoji && o.label);
  assert.equal(personOption('male', 'old').emoji, '👴');
  assert.match(RECTANGLE_COLOURS[0], /yellow/, 'the first rectangle is yellow');
  assert.match(RECTANGLE_COLOURS[1], /blue/, 'the second is blue');
  assert.ok(RECTANGLE_COLOURS.every((colour) => colour.startsWith('var(--mantine-color-')), 'colours are design system variables, never literals');
});

test('what is saved: nobody is fine; a person has a rectangle inside the photo and one of the 8 person buttons; an emotion and merchandise are optional and known; ids and rounding are kept', () => {
  assert.deepEqual(parsePeople([]), { ok: true, value: [] });
  const ok = parsePeople([person({ emotion: 'happy', merch: ['cap', 'flag', 'cap'] }), person({ id: '', box: { x: 50.123, y: 0, w: 49.876, h: 100 }, gender: 'male', age: 'old' })]);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.value[0], { id: 'a', box: { x: 10, y: 20, w: 30, h: 40 }, gender: 'female', age: 'adult', emotion: 'happy', merch: ['cap', 'flag'] });
    assert.deepEqual(ok.value[1], { id: 'p2', box: { x: 50.12, y: 0, w: 49.88, h: 100 }, gender: 'male', age: 'old' });
  }
  const clipped = parsePeople([person({ box: { x: 80, y: 80, w: 20.005, h: 20 } })]);
  assert.ok(clipped.ok);
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
  refused([person({ gender: 'other' })]);
  refused([person({ age: 'ancient' })]);
  refused([person({ gender: undefined })]);
  refused([person({ emotion: 'bored' })]);
  refused([person({ merch: ['hat'] })]);
  refused([person({ merch: 'cap' })]);
});

test('the counts: people, photos looked at (also with nobody in them), gender, age, both together, emotions, and merchandise (a person can wear several); photos not looked at are left out', () => {
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
  assert.deepEqual(s.byGender, { female: 1, male: 2 });
  assert.deepEqual(s.byAge, { kid: 1, young: 0, adult: 1, old: 1 });
  assert.equal(s.byPerson['male-old'], 1);
  assert.deepEqual(s.byEmotion, { sad: 1, unamused: 0, happy: 1, angry: 0 });
  assert.equal(s.withMerch, 2);
  assert.deepEqual(s.byMerch, { cap: 1, scarf: 0, jersey: 1, flag: 1 });
  assert.equal(summarizePeople([]).photos, 0);
  assert.equal(summarizePeople([]).peoplePerPhoto, 0);
});

test('marking is on for every event unless the event was switched off on purpose (owner answer 264); nothing needs to be stored for it to be on', () => {
  assert.equal(markPeopleOn(null), true);
  assert.equal(markPeopleOn(undefined), true);
  assert.equal(markPeopleOn({}), true);
  assert.equal(markPeopleOn({ markPeopleInVetting: true }), true);
  assert.equal(markPeopleOn({ markPeopleInVetting: undefined }), true);
  assert.equal(markPeopleOn({ markPeopleInVetting: false }), false);
});
