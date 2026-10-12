/**
 * One level of the annotation vocabulary on the server (issue 628, lib/photo-vetting/vocabulary.ts): who may edit it, what the editor is shown, and the save. The route
 * `/api/annotation-vocabulary` and the three pages (general, partner, event) all go through these functions, so the rules are written once.
 *
 * - **Who:** general = a global admin; partner = a manager of that partner; event = a global admin or a manager of the event's partner. The level and the id come from the request, but what is
 *   read, written and authorised is decided here from the stored documents, never from anything the browser claims about itself.
 * - **What is shown:** the level's own stored changes, the list as the level above shows it (`parent`) and the list as this level sees it (`resolved`).
 * - **The save:** the options are checked with the store's own rules, plain-text labels, what equals the level above is dropped (nothing is copied down), a new option of this level must not
 *   take a key that a partner or an event under it already uses for its own option (that would give two meanings to one key), and the resolved list must still offer something in every
 *   required group. The write is one atomic update of one document.
 *
 * The functions throw the repo's API responses (`apiForbidden`, `apiNotFound`, `apiBadRequest`), which `withErrorHandler` turns into the answer; a page reads the status with
 * `refusalStatus`.
 */

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { Session } from '@/lib/auth/session';
import { apiBadRequest, apiError, apiForbidden, apiNotFound } from '@/lib/api/responses';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { assertGlobalAdminOrPartnerEventAccess, assertPartnerWorkspaceAccess, isGlobalAdminSession } from '@/lib/partners/authorization';
import { GENERAL_VOCABULARY_SETTING_ID, loadGeneralVocabularyLevel, loadPartnerVocabularyLevel } from './vocabulary-load';
import { checkLabel, emptyRequiredGroups, settle, type EditContext } from './vocabulary-edit';
import { GROUPS, parseStoredVocabulary, readStored, resolveOver, resolveVocabulary, type EditableLevel, type GroupInfo, type ResolvedVocabulary, type StoredOption, type StoredVocabulary, type VocabGroup } from './vocabulary';

type Doc = Record<string, unknown>;

export interface LevelTarget {
  level: EditableLevel;
  /** The Mongo id of the partner or the event, as in the path of its pages (null for the general level). */
  id: string | null;
  /** The name of the partner or the event, for the heading of a page. */
  name: string | null;
  partner?: Doc;
  event?: Doc;
}

/** What an editor is shown: this level's own changes, the list above it, and the list as this level sees it. */
export interface LevelView {
  level: EditableLevel;
  id: string | null;
  name: string | null;
  stored: StoredVocabulary;
  parent: ResolvedVocabulary;
  resolved: ResolvedVocabulary;
  groups: Record<VocabGroup, GroupInfo>;
}

/** The status of a refusal thrown by this module or by the authorization helpers (403, 404, 400...), or null for anything else: a page answers with `notFound()` or a redirect. */
export function refusalStatus(error: unknown): number | null {
  return error instanceof Response ? error.status : null;
}

/** Whether the caller may edit the level, and the documents it needs. Throws the refusal otherwise. */
export async function authorizeLevel(db: Db, session: Session, levelInput: unknown, idInput: unknown): Promise<LevelTarget> {
  if (levelInput === 'general') {
    if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required');
    return { level: 'general', id: null, name: null };
  }
  if (levelInput !== 'partner' && levelInput !== 'event') throw apiBadRequest('level must be general, partner or event');
  const id = typeof idInput === 'string' ? idInput.trim() : '';
  if (!id) throw apiBadRequest(`id is required for the ${levelInput} level`);

  if (levelInput === 'partner') {
    // The partner pages use the Mongo id; the partner's own id (a UUID) is accepted too.
    const partner = (await db.collection(COLLECTIONS.PARTNERS).findOne(ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { partnerId: id })) as Doc | null;
    if (!partner) throw apiNotFound('Partner');
    await assertPartnerWorkspaceAccess(db, session, String(partner.partnerId), 'manager');
    return { level: 'partner', id, name: typeof partner.name === 'string' ? partner.name : null, partner };
  }

  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event ID format');
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, 'manager');
  const event = (await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) })) as Doc | null;
  if (!event) throw apiNotFound('Event');
  return { level: 'event', id, name: typeof event.name === 'string' ? event.name : null, event };
}

/** The list the level above shows, and the options this level stores now (read leniently: a damaged value reads as nothing changed). */
async function loadLevels(db: Db, target: LevelTarget): Promise<{ parent: ResolvedVocabulary; stored: StoredOption[] }> {
  if (target.level === 'general') return { parent: resolveVocabulary(), stored: readStored(await loadGeneralVocabularyLevel(db)) };
  const general = await loadGeneralVocabularyLevel(db);
  if (target.level === 'partner') return { parent: resolveVocabulary({ general }), stored: readStored(target.partner?.annotationVocabulary) };
  const partner = await loadPartnerVocabularyLevel(db, target.event?.partnerId);
  return { parent: resolveVocabulary({ general, partner }), stored: readStored(target.event?.annotationVocabulary) };
}

