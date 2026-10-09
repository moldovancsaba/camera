'use client';

/**
 * The Dictionary (issue 353, docs/BUILDING_BRICKS.md step 6): every default text of the user journey, in English and Hungarian, and the global wording an admin can write above the
 * code dictionary. It applies to every partner and event unless a partner or an event wrote its own. Global admins.
 */

import { GdsStack, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import TextLevelEditor from '@/components/admin/kit/TextLevelEditor';
import { useTextLevel } from '@/components/admin/kit/useTextLevel';
import type { TextsByLanguage } from '@/lib/i18n/overrides';

export default function DictionaryPage() {
  const { data, loading, error, saveError, saving, saved, save } = useTextLevel<{ texts: TextsByLanguage }>('/api/admin/dictionary');
  if (loading) return <StateBlock variant="loading" title="Loading the dictionary..." />;
  if (error || !data) return <InlineAlert title="Error" message={error || 'The dictionary could not be loaded'} severity="error" />;
  return (
    <GdsStack gap="lg">
      <WorkspaceHeader
        eyebrow="Settings"
        title="Dictionary"
        description="Every default text of the user journey, in English and Hungarian. A wording written here is used for all partners and events; a partner or an event can write its own, and a text an editor wrote on a page always wins."
      />
      <TextLevelEditor own={data.texts} inherited={[]} busy={saving} error={saveError} saved={saved} onSave={save} />
    </GdsStack>
  );
}
