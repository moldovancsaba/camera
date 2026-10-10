/**
 * The Analytics report as a CSV file (issue 521): one row per figure, `section,item,value`, so a spreadsheet can pivot it and nothing is lost to a layout. Pure; unit-tested in export.test.ts.
 *
 * A cell that begins with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a quote in front, so a spreadsheet never takes a user's words (a decline reason, a message, a consent
 * sentence) or a reviewer's name for a formula; a cell with a comma, a quote or a line break is quoted. Times are as stored (ISO, UTC); days are the days of the chosen clock.
 */

import { PERSON_OPTIONS, EMOTION_OPTIONS, MERCH_OPTIONS } from '@/lib/photo-vetting/people';
import type { EventReport } from './report';
import type { SourcesReport } from './sources';

export type ExportRow = [section: string, item: string, value: string | number | null];

export const ANALYTICS_CSV_HEADER = ['section', 'item', 'value'] as const;

export function analyticsRows(report: EventReport, sources?: SourcesReport): ExportRow[] {
  const rows: ExportRow[] = [];
  const add = (section: string, item: string, value: string | number | null) => rows.push([section, item, value]);
  const tallies = (section: string, list: ReadonlyArray<{ label: string; count: number }>) => list.forEach((row) => add(section, row.label, row.count));

  add('scope', 'time zone', report.options.timeZone);
  add('scope', 'from day', report.options.from);
  add('scope', 'to day', report.options.to);
  add('scope', 'photos counted', report.scope.counted);
  add('scope', 'added by editors', report.scope.addedByEditors);
  add('scope', 'removed from the event (left out)', report.scope.removed);
  add('scope', 'picture gone (left out)', report.scope.brokenPictures);
  add('scope', 'first photo at', report.scope.firstPhotoAt);
  add('scope', 'last photo at', report.scope.lastPhotoAt);

  const { photos, vetting } = report;
  add('photos', 'taken', photos.taken);
  add('photos', 'approved', photos.approved);
  add('photos', 'declined', photos.rejected);
  add('photos', 'waiting', photos.waiting);
  add('photos', 'not vetted', photos.notVetted);
  add('photos', 'approval rate (0 to 1)', photos.approvalRate === null ? null : Math.round(photos.approvalRate * 1000) / 1000);
  add('photos', 'oldest waiting (seconds)', photos.oldestWaitingSeconds);

  add('vetting', 'decided photos', vetting.decidedPhotos);
  add('vetting', 'decisions', vetting.decisions);
  add('vetting', 'approvals', vetting.approvals);
  add('vetting', 'declines', vetting.rejections);
  add('vetting', 'approved without a record', vetting.approvedWithoutRecord);
  add('vetting', 'photos decided again', vetting.decidedAgain);
  add('vetting', 'time to first decision: photos', vetting.timeToFirstDecision.count);
  add('vetting', 'time to first decision: average (seconds)', vetting.timeToFirstDecision.avgSeconds);
  add('vetting', 'time to first decision: median (seconds)', vetting.timeToFirstDecision.medianSeconds);
  add('vetting', 'time to first decision: longest (seconds)', vetting.timeToFirstDecision.maxSeconds);
  tallies('vetting time buckets', vetting.timeBuckets);
  for (const person of vetting.reviewers) {
    add('vetting by person', `${person.by}: approved`, person.approvals);
    add('vetting by person', `${person.by}: declined`, person.rejections);
    add('vetting by person', `${person.by}: decided first`, person.firstDecisions);
    add('vetting by person', `${person.by}: average seconds`, person.avgSeconds);
    add('vetting by person', `${person.by}: median seconds`, person.medianSeconds);
  }
  for (const day of vetting.decisionsByDay) {
    add('vetting by day', `${day.day}: approved`, day.approvals);
    add('vetting by day', `${day.day}: declined`, day.rejections);
  }
  add('decline reasons', 'declines with a reason', vetting.reasons.rejectionsWithReason);
  add('decline reasons', 'declines without a reason', vetting.reasons.rejectionsWithoutReason);
  tallies('decline reasons', vetting.reasons.top);

  const people = report.people.summary;
  add('people', 'photos looked at', people.photos);
  add('people', 'photos with somebody in them', people.photosWithPeople);
  add('people', 'people', people.people);
  for (const option of PERSON_OPTIONS) add('people', option.label, people.byPerson[option.id] ?? 0);
  for (const option of EMOTION_OPTIONS) add('people emotion', option.label, people.byEmotion[option.id]);
  add('people merchandise', 'people with any', people.withMerch);
  for (const option of MERCH_OPTIONS) add('people merchandise', option.label, people.byMerch[option.id]);
  tallies('people marked by', report.people.markers);

  const { users } = report;
  add('users', 'different users', users.distinct);
  add('users', 'signed in', users.signedIn);
  add('users', 'gave an e-mail', users.typedEmail);
  add('users', 'photos without an e-mail or an account', users.photosWithoutIdentity);
  add('users', 'took more than one photo', users.returning);
  add('users', 'photos per user', users.photosPerUser);
  add('users', 'registered at the Who-are-you step', users.registered);
  add('users', 'registered who took a photo', users.registeredWithPhoto);

  for (const day of report.activity.days) {
    add('per day', `${day.day}: photos`, day.photos);
    add('per day', `${day.day}: users`, day.users);
    add('per day', `${day.day}: new users`, day.newUsers);
    add('per day', `${day.day}: photos with a consent`, day.consented);
  }
  for (const hour of report.activity.hours) {
    add('per hour', `${String(hour.hour).padStart(2, '0')}:00: photos`, hour.photos);
    add('per hour', `${String(hour.hour).padStart(2, '0')}:00: users`, hour.users);
  }

  tallies('devices', report.devices);
  tallies('how the photo was provided', report.methods);
  tallies('framing', report.framing.modes);
  add('framing', 'mirrored (front camera)', report.framing.mirrored);
  add('framing', 'photos with a record of it', report.framing.mirroredKnown);
  tallies('frames chosen', report.choices.frames);
  tallies('messages chosen', report.choices.messages);
  tallies('layouts chosen', report.choices.layouts);

  const { screens } = report;
  add('screens', 'plays', screens.plays);
  add('screens', 'photos shown', screens.photosShown);
  add('screens', 'photos the screens may show', screens.eligible);
  add('screens', 'of those, shown', screens.eligibleShown);
  add('screens', 'plays per shown photo', screens.avgPlaysPerShownPhoto);
  add('screens', 'most plays of one photo', screens.mostPlays);
  add('screens', 'last play at', screens.lastPlayedAt);
  for (const show of screens.bySlideshow) add('plays by slideshow', show.name, show.plays);

  const { emails } = report;
  add('e-mails', 'welcome: registered', emails.welcome.registrations);
  add('e-mails', 'welcome: sent', emails.welcome.sent);
  add('e-mails', 'arrived: sent', emails.arrived.sent);
  add('e-mails', 'photo link: sent', emails.photoLink.sent);
  add('e-mails', 'photo link: failed', emails.photoLink.failed);
  add('e-mails', 'photo link: skipped', emails.photoLink.skipped);
  tallies('e-mails photo link skipped because', emails.photoLink.skippedBy);
  add('e-mails', 'declined: sent', emails.declined.sent);
  add('e-mails', 'declined: not sent', emails.declined.notSent);

  const { consents } = report;
  add('consents', 'photos with a consent', consents.photosWithConsent);
  add('consents', 'photos with no consent record', consents.photosWithoutConsent);
  add('consents', 'consent records', consents.records);
  add('consents', 'allowed in the public gallery', consents.galleryConsent);
  add('consents', 'allowed on the public wall', consents.wallOptIn);
  for (const row of consents.byLabel) add('consents by wording', `${row.pageType}: ${row.label}`, row.count);

  if (sources) {
    add('sources', 'visits', sources.totals.visits);
    add('sources', 'through QR codes', sources.totals.qr);
    add('sources', 'through links', sources.totals.link);
    for (const row of sources.rows) add('visits by link', `${row.placement} (${row.slug})`, row.visits);
    for (const day of sources.days) add('visits per day (UTC)', day.day, day.visits);
  }
  return rows;
}

function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function analyticsCsv(rows: readonly ExportRow[]): string {
  return [ANALYTICS_CSV_HEADER.join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n') + '\r\n';
}
