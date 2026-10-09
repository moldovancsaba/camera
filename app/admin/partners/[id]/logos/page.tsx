'use client';

/**
 * The logos of a partner (camera#419, docs/BUILDING_BRICKS.md; owner, 2026-10-09). The partner chooses its logo: it is the default of every event of the partner,
 * which look at it (nothing is copied into them), and an event can use it, add its own or replace it. The partner's library holds what it can choose from:
 * the global logos it took, its own uploads, and its logo from messmass once imported. The library never says where a logo shows.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { GdsGrid, GdsStack, InlineAlert, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import AssetThumbnail from '@/components/admin/library/AssetThumbnail';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import SlotPanel, { type SlotItem } from '@/components/admin/kit/SlotPanel';
import type { LibraryItemView, PartnerLibrary, PartnerLibraryEntry } from '@/lib/library/types';
import type { SlotValue } from '@/lib/slots/resolve';

interface PartnerRecord {
  name: string;
}

/** The partner's logo from messmass: its address, the library item once imported, and why it cannot be imported when it cannot. */
interface MessmassLogo {
  logoUrl: string | null;
  item: LibraryItemView | null;
  problem: string | null;
}

interface Panel {
  value: SlotValue;
  onModel: boolean;
  ownItems: SlotItem[];
  candidates: SlotItem[];
}

interface Payload<T> {
  data?: T;
  error?: string;
}

const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';
const errorText = (error: unknown): string => (error instanceof Error ? error.message : 'An unexpected error occurred');

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as Payload<T> | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data;
}

