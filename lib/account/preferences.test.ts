import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLLECTIONS } from '@/lib/db/schemas';
import { fakeDb } from '@/lib/library/fake-db';
import { parseAdminUiLanguagePreferenceBody, readAdminUiLanguagePreference, saveAdminUiLanguagePreference } from './preferences';

test('the preference is stored under only the SSO subject and device language is represented by null', async () => {
  const seeded = fakeDb();
  await saveAdminUiLanguagePreference(seeded.db, 'sso-user-1', 'hu', '2026-10-28T10:00:00.000Z');
  assert.equal(await readAdminUiLanguagePreference(seeded.db, 'sso-user-1'), 'hu');
  assert.equal(await readAdminUiLanguagePreference(seeded.db, 'sso-user-2'), null);
  await saveAdminUiLanguagePreference(seeded.db, 'sso-user-1', null, '2026-10-28T10:01:00.000Z');
  assert.equal(await readAdminUiLanguagePreference(seeded.db, 'sso-user-1'), null);

  const record = seeded.data[COLLECTIONS.ADMIN_USER_PREFERENCES][0];
  assert.deepEqual(Object.keys(record).sort(), ['_id', 'createdAt', 'uiLanguage', 'updatedAt']);
  assert.equal(record._id, 'sso-user-1');
  assert.equal('email' in record, false);
  assert.equal('name' in record, false);
});

test('preference payload accepts supported locales or null only and refuses identity fields', () => {
  assert.deepEqual(parseAdminUiLanguagePreferenceBody({ uiLanguage: 'sr-Latn' }), { ok: true, uiLanguage: 'sr-Latn' });
  assert.deepEqual(parseAdminUiLanguagePreferenceBody({ uiLanguage: null }), { ok: true, uiLanguage: null });
  for (const invalid of [
    { uiLanguage: 'xx' },
    { uiLanguage: 42 },
    { uiLanguage: undefined },
    { uiLanguage: 'hu', userId: 'someone-else' },
    { userId: 'someone-else', email: 'a@example.com' },
    null,
    [],
  ]) assert.deepEqual(parseAdminUiLanguagePreferenceBody(invalid), { ok: false });
});
