/**
 * The numbers of the Analytics view of an event, or of all events (issue 521, phase 1; docs/ANALYTICS_AUDIT.md section 7.4): photos taken, approved, rejected and waiting, the time from taking to the
 * first decision and who decided, photos and users per day and hour, how the users identified themselves, the frames, messages and layouts chosen, the plays on the
 * screens, the e-mails and the consents. **Everything is computed from data that already exists** (`submissions`, `email_registrations`, the slideshow names); what needs the journey recording of
 * phase 2 is listed in `NOT_MEASURED` and never shown as a zero.
 *
 * Pure and DOM-free: `buildEventReport` takes the facts of the photos (lib/analytics/facts.ts) and returns plain numbers, so the page, the export and the counters for messmass
 * (lib/analytics/counters.ts) all read the same figures. Unit-tested in report.test.ts.
 *
 * What is counted: the photos of kind original (a missing kind is an original), not removed from the event by an admin and not gone (a broken picture is named, not counted), filed under the
 * event. `taken` is what the users took or uploaded; a photo an editor added in the gallery is counted apart (`scope.addedByEditors`) because nobody took it, though it is shown on the screens.
 */

import { optionLabel, STANDARD_VOCABULARY, type ResolvedVocabulary } from '@/lib/photo-vetting/vocabulary';
import type { PhotoFacts } from './facts';
import { average, dayInRange, daysBetween, localParts, median, secondsBetween } from './time';

export interface Tally {
  id: string;
  label: string;
  count: number;
}

export interface RegistrationFact {
  email: string;
  createdAt: string | null;
  welcomeSent: boolean;
}

export interface ReportInput {
  photos: readonly PhotoFacts[];
  registrations?: readonly RegistrationFact[];
  /** The names of the slideshows by their id, for the plays. */
  slideshows?: ReadonlyArray<{ id: string; name: string }>;
  /** The event's vocabulary is used only to label rejection reasons in this report. */
  vocabulary?: ResolvedVocabulary;
}

export interface ReportOptions {
  timeZone: string;
  /** First and last day of the range (`YYYY-MM-DD`, both included); empty is open. */
  from?: string | null;
  to?: string | null;
  /** The clock for "the oldest photo has waited", injected in tests. */
  now?: Date;
  /** The event UUID lets the report distinguish a photo removed from one event but still filed under another. */
  eventKey?: string;
}

export interface DurationStats {
  count: number;
  /** All the durations added up, for the counters for messmass (a total can be added across events, an average cannot). */
  totalSeconds: number;
  avgSeconds: number | null;
  medianSeconds: number | null;
  maxSeconds: number | null;
}

export interface ReviewerRow {
  by: string;
  approvals: number;
  rejections: number;
  /** Photos whose first decision this person made, and how long those took from the photo being handed in. */
  firstDecisions: number;
  avgSeconds: number | null;
  medianSeconds: number | null;
}

export interface DayRow {
  day: string;
  photos: number;
  users: number;
  /** Users whose first photo of the period was on this day. */
  newUsers: number;
  /** Photos of this day whose user accepted at least one consent. */
  consented: number;
}

