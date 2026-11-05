import assert from 'node:assert/strict';
import test from 'node:test';
import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  applyExperienceConfig,
  hasLegacyLocalJourney,
  journeyConfigFromStoredTemplate,
  journeyTemplateForAdmin,
  makePartnerJourneyConfig,
  makeGlobalJourneyConfig,
  parseExperienceTemplateConfig,
  parseExperienceTemplateSelection,
  resolveEventExperienceConfig,
  validateTemplateAssetScope,
  type ExperienceTemplateConfig,
} from './templates';

const hex = (digits: string) => `#${digits}`; // Keep fixture colours assembled so GDS can detect accidental production literals.

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
  assert.equal(parseExperienceTemplateConfig({ customPages: [] }).ok, true);
  assert.equal(parseExperienceTemplateConfig({ visualSettings: { buttonSize: 'large' } }).ok, false);
  assert.equal(parseExperienceTemplateConfig({ frameSelection: { frameId: 'frame' } }).ok, false);
  assert.equal(parseExperienceTemplateConfig({ submissions: [] }).ok, false);
  assert.equal(parseExperienceTemplateConfig({ customPages: [{ userEmail: 'private@example.test' }] }).ok, false);
  assert.equal(parseExperienceTemplateConfig({ customPages: [{ config: { consentReceipt: { accepted: true } } }] }).ok, false);
});

test('legacy templates are projected to the flow-only contract instead of breaking inheritance', () => {
  const projected = journeyConfigFromStoredTemplate({
    customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: '' } }],
    sharePage: { title: 'Share' },
    visualSettings: { buttonColor: hex('123456') },
    frameSelection: { frameId: 'legacy-frame' },
  });
  assert.deepEqual(projected, {
    customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: '' } }],
    sharePage: { title: 'Share' },
  });
  assert.equal(journeyConfigFromStoredTemplate({ customPages: [{ userEmail: 'private@example.test' }] }), null);
});

test('template selection allows inheritance or one named local journey only', () => {
  assert.deepEqual(parseExperienceTemplateSelection({ mode: 'inherit' }), { ok: true, value: { mode: 'inherit' } });
  assert.deepEqual(parseExperienceTemplateSelection({ mode: 'template', templateId: 'event-journey' }), { ok: true, value: { mode: 'template', templateId: 'event-journey' } });
  assert.equal(parseExperienceTemplateSelection({ mode: 'template', templateId: null }).ok, false);
  assert.equal(parseExperienceTemplateSelection({ mode: 'inherit', templateId: 'unexpected' }).ok, false);
  assert.equal(parseExperienceTemplateSelection({ mode: 'inherit', overrides: { sharePage: { title: 'Overlay' } } }).ok, false);
});

test('exactly one selected partner journey replaces the global journey and preserves event-owned presentation', async () => {
  const partnerFlow = [{ pageId: 'partner-welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: 'Partner' } }];
  const db = database({
    globalDefault: 'global-default',
    templates: [
      template('global-default', 'global', null, { visualSettings: { buttonSize: 'large' }, customPages: [{ pageId: 'global-welcome' }], sharePage: { title: 'Global' } }),
      template('partner-default', 'partner', 'partner-1', { visualSettings: { buttonSize: 'small' }, customPages: partnerFlow, sharePage: { title: 'Partner' } }),
    ],
  });
  const event = {
    eventId: 'event-1',
    experienceTemplate: { mode: 'inherit' as const },
    customPages: [{ pageId: 'stale-event-copy' }],
    visualSettings: { buttonSize: 'event-owned' },
    frameSelection: { frameId: 'event-frame' },
  };
  const resolved = await resolveEventExperienceConfig(db, event, { partnerId: 'partner-1', defaultExperienceTemplateId: 'partner-default' });
  assert.deepEqual(resolved, { config: { customPages: partnerFlow, sharePage: { title: 'Partner' } }, templateId: 'partner-default' });
  const applied = applyExperienceConfig(event, resolved);
  assert.deepEqual(applied.customPages, partnerFlow);
  assert.deepEqual((applied as Record<string, unknown>).sharePage, { title: 'Partner' });
  assert.deepEqual(applied.visualSettings, { buttonSize: 'event-owned' });
  assert.deepEqual(applied.frameSelection, { frameId: 'event-frame' });
  assert.equal(applied.effectiveExperienceTemplateId, 'partner-default');
});

test('new partners and events inherit the required global journey by default', async () => {
  const db = database({
    globalDefault: 'global-default',
    templates: [template('global-default', 'global', null, {
      customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: '', buttonText: '' } }],
      frameMessageSelectionDisplay: 'messages-only',
    })],
  });
  const resolved = await resolveEventExperienceConfig(
    db,
    { eventId: 'new-event', experienceTemplate: { mode: 'inherit' }, customPages: [] },
    { partnerId: 'new-partner' },
  );

  assert.deepEqual(resolved, {
    config: {
      customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: '', buttonText: '', screenImageAlt: '' } }],
      frameMessageSelectionDisplay: 'messages-only',
    },
    templateId: 'global-default',
  });
});

