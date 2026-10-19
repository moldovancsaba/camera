import { NextRequest } from 'next/server';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type FanmassPhotoAnalysis, type Submission } from '@/lib/db/schemas';
import { assertInternalFanmassSecret } from '@/lib/fanmass/internal';
import { buildMediaFeedEligibilityMatch } from '@/lib/fanmass/media-feed';

const CONTRACT = 'fanmass.camera.photo-analysis.v1';
const MAX_BODY_BYTES = 900_000;
const MAX_BOXES = 1_000;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value: unknown, fallback = '', max = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1_000_000, Math.floor(value))) : 0;
}

function confidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function box(value: unknown): { x: number; y: number; w: number; h: number } | null {
  if (!isRecord(value)) return null;
  const { x, y, w, h } = value;
  if ([x, y, w, h].some((part) => typeof part !== 'number' || !Number.isFinite(part))) return null;
  const nx = x as number;
  const ny = y as number;
  const nw = w as number;
  const nh = h as number;
  if (nx < 0 || ny < 0 || nw <= 0 || nh <= 0 || nx + nw > 1.01 || ny + nh > 1.01) return null;
  return { x: nx, y: ny, w: nw, h: nh };
}

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return value;
}

function parseAnalysis(raw: unknown, eventId: string, captureId: string): FanmassPhotoAnalysis {
  if (!isRecord(raw) || raw.contractVersion !== CONTRACT || raw.eventId !== eventId || raw.captureId !== captureId) {
    throw apiBadRequest('The photo analysis contract or photo identity is invalid.');
  }
  const status = raw.status;
  const stage = raw.analysisStage;
  if ((status !== 'completed' && status !== 'failed') || !['scanned', 'demographics', 'deep', 'failed'].includes(String(stage))) {
    throw apiBadRequest('The photo analysis status is invalid.');
  }
  const rawBoxes = isRecord(raw.boxes) ? raw.boxes : {};
  const rawPeople = Array.isArray(rawBoxes.people) ? rawBoxes.people : [];
  const rawFaces = Array.isArray(rawBoxes.faces) ? rawBoxes.faces : [];
  if (rawPeople.length > MAX_BOXES || rawFaces.length > MAX_BOXES) throw apiBadRequest('Too many photo-analysis boxes.');

  const people = rawPeople.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const normalizedBox = box(entry.box);
    if (!normalizedBox) return [];
    const age = entry.estimatedAge;
    return [{
      id: boundedText(entry.id, `person-${index + 1}`, 80),
      box: normalizedBox,
      gender: boundedText(entry.gender, 'unknown', 32),
      estimatedAge: typeof age === 'number' && Number.isFinite(age) ? Math.max(0, Math.min(120, Math.round(age))) : null,
      emotion: boundedText(entry.emotion, 'unknown', 32),
      subjectType: boundedText(entry.subjectType, 'unknown', 32),
      confidence: confidence(entry.confidence),
      smiling: entry.smiling === true,
      hasCap: entry.hasCap === true,
      hasGlasses: entry.hasGlasses === true,
    }];
  });
  const faces = rawFaces.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const normalizedBox = box(entry.box);
    return normalizedBox ? [{
      id: boundedText(entry.id, `face-${index + 1}`, 80),
      box: normalizedBox,
      confidence: confidence(entry.confidence),
      smiling: entry.smiling === true,
    }] : [];
  });

  const summary = isRecord(raw.summary) ? raw.summary : {};
  const demographics = jsonObject(summary.demographics);
  const moderation = jsonObject(summary.moderation);
  const sportsMerchandise = jsonObject(summary.sportsMerchandise);
  const fashionBrands = jsonObject(summary.fashionBrands);
  const analyzedDate = new Date(String(raw.analyzedAt || ''));
  if (!Number.isFinite(analyzedDate.getTime())) throw apiBadRequest('The analysis timestamp is invalid.');
  return {
    contractVersion: CONTRACT,
    eventId,
    captureId,
    batchId: boundedText(raw.batchId, '', 120),
    imageId: boundedText(raw.imageId, '', 120),
    status,
    analysisStage: stage as FanmassPhotoAnalysis['analysisStage'],
    analyzedAt: analyzedDate.toISOString(),
    receivedAt: new Date().toISOString(),
    summary: {
      personCount: count(summary.personCount),
      realPersonCount: count(summary.realPersonCount),
      displayPersonCount: count(summary.displayPersonCount),
      crowdEstimate: count(summary.crowdEstimate),
      sceneType: boundedText(summary.sceneType, 'unknown', 40),
      ...(demographics ? { demographics } : {}),
      ...(moderation ? { moderation } : {}),
      ...(sportsMerchandise ? { sportsMerchandise } : {}),
      ...(fashionBrands ? { fashionBrands } : {}),
    },
    boxes: { people, faces },
    ...(status === 'failed' ? { errorCode: boundedText(raw.errorCode, 'analysis_failed', 80) } : {}),
  };
}

/** Store a durable Fanmass snapshot on the eligible Camera submission. */
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string; captureId: string }> },
) => {
  assertInternalFanmassSecret(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);

  const { eventId, captureId } = await context.params;
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) throw apiBadRequest('The photo analysis is too large.');
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw apiBadRequest('A JSON photo-analysis body is required.');
  }
  const analysis = parseAnalysis(body, eventId, captureId);
  const db = await connectToDatabase();
  const submissions = db.collection<Submission>(COLLECTIONS.SUBMISSIONS);
  const eligiblePhoto = {
    $and: [
      buildMediaFeedEligibilityMatch(eventId),
      { submissionId: captureId },
    ],
  };

  const saved = await submissions.updateOne(
    {
      ...eligiblePhoto,
      $or: [
        { fanmassAnalysis: { $exists: false } },
        { 'fanmassAnalysis.analyzedAt': { $lte: analysis.analyzedAt } },
      ],
    },
    { $set: { fanmassAnalysis: analysis } },
  );
  if (saved.matchedCount === 1) return apiSuccess({ eventId, captureId, status: 'stored', receivedAt: analysis.receivedAt });

  const current = await submissions.findOne(eligiblePhoto, { projection: { 'fanmassAnalysis.analyzedAt': 1 } });
  if (current?.fanmassAnalysis?.analyzedAt && current.fanmassAnalysis.analyzedAt >= analysis.analyzedAt) {
    return apiSuccess({ eventId, captureId, status: 'already_current' });
  }
  throw apiNotFound('Eligible photo');
});
