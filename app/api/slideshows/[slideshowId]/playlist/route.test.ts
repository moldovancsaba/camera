import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { buildPlaylistMatchFilter, buildPlaylistPipeline } from './route';

type Op =
  | { $eq: unknown }
  | { $ne: unknown }
  | { $in: unknown[] }
  | { $nin: unknown[] }
  | { $exists: boolean };

function getPath(doc: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, doc);
}

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => key.startsWith('$'));
}

function matchesLeaf(doc: Record<string, unknown>, field: string, condition: unknown): boolean {
  const actual = getPath(doc, field);
  if (!isOperatorObject(condition)) {
    return actual === condition;
  }
  const ops = condition as Op;
  if ('$exists' in ops) {
    const exists = typeof actual !== 'undefined';
    return exists === ops.$exists;
  }
  if ('$eq' in ops) return actual === ops.$eq;
  if ('$ne' in ops) return actual !== ops.$ne;
  if ('$in' in ops) return ops.$in.some((v) => String(v) === String(actual));
  if ('$nin' in ops) return !ops.$nin.some((v) => String(v) === String(actual));
  throw new Error(`Unsupported operator in condition: ${JSON.stringify(condition)}`);
}

/** Minimal evaluator for the specific $and/$or/$in/$nin/$ne/$exists shapes buildPlaylistMatchFilter emits. */
function matches(doc: Record<string, unknown>, filter: object): boolean {
  const entries = Object.entries(filter as Record<string, unknown>);
  return entries.every(([key, value]) => {
    if (key === '$and') {
      return (value as object[]).every((clause) => matches(doc, clause));
    }
    if (key === '$or') {
      return (value as object[]).some((clause) => matches(doc, clause));
    }
    return matchesLeaf(doc, key, value);
  });
}

const eventIdKeys = ['event-uuid-1'];
const inactiveEmails: string[] = [];
const photoId = new ObjectId();

function baseDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: photoId,
    eventId: 'event-uuid-1',
    isArchived: false,
    userEmail: 'guest@example.com',
    submissionKind: 'original',
    ...overrides,
  };
}

const playlistFilter = () => buildPlaylistMatchFilter({ eventIdKeys, inactiveEmails, excludeOids: [] });

test('a stored try-on result is never in a playlist, whatever its review, its slideshow flag or its pin says (issue 557)', () => {
  for (const reviewStatus of ['approved', 'pending_review', 'rejected', undefined]) {
    for (const isSlideshowEligible of [true, false, undefined]) {
      const doc = baseDoc({ submissionKind: 'tryon_result', reviewStatus, isSlideshowEligible, isShareVisible: true });
      assert.equal(matches(doc, playlistFilter()), false, `${String(reviewStatus)} eligible ${String(isSlideshowEligible)}`);
    }
  }
  const unknownKind = baseDoc({ submissionKind: 'something_else', reviewStatus: 'approved' });
  assert.equal(matches(unknownKind, playlistFilter()), false, 'only a plain photo is shown');
});

test('hidden from the event, an inactive account and an archived photo are excluded', () => {
  assert.equal(matches(baseDoc({ reviewStatus: 'approved', hiddenFromEvents: ['event-uuid-1'] }), playlistFilter()), false);
  assert.equal(matches(baseDoc({ reviewStatus: 'approved', userInfo: { isActive: false } }), playlistFilter()), false);
  assert.equal(matches(baseDoc({ reviewStatus: 'approved', isArchived: true }), playlistFilter()), false);
});

test('a plain photo with no reviewStatus field (from before vetting) is included', () => {
  const doc = baseDoc();
  assert.equal(matches(doc, playlistFilter()), true);
  assert.equal(matches(baseDoc({ submissionKind: undefined }), playlistFilter()), true, 'no kind at all is a plain photo too');
});

test('a vetted photo that is waiting or rejected is never in a playlist', () => {
  for (const reviewStatus of ['pending_review', 'rejected']) {
    assert.equal(matches(baseDoc({ reviewStatus }), playlistFilter()), false, reviewStatus);
  }
});

test('a picture that is gone is never in a playlist; one that answers is', () => {
  const broken = baseDoc({ reviewStatus: 'approved', mediaHealth: { broken: true, checkedAt: 'x' } });
  assert.equal(matches(broken, playlistFilter()), false);
  const fine = baseDoc({ reviewStatus: 'approved', mediaHealth: { broken: false, checkedAt: 'x' } });
  assert.equal(matches(fine, playlistFilter()), true);
});

test('an approved vetted photo and a photo from before vetting are in the playlist', () => {
  for (const reviewStatus of ['approved', undefined]) {
    const doc = baseDoc({ reviewStatus });
    assert.equal(matches(doc, playlistFilter()), true, String(reviewStatus));
  }
});

test('the photos already in another playlist are left out', () => {
  const other = new ObjectId();
  const filter = buildPlaylistMatchFilter({ eventIdKeys, inactiveEmails, excludeOids: [other] });
  assert.equal(matches(baseDoc({ _id: other, reviewStatus: 'approved' }), filter), false);
  assert.equal(matches(baseDoc({ reviewStatus: 'approved' }), filter), true);
});

test('the playlist query cuts the documents down to what a slide needs before it sorts, and sorts least played first, then oldest', () => {
  const filter = { eventId: 'e1' };
  const [match, project, sort] = buildPlaylistPipeline(filter) as unknown as Array<Record<string, Record<string, unknown>>>;
  assert.deepEqual(Object.keys(match), ['$match']);
  assert.equal(match.$match, filter);
  assert.deepEqual(Object.keys(project), ['$project']);
  assert.deepEqual(sort.$sort, { normalizedPlayCount: 1, createdAt: 1 });
  const kept = Object.keys(project.$project);
  for (const needed of ['_id', 'imageUrl', 'finalImageUrl', 'screenImageUrl', 'createdAt', 'metadata.finalWidth', 'metadata.originalHeight', 'normalizedPlayCount']) {
    assert.ok(kept.includes(needed), `${needed} is kept`);
  }
  for (const heavy of ['userInfo', 'userEmail', 'consents', 'metadata', 'slideshowPlays', 'userAgent']) {
    assert.ok(!kept.includes(heavy), `${heavy} is not read`);
  }
  assert.deepEqual(project.$project.normalizedPlayCount, { $ifNull: ['$playCount', 0] });
});
