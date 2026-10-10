/**
 * The settings of every checkbox a user can meet (issue 558, owner answer 297: "all types of checkboxes have to have an on/off toggle and a required checkbox on the settings as every market has its own
 * law"). Each kind of checkbox has two settings, **shown or not** and **required or optional**, chosen where the brick model puts every choice: the **partner** has a default, an **event** follows it
 * or chooses for itself ("Same as the partner"), and nothing is copied down. The standard of each kind is what the journey always did, so no event changes until somebody chooses.
 *
 * | kind        | the checkbox                                                   | standard (today)                | off means                                      | optional means                          |
 * |-------------|----------------------------------------------------------------|---------------------------------|------------------------------------------------|-----------------------------------------|
 * | terms       | "I accept the Terms and conditions" of the default consent page | shown, required                 | not shown, no record                           | shown, may stay unticked, a record either way |
 * | cookies     | "I accept cookies" of the default consent page                  | shown, required                 | not shown, no record                           | as above                                |
 * | privacy     | "I have read the Privacy policy" of the default consent page    | shown, required                 | not shown, no record                           | as above                                |
 * | acceptance  | the one sentence on the Who-are-you page                        | not shown (a page of its own)   | the consent page is a page of its own          | the page works without ticking it       |
 * | gallery     | permission to show the photo on the public campaign wall        | not shown (does not ask)        | not asked, the terms cover it                  | shown, not ticked, may stay unticked    |
 *
 * (The checkboxes of an event's *own* consent page carry the same two settings on each checkbox, set in that page's editor: `ConsentCheckbox.shown` and `.required`, lib/events/consent.ts.)
 *
 * **Where a setting is stored.** The two kinds that had a setting before keep it where it was, so nothing is migrated: `galleryConsent` (true asks, false does not, null follows the partner) is the
 * "shown" of the gallery permission and `acceptanceOnWhoAreYou` is the "shown" of the acceptance sentence. Everything else is in one object, `consentSettings`:
 * `{ terms | cookies | privacy: { shown?, required? }, acceptance: { required? }, gallery: { required? } }`. The first level that made a choice for a kind decides both of its settings; a part it did not
 * set takes the standard, never the partner's (so an event that chose "ask" does not become "required" because its partner did).
 *
 * **What the server checks.** A requirement the standard gives (required, as today) is enforced by the page only, as it always was (planning item 43), so nothing changes before somebody chooses.
 * A requirement an editor **chose** (`required: true` stored at the event or the partner, or on a checkbox of an own page) is checked by the server too: a save that lacks it is refused, because the page
 * must never be the only guard. `checked` in the result says which it is. Pure; unit-tested (checkbox-settings.test.ts).
 */

