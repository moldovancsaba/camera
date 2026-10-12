'use client';

/**
 * Image safety (issue 509, lib/storage/image-safety.ts; global admins): which pictures exist in only one place, and a bounded, stoppable run that makes the missing copy.
 *
 * **Count (dry run)** reads the database and writes nothing: where every framed picture is held (only on ImgBB, only in our store, both), where the private unframed crops are (our store only, ImgBB only = final,
 * both), which crops stay in our store because their ImgBB copy could not be verified, and which copies were not made or could not be verified. **Check the addresses** is also read only: it asks each address a one-byte question and lists the ones that did not answer; it marks nothing. Each **copy** button
 * (only after a count) asks again in the page, with the number, and only then works, a few photos per call, one kind at a time; it can be stopped. It adds files and records and changes no picture address;
 * the one thing it deletes is a private unframed crop in our store, and only after its ImgBB copy is verified (owner decision "variant B"); a copy that fails is listed with its reason, and running it again
 * does only what is still missing. The work is GET and POST /api/admin/image-safety.
 */

import { useRef, useState } from 'react';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import { Button, Group } from '@/components/gds/PublicPrimitives';
import type { ImageSafetyPlan, ProbeBatch, RunBatch, SafetyKind } from '@/lib/storage/image-safety';

const URL_SAFETY = '/api/admin/image-safety';

async function call<T>(query = '', init?: RequestInit): Promise<T> {
  const response = await fetch(URL_SAFETY + query, init);
  const body = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || !body?.data) throw new Error(typeof body?.error === 'string' && body.error ? body.error : `The request did not work (HTTP ${response.status})`);
  return body.data;
}

const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;
// A button label that is longer than a phone is wide wraps instead of pushing the card wider (CLAUDE.md section 5).
const wrapLabel = { root: { height: 'auto', minHeight: 36, paddingBlock: 6, whiteSpace: 'normal' }, label: { overflow: 'visible', textAlign: 'center', whiteSpace: 'normal' } } as const;
const num = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

interface KindText {
  title: string;
  /** What it does, in one sentence. */
  help: string;
  button: (n: number) => string;
  confirmTitle: (n: number) => string;
  confirm: string;
}

const KINDS: Record<SafetyKind, KindText> = {
  rescue: {
    title: 'Pictures only on ImgBB',
    help: 'ImgBB may remove a file at any time without notice. This copies each such picture into our own store (the same file), so it exists in two places.',
    button: (n) => `Copy ${plural(n, 'picture')} to our store`,
    confirmTitle: (n) => `Copy ${plural(n, 'picture')} from ImgBB into our store?`,
    confirm: 'This writes to the live service: it downloads each picture from ImgBB and stores a copy of the same file in our store under rescue/. The address a photo shows from is not changed and nothing is deleted.',
  },
  mirror: {
    title: 'Pictures only in our store',
    help: 'This sends a copy of each such picture to ImgBB and checks that the copy is there, so it exists in two places.',
    button: (n) => `Copy ${plural(n, 'picture')} to ImgBB`,
    confirmTitle: (n) => `Copy ${plural(n, 'picture')} to ImgBB?`,
    confirm: 'This writes to the live service: it uploads the framed picture of each photo to ImgBB (a public image host) and records the copy. Pictures that have an old ImgBB copy with no known address get a new one, so the copy can be checked. The address a photo shows from is not changed and nothing is deleted.',
  },
  unframed: {
    title: 'Unframed photos still in our store',
    help: 'The photo as the user saved it, before the frame, is kept in a private file in our store until ImgBB holds a verified copy. This sends the copy to ImgBB, checks it, and only then deletes the private file from our store (ImgBB is the final place of unframed photos).',
    button: (n) => `Copy ${plural(n, 'unframed photo')} to ImgBB`,
    confirmTitle: (n) => `Copy ${plural(n, 'unframed photo')} to ImgBB and delete the private file from our store?`,
    confirm: 'This writes to the live service: it uploads the unframed photo of each approved photo to ImgBB (a public image host; the rule is to keep it 90 days after the event and delete it on request, which is not automatic yet), reads the copy back, and only when the copy is verified deletes the private file from our store. If the copy cannot be verified the private file stays. Photos that are waiting or rejected are not touched. Nothing else is deleted.',
  },
};
const ORDER: SafetyKind[] = ['rescue', 'mirror', 'unframed'];

