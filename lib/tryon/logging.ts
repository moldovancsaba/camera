import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface TryOnLogEvent {
  ts: string;
  level: 'info' | 'warn' | 'error';
  workerId: string;
  jobId?: string;
  stage?: string;
  code?: string;
  message: string;
  meta?: Record<string, unknown>;
}

export async function writeTryOnLog(
  queueRoot: string,
  event: TryOnLogEvent
): Promise<void> {
  const line = `${JSON.stringify(event)}\n`;
  await mkdir(path.join(queueRoot, 'logs'), { recursive: true });
  await appendFile(path.join(queueRoot, 'logs', `${event.workerId}.log`), line, 'utf8');
}
