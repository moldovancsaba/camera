import type { Db } from 'mongodb';
import { COLLECTIONS, type LeatherSuit, type Submission, type TryOnJob } from '@/lib/db/schemas';

export type TryOnAnalyticsBucket = 'approved' | 'rejected' | 'service' | 'greatest';

export interface TryOnAnalyticsFilters {
  bucket?: TryOnAnalyticsBucket | '';
  eventId?: string;
  from?: string;
  to?: string;
}

export interface TryOnAnalyticsRow {
  key: string;
  label: string;
  approved: number;
  rejected: number;
  service: number;
  greatest: number;
  total: number;
}

export interface TryOnFunnelMetrics {
  submitted: number;
  queued: number;
  processing: number;
  generated: number;
  approved: number;
  declined: number;
  service: number;
  supersededRerun: number;
  failed: number;
}

export interface TryOnAnalyticsResult {
  totals: {
    approved: number;
    rejected: number;
    service: number;
    greatest: number;
    supersededRerun: number;
    total: number;
  };
  funnel: TryOnFunnelMetrics;
  byPreset: TryOnAnalyticsRow[];
  byGarment: TryOnAnalyticsRow[];
  byEvent: TryOnAnalyticsRow[];
  presetPerformance: TryOnPresetPerformanceRow[];
  hourlyOutcomes: TryOnHourlyOutcomeRow[];
  scannedResultCount: number;
}

export interface TryOnHourlyOutcomeRow {
  hour: string;
  label: string;
  approved: number;
  rejected: number;
  service: number;
  failed: number;
  total: number;
}

export interface TryOnPresetPerformanceRow {
  setupId: string;
  setupName: string;
  jobs: number;
  done: number;
  failed: number;
  retryWait: number;
  providerTimeouts: number;
  approved: number;
  rejected: number;
  service: number;
  great: number;
  approvalRate: number;
}

function isGreat(metadata: Submission['metadata']) {
  return Boolean(metadata && typeof metadata === 'object' && (metadata as Record<string, unknown>).tryOnGreat);
}

function increment(
  row: Pick<TryOnAnalyticsRow, 'approved' | 'rejected' | 'service' | 'greatest' | 'total'>,
  bucket: 'approved' | 'rejected' | 'service',
  great: boolean
) {
  row[bucket] += 1;
  row.total += 1;
  if (great) {
    row.greatest += 1;
  }
}

function isSupersededArchive(doc: Submission): boolean {
  return doc.tryOnModerationArchive?.reason === 'quality_rerun_superseded';
}