test('a partner without its own selection inherits global, and event inherit follows that single parent selection', async () => {
  const db = database({ globalDefault: 'global-default', templates: [template('global-default', 'global', null, { sharePage: { title: 'Parent' } })] });
  const event = { eventId: 'event-1', experienceTemplate: { mode: 'inherit' } };
  assert.deepEqual(await resolveEventExperienceConfig(db, event, { partnerId: 'partner-1', defaultExperienceTemplateId: null }), { config: { frameMessageSelectionDisplay: 'messages-only' }, templateId: 'global-default' });
  const local = applyExperienceConfig({ sharePage: { title: 'Locally stored' } }, null);
  assert.deepEqual(local.sharePage, { title: 'Locally stored' });
});

test('legacy event pages stay local until inheritance is explicitly selected or converted', async () => {
  const legacyPages = [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: 'Legacy' } }];
  const db = database({ globalDefault: 'global-default', templates: [template('global-default', 'global', null, { sharePage: { title: 'Parent' } })] });
  assert.equal(hasLegacyLocalJourney({ customPages: legacyPages }), true);
  assert.equal(hasLegacyLocalJourney({ customPages: legacyPages, experienceTemplate: { mode: 'inherit' } }), false);
  assert.equal(await resolveEventExperienceConfig(db, { eventId: 'event-1', customPages: legacyPages }, null), null);
  assert.deepEqual(await resolveEventExperienceConfig(db, { eventId: 'event-1', customPages: legacyPages, experienceTemplate: { mode: 'inherit' } }, null), { config: { frameMessageSelectionDisplay: 'messages-only' }, templateId: 'global-default' });
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
  assert.deepEqual(stale, { config: { frameMessageSelectionDisplay: 'messages-only' }, templateId: 'global-default' });
});

test('global journey keeps the accepted flow but removes source-client wording, links and artwork', () => {
  const config = makeGlobalJourneyConfig({
    customPages: [
      { pageId: 'welcome-source', pageType: 'welcome', order: -3, isActive: true, config: { title: 'MTK x Vasas', description: '', buttonText: 'CSATLAKOZOM', screenImageAlt: 'MTK stadium', screenImageUrl: 'https://client.test/mtk.png', welcomeElements: [{ type: 'text', text: 'MTK Budapest' }] } },
      { pageId: 'consent-source', pageType: 'accept', order: -2, isActive: true, config: { title: 'Client consent', description: '', buttonText: 'Continue', checkboxText: 'Client policy' } },
      { pageId: 'identity-source', pageType: 'who-are-you', order: -1, isActive: true, config: { title: 'Client identity', description: '', buttonText: 'Continue' } },
      { pageId: 'camera-source', pageType: 'take-photo', order: 0, isActive: true, config: { title: 'MTK camera', description: 'MTK copy', buttonText: 'Shoot', cameraPromptTitle: 'MTK prompt', showSharePage: false, allowPan: false } },
      { pageId: 'cta-source', pageType: 'cta', order: 2, isActive: true, config: { title: 'Shop MTK', description: 'Buy here', buttonText: 'Shop', checkboxText: 'https://client.test/shop', visitButtonText: 'Open shop', pictureLink: true } },
    ],
    sharePage: { title: 'MTK sharing' },
    frameMessageSelectionDisplay: 'show',
    defaultPageOrders: { 'default-welcome': -4, 'source-page-id': -2, 'default-identity': 1 },
  });

  for (const presentationField of ['visualSettings', 'frameSelection', 'welcomeScreenComposition', 'frameSelectionTiles']) {
    assert.equal(presentationField in config, false);
  }
  assert.equal('sharePage' in config, false);
  assert.equal(config.frameMessageSelectionDisplay, 'messages-only');
  assert.deepEqual(config.defaultPageOrders, { 'default-welcome': -4, 'default-identity': 1 });

  const pages = config.customPages as Array<{ pageId: string; pageType: string; config: Record<string, unknown> }>;
  assert.deepEqual(pages.map((page) => page.pageType), ['welcome', 'take-photo', 'cta']);
  assert.equal(pages[0].config.title, '');
  assert.equal(pages[0].config.buttonText, '');
  assert.equal(pages[0].config.screenImageAlt, '');
  assert.equal(pages[0].config.welcomeElements, undefined);
  assert.equal(pages[1].config.cameraPromptTitle, '');
  assert.equal(pages[1].config.showSharePage, false);
  assert.equal(pages[1].config.allowPan, false);
  assert.equal(pages[2].config.title, '');
  assert.equal(pages[2].config.checkboxText, '');
  assert.equal(pages[2].config.visitButtonText, '');
  assert.equal(pages[2].config.hasButton, true);
  assert.equal(pages[2].config.pictureLink, false);
});

