import { DEFAULT_UI_LANGUAGE, textOr, translate, type MessageKey, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';

/**
 * The fixed texts of the public photo page and of its waiting and not-approved notices (camera#339, planning items 74 and 75). Each has a default in
 * the dictionary of the event's language (camera#352; the English one is the text it always had); an event's setting replaces it, an empty setting
 * means the default (nothing is frozen into the event).
 */
const SHARE_PAGE_TEXT_KEYS = {
  downloadButton: 'sharePage.downloadButton',
  createYourOwnButton: 'sharePage.createYourOwnButton',
  waitingTitle: 'sharePage.waitingTitle',
  waitingMessage: 'sharePage.waitingMessage',
  notApprovedTitle: 'sharePage.notApprovedTitle',
  notApprovedMessage: 'sharePage.notApprovedMessage',
  notApprovedHint: 'sharePage.notApprovedHint',
  takeAnotherPhotoButton: 'sharePage.takeAnotherPhotoButton',
} as const satisfies Record<string, MessageKey>;

export type SharePageTextKey = keyof typeof SHARE_PAGE_TEXT_KEYS;
export type SharePageTexts = Partial<Record<SharePageTextKey, string>>;

/** The English defaults, for code that has no language (the event editor shows them as the grey text of an empty field). */
export const SHARE_PAGE_TEXT_DEFAULTS = Object.fromEntries(
  (Object.keys(SHARE_PAGE_TEXT_KEYS) as SharePageTextKey[]).map((key) => [key, translate(DEFAULT_UI_LANGUAGE, SHARE_PAGE_TEXT_KEYS[key])])
) as Record<SharePageTextKey, string>;

const SHARE_PAGE_TEXT_MAX_LENGTH = 500;

/**
 * The text of the page: the event's own, or the default in the event's language when it has none. A stored text that is exactly the English default
 * counts as not set in another language (`textOr`).
 */
export function sharePageText(settings: { texts?: SharePageTexts } | null | undefined, key: SharePageTextKey, language: UiLanguage = DEFAULT_UI_LANGUAGE, texts?: TextOverrides | null): string {
  return textOr(language, SHARE_PAGE_TEXT_KEYS[key], settings?.texts?.[key], undefined, texts);
}

/** Only the texts an editor really wrote are kept (trimmed, limited); everything else stays the default. */
export function normalizeSharePageTexts(value: unknown): SharePageTexts {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const texts: SharePageTexts = {};
  for (const key of Object.keys(SHARE_PAGE_TEXT_KEYS) as SharePageTextKey[]) {
    const raw = source[key];
    const text = typeof raw === 'string' ? raw.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(0, SHARE_PAGE_TEXT_MAX_LENGTH) : '';
    if (text) texts[key] = text;
  }
  return texts;
}

export interface EventSharePageSettings {
  showCreateYourOwnButton: boolean;
  /** The event's own texts for the fixed words of the page; the ones it has not written are the defaults. */
  texts: SharePageTexts;
}

export const DEFAULT_EVENT_SHARE_PAGE_SETTINGS: EventSharePageSettings = {
  showCreateYourOwnButton: false,
  texts: {},
};

/**
 * The settings of the public photo page of an event. The page shows the photo itself; the switches that chose between the photo, the original
 * capture and the approved try-on pictures (`includeOriginalCapture`, `includeCameraResult`, `includeTryOnResult`, `includeFramedTryOnResult`,
 * `includeCheckedInTryOnResult`, the legacy `photoMode`) and the pending try-on message went with the try-on integration (issue 557). A stored
 * object that still has them is read without them, and saving the event writes it back without them.
 */
export function normalizeEventSharePageSettings(value: unknown): EventSharePageSettings {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    showCreateYourOwnButton:
      source.showCreateYourOwnButton === undefined
        ? false
        : Boolean(source.showCreateYourOwnButton),
    texts: normalizeSharePageTexts(source.texts),
  };
}
