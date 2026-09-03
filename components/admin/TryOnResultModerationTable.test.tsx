import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderModerationStatusExtras, type ModerationRow } from './TryOnResultModerationTable';

function baseRow(overrides: Partial<ModerationRow> = {}): ModerationRow {
  return {
    id: 'row-1',
    sourceJobId: 'job-1',
    imageUrl: 'https://example.com/result.jpg',
    previewImageUrl: null,
    originalImageUrl: null,
    userName: 'Test User',
    userEmail: 'user@example.com',
    eventName: 'Test Event',
    partnerName: null,
    tryOnLeatherSuitId: null,
    tryOnLeatherSuitName: null,
    reviewStatus: 'pending_review',
    createdAt: '2026-09-01T00:00:00.000Z',
    approvedAt: null,
    isShareVisible: true,
    isSlideshowEligible: true,
    isGreat: false,
    archiveReason: null,
    archiveSupersededByJobId: null,
    identityGapActionable: false,
    setup: null,
    ...overrides,
  };
}

function renderExtras(row: ModerationRow): string {
  return renderToStaticMarkup(
    <MantineProvider>{renderModerationStatusExtras(row)}</MantineProvider>,
  );
}

test('renders the identity-gap badge when identityGapActionable is true (card + modal share this render)', () => {
  const html = renderExtras(baseRow({ identityGapActionable: true }));
  assert.match(html, /Identity gap/);
});

test('does not render the identity-gap badge when identityGapActionable is false', () => {
  const html = renderExtras(baseRow({ identityGapActionable: false }));
  assert.doesNotMatch(html, /Identity gap/);
});

test('renders the approval timestamp when approvedAt is set', () => {
  const row = baseRow({ approvedAt: '2026-09-01T12:00:00.000Z' });
  const html = renderExtras(row);
  assert.match(html, /Approved/);
  assert.match(html, new RegExp(new Date(row.approvedAt as string).toLocaleString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('does not render an approval timestamp when approvedAt is null', () => {
  const html = renderExtras(baseRow({ approvedAt: null }));
  assert.doesNotMatch(html, /Approved/);
});

test('renders the superseded-rerun link with the correct href when superseded and a rerun job id is present', () => {
  const html = renderExtras(
    baseRow({ archiveReason: 'quality_rerun_superseded', archiveSupersededByJobId: 'job-999' }),
  );
  assert.match(html, /View superseding job/);
  assert.match(html, /href="\/admin\/tryon\/queue\?search=job-999"/);
});

test('does not render the superseded-rerun link when superseded but no rerun job id is present', () => {
  const html = renderExtras(
    baseRow({ archiveReason: 'quality_rerun_superseded', archiveSupersededByJobId: null }),
  );
  assert.doesNotMatch(html, /View superseding job/);
});

test('does not render the superseded-rerun link when a job id exists but the row is not superseded', () => {
  const html = renderExtras(baseRow({ archiveReason: null, archiveSupersededByJobId: 'job-999' }));
  assert.doesNotMatch(html, /View superseding job/);
});

test('renders none of the three fields when none are applicable', () => {
  const html = renderExtras(baseRow());
  assert.doesNotMatch(html, /Identity gap/);
  assert.doesNotMatch(html, /Approved/);
  assert.doesNotMatch(html, /View superseding job/);
});

test('renders all three together without collision when all three are applicable', () => {
  const html = renderExtras(
    baseRow({
      identityGapActionable: true,
      approvedAt: '2026-09-01T12:00:00.000Z',
      archiveReason: 'quality_rerun_superseded',
      archiveSupersededByJobId: 'job-999',
    }),
  );
  assert.match(html, /Identity gap/);
  assert.match(html, /Approved/);
  assert.match(html, /View superseding job/);
});