export interface EventReport {
  options: { timeZone: string; from: string | null; to: string | null };
  /** Full historical review totals, including archived, automatically deleted, and manually deleted photos. */
  outcomes: { approved: number; rejected: number };
  /** The vocabulary used to label rejection reasons, so a screen and counters for Messmass use the same words. */
  vocabulary: ResolvedVocabulary;
  scope: {
    /** Photos counted (taken by users plus added by editors). */
    counted: number;
    addedByEditors: number;
    /** Left out: removed from the event by an admin, and gone (the picture cannot be shown). */
    removed: number;
    brokenPictures: number;
    deletedAutomaticallyNoLogin: number;
    deletedAutomaticallyOther: number;
    deletedManually: number;
    firstPhotoAt: string | null;
    lastPhotoAt: string | null;
  };
  photos: {
    taken: number;
    approved: number;
    rejected: number;
    waiting: number;
    /** Taken before vetting existed or at an event without it: no decision to wait for. */
    notVetted: number;
    /** Approved over approved plus rejected; null before any decision. */
    approvalRate: number | null;
    /** The age in seconds of the photo that has waited longest, now. */
    oldestWaitingSeconds: number | null;
    /** Pending-photo age bands as of report time, for the review queue service level. */
    waitingAgeBuckets: Tally[];
  };
  vetting: {
    /** Photos with at least one recorded decision, and the decisions (a photo can be decided again). */
    decidedPhotos: number;
    decisions: number;
    approvals: number;
    rejections: number;
    /** Photos that are approved but carry no record of who and when (approved by the rollout of the setting). */
    approvedWithoutRecord: number;
    decidedAgain: number;
    timeToFirstDecision: DurationStats;
    timeBuckets: Tally[];
    reviewers: ReviewerRow[];
    decisionsByDay: Array<{ day: string; approvals: number; rejections: number }>;
    reasons: { rejectionsWithReason: number; rejectionsWithoutReason: number; top: Tally[] };
    /** The reasons chosen from the list, by key (`id`), over the photos that are rejected now: a photo with several reasons is in each. The label is the word of the vocabulary. Most often first. */
    rejectReasons: Tally[];
    /** Rejected photos that carry no reason from the list (rejected before the list existed). */
    rejectedWithoutReasons: number;
  };
  users: {
    /** Different users who took a photo and can be told apart (an e-mail or an account). */
    distinct: number;
    signedIn: number;
    typedEmail: number;
    /** Photos of users who gave neither: they cannot be told apart, so they are in the photo counts and not in the user counts. */
    photosWithoutIdentity: number;
    returning: number;
    photosPerUser: number | null;
    /** People who registered at the Who-are-you step (email_registrations), and how many of them took a photo. */
    registered: number;
    registeredWithPhoto: number;
  };
  activity: {
    days: DayRow[];
    hours: Array<{ hour: number; photos: number; users: number }>;
    busiestDay: { day: string; photos: number } | null;
    busiestHour: { hour: number; photos: number } | null;
  };
  devices: Tally[];
  methods: Tally[];
  framing: { modes: Tally[]; mirrored: number; mirroredKnown: number };
  choices: { frames: Tally[]; messages: Tally[]; layouts: Tally[]; withMessage: number };
  screens: {
    plays: number;
    photosShown: number;
    /** Photos the screens may show (not waiting, not rejected) and how many of them were shown at least once. */
    eligible: number;
    eligibleShown: number;
    avgPlaysPerShownPhoto: number | null;
    mostPlays: number;
    lastPlayedAt: string | null;
    bySlideshow: Array<{ id: string; name: string; plays: number; photos: number; lastPlayedAt: string | null }>;
  };
  emails: {
    welcome: { registrations: number; sent: number };
    arrived: { sent: number };
    photoLink: { sent: number; failed: number; skipped: number; skippedBy: Tally[]; byKind: { afterSave: number; relatedPhotos: number; tryOnRerun: number } };
    declined: { sent: number; notSent: number };
  };
  consents: {
    photosWithConsent: number;
    photosWithoutConsent: number;
    records: number;
    byLabel: Array<Tally & { pageType: 'accept' | 'cta'; firstAt: string | null; lastAt: string | null }>;
    galleryConsent: number;
    wallOptIn: number;
  };
}

/** Time to the first decision, in buckets the approvers can act on. */
const TIME_BUCKETS: ReadonlyArray<{ id: string; label: string; below: number }> = [
  { id: 'under-1m', label: 'Under 1 minute', below: 60 },
  { id: '1-5m', label: '1 to 5 minutes', below: 300 },
  { id: '5-15m', label: '5 to 15 minutes', below: 900 },
  { id: '15-60m', label: '15 to 60 minutes', below: 3600 },
  { id: '1-6h', label: '1 to 6 hours', below: 21600 },
  { id: 'over-6h', label: 'Over 6 hours', below: Infinity },
];

