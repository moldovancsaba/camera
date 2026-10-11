/**
 * The QR texts (issue 326, plan items 1, 4, 9, 10 and 49; docs/SCREEN_DESIGN.md): the short line next to the QR code on the stage of an event's default slideshow ("Scan & smile"). A global
 * library of items in the existing Libraries section, each with a language and an **active** flag: **a random active one in the event's language (English when there is none in it) is picked
 * once, when the event's default slideshow is made, and stored on the event** (`Event.qrText`), so the event looks the same every time. **With no QR text in the library (it starts empty) the
 * stage has no such line**, exactly what the default slideshow has today: the library is the only thing that adds one. After that the line is a text of the slideshow like any other: the
 * editor changes or removes it in the slideshow editor, and that is the event's own, which always wins (plan items 9 and 10); nothing here touches it again. The Dictionary's `screen.qrText.1` to
 * `4` stay where they are and are not used by the default. Collection `qr_texts`, one document for each text. Every function takes the database as an argument, so tests pass a fake one.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS, generateId } from '@/lib/db/schemas';
import { UI_LANGUAGES, normalizeUiLanguage, type UiLanguage } from '@/lib/i18n';
import { withEffectiveLanguage } from '@/lib/i18n/overrides';
import { pickRandom } from '@/lib/slots/resolve';
import { QR_TEXT_MAX_ITEMS, QR_TEXT_MAX_LENGTH, type QrTextView } from './qr-texts-shared';

export { QR_TEXT_MAX_ITEMS, QR_TEXT_MAX_LENGTH, type QrTextView };

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const texts = (db: Db) => db.collection(COLLECTIONS.QR_TEXTS);

export function qrTextView(doc: Document): QrTextView {
  return { id: text(doc.qrTextId), text: text(doc.text), language: normalizeUiLanguage(doc.language), isActive: doc.isActive !== false, createdAt: text(doc.createdAt) };
}

/** What a request may add: a text of one line (no line break, at most `QR_TEXT_MAX_LENGTH` characters) and a language we have. */
export function parseQrText(input: unknown): { ok: true; value: { text: string; language: UiLanguage } } | { ok: false; reason: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'A text and a language are required.' };
  const { text: raw, language, ...rest } = input as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false, reason: `Unknown field: ${Object.keys(rest)[0]}.` };
  const line = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!line) return { ok: false, reason: 'A text is required.' };
  if (line.length > QR_TEXT_MAX_LENGTH) return { ok: false, reason: `A QR text can have ${QR_TEXT_MAX_LENGTH} characters at most.` };
  if (!(UI_LANGUAGES as readonly string[]).includes(language as string)) return { ok: false, reason: `language must be one of: ${UI_LANGUAGES.join(', ')}.` };
  return { ok: true, value: { text: line, language: language as UiLanguage } };
}

/** Every QR text, switched off ones too, newest first: the list of the library page. */
export async function listQrTexts(db: Db): Promise<QrTextView[]> {
  const docs = await texts(db).find({}).sort({ createdAt: -1 }).limit(QR_TEXT_MAX_ITEMS).toArray();
  return docs.map(qrTextView);
}

export type QrTextResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409; reason: string };

/** Adds a text. The same text in the same language twice is refused, and so is a library that is full. */
export async function createQrText(db: Db, input: unknown, createdBy: string, now: string): Promise<QrTextResult<QrTextView>> {
  const parsed = parseQrText(input);
  if (!parsed.ok) return { ok: false, status: 400, reason: parsed.reason };
  if ((await texts(db).countDocuments({})) >= QR_TEXT_MAX_ITEMS) return { ok: false, status: 409, reason: `The library holds ${QR_TEXT_MAX_ITEMS} QR texts at most.` };
  const existing = (await texts(db).find({ language: parsed.value.language }).toArray()).some((doc) => text(doc.text).toLowerCase() === parsed.value.text.toLowerCase());
  if (existing) return { ok: false, status: 409, reason: 'This text is already in the library in that language.' };
  const doc = { qrTextId: generateId(), text: parsed.value.text, language: parsed.value.language, isActive: true, createdBy, createdAt: now, updatedAt: now };
  await texts(db).insertOne(doc);
  return { ok: true, value: qrTextView(doc) };
}

/** Switches a text off (it is no longer picked for a new event) or on. An event that has it keeps it: it is a text of its slideshow. */
export async function setQrTextActive(db: Db, qrTextId: string, isActive: boolean, now: string): Promise<QrTextResult<QrTextView>> {
  const found = await texts(db).findOne({ qrTextId });
  if (!found) return { ok: false, status: 404, reason: 'QR text not found' };
  await texts(db).updateOne({ qrTextId }, { $set: { isActive, updatedAt: now } });
  return { ok: true, value: qrTextView({ ...found, isActive, updatedAt: now }) };
}

/** Deletes a text from the library. The slideshows that have it keep it (it is a text of the slideshow); nothing else refers to it but the pick stored on an event, which is only a record. */
export async function deleteQrText(db: Db, qrTextId: string): Promise<QrTextResult<{ deleted: string }>> {
  const found = await texts(db).findOne({ qrTextId });
  if (!found) return { ok: false, status: 404, reason: 'QR text not found' };
  await texts(db).deleteOne({ qrTextId });
  return { ok: true, value: { deleted: qrTextId } };
}

/** The active texts an event can get: those in its language; English when there is none in it. */
export function qrTextCandidates(items: readonly QrTextView[], language: UiLanguage): QrTextView[] {
  const active = items.filter((item) => item.isActive && item.text);
  const own = active.filter((item) => item.language === language);
  return own.length > 0 ? own : active.filter((item) => item.language === 'en');
}

/**
 * The QR text for the default slideshow of an event: the stored pick while it is still an active text in the event's language, else a random one. Null when the library has none for the event,
 * which means no line next to the QR code. Nothing is stored here (`storeQrTextPick`).
 */
export async function chooseQrText(db: Db, event: Document, options: { random?: () => number } = {}): Promise<QrTextView | null> {
  const language = normalizeUiLanguage((await withEffectiveLanguage(db, event)).uiLanguage);
  const candidates = qrTextCandidates(await listQrTexts(db), language);
  if (candidates.length === 0) return null;
  const stored = text((event.qrText as { qrTextId?: unknown } | undefined)?.qrTextId);
  return candidates.find((item) => item.id === stored) ?? pickRandom(candidates, options.random);
}

/** Stores the pick on the event (a pick that is already stored writes nothing). */
export async function storeQrTextPick(db: Db, event: Document, pick: QrTextView, now: string): Promise<void> {
  if (text((event.qrText as { qrTextId?: unknown } | undefined)?.qrTextId) === pick.id) return;
  await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: text(event.eventId) }, { $set: { qrText: { qrTextId: pick.id, pickedAt: now } } });
}
