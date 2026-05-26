import { readFile } from 'node:fs/promises';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { uploadImage } from '@/lib/imgbb/upload';
import {
  classifyTryOnFailure,
  claimNextTryOnJob,
  heartbeatTryOnJob,
  markTryOnJobDone,
  markTryOnJobStage,
  recoverStaleTryOnJobs,
  scheduleTryOnRetryOrFailure,
  getTryOnJobByJobId,
  buildSubmissionTryOnLink,
  upsertSubmissionTryOnLink,
  type WorkerRuntimeConfig,
} from '@/lib/tryon/jobs';
import { ensureTryOnQueueDirectories, getTryOnEnv } from '@/lib/tryon/env';
import { writeTryOnLog } from '@/lib/tryon/logging';
import {
  appendWorkspaceLog,
  archiveTryOnWorkspace,
  stageTryOnJob,
} from '@/lib/tryon/staging';
import { runTryOnProcessor } from '@/lib/tryon/processor';

async function publishResult(localResultPath: string) {
  const buffer = await readFile(localResultPath);
  const base64 = buffer.toString('base64');
  return uploadImage(base64, { name: `tryon-${Date.now()}` });
}

export async function runTryOnWorkerLoop(signal?: AbortSignal): Promise<void> {
  const env = getTryOnEnv();
  await ensureTryOnQueueDirectories(env.queueRoot);

  while (!signal?.aborted) {
    await runTryOnWorkerOnce({
      workerId: env.workerId,
      pollIntervalSeconds: env.pollIntervalSeconds,
      leaseDurationSeconds: env.leaseDurationSeconds,
      maxAttempts: env.maxAttempts,
    });

    await new Promise((resolve) =>
      setTimeout(resolve, env.pollIntervalSeconds * 1000)
    );
  }

  await closeConnection().catch(() => {});
}

export async function runTryOnWorkerOnce(config: WorkerRuntimeConfig): Promise<void> {
  const env = getTryOnEnv();
  const db = await connectToDatabase();
  await recoverStaleTryOnJobs(db);
  const job = await claimNextTryOnJob(db, config.workerId, config.leaseDurationSeconds);

  if (!job) {
    await writeTryOnLog(env.queueRoot, {
      ts: new Date().toISOString(),
      level: 'info',
      workerId: config.workerId,
      message: 'no claimable try-on jobs found',
    });
    return;
  }

  const heartbeat = setInterval(() => {
    void heartbeatTryOnJob(db, job.jobId, config.leaseDurationSeconds);
  }, Math.max(5000, Math.floor(config.leaseDurationSeconds * 1000 * 0.4)));

  try {
    await writeTryOnLog(env.queueRoot, {
      ts: new Date().toISOString(),
      level: 'info',
      workerId: config.workerId,
      jobId: job.jobId,
      stage: 'claimed',
      message: 'claimed try-on job',
    });

    await markTryOnJobStage(db, job.jobId, 'processing', 'downloading_input', {
      'processing.startedAt': new Date().toISOString(),
    });
    const staged = await stageTryOnJob(
      db,
      job,
      env.queueRoot,
      env.suitAssetRoot,
      env.allowedSourceHosts
    );
    await appendWorkspaceLog(staged.logPath, 'staging complete');

    await markTryOnJobStage(db, job.jobId, 'processing', 'running_tryon');
    const execution = await runTryOnProcessor(
      {
        jobId: job.jobId,
        personInputPath: staged.personInputPath,
        suitInputPath: staged.suitInputPath,
        outputPath: staged.resultPath,
        timeoutMs: env.processorTimeoutMs,
      },
      env.processorCommand,
      env.processorArgsTemplate
    );
    await appendWorkspaceLog(staged.logPath, execution.stdout || '');
    if (execution.stderr) {
      await appendWorkspaceLog(staged.logPath, execution.stderr);
    }

    if (!execution.success || !execution.outputPath) {
      throw new Error(execution.errorMessage || 'try-on processor failed');
    }

    await markTryOnJobStage(db, job.jobId, 'uploading_result', 'uploading_result');
    const upload = await publishResult(execution.outputPath);
    await markTryOnJobDone(db, job.jobId, upload.imageUrl, upload.deleteUrl);
    await archiveTryOnWorkspace(env.queueRoot, job.jobId, 'done');

    const freshJob = await getTryOnJobByJobId(db, job.jobId);
    if (freshJob?._id && job.source.submissionId) {
      const submissionObjectId = freshJob.source.submissionId;
      const { ObjectId } = await import('mongodb');
      if (ObjectId.isValid(submissionObjectId)) {
        await upsertSubmissionTryOnLink(
          db,
          new ObjectId(submissionObjectId),
          buildSubmissionTryOnLink(freshJob, 'done', upload.imageUrl)
        );
      }
    }

    await writeTryOnLog(env.queueRoot, {
      ts: new Date().toISOString(),
      level: 'info',
      workerId: config.workerId,
      jobId: job.jobId,
      stage: 'done',
      message: 'try-on job completed',
      meta: { publicResultUrl: upload.imageUrl },
    });
  } catch (error: unknown) {
    const classified = classifyTryOnFailure(error);
    const freshJob = (await getTryOnJobByJobId(db, job.jobId)) ?? job;
    const outcome = await scheduleTryOnRetryOrFailure(
      db,
      freshJob,
      {
        code: classified.code,
        message: classified.message,
        details: classified.details,
      },
      config.maxAttempts
    );
    await archiveTryOnWorkspace(env.queueRoot, job.jobId, 'failed').catch(() => {});
    await writeTryOnLog(env.queueRoot, {
      ts: new Date().toISOString(),
      level: classified.transient ? 'warn' : 'error',
      workerId: config.workerId,
      jobId: job.jobId,
      stage: outcome,
      code: classified.code,
      message: classified.message,
    });
  } finally {
    clearInterval(heartbeat);
  }
}
