'use client';

/**
 * The e-mails to the user, the partner level (epic 463, docs/EMAIL_FORMAT_PLAN.md): the legal part of all events of the partner, above the general one. An event can write its own.
 */

import { use } from 'react';
import Link from 'next/link';
import { GdsStack, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import LegalPartEditor, { useLegalLevel } from '@/components/admin/kit/LegalPartEditor';
import type { LegalByLanguage } from '@/lib/email/legal-rules';

export default function PartnerEmailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, saveError, saving, saved, save } = useLegalLevel<{ name: string; legal: LegalByLanguage; inherited: { global: LegalByLanguage } }>(`/api/partners/${id}/email-legal`);
  if (loading) return <StateBlock variant="loading" title="Loading the e-mail settings..." />;
  if (error || !data) return <InlineAlert title="Error" message={error || 'The e-mail settings could not be loaded'} severity="error" />;
  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/partners">Partners</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/partners/${id}`}>{data.name}</Link>
        <span aria-hidden> / </span>
        <span>Emails</span>
      </nav>
      <WorkspaceHeader
        eyebrow="Partners"
        title={`Emails: ${data.name}`}
        description={`The legal part of the e-mails of all events of ${data.name}: small print after the message and the button. Where you write nothing, the general legal part is used. An event can write its own.`}
      />
      <LegalPartEditor own={data.legal} inherited={[{ label: 'the general legal part', legal: data.inherited.global }]} busy={saving} error={saveError} saved={saved} onSave={save} />
    </GdsStack>
  );
}