export async function collectTryOnFunnelMetrics(
  db: Db,
  filters: TryOnAnalyticsFilters = {}
): Promise<TryOnFunnelMetrics> {
  const jobMatch = buildJobMatch(filters);
  const resultMatch = buildMatch(filters);

  const [jobCounts, resultCount, archivedOutcomes] = await Promise.all([
    db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).aggregate<{ _id: string; count: number }>([
      { $match: jobMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection<Submission>(COLLECTIONS.SUBMISSIONS).countDocuments({
      submissionKind: 'tryon_result',
      ...(filters.eventId
        ? { $or: [{ eventId: filters.eventId }, { eventIds: { $in: [filters.eventId] } }] }
        : {}),
    }),
    db.collection<Submission>(COLLECTIONS.SUBMISSIONS).find(resultMatch).limit(5000).toArray(),
  ]);

  const statusMap = new Map(jobCounts.map((row) => [row._id, row.count]));
  const submitted = Array.from(statusMap.values()).reduce((sum, count) => sum + count, 0);
  const queued = (statusMap.get('queued') ?? 0) + (statusMap.get('retry_wait') ?? 0);
  const processing =
    (statusMap.get('claimed') ?? 0) +
    (statusMap.get('processing') ?? 0) +
    (statusMap.get('uploading_result') ?? 0) +
    (statusMap.get('notifying_camera') ?? 0);
  const failed = statusMap.get('failed') ?? 0;

  const funnel: TryOnFunnelMetrics = {
    submitted,
    queued,
    processing,
    generated: resultCount,
    approved: 0,
    declined: 0,
    service: 0,
    supersededRerun: 0,
    failed,
  };

  for (const doc of archivedOutcomes) {
    if (isSupersededArchive(doc)) {
      funnel.supersededRerun += 1;
      continue;
    }
    const bucket = doc.tryOnModerationArchive?.bucket;
    if (bucket === 'approved') funnel.approved += 1;
    else if (bucket === 'rejected') funnel.declined += 1;
    else if (bucket === 'service') funnel.service += 1;
  }

  return funnel;
}

function getOrCreate(map: Map<string, TryOnAnalyticsRow>, key: string, label: string) {
  const existing = map.get(key);
  if (existing) return existing;
  const row: TryOnAnalyticsRow = {
    key,
    label,
    approved: 0,
    rejected: 0,
    service: 0,
    greatest: 0,
    total: 0,
  };
  map.set(key, row);
  return row;
}

function sortRows(rows: TryOnAnalyticsRow[]) {
  return rows.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function toHourKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function formatHourLabel(hour: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(hour));
}

function getOrCreateHourlyOutcome(map: Map<string, TryOnHourlyOutcomeRow>, hour: string) {
  const existing = map.get(hour);
  if (existing) return existing;
  const row: TryOnHourlyOutcomeRow = {
    hour,
    label: `${formatHourLabel(hour)} UTC`,
    approved: 0,
    rejected: 0,
    service: 0,
    failed: 0,
    total: 0,
  };
  map.set(hour, row);
  return row;
}

function buildMatch(filters: TryOnAnalyticsFilters) {
  const match: Record<string, unknown> = {
    submissionKind: 'tryon_result',
    'tryOnModerationArchive.archived': true,
  };

  if (filters.bucket === 'greatest') {
    match['tryOnModerationArchive.bucket'] = 'approved';
    match['metadata.tryOnGreat'] = true;
  } else if (filters.bucket) {
    match['tryOnModerationArchive.bucket'] = filters.bucket;
  } else {
    match['tryOnModerationArchive.bucket'] = { $in: ['approved', 'rejected', 'service'] };
  }

  if (filters.eventId) {
    match.$or = [{ eventId: filters.eventId }, { eventIds: { $in: [filters.eventId] } }];
  }

  const archivedAt: Record<string, string> = {};
  if (filters.from) archivedAt.$gte = filters.from;
  if (filters.to) archivedAt.$lte = filters.to;
  if (Object.keys(archivedAt).length > 0) {
    match['tryOnModerationArchive.archivedAt'] = archivedAt;
  }

  return match;
}

function buildJobMatch(filters: TryOnAnalyticsFilters) {
  const match: Record<string, unknown> = {};
  if (filters.eventId) {
    match['source.eventMongoId'] = filters.eventId;
  }

  const createdAt: Record<string, string> = {};
  if (filters.from) createdAt.$gte = filters.from;
  if (filters.to) createdAt.$lte = filters.to;
  if (Object.keys(createdAt).length > 0) {
    match.createdAt = createdAt;
  }

  return match;
}

export async function collectTryOnAnalytics(
  db: Db,
  filters: TryOnAnalyticsFilters = {}
): Promise<TryOnAnalyticsResult> {
  const docs = await db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .find(buildMatch(filters))
    .sort({ 'tryOnModerationArchive.archivedAt': -1, createdAt: -1 })
    .limit(5000)
    .toArray();

  const jobIds = Array.from(new Set(
    docs
      .map((doc) => doc.sourceJobId)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  ));
  const garmentIds = Array.from(new Set(
    docs
      .map((doc) => doc.tryOnLeatherSuitId)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  ));

  const [jobs, allMatchingJobs, garments] = await Promise.all([
    jobIds.length
      ? db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).find({ jobId: { $in: jobIds } }).toArray()
      : Promise.resolve([]),
    db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).find(buildJobMatch(filters)).limit(5000).toArray(),
    garmentIds.length
      ? db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).find({ leatherSuitId: { $in: garmentIds } }).toArray()
      : Promise.resolve([]),
  ]);

  const jobMap = new Map(jobs.map((job) => [job.jobId, job]));
  const garmentNameMap = new Map(garments.map((garment) => [garment.leatherSuitId, garment.name]));
  const byPreset = new Map<string, TryOnAnalyticsRow>();
  const byGarment = new Map<string, TryOnAnalyticsRow>();
  const byEvent = new Map<string, TryOnAnalyticsRow>();
  const hourlyOutcomes = new Map<string, TryOnHourlyOutcomeRow>();
  const totals = { approved: 0, rejected: 0, service: 0, greatest: 0, supersededRerun: 0, total: 0 };

  for (const doc of docs) {
    if (isSupersededArchive(doc)) {
      totals.supersededRerun += 1;
      totals.total += 1;
      continue;
    }

    const bucket = doc.tryOnModerationArchive?.bucket;
    if (bucket !== 'approved' && bucket !== 'rejected' && bucket !== 'service') continue;

    const great = bucket === 'approved' && isGreat(doc.metadata);
    increment(totals, bucket, great);
    const decisionHour = toHourKey(doc.tryOnModerationArchive?.archivedAt ?? doc.reviewedAt ?? doc.createdAt);
    if (decisionHour) {
      const hourlyRow = getOrCreateHourlyOutcome(hourlyOutcomes, decisionHour);
      hourlyRow[bucket] += 1;
      hourlyRow.total += 1;
    }

    const job = doc.sourceJobId ? jobMap.get(doc.sourceJobId) : null;
    const setupId = job?.processing?.resolvedSetup?.setupId ?? job?.request?.setupId ?? 'unknown_preset';
    const setupLabel = job?.processing?.resolvedSetup?.setupName ?? setupId;
    increment(getOrCreate(byPreset, setupId, setupLabel), bucket, great);

    const garmentId = doc.tryOnLeatherSuitId ?? 'unknown_garment';
    const garmentLabel = garmentNameMap.get(garmentId) ?? garmentId;
    increment(getOrCreate(byGarment, garmentId, garmentLabel), bucket, great);

    const eventKey = doc.eventId ?? doc.eventName ?? 'unknown_event';
    const eventLabel = doc.eventName ?? eventKey;
    increment(getOrCreate(byEvent, eventKey, eventLabel), bucket, great);
  }

  const presetPerformanceMap = new Map<string, TryOnPresetPerformanceRow>();
  for (const job of allMatchingJobs) {
    const setupId = job.processing?.resolvedSetup?.setupId ?? job.request?.setupId ?? 'unknown_preset';
    const setupName = job.processing?.resolvedSetup?.setupName ?? setupId;
    const row = presetPerformanceMap.get(setupId) ?? {
      setupId,
      setupName,
      jobs: 0,
      done: 0,
      failed: 0,
      retryWait: 0,
      providerTimeouts: 0,
      approved: 0,
      rejected: 0,
      service: 0,
      great: 0,
      approvalRate: 0,
    };
    row.jobs += 1;
    if (job.status === 'done') row.done += 1;
    if (job.status === 'failed') {
      row.failed += 1;
      const failedHour = toHourKey(job.updatedAt ?? job.createdAt);
      if (failedHour) {
        const hourlyRow = getOrCreateHourlyOutcome(hourlyOutcomes, failedHour);
        hourlyRow.failed += 1;
        hourlyRow.total += 1;
      }
    }
    if (job.status === 'retry_wait') row.retryWait += 1;
    if (job.error?.code === 'provider_timeout') row.providerTimeouts += 1;
    presetPerformanceMap.set(setupId, row);
  }

  for (const outcome of byPreset.values()) {
    const row = presetPerformanceMap.get(outcome.key) ?? {
      setupId: outcome.key,
      setupName: outcome.label,
      jobs: 0,
      done: 0,
      failed: 0,
      retryWait: 0,
      providerTimeouts: 0,
      approved: 0,
      rejected: 0,
      service: 0,
      great: 0,
      approvalRate: 0,
    };
    row.approved = outcome.approved;
    row.rejected = outcome.rejected;
    row.service = outcome.service;
    row.great = outcome.greatest;
    const decided = row.approved + row.rejected + row.service;
    row.approvalRate = decided > 0 ? Math.round((row.approved / decided) * 1000) / 10 : 0;
    presetPerformanceMap.set(outcome.key, row);
  }

  const funnel = await collectTryOnFunnelMetrics(db, filters);

  return {
    totals,
    funnel,
    byPreset: sortRows(Array.from(byPreset.values())),
    byGarment: sortRows(Array.from(byGarment.values())),
    byEvent: sortRows(Array.from(byEvent.values())),
    presetPerformance: Array.from(presetPerformanceMap.values()).sort((a, b) => b.jobs - a.jobs || a.setupName.localeCompare(b.setupName)),
    hourlyOutcomes: Array.from(hourlyOutcomes.values()).sort((a, b) => a.hour.localeCompare(b.hour)),
    scannedResultCount: docs.length,
  };
}

