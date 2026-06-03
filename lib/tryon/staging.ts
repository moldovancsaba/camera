import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db, WithId } from 'mongodb';
import { COLLECTIONS, type LeatherSuit, type TryOnJob } from '@/lib/db/schemas';
import { nowIso } from '@/lib/tryon/time';
import { getLeatherSuitProcessingUrl } from '@/lib/tryon/suits';

export interface StagedTryOnJob {
  workspaceRoot: string;
  personInputPath: string;
  suitInputPath: string;
  resultPath: string;
  logPath: string;
  metadataPath: string;
}

export function assertAllowedSourceHost(imageUrl: string, allowlist: string[]): void {
  const hostname = new URL(imageUrl).hostname.toLowerCase();
  if (!allowlist.includes(hostname)) {
    throw new Error(`source_host_not_allowlisted:${hostname}`);
  }
}

export async function resolveLocalSuitAsset(
  db: Db,
  leatherSuitId: string,
  suitAssetRoot: string
): Promise<{ suit: LeatherSuit; resolvedPath: string }> {
  const suit = await db
    .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
    .findOne({ leatherSuitId, active: true });
  if (!suit) {
    throw new Error(`missing suit:${leatherSuitId}`);
  }
  if (!suitAssetRoot.trim()) {
    throw new Error('missing TRYON_SUIT_ASSET_ROOT');
  }

  const candidates = [
    suit.assetRelativePath ? path.join(suitAssetRoot, suit.assetRelativePath) : '',
    path.join(suitAssetRoot, suit.assetKey),
    path.join(suitAssetRoot, `${suit.assetKey}.png`),
    path.join(suitAssetRoot, `${suit.assetKey}.jpg`),
    path.join(suitAssetRoot, `${suit.assetKey}.jpeg`),
    path.join(suitAssetRoot, `${suit.assetKey}.webp`),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return { suit, resolvedPath: candidate };
    } catch {
      // Continue trying the next candidate.
    }
  }

  throw new Error(`missing suit asset:${leatherSuitId}`);
}

export async function stageSuitAsset(
  db: Db,
  leatherSuitId: string,
  destinationPath: string,
  allowlist: string[],
  suitAssetRoot: string
): Promise<{ suit: LeatherSuit; resolvedSource: string }> {
  const suit = await db
    .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
    .findOne({ leatherSuitId, active: true });
  if (!suit) {
    throw new Error(`missing suit:${leatherSuitId}`);
  }

  const processingUrl = getLeatherSuitProcessingUrl(suit);
  if (processingUrl) {
    await downloadSourceImage(processingUrl, destinationPath, allowlist);
    return { suit, resolvedSource: processingUrl };
  }

  const { resolvedPath } = await resolveLocalSuitAsset(db, leatherSuitId, suitAssetRoot);
  await copyFile(resolvedPath, destinationPath);
  return { suit, resolvedSource: resolvedPath };
}

export async function downloadSourceImage(
  imageUrl: string,
  destinationPath: string,
  allowlist: string[],
  maxBytes = 25 * 1024 * 1024
): Promise<void> {
  assertAllowedSourceHost(imageUrl, allowlist);
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`source download failed:${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new Error(`oversized source image:${bytes.byteLength}`);
  }

  await writeFile(destinationPath, bytes);
}

export async function stageTryOnJob(
  db: Db,
  job: WithId<TryOnJob>,
  queueRoot: string,
  suitAssetRoot: string,
  allowlist: string[]
): Promise<StagedTryOnJob> {
  const workspaceRoot = path.join(queueRoot, 'processing', job.jobId);
  await mkdir(workspaceRoot, { recursive: true });

  const personInputPath = path.join(workspaceRoot, 'person_input.jpg');
  const suitInputPath = path.join(workspaceRoot, 'suit_input.png');
  const resultPath = path.join(workspaceRoot, 'result.png');
  const logPath = path.join(workspaceRoot, 'log.txt');
  const metadataPath = path.join(workspaceRoot, 'metadata.json');

  await downloadSourceImage(job.source.imageUrl, personInputPath, allowlist);
  const { resolvedSource } = await stageSuitAsset(
    db,
    job.request.leatherSuitId,
    suitInputPath,
    allowlist,
    suitAssetRoot
  );

  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        jobId: job.jobId,
        submissionId: job.source.submissionId,
        leatherSuitId: job.request.leatherSuitId,
        workerId: job.processing.workerId,
        workspacePath: workspaceRoot,
        sourceImageUrl: job.source.imageUrl,
        resolvedSuitAssetPath: resolvedSource,
        resolvedSetup: job.processing.resolvedSetup
          ? {
              setupId: job.processing.resolvedSetup.setupId,
              setupName: job.processing.resolvedSetup.setupName,
              setupProfile: job.processing.resolvedSetup.setupProfile,
              setupSource: job.processing.resolvedSetup.setupSource,
            }
          : null,
        createdAt: nowIso(),
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    workspaceRoot,
    personInputPath,
    suitInputPath,
    resultPath,
    logPath,
    metadataPath,
  };
}

export async function archiveTryOnWorkspace(
  queueRoot: string,
  jobId: string,
  target: 'done' | 'failed'
): Promise<string> {
  const from = path.join(queueRoot, 'processing', jobId);
  const to = path.join(queueRoot, target, jobId);
  await mkdir(path.dirname(to), { recursive: true });
  await rename(from, to);
  return to;
}

export async function appendWorkspaceLog(logPath: string, line: string): Promise<void> {
  const previous = await readFile(logPath, 'utf8').catch(() => '');
  await writeFile(logPath, `${previous}${line}\n`, 'utf8');
}