test('a Partner Journey keeps the reusable flow but leaves consent and identity to each destination event', () => {
  const source = {
    customPages: [
      { pageId: 'welcome', pageType: 'welcome', order: -2, isActive: true, config: { title: 'Welcome' } },
      { pageId: 'identity', pageType: 'who-are-you', order: -1, isActive: true, config: { title: 'Source identity form' } },
      { pageId: 'consent', pageType: 'accept', order: -1, isActive: true, config: { title: 'Source consent wording' } },
      { pageId: 'capture', pageType: 'take-photo', order: 0, isActive: true, config: { title: 'Capture' } },
    ],
    defaultPageOrders: { 'default-welcome': -2, 'default-consent': -1, 'default-identity': -1 },
  };
  const config = makePartnerJourneyConfig(source);
  assert.deepEqual((config.customPages as Array<{ pageType: string }>).map((page) => page.pageType), ['welcome', 'take-photo']);
  assert.deepEqual(config.defaultPageOrders, source.defaultPageOrders);

  const legacyPartnerTemplate = journeyTemplateForAdmin({ level: 'partner', config: source });
  assert.deepEqual((legacyPartnerTemplate?.config.customPages as Array<{ pageType: string }>).map((page) => page.pageType), ['welcome', 'take-photo']);
  const globalTemplate = journeyTemplateForAdmin({ level: 'global', config: source });
  assert.deepEqual((globalTemplate?.config.customPages as Array<{ pageType: string }>).map((page) => page.pageType), ['welcome', 'take-photo']);
  const eventTemplate = journeyTemplateForAdmin({ level: 'event', config: source });
  assert.deepEqual((eventTemplate?.config.customPages as Array<{ pageType: string }>).map((page) => page.pageType), ['welcome', 'who-are-you', 'accept', 'take-photo']);
});

test('applying a journey ignores presentation fields and replaces only the selected flow', () => {
  const event = {
    visualSettings: { buttonSize: 'small', buttonColor: hex('abcdef') },
    welcomeScreenComposition: { elements: [{ id: 'event-image' }] },
    frameSelection: { layout: { pick: 'event-frame' } },
    defaultPageOrders: { 'default-welcome': 1 },
  };
  const legacyConfig = {
    customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { title: '', buttonText: '' } }],
    visualSettings: { buttonSize: 'large', buttonTextColor: hex('ffffff') },
    sharePage: { title: 'Selected journey' },
    defaultPageOrders: { 'default-welcome': -1, 'default-identity': 2 },
  };
  const applied = applyExperienceConfig(event, {
    templateId: 'global-default',
    config: legacyConfig as ExperienceTemplateConfig,
  });

  assert.deepEqual(applied.visualSettings, { buttonSize: 'small', buttonColor: hex('abcdef') });
  assert.deepEqual(applied.welcomeScreenComposition, { elements: [{ id: 'event-image' }] });
  assert.deepEqual(applied.frameSelection, { layout: { pick: 'event-frame' } });
  assert.deepEqual(applied.defaultPageOrders, { 'default-welcome': -1, 'default-identity': 2 });
  assert.deepEqual((applied as Record<string, unknown>).sharePage, { title: 'Selected journey' });
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

  const assetConfig = (url: string): ExperienceTemplateConfig => ({ customPages: [{ pageId: 'welcome', config: { screenImageUrl: url } }] });
  assert.deepEqual(await validateTemplateAssetScope(db, 'global', assetConfig('https://cdn.example.test/shared.png'), event, null), { ok: true });
  assert.equal((await validateTemplateAssetScope(db, 'global', assetConfig('https://cdn.example.test/private.png'), event, null)).ok, false);
  assert.deepEqual(await validateTemplateAssetScope(db, 'global', assetConfig('https://external.example.test/art.png'), event, null), { ok: true });
});

test('partner and event presets cannot save assets blocked from their descendants', async () => {
  const image = { frameId: 'shared-frame', scope: 'global', isActive: true, shareToChildren: true, imageUrl: 'https://cdn.example.test/shared.png' };
  const partner = {
    partnerId: 'partner-1',
    visualAssetPolicy: { inheritanceVersion: 2, hidden: [], blockedForChildren: [{ kind: 'frames', id: 'shared-frame' }] },
  };
  const db = scopedDatabase({ assets: { [COLLECTIONS.FRAMES]: [image] }, partner });
  const config: ExperienceTemplateConfig = { customPages: [{ pageId: 'welcome', config: { screenImageUrl: image.imageUrl } }] };
  const event = {
    eventId: 'event-1',
    partnerId: 'partner-1',
    frames: [{ frameId: 'shared-frame' }],
    visualAssetPolicy: { inheritanceVersion: 2, hidden: [] },
  };

  assert.equal((await validateTemplateAssetScope(db, 'partner', config, event, partner)).ok, false);
  assert.equal((await validateTemplateAssetScope(db, 'event', config, event, partner)).ok, false);
});
