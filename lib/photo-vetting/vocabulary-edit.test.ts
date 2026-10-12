import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addCustom,
  checkLabel,
  deleteCustom,
  emptyRequiredGroups,
  isAddedHere,
  isDeletedHere,
  moveOption,
  overridesAbove,
  resetOption,
  setHidden,
  setLabel,
  settle,
  sourceOf,
  type EditContext,
  type EditResult,
} from './vocabulary-edit';
import { STANDARD_VOCABULARY, VOCAB_GROUPS, optionsOf, parseStoredVocabulary, resolveOver, resolveVocabulary, type StoredOption, type VocabGroup } from './vocabulary';

const standardCtx: EditContext = { level: 'general', parent: STANDARD_VOCABULARY };
const partnerCtx = (general: unknown = undefined): EditContext => ({ level: 'partner', parent: resolveVocabulary({ general }) });
const eventCtx = (general: unknown = undefined, partner: unknown = undefined): EditContext => ({ level: 'event', parent: resolveVocabulary({ general, partner }) });

const need = (result: EditResult) => {
  assert.ok(result.ok, result.ok ? '' : result.reason);
  return result.options;
};
const reason = (result: EditResult) => {
  assert.equal(result.ok, false);
  return result.ok ? '' : result.reason;
};
const view = (ctx: EditContext, options: StoredOption[]) => resolveOver(ctx.parent, ctx.level, { options });
const keys = (ctx: EditContext, options: StoredOption[], group: VocabGroup, { all = false } = {}) => optionsOf(view(ctx, options), group, { activeOnly: !all }).map((o) => o.key);

test('a label is plain words: trimmed, one space between words, at most 60 characters, no emoji, no angle brackets', () => {
  assert.deepEqual(checkLabel('  Club   scarf '), { ok: true, label: 'Club scarf' });
  for (const bad of ['', '   ', 'x'.repeat(61), 'a <b>', 'Scarf 🧣', 'Flag 🇭🇺', '1⃣', 'a\u0007b', 5, null]) assert.equal(checkLabel(bad).ok, false, String(bad));
  assert.equal(checkLabel('x'.repeat(60)).ok, true);
  assert.equal(checkLabel('Šál és sapka').ok, true, 'accents are plain words');
});

test('setLabel stores the new words, and words equal to the level above store nothing: the option follows its parent again', () => {
  const ctx = eventCtx({ options: [{ group: 'merch', key: 'cap', label: 'Hat' }] });
  const options: StoredOption[] = [];
  const relabelled = need(setLabel(ctx, options, 'merch', 'scarf', 'Club scarf'));
  assert.deepEqual(relabelled, [{ group: 'merch', key: 'scarf', label: 'Club scarf' }]);
  assert.deepEqual(options, [], 'the list that came in is never changed');
  assert.equal(view(ctx, relabelled).options.find((o) => o.key === 'scarf')?.label, 'Club scarf');
  // Back to the words of the standard list: nothing is stored.
  assert.deepEqual(need(setLabel(ctx, relabelled, 'merch', 'scarf', 'Scarf')), []);
  // The general level's relabel is what the event follows: writing the same words stores nothing either.
  assert.deepEqual(need(setLabel(ctx, [], 'merch', 'cap', 'Hat')), []);
  assert.deepEqual(need(setLabel(ctx, [], 'merch', 'cap', 'Cap')), [{ group: 'merch', key: 'cap', label: 'Cap' }]);
});

test('setLabel refuses what is not allowed and says why: empty, too long, emoji, an unknown option, a name another option of the group has', () => {
  const ctx = standardCtx;
  assert.match(reason(setLabel(ctx, [], 'merch', 'scarf', '  ')), /name/);
  assert.match(reason(setLabel(ctx, [], 'merch', 'scarf', 'x'.repeat(61))), /60/);
  assert.match(reason(setLabel(ctx, [], 'merch', 'scarf', 'Scarf 🧣')), /emoji/);
  assert.match(reason(setLabel(ctx, [], 'merch', 'nope', 'Whatever')), /does not exist/);
  assert.match(reason(setLabel(ctx, [], 'merch', 'scarf', 'flag')), /already called Flag/, 'the same words twice in a group would be the same button to the person who vets');
  assert.equal(setLabel(ctx, [], 'gender', 'unsure', 'Flag').ok, true, 'the same words in another group are fine');
});

