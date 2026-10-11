/**
 * The checkboxes of a consent page (camera#330, docs/WELCOME_AND_DEFAULTS_PLAN.md items 42 to 48): a list of checkboxes, each with a text and an
 * optional link to the legal page it names. A page that only has the older single `checkboxText` keeps working as a list of one.
 *
 * Every checkbox has two settings (issue 558, owner answer 297: "all types of checkboxes have to have an on/off toggle and a required checkbox on the settings as every market has its own law"):
 * shown or not, and required or optional. The standard is what the page always did: shown and required, so a checkbox that stores neither setting is drawn and behaves exactly as before.
 * Pure, so it is unit-tested (consent.test.ts).
 */

export interface ConsentCheckbox {
  text: string;
  /** An https address; opens in a new tab so the user does not lose the flow. */
  linkUrl?: string;
  /** `false`: the checkbox is switched off, not shown and no record is made. Missing (the standard) or true: shown. Only `false` is ever stored. */
  shown?: boolean;
  /**
   * Whether it must be ticked. Missing (the standard): required on the page, as the page always did. `true`: an editor chose "required", so the server refuses a photo saved without it too.
   * `false`: optional, shown with "(optional)", may stay unticked, and the record says whether it was ticked.
   */
  required?: boolean;
}

export const MAX_CONSENT_CHECKBOXES = 10;
const MAX_TEXT = 300;
const MAX_LINK = 500;

/** The link of a checkbox, only when it is a plain https address (no credentials); anything else is dropped. */
export function safeLinkUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_LINK) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** The valid checkboxes of a stored or submitted list: each needs a text; a link that is not https is dropped, not the checkbox. */
export function sanitizeCheckboxes(value: unknown): ConsentCheckbox[] {
  if (!Array.isArray(value)) return [];
  const out: ConsentCheckbox[] = [];
  for (const raw of value) {
    const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const text = typeof item.text === 'string' ? item.text.replace(/\s+/g, ' ').trim() : '';
    if (!text || text.length > MAX_TEXT) continue;
    const linkUrl = safeLinkUrl(item.linkUrl);
    out.push({
      text,
      ...(linkUrl ? { linkUrl } : {}),
      ...(item.shown === false ? { shown: false } : {}),
      ...(typeof item.required === 'boolean' ? { required: item.required } : {}),
    });
    if (out.length >= MAX_CONSENT_CHECKBOXES) break;
  }
  return out;
}

/** What a consent page shows: its list of checkboxes, else its single `checkboxText` as a list of one, else nothing. */
export function consentCheckboxes(config: { checkboxes?: unknown; checkboxText?: unknown }): ConsentCheckbox[] {
  const list = sanitizeCheckboxes(config.checkboxes);
  if (list.length > 0) return list;
  const single = typeof config.checkboxText === 'string' ? config.checkboxText.trim() : '';
  return single ? [{ text: single }] : [];
}

/** The checkboxes that are switched on: a checkbox with `shown: false` is not drawn, not counted and leaves no record. */
export function shownCheckboxes<T extends ConsentCheckbox>(items: readonly T[]): T[] {
  return items.filter((item) => item.shown !== false);
}

/** True for a checkbox the user must tick: the standard, and what an editor marked required. Only `required: false` is optional. */
export const isRequiredCheckbox = (item: ConsentCheckbox): boolean => item.required !== false;

/** A consent page whose whole list is switched off has nothing to show: it is not a step of the journey (a list that is empty is the older single-text page, which is shown). */
export function consentPageIsEmpty(config: { checkboxes?: unknown }): boolean {
  const list = sanitizeCheckboxes(config.checkboxes);
  return list.length > 0 && list.every((item) => item.shown === false);
}

/**
 * The pages a guest is sent (issue 558): on every consent page the checkboxes that are switched off are left out, and a consent page whose whole list is off is not a step. Nothing else changes: a
 * page without a list, a page whose list has no switched-off checkbox, and every other page type come back as the same objects.
 */
export function withShownCheckboxes<T extends { pageType: string; config?: unknown }>(pages: readonly T[]): T[] {
  const out: T[] = [];
  for (const page of pages) {
    const config = page.config as { checkboxes?: unknown } | undefined;
    if (page.pageType !== 'accept' || !config || !Array.isArray(config.checkboxes)) {
      out.push(page);
      continue;
    }
    const list = sanitizeCheckboxes(config.checkboxes);
    if (!list.some((item) => item.shown === false)) {
      out.push(page);
      continue;
    }
    const shown = shownCheckboxes(list);
    if (shown.length > 0) out.push({ ...page, config: { ...config, checkboxes: shown } });
  }
  return out;
}

export interface ConsentRecord {
  pageId: string;
  pageType: 'accept' | 'cta';
  /** The exact text the user agreed to. */
  checkboxText: string;
  linkUrl?: string;
  /** True: ticked. False: an optional checkbox that was shown and left unticked (issue 558); `required` is then false. */
  accepted: boolean;
  /** When the user answered: the time the box was ticked, or the time an optional box was left unticked. */
  acceptedAt: string;
  /** The one sentence the user ticked when the checkboxes were shown as one on the Who-are-you page (issue 523): exactly what was read. */
  shownText?: string;
  /** Only ever `false`: the checkbox was optional when it was shown (issue 558). A record without it was a required checkbox, as every record was before. */
  required?: false;
}

/**
 * The consent records a finished consent (or CTA) page leaves with the photo: one per checkbox of a consent page with a list (its exact text, its
 * link, the time), else the single record of the page as before. `items` are the checkboxes the user ticked; `unticked` are the optional ones that were shown and left unticked (issue 558): they leave a
 * record with `accepted: false`, so what was shown and what was ticked are both kept. A checkbox that was switched off is in neither list and leaves nothing.
 */
export function consentRecords(
  page: { pageId: string; pageType: 'accept' | 'cta'; checkboxText?: string },
  data: { accepted: boolean; acceptedAt: string; items?: ConsentCheckbox[]; unticked?: ConsentCheckbox[]; shownText?: string },
): ConsentRecord[] {
  const record = (item: ConsentCheckbox, accepted: boolean): ConsentRecord => ({
    pageId: page.pageId,
    pageType: page.pageType,
    checkboxText: item.text,
    ...(item.linkUrl ? { linkUrl: item.linkUrl } : {}),
    accepted,
    acceptedAt: data.acceptedAt,
    ...(data.shownText ? { shownText: data.shownText } : {}),
    ...(item.required === false ? { required: false as const } : {}),
  });
  if ((data.items && data.items.length > 0) || (data.unticked && data.unticked.length > 0)) {
    return [...(data.items ?? []).map((item) => record(item, data.accepted)), ...(data.unticked ?? []).map((item) => record({ ...item, required: false }, false))];
  }
  return [{ pageId: page.pageId, pageType: page.pageType, checkboxText: page.checkboxText || '', accepted: data.accepted, acceptedAt: data.acceptedAt }];
}

