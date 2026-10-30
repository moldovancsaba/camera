import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { filterUnavailableVisualAssetUrls, visualAssetVisibleToEvent } from './filter';

function dbWith(rows: Record<string, Array<Record<string, unknown>>>): Db {
  return {
    collection: (name: string) => ({
      find: (query: Record<string, unknown>) => ({
        toArray: async () => {
          const urlSet = new Set<string>([
            ...((((query.$or as Array<Record<string, Record<string, string[]>>>) ?? []).flatMap((clause) => Object.values(clause).flatMap((condition) => condition.$in))) ?? []),
          ]);
          return (rows[name] ?? []).filter((row) => urlSet.has(String(row.imageUrl)) || urlSet.has(String(row.thumbnailUrl)));
        },
      }),
    }),
  } as unknown as Db;
}

const event = { eventId: 'event-1', partnerId: 'partner-1', visualAssetPolicy: { inheritanceVersion: 2 } };
const partner = { partnerId: 'partner-1', visualAssetPolicy: { inheritanceVersion: 2, hidden: [], blockedForChildren: [] } };

test('guest URL filtering removes a parent asset hidden at the partner, but keeps unrelated URLs', async () => {
  const asset = { pictureId: 'global-1', scope: 'global', shareToChildren: true, imageUrl: 'https://cdn.test/global.png', isActive: true };
  const payload = {
    customPages: [{ config: { backgroundImageUrl: asset.imageUrl, buttonHref: 'https://other.test/page' } }],
  };
  const result = await filterUnavailableVisualAssetUrls(
    dbWith({ [COLLECTIONS.IMAGES]: [asset] }), payload, event,
    { ...partner, visualAssetPolicy: { inheritanceVersion: 2, hidden: [{ kind: 'images', id: 'global-1' }], blockedForChildren: [] } },
  );
  assert.deepEqual(result, { customPages: [{ config: { buttonHref: 'https://other.test/page' } }] });
});

test('guest URL filtering keeps shared visible and unregistered image URLs', async () => {
  const payload = { logoUrl: 'https://cdn.test/shared.png', backgroundImageUrl: 'https://cdn.test/legacy.png' };
  const result = await filterUnavailableVisualAssetUrls(
    dbWith({ [COLLECTIONS.LOGOS]: [{ logoId: 'logo-1', scope: 'global', shareToChildren: true, isActive: true, imageUrl: payload.logoUrl }] }),
    payload, event, partner,
  );
  assert.deepEqual(result, payload);
});

test('inactive inherited assets cannot be used at an event, including for legacy partner records', () => {
  const asset = { scope: 'global', shareToChildren: true, isActive: false };
  assert.equal(visualAssetVisibleToEvent(asset, 'frames', 'frame-1', event, partner), false);
  assert.equal(visualAssetVisibleToEvent(asset, 'frames', 'frame-1', event, null), false);
});
