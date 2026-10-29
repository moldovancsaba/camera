import assert from 'node:assert/strict';
import test from 'node:test';
import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  applyExperienceConfig,
  parseExperienceTemplateConfig,
  parseExperienceTemplateSelection,
  resolveEventExperienceConfig,
  validateTemplateAssetScope,
} from './templates';

function database(options: {
  templates?: Array<Record<string, unknown>>;
  globalDefault?: string | null;
}): Db {
  return {
    collection(name: string) {
      return {
        async findOne(query: Record<string, unknown>) {
          if (name === COLLECTIONS.EXPERIENCE_TEMPLATES) {
            return options.templates?.find((template) => Object.entries(query).every(([key, value]) => template[key] === value)) ?? null;
          }
          if (name === COLLECTIONS.ADMIN_SETTINGS && query.settingId === 'default-experience-template') {
            return typeof options.globalDefault === 'string' ? { templateId: options.globalDefault } : null;
          }
          return null;
        },
      };
    },
  } as unknown as Db;
}

function scopedDatabase(options: {
  assets: Record<string, Array<Record<string, unknown>>>;
  partner: Record<string, unknown>;
}): Db {
  const matches = (document: Record<string, unknown>, query: Record<string, unknown>): boolean => {
    if (Array.isArray(query.$or) && !(query.$or as Array<Record<string, unknown>>).some((part) => matches(document, part))) return false;
    return Object.entries(query).every(([key, condition]) => {
      if (key === '$or') return true;
      const value = document[key];
      if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
        const operators = condition as Record<string, unknown>;
        if ('$in' in operators) return (operators.$in as unknown[]).includes(value);
        if ('$nin' in operators) return !(operators.$nin as unknown[]).includes(value);
        if ('$ne' in operators) return value !== operators.$ne;
      }
      return value === condition;
    });
  };
  return {
    collection(name: string) {
      return {
        async findOne(query: Record<string, unknown>) {
          return name === COLLECTIONS.PARTNERS && matches(options.partner, query) ? options.partner : null;
        },
        find(query: Record<string, unknown>) {
          const cursor = {
            sort() { return cursor; },
            limit() { return cursor; },
            async toArray() { return (options.assets[name] ?? []).filter((asset) => matches(asset, query)); },
          };
          return cursor;
        },
      };
    },
  } as unknown as Db;
}

const template = (templateId: string, level: 'global' | 'partner' | 'event', ownerId: string | null, config: Record<string, unknown>) => ({
  templateId,
  level,
  ownerId,
  config,
  name: templateId,
  updatedAt: '2026-10-29T00:00:00.000Z',
  updatedBy: 'admin',
});

test('template config accepts only known fields and rejects identity or consent data', () => {
  assert.equal(parseExperienceTemplateConfig({ visualSettings: { buttonSize: 'large' } }).ok, true);
  assert.equal(parseExperienceTemplateConfig({ submissions: [] }).ok, false);
  assert.equal(parseExperienceTemplateConfig({ customPages: [{ userEmail: 'private@example.test' }] }).ok, false);
  assert.equal(parseExperienceTemplateConfig({ visualSettings: { consentReceipt: { accepted: true } } }).ok, false);
});

test('template selection distinguishes inheritance, a local template, and explicit opt-out', () => {
  assert.deepEqual(parseExperienceTemplateSelection({ mode: 'inherit' }), { ok: true, value: { mode: 'inherit' } });
  assert.deepEqual(parseExperienceTemplateSelection({ mode: 'template', templateId: null }), { ok: true, value: { mode: 'template', templateId: null } });
  assert.equal(parseExperienceTemplateSelection({ mode: 'inherit', templateId: 'unexpected' }).ok, false);
});

test('partner template overlays global default, then event overrides, without copying parent state', async () => {
  const db = database({
    globalDefault: 'global-default',
    templates: [
      template('global-default', 'global', null, { visualSettings: { buttonSize: 'large', buttonColor: 'brand-primary' }, sharePage: { title: 'Welcome', subtitle: 'Start' } }),
      template('partner-default', 'partner', 'partner-1', { visualSettings: { buttonSize: 'small' }, sharePage: { title: 'Club welcome' } }),
    ],
  });
  const event = { eventId: 'event-1', experienceTemplate: { mode: 'inherit' as const, overrides: { sharePage: { subtitle: 'Match day' } } } };
  const resolved = await resolveEventExperienceConfig(db, event, { partnerId: 'partner-1', defaultExperienceTemplateId: 'partner-default' });

  assert.deepEqual(resolved, {
    config: { visualSettings: { buttonSize: 'small', buttonColor: 'brand-primary' }, sharePage: { title: 'Club welcome', subtitle: 'Match day' } },
    templateId: 'partner-default',
  });
  assert.equal(event.experienceTemplate.overrides.sharePage.subtitle, 'Match day');
});

