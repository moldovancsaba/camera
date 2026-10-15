import type { Choice } from '@/lib/frame/choose';

/** A selection is only a short-lived continuation of the same guest session. */
export const CAPTURE_SELECTION_MAX_AGE_MS = 30 * 60 * 1000;

const key = (eventId: string) => `camera:capture-selection:v1:${eventId}`;

type StorageReader = Pick<Storage, 'getItem' | 'removeItem'>;
type StorageWriter = Pick<Storage, 'setItem' | 'removeItem'>;

export interface RememberedCaptureSelection {
  choice: Choice;
  /** Detects a message list edit/reorder that reused the same array index during SSO. */
  messageText: string | null;
}

function validChoice(value: unknown): value is Choice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const choice = value as Partial<Choice>;
  return (choice.layoutId === null || (typeof choice.layoutId === 'string' && choice.layoutId.length > 0 && choice.layoutId.length <= 200)) &&
    (choice.messageIndex === null || (Number.isSafeInteger(choice.messageIndex) && Number(choice.messageIndex) >= 0 && Number(choice.messageIndex) < 100));
}

/** Remember only stable selection identifiers, never an image, user detail, or frame URL. */
export function rememberCaptureSelection(
  storage: StorageWriter | null | undefined,
  eventId: string,
  choice: Choice,
  messageText: string | null = null,
  now: number = Date.now(),
): void {
  try {
    if (!storage) return;
    if (!choice.layoutId && choice.messageIndex === null) {
      storage.removeItem(key(eventId));
      return;
    }
    storage.setItem(key(eventId), JSON.stringify({ version: 1, eventId, savedAt: now, choice, messageText }));
  } catch {
    // Storage can be unavailable in private browsing; the capture flow still works in memory.
  }
}

/** Read a recent, event-scoped selection after same-tab SSO or a page reload. */
export function recallCaptureSelection(
  storage: StorageReader | null | undefined,
  eventId: string,
  now: number = Date.now(),
): RememberedCaptureSelection | null {
  try {
    const raw = storage?.getItem(key(eventId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { version?: unknown; eventId?: unknown; savedAt?: unknown; choice?: unknown; messageText?: unknown };
    if (
      saved.version !== 1 ||
      saved.eventId !== eventId ||
      typeof saved.savedAt !== 'number' ||
      now < saved.savedAt ||
      now - saved.savedAt > CAPTURE_SELECTION_MAX_AGE_MS ||
      !validChoice(saved.choice) ||
      (saved.messageText !== null && typeof saved.messageText !== 'string') ||
      (saved.choice.messageIndex !== null && typeof saved.messageText !== 'string')
    ) {
      storage?.removeItem(key(eventId));
      return null;
    }
    return { choice: { layoutId: saved.choice.layoutId, messageIndex: saved.choice.messageIndex }, messageText: saved.messageText as string | null };
  } catch {
    return null;
  }
}

export function forgetCaptureSelection(storage: Pick<Storage, 'removeItem'> | null | undefined, eventId: string): void {
  try {
    storage?.removeItem(key(eventId));
  } catch {
    // A completed or restarted flow must not fail because storage is unavailable.
  }
}