test('setHidden hides and offers again; hiding what the level above already hides stores nothing, bringing it back stores the difference', () => {
  const general = { options: [{ group: 'gender', key: 'unsure', hidden: true }] };
  const ctx = eventCtx(general);
  assert.deepEqual(need(setHidden(ctx, [], 'gender', 'unsure', true)), [], 'the same as the parent');
  const back = need(setHidden(ctx, [], 'gender', 'unsure', false));
  assert.deepEqual(back, [{ group: 'gender', key: 'unsure', hidden: false }]);
  assert.ok(keys(ctx, back, 'gender').includes('unsure'));
  assert.deepEqual(need(setHidden(ctx, back, 'gender', 'unsure', true)), [], 'and hiding it once more is the parent again');
  const hiddenScarf = need(setHidden(ctx, [], 'merch', 'scarf', true));
  assert.deepEqual(hiddenScarf, [{ group: 'merch', key: 'scarf', hidden: true }]);
  assert.ok(!keys(ctx, hiddenScarf, 'merch').includes('scarf'));
  assert.ok(keys(ctx, hiddenScarf, 'merch', { all: true }).includes('scarf'), 'a hidden option stays in the list');
  // A recommended addition is off in the standard list: switching it on is a stored difference.
  assert.deepEqual(need(setHidden(standardCtx, [], 'emotion', 'excited', false)), [{ group: 'emotion', key: 'excited', hidden: false }]);
});

test('a required group keeps one offered option: the last one cannot be hidden', () => {
  let options: StoredOption[] = [];
  options = need(setHidden(standardCtx, options, 'gender', 'female', true));
  options = need(setHidden(standardCtx, options, 'gender', 'male', true));
  assert.match(reason(setHidden(standardCtx, options, 'gender', 'unsure', true)), /At least one option of Gender/);
  assert.deepEqual(keys(standardCtx, options, 'gender'), ['unsure']);
  // The emotion group is not required: it can be empty.
  let emotions: StoredOption[] = [];
  for (const key of ['happy', 'neutral', 'sad', 'angry', 'unamused']) emotions = need(setHidden(standardCtx, emotions, 'emotion', key, true));
  assert.deepEqual(keys(standardCtx, emotions, 'emotion'), []);
  assert.deepEqual(emptyRequiredGroups(view(standardCtx, emotions)), []);
  const none = need(['female', 'male', 'unsure'].reduce<EditResult>((acc, key) => (acc.ok ? setHiddenUnchecked(acc.options, key) : acc), { ok: true, options: [] }));
  assert.deepEqual(emptyRequiredGroups(view(standardCtx, none)), ['gender'], 'a list that leaves a required group empty is found, for the API to refuse');
});

/** The three genders hidden in one go, as a hand-made request would: the step refuses the last one, so the entries are written directly. */
function setHiddenUnchecked(options: StoredOption[], key: string): EditResult {
  return settle(standardCtx, [...options, { group: 'gender', key, hidden: true }]);
}

test('moveOption swaps neighbours: two entries at most, nothing at the ends, and moving back stores nothing', () => {
  const up = need(moveOption(standardCtx, [], 'merch', 'scarf', 'up'));
  assert.deepEqual(keys(standardCtx, up, 'merch'), ['scarf', 'jersey', 'cap', 'flag']);
  assert.equal(up.length, 2, 'only the two options that changed place are stored');
  const down = need(moveOption(standardCtx, up, 'merch', 'scarf', 'down'));
  assert.deepEqual(down, [], 'back in the standard order the level stores nothing');
  assert.deepEqual(need(moveOption(standardCtx, [], 'merch', 'jersey', 'up')), [], 'the first cannot go up');
  const last = need(moveOption(standardCtx, [], 'merch', 'banner', 'down'));
  assert.deepEqual(last, [], 'the last cannot go down');
  assert.match(reason(moveOption(standardCtx, [], 'merch', 'nope', 'up')), /does not exist/);
});

