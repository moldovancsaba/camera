/**
 * Editing one level of the annotation vocabulary (issue 628, lib/photo-vetting/vocabulary.ts): the pure steps an editor takes on the options a level stores, the same at the general level, a
 * partner and an event. Each step takes the level's stored options and gives back a new list (or says why it cannot): the originals are never changed.
 *
 * The rules, so every editor and the API agree:
 * - A level stores **only what differs from the level above** (nothing is copied down): a label, an order or a hidden state equal to the parent's is dropped, and an option that no longer
 *   differs is not stored at all. An editor that clears an override therefore just removes the entry (`resetOption`: "follow the level above").
 * - **Delete means hide.** An option added at this level (`custom`) is deleted by hiding it; it keeps its key and label, so a photo marked with it still reads and counts, and it can be restored.
 *   The standard options and the ones a level above added can be hidden here but never deleted.
 * - The **key** of an option is its permanent meaning: a new option gets a key made from its name that is unique among every key the level knows (the parents' too, hidden ones included), and no
 *   step ever changes a key.
 * - Whatever a step returns passes `parseStoredVocabulary`, so it can always be saved.
 *
 * `ctx.parent` is the list as the level above shows it (the standard list for the general level; the general level over it for a partner; the partner's over that for an event).
 */

import {
  GROUPS,
  MAX_LABEL_LENGTH,
  MAX_OPTIONS_PER_GROUP,
  MAX_OPTIONS_PER_LEVEL,
  VOCAB_GROUPS,
  keyForCustomOption,
  optionsOf,
  parseStoredVocabulary,
  resolveOver,
  type EditableLevel,
  type ResolvedVocabulary,
  type StoredOption,
  type VocabGroup,
  type VocabLevel,
  type VocabOption,
} from './vocabulary';

export interface EditContext {
  level: EditableLevel;
  /** The list as the level above shows it, hidden options included. */
  parent: ResolvedVocabulary;
}

export type EditResult = { ok: true; options: StoredOption[]; /** The key a new option got (addCustom). */ key?: string } | { ok: false; reason: string };

const refuse = (reason: string): EditResult => ({ ok: false, reason });

export const LEVEL_NAMES: Record<VocabLevel, string> = { standard: 'Standard', general: 'General', partner: 'Partner', event: 'Event' };

/** Emoji, flags, joiners and keycaps: the labels are plain words (they name the counters and the training labels), so none of these is accepted. */
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}‍️⃣]/u;

export type CheckedLabel = { ok: true; label: string } | { ok: false; reason: string };

/** A label as it will be stored: plain words, one space between words, 1 to 60 characters, no `<` or `>`, no control characters and no emoji. */
export function checkLabel(input: unknown): CheckedLabel {
  if (typeof input !== 'string') return { ok: false, reason: 'Write a name for it.' };
  const label = input.replace(/\s+/g, ' ').trim();
  if (!label) return { ok: false, reason: 'Write a name for it.' };
  if (label.length > MAX_LABEL_LENGTH) return { ok: false, reason: `At most ${MAX_LABEL_LENGTH} characters.` };
  if (/[<>]/.test(label)) return { ok: false, reason: 'Plain text only: no < or >.' };
  if (/[\u0000-\u001f\u007f-\u009f]/.test(label)) return { ok: false, reason: 'Plain text only.' };
  if (EMOJI.test(label)) return { ok: false, reason: 'Plain words only: no emoji.' };
  return { ok: true, label };
}

const viewOf = (ctx: EditContext, options: readonly StoredOption[]): ResolvedVocabulary => resolveOver(ctx.parent, ctx.level, { options });
const above = (ctx: EditContext, group: VocabGroup, key: string): VocabOption | undefined => ctx.parent.options.find((o) => o.group === group && o.key === key);
const same = (option: StoredOption, group: VocabGroup, key: string) => option.group === group && option.key === key;

/** An option this level created itself: custom, and nothing above knows its key. */
export const isAddedHere = (ctx: EditContext, option: VocabOption): boolean => option.custom && !above(ctx, option.group, option.key);

/** An option added here and hidden: the "deleted" list of the editor, from where it can be restored. */
export const isDeletedHere = (ctx: EditContext, option: VocabOption): boolean => isAddedHere(ctx, option) && !option.active;

