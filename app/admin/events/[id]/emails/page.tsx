'use client';

/**
 * The e-mails of an event (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E3; owner, 2026-10-09): the five e-mails a user can get, each with its switch, subject and message in the toolbar editor with
 * the preview beside it, the sender and the terms link, the older try-on e-mails for an event that uses try-on, and the legal part of the event (own, or following its partner and the general one).
 * Nothing is stored that is the default: a switch that was never touched and a text that is the default follow the default.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GdsStack, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import { Button, Checkbox, Group, TextInput } from '@/components/gds/PublicPrimitives';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import EmailPreview from '@/components/admin/kit/EmailPreview';
import EmailTextEditor from '@/components/admin/kit/EmailTextEditor';
import LegalPartEditor, { useLegalLevel } from '@/components/admin/kit/LegalPartEditor';
import type { EventEmailsView } from '@/lib/email/event-emails';
import type { LegalByLanguage } from '@/lib/email/legal-rules';

interface Payload<T> {
  data?: T;
  error?: string;
}

/** What the editor has on screen for one e-mail: the switch, and the subject and message (the effective text: the event's own, else the default). */
interface Draft {
  enabled: boolean;
  /** The editor touched the switch, or it was stored before: it is a choice and is stored. */
  chose: boolean;
  subject: string;
  body: string;
}

const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;
const card = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '1rem', padding: '1.25rem 1.5rem' } as const;

const draftOf = (row: { enabled: boolean; chosen: boolean | null; defaultOn?: boolean; subject: string | null; body: string | null; defaultSubject: string; defaultBody: string }, defaultOn: boolean): Draft => ({
  enabled: row.enabled,
  // An e-mail that is off or on against its default was chosen before (the old switches), so it stays a choice when saved.
  chose: row.chosen !== null || row.enabled !== defaultOn,
  subject: row.subject ?? row.defaultSubject,
  body: row.body ?? row.defaultBody,
});

