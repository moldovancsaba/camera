import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PEOPLE, parsePeople, type PersonTag } from './people';
import {
  addPerson,
  boxBetween,
  canApprove,
  canReject,
  chooseOption,
  chosenReasons,
  describePerson,
  groupHeading,
  incompleteCount,
  isComplete,
  isMarked,
  isRectangle,
  newPersonId,
  peopleToSave,
  personAt,
  removePerson,
  selectPerson,
  setNobody,
  startDraft,
  toggleReason,
  whatIsMissing,
  type ReviewDraft,
} from './review-state';
import { STANDARD_VOCABULARY, resolveVocabulary } from './vocabulary';

const V = STANDARD_VOCABULARY;
const EMPTY: ReviewDraft = { people: [], selectedId: null, nobody: false };
const BOX = { x: 10, y: 10, w: 20, h: 30 };

/** A draft with one person per box, each given the gender and age (or none). */
const draftOf = (...people: Array<Partial<PersonTag> & { id: string }>): ReviewDraft => ({
  people: people.map((person) => ({ box: BOX, gender: '', age: '', ...person })),
  selectedId: null,
  nobody: false,
});
const complete = (id: string) => ({ id, gender: 'female', age: 'adult' });

test('a press-drag makes the rectangle between the two points, inside the photo, in either direction', () => {
  assert.deepEqual(boxBetween({ x: 10, y: 20 }, { x: 40, y: 70 }), { x: 10, y: 20, w: 30, h: 50 });
  assert.deepEqual(boxBetween({ x: 40, y: 70 }, { x: 10, y: 20 }), { x: 10, y: 20, w: 30, h: 50 });
  assert.deepEqual(boxBetween({ x: -5, y: 90 }, { x: 120, y: 130 }), { x: 0, y: 90, w: 100, h: 10 });
  assert.deepEqual(boxBetween({ x: 10.123, y: 10 }, { x: 20.456, y: 20 }), { x: 10.12, y: 10, w: 10.33, h: 10 });
});

test('a tap or a sliver (under 2 % on a side) is not a rectangle and makes no person', () => {
  assert.equal(isRectangle({ x: 0, y: 0, w: 2, h: 2 }), true);
  assert.equal(isRectangle({ x: 0, y: 0, w: 1.99, h: 30 }), false);
  assert.equal(isRectangle({ x: 0, y: 0, w: 30, h: 1.99 }), false);
  assert.equal(isRectangle({ x: 5, y: 5, w: 0, h: 0 }), false);
  const sliver = addPerson(EMPTY, { x: 10, y: 10, w: 1, h: 50 }, 'a');
  assert.equal(sliver, EMPTY, 'the draft is returned unchanged');
});

test('a rectangle makes a new selected person without gender or age, and clears "nobody in this photo"', () => {
  const nobody: ReviewDraft = { people: [], selectedId: null, nobody: true };
  const drawn = addPerson(nobody, BOX, 'a');
  assert.deepEqual(drawn, { people: [{ id: 'a', box: BOX, gender: '', age: '' }], selectedId: 'a', nobody: false });
  const second = addPerson(drawn, { x: 50, y: 50, w: 10, h: 10 }, 'b');
  assert.deepEqual(second.people.map((person) => person.id), ['a', 'b']);
  assert.equal(second.selectedId, 'b', 'the newest person is the selected one');
});

test('an id that is already taken gets a new one, so two people never share an id', () => {
  const draft = addPerson(addPerson(EMPTY, BOX, 'a'), BOX, 'a');
  assert.equal(new Set(draft.people.map((person) => person.id)).size, 2);
  assert.match(newPersonId(), /^p[0-9a-z]+$/);
});

test('at most 40 people: the 41st rectangle makes nobody', () => {
  let draft = EMPTY;
  for (let i = 0; i < MAX_PEOPLE; i += 1) draft = addPerson(draft, BOX, `p${i}`);
  assert.equal(draft.people.length, MAX_PEOPLE);
  assert.equal(addPerson(draft, BOX, 'extra'), draft);
});

