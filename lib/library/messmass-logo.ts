/**
 * The partner's logo from messmass as an item of its library, and its default (camera#367, camera#412; owner decision 120: in the partner library only,
 * not in the global list; owner answer 153, 2026-10-09: an automatic default is collected automatically and made the default).
 *
 * messmass provisioning keeps the partner's logo only as `Partner.logoUrl`, a file on the logo bucket (docs/LOGO_STORAGE.md). Importing it stores a logo
 * that belongs to the partner (`scope: 'partner'`, `source: 'messmass'`, `sourceUrl`) and points at the same file: the bucket's files never change (they
 * are named by their hash), so no copy is made. The file is downloaded once to check that it is a picture and to measure it. A new import also makes the
 * logo a default of the partner (`makeMessmassLogoDefault`): it is added to every scenario after the logos the partner already has there, and the events
 * inherit it through the standard inheritance of partner defaults. A second import of the same address returns the logo already imported and
 * changes nothing, so a logo an editor un-ticked later is not ticked again.
 */

import type { Db, Document } from 'mongodb';
import sharp from 'sharp';
import { COLLECTIONS, generateId } from '@/lib/db/schemas';
import { fetchLogo, isAllowedLogoUrl } from '@/lib/frame/logo';
import { updateChildEventsFromPartner } from '@/lib/db/events';
import { LOGO_SCENARIOS, logoDefaultsOf, type LogoDefault } from './logos';

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

/** The default rows that make `logoId` a default in every scenario it is not one in yet: each after the logos the partner already has there. */
export function messmassLogoDefaultRows(current: readonly LogoDefault[], logoId: string): LogoDefault[] {
  return LOGO_SCENARIOS.flatMap((scenario) => {
    const there = current.filter((row) => row.scenario === scenario.id);
    if (there.some((row) => row.logoId === logoId)) return [];
    return [{ logoId, scenario: scenario.id, order: Math.max(-1, ...there.map((row) => row.order)) + 1 }];
  });
}

export interface MessmassLogoDefault {
  /** The default rows that were added to the partner (none when the logo already is a default in every scenario). */
  added: LogoDefault[];
  /** The events that inherited the partner's defaults through the standard cascade (the ones that follow them). */
  eventsUpdated: number;
}

/**
 * Makes the imported logo a default of its partner and lets the events inherit it the way every partner default is inherited: new events copy the
 * partner's defaults when they are created (`inheritPartnerDefaults`), and the events that follow them get the changed list through the same
 * cascade a change on the partner page runs (`updateChildEventsFromPartner`; an event that has edited its own logo list, `logosOverridden`,
 * does not follow and keeps its own). The partner's other defaults stay, and the new logo comes after them (the first logo by order is the one users see).
 */
export async function makeMessmassLogoDefault(db: Db, partner: Document, item: Document, now: string): Promise<MessmassLogoDefault> {
  const partnerId = text(partner.partnerId);
  const current = logoDefaultsOf(partner);
  const added = messmassLogoDefaultRows(current, text(item.logoId));
  if (!added.length) return { added, eventsUpdated: 0 };
  const defaultLogos = [...current, ...added];
  await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId }, { $set: { defaultLogos, updatedAt: now } });
  // The scenario ids are the values of `LogoScenario` (logos.test.ts keeps them equal), as in the partner library route.
  const cascade = await updateChildEventsFromPartner(partnerId, { defaultLogos: defaultLogos as Parameters<typeof updateChildEventsFromPartner>[1]['defaultLogos'] });
  return { added, eventsUpdated: cascade.logosUpdated };
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
