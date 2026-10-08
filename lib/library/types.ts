/**
 * What the library APIs return and the library pages read (camera#361). Types only: a page imports this file without pulling in any server code.
 */

import type { MessageArea } from '@/lib/frame/message-area';
import type { LibraryKind, LibraryScope } from './kinds';

/** What the pages need of an item: its picture, name and owner. */
export interface LibraryItemView {
  id: string;
  kind: LibraryKind;
  name: string;
  description: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  /** Where an item that was not uploaded came from: `messmass` for the partner's logo imported from messmass (camera#367). */
  source?: string;
  scope: LibraryScope;
  /** The item's own switch in the library (an inactive item cannot be newly taken). */
  itemActive: boolean;
  createdAt: string | null;
  /** A frame that carries the messages of an event (camera#366): where the message is written. Null for a complete frame and for the other kinds. */
  messageArea: MessageArea | null;
}

export interface PartnerLibraryEntry extends LibraryItemView {
  /** `assigned`: taken from the global library; `own`: uploaded for this partner. */
  via: 'assigned' | 'own';
  isDefault: boolean;
}

export interface PartnerLibrary {
  kind: LibraryKind;
  /** False while the list is computed from what the partner had before the libraries; the first save makes it the partner's own list. */
  saved: boolean;
  items: PartnerLibraryEntry[];
  /** Active items of the global library the partner does not have yet. */
  available: LibraryItemView[];
  missing: string[];
}

export interface EventLibraryEntry extends LibraryItemView {
  /** The event's assignment row as stored (`isActive`, `addedAt`, `addedBy`; for logos also `scenario` and `order`). */
  assignment: Record<string, unknown>;
  /** False when the partner has removed the item from its library since the event took it (the event keeps it). */
  stillInPartnerLibrary: boolean;
}

export interface EventLibrary {
  kind: LibraryKind;
  /** `adminId` is the Mongo id the admin pages use in their addresses. */
  partner: { partnerId: string; adminId: string; name: string } | null;
  assigned: EventLibraryEntry[];
  /** Taken-able items: the partner's library items and the event's own uploads that the event has not assigned. */
  available: LibraryItemView[];
  /** Assignments whose item no longer exists in the library. */
  missing: Array<{ id: string; assignment: Record<string, unknown> }>;
}

/** An image of the global Images page (camera#368); in the "every upload" view it says whose upload it is (null: a global image). */
export interface GlobalImageEntry extends LibraryItemView {
  owner: { level: 'partner' | 'event'; name: string } | null;
}
