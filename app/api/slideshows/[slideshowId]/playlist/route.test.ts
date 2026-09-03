import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { buildPlaylistMatchFilter } from './route';

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
const manualId = new ObjectId();

function baseDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: manualId,
    eventId: 'event-uuid-1',
    isArchived: false,
    userEmail: 'guest@example.com',
    submissionKind: 'tryon_result',
    ...overrides,
  };
}

function filterFor(submissionSourceMode: 'originals_only' | 'approved_tryon_only' | 'originals_and_approved_tryon') {
  return buildPlaylistMatchFilter({
    eventIdKeys,
    inactiveEmails,
    submissionSourceMode,
    manualObjectIds: [manualId],
    excludeOids: [],
  });
}

test('pinned + rejected tryon_result is excluded', () => {
  const filter = filterFor('originals_only');
  const doc = baseDoc({ reviewStatus: 'rejected' });
  assert.equal(matches(doc, filter), false);
});

test('pinned + hiddenFromEvents containing the event is excluded', () => {
  const filter = filterFor('originals_only');
  const doc = baseDoc({ reviewStatus: 'approved', hiddenFromEvents: ['event-uuid-1'] });
  assert.equal(matches(doc, filter), false);
});

test('pinned + inactive account (userInfo.isActive: false) is excluded', () => {
  const filter = filterFor('originals_only');
  const doc = baseDoc({ reviewStatus: 'approved', userInfo: { isActive: false } });
  assert.equal(matches(doc, filter), false);
});

test('pinned + approved tryon_result is included', () => {
  const filter = filterFor('originals_only');
  const doc = baseDoc({ reviewStatus: 'approved' });
  assert.equal(matches(doc, filter), true);
});

test('pinned original submission with no reviewStatus field is included', () => {
  const filter = filterFor('approved_tryon_only');
  const doc = baseDoc({ submissionKind: 'original' });
  delete (doc as Record<string, unknown>).reviewStatus;
  assert.equal(matches(doc, filter), true);
});

test('pin still overrides submissionSourceMode kind restriction for an approved original', () => {
  const filter = filterFor('approved_tryon_only');
  const doc = baseDoc({ submissionKind: 'original' });
  assert.equal(matches(doc, filter), true);
  const nonPinned = buildPlaylistMatchFilter({
    eventIdKeys,
    inactiveEmails,
    submissionSourceMode: 'approved_tryon_only',
    manualObjectIds: [],
    excludeOids: [],
  });
  assert.equal(matches(doc, nonPinned), false);
});
