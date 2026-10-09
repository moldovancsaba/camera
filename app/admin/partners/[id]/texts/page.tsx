'use client';

/**
 * The texts of a partner (issue 353): the wording of the default texts of the user journey for all events of the partner, above the global wording. An event can write its own.
 */

import { use } from 'react';
import Link from 'next/link';
import { GdsStack, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import TextLevelEditor from '@/components/admin/kit/TextLevelEditor';
import { useTextLevel } from '@/components/admin/kit/useTextLevel';
import type { TextsByLanguage } from '@/lib/i18n/overrides';

export default function PartnerTextsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, saveError, saving, saved, save } = useTextLevel<{ name: string; texts: TextsByLanguage; inherited: { global: TextsByLanguage } }>(`/api/partners/${id}/texts`);
  if (loading) return <StateBlock variant="loading" title="Loading the texts..." />;
  if (error || !data) return <InlineAlert title="Error" message={error || 'The texts could not be loaded'} severity="error" />;
  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/partners">Partners</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/partners/${id}`}>{data.name}</Link>
        <span aria-hidden> / </span>
        <span>Texts</span>
      </nav>
      <WorkspaceHeader
        eyebrow="Partners"
        title={`Texts: ${data.name}`}
        description={`The wording of the default texts for all events of ${data.name}. Where you write nothing, the global wording or the dictionary is used. An event can write its own, and a text an editor wrote on a page always wins.`}
      />
      <TextLevelEditor own={data.texts} inherited={[{ label: 'the global wording', texts: data.inherited.global }]} busy={saving} error={saveError} saved={saved} onSave={save} />
    </GdsStack>
  );
}
