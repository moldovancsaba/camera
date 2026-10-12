/**
 * The words the vetting person describes a photo with (issue 628, owner request 2026-10-12): who is in it (gender, age), how they look (emotion), what they wear or hold (items) and, for a
 * photo that is rejected, why. Plain words, no emoji. The list is **configurable at three levels, like every other function of the service**: the standard list below (in code), then the
 * **general** level (a global admin), the **partner** and the **event**; the nearest level wins and nothing is copied down (the brick model, docs/BUILDING_BRICKS.md). A level stores only what
 * its editor changed.
 *
 * What a level can do (the CRUD): **create** an option of its own (a custom option, with a key made from its name), **read** the list as the level sees it, **update** a label or the order, hide
 * or restore any option, and **delete** a custom option, which hides it for good. Nothing is ever removed from the data: a photo marked with an option keeps its key, so a hidden or deleted
 * option still counts in the analytics and still reads in the photo it was given to. The standard options can be hidden and relabelled but never deleted or given another meaning.
 *
 * Why keys: the **key** is the meaning (`female`, `scarf`, `nudity`). It never changes, it is what is stored with the photo, what the counters for messmass are named from
 * (`camera_gender_female`) and what any later training set will be labelled with. The label is only the words on the screen. Each annotation records the **version** of the list it was made with
 * (`vocabularyVersion`: the active keys), so annotations made with different lists can be told apart.
 *
 * Pure and free of the database and of the browser; unit-tested (vocabulary.test.ts). The database side is vocabulary-load.ts.
 */

export const VOCAB_GROUPS = ['gender', 'age', 'emotion', 'merch', 'reject_reason'] as const;
export type VocabGroup = (typeof VOCAB_GROUPS)[number];

export interface GroupInfo {
  label: string;
  /** What the vetting person is asked, in words. */
  question: string;
  /** One choice or several. */
  multiple: boolean;
  /** A person cannot be saved without it (gender, age) / a photo cannot be rejected without it (the reason). */
  required: boolean;
  /** Describes each person in the photo, or the photo as a whole. */
  about: 'person' | 'photo';
}

export const GROUPS: Record<VocabGroup, GroupInfo> = {
  gender: { label: 'Gender', question: 'Gender, as the person looks in the photo', multiple: false, required: true, about: 'person' },
  age: { label: 'Age', question: 'Age, as the person looks in the photo', multiple: false, required: true, about: 'person' },
  emotion: { label: 'Emotion', question: 'How the person looks', multiple: false, required: false, about: 'person' },
  merch: { label: 'Items', question: 'What the person wears or holds', multiple: true, required: false, about: 'person' },
  reject_reason: { label: 'Reason', question: 'Why the photo is rejected', multiple: true, required: true, about: 'photo' },
};

export interface StandardOption {
  group: VocabGroup;
  key: string;
  label: string;
  /** On in the standard list. The ones that are off are recommended additions: an editor switches them on. */
  enabled: boolean;
  /** The messmass variable that already counts the same idea from another source (for the shortlist only; camera never writes to it, its own counter is `camera_...`). */
  messmass?: string;
}

