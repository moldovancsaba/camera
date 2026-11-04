/**
 * A message can be selected or added while uploading an event-owned frame.
 * The wording remains event-owned; the uploaded frame only becomes one of the
 * designs that message can use.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { apiBadRequest, apiError } from '@/lib/api';
import { DEFAULT_FRAME_MESSAGES, validateMessages } from './messages';
import { loadMessageFrames, parseMessageFrames } from './message-frames';
import type { FrameDesign } from './context';
import { effectiveMessageFrames, framesOfMessage } from './selection';

export type UploadMessageMode = 'none' | 'existing' | 'new';

export interface PreparedUploadMessage {
  mode: Exclude<UploadMessageMode, 'none'>;
  messages: string[];
  messageFrames: Record<string, string | string[]>;
  message: string;
}

/** Validate message choice and image-count limits before storing the uploaded file. */
export function prepareUploadMessage(
  mode: unknown,
  value: unknown,
  currentMessages: readonly string[],
  currentChoices: FrameDesign['messageFrames'] | undefined,
  includeGeneratedFallback = true,
): PreparedUploadMessage | null {
  if (mode === 'none' || mode === undefined || mode === null || mode === '') return null;
  if (mode !== 'existing' && mode !== 'new') throw apiBadRequest('Choose an existing event message, add a new one, or leave the frame without a message.');
  const message = typeof value === 'string' ? value.trim() : '';
  if (!message) throw apiBadRequest('Enter or choose a message for this frame.');

  let messages = [...currentMessages];
  if (mode === 'existing') {
    if (!messages.includes(message)) throw apiBadRequest('That message is no longer in this event. Reload the page and choose again.');
  } else {
    if (messages.includes(message)) throw apiBadRequest('That message already exists. Choose it from the list instead.');
    messages = [...messages, message];
  }

  const validated = validateMessages(messages);
  if (!validated.ok) throw apiBadRequest(validated.error);
  // The real frame ID is not known until after upload. A bounded placeholder
  // lets us reject the 40-image limit before the file reaches media storage.
  const choices = Object.fromEntries(Object.entries(currentChoices ?? {}).filter(([key]) => messages.includes(key)));
  const selectedIds = framesOfMessage(choices, message);
  const parsed = parseMessageFrames({ ...choices, [message]: [...selectedIds, '__uploading_frame__'] }, validated.messages, includeGeneratedFallback);
  if (!parsed.ok) throw apiBadRequest(parsed.error);
  return { mode, messages: validated.messages, messageFrames: parsed.messageFrames, message };
}

/**
 * Attach an already-assigned, message-area frame to an event message. The
 * write is compare-and-set with bounded retries so a concurrent editor save is
 * re-read and merged instead of silently overwritten.
 */
export async function associateUploadedFrameMessage(
  db: Db,
  event: Document,
  frameId: string,
  prepared: PreparedUploadMessage,
): Promise<FrameDesign> {
  const events = db.collection(COLLECTIONS.EVENTS);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = attempt === 0 ? event : await events.findOne({ _id: event._id });
    if (!latest) throw apiBadRequest('The event is no longer available. Reload and try again.');
    const current = latest.frameDesign as FrameDesign | undefined;
    if (!current?.context) throw apiBadRequest('The event frame settings are not ready. Reload and try again.');
    const assignment = ((latest.frames as Document[] | undefined) ?? []).find((row) => row?.frameId === frameId && row?.isActive === true);
    const carriers = assignment ? await loadMessageFrames(db, latest) : new Map();
    if (!carriers.has(frameId)) throw apiBadRequest('The uploaded frame is not available as a message design.');

    if (prepared.mode === 'existing' && !current.messages.includes(prepared.message)) {
      throw apiBadRequest('That message was removed while the frame was uploading. Reload and choose again.');
    }
    const messages = current.messages.includes(prepared.message)
      ? current.messages
      : [...current.messages, prepared.message];
    const validated = validateMessages(messages);
    if (!validated.ok) throw apiBadRequest(validated.error);
    const choices = Object.fromEntries(Object.entries(effectiveMessageFrames(current)).filter(([key]) => validated.messages.includes(key)));
    const selectedIds = framesOfMessage(choices, prepared.message);
    const parsed = parseMessageFrames({ ...choices, [prepared.message]: [...selectedIds, frameId] }, validated.messages, latest.generatedFrameEnabled === true);
    if (!parsed.ok) throw apiBadRequest(parsed.error);

    const now = generateTimestamp();
    const design: FrameDesign = {
      ...current,
      messages: validated.messages,
      messagesOverridden: validated.messages.length !== DEFAULT_FRAME_MESSAGES.length || validated.messages.some((message, index) => message !== DEFAULT_FRAME_MESSAGES[index]),
      messageFrames: parsed.messageFrames,
      messageFramesOverridden: true,
      updatedAt: now,
    };
    const versionFilter = current.updatedAt
      ? { 'frameDesign.updatedAt': current.updatedAt }
      : { frameDesign: latest.frameDesign };
    const result = await events.updateOne({ _id: latest._id, ...versionFilter }, {
      $set: {
        'frameDesign.messages': design.messages,
        'frameDesign.messagesOverridden': design.messagesOverridden,
        'frameDesign.messageFrames': design.messageFrames,
        'frameDesign.messageFramesOverridden': true,
        'frameDesign.updatedAt': design.updatedAt,
        updatedAt: now,
      },
    });
    if (result.matchedCount === 1) return design;
  }
  throw apiError('The event messages changed while this frame was uploading. The frame is saved; reload the page and attach its message again.', 409);
}