export default function PartnerLogosPage({ params }: { params: Promise<{ id: string }> }) {
  const [partnerId, setPartnerId] = useState('');
  const [partner, setPartner] = useState<PartnerRecord | null>(null);
  const [library, setLibrary] = useState<PartnerLibrary | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [messmass, setMessmass] = useState<MessmassLogo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    params.then((resolved) => setPartnerId(resolved.id));
  }, [params]);

  const reload = useCallback(async () => {
    if (!partnerId) return;
    const [loaded, state, slot] = await Promise.all([
      call<PartnerLibrary>(`/api/partners/${partnerId}/library?kind=logos`),
      call<MessmassLogo>(`/api/partners/${partnerId}/library/import-messmass-logo`),
      call<Panel>(`/api/partners/${partnerId}/logo-slot`),
    ]);
    setLibrary(loaded);
    setMessmass(state);
    setPanel(slot);
  }, [partnerId]);

  useEffect(() => {
    if (!partnerId) return;
    void (async () => {
      try {
        setLoading(true);
        const loaded = await call<{ partner?: PartnerRecord }>(`/api/partners/${partnerId}`);
        if (!loaded.partner) throw new Error('Partner not found');
        setPartner(loaded.partner);
        await reload();
      } catch (loadError) {
        setError(errorText(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, [partnerId, reload]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await action();
    } catch (actionFailure) {
      setActionError(errorText(actionFailure));
    } finally {
      setBusy(false);
    }
  };

  const choose = (value: SlotValue) =>
    run(async () => {
      setPanel(await call<Panel>(`/api/partners/${partnerId}/logo-slot`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) }));
      await reload();
    });

  const removeFromLibrary = (item: PartnerLibraryEntry) => {
    const chosen = panel?.value.items?.includes(item.id);
    const sure = confirm(`Remove "${item.name}" from the library?${chosen ? ' It is also taken out of this partner\'s logos.' : ''} The events that already chose it keep it.`);
    if (!sure) return;
    void run(async () => {
      await call(`/api/partners/${partnerId}/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'logos', remove: [item.id] }) });
      await reload();
    });
  };

  const deleteUpload = (item: PartnerLibraryEntry) => {
    const what = item.source === 'messmass' ? 'It was imported from messmass; you can import it again later.' : 'It was uploaded for this partner and is removed for good.';
    if (!confirm(`Delete "${item.name}"? ${what}`)) return;
    void run(async () => {
      await call(`/api/partners/${partnerId}/library/items/${item.id}?kind=logos`, { method: 'DELETE' });
      await reload();
    });
  };

  const importFromMessmass = () =>
    run(async () => {
      await call<{ item: LibraryItemView; created: boolean }>(`/api/partners/${partnerId}/library/import-messmass-logo`, { method: 'POST' });
      await reload();
      setNotice({ title: 'Imported', message: 'The logo from messmass is now in this library and one of this partner\'s logos. Its events use it unless they choose another.' });
    });

  if (loading) return <StateBlock variant="loading" title="Loading the partner logos..." />;
  if (error || !partner || !library || !panel) {
    return (
      <GdsStack gap="md">
        <InlineAlert title="Error" message={error || 'Partner not found'} severity="error" />
        <Link href="/admin/partners">← Back to Partners</Link>
      </GdsStack>
    );
  }

  const showImport = Boolean(messmass?.logoUrl) && !messmass?.item;
  const chosen = new Set(panel.value.items ?? []);

  return (
    <GdsStack gap="lg">
      <nav aria-label="Breadcrumb">
        <Link href="/admin/partners">Partners</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/partners/${partnerId}`}>{partner.name}</Link>
        <span aria-hidden> / </span>
        <span>Logos</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Partners"
        title={`Logos: ${partner.name}`}
        description={`The logo of ${partner.name} is the default logo of all its events. They use it unless an event chooses another one. If there is more than one, a user sees one of them at random.`}
      />

      {notice ? <InlineAlert title={notice.title} message={notice.message} severity="info" /> : null}

      {showImport && messmass?.logoUrl ? (
        <SectionPanel title="The logo from messmass" description={`This is the logo messmass has for ${partner.name}. Importing puts it in this library and makes it one of the partner's logos.`}>
          <GdsStack gap="md">
            <AssetThumbnail url={messmass.logoUrl} name={`The logo of ${partner.name} from messmass`} noun="logo" width={240} />
            {messmass.problem ? (
              <InlineAlert title="It cannot be imported" message={messmass.problem} severity="warning" />
            ) : (
              <div>
                <SemanticButton action="library:import-messmass" loading={busy} disabled={busy} onClick={() => void importFromMessmass()}>
                  Import the logo from messmass
                </SemanticButton>
              </div>
            )}
          </GdsStack>
        </SectionPanel>
      ) : null}

      <SlotPanel
        title={`The logo of ${partner.name}`}
        description="The default of every event of this partner."
        noun="logo"
        parentName={null}
        value={panel.value}
        mode={panel.value.items && panel.value.items.length > 0 ? 'replace' : 'none'}
        defaultItems={[]}
        effective={panel.ownItems}
        candidates={panel.candidates}
        busy={busy}
        error={actionError}
        onChange={choose}
        upload={{ endpoint: `/api/partners/${partnerId}/library/upload`, extraFields: { slot: 'logo' }, accept: ACCEPT, acceptWords: 'PNG, JPG, SVG or WebP', maxBytes: 4 * 1024 * 1024, maxWords: '4 MB' }}
        onUploaded={reload}
      />

      <SectionPanel title={`In the partner library (${library.items.length})`} description="What this partner and its events can choose from. Taking a logo out of the library does not take it from the events that already chose it.">
        {library.items.length === 0 ? (
          <StateBlock variant="empty" title="The library is empty" description="Pick a logo above, or upload one." />
        ) : (
          <GdsGrid columns="auto-fill" minColumnWidth="aside" gap="md">
            {library.items.map((item) => (
              <LibraryItemCard
                key={item.id}
                name={item.name}
                imageUrl={item.imageUrl}
                thumbnailUrl={item.thumbnailUrl}
                noun="logo"
                scope={item.scope}
                source={item.source}
                note={chosen.has(item.id) ? "One of this partner's logos." : undefined}
                actions={
                  item.via === 'own' ? (
                    <SemanticButton action={item.source === 'messmass' ? 'library:delete-import' : 'library:delete-upload'} variant="danger" size="xs" disabled={busy} onClick={() => deleteUpload(item)}>
                      {item.source === 'messmass' ? 'Delete the import' : 'Delete upload'}
                    </SemanticButton>
                  ) : (
                    <SemanticButton action="library:remove" variant="danger" size="xs" disabled={busy} onClick={() => removeFromLibrary(item)}>
                      Remove from library
                    </SemanticButton>
                  )
                }
              />
            ))}
          </GdsGrid>
        )}
      </SectionPanel>
    </GdsStack>
  );
}