const DEVICE_LABELS: Record<string, string> = { ios: 'iPhone or iPad', android: 'Android', desktop: 'Desktop', unknown: 'Not recorded' };
const METHOD_LABELS: Record<string, string> = { camera: 'Camera', upload: 'Uploaded from the device', unknown: 'Not recorded (older photos)' };
const FRAMING_LABELS: Record<string, string> = { fill: 'Fills the frame', fit: 'Fits the whole photo', custom: 'Moved or zoomed by the user', unknown: 'Not recorded' };

function tally(entries: ReadonlyArray<{ id: string; label: string }>, order: 'count' | 'label' = 'count'): Tally[] {
  const map = new Map<string, Tally>();
  for (const entry of entries) {
    const row = map.get(entry.id);
    if (row) row.count += 1;
    else map.set(entry.id, { id: entry.id, label: entry.label, count: 1 });
  }
  const rows = [...map.values()];
  return order === 'count' ? rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) : rows.sort((a, b) => a.label.localeCompare(b.label));
}

function fixedTally(ids: readonly string[], labels: Record<string, string>, values: readonly string[]): Tally[] {
  return ids.map((id) => ({ id, label: labels[id] ?? id, count: values.filter((value) => value === id).length }));
}

function durationStats(seconds: readonly number[]): DurationStats {
  return { count: seconds.length, totalSeconds: seconds.reduce((sum, value) => sum + value, 0), avgSeconds: average(seconds), medianSeconds: median(seconds), maxSeconds: seconds.length > 0 ? Math.max(...seconds) : null };
}

/** The photos the report counts for a range, and how many were left out. */
function inScope(photos: readonly PhotoFacts[], options: ReportOptions): { counted: PhotoFacts[]; inRange: PhotoFacts[]; removed: number; broken: number; deletedAutomaticallyNoLogin: number; deletedAutomaticallyOther: number; deletedManually: number } {
  const counted: PhotoFacts[] = [];
  const inRange: PhotoFacts[] = [];
  let removed = 0;
  let broken = 0;
  let deletedAutomaticallyNoLogin = 0;
  let deletedAutomaticallyOther = 0;
  let deletedManually = 0;
  for (const photo of photos) {
    const day = localParts(photo.createdAt, options.timeZone)?.day;
    // A photo with no valid time cannot be put on a day: it is counted only when no range is asked for.
    if (day ? !dayInRange(day, options.from, options.to) : Boolean(options.from || options.to)) continue;
    inRange.push(photo);
    const hiddenFromEvent = options.eventKey ? (photo.hiddenEventKeys ?? []).includes(options.eventKey) : Boolean(photo.hiddenEventKeys?.length);
    if (photo.deletion === 'automatic_no_login') deletedAutomaticallyNoLogin += 1;
    else if (photo.deletion === 'automatic_other') deletedAutomaticallyOther += 1;
    else if (photo.deletion === 'manual' || photo.excluded === 'archived' || hiddenFromEvent) {
      deletedManually += 1;
      if (photo.excluded === 'archived') removed += 1;
    }
    else if (photo.excluded === 'broken') broken += 1;
    else counted.push(photo);
  }
  return { counted, inRange, removed, broken, deletedAutomaticallyNoLogin, deletedAutomaticallyOther, deletedManually };
}

