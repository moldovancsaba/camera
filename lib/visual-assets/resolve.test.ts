import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAssetVisibility, resolveTemplateConfig, uniqueRefs } from './resolve';

const globalAsset = { scope: 'global' as const, isActive: true };

test('global shared assets cascade by default; child-level hides only affect that child', () => {
  assert.deepEqual(resolveAssetVisibility({ asset: globalAsset, kind: 'images', id: 'g1', targetLevel: 'partner', partnerId: 'p1' }), { available: true, source: 'global' });
  assert.deepEqual(resolveAssetVisibility({ asset: globalAsset, kind: 'images', id: 'g1', targetLevel: 'event', partnerId: 'p1', eventId: 'e1' }), { available: true, source: 'global' });
  assert.deepEqual(resolveAssetVisibility({ asset: globalAsset, kind: 'images', id: 'g1', targetLevel: 'event', partnerId: 'p1', eventId: 'e1', eventPolicy: { hidden: [{ kind: 'images', id: 'g1' }] } }), { available: false, source: 'global', reason: 'hidden-at-event' });
});

test('a parent stop cannot be overridden by a child and partner forwarding is independent', () => {
  assert.equal(resolveAssetVisibility({ asset: { ...globalAsset, shareToChildren: false }, kind: 'logos', id: 'g1', targetLevel: 'partner', partnerId: 'p1' }).available, false);
  assert.equal(resolveAssetVisibility({ asset: globalAsset, kind: 'logos', id: 'g1', targetLevel: 'event', partnerId: 'p1', eventId: 'e1', partnerPolicy: { blockedForChildren: [{ kind: 'logos', id: 'g1' }] } }).available, false);
});

test('child-level hiding is local, while a parent source switch blocks every descendant', () => {
  const partnerHidden = { hidden: [{ kind: 'images' as const, id: 'g1' }] };
  assert.equal(resolveAssetVisibility({ asset: globalAsset, kind: 'images', id: 'g1', targetLevel: 'partner', partnerId: 'p1', partnerPolicy: partnerHidden }).available, false);
  assert.equal(resolveAssetVisibility({ asset: globalAsset, kind: 'images', id: 'g1', targetLevel: 'event', partnerId: 'p1', eventId: 'e1', partnerPolicy: partnerHidden }).available, false, 'a partner hide also hides the item from its event children');
  assert.equal(resolveAssetVisibility({ asset: globalAsset, kind: 'images', id: 'g1', targetLevel: 'event', partnerId: 'p2', eventId: 'e2' }).available, true, 'another partner is unaffected');
  assert.equal(resolveAssetVisibility({ asset: { ...globalAsset, isActive: false }, kind: 'images', id: 'g1', targetLevel: 'event', partnerId: 'p1', eventId: 'e1' }).available, false);
});

test('inactive and wrong-owner media cannot become selectable', () => {
  assert.equal(resolveAssetVisibility({ asset: { ...globalAsset, isActive: false }, kind: 'frames', id: 'f1', targetLevel: 'event', partnerId: 'p1', eventId: 'e1' }).available, false);
  assert.deepEqual(resolveAssetVisibility({ asset: { scope: 'partner', partnerId: 'p2' }, kind: 'frames', id: 'f1', targetLevel: 'event', partnerId: 'p1', eventId: 'e1' }), { available: false, source: 'partner', reason: 'wrong-owner' });
});

test('a newly private global or partner asset stays at its owner level until explicitly shared', () => {
  assert.deepEqual(
    resolveAssetVisibility({ asset: { ...globalAsset, shareToChildren: false }, kind: 'images', id: 'private-global', targetLevel: 'partner', partnerId: 'p1' }),
    { available: false, source: 'global', reason: 'not-shared' },
  );
  assert.deepEqual(
    resolveAssetVisibility({ asset: { scope: 'partner', partnerId: 'p1', isActive: true, shareToChildren: false }, kind: 'images', id: 'private-partner', targetLevel: 'event', partnerId: 'p1', eventId: 'e1' }),
    { available: false, source: 'partner', reason: 'not-shared' },
  );
  assert.equal(resolveAssetVisibility({ asset: { scope: 'partner', partnerId: 'p1', shareToChildren: false }, kind: 'images', id: 'private-partner', targetLevel: 'partner', partnerId: 'p1' }).available, true, 'owner retains local access');
});

test('template inheritance preserves explicit child overrides without writing them into the parent', () => {
  const global = { background: 'g', heading: 'Welcome', logo: 'g-logo' };
  const partner = { mode: 'inherit' as const, overrides: { background: 'p' } };
  const event = { mode: 'inherit' as const, overrides: { heading: 'Match day' } };
  assert.deepEqual(resolveTemplateConfig([{ value: global }, partner, event]), { background: 'p', heading: 'Match day', logo: 'g-logo' });
  assert.deepEqual(global, { background: 'g', heading: 'Welcome', logo: 'g-logo' });
});

test('a level template starts that level from its own configuration', () => {
  assert.deepEqual(resolveTemplateConfig([{ value: { background: 'g', logo: 'g' } }, { mode: 'template', value: { background: 'p' } }]), { background: 'p' });
});

test('template overrides deep-merge object fields and replace arrays as a unit', () => {
  const config = resolveTemplateConfig([
    { value: { welcome: { title: 'Welcome', description: 'Start', buttons: ['camera', 'next'] }, colors: { primary: 'blue', accent: 'white' } } },
    { mode: 'inherit', overrides: { welcome: { title: 'Hello', buttons: ['start'] }, colors: { primary: 'navy' } } },
  ]);
  assert.deepEqual(config, {
    welcome: { title: 'Hello', description: 'Start', buttons: ['start'] },
    colors: { primary: 'navy', accent: 'white' },
  });
});

test('an explicit null override clears only that field', () => {
  assert.deepEqual(resolveTemplateConfig([
    { value: { logo: { url: '/logo.png', alt: 'Club' }, background: '/bg.png' } },
    { mode: 'inherit', overrides: { logo: { url: null } } },
  ]), { logo: { url: null, alt: 'Club' }, background: '/bg.png' });
});

test('asset policy references are normalized and deduplicated', () => {
  assert.deepEqual(uniqueRefs([{ kind: 'images', id: 'a' }, { kind: 'images', id: 'a' }, { kind: 'frames', id: 'f' }, { kind: 'logos', id: ' ' }]), [{ kind: 'images', id: 'a' }, { kind: 'frames', id: 'f' }]);
});