export interface MultiEventUserRow {
  email: string;
  eventsCount: number;
  events: string[];
  submissionCount: number;
}

export interface CrossEventAnalyticsResult {
  totalUniqueEmails: number;
  totalUniqueCustomerEmails: number;
  oneEventCount: number;
  twoEventsCount: number;
  threeOrMoreEventsCount: number;
  oneEventPercent: number;
  twoEventsPercent: number;
  threeOrMoreEventsPercent: number;
  multiEventUsers: MultiEventUserRow[];
}

export async function collectCrossEventUserAnalytics(
  db: Db
): Promise<CrossEventAnalyticsResult> {
  const events = await db.collection(COLLECTIONS.EVENTS).find({}, { projection: { eventId: 1, name: 1 } }).toArray();
  const eventIdToNameMap = new Map<string, string>();
  for (const e of events) {
    if (e.eventId) {
      eventIdToNameMap.set(e.eventId, e.name);
    }
  }

  const aggregationResult = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).aggregate([
    { $match: { isArchived: { $ne: true } } },
    {
      $project: {
        email: {
          $let: {
            vars: {
              rawEmail: {
                $ifNull: [
                  "$userEmail",
                  "$userInfo.email",
                  "$metadata.emailRecipient",
                  ""
                ]
              }
            },
            in: {
              $cond: [
                { $eq: [ { $type: "$$rawEmail" }, "string" ] },
                { $trim: { input: { $toLower: "$$rawEmail" } } },
                ""
              ]
            }
          }
        },
        eventIds: {
          $setUnion: [
            { $cond: [ { $ifNull: ["$eventId", false] }, ["$eventId"], [] ] },
            { $cond: [ { $isArray: "$eventIds" }, "$eventIds", [] ] }
          ]
        }
      }
    },
    {
      $facet: {
        allUniqueEmails: [
          { $match: { email: { $ne: "" } } },
          { $group: { _id: "$email" } },
          { $count: "count" }
        ],
        cleanCustomers: [
          {
            $match: {
              email: {
                $nin: ["", null, "anonymous@event", "m@m.m", "moldovancsaba@gmail.com"],
                $not: /@seyuselfies\.com$|\.seyuselfies\.com$/
              },
              "eventIds.0": { $exists: true }
            }
          },
          {
            $group: {
              _id: "$email",
              eventIds: { $push: "$eventIds" },
              submissionCount: { $sum: 1 }
            }
          },
          {
            $project: {
              email: "$_id",
              submissionCount: 1,
              events: {
                $reduce: {
                  input: "$eventIds",
                  initialValue: [],
                  in: { $setUnion: ["$$value", "$$this"] }
                }
              }
            }
          }
        ]
      }
    }
  ]).next() as unknown as {
    allUniqueEmails: Array<{ count: number }>;
    cleanCustomers: Array<{
      email: string;
      submissionCount: number;
      events: string[];
    }>;
  } | null;

  const allUniqueEmailsCount = aggregationResult?.allUniqueEmails?.[0]?.count || 0;
  const cleanCustomers = aggregationResult?.cleanCustomers || [];

  let oneEventCount = 0;
  let twoEventsCount = 0;
  let threeOrMoreEventsCount = 0;
  const multiEventUsers: MultiEventUserRow[] = [];

  for (const customer of cleanCustomers) {
    const eventsCount = customer.events.length;
    if (eventsCount === 1) {
      oneEventCount++;
    } else if (eventsCount === 2) {
      twoEventsCount++;
    } else if (eventsCount >= 3) {
      threeOrMoreEventsCount++;
    }

    if (eventsCount > 1) {
      const eventNames = customer.events.map(id => eventIdToNameMap.get(id) || id);
      multiEventUsers.push({
        email: customer.email,
        eventsCount,
        events: eventNames,
        submissionCount: customer.submissionCount
      });
    }
  }

  // Sort multiEventUsers by eventsCount (descending), then submissionCount (descending)
  multiEventUsers.sort((a, b) => b.eventsCount - a.eventsCount || b.submissionCount - a.submissionCount);

  const totalUsers = cleanCustomers.length;
  const oneEventPercent = totalUsers > 0 ? Math.round((oneEventCount / totalUsers) * 100) : 0;
  const twoEventsPercent = totalUsers > 0 ? Math.round((twoEventsCount / totalUsers) * 100) : 0;
  const threeOrMoreEventsPercent = totalUsers > 0 ? Math.round((threeOrMoreEventsCount / totalUsers) * 100) : 0;

  return {
    totalUniqueEmails: allUniqueEmailsCount,
    totalUniqueCustomerEmails: totalUsers,
    oneEventCount,
    twoEventsCount,
    threeOrMoreEventsCount,
    oneEventPercent,
    twoEventsPercent,
    threeOrMoreEventsPercent,
    multiEventUsers,
  };
}

