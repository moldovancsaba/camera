import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import type { PartnerDefaultSlideshow, ParentSlideshowTemplate } from '@/lib/db/schemas';
import { mutateParentSlideshowTemplates, normalizeParentSlideshowTemplates, resolveParentSlideshowDefault, type ParentSlideshowTemplateState } from './parent-templates';

const slideshow = (name: string): PartnerDefaultSlideshow => ({
  name,
  isActive: true,
  transitionDurationMs: 5000,
  fadeDurationMs: 1000,
  bufferSize: 10,
  refreshStrategy: 'continuous',
  playMode: 'loop',
  orderMode: 'fixed',
  crossfade: false,
  backgroundPrimaryColor: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY,
  backgroundAccentColor: SLIDESHOW_DEFAULT_BACKGROUND_ACCENT,
  backgroundImageUrl: null,
  viewportScale: 'fit',
  stageAspect: null,
  screenDesign: null,
});

const state = (templates: ParentSlideshowTemplate[], defaultId: string | null, revision = 3): ParentSlideshowTemplateState => ({
  revision,
  slideshowTemplates: templates,
  defaultSlideshowTemplateId: defaultId,
  slideshow: templates.find((item) => item.templateId === defaultId) ?? null,
});

async function assertApiError(action: () => unknown, status: number, message: RegExp): Promise<void> {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof Response, 'expected an API response to be thrown');
  assert.equal(thrown.status, status);
  const body = await thrown.json() as { error?: string };
  assert.match(body.error ?? '', message);
}

test('legacy single slideshow is exposed as a normalized named template without leaking stored fields', () => {
  const normalized = normalizeParentSlideshowTemplates({
    revision: 4,
    slideshow: { ...slideshow('Legacy'), legacyOnlyField: 'drop me' },
  }, 'legacy-parent-slideshow', true);

  assert.equal(normalized.defaultSlideshowTemplateId, 'legacy-parent-slideshow');
  assert.equal(normalized.slideshowTemplates.length, 1);
  assert.equal(normalized.slideshowTemplates[0].name, 'Legacy');
  assert.equal('legacyOnlyField' in normalized.slideshowTemplates[0], false);
  assert.equal('templateId' in (normalized.slideshow ?? {}), false);
});

test('a blank named-template record still migrates its valid legacy slideshow', () => {
  const normalized = normalizeParentSlideshowTemplates({ slideshowTemplates: [], slideshow: slideshow('Legacy') }, 'legacy-id', true);
  assert.equal(normalized.slideshowTemplates[0]?.name, 'Legacy');
  assert.equal(normalized.defaultSlideshowTemplateId, 'legacy-id');
});

test('malformed and duplicate stored templates are skipped and global selection falls back safely', () => {
  const normalized = normalizeParentSlideshowTemplates({
    revision: -1,
    defaultSlideshowTemplateId: 'missing',
    slideshowTemplates: [
      { ...slideshow('Good'), templateId: 'good' },
      { ...slideshow('good'), templateId: 'duplicate-name' },
      { ...slideshow('Broken'), templateId: 'broken', backgroundPrimaryColor: 'not-a-color' },
      null,
    ],
  }, 'legacy-id', true);

  assert.deepEqual(normalized.slideshowTemplates.map((item) => item.templateId), ['good']);
  assert.equal(normalized.defaultSlideshowTemplateId, 'good');
  assert.equal(normalized.revision, 0);
});

test('partners can keep inheriting while global levels always select the first created default', () => {
  const emptyPartner = normalizeParentSlideshowTemplates({ slideshowTemplates: [] }, 'legacy-partner', false);
  const partner = mutateParentSlideshowTemplates(emptyPartner, {
    action: 'create', revision: 0, name: 'Partner option', value: slideshow('ignored name'),
  }, false, 'legacy-partner');
  assert.equal(partner.defaultSlideshowTemplateId, null);

  const emptyGlobal = normalizeParentSlideshowTemplates({ slideshowTemplates: [] }, 'legacy-global', true);
  const global = mutateParentSlideshowTemplates(emptyGlobal, {
    action: 'create', revision: 0, name: 'Global first', value: slideshow('ignored name'),
  }, true, 'legacy-global');
  assert.equal(global.defaultSlideshowTemplateId, global.slideshowTemplates[0].templateId);
});

