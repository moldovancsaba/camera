import type { Db, ObjectId } from 'mongodb';
import { nowIso } from '@/lib/tryon/time';
import {
  COLLECTIONS,
  generateId,
  type GarmentType,
  type TryOnJobResolvedSetup,
  type TryOnSetup,
  type TryOnSetupPreference,
} from '@/lib/db/schemas';

const GARMENT_TYPE_VALUES: GarmentType[] = ['motorsport_suit', 'jersey', 'top', 'bottom'];

export function normalizeDefaultForGarmentTypes(value: unknown): GarmentType[] | null {
  if (!Array.isArray(value)) return null;
  const picked = GARMENT_TYPE_VALUES.filter((t) => value.includes(t));
  return picked.length > 0 ? picked : null;
}

// Lowest rank wins if an operator marks two setups default for the same type.
export async function findDefaultSetupForGarmentType(
  db: Db,
  garmentType: GarmentType | null | undefined
): Promise<TryOnSetup | null> {
  if (!garmentType) return null;
  return db
    .collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS)
    .find({ active: true, defaultForGarmentTypes: garmentType })
    .sort({ rank: 1, setupId: 1 })
    .limit(1)
    .next();
}

export type { TryOnSetup };

const LEGACY_SETUP_ID = 'default_motogp';

export interface SetupResolutionInput {
  requestSetupId?: string | null;
  cameraId?: string | null;
}

function normalizeSetupId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeCameraId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveProfile(config: TryOnSetup['config']): string | null {
  const direct =
    typeof config?.processingProfile === 'string' && config.processingProfile.trim().length > 0
      ? config.processingProfile.trim()
      : '';
  const legacy =
    typeof config?.processing_profile === 'string' && config.processing_profile.trim().length > 0
      ? config.processing_profile.trim()
      : '';
  return direct || legacy || null;
}

function toResolvedSetup(
  setup: TryOnSetup,
  source: TryOnJobResolvedSetup['setupSource']
): TryOnJobResolvedSetup {
  return {
    setupId: setup.setupId,
    setupName: setup.name,
    setupProfile: resolveProfile(setup.config),
    setupSource: source,
  };
}

function legacyFallbackSeedConfig(): Omit<TryOnSetup, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
} {
  const now = nowIso();
  return {
    setupId: LEGACY_SETUP_ID,
    name: 'MotoGP Default',
    description: 'Default high-detail leather route',
    cameraId: null,
    active: true,
    isDefault: true,
    rank: 0,
    config: {
      processing_profile: 'motogp_leather_magic',
      category: 'Upper (T-Shirts, Hoodies)',
      sleeve_length: 'default',
      pant_length: 'default',
      resolution: 'High Quality',
      steps: 60,
      guidance: 4.6,
      show_mask: true,
      mask_sharpness: 12,
      mask_padding: 10,
      detail_boost: 0.15,
    },
    createdAt: now,
    updatedAt: now,
  };
}

async function ensureLegacyFallbackSetup(db: Db): Promise<TryOnSetup> {
  const seed = legacyFallbackSeedConfig();

  await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).updateOne(
    { setupId: seed.setupId },
    {
      $set: {
        name: seed.name,
        description: seed.description,
        cameraId: seed.cameraId,
        active: seed.active,
        isDefault: seed.isDefault,
        rank: seed.rank,
        config: seed.config,
        updatedAt: seed.updatedAt,
      },
      $setOnInsert: {
        setupId: seed.setupId,
        createdAt: seed.createdAt,
      },
    },
    { upsert: true }
  );

  const fallback = await db
    .collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS)
    .findOne({ setupId: seed.setupId });

  if (!fallback) {
    return {
      ...seed,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  return fallback;
}

export async function resolveTryOnSetupForJob(
  db: Db,
  input: SetupResolutionInput
): Promise<TryOnJobResolvedSetup> {
  const requestSetupId = normalizeSetupId(input.requestSetupId);
  if (requestSetupId) {
    const explicit = await db
      .collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS)
      .findOne({ setupId: requestSetupId, active: true });
    if (explicit) {
      return toResolvedSetup(explicit, 'job.assigned');
    }
  }

  const cameraId = normalizeCameraId(input.cameraId);
  if (cameraId) {
    const preference = await db
      .collection<TryOnSetupPreference>(COLLECTIONS.CAMERA_SETUP_PREFERENCES)
      .findOne({ cameraId });

    const prefSetupId = normalizeSetupId(preference?.setupId);
    if (prefSetupId) {
      const preferredSetup = await db
        .collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS)
        .findOne({ setupId: prefSetupId, active: true });
      if (preferredSetup) {
        return toResolvedSetup(preferredSetup, 'camera.last');
      }
    }
  }

  const defaultSetup = await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).findOne(
    {
      active: true,
      isDefault: true,
      $or: [{ cameraId: null }, { cameraId: { $exists: false } }],
    },
    { sort: { rank: 1, createdAt: -1 } }
  );

  if (defaultSetup) {
    return toResolvedSetup(defaultSetup, 'global.default');
  }

  const legacy = await ensureLegacyFallbackSetup(db);

  return {
    setupId: legacy.setupId,
    setupName: legacy.name,
    setupProfile: resolveProfile(legacy.config),
    setupSource: 'legacy',
  };
}

