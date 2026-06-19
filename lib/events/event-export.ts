/**
 * Event export helpers
 *
 * Shared logic for the per-event admin exports:
 * - email addresses collected against an event (deduplicated)
 * - images related to an event (originals, finals, and derived try-on results)
 *
 * Why this module exists:
 * - The emails and images export routes need the same event lookup and the same
 *   submission query, so it lives in one place instead of being duplicated.
 * - Keeps CSV escaping and image-collection rules consistent across exports.
 *
 * Data model notes:
 * - Submissions link to an event via the single `eventId` mirror and/or the
 *   `eventIds` array (reusable submissions), so both are matched.
 * - Emails live in `userEmail` (SSO) and `userInfo.email` (guest onboarding form).
 * - Images are imgbb URLs stored on `originalImageUrl`, `finalImageUrl`, and the
 *   primary `imageUrl` (which is the result image for try-on derivatives).
 */

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export interface EventExportContext {
  /** Mongo _id string of the event. */
  id: string;
  /** Stable event UUID used for submission linkage. */
  eventId: string;
  /** Event display name, used for export filenames. */
  name: string;
}

interface ExportSubmission {
  _id?: ObjectId;
  submissionId?: string;
  userEmail?: string;
  userName?: string | null;
  imageUrl?: string;
  originalImageUrl?: string;
  finalImageUrl?: string;
  submissionKind?: 'original' | 'tryon_result';
  userInfo?: { name?: string; email?: string; collectedAt?: string };
  createdAt?: string;
}

export type ImageKind = 'original' | 'final' | 'primary';

export interface EventImage {
  submissionId: string;
  kind: ImageKind;
  url: string;
  userEmail: string;
  userName: string;
  submissionKind: string;
  createdAt: string;
}

export interface EventEmailRow {
  email: string;
  name: string;
  /** Where the address came from: sso, guest form, or both. */
  source: string;
  submissionCount: number;
  firstSubmittedAt: string;
  lastSubmittedAt: string;
}

/**
 * Load the event referenced by a Mongo _id string. Returns null when the id is
 * not a valid ObjectId or no event matches.
 */
export async function loadEventForExport(db: Db, idParam: string): Promise<EventExportContext | null> {
  if (!ObjectId.isValid(idParam)) {
    return null;
  }
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne(
      { _id: new ObjectId(idParam) },
      { projection: { eventId: 1, name: 1 } }
    );
  if (!event || typeof event.eventId !== 'string') {
    return null;
  }
  return {
    id: idParam,
    eventId: event.eventId,
    name: typeof event.name === 'string' && event.name.trim() ? event.name : 'event',
  };
}

/**
 * Fetch every non-archived submission tied to the event via either the single
 * `eventId` mirror or the `eventIds` array. Submissions hidden from the event
 * are excluded; inactive-user filtering is intentionally NOT applied so the
 * export is complete (these exports double as the GDPR data-export path).
 */
export async function collectEventSubmissionsForExport(db: Db, eventUuid: string): Promise<ExportSubmission[]> {
  return (await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find({
      $and: [
        { $or: [{ eventId: eventUuid }, { eventIds: { $in: [eventUuid] } }] },
        { isArchived: { $ne: true } },
        {
          $or: [
            { hiddenFromEvents: { $exists: false } },
            { hiddenFromEvents: { $nin: [eventUuid] } },
          ],
        },
      ],
    })
    .sort({ createdAt: 1 })
    .toArray()) as ExportSubmission[];
}

/** Build deduplicated email rows (case-insensitive) from event submissions. */
export function buildEmailRows(submissions: ExportSubmission[]): EventEmailRow[] {
  const byEmail = new Map<
    string,
    { email: string; name: string; sources: Set<string>; count: number; first: string; last: string }
  >();

  for (const submission of submissions) {
    const createdAt = submission.createdAt ?? '';
    const candidates: Array<{ email?: string; name?: string | null; source: string }> = [
      { email: submission.userInfo?.email, name: submission.userInfo?.name, source: 'guest' },
      { email: submission.userEmail, name: submission.userName, source: 'sso' },
    ];

    for (const candidate of candidates) {
      const email = candidate.email?.trim();
      if (!email) continue;
      // SSO assigns synthetic addresses to anonymous guests; skip those so the
      // export only contains real, reachable addresses.
      if (/@(anonymous|guest)\b/i.test(email) || email.toLowerCase().startsWith('anonymous@')) continue;

      const key = email.toLowerCase();
      const name = candidate.name?.trim() || '';
      const existing = byEmail.get(key);
      if (existing) {
        existing.sources.add(candidate.source);
        existing.count += 1;
        if (!existing.name && name) existing.name = name;
        if (createdAt && (!existing.first || createdAt < existing.first)) existing.first = createdAt;
        if (createdAt && createdAt > existing.last) existing.last = createdAt;
      } else {
        byEmail.set(key, {
          email,
          name,
          sources: new Set([candidate.source]),
          count: 1,
          first: createdAt,
          last: createdAt,
        });
      }
    }
  }

  return Array.from(byEmail.values())
    .map((entry) => ({
      email: entry.email,
      name: entry.name,
      source: Array.from(entry.sources).sort().join('+'),
      submissionCount: entry.count,
      firstSubmittedAt: entry.first,
      lastSubmittedAt: entry.last,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Flatten submissions into individual image entries covering originals, finals,
 * and the primary image (the result image for try-on derivatives). Duplicate
 * URLs within a single submission are collapsed so a photo is not exported twice.
 */
export function collectEventImages(submissions: ExportSubmission[]): EventImage[] {
  const images: EventImage[] = [];

  for (const submission of submissions) {
    const submissionId = submission.submissionId ?? submission._id?.toString() ?? '';
    const seen = new Set<string>();
    const ordered: Array<{ kind: ImageKind; url?: string }> = [
      { kind: 'original', url: submission.originalImageUrl },
      { kind: 'final', url: submission.finalImageUrl },
      { kind: 'primary', url: submission.imageUrl },
    ];

    for (const { kind, url } of ordered) {
      const trimmed = url?.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      images.push({
        submissionId,
        kind,
        url: trimmed,
        userEmail: submission.userEmail ?? '',
        userName: submission.userName ?? submission.userInfo?.name ?? '',
        submissionKind: submission.submissionKind ?? 'original',
        createdAt: submission.createdAt ?? '',
      });
    }
  }

  return images;
}

/** Escape a value for CSV (RFC 4180 quoting). */
export function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** Build a CSV string from a header row and data rows. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

/** Slugify an event name for use in a download filename. */
export function exportSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'event';
}

/** Derive a file extension for an image from its content-type or URL. */
export function imageExtension(contentType: string | null, url: string): string {
  const fromType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };
  if (contentType) {
    const normalized = contentType.split(';')[0].trim().toLowerCase();
    if (fromType[normalized]) return fromType[normalized];
  }
  const match = url.split('?')[0].match(/\.([a-z0-9]{2,4})$/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

/** Maximum number of image files allowed in a single ZIP export. */
export const MAX_ZIP_IMAGES = 500;
