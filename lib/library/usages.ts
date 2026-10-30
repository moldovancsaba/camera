import type { Db, Document as MongoDocument } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { KIND_META, type LibraryKind } from './kinds';
import { LOGO_SLOT_IDS } from '@/lib/slots/logo';
import { STADIUM_SLOT } from '@/lib/slots/stadium';
import { SELFIE_SLOT } from '@/lib/slots/selfie';
import { SAMPLE_SELFIE_TAG } from '@/lib/library/sample-selfie';
import { STADIUM_BACKGROUND_TAG } from '@/lib/library/stadium-background';

export interface AssetUsage {
  key: string;
  ownerLevel: 'partner' | 'event' | 'library-asset' | 'landing-page' | 'slideshow';
  ownerId: string;
  ownerName: string;
  uses: string[];
  href: string;
}

export interface AssetUsagesResult {
  assetId: string;
  kind: LibraryKind;
  usages: AssetUsage[];
  total: number;
  truncated: boolean;
}

const asText = (value: unknown): string => typeof value === 'string' ? value : '';
const picturePath = /image|logo|picture|thumbnail|background|overlay|screen/i;
const MAX_USAGE_ROWS = 500;

function addUse(map: Map<string, AssetUsage>, usage: AssetUsage, label: string): void {
  const row = map.get(usage.key) ?? usage;
  if (!row.uses.includes(label)) row.uses.push(label);
  map.set(usage.key, row);
}

function collectMatchingPicturePaths(value: unknown, url: string, path: string, found: string[], depth = 0): void {
  if (depth > 8) return;
  if (typeof value === 'string') {
    if (value === url && picturePath.test(path)) found.push(path || 'picture');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectMatchingPicturePaths(item, url, `${path}[${index}]`, found, depth + 1));
    return;
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return;
  for (const [key, child] of Object.entries(value)) {
    collectMatchingPicturePaths(child, url, path ? `${path}.${key}` : key, found, depth + 1);
  }
}

/**
 * Returns the concrete catalog and event records that still depend on one asset.
 * This is intentionally a read-only scan: a delete never removes or rewrites a
 * child reference on the caller's behalf.
 */
