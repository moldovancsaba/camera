'use client';

/**
 * The editor of the legal part of the e-mails at one level (epic 463, docs/EMAIL_FORMAT_PLAN.md, segments E2 and E4): the same screen for the general level, a partner and an event.
 * One language at a time: what is used now (the legal part of the nearest level above when this level wrote none), an editor for this level's own, and the preview of an e-mail with
 * the draft as small print. An empty text means "follow the level above" (nothing is copied down). The page saves (`onSave`); this edits a draft.
 */

import { useCallback, useEffect, useState } from 'react';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import { Button, Group } from '@/components/gds/PublicPrimitives';
import EmailPreview from '@/components/admin/kit/EmailPreview';
import EmailTextEditor from '@/components/admin/kit/EmailTextEditor';
import { standardLegalLine, type LegalByLanguage } from '@/lib/email/legal-rules';
import { emailDefaults } from '@/lib/email/submission-template-defaults';
import { UI_LANGUAGES, UI_LANGUAGE_LABELS, type UiLanguage } from '@/lib/i18n';

export interface InheritedLegal {
  /** How the level is named in a sentence ("the general legal part", "the partner's legal part"). */
  label: string;
  legal: LegalByLanguage;
}

export interface LegalPartEditorProps {
  own: LegalByLanguage;
  /** The levels above, lowest first: what is used where this level wrote nothing. */
  inherited: InheritedLegal[];
  /** The Mongo _id of an event, so the preview is drawn in its look. */
  eventId?: string;
  initialLanguage?: UiLanguage;
  busy?: boolean;
  error?: string | null;
  saved?: boolean;
  onSave: (legal: LegalByLanguage) => Promise<void> | void;
}

const clean = (legal: LegalByLanguage): LegalByLanguage =>
  Object.fromEntries(UI_LANGUAGES.map((language) => [language, (legal[language] ?? '').trim()] as const).filter(([, text]) => text)) as LegalByLanguage;

const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;

export default function LegalPartEditor({ own, inherited, eventId, initialLanguage = 'en', busy, error, saved, onSave }: LegalPartEditorProps) {
  const [language, setLanguage] = useState<UiLanguage>(initialLanguage);
  const [draft, setDraft] = useState<LegalByLanguage>(() => clean(own));
  useEffect(() => setDraft(clean(own)), [own]);

  const dirty = JSON.stringify(clean(draft)) !== JSON.stringify(clean(own));
  const written = draft[language] ?? '';

  /** What is used where this level wrote nothing: the nearest level above that has a legal part in this language. */
  const above = [...inherited].reverse().map((level) => ({ label: level.label, text: level.legal[language] ?? '' })).find((level) => level.text);
  const effective = written.trim() || above?.text || null;

  const set = useCallback((text: string) => setDraft((current) => ({ ...current, [language]: text })), [language]);
  const defaults = emailDefaults(language);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {error ? <InlineAlert title="That did not work" message={error} severity="error" /> : null}
      {saved && !dirty ? <InlineAlert title="Saved" message="The legal part is saved. The next e-mail uses it." severity="info" /> : null}

      <Group gap="md" align="flex-end" wrap="wrap">
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ fontWeight: 600 }}>Language</span>
          <select aria-label="Language" value={language} onChange={(event) => setLanguage(event.currentTarget.value === 'hu' ? 'hu' : 'en')} style={{ minHeight: 34 }}>
            {UI_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {UI_LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" loading={busy} disabled={busy || !dirty} onClick={() => void onSave(clean(draft))}>
          Save the legal part
        </Button>
        <Button type="button" variant="light" disabled={busy || !dirty} onClick={() => setDraft(clean(own))}>
          Discard the changes
        </Button>
      </Group>

      <div style={{ ...muted }}>
        {written.trim()
          ? `This level's own legal part in ${UI_LANGUAGE_LABELS[language]} is used. Clear the text to follow ${above ? above.label : 'the level above'} again.`
          : above
            ? `Nothing is written at this level in ${UI_LANGUAGE_LABELS[language]}, so ${above.label} is used. Write a text to use your own.`
            : `No level has a legal part in ${UI_LANGUAGE_LABELS[language]}: nothing is added to the e-mails, and the standard terms line stays at the end of the message.`}
      </div>

      {!written.trim() && above ? (
        <blockquote style={{ borderLeft: '3px solid var(--mantine-color-default-border)', margin: 0, padding: '0.25rem 0.75rem', whiteSpace: 'pre-wrap', ...muted }}>{above.text}</blockquote>
      ) : null}

      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <EmailTextEditor
            label={`Legal part (${UI_LANGUAGE_LABELS[language]})`}
            kind="legal"
            value={written}
            onChange={set}
            disabled={busy}
            description="Small print under the message and the button. Bold, links and variables work here; a paragraph is small text unless you make it a title or large. Use {terms} for the link to the terms and policies."
          />
          <Group gap="xs" wrap="wrap">
            <Button type="button" variant="light" size="xs" disabled={busy} onClick={() => set(standardLegalLine(language))}>
              Start from the standard line
            </Button>
            <Button type="button" variant="light" size="xs" disabled={busy || !written.trim()} onClick={() => set('')}>
              Follow the level above
            </Button>
          </Group>
        </div>
        <EmailPreview eventId={eventId} language={language} subject={defaults.subject} body={defaults.body} legal={effective ?? ''} />
      </div>
    </div>
  );
}

interface Payload<T> {
  data?: T;
  error?: string;
}

/** Loads and saves the legal part of one level from its route. */
export function useLegalLevel<T extends { legal: LegalByLanguage }>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(url);
        const payload = (await response.json().catch(() => null)) as Payload<T> | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
        if (!cancelled) setData(payload.data);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'The legal part could not be loaded');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const save = useCallback(
    async (legal: LegalByLanguage) => {
      if (!url) return;
      setSaving(true);
      setSaveError(null);
      setSaved(false);
      try {
        const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legal }) });
        const payload = (await response.json().catch(() => null)) as Payload<{ legal: LegalByLanguage }> | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
        setData((current) => (current ? { ...current, legal: payload.data!.legal } : current));
        setSaved(true);
      } catch (failure) {
        setSaveError(failure instanceof Error ? failure.message : 'The legal part could not be saved');
      } finally {
        setSaving(false);
      }
    },
    [url]
  );

  return { data, loading, error, saveError, saving, saved, save };
}
