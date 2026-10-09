'use client';

/**
 * Partner library: logos (camera#367, docs/LIBRARIES.md)
 *
 * The logos a partner can use: the ones it took from the global library, the ones it uploaded itself, and its logo from messmass once imported.
 * Its events take their logos from this library only. A logo can be a default for new events in each scenario (where it is shown): it is
 * assigned to every new event of the partner there, and follows later changes until an event edits its own list. Partner managers and global admins.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import AssetThumbnail from '@/components/admin/library/AssetThumbnail';
import LibraryItemCard from '@/components/admin/library/LibraryItemCard';
import LibraryUploadForm from '@/components/admin/library/LibraryUploadForm';
import { InlineAlert, LabelTag, StateBlock } from '@sovereignsquad/gds-core/client';
import { AdminCheckbox } from '@sovereignsquad/gds-admin/client';
import { LOGO_SCENARIOS, type LogoDefault, type LogoScenarioId } from '@/lib/library/logos';
import { cascadeText, type DefaultsCascade } from '@/lib/library/cascade-text';
import type { LibraryItemView, PartnerLibrary, PartnerLibraryEntry } from '@/lib/library/types';

interface PartnerRecord {
  name: string;
  defaultLogos?: LogoDefault[];
}

/** The partner's logo from messmass: its address, the library item once imported, and why it cannot be imported when it cannot. */
interface MessmassLogo {
  logoUrl: string | null;
  item: LibraryItemView | null;
  problem: string | null;
}

interface Payload<T> {
  data?: T;
  error?: string;
}

