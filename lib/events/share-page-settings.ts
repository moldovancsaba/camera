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
  relatedPhotosTitle: 'sharePage.relatedPhotosTitle',
  originalPhotoLabel: 'sharePage.originalPhotoLabel',
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

/**
 * The message shown while a requested try-on picture is not ready: the event's own, or the default in the event's language. The event editor
 * pre-fills and saves the English default, so in another language that stored default counts as not set.
 */
export function pendingTryOnText(settings: { pendingTryOnMessage?: string | null } | null | undefined, language: UiLanguage = DEFAULT_UI_LANGUAGE, texts?: TextOverrides | null): string {
  return textOr(language, 'sharePage.pendingTryOn', settings?.pendingTryOnMessage, undefined, texts);
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
  includeOriginalCapture: boolean;
  includeCameraResult: boolean;
  includeTryOnResult: boolean;
  includeFramedTryOnResult: boolean;
  includeCheckedInTryOnResult: boolean;
  showCreateYourOwnButton: boolean;
  pendingTryOnMessage: string;
  /** The event's own texts for the fixed words of the page; the ones it has not written are the defaults. */
  texts: SharePageTexts;
}

export const DEFAULT_PENDING_TRYON_MESSAGE = translate(DEFAULT_UI_LANGUAGE, 'sharePage.pendingTryOn');

export const DEFAULT_EVENT_SHARE_PAGE_SETTINGS: EventSharePageSettings = {
  includeOriginalCapture: false,
  includeCameraResult: true,
  includeTryOnResult: true,
  includeFramedTryOnResult: true,
  includeCheckedInTryOnResult: false,
  showCreateYourOwnButton: false,
  pendingTryOnMessage: DEFAULT_PENDING_TRYON_MESSAGE,
  texts: {},
};

export function normalizeEventSharePageSettings(value: unknown): EventSharePageSettings {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const legacyMode = source.photoMode;
  const pendingTryOnMessage =
    typeof source.pendingTryOnMessage === 'string'
      ? source.pendingTryOnMessage.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(0, 500)
      : '';

  return {
    includeOriginalCapture:
      source.includeOriginalCapture === undefined
        ? DEFAULT_EVENT_SHARE_PAGE_SETTINGS.includeOriginalCapture
        : Boolean(source.includeOriginalCapture),
    includeCameraResult:
      source.includeCameraResult === undefined
        ? legacyMode !== 'approved_tryon_only'
        : Boolean(source.includeCameraResult),
    includeTryOnResult:
      source.includeTryOnResult === undefined
        ? legacyMode !== 'original_only'
        : Boolean(source.includeTryOnResult),
    includeFramedTryOnResult:
      source.includeFramedTryOnResult === undefined
        ? legacyMode !== 'original_only'
        : Boolean(source.includeFramedTryOnResult),
    includeCheckedInTryOnResult:
      source.includeCheckedInTryOnResult === undefined
        ? false
        : Boolean(source.includeCheckedInTryOnResult),
    showCreateYourOwnButton:
      source.showCreateYourOwnButton === undefined
        ? false
        : Boolean(source.showCreateYourOwnButton),
    pendingTryOnMessage: pendingTryOnMessage || DEFAULT_PENDING_TRYON_MESSAGE,
    texts: normalizeSharePageTexts(source.texts),
  };
}
