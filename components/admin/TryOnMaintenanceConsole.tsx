'use client';

import { useEffect, useState } from 'react';
import { Button, Paper, Stack, Text, TextInput } from '@/components/gds/PublicPrimitives';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { StatusBadge, useGdsConfirm, useGdsToasts } from '@sovereignsquad/gds-core/client';
import { FormSection } from '@sovereignsquad/gds-admin/client';
import { getStatusBadgeProps, type CameraStatusTone } from '@/lib/gds/presentation';

interface WorkerHealthResponse {
  worker: {
    state: 'online' | 'offline' | 'stale' | 'idle' | 'unknown';
    workerId: string | null;
    activeJobId: string | null;
    activeStage: string | null;
    lastHeartbeatAt: string | null;
    activeJobCount: number;
    staleJobCount: number;
  };
  runningJobs: Array<{ jobId: string; status: string; stage: string; workerId: string | null; lastHeartbeatAt: string | null; updatedAt: string }>;
}

interface AuditResponse {
  garmentCatalogCount: number;
  unknownGarments: { resultSubmissions: Array<{ _id: string | null; count: number }>; jobs: Array<{ _id: string | null; count: number }> };
  identity: { placeholderTotal: number; sourceRecoverable: number; unrecoverable: number; reviewedUnrecoverable: number; unreviewedActionable: number };
  moderationArchive: { supersededMissingReason: number };
  publicationLinks: { doneJobsMissingResultSubmission: number; samples: Array<{ jobId: string; createdAt: string; updatedAt: string }> };
  moderation: { inconsistentCount: number };
}

interface ReconcileResponse {
  dryRun: boolean;
  scanned: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  failed?: number;
  jobs: Array<{ jobId: string; action?: string; resultSubmissionId?: string | null; sourceSubmissionId?: string | null; error?: string }>;
}

