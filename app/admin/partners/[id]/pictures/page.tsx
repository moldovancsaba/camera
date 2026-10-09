'use client';

/**
 * The default pictures of a partner (issue 368, docs/BUILDING_BRICKS.md step 5): the welcome page pictures, the CTA page picture and the e-mail footer picture that every event of
 * the partner shows unless its own page or setting has a picture. Nothing is copied into an event; a picture an event set is its own and wins.
 */

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { GdsStack, InlineAlert, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import ImagePicker from '@/components/admin/library/ImagePicker';
import { PARTNER_PICTURE_FIELDS, type PartnerPictures } from '@/lib/events/partner-pictures';

interface Payload<T> {
  data?: T;
  error?: string;
}

export default function PartnerPicturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<PartnerPictures>({});
  const [draft, setDraft] = useState<PartnerPictures>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/partners/${id}/pictures`);
        const payload = (await response.json().catch(() => null)) as Payload<{ name: string; pictures: PartnerPictures }> | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
        if (!cancelled) {
          setName(payload.data.name);
          setSaved(payload.data.pictures);
          setDraft(payload.data.pictures);
        }
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'The pictures could not be loaded');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setDone(false);
    try {
      const response = await fetch(`/api/partners/${id}/pictures`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pictures: draft }) });
      const payload = (await response.json().catch(() => null)) as Payload<{ pictures: PartnerPictures }> | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
      setSaved(payload.data.pictures);
      setDraft(payload.data.pictures);
      setDone(true);
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : 'The pictures could not be saved');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <StateBlock variant="loading" title="Loading the pictures..." />;
  if (error) return <InlineAlert title="Error" message={error} severity="error" />;

  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/partners">Partners</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/partners/${id}`}>{name}</Link>
        <span aria-hidden> / </span>
        <span>Pictures</span>
      </nav>
      <WorkspaceHeader
        eyebrow="Partners"
        title={`Pictures: ${name}`}
        description={`The default pictures of the events of ${name}. An event whose page or setting has no picture in a field shows the one chosen here; a picture an event set itself always wins, and nothing is copied into an event.`}
      />
      {saveError ? <InlineAlert title="That did not work" message={saveError} severity="error" /> : null}
      {done && !dirty ? <InlineAlert title="Saved" message="The pictures are saved. Pages show them the next time they load." severity="info" /> : null}
      <SectionPanel title="Default pictures" description="Choose from the partner's images, upload one, or clear the field to use none.">
        <GdsStack gap="lg">
          {PARTNER_PICTURE_FIELDS.map((field) => (
            <ImagePicker
              key={field.key}
              label={field.label}
              helper={field.helper}
              value={draft[field.key] ?? ''}
              onChange={(value) => setDraft((current) => (value.trim() ? { ...current, [field.key]: value } : Object.fromEntries(Object.entries(current).filter(([key]) => key !== field.key))))}
              level={{ scope: 'partner', partnerId: id }}
            />
          ))}
          <div>
            <SemanticButton action="partner-pictures:save" loading={saving} disabled={saving || !dirty} onClick={() => void save()}>
              Save the pictures
            </SemanticButton>
          </div>
        </GdsStack>
      </SectionPanel>
    </GdsStack>
  );
}
