import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { VisualAssetKind, VisualAssetLevelPolicy } from './contracts';
import { resolveAssetVisibility } from './resolve';

const KINDS: readonly VisualAssetKind[] = ['frames', 'logos', 'images'];
const COLLECTION_BY_KIND: Record<VisualAssetKind, string> = {
  frames: COLLECTIONS.FRAMES,
  logos: COLLECTIONS.LOGOS,
  images: COLLECTIONS.IMAGES,
};
const ID_FIELD_BY_KIND: Record<VisualAssetKind, string> = {
  frames: 'frameId',
  logos: 'logoId',
  images: 'pictureId',
};

export type EventOwner = Record<string, unknown> & {
  partnerId?: string | null;
  eventId?: string | null;
  visualAssetPolicy?: VisualAssetLevelPolicy | { inheritanceVersion?: number } | null;
};

export type PartnerOwner = Record<string, unknown> & {
  partnerId?: string | null;
  visualAssetPolicy?: VisualAssetLevelPolicy | { inheritanceVersion?: number } | null;
};

function inheritanceEnabled(partner: PartnerOwner | null | undefined): boolean {
  return (partner?.visualAssetPolicy as { inheritanceVersion?: unknown } | null | undefined)?.inheritanceVersion === 2;
}

/** Whether a specific library item is still visible to the target event. */
export function visualAssetVisibleToEvent(
  asset: Document,
  kind: VisualAssetKind,
  id: string,
  event: EventOwner,
  partner: PartnerOwner | null,
): boolean {
  const inheritedPolicyEnabled = inheritanceEnabled(partner);
  return resolveAssetVisibility({
    asset,
    kind,
    id,
    targetLevel: 'event',
    partnerId: partner?.partnerId ?? event.partnerId,
    eventId: event.eventId,
    partnerPolicy: inheritedPolicyEnabled ? partner?.visualAssetPolicy as VisualAssetLevelPolicy | null | undefined : null,
    eventPolicy: inheritedPolicyEnabled ? event.visualAssetPolicy as VisualAssetLevelPolicy | null | undefined : null,
  }).available;
}

function collectAssetUrls(value: unknown, output: Set<string>, field = ''): void {
  if (typeof value === 'string') {
    if (isVisualAssetUrlField(field) && /^https:\/\//i.test(value)) output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectAssetUrls(child, output, field);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) collectAssetUrls(child, output, key);
  }
}

function stripUrls<T>(value: T, blocked: ReadonlySet<string>, field = ''): T {
  if (typeof value === 'string') {
    return (isVisualAssetUrlField(field) && blocked.has(value) ? undefined : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((child) => stripUrls(child, blocked, field)).filter((child) => child !== undefined) as T;
  }
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const safe = stripUrls(child, blocked, key);
    if (safe !== undefined) result[key] = safe;
  }
  return result as T;
}

/** Covers the app's established `*ImageUrl` and named image fields, including
 * emailFooterImageUrl whose media role is not at the start of the key. */
function isVisualAssetUrlField(field: string): boolean {
  return /^(image|thumbnail|background|screen|picture|src|logo|frame)|^url$/i.test(field)
    || /(image|thumbnail|picture|logo|frame|background|overlay)(url|src)?$/i.test(field);
}

/**
 * Remove only URLs that resolve to known library items unavailable at the
 * event. Hand-entered and legacy URLs not represented in a library remain
 * untouched. Explicit source-level inactive/private settings apply to every
 * event; child hide/forwarding overrides apply after that partner enables v2.
 * Admin editors still receive the saved event values.
 */
export async function filterUnavailableVisualAssetUrls<T>(
  db: Db,
  value: T,
  event: EventOwner,
  partner: PartnerOwner | null,
): Promise<T> {
  const urls = new Set<string>();
  collectAssetUrls(value, urls);
  if (urls.size === 0) return value;

  const matches = await Promise.all(KINDS.map(async (kind) => {
    const rows = await db.collection(COLLECTION_BY_KIND[kind])
      .find({ $or: [{ imageUrl: { $in: [...urls] } }, { thumbnailUrl: { $in: [...urls] } }] })
      .toArray();
    return rows.map((asset) => ({ kind, asset }));
  }));
  const visibleUrls = new Set<string>();
  const knownUrls = new Set<string>();
  for (const { kind, asset } of matches.flat()) {
    const id = String(asset[ID_FIELD_BY_KIND[kind]] ?? '');
    if (!id) continue;
    for (const key of ['imageUrl', 'thumbnailUrl']) {
      const url = asset[key];
      if (typeof url !== 'string' || !urls.has(url)) continue;
      knownUrls.add(url);
      if (visualAssetVisibleToEvent(asset, kind, id, event, partner)) visibleUrls.add(url);
    }
  }
  const blocked = new Set([...knownUrls].filter((url) => !visibleUrls.has(url)));
  return blocked.size ? stripUrls(value, blocked) : value;
}
