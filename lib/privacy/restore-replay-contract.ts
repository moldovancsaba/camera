export interface RestoreReplayReadiness {
  mode: 'isolated';
  databaseName: string;
  instanceId: string;
}

export interface BackupErasureTombstone {
  requestId: string;
  photoId: string;
  submissionId: string;
  eventIds: string[];
  partnerId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_ID = /^[0-9a-f]{24}$/i;
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
type RestoreReadinessEnvironment = Record<string, string | undefined>;

/** A deployment self-identifies as an isolated restore only when every guard agrees. */
export function buildRestoreReplayReadiness(env: RestoreReadinessEnvironment = process.env): RestoreReplayReadiness | null {
  const databaseName = env.MONGODB_DB?.trim() || '';
  const declaredDatabase = env.CAMERA_PRIVACY_RESTORE_DATABASE_NAME?.trim() || '';
  const instanceId = env.CAMERA_PRIVACY_RESTORE_INSTANCE_ID?.trim() || '';
  if (env.VERCEL_ENV !== 'preview' || env.CAMERA_PRIVACY_RESTORE_MODE !== 'isolated') return null;
  if (!databaseName || databaseName !== declaredDatabase || !/restore|recovery/i.test(databaseName)) return null;
  if (!INSTANCE_ID.test(instanceId)) return null;
  return { mode: 'isolated', databaseName, instanceId };
}

/** Validate the public shape before a restore runner submits anything to Camera. */
export function parseBackupErasureTombstone(value: unknown): BackupErasureTombstone {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_tombstone');
  const row = value as Record<string, unknown>;
  const allowed = new Set(['requestId', 'photoId', 'submissionId', 'eventIds', 'partnerId', 'createdAt', 'expiresAt', 'retentionDays', 'contractVersion']);
  const requestId = typeof row.requestId === 'string' ? row.requestId : '';
  const photoId = typeof row.photoId === 'string' ? row.photoId : '';
  if (Object.keys(row).some((key) => !allowed.has(key)) ||
      !UUID.test(requestId) ||
      !PHOTO_ID.test(photoId) ||
      typeof row.submissionId !== 'string' || !row.submissionId.trim() || row.submissionId.length > 128 ||
      !Array.isArray(row.eventIds) || row.eventIds.length > 100 ||
      row.eventIds.some((eventId) => typeof eventId !== 'string' || !eventId.trim() || eventId.length > 128) ||
      !(row.partnerId === null || (typeof row.partnerId === 'string' && row.partnerId.trim() && row.partnerId.length <= 128)) ||
      (row.createdAt !== undefined && (typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)))) ||
      (row.expiresAt !== undefined && (typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt)))) ||
      (row.retentionDays !== undefined && !(row.retentionDays === null || (Number.isInteger(row.retentionDays) && (row.retentionDays as number) >= 1 && (row.retentionDays as number) <= 3650))) ||
      (row.contractVersion !== undefined && row.contractVersion !== 'privacy.erasure.tombstone.v1')) {
    throw new Error('invalid_tombstone');
  }
  return {
    requestId: requestId.toLowerCase(),
    photoId: photoId.toLowerCase(),
    submissionId: row.submissionId.trim(),
    eventIds: [...new Set(row.eventIds.map((eventId) => (eventId as string).trim()))].sort(),
    partnerId: row.partnerId?.trim() || null,
  };
}

export function validateTombstoneFeed(value: unknown): { tombstones: BackupErasureTombstone[]; complete: boolean; nextCursor: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_tombstone_feed');
  const feed = value as Record<string, unknown>;
  const policy = feed.retentionPolicy && typeof feed.retentionPolicy === 'object' && !Array.isArray(feed.retentionPolicy)
    ? feed.retentionPolicy as Record<string, unknown>
    : null;
  if (feed.version !== 1 || !policy || policy.configured !== true || !Number.isInteger(policy.days) || (policy.days as number) < 1 || (policy.days as number) > 3650) {
    throw new Error('backup_retention_policy_unconfigured');
  }
  if (!Array.isArray(feed.tombstones) || typeof feed.complete !== 'boolean' ||
      !(feed.nextCursor === null || (typeof feed.nextCursor === 'string' && feed.nextCursor.length > 0 && feed.nextCursor.length <= 1024)) ||
      (feed.complete && feed.nextCursor !== null) || (!feed.complete && typeof feed.nextCursor !== 'string')) {
    throw new Error('invalid_tombstone_feed');
  }
  return {
    tombstones: feed.tombstones.map(parseBackupErasureTombstone),
    complete: feed.complete,
    nextCursor: feed.nextCursor,
  };
}
