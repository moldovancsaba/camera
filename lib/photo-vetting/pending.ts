/**
 * The pending photo of a vetted event (camera#266, docs/PHOTO_VETTING_PLAN.md): the plain framed-size photo, stored as an unlisted
 * Blob object (random path, never mirrored to imgbb, never returned by a public route), the guest identity the approval email goes to,
 * and the opaque share token. The branded composite does not exist until approval.
 */

import { randomBytes } from 'node:crypto';
import { put } from '@vercel/blob';

/** Where pending photos live in the Blob store; every file under it is private to the moderation tools. */
export const PENDING_PHOTO_PREFIX = 'pending/';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** A framed-size photo is a few hundred kilobytes; anything past this is not one. */
export const PENDING_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export interface ParsedImageData {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
}

/** `data:image/jpeg;base64,…` as a type and the base64 part; null for anything that is not a JPEG, PNG or WebP data URL. */
export function parseImageDataUrl(imageData: unknown): ParsedImageData | null {
  if (typeof imageData !== 'string') return null;
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(imageData);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!ALLOWED_TYPES.has(mime)) return null;
  return { mime: mime as ParsedImageData['mime'], base64: match[2].replace(/\s+/g, '') };
}

const EXTENSIONS: Record<ParsedImageData['mime'], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** `pending/<event>/<random>.jpg`; the store adds its own random suffix on top, so the URL cannot be guessed. */
export function pendingPhotoPath(eventKey: string, mime: ParsedImageData['mime'], random: string = randomBytes(12).toString('hex')): string {
  const safeEvent = eventKey.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'event';
  return `${PENDING_PHOTO_PREFIX}${safeEvent}/${random}.${EXTENSIONS[mime]}`;
}

export interface StoredPendingPhoto {
  url: string;
  size: number;
  mime: ParsedImageData['mime'];
}

export interface PendingStoreDeps {
  put: (pathname: string, body: Buffer, options: { access: 'public'; contentType: string; addRandomSuffix: boolean }) => Promise<{ url: string }>;
}

const defaultDeps: PendingStoreDeps = { put: (pathname, body, options) => put(pathname, body, options) };

/** Stores the guest's plain photo. Throws on anything that is not a photo of a sane size; the caller answers 400. */
export async function storePendingPhoto(imageData: unknown, eventKey: string, deps: PendingStoreDeps = defaultDeps): Promise<StoredPendingPhoto> {
  const parsed = parseImageDataUrl(imageData);
  if (!parsed) throw new Error('The photo must be a JPEG, PNG or WebP image');
  const body = Buffer.from(parsed.base64, 'base64');
  if (body.length === 0 || body.length > PENDING_PHOTO_MAX_BYTES) throw new Error('The photo has an unsupported size');
  const stored = await deps.put(pendingPhotoPath(eventKey, parsed.mime), body, { access: 'public', contentType: parsed.mime, addRandomSuffix: true });
  return { url: stored.url, size: body.length, mime: parsed.mime };
}

/** The share token of a vetted photo: 144 random bits, URL safe. Old photos keep their database id as the share id. */
export function newShareToken(): string {
  return randomBytes(18).toString('base64url');
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const isValidEmail = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && EMAIL.test(value.trim());

export interface GuestIdentity {
  email: string;
  name: string | null;
}

/**
 * Who the guest is, for the email that carries the link once the photo is approved: the email typed on the "who are you" page, or the
 * email of the logged-in user (a social login). Null when there is none: a vetted event does not save a photo without one.
 */
export function guestIdentity(userInfo: { email?: unknown; name?: unknown; [key: string]: unknown } | null | undefined, session: { user?: { email?: string | null; name?: string | null } | null } | null | undefined): GuestIdentity | null {
  if (isValidEmail(userInfo?.email)) {
    return { email: userInfo.email.trim(), name: typeof userInfo.name === 'string' && userInfo.name.trim() ? userInfo.name.trim() : null };
  }
  const sessionEmail = session?.user?.email;
  if (isValidEmail(sessionEmail) && !sessionEmail.startsWith('anonymous@')) {
    return { email: sessionEmail.trim(), name: session?.user?.name?.trim() || null };
  }
  return null;
}