export interface EventSpecificStats {
  totalSubmissions: number;
  tryOnCount: number;
  originalCount: number;
  uniqueEmailsCount: number;
  cleanCustomerEmailsCount: number;
}

export async function collectEventSpecificStats(
  db: Db,
  eventId: string
): Promise<EventSpecificStats> {
  const aggregationResult = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).aggregate([
    {
      $match: {
        $and: [
          { $or: [{ eventId }, { eventIds: { $in: [eventId] } }] },
          { isArchived: { $ne: true } }
        ]
      }
    },
    {
      $project: {
        submissionKind: 1,
        email: {
          $let: {
            vars: {
              rawEmail: {
                $ifNull: [
                  "$userEmail",
                  "$userInfo.email",
                  "$metadata.emailRecipient",
                  ""
                ]
              }
            },
            in: {
              $cond: [
                { $eq: [ { $type: "$$rawEmail" }, "string" ] },
                { $trim: { input: { $toLower: "$$rawEmail" } } },
                ""
              ]
            }
          }
        }
      }
    },
    {
      $facet: {
        counts: [
          {
            $group: {
              _id: null,
              totalSubmissions: { $sum: 1 },
              tryOnCount: {
                $sum: {
                  $cond: [ { $eq: ["$submissionKind", "tryon_result"] }, 1, 0 ]
                }
              },
              originalCount: {
                $sum: {
                  $cond: [ { $ne: ["$submissionKind", "tryon_result"] }, 1, 0 ]
                }
              }
            }
          }
        ],
        uniqueEmails: [
          { $match: { email: { $ne: "" } } },
          { $group: { _id: "$email" } },
          { $count: "count" }
        ],
        cleanCustomerEmails: [
          {
            $match: {
              email: {
                $nin: ["", null, "anonymous@event", "m@m.m", "moldovancsaba@gmail.com"],
                $not: /@seyuselfies\.com$|\.seyuselfies\.com$/
              }
            }
          },
          { $group: { _id: "$email" } },
          { $count: "count" }
        ]
      }
    }
  ]).next() as unknown as {
    counts: Array<{
      totalSubmissions: number;
      tryOnCount: number;
      originalCount: number;
    }>;
    uniqueEmails: Array<{ count: number }>;
    cleanCustomerEmails: Array<{ count: number }>;
  } | null;

  const counts = aggregationResult?.counts?.[0] || { totalSubmissions: 0, tryOnCount: 0, originalCount: 0 };
  const uniqueEmailsCount = aggregationResult?.uniqueEmails?.[0]?.count || 0;
  const cleanCustomerEmailsCount = aggregationResult?.cleanCustomerEmails?.[0]?.count || 0;

  return {
    totalSubmissions: counts.totalSubmissions,
    tryOnCount: counts.tryOnCount,
    originalCount: counts.originalCount,
    uniqueEmailsCount,
    cleanCustomerEmailsCount,
  };
}
