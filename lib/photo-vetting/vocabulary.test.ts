import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COUNTER_NAME_PATTERN,
  KEY_PATTERN,
  STANDARD_OPTIONS,
  STANDARD_VOCABULARY,
  VOCAB_GROUPS,
  counterKey,
  isKnownKey,
  keyForCustomOption,
  optionLabel,
  optionsOf,
  parseStoredVocabulary,
  resolveVocabulary,
} from './vocabulary';

const activeKeys = (vocabulary = STANDARD_VOCABULARY, group: (typeof VOCAB_GROUPS)[number]) => optionsOf(vocabulary, group).map((option) => option.key);

test('the standard list: every key is valid and unique in its group, the keys stored since issue 542 are all there, the recommended additions are off, and the words are plain (no emoji)', () => {
  for (const group of VOCAB_GROUPS) {
    const keys = STANDARD_OPTIONS.filter((option) => option.group === group).map((option) => option.key);
    assert.ok(keys.length > 0, group);
    assert.equal(new Set(keys).size, keys.length, `${group} keys are unique`);
    assert.ok(keys.every((key) => KEY_PATTERN.test(key)), `${group} keys are valid`);
  }
  const keysOf = (group: (typeof VOCAB_GROUPS)[number]) => STANDARD_OPTIONS.filter((option) => option.group === group).map((option) => option.key);
  for (const [group, stored] of [['gender', ['female', 'male']], ['age', ['kid', 'young', 'adult', 'old']], ['emotion', ['sad', 'unamused', 'happy', 'angry']], ['merch', ['cap', 'scarf', 'jersey', 'flag']]] as const) {
    for (const key of stored) assert.ok(keysOf(group).includes(key), `${group}:${key} keeps its meaning for photos marked before`);
  }
  for (const key of ['offensive_gesture', 'nudity', 'alcohol', 'forbidden']) assert.ok(keysOf('reject_reason').includes(key), `the owner named ${key}`);
  assert.deepEqual(activeKeys(STANDARD_VOCABULARY, 'emotion'), ['happy', 'neutral', 'sad', 'angry', 'unamused']);
  assert.deepEqual(activeKeys(STANDARD_VOCABULARY, 'merch'), ['jersey', 'scarf', 'cap', 'flag']);
  assert.ok(!activeKeys(STANDARD_VOCABULARY, 'emotion').includes('excited'), 'a recommended addition is off until somebody switches it on');
  assert.ok(STANDARD_OPTIONS.every((option) => !/\p{Extended_Pictographic}/u.test(option.label)), 'no emoji in the labels');
});

test('with nothing stored anywhere, an event reads the standard list', () => {
  assert.deepEqual(resolveVocabulary(), STANDARD_VOCABULARY);
  assert.deepEqual(resolveVocabulary({ general: undefined, partner: null, event: {} }), STANDARD_VOCABULARY);
});

