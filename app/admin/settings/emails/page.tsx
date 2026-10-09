'use client';

/**
 * The e-mails to the user, the general level (epic 463, docs/EMAIL_FORMAT_PLAN.md): the legal part every partner and event follows until it sets its own. Global admins.
 */

import { GdsStack, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import LegalPartEditor, { useLegalLevel } from '@/components/admin/kit/LegalPartEditor';
import type { LegalByLanguage } from '@/lib/email/legal-rules';

export default function GeneralEmailsPage() {
  const { data, loading, error, saveError, saving, saved, save } = useLegalLevel<{ legal: LegalByLanguage }>('/api/admin/emails/legal');
  if (loading) return <StateBlock variant="loading" title="Loading the e-mail settings..." />;
  if (error || !data) return <InlineAlert title="Error" message={error || 'The e-mail settings could not be loaded'} severity="error" />;
  return (
    <GdsStack gap="lg">
      <WorkspaceHeader
        eyebrow="Settings"
        title="Emails"
        description="The e-mails the users get. The legal part below is added as small print after the message and the button of every e-mail, for every event whose partner or itself has not written another. A partner can write its own for all its events, and an event its own."
      />
      <LegalPartEditor own={data.legal} inherited={[]} busy={saving} error={saveError} saved={saved} onSave={save} />
    </GdsStack>
  );
}
