import type { Db, Document, ObjectId } from 'mongodb';
import { connectToDatabaseByName } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { CONSENT_ELIGIBLE_FILTER, CONSENT_PENDING_FILTER, CONSENT_UNKNOWN_FILTER } from '@/lib/events/consent-eligibility';

const PIPELINE_DATABASE = process.env.CAMERA_PIPELINE_DATABASE?.trim() || 'fanmass_camera_pipeline';
const QUEUE_COLLECTION = 'fanmass_camera_analysis_queue';
const RESULT_COLLECTION = 'fanmass_camera_analysis_results';
const DELIVERY_COLLECTION = 'fanmass_camera_analysis_delivery';
const MAX_PAGE_SIZE = 100;

export type FanmassQueueStatus = 'awaiting' | 'queued' | 'leased' | 'processing' | 'retry' | 'completed' | 'result_missing' | 'failed' | 'cancelled';

export interface FanmassBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FanmassPersonBox {
  id: string;
  box: FanmassBox;
  gender: string;
  estimatedAge: number | null;
  emotion: string;
  subjectType: string;
  confidence: number | null;
  smiling: boolean;
  hasCap: boolean;
  hasGlasses: boolean;
}

export interface FanmassFaceBox {
  id: string;
  box: FanmassBox;
  confidence: number | null;
  smiling: boolean;
}

export interface FanmassPhotoResultView {
  analyzedAt: string | null;
  analysisStage: string;
  sourceRevision: string;
  analysisGeneration: number;
  summary: {
    personCount: number;
    realPersonCount: number;
    displayPersonCount: number;
    crowdEstimate: number;
    sceneType: string;
    demographics: Record<string, unknown> | null;
    moderation: Record<string, unknown> | null;
    sportsMerchandise: Record<string, unknown> | null;
    fashionBrands: Record<string, unknown> | null;
  };
  /** Allowlisted, identity-free per-photo analysis modules exactly as Fanmass persisted them. */
  analysis: Record<string, unknown>;
  boxes: { people: FanmassPersonBox[]; faces: FanmassFaceBox[] };
}

export interface FanmassEventPhoto {
  id: string;
  submissionId: string;
  photoUrl: string | null;
  createdAt: string | null;
  queueStatus: FanmassQueueStatus;
  queueUpdatedAt: string | null;
  errorCode: string | null;
  result: FanmassPhotoResultView | null;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
}

export type FanmassQueueCounts = Record<'queued' | 'leased' | 'processing' | 'retry' | 'completed' | 'failed' | 'cancelled', number>;

export interface FanmassEventAnalysisPage {
  totalCameraSubmissions: number;
  approvedPhotos: number;
  approvedWithConsent: number;
  rejectedPhotos: number;
  approvedAwaitingConsent: number;
  rejectedAwaitingConsent: number;
  approvedConsentUnknown: number;
  rejectedConsentUnknown: number;
  consentBlockedDecisions: number;
  consentPendingPhotos: number;
  consentUnknownPhotos: number;
  welcomeToCameraTransitions: number;
  eligiblePhotos: number;
  awaitingDiscovery: number;
  queueCounts: FanmassQueueCounts;
  completedResults: number;
  missingResults: number;
  peopleEstimates: number;
  peopleBoxes: number;
  deliveries: Record<string, number>;
  items: FanmassEventPhoto[];
  page: number;
  pageSize: number;
  pages: number;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const finiteNumber = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const jsonRecord = (value: unknown): Record<string, unknown> | null => {
  const data = record(value);
  if (!data) return null;
  try {
    return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  } catch {
    return null;
  }
};
const iso = (value: unknown): string | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return text(value);
};

function eventPhotoFilter(eventId: string): Document {
  return { $or: [{ eventId }, { eventIds: eventId }] };
}

function fanmassEventFilter(eventId: string): Document {
  return {
    $or: [
      { eventId },
      { eventIds: eventId },
      { cameraEventId: eventId },
      { cameraEventIds: eventId },
      { 'eventTargets.eventId': eventId },
      { 'eventTargets.cameraEventId': eventId },
    ],
  };
}

