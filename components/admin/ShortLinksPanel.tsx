'use client';

/**
 * The tracked short links of one event, in the event page (camera#320): one link per placement (the giant screen QR, a poster, an email), each counted on
 * its own. Shows the address of every link (with a copy button and the QR code as an SVG file for the designers), what has been counted on it, a form to add
 * a link, and a switch to turn a link off. The totals also go to messmass as the event's QR scans and link clicks (lib/short-links/).
 *
 * Talks to GET/POST/PATCH /api/admin/events/[id]/short-links and GET .../[slug]/qr. Opening the panel pushes the latest totals to messmass.
 */

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Code, Select, Text, TextInput } from '@/components/gds/PublicPrimitives';
import { Group, InlineAlert, StateBlock } from '@sovereignsquad/gds-core/client';
import type { ShortLinkView } from '@/lib/short-links/view';
import type { LinkCounts } from '@/lib/short-links/store';

interface Loaded {
  links: ShortLinkView[];
  eventShortUrl: { slug: string; url: string; counts: LinkCounts } | null;
  linkedToMessmass: boolean;
  lastPush: string | null;
  limits: { maxLinks: number; maxPlacementLength: number };
}

type Notice = { severity: 'success' | 'error'; title: string; message: string };

const section = { border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' } as const;
const sectionHead = { padding: '1.5rem', borderBottom: '1px solid var(--gds-color-border)' } as const;
const sectionBody = { display: 'grid', gap: '1.25rem', padding: '1rem 1.5rem 1.5rem' } as const;
const muted = { color: 'var(--gds-color-muted)', fontSize: '0.8125rem' } as const;
const KINDS = [
  { value: 'qr', label: 'QR code (counted as scans, with the Android / iPhone split)' },
  { value: 'link', label: 'Plain link (counted as clicks)' },
];

function errorText(body: unknown, fallback: string): string {
  const message = body && typeof body === 'object' ? (body as { error?: unknown }).error : null;
  return typeof message === 'string' && message ? message : fallback;
}

async function call<T>(url: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as { data?: T } | null;
  if (!response.ok || !body?.data) throw new Error(errorText(body, fallback));
  return body.data;
}

function CountsLine({ counts, qr }: { counts: LinkCounts; qr: boolean }) {
  return (
    <span style={muted}>
      {counts.total} counted ({counts.today} today, UTC){qr ? `, ${counts.android} Android, ${counts.iphone} iPhone, ${counts.other} other` : ''}
    </span>
  );
}

export default function ShortLinksPanel({ eventId }: { eventId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [placement, setPlacement] = useState('');
  const [kind, setKind] = useState<string>('qr');
  const [slug, setSlug] = useState('');

  const endpoint = `/api/admin/events/${eventId}/short-links`;

  const load = useCallback(async () => {
    try {
      setLoaded(await call<Loaded>(endpoint, undefined, 'Could not load the tracked links'));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the tracked links');
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ severity: 'success', title: 'Done', message: await action() });
      await load();
    } catch (error) {
      setNotice({ severity: 'error', title: 'Not done', message: error instanceof Error ? error.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      const data = await call<{ link: ShortLinkView }>(
        endpoint,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ placement, kind, ...(slug.trim() ? { slug } : {}) }) },
        'The link could not be added',
      );
      setPlacement('');
      setSlug('');
      return `Added ${data.link.url}`;
    });

  const toggle = (link: ShortLinkView) =>
    run(async () => {
      await call(endpoint, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: link.slug, active: !link.active }) }, 'The link could not be changed');
      return link.active ? `${link.url} is off: it answers “not found” until it is switched on again; its counts stay.` : `${link.url} is on.`;
    });

  const copy = (url: string) =>
    run(async () => {
      await navigator.clipboard.writeText(url);
      return `Copied ${url}`;
    });

  if (loadError) return <InlineAlert title="Tracked links" message={loadError} severity="error" />;
  if (!loaded) return <StateBlock variant="loading" title="Loading the tracked links…" />;

  const full = loaded.links.length >= loaded.limits.maxLinks;
  return (
    <section aria-labelledby="short-links-title" style={section}>
      <div style={sectionHead}>
        <h3 id="short-links-title" style={{ margin: 0 }}>
          Tracked links
        </h3>
        <p style={{ ...muted, margin: '0.5rem 0 0' }}>
          One link per placement (the giant screen, a poster, an email), each counted on its own. A count is a person’s browser being sent on, not a different
          person: previews made by chat apps, crawlers and prefetches are left out. The totals are added to the event’s QR scans and link clicks in messmass
          {loaded.linkedToMessmass
            ? loaded.lastPush
              ? `; last sent ${new Date(loaded.lastPush).toLocaleString()}.`
              : '; nothing has been sent yet.'
            : ', but this event is not linked to messmass, so nothing is sent.'}
        </p>
      </div>

      <div style={sectionBody}>
        {notice ? (
          <div role="status">
            <InlineAlert title={notice.title} message={notice.message} severity={notice.severity} />
          </div>
        ) : null}

        {loaded.links.length === 0 ? (
          <p style={muted}>No tracked links yet. Add one below, then use its address (or its QR code) in the placement it is named after.</p>
        ) : (
          <ul style={{ display: 'grid', gap: '0.75rem', listStyle: 'none', margin: 0, padding: 0 }}>
            {loaded.links.map((link) => (
              <li key={link.slug} style={{ border: '1px solid var(--gds-color-border)', borderRadius: 8, display: 'grid', gap: '0.5rem', padding: '0.75rem 1rem' }}>
                <Group gap="xs" wrap="wrap">
                  <Text fw={600}>{link.placement}</Text>
                  <Badge variant="light">{link.kind === 'qr' ? 'QR code' : 'Link'}</Badge>
                  {link.active ? null : <Badge color="red" variant="light">Off</Badge>}
                </Group>
                <Group gap="xs" wrap="wrap">
                  <Code>{link.url}</Code>
                  <Button type="button" variant="light" size="xs" disabled={busy} onClick={() => void copy(link.url)}>
                    Copy address
                  </Button>
                  <Button component="a" href={`${endpoint}/${link.slug}/qr?download=1`} variant="light" size="xs">
                    QR code (SVG)
                  </Button>
                  <Button type="button" variant="light" size="xs" disabled={busy} onClick={() => void toggle(link)}>
                    {link.active ? 'Switch off' : 'Switch on'}
                  </Button>
                </Group>
                <CountsLine counts={link.counts} qr={link.kind === 'qr'} />
              </li>
            ))}
          </ul>
        )}

        {loaded.eventShortUrl ? (
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <Text fw={600}>The event’s own short URL</Text>
            <Group gap="xs" wrap="wrap">
              <Code>{loaded.eventShortUrl.url}</Code>
            </Group>
            <CountsLine counts={loaded.eventShortUrl.counts} qr={false} />
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
          style={{ display: 'grid', gap: '0.75rem' }}
        >
          <h4 style={{ margin: 0 }}>Add a link</h4>
          <TextInput
            label="Placement"
            description="Where this link is used, in your words, e.g. Giant screen, Poster, Email footer."
            value={placement}
            onChange={(event) => setPlacement(event.currentTarget.value)}
            maxLength={loaded.limits.maxPlacementLength}
            disabled={busy || full}
            required
          />
          <Select label="Kind" data={KINDS} value={kind} onChange={(value) => setKind(value ?? 'qr')} allowDeselect={false} disabled={busy || full} />
          <TextInput
            label="Slug (optional)"
            description="The end of the address. Leave empty for a short random one, which keeps a QR code coarse and easy to scan."
            value={slug}
            onChange={(event) => setSlug(event.currentTarget.value)}
            disabled={busy || full}
          />
          <div>
            <Button type="submit" loading={busy} disabled={busy || full || !placement.trim()}>
              Add link
            </Button>
            {full ? <p style={muted}>An event can have at most {loaded.limits.maxLinks} tracked links.</p> : null}
          </div>
        </form>
      </div>
    </section>
  );
}
