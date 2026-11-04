import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLegacyInventory, type LegacyInventoryInput } from './legacy-normalization';

const base = (): LegacyInventoryInput => ({
  assets: [
    { kind: 'frames', id: 'legacy-frame', imageUrl: 'https://media.example/frame.png' },
    { kind: 'logos', id: 'partner-logo', scope: 'partner', partnerId: 'partner-1', isActive: true, shareToChildren: false, imageUrl: 'https://media.example/logo.png' },
    { kind: 'images', id: 'event-image', scope: 'event', eventId: 'event-1', partnerId: 'partner-1', isActive: false, shareToChildren: true, imageUrl: 'https://media.example/frame.png' },
  ],
  partners: [{ partnerId: 'partner-1', library: { frames: ['legacy-frame'] }, defaultExperienceTemplateId: null }],
  events: [{ eventId: 'event-1', partnerId: 'partner-1', frames: [{ frameId: 'legacy-frame' }], experienceTemplate: { mode: 'inherit' } }],
  templates: [{ templateId: 'global-template', level: 'global', ownerId: null, config: {} }],
  globalDefaultTemplateId: 'global-template',
  directPictureRefs: [{ source: 'events', ownerId: 'event-1', field: 'customPages[0].config.backgroundImageUrl', address: 'https://media.example/frame.png' }],
});

test('plans only explicit fields whose values match legacy runtime defaults', () => {
  const report = buildLegacyInventory(base(), '2026-11-04T00:00:00.000Z');
  assert.equal(report.outputComparison.status, 'equivalent-by-contract');
  assert.deepEqual(report.changes, [{
    kind: 'frames',
    id: 'legacy-frame',
    from: { scope: null, isActive: null, shareToChildren: null },
    to: { scope: 'global', isActive: true, shareToChildren: true },
  }]);
  assert.equal(report.summary.changes, 1);
  assert.equal(report.summary.unresolved, 0);
  assert.equal(report.directPictureReferences.matchedToCatalog, 1);
  assert.equal(report.renderedEventOutputDiff.status, 'not-run');
});

test('an unknown scope with ownership fields blocks normalization instead of changing its owner', () => {
  const input = base();
  input.assets[0] = { ...input.assets[0]!, scope: 'legacy-partner', partnerId: 'partner-1' };
  const report = buildLegacyInventory(input);
  assert.equal(report.outputComparison.status, 'blocked');
  assert.ok(report.unresolved.some((row) => row.source === 'frames.ownership' && row.id === 'legacy-frame'));
});

test('malformed legacy field values are summarized without exposing their contents', () => {
  const input = base();
  const privateMarker = 'owner@example.test';
  input.assets[0] = { ...input.assets[0]!, scope: { ownerEmail: privateMarker }, partnerId: 'partner-1' };
  const report = buildLegacyInventory(input);
  assert.equal(report.changes[0]?.from.scope, '[object]');
  assert.equal(JSON.stringify(report).includes(privateMarker), false);
});

test('an asset URL repeated as its own thumbnail is not called a duplicate across assets', () => {
  const input = base();
  input.assets = [{ kind: 'frames', id: 'single-frame', imageUrl: 'https://media.example/frame.png', thumbnailUrl: 'https://media.example/frame.png' }];
  input.partners = [];
  input.events = [];
  input.templates = [];
  input.globalDefaultTemplateId = null;
  input.directPictureRefs = [];
  assert.equal(buildLegacyInventory(input).summary.duplicatePictureAddresses, 0);
});

test('broken visual references and stale or wrong-owner templates are explicit blockers', () => {
  const input = base();
  input.partners[0]!.library = { frames: ['missing-frame'] };
  input.events[0]!.experienceTemplate = { mode: 'template', templateId: 'global-template' };
  const report = buildLegacyInventory(input);
  assert.equal(report.outputComparison.status, 'blocked');
  assert.ok(report.unresolved.some((row) => row.reason.includes('asset is missing')));
  assert.ok(report.unresolved.some((row) => row.reason.includes('wrong level or owner')));
});

test('duplicate IDs block, duplicate addresses are hashed and never emitted', () => {
  const input = base();
  input.assets.push({ kind: 'frames', id: 'legacy-frame', imageUrl: 'https://media.example/frame.png' });
  const report = buildLegacyInventory(input);
  assert.equal(report.summary.duplicateIds, 1);
  assert.equal(report.outputComparison.status, 'blocked');
  assert.ok(report.duplicatePictureAddresses.some((row) => row.count > 1));
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('https://media.example'), false);
});

test('source digest is stable when record order changes', () => {
  const input = base();
  const expected = buildLegacyInventory(input).sourceDigest;
  input.assets.reverse();
  input.partners.reverse();
  input.events.reverse();
  assert.equal(buildLegacyInventory(input).sourceDigest, expected);
});
