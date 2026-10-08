/**
 * The picture picker of a picture field (camera#368, components/admin/library/ImagePicker.tsx): which Images library a field chooses from (the level of
 * the page it is on), what of it can be chosen, and whether a typed address can be shown. The field itself keeps a plain address, exactly as before.
 * Pure and client-safe, so it is unit-tested (picker.test.ts).
 */

import type { ImageFileType } from './image-files';
import type { LibraryItemView } from './types';

/** The level of the page a picture field is on. The ids are the Mongo `_id` of the partner or the event, as in the other admin routes. */
export type PickerLevel = { scope: 'global' } | { scope: 'partner'; partnerId: string } | { scope: 'event'; eventId: string };

export interface PickerEndpoints {
  /** The library of the level (GET). */
  list: string;
  /** Where an upload at the level goes (POST, multipart, `kind=images`). */
  upload: string;
  /** The Images page of the level. */
  page: string;
  /** The library in words: "the images of this event". */
  words: string;
}

export function pickerEndpoints(level: PickerLevel): PickerEndpoints {
  if (level.scope === 'event') {
    return { list: `/api/events/${level.eventId}/library?kind=images`, upload: `/api/events/${level.eventId}/library/upload`, page: `/admin/events/${level.eventId}/images`, words: 'the images of this event' };
  }
  if (level.scope === 'partner') {
    return { list: `/api/partners/${level.partnerId}/library?kind=images`, upload: `/api/partners/${level.partnerId}/library/upload`, page: `/admin/partners/${level.partnerId}/images`, words: 'the images of this partner' };
  }
  return { list: '/api/images', upload: '/api/images', page: '/admin/images', words: 'the global images' };
}

const EXTENSION_TYPES: Record<string, ImageFileType> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

/** The file type of a picture from its address (the store names a library picture by its type: `image-1760000000000-ab12.png`); null when it does not say. */
export function pictureFileType(url: string | null | undefined): ImageFileType | null {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec((url ?? '').trim());
  return match ? EXTENSION_TYPES[match[1].toLowerCase()] ?? null : null;
}

/**
 * What a field can choose, from the answer of the list route of its level: an event's library is `available` (its partner's library and its own
 * uploads), a partner's is `items`, the global one `items`. Pictures that are switched off, or have no address, are left out, and so is a picture
 * of a type the field does not take (`fileTypes`; a picture whose type the address does not say is kept).
 */
export function pickableImages(scope: PickerLevel['scope'], data: unknown, fileTypes?: readonly ImageFileType[]): LibraryItemView[] {
  const list = (data as Record<string, unknown> | null | undefined)?.[scope === 'event' ? 'available' : 'items'];
  if (!Array.isArray(list)) return [];
  return (list as LibraryItemView[]).filter((item) => {
    if (!item || typeof item.imageUrl !== 'string' || !item.imageUrl || item.itemActive === false) return false;
    const type = pictureFileType(item.imageUrl);
    return !fileTypes || !type || fileTypes.includes(type);
  });
}

/** The address as the preview can draw it: an http(s) address or a path of this site; null while it is not one (still being typed). */
export function previewableUrl(value: string | null | undefined): string | null {
  const url = (value ?? '').trim();
  if (!url) return null;
  if (url.startsWith('/')) return url.startsWith('//') ? null : url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** The library picture behind a field's address, when the address is one of the library's (it may as well be typed or pasted by hand). */
export function libraryItemFor(value: string | null | undefined, items: readonly LibraryItemView[]): LibraryItemView | null {
  const url = (value ?? '').trim();
  if (!url) return null;
  return items.find((item) => item.imageUrl === url) ?? null;
}

/** What the field stores when a library picture is chosen: its plain address, the same kind of string the field held before the library. */
export function chosenValue(item: Pick<LibraryItemView, 'imageUrl'>): string {
  return item.imageUrl ?? '';
}
