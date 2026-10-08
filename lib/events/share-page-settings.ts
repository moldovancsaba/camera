/**
 * The fixed texts of the public photo page and of its waiting and not-approved notices (camera#339, planning items 74 and 75). Each has the English
 * text it always had as its default; an event's setting replaces it, an empty setting means the default (nothing is frozen into the event).
 */
export const SHARE_PAGE_TEXT_DEFAULTS = {
  downloadButton: 'Download',
  createYourOwnButton: 'Create Your Own',
  relatedPhotosTitle: 'Related photos',
  originalPhotoLabel: 'Original photo taken',
  waitingTitle: 'Waiting for approval',
  waitingMessage: 'Your photo is waiting for approval. This page updates by itself, and we will email you the link as soon as it is approved.',
  notApprovedTitle: 'Not approved',
  notApprovedMessage: 'Your photo could not be approved, so it will not be published.',
  notApprovedHint: 'You are welcome to take another photo.',
  takeAnotherPhotoButton: 'Take another photo',
} as const;

export type SharePageTextKey = keyof typeof SHARE_PAGE_TEXT_DEFAULTS;
export type SharePageTexts = Partial<Record<SharePageTextKey, string>>;

const SHARE_PAGE_TEXT_MAX_LENGTH = 500;

/** The text of the page: the event's own, or the default when it has none. */
export function sharePageText(settings: { texts?: SharePageTexts } | null | undefined, key: SharePageTextKey): string {
  const own = settings?.texts?.[key];
  return typeof own === 'string' && own.trim() ? own : SHARE_PAGE_TEXT_DEFAULTS[key];
}

/** Only the texts an editor really wrote are kept (trimmed, limited); everything else stays the default. */
export function normalizeSharePageTexts(value: unknown): SharePageTexts {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const texts: SharePageTexts = {};
  for (const key of Object.keys(SHARE_PAGE_TEXT_DEFAULTS) as SharePageTextKey[]) {
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

export const DEFAULT_PENDING_TRYON_MESSAGE = 'We are processing your image. Come back later.';

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
