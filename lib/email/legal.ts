/**
 * The legal part of the e-mails to the user (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E2; owner, 2026-10-09, point 1): the same at every e-mail of an event, so it is **one
 * slot with three levels**, in each language: the general one (an admin), the partner's and the event's. The event follows its partner and the partner follows the general one
 * each time it is read (nothing is copied down), what a level sets is **its own** and the default of the levels below, and an own value is never overridden by a later change above:
 * the same rule as the text levels (lib/i18n/overrides.ts). It is written in the format of lib/email/rich.ts and shown as small print under the message and the button.
 *
 * Where no level has a legal part for the language, nothing is added and the e-mail is exactly what it was. Pure and database stores, in one place; unit-tested in legal.test.ts.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { UI_LANGUAGES, isUiLanguage, type UiLanguage } from '@/lib/i18n';
import { eventLanguage } from '@/lib/i18n/overrides';
import { emailDefaults } from '@/lib/email/submission-template-defaults';

export const LEGAL_MAX = 4000;

/** The legal part written at one level, per language: only the languages the editor wrote. */
export type LegalByLanguage = Partial<Record<UiLanguage, string>>;

export type LegalSource = 'event' | 'partner' | 'global';

const normalize = (text: string) => text.replace(/\r\n?/g, '\n').trim();

export type ParsedLegal = { ok: true; value: LegalByLanguage } | { ok: false; error: string };

/**
 * The legal part from a request: `{ en: '...', hu: '...' }`. An empty text means "no legal part at this level for that language" and is left out. Refused with the reason: an
 * unknown language, something that is not text, or a text over the limit.
 */
export function parseLegal(input: unknown): ParsedLegal {
  if (input === null || input === undefined) return { ok: true, value: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'The legal part is an object with a language at the top: { en: "...", hu: "..." }.' };
  const value: LegalByLanguage = {};
  for (const [language, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!isUiLanguage(language)) return { ok: false, error: `Unknown language: ${language}.` };
    if (typeof raw !== 'string') return { ok: false, error: `The legal part in ${language} must be text.` };
    const text = normalize(raw);
    if (!text) continue;
    if (text.length > LEGAL_MAX) return { ok: false, error: `The legal part in ${language} is longer than ${LEGAL_MAX} characters.` };
    value[language] = text;
  }
  return { ok: true, value };
}

/** What a stored value amounts to: only the languages we have, only text. A stored value is never trusted more than a request. */
export function storedLegal(value: unknown): LegalByLanguage {
  const out: LegalByLanguage = {};
  if (!value || typeof value !== 'object') return out;
  for (const language of UI_LANGUAGES) {
    const raw = (value as Record<string, unknown>)[language];
    if (typeof raw === 'string' && normalize(raw) && normalize(raw).length <= LEGAL_MAX) out[language] = normalize(raw);
  }
  return out;
}

export interface LegalLevels {
  global: LegalByLanguage;
  partner: LegalByLanguage;
  event: LegalByLanguage;
}

/** The legal part that applies in a language: the event's own, else its partner's, else the general one; null when no level has one for the language. */
export function resolveLegal(language: UiLanguage, levels: LegalLevels): { text: string; source: LegalSource } | null {
  for (const source of ['event', 'partner', 'global'] as const) {
    const text = levels[source][language];
    if (text) return { text, source };
  }
  return null;
}

/** The standard last paragraph of the default e-mails ("Policies and General Terms and Conditions: {terms}"), in every language. */
const STANDARD_TAILS: string[] = (() => {
  const tails = new Set<string>();
  for (const language of UI_LANGUAGES) {
    const defaults = emailDefaults(language);
    for (const body of [defaults.body, defaults.resubmissionBody, defaults.notApprovedBody]) tails.add(lastParagraph(body));
  }
  return [...tails];
})();

function lastParagraph(text: string): string {
  return normalize(text).split(/\n{2,}/).pop()!.replace(/\s+/g, ' ');
}

/**
 * The template without its standard terms paragraph, for an e-mail that has a legal part (the legal part replaces it, so the terms are not written twice). Only the standard
 * paragraph at the end of a template goes; a legal paragraph an editor wrote in their own words stays where it is until the editor moves it.
 */
export function withoutStandardLegalTail(template: string): string {
  const paragraphs = normalize(template).split(/\n{2,}/);
  if (paragraphs.length < 2) return template;
  return STANDARD_TAILS.includes(lastParagraph(paragraphs[paragraphs.length - 1])) ? paragraphs.slice(0, -1).join('\n\n') : template;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The stores
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const GLOBAL_SETTING = 'email-legal';

export async function getGlobalLegal(db: Db): Promise<LegalByLanguage> {
  const stored = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: GLOBAL_SETTING });
  return storedLegal(stored?.legal);
}

export async function saveGlobalLegal(db: Db, legal: LegalByLanguage, updatedBy: string | null, now: string): Promise<void> {
  await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne({ settingId: GLOBAL_SETTING }, { $set: { settingId: GLOBAL_SETTING, legal, updatedAt: now, updatedBy } }, { upsert: true });
}

export async function savePartnerLegal(db: Db, partnerId: string, legal: LegalByLanguage, now: string): Promise<boolean> {
  const result = await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId }, { $set: { emailLegal: legal, updatedAt: now } });
  return result.matchedCount > 0;
}

export async function saveEventLegal(db: Db, eventId: string, legal: LegalByLanguage, now: string): Promise<boolean> {
  const result = await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId }, { $set: { emailLegal: legal, updatedAt: now } });
  return result.matchedCount > 0;
}

export interface EventLegal {
  language: UiLanguage;
  levels: LegalLevels;
  /** What applies to the event in its language, and the level it comes from; null when there is none. */
  effective: { text: string; source: LegalSource } | null;
  partner: Document | null;
}

/** The legal part of an event, level by level and resolved for its language. Two reads (the general setting and the partner), none written. */
export async function loadEventLegal(db: Db, event: Document, partner?: Document | null): Promise<EventLegal> {
  const partnerDoc = partner === undefined ? (typeof event.partnerId === 'string' && event.partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId }) : null) : partner;
  const language = eventLanguage(event, partnerDoc);
  const levels: LegalLevels = { global: await getGlobalLegal(db), partner: storedLegal(partnerDoc?.emailLegal), event: storedLegal(event.emailLegal) };
  return { language, levels, effective: resolveLegal(language, levels), partner: partnerDoc ?? null };
}
