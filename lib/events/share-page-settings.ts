export interface EventSharePageSettings {
  includeOriginalCapture: boolean;
  includeCameraResult: boolean;
  includeTryOnResult: boolean;
  includeFramedTryOnResult: boolean;
  pendingTryOnMessage: string;
}

export const DEFAULT_PENDING_TRYON_MESSAGE = 'We are processing your image. Come back later.';

export const DEFAULT_EVENT_SHARE_PAGE_SETTINGS: EventSharePageSettings = {
  includeOriginalCapture: false,
  includeCameraResult: true,
  includeTryOnResult: true,
  includeFramedTryOnResult: true,
  pendingTryOnMessage: DEFAULT_PENDING_TRYON_MESSAGE,
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
    pendingTryOnMessage: pendingTryOnMessage || DEFAULT_PENDING_TRYON_MESSAGE,
  };
}