export const DOCUMENT_KINDS = ['terms', 'cookies', 'privacy'] as const;
export const CHECKBOX_KINDS = [...DOCUMENT_KINDS, 'acceptance', 'gallery'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type CheckboxKind = (typeof CHECKBOX_KINDS)[number];

/** What an editor picks for one kind at one level: the three combinations that mean something. The empty string, "no choice at this level", is only for an event (it follows its partner) and for the partner's standard. */
export type CheckboxMode = '' | 'required' | 'optional' | 'off';

export interface StoredDocumentChoice {
  shown?: boolean;
  required?: boolean;
}

/** The `consentSettings` object of a partner or an event, as stored. */
export interface StoredCheckboxSettings {
  terms?: StoredDocumentChoice;
  cookies?: StoredDocumentChoice;
  privacy?: StoredDocumentChoice;
  acceptance?: { required?: boolean };
  gallery?: { required?: boolean };
}

/** What a partner or an event document holds for the checkboxes: the object, and the two older fields that are the "shown" of the acceptance sentence and of the gallery permission. */
export interface CheckboxSettingsHolder {
  consentSettings?: unknown;
  galleryConsent?: unknown;
  acceptanceOnWhoAreYou?: unknown;
}

export interface EffectiveCheckbox {
  shown: boolean;
  required: boolean;
  /** The requirement is an editor's choice (not the standard): the server refuses a save without it. Never true for a checkbox that is not shown or is optional. */
  checked: boolean;
  /** The level that decided: the event, its partner, or the standard. */
  source: 'event' | 'partner' | 'standard';
}

export type EffectiveCheckboxes = Record<CheckboxKind, EffectiveCheckbox>;

/** The standard of each kind: what the journey did before the settings existed. */
export const STANDARD_CHECKBOXES: Readonly<EffectiveCheckboxes> = {
  terms: { shown: true, required: true, checked: false, source: 'standard' },
  cookies: { shown: true, required: true, checked: false, source: 'standard' },
  privacy: { shown: true, required: true, checked: false, source: 'standard' },
  acceptance: { shown: false, required: true, checked: false, source: 'standard' },
  gallery: { shown: false, required: false, checked: false, source: 'standard' },
};

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** The object as stored, reduced to the known kinds and the known booleans (anything else is ignored when reading). */
export function storedCheckboxSettings(value: unknown): StoredCheckboxSettings {
  const source = asObject(value);
  const out: StoredCheckboxSettings = {};
  for (const kind of DOCUMENT_KINDS) {
    const choice = asObject(source[kind]);
    const picked: StoredDocumentChoice = { ...(isBoolean(choice.shown) ? { shown: choice.shown } : {}), ...(isBoolean(choice.required) ? { required: choice.required } : {}) };
    if (Object.keys(picked).length > 0) out[kind] = picked;
  }
  for (const kind of ['acceptance', 'gallery'] as const) {
    const choice = asObject(source[kind]);
    if (isBoolean(choice.required)) out[kind] = { required: choice.required };
  }
  return out;
}

export type ParsedCheckboxSettings = { ok: true; value: StoredCheckboxSettings | null } | { ok: false; error: string };

/**
 * A request value for `consentSettings`: an object of known kinds with known true/false parts, or null / an empty value / an empty object for "no choice at this level". Anything else is
 * refused, so a misspelled kind or part cannot be saved and silently do nothing.
 */
export function parseCheckboxSettings(input: unknown): ParsedCheckboxSettings {
  if (input === null || input === '') return { ok: true, value: null };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'consentSettings must be an object' };
  const source = input as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!(CHECKBOX_KINDS as readonly string[]).includes(key)) return { ok: false, error: `consentSettings has an unknown checkbox: ${key}` };
    const choice = source[key];
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return { ok: false, error: `consentSettings.${key} must be an object` };
    const allowed = (DOCUMENT_KINDS as readonly string[]).includes(key) ? ['shown', 'required'] : ['required'];
    for (const [part, value] of Object.entries(choice as Record<string, unknown>)) {
      if (!allowed.includes(part)) return { ok: false, error: `consentSettings.${key} has an unknown setting: ${part}` };
      if (!isBoolean(value)) return { ok: false, error: `consentSettings.${key}.${part} must be true or false` };
    }
  }
  const clean = storedCheckboxSettings(input);
  return { ok: true, value: Object.keys(clean).length > 0 ? clean : null };
}

/** Whether a level made a choice for a kind (the "shown" of the two older kinds is their older field). */
function choiceOf(holder: CheckboxSettingsHolder | null | undefined, kind: CheckboxKind): boolean {
  if (!holder) return false;
  if (kind === 'gallery') return isBoolean(holder.galleryConsent);
  if (kind === 'acceptance') return isBoolean(holder.acceptanceOnWhoAreYou);
  const choice = storedCheckboxSettings(holder.consentSettings)[kind];
  return choice !== undefined;
}