/** The standard list, in the order the screens show it. The keys of the first four groups are the ones stored since issue 542, so every photo marked before keeps its meaning. */
export const STANDARD_OPTIONS: readonly StandardOption[] = [
  { group: 'gender', key: 'female', label: 'Female', enabled: true, messmass: 'female' },
  { group: 'gender', key: 'male', label: 'Male', enabled: true, messmass: 'male' },
  { group: 'gender', key: 'unsure', label: 'Not sure', enabled: true },

  { group: 'age', key: 'kid', label: 'Child (about 0 to 12)', enabled: true, messmass: 'genAlpha' },
  { group: 'age', key: 'young', label: 'Young (about 13 to 24)', enabled: true, messmass: 'genYZ' },
  { group: 'age', key: 'adult', label: 'Adult (about 25 to 59)', enabled: true, messmass: 'genX' },
  { group: 'age', key: 'old', label: 'Senior (about 60 and over)', enabled: true, messmass: 'boomer' },

  { group: 'emotion', key: 'happy', label: 'Happy', enabled: true },
  { group: 'emotion', key: 'neutral', label: 'Neutral', enabled: true },
  { group: 'emotion', key: 'sad', label: 'Sad', enabled: true },
  { group: 'emotion', key: 'angry', label: 'Angry', enabled: true },
  { group: 'emotion', key: 'unamused', label: 'Unamused', enabled: true },
  { group: 'emotion', key: 'excited', label: 'Excited, cheering', enabled: false },
  { group: 'emotion', key: 'surprised', label: 'Surprised', enabled: false },

  { group: 'merch', key: 'jersey', label: 'Jersey or shirt', enabled: true, messmass: 'jersey' },
  { group: 'merch', key: 'scarf', label: 'Scarf', enabled: true, messmass: 'scarf' },
  { group: 'merch', key: 'cap', label: 'Cap or hat', enabled: true, messmass: 'baseballCap' },
  { group: 'merch', key: 'flag', label: 'Flag', enabled: true, messmass: 'flags' },
  { group: 'merch', key: 'face_paint', label: 'Face paint', enabled: false },
  { group: 'merch', key: 'banner', label: 'Banner or sign', enabled: false },

  { group: 'reject_reason', key: 'offensive_gesture', label: 'Offensive hand gesture', enabled: true },
  { group: 'reject_reason', key: 'nudity', label: 'Nudity or sexual content', enabled: true },
  { group: 'reject_reason', key: 'alcohol', label: 'Alcohol', enabled: true },
  { group: 'reject_reason', key: 'forbidden', label: 'Other forbidden content', enabled: true },
  { group: 'reject_reason', key: 'violence', label: 'Violence or weapons', enabled: true },
  { group: 'reject_reason', key: 'hate', label: 'Hate symbol or offensive text', enabled: true },
  { group: 'reject_reason', key: 'drugs', label: 'Drugs or smoking', enabled: true },
  { group: 'reject_reason', key: 'competitor_brand', label: 'Competitor or unwanted brand', enabled: true },
  { group: 'reject_reason', key: 'political', label: 'Political message', enabled: true },
  { group: 'reject_reason', key: 'poor_quality', label: 'Unusable: blurry, dark or no face', enabled: true },
  { group: 'reject_reason', key: 'spam_test', label: 'Test, spam or not a selfie', enabled: true },
  { group: 'reject_reason', key: 'other', label: 'Other (write it in the note)', enabled: true },
];

export type VocabLevel = 'standard' | 'general' | 'partner' | 'event';

/** What one level stores for one option: only what the editor changed. */
export interface StoredOption {
  group: VocabGroup;
  key: string;
  label?: string;
  order?: number;
  /** Not offered for new photos. The option stays valid in every photo that has it. */
  hidden?: boolean;
  /** An option of this level's own, not in the standard list. */
  custom?: true;
}

export interface StoredVocabulary {
  options: StoredOption[];
}

export interface VocabOption {
  group: VocabGroup;
  key: string;
  label: string;
  order: number;
  /** Offered to the vetting person now. An option that is not active is still known: photos marked with it read and count as before. */
  active: boolean;
  custom: boolean;
  /** The level that set what is shown (standard when nobody changed it) and the level an option was created at. */
  level: VocabLevel;
  /** The same idea as a standard messmass variable, when there is one. */
  messmass?: string;
}

export interface ResolvedVocabulary {
  options: VocabOption[];
  /** The active keys of every group, as a short code: two annotations made with the same list carry the same version. */
  version: string;
}

export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const MAX_LABEL_LENGTH = 60;
export const MAX_OPTIONS_PER_LEVEL = 60;
export const MAX_OPTIONS_PER_GROUP = 40;
const MAX_ORDER = 10_000;

const isGroup = (value: unknown): value is VocabGroup => typeof value === 'string' && (VOCAB_GROUPS as readonly string[]).includes(value);
const standardKeys = (group: VocabGroup) => new Set(STANDARD_OPTIONS.filter((option) => option.group === group).map((option) => option.key));

export type ParsedStored = { ok: true; value: StoredVocabulary } | { ok: false; reason: string };

/**
 * What a level may store. Strict, for the write side: a list of at most 60 options, each with a known group and a key of lower case letters, digits and underscores; a label of 1 to 60
 * characters, an order, hidden and custom are optional; nothing else. A `custom` option must not use a standard key of its group, and a standard key must not be marked custom. The same
 * option twice is refused.
 */
