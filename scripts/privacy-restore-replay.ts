#!/usr/bin/env node
/**
 * Replays SSO's erasure feed against an isolated Camera restore deployment.
 * Dry-run is the default. Apply requires an isolated restore readiness proof and
 * two operator confirmations; this command never points at Camera production.
 */
import { validateTombstoneFeed, type BackupErasureTombstone, type RestoreReplayReadiness } from '@/lib/privacy/restore-replay-contract';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const MAX_FEED_PAGES = 20_000;
const MAX_PHOTO_TIMEOUT_MS = 6 * 60 * 60_000;

type JsonRecord = Record<string, unknown>;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_configuration:${name}`);
  return value;
}

function baseUrl(value: string, name: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`invalid_configuration:${name}`); }
  if ((process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) && url.protocol !== 'https:') throw new Error(`https_required:${name}`);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`origin_only_required:${name}`);
  return url;
}

function payload(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_service_response');
  const row = value as JsonRecord;
  if (row.success === false) {
    const code = typeof row.error === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(row.error) ? row.error : 'unspecified';
    throw new Error(`service_error:${code}`);
  }
  return row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as JsonRecord : row;
}

async function requestJson(url: URL, init: RequestInit, operation: string): Promise<JsonRecord> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const raw = await response.text();
      let value: unknown = null;
      try { value = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`${operation}:invalid_json`); }
      if (response.ok) return payload(value);
      if (response.status < 500 && response.status !== 429) throw new Error(`${operation}:http_${response.status}`);
      lastError = new Error(`${operation}:http_${response.status}`);
    } catch (error) {
      if (error instanceof Error && /:http_4\d\d|:invalid_json/.test(error.message)) throw error;
      lastError = error;
    }
    if (attempt + 1 < MAX_RETRIES) await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
  }
  throw lastError instanceof Error ? lastError : new Error(`${operation}:unavailable`);
}

async function getSsoToken(sso: URL, clientId: string, clientSecret: string): Promise<string> {
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'sso:privacy.resolve' });
  const result = await requestJson(new URL('/api/oauth/token', sso), {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form.toString(),
  }, 'sso_token');
  if (typeof result.access_token !== 'string' || !result.access_token || !Number.isFinite(Number(result.expires_in))) throw new Error('sso_token:invalid_response');
  return result.access_token;
}

async function* iterateTombstones(sso: URL, token: string): AsyncGenerator<BackupErasureTombstone> {
  let cursor: string | null = null;
  const cursors = new Set<string>();
  for (let pageNumber = 0; pageNumber < MAX_FEED_PAGES; pageNumber += 1) {
    const url = new URL('/api/internal/privacy/backup-tombstones', sso);
    url.searchParams.set('limit', '250');
    if (cursor) url.searchParams.set('cursor', cursor);
    const result = await requestJson(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } }, 'sso_tombstone_feed');
    const page = validateTombstoneFeed(result);
    for (const tombstone of page.tombstones) yield tombstone;
    if (page.complete) return;
    if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error('sso_tombstone_feed:cursor_did_not_advance');
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error('sso_tombstone_feed:page_limit_exceeded');
}

function parseArgs(args: string[]) {
  const result: { apply: boolean; confirmDb?: string; confirmInstance?: string } = { apply: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--dry-run') result.apply = false;
    else if (args[i] === '--apply') result.apply = true;
    else if (args[i] === '--confirm-db') result.confirmDb = args[++i];
    else if (args[i] === '--confirm-instance') result.confirmInstance = args[++i];
    else throw new Error('unknown_argument');
  }
  return result;
}

async function cameraJson(camera: URL, path: string, init: RequestInit, operation: string): Promise<JsonRecord> {
  return requestJson(new URL(path, camera), init, operation);
}

async function replayPhoto(camera: URL, row: BackupErasureTombstone, resolverSecret: string, cronSecret: string, timeoutMs: number) {
  const eraseBody = {
    request_id: row.requestId,
    photos: [{ photo_id: row.photoId, submission_id: row.submissionId, ...(row.eventIds.length === 1 ? { event_id: row.eventIds[0] } : {}) }],
  };
  const intake = await cameraJson(camera, '/api/internal/privacy/erase', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-camera-privacy-resolver-secret': resolverSecret }, body: JSON.stringify(eraseBody),
  }, 'camera_erasure_intake');
  const photo = Array.isArray(intake.photos) ? intake.photos[0] as JsonRecord | undefined : undefined;
  if (!photo || photo.photo_id !== row.photoId || !['fenced', 'record_erased', 'media_pending', 'media_processing', 'media_erased'].includes(String(photo.status))) {
    throw new Error('camera_erasure_intake:target_unresolved');
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const workerHeaders = { authorization: `Bearer ${cronSecret}` };
    await cameraJson(camera, '/api/internal/privacy/process-erasure', { method: 'POST', headers: workerHeaders }, 'camera_record_worker');
    await cameraJson(camera, '/api/internal/privacy/process-media-erasure', { method: 'GET', headers: workerHeaders }, 'camera_media_worker');
    const status = await cameraJson(camera, '/api/internal/privacy/erasure-status', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-camera-privacy-resolver-secret': resolverSecret },
      body: JSON.stringify({ request_id: row.requestId, photo_ids: [row.photoId] }),
    }, 'camera_erasure_status');
    const current = Array.isArray(status.photos) ? status.photos[0] as JsonRecord | undefined : undefined;
    if (current?.photo_id !== row.photoId) throw new Error('camera_erasure_status:target_unresolved');
    if (current.status === 'media_erased') return;
    if (['media_failed', 'media_review_required', 'failed', 'retryable_failure', 'not_found'].includes(String(current.status))) {
      throw new Error(`camera_erasure_status:blocked_${String(current.status)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('camera_erasure_status:photo_timeout');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sso = baseUrl(required('SSO_BASE_URL'), 'SSO_BASE_URL');
  const camera = baseUrl(required('CAMERA_RESTORE_BASE_URL'), 'CAMERA_RESTORE_BASE_URL');
  const clientId = required('SSO_PRIVACY_RESOLVER_CLIENT_ID');
  const clientSecret = required('SSO_PRIVACY_RESOLVER_CLIENT_SECRET');
  const restoreSecret = required('CAMERA_PRIVACY_RESTORE_SECRET');
  const readiness = await cameraJson(camera, '/api/internal/privacy/restore-replay/readiness', {
    headers: { 'x-camera-privacy-restore-secret': restoreSecret },
  }, 'camera_restore_readiness') as unknown as RestoreReplayReadiness;
  if (readiness.mode !== 'isolated' || !readiness.databaseName || !readiness.instanceId) throw new Error('camera_restore_readiness:invalid_proof');
  if (args.apply && (args.confirmDb !== readiness.databaseName || args.confirmInstance !== readiness.instanceId)) {
    throw new Error('apply_requires_matching_confirm_db_and_confirm_instance');
  }

  const token = await getSsoToken(sso, clientId, clientSecret);
  const counts = { received: 0, replayed: 0, blocked: 0 };
  if (!args.apply) {
    for await (const tombstone of iterateTombstones(sso, token)) counts.received += tombstone.photoId ? 1 : 0;
    process.stdout.write(JSON.stringify({ mode: 'dry_run', isolatedDatabase: readiness.databaseName, restoreInstance: readiness.instanceId, ...counts, writesPerformed: 0, releaseAuthorized: false }) + '\n');
    return;
  }

  const resolverSecret = required('CAMERA_PRIVACY_RESOLVER_SECRET');
  const cronSecret = required('CRON_SECRET');
  const configuredTimeout = Number(process.env.CAMERA_RESTORE_REPLAY_PHOTO_TIMEOUT_SECONDS || 1800);
  if (!Number.isInteger(configuredTimeout) || configuredTimeout < 30 || configuredTimeout > MAX_PHOTO_TIMEOUT_MS / 1000) throw new Error('invalid_configuration:CAMERA_RESTORE_REPLAY_PHOTO_TIMEOUT_SECONDS');
  for await (const tombstone of iterateTombstones(sso, token)) {
    counts.received += 1;
    try {
      await replayPhoto(camera, tombstone, resolverSecret, cronSecret, configuredTimeout * 1000);
      counts.replayed += 1;
    } catch {
      counts.blocked += 1;
      process.stderr.write('A Camera photo replay target is unresolved; keep the restore isolated and inspect the fixed service error in operator logs.\n');
      throw new Error('camera_restore_replay:blocked');
    }
  }
  // This is only the Camera target/media replay. It does not certify Fanmass,
  // Messmass, Atlas backups, report exports, or whole-cluster restoration.
  process.stdout.write(JSON.stringify({ mode: 'camera_replay_complete', isolatedDatabase: readiness.databaseName, restoreInstance: readiness.instanceId, ...counts, releaseAuthorized: false, remainingGates: ['fanmass_replay_and_verification', 'messmass_replay_and_projection_rebuild', 'backup_manifest_and_integrity_verification', 'operator_release_authorization'] }) + '\n');
}

main().catch((error) => {
  const code = error instanceof Error ? error.message.replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 120) : 'unknown_error';
  process.stderr.write(`Privacy restore replay stopped: ${code}\n`);
  process.exitCode = 1;
});