test('moveOption moves across hidden options (they are in the list) and keeps going over a whole group', () => {
  let options: StoredOption[] = [];
  for (let i = 0; i < 5; i += 1) options = need(moveOption(standardCtx, options, 'reject_reason', 'other', 'up'));
  const all = keys(standardCtx, options, 'reject_reason', { all: true });
  assert.equal(all.indexOf('other'), 12 - 1 - 5);
  assert.deepEqual([...all].sort(), STANDARD_VOCABULARY.options.filter((o) => o.group === 'reject_reason').map((o) => o.key).sort(), 'nothing is lost or repeated');
});

test('moveOption with equal orders (a tie) still moves exactly one place', () => {
  const ctx = standardCtx;
  // Two options with the same order, sorted by their words; moving the second up must put it first.
  const tied: StoredOption[] = [{ group: 'merch', key: 'scarf', order: 0 }];
  assert.deepEqual(keys(ctx, tied, 'merch').slice(0, 2), ['jersey', 'scarf'], 'jersey and scarf tie at 0, jersey sorts first by its words');
  const moved = need(moveOption(ctx, tied, 'merch', 'scarf', 'up'));
  assert.deepEqual(keys(ctx, moved, 'merch'), ['scarf', 'jersey', 'cap', 'flag']);
});

