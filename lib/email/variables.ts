/**
 * The variables an e-mail text can use (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E5): one catalogue, with a sample value each for the editor's preview and the insert menu, and one
 * function that fills them from what is known about the user, the event and its partner. A variable the event has no value for (no teams) is left out by `resolveRich`, never sent
 * as `{name}`. Pure; unit-tested in variables.test.ts.
 *
 * `{name}`, `{event}`, `{link}` and `{terms}` are the four that always existed. `{partner1}` and `{partner2}` are the names the frame messages use for the two sides; here they are the
 * same two sides as `{home}` and `{visitor}`.
 */

import { matchSides } from '@/lib/frame/layout';
import { DEFAULT_UI_LANGUAGE, type UiLanguage } from '@/lib/i18n';
import type { Values } from '@/lib/email/rich';

export interface EmailVariable {
  name: string;
  /** What it stands for, for the editor. */
  label: string;
  /** A sample value in each language, for the preview. */
  sample: Record<UiLanguage, string>;
  /** The value is an address: it may be a link. */
  url?: boolean;
  /** Another name for the same value. */
  aliasOf?: string;
}

export const EMAIL_VARIABLES: readonly EmailVariable[] = [
  { name: 'name', label: 'The name of the user', sample: { en: 'Ann', hu: 'Anna' } },
  { name: 'event', label: 'The name of the event', sample: { en: 'MTK Budapest x Vasas FC', hu: 'MTK Budapest x Vasas FC' } },
  { name: 'partner', label: 'The partner (the club or organiser)', sample: { en: 'MTK Budapest', hu: 'MTK Budapest' } },
  { name: 'home', label: 'The home team', sample: { en: 'MTK Budapest', hu: 'MTK Budapest' } },
  { name: 'visitor', label: 'The visitor team', sample: { en: 'Vasas FC', hu: 'Vasas FC' } },
  { name: 'teams', label: 'The two teams', sample: { en: 'MTK Budapest – Vasas FC', hu: 'MTK Budapest – Vasas FC' } },
  { name: 'date', label: 'The date of the event', sample: { en: '16 October 2026', hu: '2026. október 16.' } },
  { name: 'location', label: 'The place of the event', sample: { en: 'Budapest', hu: 'Budapest' } },
  { name: 'link', label: 'The link to the photo', sample: { en: 'https://camera.example/share/abc123', hu: 'https://camera.example/share/abc123' }, url: true },
  { name: 'terms', label: 'The link to the terms and policies', sample: { en: 'https://seyuselfies.com/en/policies/', hu: 'https://seyuselfies.com/hu/policies/' }, url: true },
  { name: 'partner1', label: 'The first side (same as the home team)', sample: { en: 'MTK Budapest', hu: 'MTK Budapest' }, aliasOf: 'home' },
  { name: 'partner2', label: 'The second side (same as the visitor team)', sample: { en: 'Vasas FC', hu: 'Vasas FC' }, aliasOf: 'visitor' },
];

/** The variables the insert menu offers: every one except the other names of a variable. */
export const MENU_VARIABLES = EMAIL_VARIABLES.filter((variable) => !variable.aliasOf);

/** The names of the variables whose value is an address (the only values that may become links). */
export const URL_VARIABLES = EMAIL_VARIABLES.filter((variable) => variable.url).map((variable) => variable.name);

/** Sample values for every variable, for the preview of an e-mail that has no real user and event to fill from. */
export function sampleValues(language: UiLanguage = DEFAULT_UI_LANGUAGE): Values {
  return Object.fromEntries(EMAIL_VARIABLES.map((variable) => [variable.name, variable.sample[language]]));
}

/** What is known about the event and its partner. All optional: what is missing is a variable with no value. */
export interface EventFacts {
  name?: string | null;
  /** The date of the event: an ISO date or datetime, or a Date. */
  date?: string | Date | null;
  location?: string | null;
  partnerName?: string | null;
  home?: string | null;
  visitor?: string | null;
}

const clean = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const LOCALES: Record<UiLanguage, string> = { en: 'en-GB', hu: 'hu-HU' };

/** The date as a person reads it in the language ("16 October 2026", "2026. október 16."), on the calendar of the event's country; undefined when there is no valid date. */
export function formatEventDate(value: string | Date | null | undefined, language: UiLanguage = DEFAULT_UI_LANGUAGE): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(LOCALES[language], { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Budapest' }).format(date);
}

/** The facts of an event document (its own fields and its messmass snapshot), as far as it has them. */
export function eventFactsOf(event: unknown): EventFacts {
  const doc = (event && typeof event === 'object' ? event : {}) as Record<string, unknown>;
  const context = ((doc.frameDesign as Record<string, unknown> | undefined)?.context ?? {}) as { event?: { homeTeam?: { name?: unknown }; visitorTeam?: { name?: unknown } }; partner?: { name?: unknown } };
  return {
    name: clean(doc.name),
    date: typeof doc.eventDate === 'string' || doc.eventDate instanceof Date ? (doc.eventDate as string | Date) : undefined,
    location: clean(doc.location),
    partnerName: clean(doc.partnerName) ?? clean(context.partner?.name),
    home: clean(context.event?.homeTeam?.name),
    visitor: clean(context.event?.visitorTeam?.name),
  };
}

/** The values of the variables for one e-mail to one user. A variable with nothing to fill it is present and undefined. */
export function emailValues(input: {
  recipientName?: string | null;
  eventName?: string | null;
  shareUrl?: string | null;
  termsUrl?: string | null;
  facts?: EventFacts | null;
  language?: UiLanguage;
}): Values {
  const language = input.language ?? DEFAULT_UI_LANGUAGE;
  const facts = input.facts ?? {};
  const eventName = clean(input.eventName) ?? clean(facts.name);
  // The two sides the same way the frame shows them: the real home and visitor, else the two sides of a pairing in the event name.
  const sides = matchSides({ home: facts.home, visitor: facts.visitor, eventName: eventName ?? '' });
  const home = sides?.[0] ?? clean(facts.home);
  const visitor = sides?.[1] ?? clean(facts.visitor);
  return {
    name: clean(input.recipientName),
    event: eventName,
    partner: clean(facts.partnerName),
    home,
    visitor,
    partner1: home,
    partner2: visitor,
    teams: home && visitor ? `${home} – ${visitor}` : undefined,
    date: formatEventDate(facts.date, language),
    location: clean(facts.location),
    link: clean(input.shareUrl),
    terms: clean(input.termsUrl),
  };
}
