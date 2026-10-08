/**
 * The libraries (epic camera#361, docs/LIBRARIES.md): three levels, one way only, Global -> Partner -> Event, for frames, logos and images.
 *
 * - **Global**: where items are collected (global admins). Every item that existed before the libraries is global: a missing `scope` means global.
 * - **Partner**: the items the partner took from the global library, plus its own uploads (`scope: 'partner'`).
 * - **Event**: the items the event took from its partner's library, plus its own uploads (`scope: 'event'`); this is the "Assigned" list of the event.
 *
 * This file holds the vocabulary shared by the rules (rules.ts), the database layer (db.ts) and the pages; it has no database access.
 */

import { COLLECTIONS } from '@/lib/db/schemas';

export const LIBRARY_KINDS = ['frames', 'logos', 'images'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/**
 * Whether an event assigns items of the kind (a list on the event: `Event.frames[]`, `Event.logos[]`). Images are not assigned (camera#368): a
 * picture field of the event (welcome page, CTA page, email footer, screen overlay) keeps the address of one picture, so an event's images
 * library is what its fields may choose from, and images have no defaults for new events.
 */
export function isAssignedKind(kind: LibraryKind): boolean {
  return kind !== 'images';
}

export type LibraryScope = 'global' | 'partner' | 'event';

/** Who owns a library item. `partnerId` is the partner UUID; `eventId` is the event UUID (`Event.eventId`). */
export interface ScopeFields {
  scope?: LibraryScope | null;
  partnerId?: string | null;
  eventId?: string | null;
}

/** The kind from a request value, or null. */
export function parseKind(value: unknown): LibraryKind | null {
  return typeof value === 'string' && (LIBRARY_KINDS as readonly string[]).includes(value) ? (value as LibraryKind) : null;
}

/** The library collection and the id field of each kind (`frameId`, `logoId`, `pictureId`). */
export const KIND_META: Record<LibraryKind, { collection: string; idField: string; noun: string }> = {
  frames: { collection: COLLECTIONS.FRAMES, idField: 'frameId', noun: 'frame' },
  logos: { collection: COLLECTIONS.LOGOS, idField: 'logoId', noun: 'logo' },
  images: { collection: COLLECTIONS.IMAGES, idField: 'pictureId', noun: 'image' },
};

type Row = Record<string, unknown> | null | undefined;

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : []);

/** The ids of the items an event has assigned (`Event.frames[].frameId`, `Event.logos[].logoId`), without duplicates; none for images (not assigned). */
export function eventAssignedIds(kind: LibraryKind, event: Row): string[] {
  if (!isAssignedKind(kind)) return [];
  const rows = (event as { [key: string]: unknown } | null | undefined)?.[kind];
  if (!Array.isArray(rows)) return [];
  const ids = rows.map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>)[KIND_META[kind].idField] : null));
  return [...new Set(strings(ids))];
}

/** The ids a partner marks as defaults for its new events (`Partner.defaultFrames`, the logos of `Partner.defaultLogos`), without duplicates; none for images. */
export function partnerDefaultIds(kind: LibraryKind, partner: Row): string[] {
  if (!isAssignedKind(kind)) return [];
  if (kind === 'frames') return [...new Set(strings((partner as { defaultFrames?: unknown } | null | undefined)?.defaultFrames))];
  const rows = (partner as { defaultLogos?: unknown } | null | undefined)?.defaultLogos;
  return Array.isArray(rows) ? [...new Set(strings(rows.map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>).logoId : null))))] : [];
}

/**
 * The ids a partner has saved as taken from the global library (`Partner.library[kind]`), or undefined while it has not saved a library. For images
 * that list is all a partner took (it had none before the libraries), so until its first save a partner's images library is its own uploads only.
 */
export function partnerSavedIds(kind: LibraryKind, partner: Row): string[] | undefined {
  const library = (partner as { library?: unknown } | null | undefined)?.library;
  if (!library || typeof library !== 'object') return undefined;
  const list = (library as Record<string, unknown>)[kind];
  return Array.isArray(list) ? [...new Set(strings(list))] : undefined;
}