/** Mirror Fanmass's current eligibility gates for the admin's display-only queue. */
function fanmassEligiblePhotoFilter(eventId: string, event: Document): Document {
  const partnerId = text(event.partnerId);
  const vettingRequired = (event.photoVetting as Document | undefined)?.required === true;
  return {
    $and: [
      eventPhotoFilter(eventId),
      { isArchived: { $ne: true } },
      { analyticsDeletion: { $nin: ['manual', 'automatic_no_login', 'automatic_other'] } },
      { retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
      { 'mediaHealth.broken': { $ne: true } },
      { submissionKind: { $ne: 'tryon_result' } },
      { method: { $in: [null, 'camera_capture'] } },
      { hiddenFromEvents: { $nin: [eventId] } },
      CONSENT_ELIGIBLE_FILTER,
      vettingRequired ? { reviewStatus: 'approved' } : { reviewStatus: { $in: [null, '', 'approved'] } },
      partnerId
        ? { $or: [{ partnerId }, { partnerId: { $exists: false } }, { partnerId: null }, { partnerId: '' }] }
        : { partnerId: { $exists: true, $nin: [null, ''] } },
      {
        $or: [
          { originalImageUrl: { $type: 'string', $ne: '' } },
          { imageUrl: { $type: 'string', $ne: '' } },
          { finalImageUrl: { $type: 'string', $ne: '' } },
        ],
      },
    ],
  };
}

function normalizeBox(value: unknown): FanmassBox | null {
  const data = record(value);
  if (!data) return null;
  const { x, y, w, h } = data;
  if ([x, y, w, h].some((part) => typeof part !== 'number' || !Number.isFinite(part))) return null;
  const box = { x: x as number, y: y as number, w: w as number, h: h as number };
  return box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0 && box.x + box.w <= 1.01 && box.y + box.h <= 1.01 ? box : null;
}

function safePersonBoxes(value: unknown): FanmassPersonBox[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const row = record(entry);
    const box = normalizeBox(row?.box);
    if (!row || !box) return [];
    const age = row.estimatedAge;
    const confidence = row.confidence;
    return [{
      id: text(row.id) ?? `person-${index + 1}`,
      box,
      gender: text(row.gender) ?? 'unknown',
      estimatedAge: typeof age === 'number' && Number.isFinite(age) ? age : null,
      emotion: text(row.emotion) ?? 'unknown',
      subjectType: text(row.subjectType) ?? 'unknown',
      confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null,
      smiling: row.smiling === true,
      hasCap: row.hasCap === true,
      hasGlasses: row.hasGlasses === true,
    }];
  });
}

function safeFaceBoxes(value: unknown): FanmassFaceBox[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const row = record(entry);
    const box = normalizeBox(row?.box);
    if (!row || !box) return [];
    const confidence = row.confidence;
    return [{
      id: text(row.id) ?? `face-${index + 1}`,
      box,
      confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null,
      smiling: row.smiling === true,
    }];
  });
}

function resultView(doc: Document | undefined, queue: Document): FanmassPhotoResultView | null {
  if (!doc || doc.status !== 'completed') return null;
  if (doc.sourceRevision !== queue.sourceRevision || Number(doc.leaseGeneration ?? 0) !== Number(queue.leaseGeneration ?? 0)) return null;
  const summary = record(doc.summary) ?? {};
  const boxes = record(doc.boxes) ?? {};
  return {
    analyzedAt: iso(doc.analyzedAt),
    analysisStage: text(doc.analysisStage) ?? 'unknown',
    sourceRevision: text(doc.sourceRevision) ?? '',
    analysisGeneration: finiteNumber(doc.leaseGeneration),
    summary: {
      personCount: finiteNumber(summary.personCount),
      realPersonCount: finiteNumber(summary.realPersonCount),
      displayPersonCount: finiteNumber(summary.displayPersonCount),
      crowdEstimate: finiteNumber(summary.crowdEstimate),
      sceneType: text(summary.sceneType) ?? 'unknown',
      demographics: jsonRecord(summary.demographics),
      moderation: jsonRecord(summary.moderation),
      sportsMerchandise: jsonRecord(summary.sportsMerchandise),
      fashionBrands: jsonRecord(summary.fashionBrands),
    },
    analysis: jsonRecord(doc.analysis) ?? jsonRecord(record(doc.photoResult)?.analysis) ?? {},
    boxes: { people: safePersonBoxes(boxes.people), faces: safeFaceBoxes(boxes.faces) },
  };
}

function publicImageUrl(submission: Document): string | null {
  const reviewPhoto = record(submission.photoReview)?.photoUrl;
  const copies = Array.isArray(submission.imageCopies) ? submission.imageCopies as Document[] : [];
  const unframed = copies.find((copy) => copy.role === 'unframed' && copy.state === 'verified')?.url;
  return text(submission.originalImageUrl) ?? text(reviewPhoto) ?? text(unframed) ?? text(submission.imageUrl) ?? text(submission.finalImageUrl);
}

