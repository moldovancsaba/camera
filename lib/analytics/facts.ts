/**
 * One photo of the database as the Analytics report reads it (issue 521, docs/ANALYTICS_AUDIT.md): a small record of plain facts taken defensively from a `submissions` document (any shape,
 * any missing field), so every count in the report is made from the same reading and the aggregations never touch a raw document. Pure and DOM-free; unit-tested in facts.test.ts.
 *
 * Only existing data is read (phase 1): nothing here needs a new field, and nothing about a person leaves the facts except the e-mail used to count different users (it stays in memory; the report
 * holds counts, never an address) and the e-mail of the person who decided (the Vetting tab already shows it to the same people).
 */

export type ReviewState = 'approved' | 'rejected' | 'waiting' | 'none';
/** `user`: the photo was taken or uploaded by a user. `editor`: an editor added it in the gallery (it is shown on the screens but nobody "took" it). */
export type PhotoSource = 'user' | 'editor';
export type CaptureMethod = 'camera' | 'upload' | 'unknown';
export type DeviceClass = 'ios' | 'android' | 'desktop' | 'unknown';
export type Identity = 'signed_in' | 'email' | 'none';

export interface Decision {
  action: 'approve' | 'reject';
  by: string;
  at: string;
  reason: string | null;
}

export interface ConsentFact {
  /** What the user read and accepted: the one sentence of the Who-are-you page when there was one, else the checkbox text; cut at 160 characters. */
  label: string;
  pageType: 'accept' | 'cta';
  at: string | null;
}

export type PhotoLinkEmail = 'sent' | 'failed' | 'skipped';

export interface PhotoFacts {
  id: string;
  /** The event the photo is filed under first (its UUID), for the table of events. */
  eventKey: string | null;
  /** Every event reference of the photo (the UUID and the ids it was filed under). */
  eventKeys: string[];
  createdAt: string | null;
  source: PhotoSource;
  /** Left out of every count and named as such: removed from the event by an admin, or the picture is gone. */
  excluded: 'archived' | 'broken' | null;
  method: CaptureMethod;
  device: DeviceClass;
  review: ReviewState;
  /** When the photo was handed to the reviewers: `photoReview.submittedAt`, else the time it was saved. */
  submittedAt: string | null;
  /** The approvals and rejections in the order they were made. */
  decisions: Decision[];
  identity: Identity;
  /** A lower-case e-mail, else `id:<account id>`, else null: what tells two users apart. */
  userKey: string | null;
  email: string | null;
  consents: ConsentFact[];
  wallOptIn: boolean;
  galleryConsentAt: string | null;
  frame: { kind: 'own' | 'generated' | 'none'; label: string };
  message: string | null;
  layout: string | null;
  mirrored: boolean | null;
  framing: 'fill' | 'fit' | 'custom' | null;
  plays: number;
  lastPlayedAt: string | null;
  playsBySlideshow: Record<string, { count: number; lastPlayedAt: string | null }>;
  /** `Submission.people`, untouched (the people counts read it with `summarizePeople`). */
  people: unknown;
  peopleBy: string | null;
  peopleAt: string | null;
  emails: { arrived: boolean; photoLink: PhotoLinkEmail | null; photoLinkSkipReason: string | null; photoLinkKind: 'afterSave' | 'relatedPhotos' | 'tryOnRerun' | null; declined: 'sent' | 'not_sent' | null };
}

