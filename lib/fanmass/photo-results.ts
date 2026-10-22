import type { Db, Document, ObjectId } from 'mongodb';
import { connectToDatabaseByName } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { CONSENT_ELIGIBLE_FILTER, CONSENT_EXPIRED_FILTER, CONSENT_PENDING_FILTER, CONSENT_UNKNOWN_FILTER } from '@/lib/events/consent-eligibility';

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

export interface FanmassBrandRegionBox {
  id: string;
  box: FanmassBox;
  brandType: string;
  shortName: string;
  visibleText: string;
  itemType: string;
  confidence: number | null;
  detail: string;
  source: string;
}

export interface FanmassEditableResult {
  summary: FanmassPhotoResultView['summary'];
  analysis: Record<string, unknown>;
  boxes: { people: FanmassPersonBox[]; faces: FanmassFaceBox[]; brandRegions: FanmassBrandRegionBox[] };
}

export interface FanmassHumanCorrection extends FanmassEditableResult {
  correctedAt: string;
  correctedBy: string;
  sourceRevision: string;
  analysisGeneration: number;
}

export interface FanmassPhotoResultView {
  analyzedAt: string | null;
  analysisStage: string;
  sourceRevision: string;
  analysisGeneration: number;
  summary: {
    /** Fanmass image-level model estimate; it can differ from returned boxes. */
    personCount: number;
    realPersonCount: number;
    displayPersonCount: number;
    crowdEstimate: number;
    sceneType: string;
    demographics: Record<string, unknown> | null;
    moderation: Record<string, unknown> | null;
    sportsMerchandise: Record<string, unknown> | null;
    fashionBrands: Record<string, unknown> | null;
    [key: string]: unknown;
  };
  /** Allowlisted, identity-free per-photo analysis modules exactly as Fanmass persisted them. */
  analysis: Record<string, unknown>;
  boxes: { people: FanmassPersonBox[]; faces: FanmassFaceBox[]; brandRegions: FanmassBrandRegionBox[] };
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
  correction: FanmassHumanCorrection | null;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
}

export type FanmassQueueCounts = Record<'queued' | 'leased' | 'processing' | 'retry' | 'completed' | 'failed' | 'cancelled', number>;

export interface FanmassEventAnalysisPage {
  totalCameraSubmissions: number;
  deletedManually: number;
  deletedAutomaticallyNoLogin: number;
  deletedAutomaticallyOther: number;
  approvedPhotos: number;
  approvedWithConsent: number;
  approvedConsentExpired: number;
  rejectedPhotos: number;
  rejectedWithConsent: number;
  approvedAwaitingConsent: number;
  rejectedAwaitingConsent: number;
  rejectedConsentExpired: number;
  approvedConsentUnknown: number;
  rejectedConsentUnknown: number;
  consentBlockedDecisions: number;
  consentPendingPhotos: number;
  consentExpiredPhotos: number;
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
          { 'photoReview.photoUrl': { $type: 'string', $ne: '' } },
          { imageCopies: { $elemMatch: { role: 'unframed', state: 'verified', url: { $type: 'string', $ne: '' } } } },
          { originalImageUrl: { $type: 'string', $ne: '' }, reframe: { $type: 'object' } },
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
      ...jsonRecord(row),
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
      ...jsonRecord(row),
      id: text(row.id) ?? `face-${index + 1}`,
      box,
      confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null,
      smiling: row.smiling === true,
    }];
  });
}