function isConfirmed(review: unknown, result: FanmassPhotoResultView | null): boolean {
  const data = record(review);
  return Boolean(result && data?.sourceRevision === result.sourceRevision && Number(data.analysisGeneration ?? -1) === result.analysisGeneration);
}

function statusFor(queue: Document | undefined, result: FanmassPhotoResultView | null): FanmassQueueStatus {
  if (!queue) return 'awaiting';
  const status = text(queue.status);
  if (status === 'completed') return result ? 'completed' : 'result_missing';
  if (status === 'queued' || status === 'leased' || status === 'processing' || status === 'retry' || status === 'failed' || status === 'cancelled') return status;
  return 'awaiting';
}

function cleanQueueCountRows(rows: Document[]): FanmassQueueCounts {
  const counts: FanmassEventAnalysisPage['queueCounts'] = {
    queued: 0, leased: 0, processing: 0, retry: 0, completed: 0, failed: 0, cancelled: 0,
  };
  for (const row of rows) {
    const key = text(row._id);
    if (key && key in counts) counts[key as keyof typeof counts] = finiteNumber(row.count);
  }
  return counts;
}

function imageAndReviewFields(doc: Document, queue: Document | undefined, result: FanmassPhotoResultView | null): FanmassEventPhoto {
  const review = record(doc.fanmassAnalysisReview);
  const confirmed = isConfirmed(review, result);
  const queueStatus = statusFor(queue, result);
  return {
    id: String(doc._id),
    submissionId: text(doc.submissionId) ?? String(doc._id),
    photoUrl: publicImageUrl(doc),
    createdAt: iso(doc.createdAt),
    queueStatus,
    queueUpdatedAt: iso(queue?.updatedAt),
    errorCode: text(queue?.lastErrorCode),
    result,
    confirmed,
    confirmedAt: confirmed ? iso(review?.confirmedAt) : null,
    confirmedBy: confirmed ? text(review?.confirmedBy) : null,
  };
}