/** The fields of a photo the report reads: a database projection, so a long event does not pull the whole documents. */
export const PHOTO_PROJECTION = {
  eventId: 1,
  eventIds: 1,
  submissionKind: 1,
  isArchived: 1,
  'mediaHealth.broken': 1,
  createdAt: 1,
  method: 1,
  userId: 1,
  userEmail: 1,
  'userInfo.email': 1,
  reviewStatus: 1,
  reviewHistory: 1,
  'photoReview.submittedAt': 1,
  'photoReview.shareOptIn': 1,
  isShareVisible: 1,
  publicGalleryConsent: 1,
  consents: 1,
  frameId: 1,
  frameName: 1,
  'frameVariant.message': 1,
  'frameVariant.imageUrl': 1,
  'reframe.mirrored': 1,
  'reframe.mode': 1,
  playCount: 1,
  lastPlayedAt: 1,
  slideshowPlays: 1,
  people: 1,
  peopleReview: 1,
  'metadata.deviceInfo': 1,
  'metadata.device': 1,
  'metadata.adminGalleryUpload': 1,
  'metadata.arrivedEmailSentAt': 1,
  'metadata.emailSent': 1,
  'metadata.emailFailedAt': 1,
  'metadata.emailSkippedAt': 1,
  'metadata.emailSkipReason': 1,
  'metadata.emailSentAfterSave': 1,
  'metadata.emailSentAfterRelatedPhotos': 1,
  'metadata.emailSentAfterTryOnResubmissionApproved': 1,
  'metadata.rejectionEmailSent': 1,
} as const;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** What kind of device a user agent is, from the user agent alone. An iPad that asks for the desktop site looks like a Mac and counts as a desktop: a limit of the user agent, not of the count. */
export function deviceClassOf(userAgent: unknown): DeviceClass {
  const ua = typeof userAgent === 'string' ? userAgent : '';
  if (!ua) return 'unknown';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/windows nt|macintosh|x11|cros|linux/i.test(ua)) return 'desktop';
  return 'unknown';
}

const PLACEHOLDER_EMAILS = new Set(['anonymous@event', 'admin@upload']);