export async function findAssetUsages(
  db: Db,
  kind: LibraryKind,
  assetId: string,
  imageUrls: string[] = [],
  options: { offset?: number; limit?: number; ownerIds?: ReadonlySet<string> } = {},
): Promise<AssetUsagesResult> {
  const idField = KIND_META[kind].idField;
  const sourceAsset = await db.collection(KIND_META[kind].collection).findOne({ [idField]: assetId }, { projection: { scope: 1, isActive: 1, shareToChildren: 1, tags: 1 } });
  const isGlobalSource = sourceAsset?.scope !== 'partner' && sourceAsset?.scope !== 'event';
  const usages = new Map<string, AssetUsage>();
  const hasId = (value: unknown): boolean => Array.isArray(value) && value.includes(assetId);

  const partnerRows = await db.collection(COLLECTIONS.PARTNERS).find({}, { projection: {
    _id: 1, partnerId: 1, name: 1, library: 1, defaultFrames: 1, defaultLogos: 1,
    slots: 1, visualAssetPolicy: 1, pictures: 1, logoUrl: 1,
  } }).toArray();
  const partnersById = new Map<string, MongoDocument>(partnerRows.map((partner) => [asText(partner.partnerId), partner] as const).filter(([id]) => Boolean(id)));
  for (const partner of partnerRows) {
    const partnerId = asText(partner.partnerId);
    const adminId = partner._id?.toString?.() ?? '';
    if (!partnerId || !adminId) continue;
    const matches: string[] = [];
    const usagesForOwner: Array<{ label: string; href: string }> = [];
    const libraryIds = (partner.library as Record<string, unknown> | undefined)?.[kind];
    if (Array.isArray(libraryIds) && libraryIds.includes(assetId)) matches.push('In the partner library');
    if (kind === 'frames' && Array.isArray(partner.defaultFrames) && partner.defaultFrames.includes(assetId)) matches.push('Default for new events');
    if (kind === 'logos') {
      const defaults = Array.isArray(partner.defaultLogos) ? partner.defaultLogos : [];
      if (defaults.some((row) => row && typeof row === 'object' && (row as Record<string, unknown>).logoId === assetId)) matches.push('Default logo for new events');
      if (LOGO_SLOT_IDS.some((slot) => hasId((partner.slots as Record<string, { items?: unknown }> | undefined)?.[slot]?.items))) matches.push('Partner logo slot');
    }
    const partnerPolicy = partner.visualAssetPolicy as { inheritanceVersion?: unknown; hidden?: Array<{ kind?: unknown; id?: unknown }>; blockedForChildren?: Array<{ kind?: unknown; id?: unknown }> } | undefined;
    if (kind === 'images') {
      const slots = partner.slots as Record<string, { items?: unknown; useDefault?: boolean }> | undefined;
      if (hasId(slots?.[SELFIE_SLOT]?.items)) usagesForOwner.push({ label: 'Sample selfie slot', href: `/admin/partners/${encodeURIComponent(adminId)}/pictures` });
      if (hasId(slots?.[STADIUM_SLOT]?.items)) usagesForOwner.push({ label: 'Stadium background slot', href: `/admin/partners/${encodeURIComponent(adminId)}/pictures` });
      const tags = Array.isArray(sourceAsset?.tags) ? sourceAsset.tags : [];
      const taggedSlot = tags.includes(SAMPLE_SELFIE_TAG) ? SELFIE_SLOT : tags.includes(STADIUM_BACKGROUND_TAG) ? STADIUM_SLOT : null;
      const visibleAtPartner = !partnerPolicy?.hidden?.some((ref) => ref.kind === 'images' && ref.id === assetId);
      if (
        taggedSlot && isGlobalSource && sourceAsset?.isActive !== false && sourceAsset?.shareToChildren !== false
        && slots?.[taggedSlot]?.useDefault !== false && visibleAtPartner
      ) usagesForOwner.push({ label: `Inherited ${taggedSlot === SELFIE_SLOT ? 'sample selfie' : 'stadium background'} default`, href: `/admin/partners/${encodeURIComponent(adminId)}/pictures` });
    }
    if (
      isGlobalSource && sourceAsset?.isActive !== false && sourceAsset?.shareToChildren !== false && partnerPolicy?.inheritanceVersion === 2
      && !partnerPolicy.hidden?.some((ref) => ref.kind === kind && ref.id === assetId)
      && !partnerPolicy.blockedForChildren?.some((ref) => ref.kind === kind && ref.id === assetId)
    ) matches.push('Inherited from the global catalog');
    if (matches.length) usagesForOwner.push({ label: [...new Set(matches)].join(' · '), href: `/admin/partners/${encodeURIComponent(adminId)}/${kind}` });
    if (imageUrls.length) {
      const picturePaths: string[] = [];
      const editPaths: string[] = [];
      for (const url of imageUrls) collectMatchingPicturePaths(partner.pictures, url, 'pictures', picturePaths);
      for (const url of imageUrls) collectMatchingPicturePaths(partner.logoUrl, url, 'logoUrl', editPaths);
      if (picturePaths.length) usagesForOwner.push({ label: [...new Set(picturePaths.map((path) => `Picture field: ${path}`))].join(' · '), href: `/admin/partners/${encodeURIComponent(adminId)}/pictures` });
      if (editPaths.length) usagesForOwner.push({ label: [...new Set(editPaths.map((path) => `Picture field: ${path}`))].join(' · '), href: `/admin/partners/${encodeURIComponent(adminId)}/edit` });
    }
    for (const usage of usagesForOwner) addUse(usages, {
      key: `partner:${partnerId}:${usage.href}`,
      ownerLevel: 'partner',
      ownerId: adminId,
      ownerName: asText(partner.name) || 'Unnamed partner',
      uses: [],
      href: usage.href,
    }, usage.label);
  }

  const eventRows = await db.collection(COLLECTIONS.EVENTS).find({}, { projection: {
    _id: 1, eventId: 1, partnerId: 1, name: 1, eventName: 1, frames: 1, logos: 1, slots: 1,
    customPages: 1, welcomeScreen: 1, welcomeScreenComposition: 1, emailFooterImageUrl: 1, logoUrl: 1,
    stageBackground: 1, welcomeWindow: 1,
  } }).toArray();
  const eventsById = new Map<string, MongoDocument>(eventRows.map((event) => [asText(event.eventId), event] as const).filter(([id]) => Boolean(id)));
  for (const event of eventRows) {
    const eventId = asText(event.eventId);
    const adminId = event._id?.toString?.() ?? '';
    if (!eventId || !adminId) continue;
    const matches: string[] = [];
    const eventUsages: Array<{ label: string; href: string }> = [];
    const direct = Array.isArray(event[kind]) ? event[kind] as Array<Record<string, unknown>> : [];
    if (direct.some((row) => row?.[idField] === assetId)) matches.push(kind === 'frames' ? 'Assigned event frame' : kind === 'logos' ? 'Assigned event logo' : 'Event image catalog');
    if (kind === 'frames' && (event.welcomeScreenComposition as { frameId?: unknown } | undefined)?.frameId === assetId) matches.push('Welcome screen composition');
    if (kind === 'logos' && LOGO_SLOT_IDS.some((slot) => hasId((event.slots as Record<string, { items?: unknown }> | undefined)?.[slot]?.items))) matches.push('Event logo slot');
    if (kind === 'images') {
      const slots = event.slots as Record<string, { items?: unknown; useDefault?: boolean }> | undefined;
      if (hasId(slots?.[SELFIE_SLOT]?.items)) eventUsages.push({ label: 'Sample selfie slot', href: `/admin/events/${encodeURIComponent(adminId)}` });
      if (hasId(slots?.[STADIUM_SLOT]?.items)) eventUsages.push({ label: 'Stadium background slot', href: `/admin/events/${encodeURIComponent(adminId)}` });
      if ((event.welcomeWindow as { pick?: { pictureId?: unknown } } | undefined)?.pick?.pictureId === assetId) eventUsages.push({ label: 'Currently picked welcome-screen sample selfie', href: `/admin/events/${encodeURIComponent(adminId)}` });
      if ((event.stageBackground as { pictureId?: unknown } | undefined)?.pictureId === assetId) eventUsages.push({ label: 'Currently selected default-slideshow stage background', href: `/admin/events/${encodeURIComponent(adminId)}` });
    }
    if (matches.length) eventUsages.push({ label: [...new Set(matches)].join(' · '), href: `/admin/events/${encodeURIComponent(adminId)}/${kind}` });
    if (imageUrls.length) {
      const eventPagePaths: string[] = [];
      const eventEditPaths: string[] = [];
      for (const url of imageUrls) collectMatchingPicturePaths(event.customPages, url, 'customPages', eventPagePaths);
      for (const url of imageUrls) {
        collectMatchingPicturePaths(event.welcomeScreen, url, 'welcomeScreen', eventEditPaths);
        collectMatchingPicturePaths(event.emailFooterImageUrl, url, 'emailFooterImageUrl', eventEditPaths);
        collectMatchingPicturePaths(event.logoUrl, url, 'logoUrl', eventEditPaths);
      }
      if (eventPagePaths.length) eventUsages.push({ label: [...new Set(eventPagePaths.map((path) => `Picture field: ${path}`))].join(' · '), href: `/admin/events/${encodeURIComponent(adminId)}/pages` });
      if (eventEditPaths.length) eventUsages.push({ label: [...new Set(eventEditPaths.map((path) => `Picture field: ${path}`))].join(' · '), href: `/admin/events/${encodeURIComponent(adminId)}/edit` });
    }
    for (const usage of eventUsages) addUse(usages, {
      key: `event:${eventId}:${usage.href}`,
      ownerLevel: 'event',
      ownerId: adminId,
      ownerName: asText(event.name) || asText(event.eventName) || 'Unnamed event',
      uses: [],
      href: usage.href,
    }, usage.label);
  }

  if (imageUrls.length) {
    const genericSources: Array<{ collection: string; level: 'frame' | 'logo' | 'landing-page' | 'slideshow' }> = [
      { collection: COLLECTIONS.FRAMES, level: 'frame' },
      { collection: COLLECTIONS.LOGOS, level: 'logo' },
      { collection: COLLECTIONS.LANDING_PAGES, level: 'landing-page' },
      { collection: COLLECTIONS.SLIDESHOWS, level: 'slideshow' },
    ];
    const projection = { _id: 1, scope: 1, partnerId: 1, eventId: 1, eventMongoId: 1, name: 1, title: 1, slug: 1, frameId: 1, logoId: 1, landingPageId: 1, slideshowId: 1, imageUrl: 1, thumbnailUrl: 1, logoUrl: 1, qrCodeImageUrl: 1, backgroundImageUrl: 1, screenDesign: 1 };
    for (const source of genericSources) {
      const rows = await db.collection(source.collection).find({}, { projection }).toArray();
      for (const row of rows) {
        if (source.collection === KIND_META[kind].collection && row[idField] === assetId) continue;
        const paths: string[] = [];
        for (const url of imageUrls) collectMatchingPicturePaths(row, url, '', paths);
        if (!paths.length) continue;
        const labels = [...new Set(paths.map((path) => `Picture field: ${path}`))].join(' · ');
        const name = asText(row.name) || asText(row.title) || asText(row.slug) || source.level;
        const partner = asText(row.partnerId) ? partnersById.get(asText(row.partnerId)) : undefined;
        const event = asText(row.eventId) ? eventsById.get(asText(row.eventId)) : undefined;
        const eventMongoId = asText(row.eventMongoId) || event?._id?.toString?.() || '';
        const eventByMongoId = eventMongoId ? eventRows.find((candidate) => candidate._id?.toString?.() === eventMongoId) : undefined;
        const owningEvent = event ?? eventByMongoId;
        if (owningEvent?._id) {
          const id = owningEvent._id.toString();
          const href = source.level === 'landing-page'
            ? `/admin/events/${encodeURIComponent(id)}/landing-pages/${encodeURIComponent(row._id?.toString?.() ?? '')}`
            : source.level === 'slideshow'
              ? `/admin/events/${encodeURIComponent(id)}/slideshows/${encodeURIComponent(row._id?.toString?.() ?? '')}`
              : `/admin/events/${encodeURIComponent(id)}/${source.level === 'frame' ? 'frames' : 'logos'}`;
          addUse(usages, { key: `event:${asText(owningEvent.eventId)}:${href}`, ownerLevel: 'event', ownerId: id, ownerName: asText(owningEvent.name) || asText(owningEvent.eventName) || asText(row.eventName) || 'Unnamed event', uses: [], href }, labels);
          continue;
        }
        if (partner?._id) {
          const id = partner._id.toString();
          const href = `/admin/partners/${encodeURIComponent(id)}/${source.level === 'frame' ? 'frames' : 'logos'}`;
          addUse(usages, { key: `partner:${asText(partner.partnerId)}:${href}`, ownerLevel: 'partner', ownerId: id, ownerName: asText(partner.name) || 'Unnamed partner', uses: [], href }, labels);
          continue;
        }
        const id = row._id?.toString?.();
        if (!id) continue;
        const href = source.level === 'frame'
          ? `/admin/frames/${encodeURIComponent(id)}/edit`
          : source.level === 'logo'
            ? `/admin/logos/${encodeURIComponent(id)}/edit`
            : source.level === 'landing-page' ? '/admin/landing-pages' : '/admin/slideshows';
        const ownerLevel: AssetUsage['ownerLevel'] = source.level === 'frame' || source.level === 'logo' ? 'library-asset' : source.level;
        addUse(usages, { key: `${ownerLevel}:${id}:${href}`, ownerLevel, ownerId: id, ownerName: name, uses: [], href }, labels);
      }
    }
  }

  // Show parent locations before descendants so an editor can resolve shared
  // references from the top of the asset tree down.
  const levelOrder: Record<AssetUsage['ownerLevel'], number> = {
    partner: 0,
    event: 1,
    'library-asset': 2,
    'landing-page': 3,
    slideshow: 4,
  };
  const sorted = [...usages.values()]
    .filter((usage) => !options.ownerIds || options.ownerIds.has(usage.ownerId))
    .sort((a, b) => levelOrder[a.ownerLevel] - levelOrder[b.ownerLevel] || a.ownerName.localeCompare(b.ownerName));
  const limit = Math.min(MAX_USAGE_ROWS, Math.max(1, Math.floor(options.limit ?? MAX_USAGE_ROWS)));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  return { assetId, kind, usages: sorted.slice(offset, offset + limit), total: sorted.length, truncated: offset + limit < sorted.length };
}

export function assetUsageRefusal(noun: string, result: AssetUsagesResult): string {
  const events = new Set(result.usages.filter((usage) => usage.ownerLevel === 'event').map((usage) => usage.ownerId)).size;
  const partners = new Set(result.usages.filter((usage) => usage.ownerLevel === 'partner').map((usage) => usage.ownerId)).size;
  const other = new Set(result.usages.filter((usage) => usage.ownerLevel !== 'event' && usage.ownerLevel !== 'partner').map((usage) => usage.ownerId)).size;
  const counts = [events ? `${events} event${events === 1 ? '' : 's'}` : '', partners ? `${partners} partner${partners === 1 ? '' : 's'}` : '', other ? `${other} other location${other === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
  return `This ${noun} is still used${counts ? ` in ${counts}` : ''}. Open each listed place, remove or replace the use, then return and retry deletion.`;
}
