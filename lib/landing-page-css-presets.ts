import type { Db } from 'mongodb';
import { COLLECTIONS, generateId, generateTimestamp, type LandingPageCssPreset } from '@/lib/db/schemas';
import { DEFAULT_LANDING_PAGE_STYLE_PRESETS } from '@/lib/landing-page-style-presets';

export interface LandingPageCssPresetOption {
  presetId: string;
  name: string;
  className: string;
  css: string;
  isSystem: boolean;
}

function toOption(doc: LandingPageCssPreset): LandingPageCssPresetOption {
  return {
    presetId: doc.presetId,
    name: doc.name,
    className: doc.className,
    css: doc.css,
    isSystem: doc.isSystem,
  };
}

export async function ensureDefaultLandingPageCssPresets(db: Db): Promise<void> {
  const collection = db.collection<LandingPageCssPreset>(COLLECTIONS.LANDING_PAGE_CSS_PRESETS);
  for (const preset of DEFAULT_LANDING_PAGE_STYLE_PRESETS) {
    const now = generateTimestamp();
    await collection.updateOne(
      { presetId: preset.id },
      {
        $setOnInsert: {
          presetId: preset.id,
          createdAt: now,
        },
        $set: {
          name: preset.name,
          className: preset.className,
          css: preset.css,
          isSystem: true,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }
}

export async function listLandingPageCssPresets(db: Db): Promise<LandingPageCssPresetOption[]> {
  await ensureDefaultLandingPageCssPresets(db);
  const presets = await db
    .collection<LandingPageCssPreset>(COLLECTIONS.LANDING_PAGE_CSS_PRESETS)
    .find({})
    .sort({ isSystem: -1, name: 1, createdAt: -1 })
    .toArray();
  return presets.map(toOption);
}

export async function upsertLandingPageCssPreset(
  db: Db,
  input: {
    presetId?: string | null;
    name?: string | null;
    className: string;
    css: string;
    createdBy?: string | null;
  }
): Promise<LandingPageCssPresetOption> {
  await ensureDefaultLandingPageCssPresets(db);
  const collection = db.collection<LandingPageCssPreset>(COLLECTIONS.LANDING_PAGE_CSS_PRESETS);
  const now = generateTimestamp();
  const name = input.name?.trim() || input.className.trim();
  const className = input.className.trim();
  const css = input.css.trim();

  const existingById = input.presetId
    ? await collection.findOne({ presetId: input.presetId })
    : null;
  const existingByClassName = await collection.findOne({ className });

  let existing: LandingPageCssPreset | null = null;

  if (existingById) {
    if (existingById.className === className) {
      existing = existingById;
    } else if (
      existingByClassName &&
      existingByClassName.presetId !== existingById.presetId
    ) {
      existing = existingByClassName;
    }
  } else if (existingByClassName) {
    existing = existingByClassName;
  }

  if (!existing) {
    existing = {
      presetId: generateId(),
      name,
      className,
      css,
      isSystem: false,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await collection.insertOne(existing);
    return toOption(existing);
  }

  await collection.updateOne(
    { presetId: existing.presetId },
    {
      $set: {
        name,
        className,
        css,
        updatedAt: now,
      },
    }
  );

  return {
    presetId: existing.presetId,
    name,
    className,
    css,
    isSystem: existing.isSystem,
  };
}