function viewOf(target: LevelTarget, parent: ResolvedVocabulary, stored: StoredOption[]): LevelView {
  return { level: target.level, id: target.id, name: target.name, stored: { options: stored }, parent, resolved: resolveOver(parent, target.level, { options: stored }), groups: GROUPS };
}

export async function loadLevelView(db: Db, target: LevelTarget): Promise<LevelView> {
  const { parent, stored } = await loadLevels(db, target);
  return viewOf(target, parent, stored);
}

/** A key that a level under this one already uses for an option of its own: the same key at this level would be two meanings of one key in the analytics. */
async function keyUsedBelow(db: Db, target: LevelTarget, group: VocabGroup, key: string): Promise<string | null> {
  const own = { 'annotationVocabulary.options': { $elemMatch: { group, key, custom: true } } };
  if (target.level === 'event') return null;
  if (target.level === 'partner') {
    const used = await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId: target.partner?.partnerId, ...own });
    return used > 0 ? 'an event of this partner' : null;
  }
  if ((await db.collection(COLLECTIONS.PARTNERS).countDocuments(own)) > 0) return 'a partner';
  if ((await db.collection(COLLECTIONS.EVENTS).countDocuments(own)) > 0) return 'an event';
  return null;
}

/**
 * Checks and stores the options of a level, and answers with the level as it is shown afterwards. Anything the store or the rules refuse is a 400 with the reason in words; nothing is
 * written then. An empty list says "nothing changed here" and clears the level.
 */
export async function saveLevel(db: Db, session: Session, target: LevelTarget, input: unknown): Promise<LevelView> {
  const { parent, stored } = await loadLevels(db, target);
  const ctx: EditContext = { level: target.level, parent };

  const entries = Array.isArray(input) ? input : null;
  if (!entries) throw apiBadRequest('options must be a list');
  const labelled: unknown[] = [];
  for (const entry of entries) {
    const option = entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null;
    if (option && option.label !== undefined) {
      const checked = checkLabel(option.label);
      if (!checked.ok) throw apiBadRequest(`${String(option.group)} / ${String(option.key)}: ${checked.reason}`);
      labelled.push({ ...option, label: checked.label });
    } else {
      labelled.push(entry);
    }
  }
  // The store's own check comes first and is strict: `settle` would quietly tidy a wrong entry (a custom flag on a standard key) into nothing and hide a client that is wrong.
  const parsed = parseStoredVocabulary({ options: labelled });
  if (!parsed.ok) throw apiBadRequest(parsed.reason);
  const settled = settle(ctx, parsed.value.options);
  if (!settled.ok) throw apiBadRequest(settled.reason);
  const options = settled.options;

  // Every option must come out of the resolver (an own option beyond the limit of its group would be left out silently), and a required group must keep something to offer.
  const resolved = resolveOver(parent, target.level, { options });
  for (const option of options) {
    if (!resolved.options.some((o) => o.group === option.group && o.key === option.key)) throw apiBadRequest(`${GROUPS[option.group].label}: too many options to keep ${option.key}.`);
  }
  const empty = emptyRequiredGroups(resolved);
  if (empty.length > 0) throw apiBadRequest(`At least one option of ${GROUPS[empty[0]].label} must stay offered.`);

  // A new option of this level takes a key a level under it already uses for its own option: refuse, so one key never means two things.
  for (const option of options) {
    if (!option.custom || parent.options.some((o) => o.group === option.group && o.key === option.key)) continue;
    if (stored.some((s) => s.group === option.group && s.key === option.key)) continue;
    const where = await keyUsedBelow(db, target, option.group, option.key);
    if (where) throw apiError(`${GROUPS[option.group].label}: ${where} already uses the key ${option.key} for an option of its own. Give this one another name.`, 409);
  }

  const now = generateTimestamp();
  if (target.level === 'general') {
    await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne({ settingId: GENERAL_VOCABULARY_SETTING_ID }, { $set: { settingId: GENERAL_VOCABULARY_SETTING_ID, options, updatedAt: now, updatedBy: session.user.email ?? null } }, { upsert: true });
  } else {
    const collection = db.collection(target.level === 'partner' ? COLLECTIONS.PARTNERS : COLLECTIONS.EVENTS);
    const filter = { _id: (target.level === 'partner' ? target.partner : target.event)?._id as ObjectId };
    await collection.updateOne(filter, options.length > 0 ? { $set: { annotationVocabulary: { options }, updatedAt: now } } : { $unset: { annotationVocabulary: '' }, $set: { updatedAt: now } });
  }
  return viewOf(target, parent, options);
}

/** For a server page: the level as the editor is shown it, or the status of the refusal (403 no access, 404 not found, 400 a bad id) for the page to turn into a redirect or "not found". */
export async function loadLevelForPage(db: Db, session: Session, level: EditableLevel, id: string | null): Promise<{ ok: true; view: LevelView } | { ok: false; status: number }> {
  try {
    const target = await authorizeLevel(db, session, level, id);
    return { ok: true, view: await loadLevelView(db, target) };
  } catch (error) {
    const status = refusalStatus(error);
    if (status === null) throw error;
    return { ok: false, status };
  }
}
