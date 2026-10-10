'use client';

/**
 * The e-mails of an event (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E3; owner, 2026-10-09): the five e-mails a user can get, each with its switch, subject and message in the toolbar editor with
 * the preview beside it, the sender and the terms link, and the legal part of the event (own, or following its partner and the general one).
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

/** What the editor needs to know about the follow-up e-mail: who it goes to, from when, and that an event with no date sends nothing. */
function FollowUpNote({ view, on }: { view: EventEmailsView; on: boolean }) {
  const { day, from, until } = view.followUp;
  if (!day) {
    return (
      <InlineAlert
        title="This event has no date"
        message={`The follow-up e-mail is sent a week after the date of the event, so this event sends nothing until it has one. Set the date in the event's details.${on ? '' : ' (It is off now.)'}`}
        severity={on ? 'warning' : 'info'}
      />
    );
  }
  return (
    <p style={{ ...muted, margin: 0 }}>
      Sent once to each user who has an approved photo from this event, gave an e-mail address and agreed to the terms: from {from} (a week after the event on {day}) and, if a run was missed, until {until}. Nothing is sent before that or after.
    </p>
  );
}

export default function EventEmailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const url = `/api/admin/events/${id}/emails`;
  const [view, setView] = useState<EventEmailsView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
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
    return typeDirty || sender.trim() !== (view.senderName ?? '') || terms.trim() !== (view.termsUrl ?? '');
  }, [view, drafts, sender, terms]);

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
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types, senderName: sender.trim() || null, termsUrl: terms.trim() || null }),
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
  const status = (draft: Draft, defaultOn: boolean, from: 'standard' | 'partner') => {
    const source = from === 'partner' ? ' (the partner’s)' : '';
    return `${draft.enabled ? 'On' : 'Off'} · ${draft.chose && draft.enabled !== defaultOn ? 'chosen' : draft.chose ? `chosen (same as the default${source})` : `default${source}`}`;
  };

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
                {row.label} <span style={{ ...muted, fontWeight: 400 }}>· {status(draft, row.defaultOn, row.defaultFrom)}</span>
              </h3>
              <p style={{ ...muted, margin: '0.25rem 0 0' }}>{row.when}</p>
            </div>
            {!row.sent ? <InlineAlert title="Not sent yet" message="The text and the switch are saved, but nothing sends this e-mail yet." severity="info" /> : null}
            {row.type === 'followUp' ? <FollowUpNote view={view} on={draft.enabled} /> : null}
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
                  pictureLevel={{ scope: 'event', eventId: id }}
                  description={`${draft.subject === row.defaultSubject && draft.body === row.defaultBody ? 'This is the default text.' : 'This event has its own text.'} ${row.buttonLabel ? `The button says “${row.buttonLabel}”.` : 'This e-mail has no button.'}`}
                />
              </div>
              <EmailPreview eventId={id} language={view.language} subject={draft.subject} body={draft.body} buttonLabel={row.buttonLabel} />
            </div>
          </section>
        );
      })}

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