/** Read Fanmass's queue/result state for the event; Camera performs no Fanmass writes or scheduling. */
export async function loadFanmassEventAnalysisPage(
  cameraDb: Db,
  eventId: string,
  event: Document,
  options: { page?: number; pageSize?: number } = {},
): Promise<FanmassEventAnalysisPage> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(options.pageSize ?? 60)));
  const offset = (page - 1) * pageSize;
  const eventFilter = eventPhotoFilter(eventId);
  const eligibleFilter = fanmassEligiblePhotoFilter(eventId, event);
  const pipelineDb = await connectToDatabaseByName(PIPELINE_DATABASE);
  const queue = pipelineDb.collection(QUEUE_COLLECTION);
  const results = pipelineDb.collection(RESULT_COLLECTION);
  const deliveries = pipelineDb.collection(DELIVERY_COLLECTION);
  const submissions = cameraDb.collection(COLLECTIONS.SUBMISSIONS);

  const [totalCameraSubmissions, approvedPhotos, approvedWithConsent, rejectedPhotos, approvedAwaitingConsent, rejectedAwaitingConsent, approvedConsentUnknown, rejectedConsentUnknown, consentBlockedDecisions, consentPendingPhotos, consentUnknownPhotos, welcomeRows, eligiblePhotos, statusRows, deliveryRows, resultTotals, sourceDocs] = await Promise.all([
    submissions.countDocuments(eventFilter),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'approved' }] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'approved' }, CONSENT_ELIGIBLE_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'rejected' }] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'approved' }, CONSENT_PENDING_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'rejected' }, CONSENT_PENDING_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'approved' }, CONSENT_UNKNOWN_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'rejected' }, CONSENT_UNKNOWN_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: { $in: ['approved', 'rejected'] } }, { $or: [CONSENT_PENDING_FILTER, CONSENT_UNKNOWN_FILTER] }] }),
    submissions.countDocuments({ $and: [eventFilter, CONSENT_PENDING_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, CONSENT_UNKNOWN_FILTER] }),
    cameraDb.collection(COLLECTIONS.JOURNEY_DAILY).aggregate([
      { $match: { eventId, name: 'step.transition', key: 'welcome>camera' } },
      { $group: { _id: null, count: { $sum: '$count' } } },
    ]).toArray(),
    submissions.countDocuments(eligibleFilter),
    queue.aggregate([{ $match: fanmassEventFilter(eventId) }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
    deliveries.aggregate([{ $match: fanmassEventFilter(eventId) }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
    queue.aggregate([
      { $match: { $and: [fanmassEventFilter(eventId), { status: 'completed' }] } },
      {
        $lookup: {
          from: RESULT_COLLECTION,
          let: { queueKey: '$queueKey', sourceRevision: '$sourceRevision', generation: '$leaseGeneration' },
          pipeline: [{
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$queueKey', '$$queueKey'] },
                  { $eq: ['$sourceRevision', '$$sourceRevision'] },
                  { $eq: ['$leaseGeneration', '$$generation'] },
                  { $eq: ['$status', 'completed'] },
                ],
              },
            },
          }],
          as: 'currentResult',
        },
      },
      { $unwind: '$currentResult' },
      { $group: { _id: null, completedResults: { $sum: 1 }, peopleEstimates: { $sum: { $ifNull: ['$currentResult.summary.personCount', 0] } }, peopleBoxes: { $sum: { $size: { $ifNull: ['$currentResult.boxes.people', []] } } } } },
    ]).toArray(),
    submissions.find(eligibleFilter, {
      projection: {
        _id: 1, submissionId: 1, originalImageUrl: 1, imageUrl: 1, finalImageUrl: 1, photoReview: 1, imageCopies: 1,
        createdAt: 1, fanmassAnalysisReview: 1,
      },
      sort: { createdAt: -1, _id: -1 },
      skip: offset,
      limit: pageSize,
    }).toArray(),
  ]);

  const statusCounts = cleanQueueCountRows(statusRows);
  const deliveriesCount: Record<string, number> = {};
  for (const row of deliveryRows) {
    const key = text(row._id);
    if (key) deliveriesCount[key] = finiteNumber(row.count);
  }
  const resultTotal = resultTotals[0] ?? {};
  const welcomeToCameraTransitions = finiteNumber(welcomeRows[0]?.count);
  const completedResults = finiteNumber(resultTotal.completedResults);
  const queueCoverage = Object.entries(statusCounts)
    .filter(([status]) => status !== 'cancelled')
    .reduce((sum, [, count]) => sum + count, 0);
  const awaitingDiscovery = Math.max(0, eligiblePhotos - queueCoverage);

  const sourceIds = sourceDocs.map((doc) => doc._id as ObjectId);
  const queueDocs = sourceIds.length
    ? await queue.find({ $and: [{ sourceMongoId: { $in: sourceIds } }, fanmassEventFilter(eventId)] }).toArray()
    : [];
  const queueBySource = new Map(queueDocs.map((doc) => [String(doc.sourceMongoId), doc]));
  const currentResultLookups = [...new Map(queueDocs.flatMap((doc) => {
    const queueKey = text(doc.queueKey);
    const sourceRevision = text(doc.sourceRevision);
    if (!queueKey || !sourceRevision) return [];
    const leaseGeneration = finiteNumber(doc.leaseGeneration);
    return [[`${queueKey}\0${sourceRevision}\0${leaseGeneration}`, { queueKey, sourceRevision, leaseGeneration } as Document]];
  })).values()];
  const currentResultDocs = currentResultLookups.length
    ? await results.find({ $or: currentResultLookups.map((lookup) => ({ ...lookup, status: 'completed' })) }).toArray()
    : [];
  const resultIdentity = (doc: Document): string => `${text(doc.queueKey) ?? ''}\0${text(doc.sourceRevision) ?? ''}\0${finiteNumber(doc.leaseGeneration)}`;
  const resultByKey = new Map(currentResultDocs.map((doc) => [resultIdentity(doc), doc]));
  const items = sourceDocs.map((source) => {
    const queueDoc = queueBySource.get(String(source._id));
    const savedResult = queueDoc ? resultByKey.get(resultIdentity(queueDoc)) : undefined;
    const result = resultView(savedResult, queueDoc ?? {});
    return imageAndReviewFields(source, queueDoc, result);
  });

  return {
    totalCameraSubmissions,
    approvedPhotos,
    approvedWithConsent,
    rejectedPhotos,
    approvedAwaitingConsent,
    rejectedAwaitingConsent,
    approvedConsentUnknown,
    rejectedConsentUnknown,
    consentBlockedDecisions,
    consentPendingPhotos,
    consentUnknownPhotos,
    welcomeToCameraTransitions,
    eligiblePhotos,
    awaitingDiscovery,
    queueCounts: statusCounts,
    completedResults,
    missingResults: Math.max(0, statusCounts.completed - completedResults),
    peopleEstimates: finiteNumber(resultTotal.peopleEstimates),
    peopleBoxes: finiteNumber(resultTotal.peopleBoxes),
    deliveries: deliveriesCount,
    items,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(eligiblePhotos / pageSize)),
  };
}

