import { closeConnection } from '@/lib/db/mongodb';
import { runTryOnWorkerLoop, runTryOnWorkerOnce } from '@/lib/tryon/worker';
import { getTryOnEnv } from '@/lib/tryon/env';
import { loadEnvFromFiles } from './load-env-from-files';

async function main() {
  loadEnvFromFiles();

  const env = getTryOnEnv();
  const runOnce = process.argv.includes('--once');

  if (runOnce) {
    await runTryOnWorkerOnce({
      workerId: env.workerId,
      pollIntervalSeconds: env.pollIntervalSeconds,
      leaseDurationSeconds: env.leaseDurationSeconds,
      maxAttempts: env.maxAttempts,
    });
    await closeConnection().catch(() => {});
    return;
  }

  const controller = new AbortController();
  const shutdown = () => controller.abort();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await runTryOnWorkerLoop(controller.signal);
}

main().catch((error: unknown) => {
  console.error('Try-on worker failed to start', error);
  process.exitCode = 1;
});