test('moveOption of an option added at this level, and of one a level above added', () => {
  const general = { options: [{ group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] };
  const ctx = eventCtx(general);
  const withOwn = need(addCustom(ctx, [], 'merch', 'Vasas scarf'));
  assert.deepEqual(keys(ctx, withOwn, 'merch'), ['jersey', 'scarf', 'cap', 'flag', 'club_flag', 'vasas_scarf']);
  const movedOwn = need(moveOption(ctx, withOwn, 'merch', 'vasas_scarf', 'up'));
  assert.deepEqual(keys(ctx, movedOwn, 'merch'), ['jersey', 'scarf', 'cap', 'flag', 'vasas_scarf', 'club_flag']);
  // The option from above was moved too, so its entry carries custom and its words: the store asks for both.
  const inherited = movedOwn.find((o) => o.key === 'club_flag');
  assert.ok(inherited?.custom === true && inherited.label === 'Club flag' && typeof inherited.order === 'number');
  const reset = need(resetOption(ctx, movedOwn, 'merch', 'club_flag'));
  assert.ok(!reset.some((o) => o.key === 'club_flag'));
});

test('addCustom makes the key from the name, unique among every key the level knows (the levels above and the hidden ones too), and returns it', () => {
  const general = { options: [{ group: 'merch', key: 'club_flag', label: 'Club flag', custom: true, hidden: true }] };
  const ctx = eventCtx(general);
  const first = addCustom(ctx, [], 'merch', ' Vasas   scarf ');
  assert.ok(first.ok);
  assert.equal(first.ok && first.key, 'vasas_scarf');
  assert.deepEqual(first.ok && first.options, [{ group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true }]);
  // "Club-flag" is not the same words as "Club flag" but makes the same key: the key of the hidden option above is taken.
  const second = addCustom(ctx, first.ok ? first.options : [], 'merch', 'Club-flag');
  assert.equal(second.ok && second.key, 'club_flag_2');
  // A name that is a standard key still gets a key of its own, and the same words as a standard option are refused.
  assert.match(reason(addCustom(ctx, [], 'merch', 'scarf')), /already has an option called Scarf/);
  const cap = addCustom(ctx, [], 'merch', 'Cap and hat');
  assert.equal(cap.ok && cap.key, 'cap_and_hat');
  const named = addCustom(ctx, [], 'emotion', 'Excited');
  assert.equal(named.ok && named.key, 'excited_2', 'the key of the standard recommended addition is taken even though it is off');
  assert.ok(parseStoredVocabulary({ options: first.ok ? first.options : [] }).ok);
});

test('addCustom refuses a hidden twin (show it again instead), too many options and a bad name', () => {
  const ctx = standardCtx;
  assert.match(reason(addCustom(ctx, [], 'emotion', 'excited, cheering')), /hidden: show it again instead/, 'the words of a hidden standard option, in any case');
  assert.match(reason(addCustom(ctx, [], 'merch', '')), /name/);
  assert.match(reason(addCustom(ctx, [], 'merch', 'Banner 🚩')), /emoji/);
  let options: StoredOption[] = [];
  for (let i = 0; i < 34; i += 1) options = need(addCustom(ctx, options, 'merch', `Extra ${i}`));
  assert.match(reason(addCustom(ctx, options, 'merch', 'One too many')), /at most 40/);
  assert.equal(options.length, 34);
});

test('deleteCustom hides an option added here for good (key and label kept), setHidden brings it back; options from above can only be hidden', () => {
  const general = { options: [{ group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] };
  const ctx = eventCtx(general);
  const added = need(addCustom(ctx, [], 'merch', 'Vasas scarf'));
  const deleted = need(deleteCustom(ctx, added, 'merch', 'vasas_scarf'));
  assert.deepEqual(deleted, [{ group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true, hidden: true }]);
  const resolved = view(ctx, deleted);
  const option = resolved.options.find((o) => o.key === 'vasas_scarf')!;
  assert.ok(isAddedHere(ctx, option) && isDeletedHere(ctx, option));
  assert.ok(!keys(ctx, deleted, 'merch').includes('vasas_scarf'));
  assert.equal(sourceOf(ctx, option), 'Added here');
  // Deleted options leave the order the group is shown in, and their name can be used again by an option that is not deleted.
  const again = addCustom(ctx, deleted, 'merch', 'Vasas scarf');
  assert.equal(again.ok && again.key, 'vasas_scarf_2', 'the words of a deleted option can be used again, and the new option gets a key of its own: the old key keeps its meaning');
  const restored = need(setHidden(ctx, deleted, 'merch', 'vasas_scarf', false));
  assert.deepEqual(restored, added);
  assert.match(reason(deleteCustom(ctx, [], 'merch', 'scarf')), /Only an option added at this level/);
  assert.match(reason(deleteCustom(ctx, [], 'merch', 'club_flag')), /Only an option added at this level/);
  // The option from above is hidden here instead: an entry with custom and its words.
  const hiddenAbove = need(setHidden(ctx, [], 'merch', 'club_flag', true));
  assert.deepEqual(hiddenAbove, [{ group: 'merch', key: 'club_flag', label: 'Club flag', custom: true, hidden: true }]);
  assert.equal(overridesAbove(ctx, hiddenAbove, 'merch', 'club_flag'), true);
  const above = view(ctx, hiddenAbove).options.find((o) => o.key === 'club_flag')!;
  assert.equal(above.active, false);
  assert.equal(sourceOf(ctx, above), 'Event', 'what is shown is set by this level');
  assert.deepEqual(need(resetOption(ctx, hiddenAbove, 'merch', 'club_flag')), []);
});

test('resetOption removes this level\'s changes to an option so it follows the level above; an option added here has nothing above to follow', () => {
  const ctx = partnerCtx({ options: [{ group: 'age', key: 'kid', label: 'Child' }] });
  let options: StoredOption[] = need(setLabel(ctx, [], 'age', 'kid', 'Little one'));
  options = need(setHidden(ctx, options, 'age', 'kid', true));
  options = need(setHidden(ctx, options, 'age', 'old', true));
  assert.equal(options.length, 2);
  assert.equal(overridesAbove(ctx, options, 'age', 'kid'), true);
  const reset = need(resetOption(ctx, options, 'age', 'kid'));
  assert.deepEqual(reset, [{ group: 'age', key: 'old', hidden: true }]);
  assert.equal(overridesAbove(ctx, reset, 'age', 'kid'), false);
  assert.equal(view(ctx, reset).options.find((o) => o.key === 'kid')?.label, 'Child', 'it follows the general level again');
  const added = need(addCustom(ctx, [], 'age', 'Teenager'));
  assert.match(reason(resetOption(ctx, added, 'age', 'teenager')), /nothing above to follow/);
});

test('the source of each option in words: Standard, the level that changed it, or Added here', () => {
  const general = { options: [{ group: 'merch', key: 'cap', label: 'Hat' }, { group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] };
  const partner = { options: [{ group: 'merch', key: 'scarf', hidden: true }] };
  const ctx = eventCtx(general, partner);
  const own = need(addCustom(ctx, [], 'merch', 'Vasas scarf'));
  const label = (key: string) => sourceOf(ctx, view(ctx, own).options.find((o) => o.key === key)!);
  assert.equal(label('jersey'), 'Standard');
  assert.equal(label('cap'), 'General');
  assert.equal(label('scarf'), 'Partner');
  assert.equal(label('club_flag'), 'General');
  assert.equal(label('vasas_scarf'), 'Added here');
});

test('whatever a step returns passes the store\'s own check and resolves the way the server will: a run of random steps at each level', () => {
  let seed = 1234567;
  const random = (n: number) => {
    // mulberry32: the low bits of a plain congruential generator repeat with a short period, which would leave some steps never tried.
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) % n);
  };
  const upper = { options: [{ group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }, { group: 'emotion', key: 'excited', hidden: false }, { group: 'age', key: 'kid', label: 'Child' }] };
  for (const [name, ctx] of [['general', standardCtx], ['partner', partnerCtx(upper)], ['event', eventCtx(upper, { options: [{ group: 'merch', key: 'banner', hidden: false }] })]] as const) {
    let options: StoredOption[] = [];
    const accepted = new Set<number>();
    for (let step = 0; step < 300; step += 1) {
      const resolved = view(ctx, options);
      const group = VOCAB_GROUPS[random(VOCAB_GROUPS.length)];
      const inGroup = resolved.options.filter((o) => o.group === group);
      const pick = inGroup[random(inGroup.length)];
      const action = random(6);
      const result =
        action === 0 ? setLabel(ctx, options, group, pick.key, `Word ${random(6)}`)
        : action === 1 ? setHidden(ctx, options, group, pick.key, random(2) === 0)
        : action === 2 ? moveOption(ctx, options, group, pick.key, random(2) === 0 ? 'up' : 'down')
        : action === 3 ? addCustom(ctx, options, group, `New ${random(8)}`)
        : action === 4 ? deleteCustom(ctx, options, group, pick.key)
        : resetOption(ctx, options, group, pick.key);
      if (!result.ok) continue;
      accepted.add(action);
      assert.ok(parseStoredVocabulary({ options: result.options }).ok, `${name} step ${step}`);
      assert.deepEqual(settle(ctx, result.options), { ok: true, options: result.options }, 'settled is stable: nothing stored equals the level above');
      options = result.options;
      // Every key is still known afterwards (nothing is ever lost), and each required group still has something offered or was refused.
      for (const o of resolved.options) assert.ok(view(ctx, options).options.some((n) => n.group === o.group && n.key === o.key), `${o.group}:${o.key} was lost`);
      assert.deepEqual(emptyRequiredGroups(view(ctx, options)), [], `${name} step ${step}`);
    }
    assert.deepEqual([...accepted].sort(), [0, 1, 2, 3, 4, 5], `${name}: every kind of step was accepted at least once`);
  }
});

test('an option an editor never touched is not stored, and what the server resolves equals what the editor shows', () => {
  const ctx = eventCtx({ options: [{ group: 'merch', key: 'cap', label: 'Hat' }] }, { options: [{ group: 'merch', key: 'scarf', hidden: true }] });
  let options: StoredOption[] = need(setLabel(ctx, [], 'merch', 'jersey', 'Club shirt'));
  options = need(addCustom(ctx, options, 'merch', 'Vasas scarf'));
  options = need(moveOption(ctx, options, 'merch', 'vasas_scarf', 'up'));
  const shown = view(ctx, options);
  const server = resolveVocabulary({ general: { options: [{ group: 'merch', key: 'cap', label: 'Hat' }] }, partner: { options: [{ group: 'merch', key: 'scarf', hidden: true }] }, event: { options } });
  assert.deepEqual(shown, server);
});
