'use client';

/**
 * The Messmass tab of the Analytics view (issue 521, phase 1; global admins): what camera would send to messmass for this event, as the numbers are now, and what is not countable yet. It is a
 * **preview**: nothing is sent from here or by any process. Sending is switched off by default (lib/analytics/counters-setting.ts) and the first real push is the owner's decision, made when a real
 * event can be watched and the receiving route exists in messmass (docs/ANALYTICS.md "Counters for messmass").
 */

import { COMPUTABLE_COUNTERS, WAITING_COUNTERS, counterRows } from '@/lib/analytics/counters';
import type { CounterState } from '@/lib/analytics/counters-sync';
import { formatCount, formatDateTime } from '@/lib/analytics/format';
import { Metrics, Note, Panel, Table } from './ui';

export default function MessmassSection({ state, timeZone }: { state: CounterState; timeZone: string }) {
  const rows = counterRows(state.counters);
  const last = state.lastPushed;
  return (
    <>
      <Metrics
        items={[
          { label: 'Sending to messmass', value: state.enabled ? 'On' : 'Off', description: state.enabled ? 'Switched on. No page or process sends yet: the push is not wired to a trigger.' : 'Off, as it is by default. Nothing is sent from this page or by any process.' },
          { label: 'Linked to messmass', value: state.linked ? 'Yes' : 'No', description: state.linked ? 'The event has a messmass event to send to.' : 'The event has no messmass event, so there is nowhere to send to.' },
          { label: 'Last push', value: state.lastPushAt ? formatDateTime(state.lastPushAt, timeZone) : 'Never', description: state.lastPushAt ? 'The numbers of that push are in the last column below.' : 'Nothing was ever sent for this event.' },
        ]}
      />

      <Panel title="Counters that would be sent" description="Numbers only, never a person: no name, e-mail, reviewer or photo. A total is the whole running total of the event; the average is a whole value that messmass stores as it is.">
        <Table
          caption="Counters for messmass"
          rows={rows}
          getKey={(row) => row.key}
          columns={[
            { key: 'key', header: 'Name in messmass', rowHeader: true, render: (row) => <code>{row.key}</code> },
            { key: 'kind', header: 'Kind', render: (row) => (row.kind === 'total' ? 'Total' : 'Average') },
            { key: 'value', header: 'Now', numeric: true, render: (row) => (row.value === null ? 'not sent yet' : formatCount(row.value)) },
            { key: 'definition', header: 'What it counts', render: (row) => row.definition },
            { key: 'last', header: 'Last sent', numeric: true, render: (row) => formatCount((row.kind === 'total' ? last?.totals : last?.averages)?.[row.key] ?? null) },
          ]}
        />
        <Note>
          {COMPUTABLE_COUNTERS.length} of the {COMPUTABLE_COUNTERS.length + WAITING_COUNTERS.length} counters of the audit can be counted from the data that exists. The visits of the tracked links already reach messmass through their own channel and are not in this list.
        </Note>
      </Panel>

      <Panel title="Counters that wait" description="Never sent as a zero: a zero would say nobody did it, when the truth is that nobody counted it.">
        <Table
          caption="Counters that cannot be counted yet"
          rows={[...WAITING_COUNTERS]}
          getKey={(row) => row.key}
          columns={[
            { key: 'key', header: 'Name in messmass', rowHeader: true, render: (row) => <code>{row.key}</code> },
            { key: 'why', header: 'Why not', render: (row) => row.why },
            { key: 'waits', header: 'Waits for', render: (row) => row.waitsFor },
          ]}
        />
        <Note>The receiving route in messmass (photo-stats) and the variables in its catalog are not built yet, so a push would be refused. The first real push is the owner&apos;s decision.</Note>
      </Panel>
    </>
  );
}