test('three levels, nearest wins, nothing is copied down: general hides, the partner relabels and adds, the event brings one back and adds its own', () => {
  const general = { options: [{ group: 'gender', key: 'unsure', hidden: true }, { group: 'merch', key: 'cap', label: 'Hat' }] };
  const partner = { options: [{ group: 'merch', key: 'scarf', label: 'Club scarf', order: -1 }, { group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] };
  const event = { options: [{ group: 'gender', key: 'unsure', hidden: false }, { group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true }, { group: 'merch', key: 'jersey', hidden: true }] };

  const general_only = resolveVocabulary({ general });
  assert.ok(!activeKeys(general_only, 'gender').includes('unsure'));
  assert.equal(optionLabel(general_only, 'merch', 'cap'), 'Hat');

  const withPartner = resolveVocabulary({ general, partner });
  assert.equal(activeKeys(withPartner, 'merch')[0], 'scarf', 'the order moved it first');
  assert.equal(optionLabel(withPartner, 'merch', 'scarf'), 'Club scarf');
  assert.ok(activeKeys(withPartner, 'merch').includes('club_flag'), 'a partner option is offered to its events');

  const resolved = resolveVocabulary({ general, partner, event });
  assert.ok(activeKeys(resolved, 'gender').includes('unsure'), 'the event brought it back');
  assert.ok(activeKeys(resolved, 'merch').includes('vasas_scarf') && activeKeys(resolved, 'merch').includes('club_flag'));
  assert.ok(!activeKeys(resolved, 'merch').includes('jersey'));
  assert.equal(optionLabel(resolved, 'merch', 'cap'), 'Hat', 'the general relabel still holds below it');
  assert.equal(resolved.options.find((o) => o.key === 'vasas_scarf')?.level, 'event');
  assert.equal(resolved.options.find((o) => o.key === 'vasas_scarf')?.custom, true);
  assert.equal(resolveVocabulary({ general, partner }).options.some((o) => o.key === 'vasas_scarf'), false, 'an event option is not visible above the event');
});

test('delete means hide: an option nobody offers any more is still known, still has its words, and photos marked with it keep reading', () => {
  const resolved = resolveVocabulary({ event: { options: [{ group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true, hidden: true }, { group: 'merch', key: 'scarf', hidden: true }] } });
  assert.ok(!activeKeys(resolved, 'merch').includes('vasas_scarf'));
  assert.ok(isKnownKey(resolved, 'merch', 'vasas_scarf'));
  assert.ok(!isKnownKey(resolved, 'merch', 'vasas_scarf', { activeOnly: true }));
  assert.ok(isKnownKey(resolved, 'merch', 'scarf'), 'a standard option can be hidden, never removed');
  assert.equal(optionLabel(resolved, 'merch', 'vasas_scarf'), 'Vasas scarf');
  assert.equal(optionLabel(resolved, 'merch', 'gone_key'), 'Gone key', 'a key that is not in the list at all reads as itself, made readable');
});

test('the version says which list an annotation was made with: the same active keys, the same version; hiding or adding changes it; a new label does not', () => {
  const base = resolveVocabulary();
  assert.match(base.version, /^v[0-9a-f]{8}$/);
  assert.equal(resolveVocabulary({ event: { options: [{ group: 'merch', key: 'scarf', label: 'Scarf of the club' }] } }).version, base.version);
  assert.notEqual(resolveVocabulary({ event: { options: [{ group: 'merch', key: 'scarf', hidden: true }] } }).version, base.version);
  assert.notEqual(resolveVocabulary({ event: { options: [{ group: 'merch', key: 'x', label: 'X', custom: true }] } }).version, base.version);
  assert.notEqual(resolveVocabulary({ general: { options: [{ group: 'emotion', key: 'excited', hidden: false }] } }).version, base.version, 'switching a recommended addition on is a new list');
});

test('what a level may store: strict on the write side, lenient on the read side', () => {
  assert.deepEqual(parseStoredVocabulary({ options: [] }), { ok: true, value: { options: [] } });
  const ok = parseStoredVocabulary({ options: [{ group: 'merch', key: 'banner', hidden: false, order: 5 }, { group: 'merch', key: 'club_flag', label: '  Club flag ', custom: true }] });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value.options[1], { group: 'merch', key: 'club_flag', label: 'Club flag', custom: true });
  const refused = (input: unknown) => {
    const result = parseStoredVocabulary(input);
    assert.equal(result.ok, false, JSON.stringify(input));
  };
  refused(null);
  refused({});
  refused({ options: 'x' });
  refused({ options: [null] });
  refused({ options: [{ group: 'nope', key: 'a' }] });
  refused({ options: [{ group: 'merch', key: 'Bad Key', custom: true, label: 'x' }] });
  refused({ options: [{ group: 'merch', key: 'scarf', custom: true, label: 'x' }] });
  refused({ options: [{ group: 'merch', key: 'unknown_standard' }] });
  refused({ options: [{ group: 'merch', key: 'club_flag', custom: true }] });
  refused({ options: [{ group: 'merch', key: 'scarf', label: 'x'.repeat(61) }] });
  refused({ options: [{ group: 'merch', key: 'scarf', order: 1.5 }] });
  refused({ options: [{ group: 'merch', key: 'scarf', hidden: 'yes' }] });
  refused({ options: [{ group: 'merch', key: 'scarf', extra: 1 }] });
  refused({ options: [{ group: 'merch', key: 'scarf' }, { group: 'merch', key: 'scarf' }] });
  refused({ options: Array.from({ length: 61 }, (_, i) => ({ group: 'merch', key: `k${i}`, custom: true, label: 'x' })) });
  // A damaged stored level never takes the screen down: what is not valid is left out.
  assert.deepEqual(resolveVocabulary({ event: 'garbage' }), STANDARD_VOCABULARY);
  assert.deepEqual(resolveVocabulary({ event: { options: [{ group: 'merch', key: 'scarf', hidden: 'yes' }, { nonsense: true }] } }), STANDARD_VOCABULARY);
});

test('the key of a custom option is made from its name and is unique in its group', () => {
  assert.equal(keyForCustomOption('Vasas scarf', STANDARD_VOCABULARY, 'merch'), 'vasas_scarf');
  assert.equal(keyForCustomOption('Šál & sapka!', STANDARD_VOCABULARY, 'merch'), 'sal_sapka');
  assert.equal(keyForCustomOption('Scarf', STANDARD_VOCABULARY, 'merch'), 'scarf_2', 'a standard key is taken');
  assert.equal(keyForCustomOption('123', STANDARD_VOCABULARY, 'merch'), 'option');
  assert.ok(KEY_PATTERN.test(keyForCustomOption('A very long name that goes on and on and on forever', STANDARD_VOCABULARY, 'merch')));
});

test('the names for messmass: always the camera_ prefix, lower case, and the example of the owner', () => {
  assert.equal(counterKey('gender', 'female'), 'camera_gender_female');
  assert.equal(counterKey('age', 'kid'), 'camera_age_kid');
  assert.equal(counterKey('emotion', 'happy'), 'camera_emotion_happy');
  assert.equal(counterKey('merch', 'scarf'), 'camera_merch_scarf');
  assert.equal(counterKey('reject_reason', 'nudity'), 'camera_rejected_nudity');
  for (const option of STANDARD_OPTIONS) assert.match(counterKey(option.group, option.key), COUNTER_NAME_PATTERN, `${option.group}:${option.key}`);
  assert.doesNotMatch('female', COUNTER_NAME_PATTERN);
  assert.doesNotMatch('camera_Gender', COUNTER_NAME_PATTERN);
});