/** What one level says for a kind, read as that level's own choice (a part it did not set takes the standard). */
function readLevel(holder: CheckboxSettingsHolder, kind: CheckboxKind, source: 'event' | 'partner'): EffectiveCheckbox {
  const stored = storedCheckboxSettings(holder.consentSettings);
  if (kind === 'gallery') {
    const shown = holder.galleryConsent === true;
    const required = shown && stored.gallery?.required === true;
    return { shown, required, checked: required, source };
  }
  if (kind === 'acceptance') {
    const shown = holder.acceptanceOnWhoAreYou === true;
    const required = shown && stored.acceptance?.required !== false;
    return { shown, required, checked: shown && stored.acceptance?.required === true, source };
  }
  const choice = stored[kind] ?? {};
  const shown = choice.shown !== false;
  const required = shown && choice.required !== false;
  return { shown, required, checked: shown && choice.required === true, source };
}

/**
 * What an event gets for every kind of checkbox: its own choice, else its partner's, else the standard (nothing is copied down, so a partner that changes its default changes every event that
 * made no choice). `partner` may be null.
 */
export function effectiveCheckboxes(event: CheckboxSettingsHolder | null | undefined, partner?: CheckboxSettingsHolder | null): EffectiveCheckboxes {
  const out = { ...STANDARD_CHECKBOXES } as EffectiveCheckboxes;
  for (const kind of CHECKBOX_KINDS) {
    if (event && choiceOf(event, kind)) out[kind] = readLevel(event, kind, 'event');
    else if (partner && choiceOf(partner, kind)) out[kind] = readLevel(partner, kind, 'partner');
  }
  return out;
}

/** What an editor sees for one kind at one level: `''` when the level made no choice. */
export function modeOf(holder: CheckboxSettingsHolder | null | undefined, kind: CheckboxKind): CheckboxMode {
  if (!holder || !choiceOf(holder, kind)) return '';
  const level = readLevel(holder, kind, 'event');
  if (!level.shown) return 'off';
  return level.required ? 'required' : 'optional';
}

/**
 * The fields a save writes for the chosen modes of one level (an event or a partner): the older fields for the two kinds that had them, and the `consentSettings` object for the rest. A mode of
 * `''` stores nothing for its kind (null for the older fields), which is "no choice at this level". The object is complete: it replaces what was stored.
 */
export function settingsToStore(modes: Partial<Record<CheckboxKind, CheckboxMode>>): { galleryConsent: boolean | null; acceptanceOnWhoAreYou: boolean | null; consentSettings: StoredCheckboxSettings | null } {
  const stored: StoredCheckboxSettings = {};
  for (const kind of DOCUMENT_KINDS) {
    const mode = modes[kind] ?? '';
    if (mode === 'off') stored[kind] = { shown: false };
    else if (mode === 'optional') stored[kind] = { shown: true, required: false };
    else if (mode === 'required') stored[kind] = { shown: true, required: true };
  }
  const acceptance = modes.acceptance ?? '';
  const gallery = modes.gallery ?? '';
  if (acceptance === 'optional') stored.acceptance = { required: false };
  if (acceptance === 'required') stored.acceptance = { required: true };
  if (gallery === 'required') stored.gallery = { required: true };
  return {
    galleryConsent: gallery === '' ? null : gallery !== 'off',
    acceptanceOnWhoAreYou: acceptance === '' ? null : acceptance !== 'off',
    consentSettings: Object.keys(stored).length > 0 ? stored : null,
  };
}

/** The three documents of the default consent page as they are for an event: the input of `defaultConsentPage` (lib/events/default-pages.ts). */
export type DocumentSettings = Record<DocumentKind, EffectiveCheckbox>;

export function documentSettings(effective: EffectiveCheckboxes): DocumentSettings {
  return { terms: effective.terms, cookies: effective.cookies, privacy: effective.privacy };
}

/**
 * The settings of the three documents when somebody chose anything for them, else undefined. An event that chose nothing (and whose partner chose nothing) is sent no settings at all, so its
 * pages and its journey context are exactly what they were before the settings existed.
 */
export function chosenDocuments(effective: EffectiveCheckboxes): DocumentSettings | undefined {
  return DOCUMENT_KINDS.every((kind) => effective[kind].source === 'standard') ? undefined : documentSettings(effective);
}
