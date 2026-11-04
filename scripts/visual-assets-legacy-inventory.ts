#!/usr/bin/env node
/**
 * Read-only inventory for issue 753. This command intentionally does not load
 * .env files and has no apply mode; use a dedicated read-only connection supplied
 * by the operator. It emits IDs and hashes only, never stored media addresses.
 */
import { MongoClient, type Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { KIND_META, LIBRARY_KINDS } from '@/lib/library/kinds';
import { buildLegacyInventory, type LegacyInventoryAsset, type LegacyInventoryInput } from '@/lib/visual-assets/legacy-normalization';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_configuration:${name}`);
  return value;
}

function args(): { outputPath?: string } {
  const values = process.argv.slice(2);
  const output = values.find((value) => value.startsWith('--output='))?.slice('--output='.length);
  const unexpected = values.filter((value) => value !== '--dry-run' && !value.startsWith('--output='));
  if (unexpected.length) throw new Error('unsupported_argument');
  if (output?.trim() && !output.trim().endsWith('.json')) throw new Error('output_must_be_json');
  return output?.trim() ? { outputPath: output.trim() } : {};
}

const MAX_INVENTORY_DOCUMENTS = 50_000;
const MAX_PROJECTED_BYTES = 64 * 1024 * 1024;
const MAX_RUNTIME_MS = 4 * 60 * 1_000;

interface ReadBudget {
  documents: number;
  projectedBytes: number;
  startedAt: number;
}

async function rows(
  db: ReturnType<MongoClient['db']>,
  collection: string,
  projection: Document,
  session: ReturnType<MongoClient['startSession']>,
  budget: ReadBudget,
): Promise<Document[]> {
  const cursor = db.collection(collection)
    .find({}, { projection, session })
    .sort({ _id: 1 })
    .batchSize(250)
    .maxTimeMS(30_000)
    .limit(MAX_INVENTORY_DOCUMENTS + 1);
  const docs: Document[] = [];
  try {
    for await (const doc of cursor) {
      if (Date.now() - budget.startedAt > MAX_RUNTIME_MS) throw new Error('inventory_time_limit_exceeded');
      const bytes = Buffer.byteLength(JSON.stringify(doc));
      budget.documents += 1;
      budget.projectedBytes += bytes;
      if (budget.documents > MAX_INVENTORY_DOCUMENTS || budget.projectedBytes > MAX_PROJECTED_BYTES) {
        throw new Error('inventory_limit_exceeded');
      }
      docs.push(doc);
    }
    return docs;
  } finally {
    await cursor.close();
  }
}

function pictureRefs(source: string, ownerId: string, value: unknown, field = ''): Array<{ source: string; ownerId: string; field: string; address: string }> {
  if (typeof value === 'string') {
    const leaf = field.split('.').at(-1)?.replace(/\[\d+\]$/, '') ?? field;
    const visualField = /(?:image|picture|photo|logo|frame|background|overlay|screen|thumbnail|icon).*(?:url|src)$/i.test(leaf)
      || (/^(url|src)$/i.test(leaf) && /(?:image|picture|photo|logo|frame|background|overlay|screen|thumbnail|icon)/i.test(field))
      || /(^|\.)pictures\./i.test(field);
    if (visualField && /^https:\/\//i.test(value)) {
      return [{ source, ownerId, field, address: value }];
    }
    return [];
  }
  if (Array.isArray(value)) return value.flatMap((child, index) => pictureRefs(source, ownerId, child, `${field}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Document).flatMap(([key, child]) => pictureRefs(source, ownerId, child, field ? `${field}.${key}` : key));
}