interface ProbeTotals {
  processed: number;
  addresses: number;
  ok: number;
  gone: number;
  unknown: number;
  goneList: ProbeBatch['goneList'];
  finished: boolean;
}

interface RunTotals {
  kind: SafetyKind;
  processed: number;
  copied: number;
  deleted: number;
  failed: number;
  bytes: number;
  failures: RunBatch['failures'];
  finished: boolean;
}

const FAILURES_SHOWN = 30;
/** The first call of a run is the server's small default (so a stop after it is a quick look); the later ones are the largest the server allows. */
const LATER_BATCH = 12;

export default function ImageSafetyCard() {
  const [plan, setPlan] = useState<ImageSafetyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'count' | 'probe' | SafetyKind | null>(null);
  const [confirming, setConfirming] = useState<SafetyKind | null>(null);
  const [probe, setProbe] = useState<ProbeTotals | null>(null);
  const [run, setRun] = useState<RunTotals | null>(null);
  const stop = useRef(false);

  const count = async () => {
    setBusy('count');
    setError(null);
    setConfirming(null);
    try {
      setPlan(await call<ImageSafetyPlan>());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    stop.current = false;
    setBusy('probe');
    setError(null);
    setConfirming(null);
    let totals: ProbeTotals = { processed: 0, addresses: 0, ok: 0, gone: 0, unknown: 0, goneList: [], finished: false };
    setProbe(totals);
    let after: string | null = null;
    try {
      do {
        const batch: ProbeBatch = await call<ProbeBatch>(`?probe=1${after ? `&after=${after}` : ''}`);
        totals = {
          processed: totals.processed + batch.processed,
          addresses: totals.addresses + batch.addresses,
          ok: totals.ok + batch.ok,
          gone: totals.gone + batch.gone,
          unknown: totals.unknown + batch.unknown,
          goneList: [...totals.goneList, ...batch.goneList].slice(0, FAILURES_SHOWN),
          finished: batch.next === null,
        };
        setProbe(totals);
        after = batch.next;
      } while (after && !stop.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const start = async (kind: SafetyKind) => {
    stop.current = false;
    setBusy(kind);
    setError(null);
    setConfirming(null);
    let totals: RunTotals = { kind, processed: 0, copied: 0, deleted: 0, failed: 0, bytes: 0, failures: [], finished: false };
    setRun(totals);
    let after: string | null = null;
    try {
      do {
        const batch: RunBatch = await call<RunBatch>('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true, kind, after: after ?? undefined, limit: after ? LATER_BATCH : undefined }) });
        totals = {
          kind,
          processed: totals.processed + batch.processed,
          copied: totals.copied + batch.counts.copied,
          deleted: totals.deleted + batch.counts.deleted,
          failed: totals.failed + batch.counts.failed,
          bytes: totals.bytes + batch.bytes,
          failures: [...totals.failures, ...batch.failures].slice(0, FAILURES_SHOWN),
          finished: batch.next === null,
        };
        setRun(totals);
        after = batch.next;
      } while (after && !stop.current);
      // The count is read again, so what was made is gone from it.
      setPlan(await call<ImageSafetyPlan>());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const covered = plan ? plan.composed.both : 0;
  return (
    <section aria-labelledby="image-safety-title" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', marginBottom: '1rem', gridTemplateColumns: 'minmax(0, 1fr)', padding: '1rem 1.5rem' }} data-image-safety>
      <div>
        <h3 id="image-safety-title" style={{ margin: 0 }}>
          Image safety
        </h3>
        <p style={{ ...muted, margin: '0.25rem 0 0' }}>
          A picture should exist in two places, so losing one host does not lose the photo. This shows which pictures exist in only one, and makes the missing copy. Counting and checking only read. Making copies adds files and records and
          changes no picture address; the only thing it ever deletes is a private unframed photo in our store, and only after ImgBB holds a verified copy of it. It can be stopped and repeated, and a repeat does only what is still missing.
        </p>
      </div>
      {error ? <InlineAlert title="Not done" message={error} severity="error" /> : null}
      <Group gap="xs" wrap="wrap">
        <Button type="button" styles={wrapLabel} variant="light" loading={busy === 'count'} disabled={busy !== null} onClick={() => void count()}>
          Count the copies (dry run)
        </Button>
        <Button type="button" styles={wrapLabel} variant="light" loading={busy === 'probe'} disabled={busy !== null} onClick={() => void check()}>
          Check the addresses (reads only)
        </Button>
        {busy === 'probe' ? (
          <Button type="button" styles={wrapLabel} variant="light" onClick={() => (stop.current = true)}>
            Stop after this batch
          </Button>
        ) : null}
      </Group>

      {plan ? (
        <div style={{ display: 'grid', gap: '0.5rem' }} data-safety-plan>
          <span>
            {plural(plan.pictures, 'photo')} {plan.pictures === 1 ? 'has' : 'have'} a framed picture; {num(covered)} {covered === 1 ? 'is' : 'are'} held in two places.
          </span>
          <dl style={{ display: 'grid', gap: '0.25rem 1rem', gridTemplateColumns: 'minmax(0, 1fr) auto', margin: 0 }}>
            <Row label="Only on ImgBB" value={plan.composed.imgbbOnly} />
            <Row label="Only in our store" value={plan.composed.blobOnly} note={plan.composed.blobOnlyOldMirror > 0 ? `${num(plan.composed.blobOnlyOldMirror)} of them have an old ImgBB copy whose address was not kept` : undefined} />
            <Row label="On ImgBB and in our store" value={plan.composed.both} />
            <Row label="On another host" value={plan.composed.other} />
            <Row label="Unframed photos in our store only" value={plan.unframed.blobOnly} note="approved; the copy to ImgBB is still to do" />
            <Row label="Unframed photos on ImgBB only (final)" value={plan.unframed.imgbbOnly} note="the private file was deleted after the ImgBB copy was verified" />
            <Row label="Unframed photos in our store and on ImgBB" value={plan.unframed.both} note="the private file is still to be deleted" />
            <Row label="Unframed photos, waiting or rejected" value={plan.unframed.waiting + plan.unframed.rejected} note="kept in our store; copied when they are approved" />
            <Row
              label="Unframed photos kept in our store because their ImgBB copy could not be verified"
              value={plan.unframed.keptUnverified}
              note={plan.unframed.keptUnverified > 0 ? 'nothing was deleted; our store keeps growing until this is solved (ImgBB may have changed the file)' : undefined}
            />
            <Row label="Copies that were not made" value={plan.copies.notMade} note={plan.copies.notMade + plan.copies.couldNotVerify > 0 ? `${plural(plan.copies.photosWithAProblem, 'photo')} with a copy that was not made or could not be verified` : undefined} />
            <Row label="Copies that could not be verified" value={plan.copies.couldNotVerify} note="the file was written, but reading it back did not confirm it" />
            <Row label="Stored try-on results (kept as they are)" value={plan.tryOnResults} />
          </dl>
        </div>
      ) : null}

      {plan ? (
        <div style={{ display: 'grid', gap: '0.75rem' }} data-safety-actions>
          {ORDER.map((kind) => {
            const n = plan.toDo[kind];
            const text = KINDS[kind];
            return (
              <div key={kind} style={{ borderTop: '1px solid var(--mantine-color-default-border)', display: 'grid', gap: '0.5rem', paddingTop: '0.75rem' }}>
                <strong>
                  {text.title}: {num(n)}
                </strong>
                <span style={muted}>{text.help}</span>
                <Group gap="xs" wrap="wrap">
                  <Button type="button" styles={wrapLabel} disabled={busy !== null || n === 0 || confirming === kind} onClick={() => setConfirming(kind)}>
                    {n === 0 ? 'Nothing to copy' : text.button(n)}
                  </Button>
                  {busy === kind ? (
                    <Button type="button" styles={wrapLabel} variant="light" onClick={() => (stop.current = true)}>
                      Stop after this batch
                    </Button>
                  ) : null}
                </Group>
                {confirming === kind ? (
                  <>
                    <InlineAlert title={text.confirmTitle(n)} message={`${text.confirm} A few photos are handled per call, you can stop at any time, and you can run it again safely.`} severity="warning" />
                    <Group gap="xs" wrap="wrap">
                      <Button type="button" styles={wrapLabel} color="red" loading={busy === kind} disabled={busy !== null} onClick={() => void start(kind)}>
                        Yes, copy them
                      </Button>
                      <Button type="button" styles={wrapLabel} variant="light" disabled={busy !== null} onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </Group>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {run ? (
        <div style={{ display: 'grid', gap: '0.5rem' }} data-safety-run>
          <span style={{ fontSize: '0.875rem' }}>
            {busy === run.kind ? 'Working: ' : run.finished ? 'Done: ' : 'Stopped: '}
            {plural(run.processed, 'photo')} handled, {num(run.copied)} copied{run.bytes > 0 ? ` (${mb(run.bytes)})` : ''}, {num(run.failed)} not made{run.kind === 'unframed' ? `; ${num(run.deleted)} private ${run.deleted === 1 ? 'file' : 'files'} deleted from our store after the ImgBB copy was verified` : ''}.
          </span>
          {run.failures.length > 0 ? (
            <ul style={{ fontSize: '0.8125rem', margin: 0, paddingLeft: '1.25rem' }}>
              {run.failures.map((failure) => (
                <li key={failure.id} style={{ overflowWrap: 'anywhere' }}>
                  Photo {failure.id}: {failure.reason.replace(/\.$/, '')}.{failure.url ? ` ${failure.url}` : ''} It is still to do; count again to see it in the list.
                </li>
              ))}
              {run.failed > run.failures.length ? <li>and {num(run.failed - run.failures.length)} more.</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      {probe ? (
        <div style={{ display: 'grid', gap: '0.5rem' }} data-safety-probe>
          <span style={{ fontSize: '0.875rem' }}>
            {busy === 'probe' ? 'Checking: ' : probe.finished ? 'Done: ' : 'Stopped: '}
            {plural(probe.processed, 'photo')}, {plural(probe.addresses, 'address', 'addresses')} asked: {num(probe.ok)} answered, {num(probe.gone)} gone, {num(probe.unknown)} could not be told (left as they are).
          </span>
          {probe.goneList.length > 0 ? (
            <ul style={{ fontSize: '0.8125rem', margin: 0, paddingLeft: '1.25rem' }}>
              {probe.goneList.map((item, index) => (
                <li key={`${item.id}-${index}`} style={{ overflowWrap: 'anywhere' }}>
                  Photo {item.id}, {item.what}
                  {item.store !== 'other' ? ` on ${item.store === 'blob' ? 'our store' : 'ImgBB'}` : ''}: {item.reason}.{item.url ? ` ${item.url}` : ''}
                </li>
              ))}
              {probe.gone > probe.goneList.length ? <li>and {num(probe.gone - probe.goneList.length)} more.</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <>
      <dt style={{ margin: 0 }}>
        {label}
        {note ? <span style={{ ...muted, display: 'block' }}>{note}</span> : null}
      </dt>
      <dd style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, margin: 0, textAlign: 'right' }}>{num(value)}</dd>
    </>
  );
}