test('partner opt-out and event opt-out preserve the event stored setup', async () => {
  const db = database({ globalDefault: 'global-default', templates: [template('global-default', 'global', null, { sharePage: { title: 'Parent' } })] });
  const event = { eventId: 'event-1', experienceTemplate: { mode: 'inherit' } };
  assert.equal(await resolveEventExperienceConfig(db, event, { partnerId: 'partner-1', defaultExperienceTemplateId: null }), null);
  assert.equal(await resolveEventExperienceConfig(db, { ...event, experienceTemplate: { mode: 'template', templateId: null } }, { partnerId: 'partner-1' }), null);
  const local = applyExperienceConfig({ sharePage: { title: 'Locally stored' } }, null);
  assert.deepEqual(local.sharePage, { title: 'Locally stored' });
});

test('event template starts an independent chain and stale references leave local configuration intact', async () => {
  const db = database({
    globalDefault: 'global-default',
    templates: [
      template('global-default', 'global', null, { sharePage: { title: 'Parent' } }),
      template('event-template', 'event', 'event-1', { sharePage: { title: 'Event' } }),
    ],
  });
  const localTemplate = await resolveEventExperienceConfig(db, { eventId: 'event-1', experienceTemplate: { mode: 'template', templateId: 'event-template' } }, { partnerId: 'partner-1' });
  assert.deepEqual(localTemplate, { config: { sharePage: { title: 'Event' } }, templateId: 'event-template' });

  const stale = await resolveEventExperienceConfig(db, { eventId: 'event-1', experienceTemplate: { mode: 'template', templateId: 'removed-template' } }, { partnerId: 'partner-1' });
  assert.equal(stale, null);
});

test('global presets reject known inactive or unshared library assets but keep external artwork supported', async () => {
  const assets = new Map<string, Array<Record<string, unknown>>>([
    [COLLECTIONS.FRAMES, [
      { frameId: 'shared', scope: 'global', isActive: true, shareToChildren: true, imageUrl: 'https://cdn.example.test/shared.png' },
      { frameId: 'private', scope: 'global', isActive: true, shareToChildren: false, imageUrl: 'https://cdn.example.test/private.png' },
    ]],
  ]);
  const db = {
    collection(name: string) {
      return {
        find(query: Record<string, unknown>) {
          const ors = query.$or as Array<Record<string, unknown>>;
          const requested = new Set(ors.flatMap((part) => Object.values(part).flatMap((condition) => {
            if (condition && typeof condition === 'object' && '$in' in condition) return (condition as { $in: string[] }).$in;
            return [];
          })));
          return { async toArray() { return (assets.get(name) ?? []).filter((asset) => requested.has(String(asset.imageUrl)) || requested.has(String(asset.thumbnailUrl))); } };
        },
      };
    },
  } as unknown as Db;
  const event = { eventId: 'event-1' };

  assert.deepEqual(await validateTemplateAssetScope(db, 'global', { visualSettings: { welcomeImageUrl: 'https://cdn.example.test/shared.png' } }, event, null), { ok: true });
  assert.equal((await validateTemplateAssetScope(db, 'global', { visualSettings: { welcomeImageUrl: 'https://cdn.example.test/private.png' } }, event, null)).ok, false);
  assert.deepEqual(await validateTemplateAssetScope(db, 'global', { visualSettings: { welcomeImageUrl: 'https://external.example.test/art.png' } }, event, null), { ok: true });
});

test('partner and event presets cannot save assets blocked from their descendants', async () => {
  const image = { frameId: 'shared-frame', scope: 'global', isActive: true, shareToChildren: true, imageUrl: 'https://cdn.example.test/shared.png' };
  const partner = {
    partnerId: 'partner-1',
    visualAssetPolicy: { inheritanceVersion: 2, hidden: [], blockedForChildren: [{ kind: 'frames', id: 'shared-frame' }] },
  };
  const db = scopedDatabase({ assets: { [COLLECTIONS.FRAMES]: [image] }, partner });
  const config = { visualSettings: { welcomeImageUrl: image.imageUrl } };
  const event = {
    eventId: 'event-1',
    partnerId: 'partner-1',
    frames: [{ frameId: 'shared-frame' }],
    visualAssetPolicy: { inheritanceVersion: 2, hidden: [] },
  };

  assert.equal((await validateTemplateAssetScope(db, 'partner', config, event, partner)).ok, false);
  assert.equal((await validateTemplateAssetScope(db, 'event', config, event, partner)).ok, false);
});
