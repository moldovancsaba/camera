/**
 * The message of the generated default frame (docs/DEFAULT_FRAME_PLAN.md, camera#232): a list the event
 * editor controls, one entry picked at random on every shutter press. Pure, so it is unit-tested.
 *
 * Placeholders: `{partner1}` is the home team's name, `{partner2}` the visitor's. A message whose
 * placeholder cannot be filled is skipped, and a raw placeholder is never drawn.
 */

export const DEFAULT_FRAME_MESSAGES: readonly string[] = [
  'Go! Go! Go!',
  'Let’s Go, {partner1}',
  'We are the Best!',
  'Together for Victory!',
  '🫶 Let’s Go 🫶',
];

/** Each message is one stored image, so the list is capped. */
export const MAX_FRAME_MESSAGES = 10;
export const MAX_FRAME_MESSAGE_LENGTH = 80;

export interface MessageTokens {
  partner1?: string | null;
  partner2?: string | null;
}

export interface UsableMessage {
  /** Position in the event's list, so the pick can be recorded and not repeated. */
  index: number;
  text: string;
}

const PLACEHOLDER = /\{([^{}]*)\}/g;
const KNOWN_PLACEHOLDERS = new Set(['partner1', 'partner2']);

/** The message with its placeholders filled, or null when one cannot be (unknown, or no name for it). */
export function fillMessage(template: string, tokens: MessageTokens): string | null {
  let missing = false;
  const text = template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = KNOWN_PLACEHOLDERS.has(name) ? tokens[name as keyof MessageTokens]?.trim() : '';
    if (!value) missing = true;
    return value ?? '';
  });
  return missing ? null : text;
}

export function usableMessages(templates: readonly string[], tokens: MessageTokens): UsableMessage[] {
  const usable: UsableMessage[] = [];
  templates.forEach((template, index) => {
    const text = fillMessage(template, tokens);
    if (text !== null) usable.push({ index, text });
  });
  return usable;
}

/** A random usable message, never the one used last time when another is available; null when none is usable. */
export function pickMessage(
  usable: readonly UsableMessage[],
  previousIndex: number | null,
  random: () => number = Math.random
): UsableMessage | null {
  if (usable.length === 0) return null;
  const candidates = usable.length > 1 ? usable.filter((message) => message.index !== previousIndex) : usable;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

export type ValidatedMessages = { ok: true; messages: string[] } | { ok: false; error: string };

/** What the event editor may save: at most 10 trimmed, non-empty messages that use only the known placeholders. */
export function validateMessages(input: unknown): ValidatedMessages {
  if (!Array.isArray(input)) return { ok: false, error: 'Messages must be a list' };
  if (input.length > MAX_FRAME_MESSAGES) return { ok: false, error: `At most ${MAX_FRAME_MESSAGES} messages` };

  const messages: string[] = [];
  for (const [position, value] of input.entries()) {
    if (typeof value !== 'string') return { ok: false, error: `Message ${position + 1} must be text` };
    const text = value.trim();
    if (!text) return { ok: false, error: `Message ${position + 1} is empty` };
    if (Array.from(text).length > MAX_FRAME_MESSAGE_LENGTH) {
      return { ok: false, error: `Message ${position + 1} is longer than ${MAX_FRAME_MESSAGE_LENGTH} characters` };
    }
    for (const [, name] of text.matchAll(PLACEHOLDER)) {
      if (!KNOWN_PLACEHOLDERS.has(name)) return { ok: false, error: `Message ${position + 1} uses an unknown placeholder {${name}}` };
    }
    if (/[{}]/.test(text.replace(PLACEHOLDER, ''))) {
      return { ok: false, error: `Message ${position + 1} has a stray brace` };
    }
    messages.push(text);
  }
  return { ok: true, messages };
}