const GRID = { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' } as const;
const SECTION = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', overflow: 'hidden' } as const;
const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

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
  const [defaults, setDefaults] = useState<LogoDefault[]>([]);
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
    const [loaded, state] = await Promise.all([
      call<PartnerLibrary>(`/api/partners/${partnerId}/library?kind=logos`),
      call<MessmassLogo>(`/api/partners/${partnerId}/library/import-messmass-logo`),
    ]);
    setLibrary(loaded);
    setMessmass(state);
  }, [partnerId]);

  useEffect(() => {
    if (!partnerId) return;
    void (async () => {
      try {
        setLoading(true);
        const loaded = await call<{ partner?: PartnerRecord }>(`/api/partners/${partnerId}`);
        if (!loaded.partner) throw new Error('Partner not found');
        setPartner(loaded.partner);
        setDefaults(loaded.partner.defaultLogos ?? []);
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

  const edit = (change: { add?: string[]; remove?: string[]; defaults?: LogoDefault[] }) =>
    run(async () => {
      const result = await call<{ library: PartnerLibrary; removedInUse: Record<string, number>; defaultLogos?: LogoDefault[]; cascade?: DefaultsCascade | null }>(`/api/partners/${partnerId}/library`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'logos', ...change }),
      });
      setLibrary(result.library);
      if (result.defaultLogos) setDefaults(result.defaultLogos);
      const inUse = Object.values(result.removedInUse);
      const followed = cascadeText(result.cascade, 'logos');
      if (inUse.length > 0) {
        const events = inUse.reduce((sum, count) => sum + count, 0);
        setNotice({
          title: 'Removed from the library',
          message: `Removed. ${events} event${events === 1 ? '' : 's'} still use${events === 1 ? 's' : ''} a logo you removed: they keep it, and their pages mark it as no longer in this library.${followed ? ` ${followed}` : ''}`,
        });
      } else if (followed) {
        setNotice({ title: 'Defaults changed', message: followed });
      }
    });

  const isDefault = (logoId: string, scenario: LogoScenarioId) => defaults.some((row) => row.logoId === logoId && row.scenario === scenario);

  // The same order as before: a new default comes after every default the partner has.
  const toggleDefault = (logoId: string, scenario: LogoScenarioId) =>
    edit({
      defaults: isDefault(logoId, scenario)
        ? defaults.filter((row) => !(row.logoId === logoId && row.scenario === scenario))
        : [...defaults, { logoId, scenario, order: defaults.length }],
    });

  const removeFromLibrary = (item: PartnerLibraryEntry) => {
    if (defaults.some((row) => row.logoId === item.id)) {
      const sure = confirm(`"${item.name}" is a default for new events. Removing it from the library also removes it from the defaults for new events. The events that already have it keep it. Remove it?`);
      if (!sure) return;
    }
    void edit({ remove: [item.id] });
  };

  const deleteUpload = (item: PartnerLibraryEntry) => {
    const what = item.source === 'messmass' ? 'It was imported from messmass; you can import it again later.' : 'It was uploaded for this partner and is removed for good.';
    if (!confirm(`Delete "${item.name}"? ${what}`)) return;
    void run(async () => {
      await call<{ deleted: string }>(`/api/partners/${partnerId}/library/items/${item.id}?kind=logos`, { method: 'DELETE' });
      setDefaults((rows) => rows.filter((row) => row.logoId !== item.id));
      await reload();
    });
  };

  const importFromMessmass = () =>
    run(async () => {
      const done = await call<{ item: LibraryItemView; created: boolean; madeDefault: boolean; eventsUpdated: number }>(`/api/partners/${partnerId}/library/import-messmass-logo`, { method: 'POST' });
      await reload();
      setNotice({
        title: 'Imported',
        message: done.madeDefault
          ? `The logo from messmass is now in this library and a default of this partner. ${done.eventsUpdated} event${done.eventsUpdated === 1 ? '' : 's'} that follow${done.eventsUpdated === 1 ? 's' : ''} the partner's defaults got it; new events get it when they are created. An event that chose its own logos keeps them.`
          : 'The logo from messmass is in this library.',
      });
    });

  if (loading) return <StateBlock variant="loading" title="Loading the partner library..." />;

  if (error || !partner || !library) {
    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        <InlineAlert title="Error" message={error || 'Partner not found'} severity="error" />
        <Link href="/admin/partners">← Back to Partners</Link>
      </div>
    );
  }

  const showImport = Boolean(messmass?.logoUrl) && !messmass?.item;

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <nav aria-label="Breadcrumb">
        <Link href="/admin/partners">Partners</Link>
        <span aria-hidden> / </span>
        <Link href={`/admin/partners/${partnerId}`}>{partner.name}</Link>
        <span aria-hidden> / </span>
        <span>Logos</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Partners"
        title="Partner library: logos"
        description={`The logos ${partner.name} can use. Its events take their logos from this library only: add logos from the global library, upload logos for this partner, or import its logo from messmass.`}
      />

      {!library.saved ? (
        <InlineAlert
          title="This list is what the partner already had"
          message="It is the partner's default logos and the logos its events already use. The first change you save makes it the partner's own list; nothing is removed by that."
          severity="info"
        />
      ) : null}
      {library.missing.length > 0 ? (
        <InlineAlert title="A logo is missing" message={`${library.missing.length} logo${library.missing.length === 1 ? '' : 's'} this partner used no longer exist${library.missing.length === 1 ? 's' : ''} in the library and ${library.missing.length === 1 ? 'is' : 'are'} not listed.`} severity="warning" />
      ) : null}
      {notice ? <InlineAlert title={notice.title} message={notice.message} severity="info" /> : null}
      {actionError ? <InlineAlert title="That did not work" message={actionError} severity="error" /> : null}

      {showImport && messmass?.logoUrl ? (
        <section style={SECTION}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <h3 style={{ margin: 0 }}>The logo from messmass</h3>
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>
              This is the logo messmass has for {partner.name}. Importing puts it in this library and makes it a default of the partner; its events that follow the partner&apos;s defaults get it too, and an event that chose its own logos keeps them.
            </p>
          </div>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem' }}>
            <AssetThumbnail url={messmass.logoUrl} name={`The logo of ${partner.name} from messmass`} noun="logo" width={240} />
            {messmass.problem ? (
              <InlineAlert title="It cannot be imported" message={messmass.problem} severity="warning" />
            ) : (
              <SemanticButton action="library:import-messmass" loading={busy} disabled={busy} onClick={() => void importFromMessmass()}>
                Import the logo from messmass
              </SemanticButton>
            )}
          </div>
        </section>
      ) : null}

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 style={{ margin: 0 }}>In the partner library ({library.items.length})</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>
            A logo that is a default in a scenario is assigned there to every new event of {partner.name}, and follows changes here until an event edits its own list.
          </p>
        </div>
        <div style={{ padding: '1rem' }}>
          {library.items.length === 0 ? (
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '2rem 0', textAlign: 'center' }}>No logos yet. Add one from the global library below, or upload one.</p>
          ) : (
            <div style={GRID}>
              {library.items.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  thumbnailUrl={item.thumbnailUrl}
                  noun="logo"
                  scope={item.scope}
                  source={item.source}
                  badges={
                    <>
                      {defaults.some((row) => row.logoId === item.id) ? <LabelTag tone="success" label="Default for new events" /> : null}
                      {!item.itemActive ? <LabelTag tone="warning" label="Switched off in the library" /> : null}
                    </>
                  }
                  note={
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <span>Default for new events in:</span>
                      {LOGO_SCENARIOS.map((scenario) => {
                        const on = isDefault(item.id, scenario.id);
                        return (
                          <AdminCheckbox
                            key={scenario.id}
                            name={`default-${item.id}-${scenario.id}`}
                            label={scenario.name}
                            checked={on}
                            disabled={busy || (!on && !item.itemActive)}
                            onChange={() => void toggleDefault(item.id, scenario.id)}
                          />
                        );
                      })}
                    </div>
                  }
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
            </div>
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 style={{ margin: 0 }}>Add from the global library ({library.available.length})</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>Logos collected by the global admins that {partner.name} does not have yet.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          {library.available.length === 0 ? (
            <p style={{ color: 'var(--mantine-color-dimmed)', margin: '2rem 0', textAlign: 'center' }}>Every global logo is already in this library.</p>
          ) : (
            <div style={GRID}>
              {library.available.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  name={item.name}
                  imageUrl={item.imageUrl}
                  thumbnailUrl={item.thumbnailUrl}
                  noun="logo"
                  scope={item.scope}
                  actions={
                    <SemanticButton action="library:add" size="xs" disabled={busy} onClick={() => void edit({ add: [item.id] })}>
                      Add to library
                    </SemanticButton>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={SECTION}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          <h3 style={{ margin: 0 }}>Upload a logo for {partner.name}</h3>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.35rem 0 0' }}>It goes into this library at once. No other partner can take it.</p>
        </div>
        <div style={{ padding: '1rem' }}>
          <LibraryUploadForm endpoint={`/api/partners/${partnerId}/library/upload`} kind="logos" noun="logo" accept={ACCEPT} acceptWords="PNG, JPG, SVG or WebP" namePlaceholder="e.g. Club crest" onUploaded={reload} />
        </div>
      </section>

      <Link href={`/admin/partners/${partnerId}`}>← Back to Partner</Link>
    </div>
  );
}
