import assert from 'node:assert/strict';
import { ObjectId, type Db } from 'mongodb';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { apiForbidden } from '@/lib/api';
import { PrivacySubjectProofError, type SsoSubjectProof } from '@/lib/privacy/subject-proof';
import { createPrivacySubjectResolver, type SubjectResolverDependencies } from './route';

const requestId = 'b44bda8b-a031-4a29-a9a5-0d0a340e7eab';

function setup(options: {
  proof?: SsoSubjectProof;
  proofError?: 'invalid' | 'unavailable';
  rows?: Array<Record<string, unknown>>;
  upperId?: ObjectId;
  candidateCount?: number;
  conflictCount?: number;
  rejectAuth?: boolean;
} = {}) {
  let findCalls = 0;
  const rows = options.rows ?? [];
  const collection = {
    countDocuments: async (filter: Record<string, unknown>) => {
      const clauses = filter.$and as Array<Record<string, unknown>> | undefined;
      const first = clauses?.[0];
      const accountConflict = first && typeof first.userId === 'object' && (first.userId as Record<string, unknown>).$exists === true;
      return accountConflict ? options.conflictCount ?? 0 : options.candidateCount ?? rows.length;
    },
    findOne: async () => rows[0] ?? null,
    find: () => {
      findCalls++;
      const call = findCalls;
      return {
        sort() { return this; },
        limit() { return this; },
        async toArray() {
          if (call === 1) return [{ _id: options.upperId ?? rows.at(-1)?._id }].filter((row) => row._id);
          return rows;
        },
      };
    },
  };
  const dependencies: SubjectResolverDependencies = {
    authenticate: () => { if (options.rejectAuth) throw apiForbidden(); return 'test-cursor-secret'; },
    rateLimit: async () => undefined,
    getProof: async () => {
      if (options.proofError) throw new PrivacySubjectProofError(options.proofError);
      return options.proof ?? { version: 1, caseId: requestId, subject: { kind: 'sso_user', id: 'account-1' } };
    },
    connectDatabase: async () => ({ collection: () => collection }) as unknown as Db,
  };
  return createPrivacySubjectResolver(dependencies);
}

function post(body: unknown) {
  return new NextRequest('http://localhost/api/internal/privacy/resolve-subject', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('resolver returns exact opaque IDs and never returns the verified email', async () => {
  const id = new ObjectId();
  const resolve = setup({
    proof: { version: 1, caseId: requestId, subject: { kind: 'sso_user', id: 'account-1' }, verifiedEmail: { value: 'person@example.com', proof: 'sso_account_email_verified', verifiedAt: null } },
    rows: [{ _id: id, submissionId: 'submission-1', userId: 'account-1', eventId: 'event-1', eventIds: ['event-2'], partnerId: 'partner-1', userInfo: { email: 'secret@example.com' } }],
  });
  const result = await resolve(post({ request_id: requestId }));
  const json = await result.json() as { data: Record<string, unknown> };
  assert.equal(result.status, 200);
  assert.deepEqual(json.data.matches, [{ photo_id: id.toHexString(), submission_id: 'submission-1', event_ids: ['event-1', 'event-2'], partner_id: 'partner-1', basis: 'sso_account_id' }]);
  assert.equal(JSON.stringify(json).includes('person@example.com'), false);
  assert.equal(JSON.stringify(json).includes('secret@example.com'), false);
});

test('conflicting stable account ownership returns ambiguity without photo IDs', async () => {
  const resolve = setup({
    proof: { version: 1, caseId: requestId, subject: { kind: 'sso_user', id: 'account-1' }, verifiedEmail: { value: 'person@example.com', proof: 'sso_account_email_verified', verifiedAt: null } },
    rows: [{ _id: new ObjectId(), userId: 'account-1' }],
    candidateCount: 2,
    conflictCount: 1,
  });
  const result = await resolve(post({ request_id: requestId }));
  const json = await result.json() as { data: Record<string, unknown> };
  assert.equal(json.data.status, 'ambiguous');
  assert.deepEqual(json.data.matches, []);
  assert.equal(json.data.candidate_count, 2);
});

test('unresolvable SSO case is a typed invalid-proof state', async () => {
  const resolve = setup({ proofError: 'invalid' });
  const result = await resolve(post({ request_id: requestId }));
  const json = await result.json() as { data: Record<string, unknown> };
  assert.equal(json.data.status, 'invalid_proof');
  assert.deepEqual(json.data.matches, []);
});

test('resolver fails closed when its SSO dependency is unavailable', async () => {
  const resolve = setup({ proofError: 'unavailable' });
  await assert.rejects(() => resolve(post({ request_id: requestId })), (error: unknown) => error instanceof Response && error.status === 503);
});

test('caller must authenticate and request fields are closed-world', async () => {
  const reject = setup({ rejectAuth: true });
  await assert.rejects(() => reject(post({ request_id: requestId })), (error: unknown) => error instanceof Response && error.status === 403);
  const resolve = setup();
  await assert.rejects(() => resolve(post({ request_id: requestId, email: 'attacker@example.com' })), (error: unknown) => error instanceof Response && error.status === 400);
});

test('all result pages are capped and expose an opaque continuation cursor', async () => {
  const first = new ObjectId('507f1f77bcf86cd799439010');
  const second = new ObjectId('507f1f77bcf86cd799439011');
  const resolve = setup({ rows: [{ _id: first, userId: 'account-1' }, { _id: second, userId: 'account-1' }], upperId: second, candidateCount: 2 });
  const result = await resolve(post({ request_id: requestId, limit: 1 }));
  const json = await result.json() as { data: Record<string, unknown> };
  assert.equal(json.data.complete, false);
  assert.equal(typeof json.data.next_cursor, 'string');
  assert.equal((json.data.matches as unknown[]).length, 1);
});