test('a tap selects the person under it: the smallest rectangle that holds the point, the later one when equal, none on empty ground', () => {
  const people: PersonTag[] = [
    { id: 'big', box: { x: 0, y: 0, w: 80, h: 80 }, gender: '', age: '' },
    { id: 'small', box: { x: 10, y: 10, w: 20, h: 20 }, gender: '', age: '' },
    { id: 'twin', box: { x: 10, y: 10, w: 20, h: 20 }, gender: '', age: '' },
  ];
  assert.equal(personAt(people, { x: 15, y: 15 }), 'twin');
  assert.equal(personAt(people, { x: 60, y: 60 }), 'big');
  assert.equal(personAt(people, { x: 90, y: 90 }), null);
  assert.equal(personAt([], { x: 1, y: 1 }), null);
});

test('selecting a person, and removing one: the selection goes with it and "nobody" is not carried over', () => {
  const draft = addPerson(addPerson(EMPTY, BOX, 'a'), { x: 50, y: 50, w: 10, h: 10 }, 'b');
  assert.equal(selectPerson(draft, 'a').selectedId, 'a');
  assert.equal(selectPerson(draft, 'zzz'), draft, 'an unknown person cannot be selected');
  assert.equal(selectPerson(draft, null).selectedId, null);
  const removed = removePerson(draft, 'b');
  assert.deepEqual([removed.people.map((person) => person.id), removed.selectedId], [['a'], null]);
  assert.equal(removePerson(selectPerson(draft, 'a'), 'b').selectedId, 'a', 'removing another person keeps the selection');
  assert.equal(removePerson(draft, 'zzz'), draft);
  assert.equal(removePerson(removed, 'a').nobody, false, 'taking the last person off does not say nobody is in the photo');
});

test('gender and age are single required choices; emotion is a single choice that a second tap clears; items are several', () => {
  let draft = addPerson(EMPTY, BOX, 'a');
  draft = chooseOption(draft, 'a', 'gender', 'female', V);
  draft = chooseOption(draft, 'a', 'gender', 'male', V);
  draft = chooseOption(draft, 'a', 'age', 'adult', V);
  draft = chooseOption(draft, 'a', 'age', 'adult', V);
  assert.deepEqual([draft.people[0].gender, draft.people[0].age], ['male', 'adult'], 'a required choice stays chosen when tapped again');
  draft = chooseOption(draft, 'a', 'emotion', 'happy', V);
  draft = chooseOption(draft, 'a', 'emotion', 'sad', V);
  assert.equal(draft.people[0].emotion, 'sad');
  draft = chooseOption(draft, 'a', 'emotion', 'sad', V);
  assert.equal('emotion' in draft.people[0], false, 'tapping the emotion again clears it');
  draft = chooseOption(draft, 'a', 'merch', 'scarf', V);
  draft = chooseOption(draft, 'a', 'merch', 'cap', V);
  assert.deepEqual(draft.people[0].merch, ['scarf', 'cap']);
  draft = chooseOption(draft, 'a', 'merch', 'scarf', V);
  assert.deepEqual(draft.people[0].merch, ['cap']);
  draft = chooseOption(draft, 'a', 'merch', 'cap', V);
  assert.equal('merch' in draft.people[0], false, 'no empty list of items is kept');
});

test('only an option the event offers now can be chosen, and only for a person who exists', () => {
  const draft = addPerson(EMPTY, BOX, 'a');
  assert.equal(chooseOption(draft, 'a', 'gender', 'robot', V), draft);
  assert.equal(chooseOption(draft, 'a', 'gender', 'female', V).people[0].gender, 'female');
  assert.equal(chooseOption(draft, 'zzz', 'gender', 'female', V), draft);
  assert.equal(chooseOption(draft, 'a', 'emotion', 'excited', V), draft, 'excited is in the list but not offered in the standard one');
  const hidden = resolveVocabulary({ event: { options: [{ group: 'merch', key: 'scarf', hidden: true }, { group: 'merch', key: 'poncho', label: 'Poncho', custom: true }] } });
  assert.equal(chooseOption(draft, 'a', 'merch', 'scarf', hidden), draft, 'a hidden option cannot be chosen');
  assert.deepEqual(chooseOption(draft, 'a', 'merch', 'poncho', hidden).people[0].merch, ['poncho'], 'a custom option can');
});

