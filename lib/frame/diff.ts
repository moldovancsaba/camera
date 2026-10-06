/**
 * What a refresh changed in the snapshot the generated frame is built from, as short sentences for the event editor
 * (camera#237). Compares what is drawn (the same fields `contextHash` covers), so "fetched again" gives no sentences.
 * Pure and client-safe (types only from ./context).
 */

import type { FrameContext } from './context';

const quote = (value: string | null | undefined) => (value ? `“${value}”` : 'none');

function change(label: string, before: string | null | undefined, after: string | null | undefined): string | null {
  if ((before ?? null) === (after ?? null)) return null;
  if (!before) return `${label} added: ${quote(after)}`;
  if (!after) return `${label} removed (was ${quote(before)})`;
  return `${label} changed: ${quote(before)} → ${quote(after)}`;
}

export function describeSnapshotChanges(before: FrameContext | null | undefined, after: FrameContext): string[] {
  if (!before) return ['First snapshot taken'];
  const lines: Array<string | null> = [];
  if (before.source !== after.source) {
    lines.push(after.source === 'messmass' ? 'Now built from messmass data' : 'Now built from camera’s own data');
  }
  lines.push(
    change('Event name', before.event.name, after.event.name),
    change('Home team', before.event.homeTeam?.name, after.event.homeTeam?.name),
    change('Visitor team', before.event.visitorTeam?.name, after.event.visitorTeam?.name),
    change('Partner', before.partner?.name, after.partner?.name)
  );
  const logoBefore = before.partner?.logoUrl ?? null;
  const logoAfter = after.partner?.logoUrl ?? null;
  if (logoBefore !== logoAfter) lines.push(!logoBefore ? 'Logo added' : !logoAfter ? 'Logo removed' : 'Logo changed');
  lines.push(
    change('Font', before.style.fontFamily, after.style.fontFamily),
    change('Text colour', before.style.headingColor, after.style.headingColor),
    change('Bar colour', before.style.heroBackground, after.style.heroBackground)
  );
  return lines.filter((line): line is string => line !== null);
}
