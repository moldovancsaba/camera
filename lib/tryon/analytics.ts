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

export interface TryOnAnalyticsResult {
  totals: {
    approved: number;
    rejected: number;
    service: number;
    greatest: number;
    total: number;
  };
  byPreset: TryOnAnalyticsRow[];
  byGarment: TryOnAnalyticsRow[];
  byEvent: TryOnAnalyticsRow[];
  presetPerformance: TryOnPresetPerformanceRow[];
  scannedResultCount: number;
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
  const totals = { approved: 0, rejected: 0, service: 0, greatest: 0, total: 0 };

  for (const doc of docs) {
    const bucket = doc.tryOnModerationArchive?.bucket;
    if (bucket !== 'approved' && bucket !== 'rejected' && bucket !== 'service') continue;

    const great = bucket === 'approved' && isGreat(doc.metadata);
    increment(totals, bucket, great);

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
    const setupId = job.processing.resolvedSetup?.setupId ?? job.request.setupId ?? 'unknown_preset';
    const setupName = job.processing.resolvedSetup?.setupName ?? setupId;
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
    if (job.status === 'failed') row.failed += 1;
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

  return {
    totals,
    byPreset: sortRows(Array.from(byPreset.values())),
    byGarment: sortRows(Array.from(byGarment.values())),
    byEvent: sortRows(Array.from(byEvent.values())),
    presetPerformance: Array.from(presetPerformanceMap.values()).sort((a, b) => b.jobs - a.jobs || a.setupName.localeCompare(b.setupName)),
    scannedResultCount: docs.length,
  };
}
