/**
 * The checkboxes of a consent page (camera#330, docs/WELCOME_AND_DEFAULTS_PLAN.md items 42 to 48): a list of checkboxes, each with a text and an
 * optional link to the legal page it names, all required. A page that only has the older single `checkboxText` keeps working as a list of one.
 * Pure, so it is unit-tested (consent.test.ts).
 */

export interface ConsentCheckbox {
  text: string;
  /** An https address; opens in a new tab so the user does not lose the flow. */
  linkUrl?: string;
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
    out.push(linkUrl ? { text, linkUrl } : { text });
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

export interface ConsentRecord {
  pageId: string;
  pageType: 'accept' | 'cta';
  /** The exact text the user agreed to. */
  checkboxText: string;
  linkUrl?: string;
  accepted: boolean;
  acceptedAt: string;
}

/**
 * The consent records a finished consent (or CTA) page leaves with the photo: one per checkbox of a consent page with a list (its exact text, its
 * link, the time), else the single record of the page as before.
 */
export function consentRecords(
  page: { pageId: string; pageType: 'accept' | 'cta'; checkboxText?: string },
  data: { accepted: boolean; acceptedAt: string; items?: ConsentCheckbox[] },
): ConsentRecord[] {
  if (data.items && data.items.length > 0) {
    return data.items.map((item) => ({
      pageId: page.pageId,
      pageType: page.pageType,
      checkboxText: item.text,
      ...(item.linkUrl ? { linkUrl: item.linkUrl } : {}),
      accepted: data.accepted,
      acceptedAt: data.acceptedAt,
    }));
  }
  return [{ pageId: page.pageId, pageType: page.pageType, checkboxText: page.checkboxText || '', accepted: data.accepted, acceptedAt: data.acceptedAt }];
}