/** Where the value shown for an option comes from, in words: the level that set it, or "Added here" for an option this level created. */
export function sourceOf(ctx: EditContext, option: VocabOption): string {
  return isAddedHere(ctx, option) ? 'Added here' : LEVEL_NAMES[option.level];
}

/** Whether this level changes something about an option the levels above have (so "Follow the level above" has something to clear). */
export const overridesAbove = (ctx: EditContext, options: readonly StoredOption[], group: VocabGroup, key: string): boolean => Boolean(above(ctx, group, key)) && options.some((o) => same(o, group, key));

/** The groups that must have at least one offered option (a person cannot be saved without gender or age, a photo cannot be rejected without a reason) and have none. */
export function emptyRequiredGroups(resolved: ResolvedVocabulary): VocabGroup[] {
  return VOCAB_GROUPS.filter((group) => GROUPS[group].required && optionsOf(resolved, group).length === 0);
}

/**
 * The stored options with everything that equals the level above taken out, and checked against what the store accepts. An option of the level's own is kept whole (`hidden: false` is the
 * default, so it is not written); an option that exists above keeps only the fields that differ, and when none does it is not kept. The entry for an option a level above added carries
 * `custom` and a label, because the store asks for both of a custom option.
 */
export function settle(ctx: EditContext, entries: readonly StoredOption[]): EditResult {
  const out: StoredOption[] = [];
  for (const entry of entries) {
    const parent = above(ctx, entry.group, entry.key);
    if (!parent) {
      out.push({ group: entry.group, key: entry.key, ...(entry.label !== undefined ? { label: entry.label } : {}), ...(entry.order !== undefined ? { order: entry.order } : {}), ...(entry.hidden === true ? { hidden: true } : {}), ...(entry.custom === true ? { custom: true as const } : {}) });
      continue;
    }
    const next: StoredOption = { group: entry.group, key: entry.key };
    if (entry.label !== undefined && entry.label !== parent.label) next.label = entry.label;
    if (entry.order !== undefined && entry.order !== parent.order) next.order = entry.order;
    if (entry.hidden !== undefined && entry.hidden !== !parent.active) next.hidden = entry.hidden;
    if (next.label === undefined && next.order === undefined && next.hidden === undefined) continue;
    if (parent.custom) {
      next.custom = true;
      next.label ??= parent.label;
    }
    out.push(next);
  }
  const parsed = parseStoredVocabulary({ options: out });
  return parsed.ok ? { ok: true, options: parsed.value.options } : refuse(parsed.reason);
}

/** The list with one option's entry changed (made from nothing when the option has none yet). */
function change(options: readonly StoredOption[], group: VocabGroup, key: string, edit: (entry: StoredOption) => StoredOption): StoredOption[] {
  const index = options.findIndex((o) => same(o, group, key));
  if (index < 0) return [...options, edit({ group, key })];
  return options.map((o, i) => (i === index ? edit({ ...o }) : o));
}

/** A name that another option of the group (not deleted) already has, ignoring case: two buttons with the same words would be the same to the person who vets. */
function nameTaken(ctx: EditContext, view: ResolvedVocabulary, group: VocabGroup, key: string | null, label: string): VocabOption | undefined {
  const wanted = label.toLocaleLowerCase();
  return view.options.find((o) => o.group === group && o.key !== key && !isDeletedHere(ctx, o) && o.label.toLocaleLowerCase() === wanted);
}

/** Changes the words on an option. A label equal to the one above is not stored (the option follows its parent's words again). */
export function setLabel(ctx: EditContext, options: readonly StoredOption[], group: VocabGroup, key: string, label: string): EditResult {
  const checked = checkLabel(label);
  if (!checked.ok) return refuse(checked.reason);
  const view = viewOf(ctx, options);
  if (!view.options.some((o) => o.group === group && o.key === key)) return refuse('That option does not exist.');
  const clash = nameTaken(ctx, view, group, key, checked.label);
  if (clash) return refuse(`Another option of ${GROUPS[group].label} is already called ${clash.label}.`);
  return settle(ctx, change(options, group, key, (entry) => ({ ...entry, label: checked.label })));
}

/**
 * Offers an option to the vetting person (`hidden: false`) or hides it. Hiding changes nothing in the photos already marked with it. A group that is required keeps at least one offered
 * option: with none, a person (or a rejected photo) could not be saved at all.
 */
