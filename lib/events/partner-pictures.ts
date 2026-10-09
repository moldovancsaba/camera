/**
 * The default pictures of a partner (issue 368, docs/BUILDING_BRICKS.md step 5, owner decisions 161 and 167): the pictures of the welcome page, the CTA page and the e-mail footer that
 * every event of the partner shows unless it has its own. Each is the plain https address a picture field stores, chosen from the partner's Images library
 * (`ImagePicker`). Nothing is copied into an event: a page of an event that has **no picture in a field** shows the partner's at the moment it is read, and a picture set on the page is
 * the page's own and always wins. The page editor reads the stored pages, so an editor never sees the partner's picture as if it were the event's own.
 * Pure; unit-tested (partner-pictures.test.ts).
 */

import type { CustomPage } from '@/lib/db/schemas';

export interface PartnerPictureField {
  key: string;
  label: string;
  helper: string;
  /** The page type and the field of its config this picture fills; null for the e-mail footer picture, which is a setting of the event. */
  page: 'welcome' | 'cta' | null;
  field: string | null;
}

export const PARTNER_PICTURE_FIELDS: readonly PartnerPictureField[] = [
  { key: 'welcomeBackground', label: 'Welcome page: background picture', helper: 'Fills the welcome page behind everything. Events that have no background picture on their welcome page show this one.', page: 'welcome', field: 'backgroundImageUrl' },
  { key: 'welcomeLeft', label: 'Welcome page: left image', helper: 'A transparent PNG on the bottom edge: full width in portrait, half the width at the left in landscape.', page: 'welcome', field: 'bottomImageUrl' },
  { key: 'welcomeRight', label: 'Welcome page: right image', helper: 'A transparent PNG of the same size as the left image, over it in portrait and at the right in landscape.', page: 'welcome', field: 'cornerImageUrl' },
  { key: 'welcomeScreen', label: 'Welcome page: giant screen picture', helper: 'Shown on the 3D giant screen above the Start button; 16:9 works best. It takes the place of the picture drawn from the default slideshow for the events of this partner that have none of their own.', page: 'welcome', field: 'screenImageUrl' },
  { key: 'ctaBackground', label: 'CTA page: background picture', helper: 'Fills the CTA page behind its title, text and buttons.', page: 'cta', field: 'backgroundImageUrl' },
  { key: 'emailFooter', label: 'E-mail footer picture', helper: 'The picture under the card of the e-mails to the users, for the events of this partner that have none of their own.', page: null, field: null },
] as const;

export type PartnerPictures = Record<string, string>;

const KEYS = new Set(PARTNER_PICTURE_FIELDS.map((field) => field.key));
const MAX_URL = 1000;

const isHttps = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

export type ParsedPictures = { ok: true; value: PartnerPictures } | { ok: false; error: string };

/** The pictures from a request: `{ key: https address }`; an empty address takes the picture away. Refused with the reason: an unknown key, something that is not an https address. */
export function parsePartnerPictures(input: unknown): ParsedPictures {
  if (input === null || input === undefined) return { ok: true, value: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'The pictures are an object of key and address.' };
  const out: PartnerPictures = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!KEYS.has(key)) return { ok: false, error: `Unknown picture: ${key}.` };
    if (typeof raw !== 'string') return { ok: false, error: `The picture ${key} must be an address.` };
    const value = raw.trim();
    if (!value) continue;
    if (value.length > MAX_URL || !isHttps(value)) return { ok: false, error: `The picture ${key} must be an https address of at most ${MAX_URL} characters.` };
    out[key] = value;
  }
  return { ok: true, value: out };
}

/** What a stored value amounts to: only known keys with an https address; one that fails is dropped alone. */
export function storedPartnerPictures(value: unknown): PartnerPictures {
  const out: PartnerPictures = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const one = parsePartnerPictures({ [key]: raw });
    if (one.ok && one.value[key]) out[key] = one.value[key];
  }
  return out;
}

/**
 * The pages as the user sees them: a field with no picture shows the partner's. Pure, never stored, the pages given are not changed; a page with its own picture in a field keeps it.
 * The e-mail footer picture is not a page field and is read by the theme (`lib/theme/load.ts`).
 */
export function withPartnerPictures(pages: readonly CustomPage[], pictures: PartnerPictures | null | undefined): CustomPage[] {
  if (!pictures || Object.keys(pictures).length === 0) return [...pages];
  return pages.map((page) => {
    const fields = PARTNER_PICTURE_FIELDS.filter((field) => field.page && field.page === (page.pageType as string) && pictures[field.key]);
    if (fields.length === 0) return page;
    const config = { ...(page.config as Record<string, unknown>) };
    let changed = false;
    for (const field of fields) {
      const own = config[field.field as string];
      if (typeof own === 'string' && own.trim()) continue;
      config[field.field as string] = pictures[field.key];
      changed = true;
    }
    return changed ? ({ ...page, config } as CustomPage) : page;
  });
}