export function buildEventReport(input: ReportInput, options: ReportOptions): EventReport {
  const now = options.now ?? new Date();
  const vocabulary = input.vocabulary ?? STANDARD_VOCABULARY;
  const { counted, inRange, removed, broken, deletedAutomaticallyNoLogin, deletedAutomaticallyOther, deletedManually } = inScope(input.photos, options);
  const userPhotos = counted.filter((photo) => photo.source === 'user');
  const editorPhotos = counted.filter((photo) => photo.source === 'editor');

  // --- photos by state ---
  const approved = userPhotos.filter((photo) => photo.review === 'approved').length;
  const rejected = userPhotos.filter((photo) => photo.review === 'rejected').length;
  const allUserPhotoRecords = inRange.filter((photo) => photo.source === 'user');
  const waitingPhotos = userPhotos.filter((photo) => photo.review === 'waiting');
  const waitingAges = waitingPhotos.map((photo) => secondsBetween(photo.submittedAt, now.toISOString())).filter((value): value is number => value !== null);

  // --- vetting ---
  const decided = userPhotos.filter((photo) => photo.decisions.length > 0);
  const allDecisions = decided.flatMap((photo) => photo.decisions.map((decision) => ({ photo, decision })));
  const firstTimes = decided.map((photo) => ({ by: photo.decisions[0].by, seconds: secondsBetween(photo.submittedAt, photo.decisions[0].at) })).filter((row): row is { by: string; seconds: number } => row.seconds !== null);
  const reviewerNames = [...new Set(allDecisions.map(({ decision }) => decision.by))];
  const reviewers: ReviewerRow[] = reviewerNames
    .map((by) => {
      const own = allDecisions.filter(({ decision }) => decision.by === by);
      const times = firstTimes.filter((row) => row.by === by).map((row) => row.seconds);
      return {
        by,
        approvals: own.filter(({ decision }) => decision.action === 'approve').length,
        rejections: own.filter(({ decision }) => decision.action === 'reject').length,
        firstDecisions: decided.filter((photo) => photo.decisions[0].by === by).length,
        avgSeconds: average(times),
        medianSeconds: median(times),
      };
    })
    .sort((a, b) => b.approvals + b.rejections - (a.approvals + a.rejections) || a.by.localeCompare(b.by));

  const decisionDays = new Map<string, { approvals: number; rejections: number }>();
  for (const { decision } of allDecisions) {
    const day = localParts(decision.at, options.timeZone)?.day;
    if (!day) continue;
    const row = decisionDays.get(day) ?? { approvals: 0, rejections: 0 };
    if (decision.action === 'approve') row.approvals += 1;
    else row.rejections += 1;
    decisionDays.set(day, row);
  }

  const rejectionDecisions = allDecisions.filter(({ decision }) => decision.action === 'reject');
  const reasonRows = new Map<string, Tally>();
  for (const { decision } of rejectionDecisions) {
    if (!decision.reason) continue;
    const key = decision.reason.toLowerCase().replace(/\s+/g, ' ');
    const row = reasonRows.get(key);
    if (row) row.count += 1;
    else reasonRows.set(key, { id: key, label: decision.reason.replace(/\s+/g, ' '), count: 1 });
  }

  // The reasons chosen from the list, over the photos that are rejected now (a photo rejected and approved again keeps its stored reasons but is not counted).
  const rejectedPhotos = userPhotos.filter((photo) => photo.review === 'rejected');
  const rejectReasons = tally(rejectedPhotos.flatMap((photo) => photo.rejectReasons.map((key) => ({ id: key, label: optionLabel(vocabulary, 'reject_reason', key) }))));

  // --- users ---
  const byUser = new Map<string, PhotoFacts[]>();
  for (const photo of userPhotos) {
    if (!photo.userKey) continue;
    const list = byUser.get(photo.userKey) ?? [];
    list.push(photo);
    byUser.set(photo.userKey, list);
  }
  const userEntries = [...byUser.entries()];
  const signedInUsers = userEntries.filter(([, photos]) => photos.some((photo) => photo.identity === 'signed_in')).length;
  const registrations = (input.registrations ?? []).filter((row) => {
    const day = localParts(row.createdAt, options.timeZone)?.day;
    return day ? dayInRange(day, options.from, options.to) : !(options.from || options.to);
  });
  const registeredEmails = new Set(registrations.map((row) => row.email.toLowerCase()));
  const photoEmails = new Set(userPhotos.map((photo) => photo.email).filter((email): email is string => Boolean(email)));

  // --- per day and hour ---
  const dayPhotos = new Map<string, PhotoFacts[]>();
  const hourPhotos = new Map<number, PhotoFacts[]>();
  for (const photo of userPhotos) {
    const parts = localParts(photo.createdAt, options.timeZone);
    if (!parts) continue;
    dayPhotos.set(parts.day, [...(dayPhotos.get(parts.day) ?? []), photo]);
    hourPhotos.set(parts.hour, [...(hourPhotos.get(parts.hour) ?? []), photo]);
  }
  const firstDayOfUser = new Map<string, string>();
  for (const [key, photos] of userEntries) {
    const days = photos.map((photo) => localParts(photo.createdAt, options.timeZone)?.day).filter((day): day is string => Boolean(day)).sort();
    if (days[0]) firstDayOfUser.set(key, days[0]);
  }
  const sortedDays = [...dayPhotos.keys()].sort();
  const days: DayRow[] = sortedDays.length === 0 ? [] : daysBetween(sortedDays[0], sortedDays[sortedDays.length - 1]).map((day) => {
    const photos = dayPhotos.get(day) ?? [];
    return {
      day,
      photos: photos.length,
      users: new Set(photos.map((photo) => photo.userKey).filter(Boolean)).size,
      newUsers: [...firstDayOfUser.values()].filter((first) => first === day).length,
      consented: photos.filter((photo) => photo.consents.length > 0).length,
    };
  });
  const hours = Array.from({ length: 24 }, (_, hour) => {
    const photos = hourPhotos.get(hour) ?? [];
    return { hour, photos: photos.length, users: new Set(photos.map((photo) => photo.userKey).filter(Boolean)).size };
  });
  const busiestDay = days.reduce<DayRow | null>((best, row) => (row.photos > (best?.photos ?? 0) ? row : best), null);
  const busiestHour = hours.reduce<{ hour: number; photos: number; users: number } | null>((best, row) => (row.photos > (best?.photos ?? 0) ? row : best), null);

  // --- frames, messages, layouts ---
  const layoutRows = tally(userPhotos.filter((photo) => photo.layout).map((photo) => ({ id: photo.layout as string, label: photo.layout as string })));
  const messageRows = tally(userPhotos.filter((photo) => photo.message).map((photo) => ({ id: (photo.message as string).toLowerCase(), label: photo.message as string })));

  // --- screens ---
  const slideshowNames = new Map((input.slideshows ?? []).map((slideshow) => [slideshow.id, slideshow.name]));
  const bySlideshow = new Map<string, { id: string; name: string; plays: number; photos: number; lastPlayedAt: string | null }>();
  for (const photo of counted) {
    for (const [id, row] of Object.entries(photo.playsBySlideshow)) {
      if (row.count <= 0) continue;
      const entry = bySlideshow.get(id) ?? { id, name: slideshowNames.get(id) ?? `Slideshow ${id.slice(0, 8)}`, plays: 0, photos: 0, lastPlayedAt: null };
      entry.plays += row.count;
      entry.photos += 1;
      if (row.lastPlayedAt && (!entry.lastPlayedAt || row.lastPlayedAt > entry.lastPlayedAt)) entry.lastPlayedAt = row.lastPlayedAt;
      bySlideshow.set(id, entry);
    }
  }
  const eligible = counted.filter((photo) => photo.review !== 'waiting' && photo.review !== 'rejected');
  const shown = counted.filter((photo) => photo.plays > 0);
  const lastPlayed = counted.map((photo) => photo.lastPlayedAt).filter((value): value is string => Boolean(value)).sort().pop() ?? null;

  // --- e-mails ---
  const photoLinks = userPhotos.filter((photo) => photo.emails.photoLink);
  const skipped = photoLinks.filter((photo) => photo.emails.photoLink === 'skipped');

  // --- consents ---
  const consentRows = new Map<string, Tally & { pageType: 'accept' | 'cta'; firstAt: string | null; lastAt: string | null }>();
  let consentRecords = 0;
  for (const photo of userPhotos) {
    for (const consent of photo.consents) {
      consentRecords += 1;
      const key = `${consent.pageType}|${consent.label.toLowerCase()}`;
      const row = consentRows.get(key) ?? { id: key, label: consent.label, count: 0, pageType: consent.pageType, firstAt: null, lastAt: null };
      row.count += 1;
      if (consent.at && (!row.firstAt || consent.at < row.firstAt)) row.firstAt = consent.at;
      if (consent.at && (!row.lastAt || consent.at > row.lastAt)) row.lastAt = consent.at;
      consentRows.set(key, row);
    }
  }

  const times = counted.map((photo) => photo.createdAt).filter((value): value is string => Boolean(value)).sort();

  return {
    options: { timeZone: options.timeZone, from: options.from || null, to: options.to || null },
    outcomes: {
      approved: allUserPhotoRecords.filter((photo) => photo.review === 'approved').length,
      rejected: allUserPhotoRecords.filter((photo) => photo.review === 'rejected').length,
    },
    vocabulary,
    scope: { counted: counted.length, addedByEditors: editorPhotos.length, removed, brokenPictures: broken, deletedAutomaticallyNoLogin, deletedAutomaticallyOther, deletedManually, firstPhotoAt: times[0] ?? null, lastPhotoAt: times[times.length - 1] ?? null },
    photos: {
      taken: userPhotos.length,
      approved,
      rejected,
      waiting: waitingPhotos.length,
      notVetted: userPhotos.length - approved - rejected - waitingPhotos.length,
      approvalRate: approved + rejected > 0 ? approved / (approved + rejected) : null,
      oldestWaitingSeconds: waitingAges.length > 0 ? Math.max(...waitingAges) : null,
      waitingAgeBuckets: [
        { id: 'under-15m', label: 'Under 15 minutes', count: waitingAges.filter((seconds) => seconds < 15 * 60).length },
        { id: '15m-1h', label: '15 minutes to 1 hour', count: waitingAges.filter((seconds) => seconds >= 15 * 60 && seconds < 60 * 60).length },
        { id: '1-6h', label: '1 to 6 hours', count: waitingAges.filter((seconds) => seconds >= 60 * 60 && seconds < 6 * 60 * 60).length },
        { id: '6-24h', label: '6 to 24 hours', count: waitingAges.filter((seconds) => seconds >= 6 * 60 * 60 && seconds < 24 * 60 * 60).length },
        { id: 'over-24h', label: 'Over 24 hours', count: waitingAges.filter((seconds) => seconds >= 24 * 60 * 60).length },
      ],
    },
    vetting: {
      decidedPhotos: decided.length,
      decisions: allDecisions.length,
      approvals: allDecisions.filter(({ decision }) => decision.action === 'approve').length,
      rejections: rejectionDecisions.length,
      approvedWithoutRecord: userPhotos.filter((photo) => photo.review === 'approved' && photo.decisions.length === 0).length,
      decidedAgain: decided.filter((photo) => photo.decisions.length > 1).length,
      timeToFirstDecision: durationStats(firstTimes.map((row) => row.seconds)),
      timeBuckets: TIME_BUCKETS.map((bucket, index) => ({
        id: bucket.id,
        label: bucket.label,
        count: firstTimes.filter((row) => row.seconds < bucket.below && row.seconds >= (index === 0 ? 0 : TIME_BUCKETS[index - 1].below)).length,
      })),
      reviewers,
      decisionsByDay: [...decisionDays.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, row]) => ({ day, ...row })),
      reasons: {
        rejectionsWithReason: rejectionDecisions.filter(({ decision }) => decision.reason).length,
        rejectionsWithoutReason: rejectionDecisions.filter(({ decision }) => !decision.reason).length,
        top: [...reasonRows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 10),
      },
      rejectReasons,
      rejectedWithoutReasons: rejectedPhotos.filter((photo) => photo.rejectReasons.length === 0).length,
    },
    users: {
      distinct: byUser.size,
      signedIn: signedInUsers,
      typedEmail: byUser.size - signedInUsers,
      photosWithoutIdentity: userPhotos.filter((photo) => !photo.userKey).length,
      returning: userEntries.filter(([, photos]) => photos.length >= 2).length,
      photosPerUser: byUser.size > 0 ? Math.round((userEntries.reduce((sum, [, photos]) => sum + photos.length, 0) / byUser.size) * 100) / 100 : null,
      registered: registeredEmails.size,
      registeredWithPhoto: [...registeredEmails].filter((email) => photoEmails.has(email)).length,
    },
    activity: { days, hours, busiestDay: busiestDay ? { day: busiestDay.day, photos: busiestDay.photos } : null, busiestHour: busiestHour ? { hour: busiestHour.hour, photos: busiestHour.photos } : null },
    devices: fixedTally(['ios', 'android', 'desktop', 'unknown'], DEVICE_LABELS, userPhotos.map((photo) => photo.device)),
    methods: fixedTally(['camera', 'upload', 'unknown'], METHOD_LABELS, userPhotos.map((photo) => photo.method)),
    framing: {
      modes: fixedTally(['fill', 'fit', 'custom', 'unknown'], FRAMING_LABELS, userPhotos.map((photo) => photo.framing ?? 'unknown')),
      mirrored: userPhotos.filter((photo) => photo.mirrored === true).length,
      mirroredKnown: userPhotos.filter((photo) => photo.mirrored !== null).length,
    },
    choices: {
      frames: tally(userPhotos.map((photo) => ({ id: `${photo.frame.kind}|${photo.frame.label}`, label: photo.frame.label }))),
      messages: messageRows.slice(0, 12),
      layouts: layoutRows.map((row) => ({ ...row, label: `Layout ${row.id.slice(0, 8)}` })),
      withMessage: userPhotos.filter((photo) => photo.message).length,
    },
    screens: {
      plays: counted.reduce((sum, photo) => sum + photo.plays, 0),
      photosShown: shown.length,
      eligible: eligible.length,
      eligibleShown: eligible.filter((photo) => photo.plays > 0).length,
      avgPlaysPerShownPhoto: shown.length > 0 ? Math.round((counted.reduce((sum, photo) => sum + photo.plays, 0) / shown.length) * 10) / 10 : null,
      mostPlays: counted.reduce((max, photo) => Math.max(max, photo.plays), 0),
      lastPlayedAt: lastPlayed,
      bySlideshow: [...bySlideshow.values()].sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name)),
    },
    emails: {
      welcome: { registrations: registrations.length, sent: registrations.filter((row) => row.welcomeSent).length },
      arrived: { sent: userPhotos.filter((photo) => photo.emails.arrived).length },
      photoLink: {
        sent: photoLinks.filter((photo) => photo.emails.photoLink === 'sent').length,
        failed: photoLinks.filter((photo) => photo.emails.photoLink === 'failed').length,
        skipped: skipped.length,
        skippedBy: tally(skipped.map((photo) => ({ id: photo.emails.photoLinkSkipReason ?? 'unknown', label: photo.emails.photoLinkSkipReason ?? 'unknown' }))),
        byKind: {
          afterSave: userPhotos.filter((photo) => photo.emails.photoLinkKind === 'afterSave').length,
          relatedPhotos: userPhotos.filter((photo) => photo.emails.photoLinkKind === 'relatedPhotos').length,
          tryOnRerun: userPhotos.filter((photo) => photo.emails.photoLinkKind === 'tryOnRerun').length,
        },
      },
      declined: { sent: userPhotos.filter((photo) => photo.emails.declined === 'sent').length, notSent: userPhotos.filter((photo) => photo.emails.declined === 'not_sent').length },
    },
    consents: {
      photosWithConsent: userPhotos.filter((photo) => photo.consents.length > 0).length,
      photosWithoutConsent: userPhotos.filter((photo) => photo.consents.length === 0).length,
      records: consentRecords,
      byLabel: [...consentRows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      galleryConsent: userPhotos.filter((photo) => photo.galleryConsentAt).length,
      wallOptIn: userPhotos.filter((photo) => photo.wallOptIn).length,
    },
  };
}

