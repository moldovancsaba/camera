import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLLECTIONS } from '@/lib/db/schemas';
import { createFakeDb } from './sync.fake-db';
import { LEGACY_SETUP_ID, listActiveTryOnSetups, resolveTryOnSetupForJob } from './setup-resolution';

// The live default_motogp document differs from camera's seed (read-only
// check, 2026-09-29): an edited name and rank. CAM-12 is about never
// resetting such a document from a read or resolve path.
function editedLegacySetup(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'legacy-oid',
    setupId: LEGACY_SETUP_ID,
    name: 'MotoGP High (Default)',
    description: 'Edited by an admin',
    cameraId: null,
    active: false,
    isDefault: true,
    rank: 10,
    config: { processing_profile: 'motogp_leather_magic', steps: 80 },
    createdAt: '2026-06-03T19:02:41.637Z',
    updatedAt: '2026-09-28T00:23:09.820Z',
    ...overrides,
  };
}

// --- listActiveTryOnSetups: a read path must not write -------------------------

test('listActiveTryOnSetups with no active setup returns [] and writes nothing (no re-activation of default_motogp)', async () => {
  const stored = editedLegacySetup();
  const fake = createFakeDb({
    [COLLECTIONS.TRYON_SETUPS]: [stored, { setupId: 'jersey_fast', name: 'Jersey', active: false, rank: 1 }],
  });

  const setups = await listActiveTryOnSetups(fake.db);

  assert.deepEqual(setups, []);
  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.docs(COLLECTIONS.TRYON_SETUPS)[0], stored, 'default_motogp is untouched');
});

test('listActiveTryOnSetups with no setups at all returns [] and seeds nothing', async () => {
  const fake = createFakeDb();

  assert.deepEqual(await listActiveTryOnSetups(fake.db), []);
  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.docs(COLLECTIONS.TRYON_SETUPS), []);
});

test('listActiveTryOnSetups returns only active setups, default first then by rank, with string ids', async () => {
  const fake = createFakeDb({
    [COLLECTIONS.TRYON_SETUPS]: [
      { _id: 'oid-b', setupId: 'b_setup', name: 'B', active: true, isDefault: false, rank: 2 },
      { _id: 'oid-a', setupId: 'a_setup', name: 'A', active: true, isDefault: false, rank: 1 },
      { _id: 'oid-d', setupId: 'd_setup', name: 'D', active: true, isDefault: true, rank: 5 },
      editedLegacySetup(),
    ],
  });

  const setups = await listActiveTryOnSetups(fake.db);

  assert.deepEqual(setups.map((setup) => setup.setupId), ['d_setup', 'a_setup', 'b_setup']);
  assert.equal(typeof setups[0]._id, 'string');
  assert.deepEqual(fake.writes, []);
});

// --- resolveTryOnSetupForJob: seed only when missing, never overwrite ----------

test('resolveTryOnSetupForJob legacy fallback never overwrites an existing default_motogp', async () => {
  const stored = editedLegacySetup();
  const fake = createFakeDb({ [COLLECTIONS.TRYON_SETUPS]: [stored] });

  const resolved = await resolveTryOnSetupForJob(fake.db, { requestSetupId: null, cameraId: null });

  assert.deepEqual(resolved, {
    setupId: LEGACY_SETUP_ID,
    setupName: 'MotoGP High (Default)',
    setupProfile: 'motogp_leather_magic',
    setupSource: 'legacy',
  });
  assert.deepEqual(fake.docs(COLLECTIONS.TRYON_SETUPS), [stored], 'name, rank, config and active flag are unchanged');
  for (const write of fake.writes) {
    assert.deepEqual(Object.keys(write.update ?? {}), ['$setOnInsert'], 'only insert-time fields may be written');
  }
});

test('resolveTryOnSetupForJob seeds default_motogp once when it is missing, and a second call changes nothing', async () => {
  const fake = createFakeDb();

  const first = await resolveTryOnSetupForJob(fake.db, {});
  assert.equal(first.setupId, LEGACY_SETUP_ID);
  assert.equal(first.setupSource, 'legacy');

  const seeded = fake.docs(COLLECTIONS.TRYON_SETUPS);
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].setupId, LEGACY_SETUP_ID);
  assert.equal(seeded[0].active, true);

  // An admin edits the seeded document; the next resolution must keep the edit.
  seeded[0].name = 'Renamed by admin';
  seeded[0].active = false;
  const snapshot = structuredClone(seeded[0]);

  const second = await resolveTryOnSetupForJob(fake.db, {});
  assert.equal(second.setupName, 'Renamed by admin');
  assert.deepEqual(fake.docs(COLLECTIONS.TRYON_SETUPS), [snapshot]);
});

test('resolveTryOnSetupForJob prefers an active global default and does not touch default_motogp', async () => {
  const stored = editedLegacySetup();
  const fake = createFakeDb({
    [COLLECTIONS.TRYON_SETUPS]: [
      stored,
      { setupId: 'global_default', name: 'Global', active: true, isDefault: true, cameraId: null, rank: 0, config: { processingProfile: 'fal_tryon' } },
    ],
  });

  const resolved = await resolveTryOnSetupForJob(fake.db, {});

  assert.deepEqual(resolved, {
    setupId: 'global_default',
    setupName: 'Global',
    setupProfile: 'fal_tryon',
    setupSource: 'global.default',
  });
  assert.deepEqual(fake.writes, []);
});
