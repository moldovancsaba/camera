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
  scannedResultCount: number;
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

  const [jobs, garments] = await Promise.all([
    jobIds.length
      ? db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).find({ jobId: { $in: jobIds } }).toArray()
      : Promise.resolve([]),
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

  return {
    totals,
    byPreset: sortRows(Array.from(byPreset.values())),
    byGarment: sortRows(Array.from(byGarment.values())),
    byEvent: sortRows(Array.from(byEvent.values())),
    scannedResultCount: docs.length,
  };
}