export function parseStoredVocabulary(input: unknown): ParsedStored {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as { options?: unknown }) : null;
  if (!raw || !Array.isArray(raw.options)) return { ok: false, reason: 'The vocabulary needs a list of options.' };
  if (raw.options.length > MAX_OPTIONS_PER_LEVEL) return { ok: false, reason: `A level can change at most ${MAX_OPTIONS_PER_LEVEL} options.` };
  const seen = new Set<string>();
  const options: StoredOption[] = [];
  for (const [index, item] of raw.options.entries()) {
    const at = `Option ${index + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: `${at} is not an object.` };
    const { group, key, label, order, hidden, custom, ...rest } = item as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return { ok: false, reason: `${at} has an unknown field: ${Object.keys(rest)[0]}.` };
    if (!isGroup(group)) return { ok: false, reason: `${at} has an unknown group.` };
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) return { ok: false, reason: `${at} needs a key of lower case letters, digits and underscores, starting with a letter.` };
    const id = `${group}:${key}`;
    if (seen.has(id)) return { ok: false, reason: `${at} repeats ${id}.` };
    seen.add(id);
    const isStandard = standardKeys(group).has(key);
    if (custom !== undefined && custom !== true) return { ok: false, reason: `${at}: custom can only be true.` };
    if (custom === true && isStandard) return { ok: false, reason: `${at}: ${key} is a standard option, not a custom one.` };
    if (custom !== true && !isStandard) return { ok: false, reason: `${at}: ${key} is not a standard option; a new option must be custom.` };
    if (custom === true && (typeof label !== 'string' || !label.trim())) return { ok: false, reason: `${at} needs a label.` };
    if (label !== undefined && (typeof label !== 'string' || !label.trim() || label.trim().length > MAX_LABEL_LENGTH)) return { ok: false, reason: `${at}: the label must be 1 to ${MAX_LABEL_LENGTH} characters.` };
    if (order !== undefined && (typeof order !== 'number' || !Number.isInteger(order) || order < -MAX_ORDER || order > MAX_ORDER)) return { ok: false, reason: `${at}: the order must be a whole number.` };
    if (hidden !== undefined && typeof hidden !== 'boolean') return { ok: false, reason: `${at}: hidden must be true or false.` };
    options.push({
      group,
      key,
      ...(typeof label === 'string' ? { label: label.trim() } : {}),
      ...(typeof order === 'number' ? { order } : {}),
      ...(typeof hidden === 'boolean' ? { hidden } : {}),
      ...(custom === true ? { custom: true as const } : {}),
    });
  }
  return { ok: true, value: { options } };
}

/** A level as stored, read leniently: what is not valid is left out, so a damaged value never takes the vetting screen down (the editors read a level the same way). */
export function readStored(input: unknown): StoredOption[] {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as { options?: unknown }).options : null;
  if (!Array.isArray(raw)) return [];
  const out: StoredOption[] = [];
  for (const item of raw.slice(0, MAX_OPTIONS_PER_LEVEL)) {
    const checked = parseStoredVocabulary({ options: [item] });
    if (checked.ok) out.push(checked.value.options[0]);
  }
  return out;
}

/** A short code of the active keys (FNV-1a), the same on the server and in the browser. */
function versionOf(options: readonly VocabOption[]): string {
  const text = options
    .filter((option) => option.active)
    .map((option) => `${option.group}:${option.key}`)
    .sort()
    .join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `v${hash.toString(16).padStart(8, '0')}`;
}

/** The levels an editor can change: everything above the standard list, which is code. */
export type EditableLevel = Exclude<VocabLevel, 'standard'>;

/** The standard list as a map of `group:key`, in the order the screens show it. */
function standardMap(): Map<string, VocabOption> {
  const map = new Map<string, VocabOption>();
  const counters = new Map<VocabGroup, number>();
  for (const standard of STANDARD_OPTIONS) {
    const position = counters.get(standard.group) ?? 0;
    counters.set(standard.group, position + 1);
    map.set(`${standard.group}:${standard.key}`, { group: standard.group, key: standard.key, label: standard.label, order: position * 10, active: standard.enabled, custom: false, level: 'standard', ...(standard.messmass ? { messmass: standard.messmass } : {}) });
  }
  return map;
}

/** One level over the list below it: a stored option with a known key changes its label, order or hidden state; a custom option is added to the list from this level down. */
function applyLevel(map: Map<string, VocabOption>, level: EditableLevel, stored: unknown): void {
  for (const option of readStored(stored)) {
    const id = `${option.group}:${option.key}`;
    const existing = map.get(id);
    if (existing) {
      map.set(id, {
        ...existing,
        ...(option.label ? { label: option.label } : {}),
        ...(typeof option.order === 'number' ? { order: option.order } : {}),
        ...(typeof option.hidden === 'boolean' ? { active: !option.hidden } : {}),
        level,
      });
    } else if (option.custom && option.label) {
      const inGroup = [...map.values()].filter((o) => o.group === option.group).length;
      if (inGroup >= MAX_OPTIONS_PER_GROUP) continue;
      map.set(id, { group: option.group, key: option.key, label: option.label, order: typeof option.order === 'number' ? option.order : 1000 + inGroup, active: option.hidden !== true, custom: true, level });
    }
  }
}

/** The map as the list screens read it: in order within each group (then by label, then by key, so two options never swap places between two runs), with its version. */
function finish(map: Map<string, VocabOption>): ResolvedVocabulary {
  const options = [...map.values()].sort((a, b) => VOCAB_GROUPS.indexOf(a.group) - VOCAB_GROUPS.indexOf(b.group) || a.order - b.order || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  return { options, version: versionOf(options) };
}

/**
 * The list an event works with: the standard list, then the general level, the partner and the event, each over the one before. A stored option with a known key changes its label, order or
 * hidden state; a custom option is added to the list from its level down. Within a group the options are in order, then by label.
 */
export function resolveVocabulary(levels: { general?: unknown; partner?: unknown; event?: unknown } = {}): ResolvedVocabulary {
  const map = standardMap();
  const order: Array<[EditableLevel, unknown]> = [['general', levels.general], ['partner', levels.partner], ['event', levels.event]];
  for (const [level, stored] of order) applyLevel(map, level, stored);
  return finish(map);
}

/**
 * One level over a list that is already resolved: the same rules as `resolveVocabulary`, for an editor that has the list of the levels above (`parent`) and is changing the options of its own
 * level. The editor needs it in the browser, where only the resolved parent is known, not the levels it was made from.
 */
export function resolveOver(parent: ResolvedVocabulary, level: EditableLevel, stored: unknown): ResolvedVocabulary {
  const map = new Map<string, VocabOption>(parent.options.map((option) => [`${option.group}:${option.key}`, { ...option }]));
  applyLevel(map, level, stored);
  return finish(map);
}

/** The standard list as it is with nothing changed anywhere. */
export const STANDARD_VOCABULARY: ResolvedVocabulary = resolveVocabulary();

/** The options of a group: the ones offered now (the default), or all of them, hidden ones included. */
export function optionsOf(vocabulary: ResolvedVocabulary, group: VocabGroup, { activeOnly = true }: { activeOnly?: boolean } = {}): VocabOption[] {
  return vocabulary.options.filter((option) => option.group === group && (!activeOnly || option.active));
}

/** Whether a key exists in the list: for a new annotation only an offered one counts, for a stored one a hidden or deleted option still reads. */
export function isKnownKey(vocabulary: ResolvedVocabulary, group: VocabGroup, key: unknown, { activeOnly = false }: { activeOnly?: boolean } = {}): boolean {
  return typeof key === 'string' && vocabulary.options.some((option) => option.group === group && option.key === key && (!activeOnly || option.active));
}

const humanise = (key: string) => key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The words for a stored key: the label of the list, or the key made readable when the option is gone from the list. */
export function optionLabel(vocabulary: ResolvedVocabulary, group: VocabGroup, key: string): string {
  return vocabulary.options.find((option) => option.group === group && option.key === key)?.label ?? humanise(key);
}

/** A key for a custom option, from its name: lower case words joined with underscores, made unique among the keys of the group (known keys, hidden ones too). */
export function keyForCustomOption(label: string, vocabulary: ResolvedVocabulary, group: VocabGroup): string {
  const base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9]+/, '')
    .slice(0, 30)
    .replace(/_+$/g, '') || 'option';
  const taken = new Set(vocabulary.options.filter((option) => option.group === group).map((option) => option.key));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}

/** The prefix of every variable camera writes to messmass: other sources fill messmass too, so camera's names never meet theirs. */
export const MESSMASS_PREFIX = 'camera_';

/** The name of a counter for messmass: `camera_gender_female`, `camera_age_kid`, `camera_emotion_happy`, `camera_merch_scarf`, `camera_rejected_nudity`. */
export function counterKey(group: VocabGroup, key: string): string {
  return `${MESSMASS_PREFIX}${group === 'reject_reason' ? 'rejected' : group}_${key}`;
}

/** A name camera may send to messmass: the prefix, then lower case letters, digits and underscores. */
export const COUNTER_NAME_PATTERN = /^camera_[a-z0-9_]{1,80}$/;
