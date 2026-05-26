import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface TryOnEnv {
  queueRoot: string;
  workerId: string;
  pollIntervalSeconds: number;
  leaseDurationSeconds: number;
  maxAttempts: number;
  allowedSourceHosts: string[];
  processorCommand: string;
  processorArgsTemplate: string[];
  processorTimeoutMs: number;
  suitAssetRoot: string;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseStringList(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) return fallback;
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getTryOnEnv(): TryOnEnv {
  const processorCommand = process.env.TRYON_PROCESSOR_COMMAND?.trim() || '';
  const rawArgsTemplate = process.env.TRYON_PROCESSOR_ARGS_TEMPLATE?.trim();
  let processorArgsTemplate = [
    '--person',
    '{person_input}',
    '--suit',
    '{suit_input}',
    '--output',
    '{output_path}',
  ];

  if (rawArgsTemplate) {
    const parsed = JSON.parse(rawArgsTemplate);
    if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
      processorArgsTemplate = parsed;
    }
  }

  return {
    queueRoot: process.env.TRYON_QUEUE_ROOT?.trim() || '/Users/Shared/Projects/try-on/queue',
    workerId: process.env.TRYON_WORKER_ID?.trim() || 'camera-tryon-worker-01',
    pollIntervalSeconds: parsePositiveInt(process.env.TRYON_POLL_INTERVAL_SECONDS, 20),
    leaseDurationSeconds: parsePositiveInt(process.env.TRYON_LEASE_DURATION_SECONDS, 600),
    maxAttempts: parsePositiveInt(process.env.TRYON_MAX_ATTEMPTS, 3),
    allowedSourceHosts: parseStringList(process.env.TRYON_ALLOWED_SOURCE_HOSTS, ['i.ibb.co']),
    processorCommand,
    processorArgsTemplate,
    processorTimeoutMs: parsePositiveInt(process.env.TRYON_PROCESSOR_TIMEOUT_MS, 300000),
    suitAssetRoot: process.env.TRYON_SUIT_ASSET_ROOT?.trim() || '',
  };
}

export async function ensureTryOnQueueDirectories(queueRoot: string): Promise<void> {
  for (const dir of ['incoming', 'processing', 'done', 'failed', 'logs']) {
    await mkdir(path.join(queueRoot, dir), { recursive: true });
  }
}