export default function EventEmailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const url = `/api/admin/events/${id}/emails`;
  const [view, setView] = useState<EventEmailsView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [tryOnDrafts, setTryOnDrafts] = useState<Record<'related' | 'resubmission', Draft> | null>(null);
  const [sender, setSender] = useState('');
  const [terms, setTerms] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const legal = useLegalLevel<{ legal: LegalByLanguage; language: string; inherited: { global: LegalByLanguage; partner: LegalByLanguage } }>(`/api/events/${id}/email-legal`);

  const adopt = useCallback((next: EventEmailsView) => {
    setView(next);
    setDrafts(Object.fromEntries(next.types.map((row) => [row.type, draftOf(row, row.defaultOn)])));
    setTryOnDrafts(next.tryOn ? { related: draftOf({ ...next.tryOn.related, chosen: null }, false), resubmission: draftOf({ ...next.tryOn.resubmission, chosen: null }, false) } : null);
    setSender(next.senderName ?? '');
    setTerms(next.termsUrl ?? '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(url);
        const payload = (await response.json().catch(() => null)) as Payload<EventEmailsView> | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
        if (!cancelled) adopt(payload.data);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'The e-mails could not be loaded');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, adopt]);

  /** What differs from what is stored: nothing to save when nothing was touched. */
  const dirty = useMemo(() => {
    if (!view) return false;
    const typeDirty = view.types.some((row) => {
      const draft = drafts[row.type];
      const before = draftOf(row, row.defaultOn);
      return draft && (draft.enabled !== before.enabled || draft.subject !== before.subject || draft.body !== before.body || draft.chose !== before.chose);
    });
    const tryDirty = Boolean(
      view.tryOn &&
        tryOnDrafts &&
        (['related', 'resubmission'] as const).some((mode) => {
          const before = draftOf({ ...view.tryOn![mode], chosen: null }, false);
          const draft = tryOnDrafts[mode];
          return draft.enabled !== before.enabled || draft.subject !== before.subject || draft.body !== before.body;
        })
    );
    return typeDirty || tryDirty || sender.trim() !== (view.senderName ?? '') || terms.trim() !== (view.termsUrl ?? '');
  }, [view, drafts, tryOnDrafts, sender, terms]);

  const save = async () => {
    if (!view) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const types = Object.fromEntries(
        view.types.map((row) => {
          const draft = drafts[row.type];
          return [
            row.type,
            {
              ...(draft.chose ? { enabled: draft.enabled } : {}),
              ...(draft.subject.trim() && draft.subject.trim() !== row.defaultSubject ? { subject: draft.subject } : {}),
              ...(draft.body.trim() && draft.body.trim() !== row.defaultBody.trim() ? { body: draft.body } : {}),
            },
          ];
        })
      );
      const tryOn = view.tryOn && tryOnDrafts
        ? Object.fromEntries(
            (['related', 'resubmission'] as const).map((mode) => [
              mode,
              {
                enabled: tryOnDrafts[mode].enabled,
                subject: tryOnDrafts[mode].subject.trim() && tryOnDrafts[mode].subject.trim() !== view.tryOn![mode].defaultSubject ? tryOnDrafts[mode].subject : null,
                body: tryOnDrafts[mode].body.trim() && tryOnDrafts[mode].body.trim() !== view.tryOn![mode].defaultBody.trim() ? tryOnDrafts[mode].body : null,
              },
            ])
          )
        : undefined;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types, senderName: sender.trim() || null, termsUrl: terms.trim() || null, ...(tryOn ? { tryOn } : {}) }),
      });
      const payload = (await response.json().catch(() => null)) as Payload<EventEmailsView> | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
      adopt(payload.data);
      setSaved(true);
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : 'The e-mails could not be saved');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <StateBlock variant="loading" title="Loading the e-mails..." />;
  if (error || !view) return <InlineAlert title="Error" message={error || 'The e-mails could not be loaded'} severity="error" />;

  const set = (type: string, change: Partial<Draft>) => setDrafts((current) => ({ ...current, [type]: { ...current[type], ...change } }));
  const status = (draft: Draft, defaultOn: boolean) => `${draft.enabled ? 'On' : 'Off'} · ${draft.chose && draft.enabled !== defaultOn ? 'chosen' : draft.chose ? 'chosen (same as the default)' : 'default'}`;

  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/events">Events</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/events/${id}`}>{view.eventName}</Link>
        <span aria-hidden> / </span>
        <span>Emails</span>
      </nav>
      <WorkspaceHeader
        eyebrow="Events"
        title={`Emails: ${view.eventName}`}
        description="The five e-mails a user can get from this event. A switch or a text you do not touch follows the default; what you change is this event's own. Welcome, arrived and follow up are off by default."
      />

      {saveError ? <InlineAlert title="Not saved" message={saveError} severity="error" /> : null}
      {saved && !dirty ? <InlineAlert title="Saved" message="The e-mails are saved. The next e-mail uses them." severity="info" /> : null}

      <Group gap="xs" wrap="wrap">
        <Button type="button" loading={saving} disabled={saving || !dirty} onClick={() => void save()}>
          Save the e-mails
        </Button>
        <Button type="button" variant="light" disabled={saving || !dirty} onClick={() => adopt(view)}>
          Discard the changes
        </Button>
        {dirty ? <span style={muted}>You have unsaved changes.</span> : null}
      </Group>

      <section style={card} aria-labelledby="sender-title">
        <h3 id="sender-title" style={{ margin: 0 }}>
          Sender and terms
        </h3>
        <TextInput label="Sender display name" value={sender} onChange={(event) => setSender(event.currentTarget.value)} placeholder={view.defaultSenderName} description="Shown as the name of the sender. Empty: the default." />
        <TextInput label="Link to the terms and policies" value={terms} onChange={(event) => setTerms(event.currentTarget.value)} placeholder={view.defaultTermsUrl} description="What {terms} stands for. Empty: the default for the language of the event." />
      </section>

      {view.types.map((row) => {
        const draft = drafts[row.type];
        if (!draft) return null;
        return (
          <section key={row.type} style={card} aria-labelledby={`type-${row.type}`}>
            <div>
              <h3 id={`type-${row.type}`} style={{ margin: 0 }}>
                {row.label} <span style={{ ...muted, fontWeight: 400 }}>· {status(draft, row.defaultOn)}</span>
              </h3>
              <p style={{ ...muted, margin: '0.25rem 0 0' }}>{row.when}</p>
            </div>
            {!row.sent ? <InlineAlert title="Not sent yet" message={row.type === 'followUp' ? 'The text and the switch are saved, but nothing sends this e-mail yet: the daily job that sends it is added later.' : 'The text and the switch are saved, but this e-mail is not sent yet: the trigger comes in the next release.'} severity="info" /> : null}
            <Group gap="md" wrap="wrap" align="center">
              <Checkbox
                label="Send this e-mail"
                checked={draft.enabled}
                onChange={(event) => set(row.type, { enabled: event.currentTarget.checked, chose: true })}
              />
              <Button
                type="button"
                variant="light"
                size="xs"
                disabled={!draft.chose && draft.subject === row.defaultSubject && draft.body === row.defaultBody}
                onClick={() => set(row.type, { enabled: row.defaultOn, chose: false, subject: row.defaultSubject, body: row.defaultBody })}
              >
                Use the default (switch and texts)
              </Button>
            </Group>
            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))', alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <EmailTextEditor label="Subject" kind="subject" value={draft.subject} onChange={(subject) => set(row.type, { subject })} disabled={saving} />
                <EmailTextEditor
                  label="Message"
                  kind="body"
                  value={draft.body}
                  onChange={(body) => set(row.type, { body })}
                  disabled={saving}
                  description={`${draft.subject === row.defaultSubject && draft.body === row.defaultBody ? 'This is the default text.' : 'This event has its own text.'} ${row.buttonLabel ? `The button says “${row.buttonLabel}”.` : 'This e-mail has no button.'}`}
                />
              </div>
              <EmailPreview eventId={id} language={view.language} subject={draft.subject} body={draft.body} buttonLabel={row.buttonLabel} />
            </div>
          </section>
        );
      })}

      {view.tryOn && tryOnDrafts ? (
        <section style={card} aria-labelledby="tryon-title">
          <div>
            <h3 id="tryon-title" style={{ margin: 0 }}>
              Try-on e-mails
            </h3>
            <p style={{ ...muted, margin: '0.25rem 0 0' }}>The two older e-mails of an event that uses try-on, kept as they were: when the related photos are ready, and after an approved resubmitted try-on result.</p>
          </div>
          {(['related', 'resubmission'] as const).map((mode) => (
            <div key={mode} style={{ display: 'grid', gap: '0.75rem' }}>
              <Checkbox
                label={mode === 'related' ? 'Send an e-mail when the related photos are ready' : 'Send an update e-mail after an approved resubmitted try-on result'}
                checked={tryOnDrafts[mode].enabled}
                onChange={(event) => setTryOnDrafts((current) => (current ? { ...current, [mode]: { ...current[mode], enabled: event.currentTarget.checked } } : current))}
              />
              <EmailTextEditor label="Subject" kind="subject" value={tryOnDrafts[mode].subject} onChange={(subject) => setTryOnDrafts((current) => (current ? { ...current, [mode]: { ...current[mode], subject } } : current))} disabled={saving} />
              <EmailTextEditor label="Message" kind="body" value={tryOnDrafts[mode].body} onChange={(body) => setTryOnDrafts((current) => (current ? { ...current, [mode]: { ...current[mode], body } } : current))} disabled={saving} />
            </div>
          ))}
        </section>
      ) : null}

      <section style={card} aria-labelledby="legal-title">
        <div>
          <h3 id="legal-title" style={{ margin: 0 }}>
            Legal part
          </h3>
          <p style={{ ...muted, margin: '0.25rem 0 0' }}>The same small print under every e-mail of this event. It follows the partner&apos;s, which follows the general one, until this event writes its own.</p>
        </div>
        {legal.loading ? <StateBlock variant="loading" title="Loading the legal part..." /> : legal.error || !legal.data ? <InlineAlert title="Error" message={legal.error || 'The legal part could not be loaded'} severity="error" /> : (
          <LegalPartEditor
            own={legal.data.legal}
            inherited={[
              { label: 'the general legal part', legal: legal.data.inherited.global },
              { label: "the partner's legal part", legal: legal.data.inherited.partner },
            ]}
            eventId={id}
            initialLanguage={legal.data.language === 'hu' ? 'hu' : 'en'}
            busy={legal.saving}
            error={legal.saveError}
            saved={legal.saved}
            onSave={legal.save}
          />
        )}
      </section>
    </GdsStack>
  );
}