test('a person is complete with a gender and an age that are offered; the others are incomplete', () => {
  assert.equal(isComplete({ id: 'a', box: BOX, gender: 'female', age: 'adult' }, V), true);
  assert.equal(isComplete({ id: 'a', box: BOX, gender: '', age: 'adult' }, V), false);
  assert.equal(isComplete({ id: 'a', box: BOX, gender: 'female', age: '' }, V), false);
  const noAdult = resolveVocabulary({ event: { options: [{ group: 'age', key: 'adult', hidden: true }] } });
  assert.equal(isComplete({ id: 'a', box: BOX, gender: 'female', age: 'adult' }, noAdult), false, 'an age that is hidden now has to be chosen again');
  assert.equal(incompleteCount(draftOf(complete('a'), { id: 'b' }, { id: 'c', gender: 'male' }), V), 2);
});

test('"nobody in this photo" is only possible while the list is empty', () => {
  assert.equal(setNobody(EMPTY, true).nobody, true);
  assert.equal(setNobody(setNobody(EMPTY, true), false).nobody, false);
  const withPerson = addPerson(EMPTY, BOX, 'a');
  assert.equal(setNobody(withPerson, true), withPerson);
});

test('a photo is marked with every person complete, or with nobody chosen; an empty list that nobody confirmed is not marked', () => {
  assert.equal(isMarked(EMPTY, V), false);
  assert.equal(isMarked({ ...EMPTY, nobody: true }, V), true);
  assert.equal(isMarked(draftOf(complete('a')), V), true);
  assert.equal(isMarked(draftOf(complete('a'), { id: 'b' }), V), false);
});

test('approve: enabled when the photo is marked; an event that does not mark people needs nothing', () => {
  assert.equal(canApprove(EMPTY, V, true), false);
  assert.equal(canApprove({ ...EMPTY, nobody: true }, V, true), true);
  assert.equal(canApprove(draftOf(complete('a'), { id: 'b' }), V, true), false);
  assert.equal(canApprove(draftOf(complete('a'), complete('b')), V, true), true);
  assert.equal(canApprove(EMPTY, V, false), true);
});

test('reject: marked as for an approval (rejected photos are annotated too) and at least one reason the event offers', () => {
  const marked = draftOf(complete('a'));
  assert.equal(canReject(marked, V, true, []), false, 'no reason');
  assert.equal(canReject(marked, V, true, ['nudity']), true);
  assert.equal(canReject(EMPTY, V, true, ['nudity']), false, 'not marked');
  assert.equal(canReject(draftOf({ id: 'a' }), V, true, ['nudity']), false, 'a person without gender and age');
  assert.equal(canReject(EMPTY, V, false, ['nudity']), true, 'marking off: the reason is still needed, the people are not');
  assert.equal(canReject(EMPTY, V, false, []), false);
  assert.equal(canReject(marked, V, true, ['not_a_reason']), false, 'a key that is not in the list is no reason');
  const hidden = resolveVocabulary({ event: { options: [{ group: 'reject_reason', key: 'nudity', hidden: true }] } });
  assert.equal(canReject(marked, hidden, true, ['nudity']), false, 'a reason that is hidden is not offered, so it does not count');
});

test('reasons: tapping chooses and unchooses; the chosen list keeps only the offered ones, in the order of the list', () => {
  assert.deepEqual(toggleReason([], 'alcohol'), ['alcohol']);
  assert.deepEqual(toggleReason(['alcohol', 'nudity'], 'alcohol'), ['nudity']);
  assert.deepEqual(chosenReasons(['alcohol', 'bogus', 'nudity'], V), ['nudity', 'alcohol'], 'the order of the list: nudity comes before alcohol');
});

test('what is missing is said in words: draw or say nobody, then how many people need gender and age', () => {
  assert.match(String(whatIsMissing(EMPTY, V, true)), /Draw a rectangle around each person, or choose Nobody in this photo\./);
  assert.equal(whatIsMissing({ ...EMPTY, nobody: true }, V, true), null);
  assert.equal(whatIsMissing(draftOf({ id: 'a' }), V, true), '1 person needs gender and age.');
  assert.equal(whatIsMissing(draftOf({ id: 'a' }, { id: 'b' }, complete('c')), V, true), '2 people need gender and age.');
  assert.equal(whatIsMissing(draftOf(complete('a')), V, true), null);
  assert.equal(whatIsMissing(EMPTY, V, false), null, 'marking off: nothing is missing');
});

