'use client';

import { useEffect, useState } from 'react';
import { AdminSelect, AdminTextInput } from '@sovereignsquad/gds-admin/client';
import { InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';

interface FrameDesignResponse {
  frameDesign: { messages?: string[] } | null;
  defaultMessages: string[];
}

type UploadFieldSetter = (name: string, value: string) => void;

/** Event-only wording is selected at upload; global and partner frames stay reusable across events. */
export default function EventFrameMessageUploadFields({ eventId, setUploadField }: { eventId: string; setUploadField: UploadFieldSetter }) {
  const language = useUiLanguage();
  const t = (source: string) => adminOperationText(source, language);
  const [messages, setMessages] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [choice, setChoice] = useState('__none__');
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/events/${eventId}/frame-design`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { data?: FrameDesignResponse; error?: string } | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || 'Could not load this event’s messages.');
        if (!cancelled) {
          const configured = payload.data.frameDesign?.messages;
          setMessages(configured?.length ? configured : payload.data.defaultMessages);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => { cancelled = true; };
  }, [eventId]);

  const choose = (value: string | null) => {
    const next = value ?? '__none__';
    setChoice(next);
    if (next === '__none__') {
      setUploadField('frameMessageMode', 'none');
      setUploadField('frameMessage', '');
    } else if (next === '__new__') {
      setUploadField('frameMessageMode', 'new');
      setUploadField('frameMessage', newMessage);
    } else {
      const index = Number(next.slice('__existing__:'.length));
      setUploadField('frameMessageMode', 'existing');
      setUploadField('frameMessage', messages?.[index] ?? '');
    }
  };

  const typeNewMessage = (value: string) => {
    setNewMessage(value);
    setUploadField('frameMessage', value);
  };

  return (
    <section aria-label={t('Message printed on this frame (optional)')} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.75rem', display: 'grid', gap: '0.75rem', padding: '1rem' }}>
      <div>
        <strong>{t('Message printed on this frame (optional)')}</strong>
        <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.25rem 0 0' }}>
          {t('Choose an event message or add one now.')}
        </p>
      </div>
      {messages === null && !loadError ? <StateBlock variant="loading" title={t('Loading event messages…')} /> : null}
      {loadError ? <InlineAlert title={t('Messages could not be loaded')} message={t('You can still upload a frame without a message.')} severity="warning" /> : null}
      {messages && !loadError ? (
        <AdminSelect
          name="event-frame-upload-message"
          label={t('Printed message')}
          value={choice}
          onChange={choose}
          data={[
            { value: '__none__', label: t('No message on this frame') },
            ...messages.map((message, index) => ({ value: `__existing__:${index}`, label: t('Use existing: {message}').replace('{message}', message) })),
            { value: '__new__', label: t('Add a new message…') },
          ]}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />
      ) : null}
      {choice === '__new__' ? (
        <AdminTextInput
          name="event-frame-upload-new-message"
          label={t('New event message')}
          value={newMessage}
          onChange={typeNewMessage}
          maxLength={80}
          required
          placeholder="e.g. Hajrá, MTK!"
        />
      ) : null}
    </section>
  );
}