const WORKER_STATE_TONE: Record<WorkerHealthResponse['worker']['state'], CameraStatusTone> = {
  online: 'active',
  idle: 'info',
  stale: 'warning',
  offline: 'danger',
  unknown: 'inactive',
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

export default function TryOnMaintenanceConsole() {
  const { notifySuccess, notifyError } = useGdsToasts();
  const { confirmDestructive } = useGdsConfirm();

  const [worker, setWorker] = useState<WorkerHealthResponse | null>(null);
  const [workerLoading, setWorkerLoading] = useState(true);
  const [workerError, setWorkerError] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [reconcileLimit, setReconcileLimit] = useState('10');
  const [reconcile, setReconcile] = useState<ReconcileResponse | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkerHealth();
  }, []);

  async function loadWorkerHealth() {
    setWorkerLoading(true);
    setWorkerError(null);
    try {
      const response = await fetch('/api/admin/tryon-worker-health', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load worker health');
      setWorker(payload.data);
    } catch (error) {
      setWorkerError(getErrorMessage(error));
    } finally {
      setWorkerLoading(false);
    }
  }

  async function runAudit() {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const response = await fetch('/api/admin/tryon-maintenance/audit', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to run audit');
      setAudit(payload.data);
    } catch (error) {
      setAuditError(getErrorMessage(error));
      notifyError({ title: 'Audit failed', message: getErrorMessage(error) });
    } finally {
      setAuditLoading(false);
    }
  }

  async function runReconcile(dryRun: boolean) {
    const limit = Math.max(1, Math.min(50, Number.parseInt(reconcileLimit, 10) || 10));
    if (!dryRun) {
      const confirmed = await confirmDestructive({
        title: 'Apply reconciliation',
        message: `This writes real changes to up to ${limit} "done" try-on jobs that are missing a result submission -- it creates or repairs publication records. Preview with dry run first if you haven't.`,
        targetName: `${limit} job${limit === 1 ? '' : 's'}`,
      });
      if (!confirmed) return;
    }

    setReconcileLoading(true);
    setReconcileError(null);
    try {
      const response = await fetch('/api/admin/tryon-maintenance/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, limit }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to run reconciliation');
      setReconcile(payload.data);
      if (!dryRun) {
        notifySuccess({ title: 'Reconciliation applied', message: `${payload.data.created ?? 0} created, ${payload.data.updated ?? 0} updated, ${payload.data.failed ?? 0} failed.` });
      }
    } catch (error) {
      setReconcileError(getErrorMessage(error));
      notifyError({ title: 'Reconciliation failed', message: getErrorMessage(error) });
    } finally {
      setReconcileLoading(false);
    }
  }

  return (
    <Stack gap="xl">
      <FormSection title="Worker health" description="Live status of the local try-on worker -- computed the same way as the dashboard's Worker tile, with more detail.">
        {workerLoading ? (
          <Text size="sm" c="dimmed">Loading…</Text>
        ) : workerError ? (
          <Text size="sm" c="red">{workerError}</Text>
        ) : worker ? (
          <Stack gap="sm">
            <StatusBadge {...getStatusBadgeProps(WORKER_STATE_TONE[worker.worker.state], worker.worker.state)} />
            <Text size="sm" c="dimmed">
              {worker.worker.activeJobCount} active job{worker.worker.activeJobCount === 1 ? '' : 's'}
              {worker.worker.staleJobCount > 0 ? `, ${worker.worker.staleJobCount} stale` : ''}
              {worker.worker.lastHeartbeatAt ? ` · last heartbeat ${new Date(worker.worker.lastHeartbeatAt).toLocaleString()}` : ' · no heartbeat recorded'}
            </Text>
            {worker.runningJobs.length > 0 ? (
              <Stack gap={4}>
                {worker.runningJobs.map((job) => (
                  <Paper key={job.jobId} p="xs" withBorder>
                    <Text size="xs" fw={700}>{job.jobId}</Text>
                    <Text size="xs" c="dimmed">
                      {job.status} / {job.stage} · worker {job.workerId ?? 'unclaimed'}
                      {job.lastHeartbeatAt ? ` · heartbeat ${new Date(job.lastHeartbeatAt).toLocaleTimeString()}` : ''}
                    </Text>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed">No jobs currently claimed by a worker.</Text>
            )}
          </Stack>
        ) : null}
        <SemanticButton action="tryon-maintenance:refresh-worker" variant="secondary" size="xs" loading={workerLoading} onClick={() => void loadWorkerHealth()}>
          Refresh
        </SemanticButton>
      </FormSection>

      <FormSection title="Data integrity audit" description="Read-only checks: garment references, guest-identity gaps, archive/moderation consistency. Mirrors scripts/audit-tryon-data-integrity.ts.">
        <SemanticButton action="tryon-maintenance:run-audit" loading={auditLoading} onClick={() => void runAudit()}>
          {audit ? 'Re-run Audit' : 'Run Audit'}
        </SemanticButton>
        {auditError ? <Text size="sm" c="red">{auditError}</Text> : null}
        {audit ? (
          <Stack gap="xs">
            <Text size="sm">Garment catalog: {audit.garmentCatalogCount} active garments</Text>
            <Text size="sm" c={audit.unknownGarments.resultSubmissions.length || audit.unknownGarments.jobs.length ? 'orange' : 'dimmed'}>
              Unknown garment references: {audit.unknownGarments.resultSubmissions.length} in results, {audit.unknownGarments.jobs.length} in jobs
            </Text>
            <Text size="sm" c={audit.identity.unreviewedActionable > 0 ? 'orange' : 'dimmed'}>
              Guest-identity gaps: {audit.identity.placeholderTotal} total, {audit.identity.sourceRecoverable} recoverable from source,
              {' '}{audit.identity.unreviewedActionable} unreviewed and actionable
            </Text>
            <Text size="sm" c={audit.moderationArchive.supersededMissingReason > 0 ? 'orange' : 'dimmed'}>
              Superseded results missing an archive reason: {audit.moderationArchive.supersededMissingReason}
            </Text>
            <Text size="sm" c={audit.publicationLinks.doneJobsMissingResultSubmission > 0 ? 'orange' : 'dimmed'}>
              Done jobs with no result submission: {audit.publicationLinks.doneJobsMissingResultSubmission}
              {audit.publicationLinks.doneJobsMissingResultSubmission > 0 ? ' -- see Reconcile below' : ''}
            </Text>
            <Text size="sm" c={audit.moderation.inconsistentCount > 0 ? 'orange' : 'dimmed'}>
              Inconsistent moderation state: {audit.moderation.inconsistentCount}
            </Text>
          </Stack>
        ) : null}
      </FormSection>

      <FormSection title="Reconcile done jobs" description="Backfills the publication record for 'done' jobs missing one. Always preview with dry run first. Mirrors scripts/reconcile-tryon-done-jobs.ts, capped to a small batch per run.">
        <TextInput
          label="Batch size (max 50)"
          value={reconcileLimit}
          onChange={(event) => setReconcileLimit(event.currentTarget.value)}
          inputMode="numeric"
          style={{ maxWidth: 160 }}
        />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="light" loading={reconcileLoading} onClick={() => void runReconcile(true)}>
            Dry Run (Preview)
          </Button>
          <SemanticButton action="tryon-maintenance:reconcile-apply" variant="danger" loading={reconcileLoading} onClick={() => void runReconcile(false)}>
            Apply Changes
          </SemanticButton>
        </div>
        {reconcileError ? <Text size="sm" c="red">{reconcileError}</Text> : null}
        {reconcile ? (
          <Stack gap="xs">
            <Text size="sm" fw={700}>
              {reconcile.dryRun ? `Preview: ${reconcile.scanned} job(s) in scope` : `Applied: ${reconcile.created ?? 0} created, ${reconcile.updated ?? 0} updated, ${reconcile.unchanged ?? 0} unchanged, ${reconcile.failed ?? 0} failed`}
            </Text>
            <Stack gap={4}>
              {reconcile.jobs.map((job) => (
                <Paper key={job.jobId} p="xs" withBorder>
                  <Text size="xs" fw={700}>{job.jobId}</Text>
                  <Text size="xs" c={job.error ? 'red' : 'dimmed'}>
                    {job.error ?? job.action ?? (reconcile.dryRun ? `source ${job.sourceSubmissionId ?? 'unknown'}` : '')}
                  </Text>
                </Paper>
              ))}
            </Stack>
          </Stack>
        ) : null}
      </FormSection>
    </Stack>
  );
}
