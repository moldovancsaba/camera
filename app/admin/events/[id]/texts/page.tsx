'use client';

/**
 * The texts of an event (issue 353): the wording of the default texts of the user journey for this event, above the partner's and the global wording. A text an editor wrote
 * on a page of the journey always wins over all of these.
 */

import { use } from 'react';
import Link from 'next/link';
import { GdsStack, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import TextLevelEditor from '@/components/admin/kit/TextLevelEditor';
import { useTextLevel } from '@/components/admin/kit/useTextLevel';
import { UI_LANGUAGE_LABELS, type UiLanguage } from '@/lib/i18n';
import type { TextsByLanguage } from '@/lib/i18n/overrides';

export default function EventTextsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, saveError, saving, saved, save } = useTextLevel<{ name: string; language: UiLanguage; texts: TextsByLanguage; inherited: { global: TextsByLanguage; partner: TextsByLanguage } }>(`/api/events/${id}/texts`);
  if (loading) return <StateBlock variant="loading" title="Loading the texts..." />;
  if (error || !data) return <InlineAlert title="Error" message={error || 'The texts could not be loaded'} severity="error" />;
  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/events">Events</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/events/${id}`}>{data.name}</Link>
        <span aria-hidden> / </span>
        <span>Texts</span>
      </nav>
      <WorkspaceHeader
        eyebrow="Events"
        title={`Texts: ${data.name}`}
        description={`The wording of the default texts for this event. Its users see ${UI_LANGUAGE_LABELS[data.language]}. Where you write nothing, the partner's wording, the global wording or the dictionary is used; a text you wrote on a page of the journey always wins.`}
      />
      <TextLevelEditor
        own={data.texts}
        inherited={[
          { label: 'the global wording', texts: data.inherited.global },
          { label: "the partner's wording", texts: data.inherited.partner },
        ]}
        initialLanguage={data.language}
        busy={saving}
        error={saveError}
        saved={saved}
        onSave={save}
      />
    </GdsStack>
  );
}