test('a person is described in the words of the list, or by what it needs', () => {
  assert.deepEqual(describePerson({ id: 'a', box: BOX, gender: '', age: '' }, V), { text: 'needs gender and age', complete: false });
  assert.deepEqual(describePerson({ id: 'a', box: BOX, gender: 'female', age: '' }, V), { text: 'needs age', complete: false });
  assert.deepEqual(describePerson({ id: 'a', box: BOX, gender: '', age: 'adult' }, V), { text: 'needs gender', complete: false });
  const person: PersonTag = { id: 'a', box: BOX, gender: 'female', age: 'adult', emotion: 'happy', merch: ['scarf', 'cap'] };
  assert.deepEqual(describePerson(person, V), { text: 'Female, Adult (about 25 to 59), Happy, Scarf, Cap or hat', complete: true });
  const relabelled = resolveVocabulary({ event: { options: [{ group: 'gender', key: 'female', label: 'Woman' }] } });
  assert.match(describePerson(person, relabelled).text, /^Woman, /);
});

test('a saved photo opens with what the event offers now: a gender or age that was hidden is emptied, an emotion or item that was hidden is dropped, "nobody" is remembered', () => {
  const saved: PersonTag[] = [
    { id: 'a', box: BOX, gender: 'female', age: 'adult', emotion: 'happy', merch: ['scarf', 'cap'] },
    { id: 'b', box: BOX, gender: 'male', age: 'old' },
  ];
  const later = resolveVocabulary({
    event: {
      options: [
        { group: 'age', key: 'old', hidden: true },
        { group: 'emotion', key: 'happy', hidden: true },
        { group: 'merch', key: 'scarf', hidden: true },
      ],
    },
  });
  const draft = startDraft({ people: saved, peopleMarked: true }, later);
  assert.deepEqual(draft.people[0], { id: 'a', box: BOX, gender: 'female', age: 'adult', merch: ['cap'] });
  assert.deepEqual(draft.people[1], { id: 'b', box: BOX, gender: 'male', age: '' });
  assert.equal(draft.selectedId, null);
  assert.equal(startDraft({ people: [], peopleMarked: true }, V).nobody, true, 'looked at before, nobody in it');
  assert.equal(startDraft({ people: [], peopleMarked: false }, V).nobody, false, 'nobody looked yet');
});

test('what is saved is exactly what the people route accepts for a save, with nothing empty in it', () => {
  let draft = addPerson(EMPTY, BOX, 'a');
  draft = chooseOption(chooseOption(draft, 'a', 'gender', 'female', V), 'a', 'age', 'kid', V);
  draft = chooseOption(draft, 'a', 'merch', 'flag', V);
  draft = addPerson(draft, { x: 50, y: 40, w: 25, h: 40 }, 'b');
  draft = chooseOption(chooseOption(draft, 'b', 'gender', 'unsure', V), 'b', 'age', 'old', V);
  draft = chooseOption(draft, 'b', 'emotion', 'neutral', V);
  const toSave = peopleToSave(draft);
  assert.deepEqual(toSave[0], { id: 'a', box: BOX, gender: 'female', age: 'kid', merch: ['flag'] });
  assert.deepEqual(toSave[1], { id: 'b', box: { x: 50, y: 40, w: 25, h: 40 }, gender: 'unsure', age: 'old', emotion: 'neutral' });
  const checked = parsePeople(toSave, V, { forSave: true });
  assert.deepEqual(checked, { ok: true, value: toSave });
  assert.deepEqual(peopleToSave(EMPTY), []);
});

test('the group headings are the questions of the list, with "optional" on the groups that are not required', () => {
  assert.equal(groupHeading('gender'), 'Gender, as the person looks in the photo');
  assert.equal(groupHeading('age'), 'Age, as the person looks in the photo');
  assert.equal(groupHeading('emotion'), 'How the person looks (optional)');
  assert.equal(groupHeading('merch'), 'What the person wears or holds (optional)');
});