function safeBrandRegionBoxes(value: unknown): FanmassBrandRegionBox[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const row = record(entry);
    const box = normalizeBox(row?.box);
    if (!row || !box) return [];
    const confidence = row.confidence;
    return [{
      ...jsonRecord(row),
      id: text(row.id) ?? 'brand-' + (index + 1),
      box,
      brandType: text(row.brandType) ?? 'unknown',
      shortName: text(row.shortName) ?? 'Unknown',
      visibleText: text(row.visibleText) ?? '',
      itemType: text(row.itemType) ?? 'other',
      confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null,
      detail: text(row.detail) ?? '',
      source: text(row.source) ?? '',
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
      ...(jsonRecord(summary) ?? {}),
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
    boxes: {
      people: safePersonBoxes(boxes.people),
      faces: safeFaceBoxes(boxes.faces),
      brandRegions: safeBrandRegionBoxes(boxes.brandRegions),
    },
  };
}

function correctionView(review: Document | null, result: FanmassPhotoResultView | null): FanmassHumanCorrection | null {
  const saved = record(review?.correction);
  if (!result || !saved || saved.sourceRevision !== result.sourceRevision || Number(saved.analysisGeneration) !== result.analysisGeneration) return null;
  const summary = jsonRecord(saved.summary);
  const analysis = jsonRecord(saved.analysis);
  const boxes = record(saved.boxes);
  if (!summary || !analysis || !boxes) return null;
  return {
    summary: {
      ...summary,
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
    analysis,
    boxes: {
      people: safePersonBoxes(boxes.people),
      faces: safeFaceBoxes(boxes.faces),
      brandRegions: safeBrandRegionBoxes(boxes.brandRegions),
    },
    correctedAt: iso(saved.correctedAt) ?? '',
    correctedBy: text(saved.correctedBy) ?? 'event reviewer',
    sourceRevision: result.sourceRevision,
    analysisGeneration: result.analysisGeneration,
  };
}

export function fanmassAnalysisImageUrl(submission: Document): string | null {
  const reviewPhoto = record(submission.photoReview)?.photoUrl;
  const copies = Array.isArray(submission.imageCopies) ? submission.imageCopies as Document[] : [];
  const unframed = copies.find((copy) => copy.role === 'unframed' && copy.state === 'verified' && typeof copy.url === 'string')?.url;
  if (text(reviewPhoto)) return text(reviewPhoto);
  if (text(unframed)) return text(unframed);
  // Legacy originalImageUrl values can contain the framed composite. Camera's
  // reframe record proves that the URL is a separate, unframed camera original.
  return record(submission.reframe) ? text(submission.originalImageUrl) : null;
}

function isConfirmed(review: unknown, result: FanmassPhotoResultView | null): boolean {
  const data = record(review);
  return Boolean(result && data?.status === 'confirmed' && data.sourceRevision === result.sourceRevision && Number(data.analysisGeneration ?? -1) === result.analysisGeneration);
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
  const correction = correctionView(review, result);
  const queueStatus = statusFor(queue, result);
  return {
    id: String(doc._id),
    submissionId: text(doc.submissionId) ?? String(doc._id),
    photoUrl: fanmassAnalysisImageUrl(doc),
    createdAt: iso(doc.createdAt),
    queueStatus,
    queueUpdatedAt: iso(queue?.updatedAt),
    errorCode: text(queue?.lastErrorCode),
    result,
    correction,
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

  const [totalCameraSubmissions, deletedManually, deletedAutomaticallyNoLogin, deletedAutomaticallyOther, approvedPhotos, approvedWithConsent, approvedConsentExpired, rejectedPhotos, rejectedWithConsent, approvedAwaitingConsent, rejectedAwaitingConsent, rejectedConsentExpired, approvedConsentUnknown, rejectedConsentUnknown, consentBlockedDecisions, consentPendingPhotos, consentExpiredPhotos, consentUnknownPhotos, welcomeRows, eligiblePhotos, eligibleSourceDocs, sourceDocs] = await Promise.all([
    submissions.countDocuments(eventFilter),
    submissions.countDocuments({ $and: [eventFilter, { analyticsDeletion: 'manual' }] }),
    submissions.countDocuments({ $and: [eventFilter, { analyticsDeletion: 'automatic_no_login' }] }),
    submissions.countDocuments({ $and: [eventFilter, { analyticsDeletion: 'automatic_other' }] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'approved' }] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'approved' }, CONSENT_ELIGIBLE_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'approved' }, CONSENT_EXPIRED_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'rejected' }] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'rejected' }, CONSENT_ELIGIBLE_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'approved' }, CONSENT_PENDING_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'rejected' }, CONSENT_PENDING_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'rejected' }, CONSENT_EXPIRED_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'approved' }, CONSENT_UNKNOWN_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: 'rejected' }, CONSENT_UNKNOWN_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, { reviewStatus: { $in: ['approved', 'rejected'] } }, { $or: [CONSENT_PENDING_FILTER, CONSENT_EXPIRED_FILTER, CONSENT_UNKNOWN_FILTER] }] }),
    submissions.countDocuments({ $and: [eventFilter, CONSENT_PENDING_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, CONSENT_EXPIRED_FILTER] }),
    submissions.countDocuments({ $and: [eventFilter, CONSENT_UNKNOWN_FILTER] }),
    cameraDb.collection(COLLECTIONS.JOURNEY_DAILY).aggregate([
      { $match: { eventId, name: 'step.transition', key: 'welcome>camera' } },
      { $group: { _id: null, count: { $sum: '$count' } } },
    ]).toArray(),
    submissions.countDocuments(eligibleFilter),
    submissions.find(eligibleFilter, { projection: { _id: 1 } }).toArray(),
    submissions.find(eligibleFilter, {
      projection: {
        _id: 1, submissionId: 1, originalImageUrl: 1, photoReview: 1, imageCopies: 1, reframe: 1,
        createdAt: 1, fanmassAnalysisReview: 1,
      },
      sort: { createdAt: -1, _id: -1 },
      skip: offset,
      limit: pageSize,
    }).toArray(),
  ]);

  // Progress counts must share the exact consent/vetting eligibility boundary
  // used for the photo list, otherwise erased or unapproved work looks live.
  const eligibleSourceIds = eligibleSourceDocs.map((doc) => doc._id);
  const eligibleQueueMatch: Document = {
    $and: [fanmassEventFilter(eventId), { sourceMongoId: { $in: eligibleSourceIds } }],
  };
  const [statusRows, deliveryRows, resultTotals] = await Promise.all([
    queue.aggregate([{ $match: eligibleQueueMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
    deliveries.aggregate([{ $match: { $and: [fanmassEventFilter(eventId), { cameraPhotoId: { $in: eligibleSourceIds.map(String) } }] } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
    queue.aggregate([
      { $match: { $and: [eligibleQueueMatch, { status: 'completed' }] } },
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
  const queueCoverage = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
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
    deletedManually,
    deletedAutomaticallyNoLogin,
    deletedAutomaticallyOther,
    approvedPhotos,
    approvedWithConsent,
    approvedConsentExpired,
    rejectedPhotos,
    rejectedWithConsent,
    approvedAwaitingConsent,
    rejectedAwaitingConsent,
    rejectedConsentExpired,
    approvedConsentUnknown,
    rejectedConsentUnknown,
    consentBlockedDecisions,
    consentPendingPhotos,
    consentExpiredPhotos,
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
    { projection: { _id: 1, submissionId: 1, originalImageUrl: 1, photoReview: 1, imageCopies: 1, reframe: 1, createdAt: 1, fanmassAnalysisReview: 1 } },
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
          updatedAt: confirmedAt,
          confirmedBy,
          sourceRevision: item.result.sourceRevision,
          analysisGeneration: item.result.analysisGeneration,
          ...(item.correction ? { correction: item.correction } : {}),
        },
      },
    },
  );
  if (saved.matchedCount !== 1) return { item: null, result: item.result };
  return { item: await loadFanmassEventPhoto(cameraDb, eventId, event, submissionObjectId), result: item.result };
}

function editableResult(value: unknown): FanmassEditableResult | null {
  const row = record(value);
  const summary = jsonRecord(row?.summary);
  const analysis = jsonRecord(row?.analysis);
  const boxes = record(row?.boxes);
  if (!summary || !analysis || !boxes || !Array.isArray(boxes.people) || !Array.isArray(boxes.faces) || (boxes.brandRegions !== undefined && !Array.isArray(boxes.brandRegions))) return null;
  const serialized = JSON.stringify({ summary, analysis, boxes });
  if (serialized.length > 250_000 || boxes.people.length > 300 || boxes.faces.length > 300) return null;
  const people = safePersonBoxes(boxes.people);
  const faces = safeFaceBoxes(boxes.faces);
  const brandRegions = safeBrandRegionBoxes(boxes.brandRegions ?? []);
  if (people.length !== boxes.people.length || faces.length !== boxes.faces.length || brandRegions.length !== (boxes.brandRegions ?? []).length) return null;
  const countFields = ['personCount', 'realPersonCount', 'displayPersonCount', 'crowdEstimate'];
  for (const key of countFields) {
    if (typeof summary[key] !== 'number' || !Number.isFinite(summary[key]) || (summary[key] as number) < 0) return null;
  }
  if (typeof summary.sceneType !== 'string' || !summary.sceneType.trim()) return null;
  return {
    summary: {
      ...summary,
      personCount: summary.personCount as number,
      realPersonCount: summary.realPersonCount as number,
      displayPersonCount: summary.displayPersonCount as number,
      crowdEstimate: summary.crowdEstimate as number,
      sceneType: summary.sceneType,
      demographics: jsonRecord(summary.demographics),
      moderation: jsonRecord(summary.moderation),
      sportsMerchandise: jsonRecord(summary.sportsMerchandise),
      fashionBrands: jsonRecord(summary.fashionBrands),
    },
    analysis,
    boxes: { people, faces, brandRegions },
  };
}

/** Save a human correction in Camera, tied to the exact immutable Fanmass result revision. */
export async function saveFanmassEventPhotoCorrection(
  cameraDb: Db,
  eventId: string,
  event: Document,
  submissionObjectId: ObjectId,
  correctedBy: string,
  correctedAt: string,
  expected: { sourceRevision: string; analysisGeneration: number; result: unknown },
): Promise<{ item: FanmassEventPhoto | null; error?: 'stale' | 'invalid' }> {
  const item = await loadFanmassEventPhoto(cameraDb, eventId, event, submissionObjectId);
  if (!item?.result || item.queueStatus !== 'completed') return { item: null };
  if (item.result.sourceRevision !== expected.sourceRevision || item.result.analysisGeneration !== expected.analysisGeneration) {
    return { item: null, error: 'stale' };
  }
  const corrected = editableResult(expected.result);
  if (!corrected) return { item: null, error: 'invalid' };
  const correction: FanmassHumanCorrection = {
    ...corrected,
    correctedAt,
    correctedBy,
    sourceRevision: item.result.sourceRevision,
    analysisGeneration: item.result.analysisGeneration,
  };
  const saved = await cameraDb.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submissionObjectId, $and: [fanmassEligiblePhotoFilter(eventId, event)] },
    {
      $set: {
        fanmassAnalysisReview: {
          status: 'corrected',
          updatedAt: correctedAt,
          correction,
        },
      },
    },
  );
  if (saved.matchedCount !== 1) return { item: null };
  return { item: await loadFanmassEventPhoto(cameraDb, eventId, event, submissionObjectId) };
}
