/**
 * The partner's logo from messmass as an item of its library, and its default (camera#367, camera#412; owner decision 120: in the partner library only,
 * not in the global list; owner answer 153, 2026-10-09: an automatic default is collected automatically and made the default).
 *
 * messmass provisioning keeps the partner's logo only as `Partner.logoUrl`, a file on the logo bucket (docs/LOGO_STORAGE.md). Importing it stores a logo
 * that belongs to the partner (`scope: 'partner'`, `source: 'messmass'`, `sourceUrl`) and points at the same file: the bucket's files never change (they
 * are named by their hash), so no copy is made. The file is downloaded once to check that it is a picture and to measure it. A new import also makes the
 * logo one of the partner's logos (`makeMessmassLogoDefault`, the slot model of camera#419): the default of its events, which look at the partner. A second import
 * of the same address returns the logo already imported and changes nothing, so a logo an editor took out later is not put back.
 */

import type { Db, Document } from 'mongodb';
import sharp from 'sharp';
import { COLLECTIONS, generateId } from '@/lib/db/schemas';
import { fetchLogo, isAllowedLogoUrl } from '@/lib/frame/logo';
import { LOGO_SLOT, partnerLogoValue, type LogoPartner } from '@/lib/slots/logo';

/** The picture types a logo can be (the same as an upload, `POST /api/logos`), by the format sharp reads from the file. */
const MIME_BY_FORMAT: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export interface MessmassLogoState {
  /** The partner's logo address, or null when it has none. */
  logoUrl: string | null;
  /** The logo already imported from this address, or null. */
  item: Document | null;
  /** Why the logo cannot be imported, in plain words, or null. */
  problem: string | null;
}

function problemOf(logoUrl: string): string | null {
  if (!logoUrl) return 'This partner has no logo from messmass.';
  return isAllowedLogoUrl(logoUrl) ? null : 'The logo of this partner is not stored on a picture host camera trusts, so it cannot be imported.';
}

async function importedFrom(db: Db, partnerId: string, logoUrl: string): Promise<Document | null> {
  return logoUrl ? await db.collection(COLLECTIONS.LOGOS).findOne({ scope: 'partner', partnerId, source: 'messmass', sourceUrl: logoUrl }) : null;
}

export async function messmassLogoState(db: Db, partner: Document): Promise<MessmassLogoState> {
  const logoUrl = text(partner.logoUrl);
  const item = await importedFrom(db, text(partner.partnerId), logoUrl);
  return { logoUrl: logoUrl || null, item, problem: item ? null : problemOf(logoUrl) };
}

export type ImportMessmassLogoResult = { ok: true; created: boolean; item: Document } | { ok: false; status: 400 | 502; reason: string };

export async function importMessmassLogo(
  db: Db,
  partner: Document,
  input: { createdBy: string; now: string; fetchImpl?: typeof fetch }
): Promise<ImportMessmassLogoResult> {
  const partnerId = text(partner.partnerId);
  const logoUrl = text(partner.logoUrl);
  const problem = problemOf(logoUrl);
  if (problem) return { ok: false, status: 400, reason: problem };

  const existing = await importedFrom(db, partnerId, logoUrl);
  if (existing) return { ok: true, created: false, item: existing };

  // https only, a trusted host, no redirect, 8 seconds and 5 MB at most, an image content type (lib/frame/logo.ts).
  const bytes = await fetchLogo(logoUrl, input.fetchImpl);
  if (!bytes) return { ok: false, status: 502, reason: 'The logo could not be downloaded from its address (no answer, not a picture, or larger than 5 MB). Try again later.' };
  const metadata = await sharp(bytes)
    .metadata()
    .catch(() => null);
  if (!metadata) return { ok: false, status: 400, reason: 'The file at the logo address is not a picture camera can read.' };
  const mimeType = metadata.format ? MIME_BY_FORMAT[metadata.format] : undefined;
  if (!mimeType) return { ok: false, status: 400, reason: 'The logo is not a PNG, JPG, SVG or WebP picture.' };

  const name = text(partner.name);
  const item = {
    logoId: generateId(),
    name: name ? `${name} logo` : 'Partner logo',
    description: 'Imported from messmass',
    imageUrl: logoUrl,
    thumbnailUrl: logoUrl,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    fileSize: bytes.length,
    mimeType,
    isActive: true,
    usageCount: 0,
    createdBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
    scope: 'partner',
    partnerId,
    source: 'messmass',
    sourceUrl: logoUrl,
  };
  await db.collection(COLLECTIONS.LOGOS).insertOne(item);
  return { ok: true, created: true, item };
}

export interface MessmassLogoDefault {
  /** True when the logo became one of the partner's logos, or took the place of an earlier logo from messmass (false when nothing changed). */
  added: boolean;
  /** True when it took the place of an earlier logo from messmass. */
  replaced?: boolean;
}

/**
 * Makes the imported logo one of the partner's logos (camera#419, owner answers 153 and 169): the default of its events, which look at the partner, so nothing is
 * copied into them. It joins `Partner.slots.logo` after the logos the partner already has (its own choices come first; a partner not on the slot model yet keeps
 * what its old default rows amount to). **A new logo from messmass replaces the earlier one**: it takes its place in the list and the earlier one stays in the library,
 * but never over an own choice, and if the editor took the earlier one out, the new one is not put in.
 */
export async function makeMessmassLogoDefault(db: Db, partner: Document, item: Document, now: string): Promise<MessmassLogoDefault> {
  const logoId = text(item.logoId);
  const partnerId = text(partner.partnerId);
  const current = partnerLogoValue(partner as LogoPartner).items ?? [];
  if (current.includes(logoId)) return { added: false };
  const earlier = (await db.collection(COLLECTIONS.LOGOS).find({ scope: 'partner', partnerId, source: 'messmass' }).toArray()).map((doc) => text(doc.logoId)).filter((id) => id && id !== logoId);
  let items: string[];
  let replaced = false;
  if (earlier.length === 0) {
    items = [...current, logoId];
  } else if (current.some((id) => earlier.includes(id))) {
    const at = current.findIndex((id) => earlier.includes(id));
    items = current.flatMap((id, index) => (index === at ? [logoId] : earlier.includes(id) ? [] : [id]));
    replaced = true;
  } else {
    return { added: false };
  }
  await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId }, { $set: { [`slots.${LOGO_SLOT}`]: { items }, updatedAt: now } });
  return replaced ? { added: true, replaced: true } : { added: true };
}

/**
 * Collects the partner's logo from messmass and makes it the default, in one step: what provisioning, the import button and the backfill all do.
 * Returns the import result and, for a new import, what became default.
 */
export async function collectMessmassLogo(
  db: Db,
  partner: Document,
  input: { createdBy: string; now: string; fetchImpl?: typeof fetch }
): Promise<{ imported: ImportMessmassLogoResult; madeDefault: MessmassLogoDefault | null }> {
  const imported = await importMessmassLogo(db, partner, input);
  const madeDefault = imported.ok && imported.created ? await makeMessmassLogoDefault(db, partner, imported.item, input.now) : null;
  return { imported, madeDefault };
}

/**
 * The logo address to store when messmass sends one for a partner that exists (camera#419, owner answer 169): the partner's address is replaced only when the one it
 * has now is the one camera imported from messmass (so it is messmass's own, not something set by hand), or when it has none. Otherwise null: keep what it has.
 */
export function nextPartnerLogoUrl(current: unknown, incoming: unknown, importedAddresses: readonly string[]): string | null {
  const next = text(incoming);
  const now = text(current);
  if (!next || next === now) return null;
  if (!now || importedAddresses.includes(now)) return next;
  return null;
}