/** Load the Fanmass result for one approved event photo, after rechecking source eligibility. */
export async function loadFanmassEventPhoto(
  cameraDb: Db,
  eventId: string,
  event: Document,
  submissionObjectId: ObjectId,
): Promise<FanmassEventPhoto | null> {
  const eligibleFilter = fanmassEligiblePhotoFilter(eventId, event);
  const source = await cameraDb.collection(COLLECTIONS.SUBMISSIONS).findOne(
    { $and: [eligibleFilter, { _id: submissionObjectId }] },
    { projection: { _id: 1, submissionId: 1, originalImageUrl: 1, imageUrl: 1, finalImageUrl: 1, photoReview: 1, imageCopies: 1, createdAt: 1, fanmassAnalysisReview: 1 } },
  );
  if (!source) return null;
  const pipelineDb = await connectToDatabaseByName(PIPELINE_DATABASE);
  const queue = await pipelineDb.collection(QUEUE_COLLECTION).findOne({
    $and: [{ sourceMongoId: source._id }, fanmassEventFilter(eventId)],
  });
  if (!queue) return imageAndReviewFields(source, undefined, null);
  const resultDoc = queue.status === 'completed'
    ? await pipelineDb.collection(RESULT_COLLECTION).findOne({ queueKey: queue.queueKey, sourceRevision: queue.sourceRevision, leaseGeneration: queue.leaseGeneration, status: 'completed' })
    : null;
  const result = resultView(resultDoc ?? undefined, queue);
  return imageAndReviewFields(source, queue, result);
}

/** Return adjacent eligible photo IDs in the same newest-first order as the result list. */
export async function loadFanmassEventPhotoNeighbors(
  cameraDb: Db,
  eventId: string,
  event: Document,
  submissionObjectId: ObjectId,
): Promise<{ previousId: string | null; nextId: string | null } | null> {
  const eligibleFilter = fanmassEligiblePhotoFilter(eventId, event);
  const submissions = cameraDb.collection(COLLECTIONS.SUBMISSIONS);
  const selected = await submissions.findOne(
    { $and: [eligibleFilter, { _id: submissionObjectId }] },
    { projection: { createdAt: 1 } },
  );
  if (!selected) return null;
  const previousFilter = selected.createdAt
    ? { $or: [{ createdAt: { $gt: selected.createdAt } }, { createdAt: selected.createdAt, _id: { $gt: submissionObjectId } }] }
    : { _id: { $gt: submissionObjectId } };
  const nextFilter = selected.createdAt
    ? { $or: [{ createdAt: { $lt: selected.createdAt } }, { createdAt: selected.createdAt, _id: { $lt: submissionObjectId } }] }
    : { _id: { $lt: submissionObjectId } };
  const projection = { projection: { _id: 1 }, sort: { createdAt: -1, _id: -1 } as const };
  const [previous, next] = await Promise.all([
    submissions.findOne({ $and: [eligibleFilter, previousFilter] }, projection),
    submissions.findOne({ $and: [eligibleFilter, nextFilter] }, projection),
  ]);
  return { previousId: previous ? String(previous._id) : null, nextId: next ? String(next._id) : null };
}

/** Confirm the current Fanmass result in Camera's event-local audit field. */
export async function confirmFanmassEventPhoto(
  cameraDb: Db,
  eventId: string,
  event: Document,
  submissionObjectId: ObjectId,
  confirmedBy: string,
  confirmedAt: string,
): Promise<{ item: FanmassEventPhoto | null; result: FanmassPhotoResultView | null }> {
  const item = await loadFanmassEventPhoto(cameraDb, eventId, event, submissionObjectId);
  if (!item?.result || item.queueStatus !== 'completed') return { item, result: item?.result ?? null };
  const saved = await cameraDb.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    {
      _id: submissionObjectId,
      $and: [fanmassEligiblePhotoFilter(eventId, event)],
    },
    {
      $set: {
        fanmassAnalysisReview: {
          status: 'confirmed',
          confirmedAt,
          confirmedBy,
          sourceRevision: item.result.sourceRevision,
          analysisGeneration: item.result.analysisGeneration,
        },
      },
    },
  );
  if (saved.matchedCount !== 1) return { item: null, result: item.result };
  return { item: await loadFanmassEventPhoto(cameraDb, eventId, event, submissionObjectId), result: item.result };
}
