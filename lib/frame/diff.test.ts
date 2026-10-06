import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRAME_SYSTEM_BAR_COLOR, FRAME_SYSTEM_HEADING_COLOR } from '@/lib/gds/tokens/colors';
import type { FrameContext } from './context';
import { describeSnapshotChanges } from './diff';

function context(over: Partial<FrameContext> = {}): FrameContext {
  return {
    source: 'messmass',
    fetchedAt: '2026-10-06T10:00:00.000Z',
    inputHash: 'h',
    event: { name: 'Roma - Lazio', date: null, homeTeam: { id: 'h', name: 'AS Roma', shortName: null, logoUrl: null }, visitorTeam: null },
    partner: { name: 'AS Roma', logoUrl: 'https://i.ibb.co/a/roma.png' },
    template: { name: 'Default', resolvedFrom: 'default' },
    style: { name: 'Roma', resolvedFrom: 'partner', fontFamily: 'Inter', fontSource: 'google', fontFile: null, headingColor: FRAME_SYSTEM_HEADING_COLOR, heroBackground: FRAME_SYSTEM_BAR_COLOR },
    ...over,
  };
}

test('the same data fetched again, with another timestamp or hash, changes nothing', () => {
  assert.deepEqual(describeSnapshotChanges(context(), context({ fetchedAt: '2026-10-07T10:00:00.000Z', inputHash: 'other' })), []);
});

test('a first snapshot is said to be the first', () => {
  assert.deepEqual(describeSnapshotChanges(null, context()), ['First snapshot taken']);
  assert.deepEqual(describeSnapshotChanges(undefined, context()), ['First snapshot taken']);
});

test('what is drawn is described: names, logo, font, colours, source', () => {
  const before = context({ source: 'camera', event: { name: 'Roma - Lazio', date: null, homeTeam: null, visitorTeam: null }, partner: { name: 'AS Roma', logoUrl: null } });
  const after = context({
    event: { name: 'Roma - Lazio', date: null, homeTeam: { id: 'h', name: 'AS Roma', shortName: null, logoUrl: null }, visitorTeam: { id: 'v', name: 'Lazio', shortName: null, logoUrl: null } },
    style: { ...context().style, fontFamily: 'Poppins', heroBackground: FRAME_SYSTEM_HEADING_COLOR },
  });
  assert.deepEqual(describeSnapshotChanges(before, after), [
    'Now built from messmass data',
    'Home team added: “AS Roma”',
    'Visitor team added: “Lazio”',
    'Logo added',
    'Font changed: “Inter” → “Poppins”',
    `Bar colour changed: “${FRAME_SYSTEM_BAR_COLOR}” → “${FRAME_SYSTEM_HEADING_COLOR}”`,
  ]);
});

test('removed and replaced values read as such', () => {
  const before = context();
  const after = context({ event: { ...before.event, name: 'Lazio - Roma', homeTeam: null }, partner: { name: 'AS Roma', logoUrl: 'https://i.ibb.co/a/other.png' } });
  assert.deepEqual(describeSnapshotChanges(before, after), ['Event name changed: “Roma - Lazio” → “Lazio - Roma”', 'Home team removed (was “AS Roma”)', 'Logo changed']);
  assert.deepEqual(describeSnapshotChanges(before, context({ partner: null })), ['Partner removed (was “AS Roma”)', 'Logo removed']);
});
