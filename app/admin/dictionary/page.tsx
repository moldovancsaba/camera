'use client';

/**
 * The Dictionary (issue 353, docs/BUILDING_BRICKS.md step 6): every default text of the user journey in the canonical UI locale registry, and the global wording an admin can write above the
 * code dictionary. It applies to every partner and event unless a partner or an event wrote its own. Global admins.
 */

import { GdsStack, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import Link from 'next/link';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import TextLevelEditor from '@/components/admin/kit/TextLevelEditor';
import { useTextLevel } from '@/components/admin/kit/useTextLevel';
import QrTextsLibrary from '@/components/admin/library/QrTextsLibrary';
import type { TextsByLanguage } from '@/lib/i18n/overrides';

export default function DictionaryPage() {
  const { data, loading, error, saveError, saving, saved, save } = useTextLevel<{ texts: TextsByLanguage }>('/api/admin/dictionary');
  if (loading) return <StateBlock variant="loading" title="Loading the dictionary..." />;
  if (error || !data) return <InlineAlert title="Error" message={error || 'The dictionary could not be loaded'} severity="error" />;
  return (
    <GdsStack gap="lg">
      <WorkspaceHeader
        eyebrow="Blocks"
        title="Global Dictionary"
        description="Global fallback guest wording and the QR text library. Partners and events can override inherited wording; text written directly on a journey page takes priority."
      />
      <p style={{ margin: 0, color: 'var(--mantine-color-dimmed)' }}>
        Use the journey editor to change page order or custom page content. This dictionary sets shared fallback labels and QR text.
        {' '}<Link href="/admin/settings/experience">Open Global User Journey</Link>
      </p>
      <TextLevelEditor own={data.texts} inherited={[]} busy={saving} error={saveError} saved={saved} onSave={save} />
      <QrTextsLibrary embedded />
    </GdsStack>
  );
}
