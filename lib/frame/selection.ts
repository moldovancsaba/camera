/**
 * How a user gets the layout and the message of the frame at an event (epic 444, docs/FRAME_LAYOUT_SELECTION_PLAN.md, segment S1).
 *
 * Two independent settings, each **the editor chooses** (with the editor's pick), **random** (a new draw at every photo, never the same twice in a row) or **the user chooses**.
 * When both are "the user chooses" the order is design first, message second. An event that never set it (`Event.frameSelection` missing) keeps what it always did, so
 * nothing changes for any event until an editor saves the setting.
 *
 * Pure and client-safe: the parsing of a request and the options the editor sees. The page that loads the frames of an event is `selection-options.ts`.
 */

import type { FrameDesign } from './context';
import { messageTokens, usableMessages } from './messages';

/** The id of the generated layout among the layouts of an event (a library frame has its own id). */
export const GENERATED_LAYOUT = 'generated';

export const SELECT_MODES = ['editor', 'random', 'user'] as const;
export type SelectMode = (typeof SELECT_MODES)[number];

/** One of the two settings: the way, and for `editor` what the editor picked (a layout id, or the text of a message as it stands in the list). */
export interface SelectionPart {
  mode: SelectMode;
  pick: string | null;
}

export interface FrameSelection {
  layout: SelectionPart;
  message: SelectionPart;
}

export interface LayoutOption {
  id: string;
  name: string;
}

export interface MessageOption {
  /** The message as it stands in the list (what a pick is stored as). */
  text: string;
  /** The message as users read it, with the names filled in. */
  shown: string;
}

/** A: only the generated layout exists. B: one layout the editor made. C: more than one (nothing to choose from when there is one). */
export type LayoutSituation = 'A' | 'B' | 'C';

export const situationOf = (layouts: readonly LayoutOption[]): LayoutSituation =>
  layouts.length > 1 ? 'C' : layouts.length === 1 && layouts[0].id !== GENERATED_LAYOUT ? 'B' : 'A';

const isMode = (value: unknown): value is SelectMode => (SELECT_MODES as readonly string[]).includes(value as string);

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export type ParsedSelection = { ok: true; value: FrameSelection | null } | { ok: false; error: string };

function part(input: unknown, noun: string, known: readonly string[]): { ok: true; value: SelectionPart } | { ok: false; error: string } {
  const row = record(input);
  if (!row || !isMode(row.mode)) return { ok: false, error: `The ${noun} setting must be one of: ${SELECT_MODES.join(', ')}` };
  if (row.mode !== 'editor') return { ok: true, value: { mode: row.mode, pick: null } };
  if (typeof row.pick !== 'string' || row.pick === '') return { ok: false, error: `Choose which ${noun} the users get` };
  if (!known.includes(row.pick)) return { ok: false, error: `The ${noun} you chose is not one of this event’s ${noun}s` };
  return { ok: true, value: { mode: 'editor', pick: row.pick } };
}

/**
 * The setting from a request, checked against what the event has (`layouts` are layout ids, `messages` the messages as listed). Nothing or null takes the setting away, which
 * means what the event always did. An `editor` pick must name a layout or a message the event has, so a pick can never point at nothing.
 */
export function parseFrameSelection(input: unknown, known: { layouts: readonly string[]; messages: readonly string[] }): ParsedSelection {
  if (input === undefined || input === null) return { ok: true, value: null };
  const row = record(input);
  if (!row) return { ok: false, error: 'The selection must be an object with a layout and a message' };
  const layout = part(row.layout, 'layout', known.layouts);
  if (!layout.ok) return layout;
  const message = part(row.message, 'message', known.messages);
  if (!message.ok) return message;
  return { ok: true, value: { layout: layout.value, message: message.value } };
}

/** What is stored, read tolerantly: anything that no longer parses is "not set" (a stored value is never trusted more than a request). */
export function storedFrameSelection(value: unknown): FrameSelection | null {
  const row = record(value);
  if (!row) return null;
  const read = (input: unknown): SelectionPart | null => {
    const one = record(input);
    if (!one || !isMode(one.mode)) return null;
    return { mode: one.mode, pick: one.mode === 'editor' && typeof one.pick === 'string' && one.pick ? one.pick : null };
  };
  const layout = read(row.layout);
  const message = read(row.message);
  return layout && message ? { layout, message } : null;
}

/** The message-to-frame choices: one frame id, or a list of them for a message on several designs (segment S3). */
export type MessageFrameChoices = Record<string, string | string[]>;

interface DesignLike {
  messages: FrameDesign['messages'];
  messageFrames?: MessageFrameChoices;
  context?: FrameDesign['context'];
}

/** The library frames a message is written on: the choice is one frame id, or a list of them (a message on several designs). Empty = the generated layout. */
export function framesOfMessage(messageFrames: MessageFrameChoices | undefined, message: string): string[] {
  const value: unknown = messageFrames?.[message];
  const ids = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id !== ''))];
}

/**
 * The layouts of an event, in the order users meet them. The event's own complete frames when it has any (the generated frame is not used then); otherwise the frames its
 * messages are written on (only those that can still carry a message), and the generated layout when some message is not written on a frame or the event has no message.
 */
export function layoutOptionsOf(input: {
  ownFrames: readonly LayoutOption[];
  carriers: readonly LayoutOption[];
  design: DesignLike | null;
}): LayoutOption[] {
  if (input.ownFrames.length > 0) return [...input.ownFrames];
  const carrierById = new Map(input.carriers.map((carrier) => [carrier.id, carrier]));
  const used = new Set<string>();
  let generated = false;
  const messages = input.design ? usableOf(input.design).map((message) => message.text) : [];
  for (const message of messages) {
    const ids = framesOfMessage(input.design?.messageFrames, message).filter((id) => carrierById.has(id));
    if (ids.length === 0) generated = true;
    ids.forEach((id) => used.add(id));
  }
  if (messages.length === 0) generated = true;
  const layouts = input.carriers.filter((carrier) => used.has(carrier.id));
  return generated ? [...layouts, { id: GENERATED_LAYOUT, name: 'Generated layout' }] : layouts;
}

function usableOf(design: DesignLike): Array<{ index: number; text: string; shown: string }> {
  const tokens = design.context
    ? messageTokens({ home: design.context.event.homeTeam?.name, visitor: design.context.event.visitorTeam?.name, eventName: design.context.event.name })
    : {};
  return usableMessages(design.messages, tokens).map((message) => ({ index: message.index, text: design.messages[message.index], shown: message.text }));
}

/** The messages users can get at this event: those that can be filled with this event's names. */
export function messageOptionsOf(design: DesignLike | null): MessageOption[] {
  return design ? usableOf(design).map(({ text, shown }) => ({ text, shown })) : [];
}

/**
 * What an event does when its setting was never saved, written as a setting so the editor starts from the truth: users choose between complete frames of the event's own
 * when there are several (the select frame step), and every other choice is random.
 */
export function todaysSelection(ownFrameCount: number): FrameSelection {
  return { layout: { mode: ownFrameCount > 1 ? 'user' : 'random', pick: null }, message: { mode: 'random', pick: null } };
}