export interface EventsTableRow {
  key: string;
  /** The Mongo id of the event (`/admin/events/<id>`), when known. */
  id: string | null;
  name: string;
  taken: number;
  approved: number;
  rejected: number;
  deletedAutomaticallyNoLogin: number;
  deletedAutomaticallyOther: number;
  deletedManually: number;
  waiting: number;
  plays: number;
  users: number;
  avgDecisionSeconds: number | null;
}

/** One row per event for the all-events view: the same counts as the report, grouped by the event a photo is filed under. Busiest first. */
export function buildEventsTable(photos: readonly PhotoFacts[], events: ReadonlyArray<{ key: string; name: string; id?: string }>, options: ReportOptions): EventsTableRow[] {
  const known = new Map(events.map((event) => [event.key, event]));
  const keys = [...new Set(photos.flatMap((photo) => [...photo.eventKeys, ...(photo.hiddenEventKeys ?? [])]))];
  return keys
    .map((key) => {
      const report = buildEventReport({ photos: photos.filter((photo) => photo.eventKeys.includes(key) || (photo.hiddenEventKeys ?? []).includes(key)) }, { ...options, eventKey: key });
      return {
        key,
        id: known.get(key)?.id ?? null,
        name: known.get(key)?.name ?? key,
        taken: report.photos.taken,
        approved: report.outcomes.approved,
        rejected: report.outcomes.rejected,
        deletedAutomaticallyNoLogin: report.scope.deletedAutomaticallyNoLogin,
        deletedAutomaticallyOther: report.scope.deletedAutomaticallyOther,
        deletedManually: report.scope.deletedManually,
        waiting: report.photos.waiting,
        plays: report.screens.plays,
        users: report.users.distinct,
        avgDecisionSeconds: report.vetting.timeToFirstDecision.avgSeconds,
      };
    })
    .filter((row) => row.taken > 0 || row.plays > 0 || row.deletedAutomaticallyNoLogin > 0 || row.deletedAutomaticallyOther > 0 || row.deletedManually > 0)
    .sort((a, b) => b.taken - a.taken || a.name.localeCompare(b.name));
}

