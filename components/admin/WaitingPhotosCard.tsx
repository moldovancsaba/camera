/**
 * "Photos waiting for approval" on the global Vetting page (camera#284): the events whose photos wait, each opening its own Vetting tab.
 * Shows nothing while no photo waits.
 */

import Link from 'next/link';
import { connectToDatabase } from '@/lib/db/mongodb';
import { listEventsWithWaitingPhotos } from '@/lib/photo-vetting/queue';

export default async function WaitingPhotosCard() {
  const db = await connectToDatabase();
  const events = await listEventsWithWaitingPhotos(db);
  if (events.length === 0) return null;
  const total = events.reduce((sum, event) => sum + event.count, 0);

  return (
    <section style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', padding: '1rem', display: 'grid', gap: '0.5rem' }} data-waiting-photos>
      <strong>
        Photos waiting for approval ({total})
      </strong>
      <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
        {events.map((event) => (
          <li key={event.id}>
            <Link href={`/admin/events/${event.id}/vetting`}>{event.name}</Link>: {event.count}
          </li>
        ))}
      </ul>
    </section>
  );
}
