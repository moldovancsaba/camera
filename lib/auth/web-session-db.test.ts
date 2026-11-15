import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';

function setup(t: TestContext) {
  const seeded = fakeDb();
  t.mock.module('@/lib/db/mongodb', { exports: { connectToDatabase: async () => seeded.db } });
  return seeded;
}

test('Mongo web sessions persist a normalized email lookup key without changing the session profile', async (t) => {
  const seeded = setup(t);
  const { saveWebSessionDocument } = await import('./web-session-db?test=' + Date.now()) as typeof import('./web-session-db');
  const session = {
    user: { id: 'sso-user-1', email: '  Person@Example.com ', name: 'Person', email_verified: true },
    accessToken: 'access',
    refreshToken: 'refresh',
    accessTokenExpiresAt: '2026-11-02T12:00:00.000Z',
    createdAt: '2026-11-02T11:00:00.000Z',
    expiresAt: '2026-12-02T11:00:00.000Z',
  };

  await saveWebSessionDocument(session);

  assert.equal(seeded.data.web_sessions.length, 1);
  assert.equal(seeded.data.web_sessions[0].identityEmailNormalized, 'person@example.com');
  assert.deepEqual(seeded.data.web_sessions[0].session, session);
});