async function main(): Promise<void> {
  // This command does not use MONGODB_URI or MONGODB_DB and never loads local env
  // files, preventing an accidental connection through the app's normal config.
  const uri = required('CAMERA_VISUAL_ASSET_MIGRATION_READONLY_URI');
  const dbName = required('CAMERA_VISUAL_ASSET_MIGRATION_DB');
  const options = args();
  const client = new MongoClient(uri, {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 30_000,
    maxPoolSize: 2,
    retryReads: true,
    retryWrites: false,
  });

  try {
    await client.connect();
    const session = client.startSession({ snapshot: true });
    try {
      const db = client.db(dbName);
      const budget: ReadBudget = { documents: 0, projectedBytes: 0, startedAt: Date.now() };
      const assetRows: LegacyInventoryAsset[][] = [];
      for (const kind of LIBRARY_KINDS) {
        const idField = KIND_META[kind].idField;
        const docs = await rows(db, KIND_META[kind].collection, {
          [idField]: 1, scope: 1, partnerId: 1, eventId: 1, isActive: 1, shareToChildren: 1, imageUrl: 1, thumbnailUrl: 1,
        }, session, budget);
        assetRows.push(docs.map((doc) => ({ ...doc, kind, id: typeof doc[idField] === 'string' ? doc[idField] as string : '' })));
      }
      // A snapshot session must be used serially. These projections include only
      // asset, hierarchy and template fields; contact and participant data is not read.
      const partners = await rows(db, COLLECTIONS.PARTNERS, {
        partnerId: 1, library: 1, defaultFrames: 1, defaultLogos: 1, visualAssetPolicy: 1,
        defaultExperienceTemplateId: 1, slots: 1, pictures: 1, logoUrl: 1, contentDefaults: 1,
      }, session, budget);
      const events = await rows(db, COLLECTIONS.EVENTS, {
        eventId: 1, partnerId: 1, frames: 1, logos: 1, visualAssetPolicy: 1, experienceTemplate: 1,
        slots: 1, logoUrl: 1, emailFooterImageUrl: 1, customPages: 1, frameDesign: 1,
        welcomeScreenComposition: 1, welcomeScreen: 1, slotSnapshots: 1, frameSelection: 1, frameSelectionTiles: 1,
      }, session, budget);
      const templates = await rows(db, COLLECTIONS.EXPERIENCE_TEMPLATES, { templateId: 1, level: 1, ownerId: 1, config: 1 }, session, budget);
      const slideshows = await rows(db, COLLECTIONS.SLIDESHOWS, {
        slideshowId: 1, eventId: 1, backgroundImageUrl: 1, screenDesign: 1, inheritanceBaseline: 1,
      }, session, budget);
      const landingPages = await rows(db, COLLECTIONS.LANDING_PAGES, {
        landingPageId: 1, eventId: 1, logoId: 1, logoUrl: 1, qrCodeImageUrl: 1, targetType: 1, targetId: 1,
      }, session, budget);
      const layouts = await rows(db, COLLECTIONS.SLIDESHOW_LAYOUTS, { layoutId: 1, eventId: 1, areas: 1 }, session, budget);
      const settings = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne(
        { settingId: 'default-experience-template' },
        { projection: { templateId: 1 }, session, maxTimeMS: 30_000 },
      );
      if (Date.now() - budget.startedAt > MAX_RUNTIME_MS) throw new Error('inventory_time_limit_exceeded');
      const directPictureRefs = [
        ...partners.flatMap((row) => pictureRefs('partners', String(row.partnerId ?? 'unknown-partner'), {
          pictures: row.pictures,
          logoUrl: row.logoUrl,
          contentDefaults: row.contentDefaults,
        })),
        ...events.flatMap((row) => pictureRefs('events', String(row.eventId ?? 'unknown-event'), {
          logoUrl: row.logoUrl,
          emailFooterImageUrl: row.emailFooterImageUrl,
          customPages: row.customPages,
          frameDesign: row.frameDesign,
          welcomeScreenComposition: row.welcomeScreenComposition,
          welcomeScreen: row.welcomeScreen,
          slotSnapshots: row.slotSnapshots,
          frameSelection: row.frameSelection,
          frameSelectionTiles: row.frameSelectionTiles,
        })),
        ...templates.flatMap((row) => pictureRefs('experience_templates', String(row.templateId ?? 'unknown-template'), row.config)),
        ...slideshows.flatMap((row) => pictureRefs('slideshows', String(row.slideshowId ?? 'unknown-slideshow'), row)),
        ...landingPages.flatMap((row) => pictureRefs('landing_pages', String(row.landingPageId ?? 'unknown-landing-page'), row)),
        ...layouts.flatMap((row) => pictureRefs('slideshow_layouts', String(row.layoutId ?? 'unknown-layout'), row)),
      ];
      const nestedReferenceSources = [
        ...partners.map((row) => ({ source: 'partners.contentDefaults', ownerId: String(row.partnerId ?? 'unknown-partner'), value: row.contentDefaults })),
        ...events.flatMap((row) => ['customPages', 'frameDesign', 'welcomeScreenComposition', 'frameSelection', 'frameSelectionTiles'].map((field) => ({ source: `events.${field}`, ownerId: String(row.eventId ?? 'unknown-event'), value: row[field] }))),
        ...templates.map((row) => ({ source: 'experience_templates.config', ownerId: String(row.templateId ?? 'unknown-template'), value: row.config })),
        ...slideshows.map((row) => ({ source: 'slideshows', ownerId: String(row.slideshowId ?? 'unknown-slideshow'), value: row })),
        ...landingPages.map((row) => ({ source: 'landing_pages', ownerId: String(row.landingPageId ?? 'unknown-landing-page'), value: row })),
        ...layouts.map((row) => ({ source: 'slideshow_layouts', ownerId: String(row.layoutId ?? 'unknown-layout'), value: row })),
      ];
      const input: LegacyInventoryInput = {
        assets: assetRows.flat(),
        partners,
        events,
        templates,
        globalDefaultTemplateId: typeof settings?.templateId === 'string' ? settings.templateId : null,
        directPictureRefs,
        nestedReferenceSources,
      };
      const report = buildLegacyInventory(input);
      const output = JSON.stringify({
        database: dbName,
        mode: 'read-only-dry-run',
        readBound: { documents: budget.documents, projectedBytes: budget.projectedBytes, elapsedMs: Date.now() - budget.startedAt },
        ...report,
      }, null, 2);
      if (options.outputPath) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(options.outputPath, `${output}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      }
      process.stdout.write(`${output}\n`);
      if (report.unresolved.length > 0) process.exitCode = 2;
    } finally {
      await session.endSession();
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error && /^[a-z0-9:_-]+$/i.test(error.message) ? error.message : 'inventory_failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
