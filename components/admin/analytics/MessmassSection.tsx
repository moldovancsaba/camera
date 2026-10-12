'use client';

/**
 * The Messmass tab of the Analytics view (issue 521, phase 1, and issue 628; global admins): what camera would send to messmass for this event, as the numbers are now, with the name and the label of
 * each, and which counters wait (none: a counter with nothing behind it yet is left out, never sent as a zero). It is a **preview**: nothing is sent from here. Sending is switched off by default
 * (lib/analytics/counters-setting.ts) and the first real push is the owner's decision, made when a real event can be watched and the receiving route exists in messmass (docs/ANALYTICS.md "Counters for messmass").
 */

import { WAITING_COUNTERS, counterRows } from '@/lib/analytics/counters';
import type { CounterState } from '@/lib/analytics/counters-sync';
import { formatCount, formatDateTime } from '@/lib/analytics/format';
import { Metrics, Note, Panel, Table } from './ui';

export default function MessmassSection({ state, timeZone }: { state: CounterState; timeZone: string }) {
  const rows = counterRows(state.counters);
  const last = state.lastPushed;
  const sent = Object.keys(state.counters.totals).length + Object.keys(state.counters.averages).length;
  return (
    <>
      <Metrics
        items={[
          { label: 'Sending to messmass', value: state.enabled ? 'On' : 'Off', description: state.enabled ? 'Switched on. The numbers below are sent when a trigger asks for a push, at most one every 30 seconds for the event.' : 'Off, as it is by default. Nothing is sent from this page or by any process.' },
          { label: 'Linked to messmass', value: state.linked ? 'Yes' : 'No', description: state.linked ? 'The event has a messmass event to send to.' : 'The event has no messmass event, so there is nowhere to send to.' },
          { label: 'Last push', value: state.lastPushAt ? formatDateTime(state.lastPushAt, timeZone) : 'Never', description: state.lastPushAt ? 'The numbers of that push are in the last column below.' : 'Nothing was ever sent for this event.' },
        ]}
      />

      <Panel title="Counters that would be sent" description="Numbers only, never a person: no name, e-mail, reviewer or photo. Every name starts with camera_, because messmass holds variables of other sources. A total is the whole running total of the event (never a day's change), so sending it again changes nothing; the average is a whole value that messmass stores as it is.">
        <Table
          caption="Counters for messmass"
          rows={rows}
          getKey={(row) => row.key}
          columns={[
            { key: 'key', header: 'Name in messmass', rowHeader: true, render: (row) => <code>{row.key}</code> },
            { key: 'label', header: 'Label in messmass', render: (row) => row.label },
            { key: 'kind', header: 'Kind', render: (row) => (row.kind === 'total' ? 'Total' : 'Average') },
            { key: 'value', header: 'Now', numeric: true, render: (row) => (row.value === null ? 'not sent yet' : formatCount(row.value)) },
            { key: 'definition', header: 'What it counts', render: (row) => row.definition },
            { key: 'last', header: 'Last sent', numeric: true, render: (row) => formatCount((row.kind === 'total' ? last?.totals : last?.averages)?.[row.key] ?? null) },
          ]}
        />
        <Note>
          {sent} {sent === 1 ? 'counter' : 'counters'} would be sent now. A counter shown as not sent yet has nothing behind it: the journey counters wait for the first journey record, the counters about the people for the first photo a reviewer marks, the reasons for the first declined photo. They are left out, never sent as a zero. The visits of the tracked links already reach messmass through their own channel and are not in this list.
        </Note>
      </Panel>

      <Panel title="Counters that wait" description="Never sent as a zero: a zero would say nobody did it, when the truth is that nobody counted it.">
        <Table
          caption="Counters that cannot be counted yet"
          rows={[...WAITING_COUNTERS]}
          getKey={(row) => row.key}
          empty="None. Every counter can be counted from data that exists."
          columns={[
            { key: 'key', header: 'Name in messmass', rowHeader: true, render: (row) => <code>{row.key}</code> },
            { key: 'why', header: 'Why not', render: (row) => row.why },
            { key: 'waits', header: 'Waits for', render: (row) => row.waitsFor },
          ]}
        />
        <Note>Sending is off. The receiving route in messmass (photo-stats) is deployed and registers each name in its variable catalog the first time it is received. Switching the sending on is the owner&apos;s decision, made after looking at these numbers on a real event.</Note>
      </Panel>
    </>
  );
}