test('parent resolution passes one selected partner slideshow down, falling back to the selected global slideshow', () => {
  const global = {
    revision: 8,
    slideshowTemplates: [{ ...slideshow('Global screen'), templateId: 'global-screen' }],
    defaultSlideshowTemplateId: 'global-screen',
  };
  const partner = {
    revision: 14,
    slideshowTemplates: [
      { ...slideshow('Partner selected'), templateId: 'partner-selected' },
      { ...slideshow('Partner inactive'), templateId: 'partner-inactive', isActive: false },
    ],
    defaultSlideshowTemplateId: 'partner-selected',
  };

  assert.deepEqual(resolveParentSlideshowDefault(partner, global, 'p1'), {
    level: 'partner', templateId: 'partner-selected', revision: 14,
    slideshow: slideshow('Partner selected'),
  });
  assert.deepEqual(resolveParentSlideshowDefault({ ...partner, defaultSlideshowTemplateId: 'partner-inactive' }, global, 'p1'), {
    level: 'global', templateId: 'global-screen', revision: 8,
    slideshow: slideshow('Global screen'),
  });
  assert.deepEqual(resolveParentSlideshowDefault({ slideshowTemplates: [] }, global, 'p1')?.level, 'global');
  assert.equal(resolveParentSlideshowDefault({ slideshowTemplates: [] }, null, 'p1'), null);
});

test('create, select, update, rename and delete preserve the one-default inheritance rules', async () => {
  const first = { ...slideshow('First'), templateId: 'first' };
  const second = { ...slideshow('Second'), templateId: 'second' };
  let current = state([first, second], 'first');

  current = mutateParentSlideshowTemplates(current, { action: 'select', revision: 3, templateId: 'second' }, false, 'legacy');
  assert.equal(current.defaultSlideshowTemplateId, 'second');

  current = mutateParentSlideshowTemplates(current, { action: 'update', revision: 4, templateId: 'second', value: { ...slideshow('Second updated'), backgroundImageUrl: 'https://cdn.example/background.png' } }, false, 'legacy');
  assert.equal(current.slideshow?.name, 'Second updated');
  assert.equal(current.slideshow?.backgroundImageUrl, 'https://cdn.example/background.png');

  current = mutateParentSlideshowTemplates(current, { action: 'rename', revision: 5, templateId: 'first', name: 'First renamed' }, false, 'legacy');
  assert.equal(current.slideshowTemplates[0].name, 'First renamed');

  await assertApiError(() => mutateParentSlideshowTemplates(current, { action: 'delete', revision: 6, templateId: 'second' }, false, 'legacy'), 409, /Select another default/);
  current = mutateParentSlideshowTemplates(current, { action: 'select', revision: 6, templateId: null }, false, 'legacy');
  current = mutateParentSlideshowTemplates(current, { action: 'delete', revision: 7, templateId: 'second' }, false, 'legacy');
  assert.equal(current.defaultSlideshowTemplateId, null);
  assert.deepEqual(current.slideshowTemplates.map((item) => item.templateId), ['first']);
});

test('duplicate names, stale writes, and clearing the global default are rejected', async () => {
  const first = { ...slideshow('First'), templateId: 'first' };
  const current = state([first], 'first');
  await assertApiError(() => mutateParentSlideshowTemplates(current, { action: 'create', revision: 3, name: ' first ', value: slideshow('New') }, true, 'legacy'), 400, /already exists/);
  await assertApiError(() => mutateParentSlideshowTemplates(current, { action: 'select', revision: 2, templateId: 'first' }, true, 'legacy'), 409, /changed elsewhere/);
  await assertApiError(() => mutateParentSlideshowTemplates(current, { action: 'select', revision: 3, templateId: null }, true, 'legacy'), 400, /global default must be selected/);
});