function decisionsOf(value: unknown): Decision[] {
  if (!Array.isArray(value)) return [];
  const out: Decision[] = [];
  for (const raw of value) {
    const row = record(raw);
    const at = text(row.at);
    if ((row.action !== 'approve' && row.action !== 'reject') || !at) continue;
    out.push({ action: row.action, by: text(row.by) ?? 'unknown', at, reason: text(row.reason) });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function consentsOf(value: unknown): ConsentFact[] {
  if (!Array.isArray(value)) return [];
  const out: ConsentFact[] = [];
  for (const raw of value) {
    const row = record(raw);
    if (row.accepted === false) continue;
    const label = text(row.shownText) ?? text(row.checkboxText);
    if (!label) continue;
    out.push({ label: label.replace(/\s+/g, ' ').slice(0, 160), pageType: row.pageType === 'cta' ? 'cta' : 'accept', at: text(row.acceptedAt) });
  }
  return out;
}

function playsOf(doc: Record<string, unknown>): { plays: number; by: PhotoFacts['playsBySlideshow'] } {
  const by: PhotoFacts['playsBySlideshow'] = {};
  let sum = 0;
  for (const [slideshowId, raw] of Object.entries(record(doc.slideshowPlays))) {
    const row = record(raw);
    const count = typeof row.count === 'number' && Number.isFinite(row.count) && row.count > 0 ? Math.floor(row.count) : 0;
    by[slideshowId] = { count, lastPlayedAt: text(row.lastPlayedAt) };
    sum += count;
  }
  const total = typeof doc.playCount === 'number' && Number.isFinite(doc.playCount) && doc.playCount >= 0 ? Math.floor(doc.playCount) : sum;
  return { plays: total, by };
}

/**
 * The facts of a `submissions` document. Null for what the report does not count at all: a try-on result (its own report) and a document with no way to tell when it was made is kept (with a null
 * time) so that it is still counted in the totals.
 */
export function photoFactsOf(doc: Record<string, unknown> | null | undefined): PhotoFacts | null {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.submissionKind === 'tryon_result') return null;

  const metadata = record(doc.metadata);
  const userInfo = record(doc.userInfo);
  const photoReview = record(doc.photoReview);
  const mediaHealth = record(doc.mediaHealth);
  const reframe = record(doc.reframe);
  const variant = record(doc.frameVariant);
  const peopleReview = record(doc.peopleReview);

  const source: PhotoSource = metadata.adminGalleryUpload === true ? 'editor' : 'user';
  const userId = text(doc.userId);
  const signedIn = Boolean(userId) && userId !== 'anonymous';
  const accountEmail = text(doc.userEmail)?.toLowerCase() ?? null;
  const typedEmail = text(userInfo.email)?.toLowerCase() ?? null;
  const email = [accountEmail, typedEmail].find((candidate): candidate is string => Boolean(candidate) && !PLACEHOLDER_EMAILS.has(candidate as string)) ?? null;
  const identity: Identity = source === 'editor' ? 'none' : signedIn ? 'signed_in' : email ? 'email' : 'none';

  const refs = new Set<string>();
  const eventId = text(doc.eventId);
  if (eventId) refs.add(eventId);
  if (Array.isArray(doc.eventIds)) for (const id of doc.eventIds) if (typeof id === 'string' && id) refs.add(id);

  const decisions = decisionsOf(doc.reviewHistory);
  const review: ReviewState = doc.reviewStatus === 'approved' ? 'approved' : doc.reviewStatus === 'rejected' ? 'rejected' : doc.reviewStatus === 'pending_review' ? 'waiting' : 'none';
  const createdAt = text(doc.createdAt);

  const method: CaptureMethod = doc.method === 'camera_capture' ? 'camera' : doc.method === 'file_upload' ? 'upload' : 'unknown';
  const layoutUrl = text(variant.imageUrl);
  const frameName = text(doc.frameName) ?? text(doc.frameId);
  const frame: PhotoFacts['frame'] = doc.frameId || doc.frameName ? { kind: 'own', label: frameName ?? 'Frame' } : layoutUrl || text(variant.message) ? { kind: 'generated', label: 'Generated default frame' } : { kind: 'none', label: 'No frame' };
  const framing = reframe.mode === 'fill' || reframe.mode === 'fit' || reframe.mode === 'custom' ? reframe.mode : null;
  const { plays, by } = playsOf(doc);

  const failedAt = text(metadata.emailFailedAt);
  const skippedAt = text(metadata.emailSkippedAt);
  const photoLink: PhotoLinkEmail | null = metadata.emailSent === true ? 'sent' : failedAt ? 'failed' : skippedAt ? 'skipped' : null;
  const photoLinkKind = metadata.emailSentAfterSave === true ? 'afterSave' : metadata.emailSentAfterRelatedPhotos === true ? 'relatedPhotos' : metadata.emailSentAfterTryOnResubmissionApproved === true ? 'tryOnRerun' : null;

  const consentRecord = record(doc.publicGalleryConsent);

  return {
    id: String(doc._id ?? ''),
    eventKey: eventId ?? [...refs][0] ?? null,
    eventKeys: [...refs],
    createdAt,
    source,
    excluded: doc.isArchived === true ? 'archived' : mediaHealth.broken === true ? 'broken' : null,
    method,
    device: deviceClassOf(metadata.deviceInfo ?? metadata.device),
    review,
    submittedAt: text(photoReview.submittedAt) ?? createdAt,
    decisions,
    identity,
    userKey: source === 'editor' ? null : email ?? (signedIn ? `id:${userId}` : null),
    email: source === 'editor' ? null : email,
    consents: consentsOf(doc.consents),
    wallOptIn: photoReview.shareOptIn === true || (Object.keys(photoReview).length === 0 && doc.isShareVisible === true),
    galleryConsentAt: text(consentRecord.grantedAt),
    frame,
    message: text(variant.message),
    layout: layoutUrl ? (layoutUrl.split('/').pop() ?? layoutUrl).replace(/\.[a-z0-9]+$/i, '') : null,
    mirrored: typeof reframe.mirrored === 'boolean' ? reframe.mirrored : null,
    framing,
    plays,
    lastPlayedAt: text(doc.lastPlayedAt),
    playsBySlideshow: by,
    people: doc.people,
    peopleBy: text(peopleReview.by),
    peopleAt: text(peopleReview.at),
    emails: {
      arrived: Boolean(text(metadata.arrivedEmailSentAt)),
      photoLink,
      photoLinkSkipReason: photoLink === 'skipped' ? (text(metadata.emailSkipReason) ?? 'no reason recorded') : null,
      photoLinkKind: photoLink === 'sent' ? photoLinkKind : null,
      declined: metadata.rejectionEmailSent === true ? 'sent' : metadata.rejectionEmailSent === false ? 'not_sent' : null,
    },
  };
}