export function setHidden(ctx: EditContext, options: readonly StoredOption[], group: VocabGroup, key: string, hidden: boolean): EditResult {
  if (!viewOf(ctx, options).options.some((o) => o.group === group && o.key === key)) return refuse('That option does not exist.');
  const result = settle(ctx, change(options, group, key, (entry) => ({ ...entry, hidden })));
  if (!result.ok || !hidden) return result;
  if (GROUPS[group].required && optionsOf(viewOf(ctx, result.options), group).length === 0) return refuse(`At least one option of ${GROUPS[group].label} must stay offered, because ${GROUPS[group].about === 'person' ? 'a person cannot be saved without one' : 'a photo cannot be rejected without one'}.`);
  return result;
}

/** Deletes an option added at this level: it is hidden for good, keeps its key and label, and can be restored. An option from above can only be hidden. */
export function deleteCustom(ctx: EditContext, options: readonly StoredOption[], group: VocabGroup, key: string): EditResult {
  const option = viewOf(ctx, options).options.find((o) => o.group === group && o.key === key);
  if (!option || !isAddedHere(ctx, option)) return refuse('Only an option added at this level can be deleted. Hide the others instead.');
  return setHidden(ctx, options, group, key, true);
}

/** Moves an option one place up or down in the order its group is shown in (the options deleted at this level are not in that order). At either end nothing changes. */
export function moveOption(ctx: EditContext, options: readonly StoredOption[], group: VocabGroup, key: string, direction: 'up' | 'down'): EditResult {
  const list = viewOf(ctx, options).options.filter((o) => o.group === group && !isDeletedHere(ctx, o));
  const from = list.findIndex((o) => o.key === key);
  if (from < 0) return refuse('That option does not exist.');
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= list.length) return { ok: true, options: [...options] };
  const wanted = list.map((o) => o.key);
  [wanted[from], wanted[to]] = [wanted[to], wanted[from]];
  // First try to swap the two places (two entries at most); when ties in the order make that ambiguous, number the whole group.
  const attempts: Array<Array<[string, number]>> = [
    [[list[from].key, list[to].order], [list[to].key, list[from].order]],
    wanted.map((k, i): [string, number] => [k, i * 10]),
  ];
  for (const orders of attempts) {
    let next: readonly StoredOption[] = options;
    for (const [k, order] of orders) next = change(next, group, k, (entry) => ({ ...entry, order }));
    const settled = settle(ctx, next);
    if (!settled.ok) return settled;
    const sequence = viewOf(ctx, settled.options).options.filter((o) => o.group === group && !isDeletedHere(ctx, o)).map((o) => o.key);
    if (sequence.join() === wanted.join()) return settled;
  }
  return refuse('The order could not be changed.');
}

/** Adds an option of this level's own. Its key is made from its name and is unique among every key the level knows, the levels above and the hidden ones included; the result carries it as `key`. */
export function addCustom(ctx: EditContext, options: readonly StoredOption[], group: VocabGroup, label: string): EditResult {
  const checked = checkLabel(label);
  if (!checked.ok) return refuse(checked.reason);
  const view = viewOf(ctx, options);
  const clash = nameTaken(ctx, view, group, null, checked.label);
  if (clash) return refuse(`${GROUPS[group].label} already has an option called ${clash.label}${clash.active ? '' : ' (hidden: show it again instead)'}.`);
  if (view.options.filter((o) => o.group === group).length >= MAX_OPTIONS_PER_GROUP) return refuse(`${GROUPS[group].label} can have at most ${MAX_OPTIONS_PER_GROUP} options.`);
  if (options.length >= MAX_OPTIONS_PER_LEVEL) return refuse(`A level can change at most ${MAX_OPTIONS_PER_LEVEL} options.`);
  const key = keyForCustomOption(checked.label, view, group);
  const settled = settle(ctx, [...options, { group, key, label: checked.label, custom: true }]);
  return settled.ok ? { ...settled, key } : settled;
}

/** Takes this level's changes to one option away, so it follows the level above again (the words, the order and whether it is offered). */
export function resetOption(ctx: EditContext, options: readonly StoredOption[], group: VocabGroup, key: string): EditResult {
  if (!above(ctx, group, key)) return refuse('An option added at this level has nothing above to follow. Delete it instead.');
  return settle(ctx, options.filter((o) => !same(o, group, key)));
}