export interface NotMeasured {
  what: string;
  why: string;
  waitsFor: 'link redirect' | 'screen recording' | 'sign-in log' | 'a decision';
}

/**
 * What the audit asks for and the data cannot give yet. Shown on the Overview, so a missing number is explained and never a silent zero. The journey (opens, steps, camera permission,
 * retakes, consent left, shares, downloads) is no longer here: the journey recording of issue 521 phase 2 measures it, on the Journey tab, from the day it was switched on.
 */
export const NOT_MEASURED: readonly NotMeasured[] = [
  { what: 'Which QR or poster a visit or a photo came from', why: 'The link redirect (go.messmass.com) drops the placement, so a visit to the capture page cannot be tied to the link that brought the user, and passing it on changes the live redirect (the visits per link are shown under Sources).', waitsFor: 'link redirect' },
  { what: 'Country and city of the users', why: 'The fields are never filled, and a place would need the IP address of the photo, which decision 243 stops keeping.', waitsFor: 'a decision' },
  { what: 'Plays on the screens by hour or by screen', why: 'Only a running count and the time of the last play are kept per photo and slideshow; recording each play touches the giant screen, which is frozen until after the match.', waitsFor: 'screen recording' },
  { what: 'Sign-ins by provider', why: 'The last sign-in is declared and never written; sign-ins are console lines.', waitsFor: 'sign-in log' },
  { what: 'E-mail opens, clicks and bounces', why: 'Not tracked; the audit does not propose a tracking pixel.', waitsFor: 'a decision' },
];
