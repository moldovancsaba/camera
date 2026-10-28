import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { MODERATION_CATEGORIES } from './contract';

mock.module('server-only', { exports: {} });
const { runModerationPrecheckWorker } = await import('./worker');
const { ModerationServiceError } = await import('./client');

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value);
}

function matches(row: Record<string, unknown>, filter: Document): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$and') return Array.isArray(expected) && expected.every((part) => matches(row, part as Document));
    if (key === '$or') return Array.isArray(expected) && expected.some((part) => matches(row, part as Document));
    const actual = getPath(row, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      return Object.entries(expected as Record<string, unknown>).every(([operator, wanted]) => {
        if (operator === '$in') return Array.isArray(wanted) && wanted.includes(actual);
        if (operator === '$nin') return Array.isArray(wanted) && !wanted.includes(actual);
        if (operator === '$ne') return actual !== wanted;
        if (operator === '$exists') return (actual !== undefined) === wanted;
        if (operator === '$lte') return typeof actual === 'string' && typeof wanted === 'string' && actual <= wanted;
        if (operator === '$type') return wanted === 'string' ? typeof actual === 'string' : wanted === 'number' ? typeof actual === 'number' : false;
        return false;
      });
    }
    return actual === expected;
  });
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = value;
}

function unsetPath(target: Record<string, unknown>, path: string): void {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') return;
    cursor = cursor[part] as Record<string, unknown>;
  }
  delete cursor[parts.at(-1)!];
}