export async function upsertCameraSetupPreference(
  db: Db,
  cameraId: string,
  setupId: string,
  updatedBy?: string | null,
  updatedByEvent?: string | null
): Promise<TryOnSetupPreference> {
  const now = nowIso();
  const normalizedCameraId = normalizeCameraId(cameraId);
  const normalizedSetupId = normalizeSetupId(setupId);

  if (!normalizedCameraId) {
    throw new Error('cameraId is required');
  }
  if (!normalizedSetupId) {
    throw new Error('setupId is required');
  }

  const targetSetup = await db
    .collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS)
    .findOne({ setupId: normalizedSetupId, active: true });
  if (!targetSetup) {
    throw new Error(`setup_not_found:${normalizedSetupId}`);
  }

  await db.collection<TryOnSetupPreference>(COLLECTIONS.CAMERA_SETUP_PREFERENCES).updateOne(
    { cameraId: normalizedCameraId },
    {
      $set: {
        setupId: normalizedSetupId,
        updatedAt: now,
        updatedBy: normalizeCameraId(updatedBy),
        updatedByEvent: normalizeSetupId(updatedByEvent),
      },
    },
    { upsert: true }
  );

  return {
    cameraId: normalizedCameraId,
    setupId: normalizedSetupId,
    updatedAt: now,
    updatedBy: normalizeSetupId(updatedBy),
    updatedByEvent: normalizeSetupId(updatedByEvent),
  };
}

export async function listActiveTryOnSetups(db: Db): Promise<TryOnSetup[]> {
  const setups = await db
    .collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS)
    .find({ active: true })
    .sort({ isDefault: -1, rank: 1, setupId: 1 })
    .toArray();

  const activeSetups = setups.length > 0 ? setups : [await ensureLegacyFallbackSetup(db)];
  return activeSetups.map((s) => ({
    ...s,
    _id: s._id ? (s._id.toString() as unknown as ObjectId) : undefined,
  }));
}

export async function getCameraSetupPreference(
  db: Db,
  cameraId?: string | null
): Promise<TryOnSetupPreference | null> {
  const normalized = normalizeCameraId(cameraId);
  if (!normalized) return null;

  return db
    .collection<TryOnSetupPreference>(COLLECTIONS.CAMERA_SETUP_PREFERENCES)
    .findOne({ cameraId: normalized });
}

function slugifySetupId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

// WHAT: Turns a human title into a unique setupId, appending _2/_3/... on
// collision. WHY: shared by the setups CRUD's create and duplicate routes --
// both need the exact same collision-safe generation, not two copies of it.
export async function buildUniqueSetupId(db: Db, baseName: string): Promise<string> {
  const slug = slugifySetupId(baseName) || generateId().replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  let candidate = slug;
  let suffix = 2;
  while (await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).findOne({ setupId: candidate }, { projection: { _id: 1 } })) {
    candidate = `${slug}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export { LEGACY_SETUP_ID };