function memoryDb(seed: Record<string, Record<string, unknown>[]>) {
  const collections = new Map(Object.entries(seed));
  const db = {
    collection(name: string) {
      const rows = collections.get(name) ?? [];
      collections.set(name, rows);
      return {
        find(filter: Document) {
          let found = rows.filter((row) => matches(row, filter));
          return {
            sort(order: Record<string, 1 | -1>) {
              found = [...found].sort((a, b) => {
                for (const [field, direction] of Object.entries(order)) {
                  const left = getPath(a, field);
                  const right = getPath(b, field);
                  if (left === right) continue;
                  return (left! < right! ? -1 : 1) * direction;
                }
                return 0;
              });
              return this;
            },
            limit(count: number) { found = found.slice(0, count); return this; },
            async toArray() { return found; },
          };
        },
        async findOne(filter: Document) { return rows.find((row) => matches(row, filter)) ?? null; },
        async findOneAndUpdate(filter: Document, update: Document, options: { upsert?: boolean }) {
          let row = rows.find((candidate) => matches(candidate, filter));
          if (!row && options.upsert) {
            const id = filter._id;
            row = { _id: id };
            rows.push(row);
          }
          if (!row) return null;
          for (const [path, value] of Object.entries(update.$set as Record<string, unknown> ?? {})) setPath(row, path, value);
          return structuredClone(row);
        },
        async updateOne(filter: Document, update: Document) {
          const row = rows.find((candidate) => matches(candidate, filter));
          if (!row) return { matchedCount: 0, modifiedCount: 0 };
          for (const [path, value] of Object.entries(update.$set as Record<string, unknown> ?? {})) setPath(row, path, value);
          for (const path of Object.keys(update.$unset as Record<string, unknown> ?? {})) unsetPath(row, path);
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  };
  return { db: db as unknown as Db, collections };
}

function submission(id: string, createdAt: string, email = `${id}@example.com`) {
  const photoUrl = `https://teststore.public.blob.vercel-storage.com/pending/6ac636415fa8994cb2d3df85/${id.padEnd(24, 'a')}.jpg`;
  return {
    _id: id,
    createdAt,
    reviewStatus: 'pending_review',
    consentStatus: 'received',
    consents: [{ pageId: 'accept', pageType: 'accept', checkboxText: 'I agree', accepted: true, acceptedAt: '2026-10-27T10:00:00.000Z' }],
    guestContact: { status: 'complete', email, source: 'typed_email' },
    photoReview: { photoUrl },
    retentionStatus: 'active',
    moderationPrecheck: { enabledAtCapture: true, status: 'queued', photoUrl, eventMongoId: '6ac636415fa8994cb2d3df85', queuedAt: createdAt, attempts: 0, generation: 1 },
  };
}

test('does not discover or submit while the stored consent/contact gates are incomplete', async () => {
  const waiting = {
    ...submission('999999999999999999999999', '2026-10-27T10:00:00.000Z'),
    consentStatus: 'pending',
    consents: [],
    guestContact: { status: 'awaiting_contact', email: null },
  };
  const { db, collections } = memoryDb({
    [COLLECTIONS.SUBMISSIONS]: [waiting],
    [COLLECTIONS.ADMIN_SETTINGS]: [],
  });
  let calls = 0;
  const client = {
    async discover() { calls += 1; },
    async submit() { calls += 1; return 'should-not-submit'; },
    async read() { calls += 1; throw new Error('No remote job should exist'); },
    async delete() { calls += 1; },
  };
  const result = await runModerationPrecheckWorker(db, { client, budgetMs: 500 });
  assert.equal(result.submitted, 0);
  assert.equal(result.failed, 0);
  assert.equal(calls, 0);
  assert.equal((collections.get(COLLECTIONS.SUBMISSIONS)![0]!.moderationPrecheck as Document).status, 'queued');
});

test('runs one consent-eligible photo at a time and attaches exact per-photo results', async () => {
  const first = submission('111111111111111111111111', '2026-10-27T10:00:00.000Z');
  const second = submission('222222222222222222222222', '2026-10-27T10:01:00.000Z');
  const ineligible = submission('333333333333333333333333', '2026-10-27T10:02:00.000Z', 'anonymous@event');
  const { db, collections } = memoryDb({
    [COLLECTIONS.SUBMISSIONS]: [first, second, ineligible],
    [COLLECTIONS.ADMIN_SETTINGS]: [],
  });
  const normalizedRevision = 'a'.repeat(64);
  const sourceRevision = 'b'.repeat(64);
  const categories = Object.fromEntries(MODERATION_CATEGORIES.map((category) => [category, category === 'nudity' ? 'detected' : 'not_detected']));
  const result = {
    schema_version: 'camera-moderation.v1', model: 'auto-selected-model', review_required: true, automated_decision: 'none',
    signal: 'flagged', flags: ['nudity'], categories, evidence: 'Possible exposed skin', limitations: 'Experimental.',
  };
  let active = 0;
  let maxActive = 0;
  let deletedJobs = 0;
  const client = {
    async discover() {},
    async submit() { active += 1; maxActive = Math.max(active, maxActive); return `remote-${active}`; },
    async read(id: string) { active -= 1; return { id, status: 'completed' as const, imageSha256: normalizedRevision, result }; },
    async delete() { deletedJobs += 1; },
  };
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_secret';
  try {
    const outcome = await runModerationPrecheckWorker(db, {
      client,
      loadImage: async () => ({ bytes: Buffer.from('normalized'), sourceRevision, normalizedRevision }),
      maxBatch: 10,
      budgetMs: 500,
    });
    assert.equal(outcome.completed, 2);
    assert.equal(outcome.flagged, 2);
    assert.equal(outcome.failed, 1);
    assert.equal(maxActive, 1);
    assert.equal(deletedJobs, 2, 'completed results are deleted remotely only after Camera stores them');
    const rows = collections.get(COLLECTIONS.SUBMISSIONS)!;
    assert.equal((rows[0]!.moderationPrecheck as Document).status, 'completed');
    const storedResult = ((rows[0]!.moderationPrecheck as Document).result as Document);
    assert.equal(storedResult.signal, 'flagged');
    assert.equal(storedResult.review_required, true);
    assert.equal(storedResult.automated_decision, 'none');
    assert.equal(Object.keys(storedResult.categories as Document).length, 9);
    assert.equal((rows[1]!.moderationPrecheck as Document).status, 'completed');
    assert.equal((rows[2]!.moderationPrecheck as Document).status, 'failed');
    assert.equal(rows[0]!.reviewStatus, 'pending_review');
    assert.equal(rows[1]!.reviewStatus, 'pending_review');
  } finally {
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
  }
});

test('does not submit a second image while the first POST outcome is ambiguous', async () => {
  const first = submission('444444444444444444444444', '2026-10-27T10:00:00.000Z');
  const second = submission('555555555555555555555555', '2026-10-27T10:01:00.000Z');
  const { db, collections } = memoryDb({
    [COLLECTIONS.SUBMISSIONS]: [first, second],
    [COLLECTIONS.ADMIN_SETTINGS]: [],
  });
  const sourceRevision = 'c'.repeat(64);
  const normalizedRevision = 'd'.repeat(64);
  let submissions = 0;
  const client = {
    async discover() {},
    async submit() { submissions += 1; throw new ModerationServiceError('network_or_timeout', null); },
    async read() { throw new Error('No remote job ID is available after the simulated timeout'); },
    async delete() { throw new Error('No remote job exists after the simulated timeout'); },
  };
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_secret';
  try {
    const outcome = await runModerationPrecheckWorker(db, {
      client,
      loadImage: async () => ({ bytes: Buffer.from('normalized'), sourceRevision, normalizedRevision }),
      maxBatch: 10,
      budgetMs: 500,
    });
    assert.equal(outcome.submitted, 0);
    assert.equal(outcome.waiting, 2);
    assert.equal(submissions, 1);
    const rows = collections.get(COLLECTIONS.SUBMISSIONS)!;
    assert.equal((rows[0]!.moderationPrecheck as Document).status, 'submitting');
    assert.equal((rows[1]!.moderationPrecheck as Document).status, 'queued');
  } finally {
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
  }
});

test('backs off the whole Camera queue after the shared service reports capacity busy', async () => {
  const first = submission('777777777777777777777777', '2026-10-27T10:00:00.000Z');
  const second = submission('888888888888888888888888', '2026-10-27T10:01:00.000Z');
  const { db, collections } = memoryDb({
    [COLLECTIONS.SUBMISSIONS]: [first, second],
    [COLLECTIONS.ADMIN_SETTINGS]: [],
  });
  let submissions = 0;
  const client = {
    async discover() {},
    async submit() { submissions += 1; throw new ModerationServiceError('capacity_busy', 429, 60); },
    async read() { throw new Error('No remote job should be created when capacity is busy'); },
    async delete() { throw new Error('No remote job should be created when capacity is busy'); },
  };
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_secret';
  try {
    await runModerationPrecheckWorker(db, {
      client,
      loadImage: async () => ({ bytes: Buffer.from('normalized'), sourceRevision: '9'.repeat(64), normalizedRevision: '8'.repeat(64) }),
      maxBatch: 10,
      budgetMs: 500,
    });
    assert.equal(submissions, 1);
    const rows = collections.get(COLLECTIONS.SUBMISSIONS)!;
    assert.equal((rows[0]!.moderationPrecheck as Document).status, 'queued');
    assert.equal((rows[1]!.moderationPrecheck as Document).status, 'queued');
  } finally {
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
  }
});

test('discards a completed signal if the source photo revision changed before result storage', async () => {
  const row = submission('666666666666666666666666', '2026-10-27T10:00:00.000Z');
  const { db, collections } = memoryDb({
    [COLLECTIONS.SUBMISSIONS]: [row],
    [COLLECTIONS.ADMIN_SETTINGS]: [],
  });
  const sourceRevision = 'e'.repeat(64);
  const normalizedRevision = 'f'.repeat(64);
  const changedRevision = '1'.repeat(64);
  const result = {
    schema_version: 'camera-moderation.v1', model: 'auto-selected-model', review_required: true, automated_decision: 'none',
    signal: 'no_flags_detected', flags: [], categories: Object.fromEntries(MODERATION_CATEGORIES.map((category) => [category, 'not_detected'])), evidence: '', limitations: 'Experimental.',
  };
  let loads = 0;
  const client = {
    async discover() {},
    async submit() { return 'remote-stale'; },
    async read(id: string) { return { id, status: 'completed' as const, imageSha256: normalizedRevision, result }; },
    async delete() {},
  };
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_secret';
  try {
    const outcome = await runModerationPrecheckWorker(db, {
      client,
      loadImage: async () => {
        loads += 1;
        return { bytes: Buffer.from('normalized'), sourceRevision: loads === 1 ? sourceRevision : changedRevision, normalizedRevision };
      },
      maxBatch: 2,
      budgetMs: 500,
    });
    assert.equal(outcome.completed, 0);
    assert.equal(loads, 2);
    assert.equal((collections.get(COLLECTIONS.SUBMISSIONS)![0]!.moderationPrecheck as Document | undefined), undefined);
    assert.equal(collections.get(COLLECTIONS.SUBMISSIONS)![0]!.reviewStatus, 'pending_review');
  } finally {
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
  }
});
