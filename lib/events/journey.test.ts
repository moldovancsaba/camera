import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomPage } from '@/lib/db/schemas';
import { DEFAULT_CONSENT_PAGE_ID, DEFAULT_WELCOME_PAGE_ID, sanitizeDefaultPageOrders, withDefaultJourneyPages } from './default-pages';
import { DEFAULT_IDENTITY_PAGE_ID } from './identity-page';
import { documentSettings, effectiveCheckboxes } from './checkbox-settings';
import { customiseDefault, effectiveJourney, hasSeparateSubmit, moveJourneyRow, moveTarget, setSubmitSeparate, type JourneyContext, type JourneyRow } from './journey';

const page = (pageType: string, order: number, isActive = true, pageId = `${pageType}-${order}`): CustomPage =>
  ({ pageId, pageType, order, isActive, config: { title: pageType, description: '', buttonText: 'Next' }, createdAt: 'x', updatedAt: 'x' }) as unknown as CustomPage;
const ALL: JourneyContext = { vettingRequired: true, consentDefault: true, language: 'en' };
const NOW = '2026-10-09T08:00:00.000Z';
const label = (row: JourneyRow) => (row.kind === 'step' ? `step:${row.id}` : `${row.kind}:${row.page.pageId}`);
const sequence = (rows: JourneyRow[]) => rows.map(label);

test('the journey is welcome, consent, login, selfie taking, then the steps that are not pages, then the rest', () => {
  const own = [page('welcome', -1), page('take-photo', 0), page('cta', 1)];
  assert.deepEqual(sequence(effectiveJourney(own, ALL, NOW)), [
    'own:welcome--1',
    `default:${DEFAULT_CONSENT_PAGE_ID}`,
    `default:${DEFAULT_IDENTITY_PAGE_ID}`,
    'own:take-photo-0',
    'step:waiting',
    'step:emails',
    'step:result',
    'own:cta-1',
  ]);
});

test('the pages of the journey are exactly the pages the user gets: the same function, own pages and defaults', () => {
  const cases: Array<[CustomPage[], JourneyContext]> = [
    [[page('welcome', -1), page('take-photo', 0), page('cta', 1)], ALL],
    [[page('take-photo', 0)], ALL],
    [[], ALL],
    [[page('welcome', -2), page('accept', -1, true, 'own-consent'), page('take-photo', 0)], ALL],
    [[page('welcome', -1), page('take-photo', 0)], { vettingRequired: false, consentDefault: false, language: 'en' }],
    [[page('welcome', -1), page('take-photo', 0)], { vettingRequired: true, consentDefault: false, language: 'hu' }],
    [[page('take-photo', 0), page('cta', 1, false)], ALL],
  ];
  for (const [own, context] of cases) {
    const forUser = withDefaultJourneyPages(own, { vettingRequired: context.vettingRequired, consentDefault: context.consentDefault, language: context.language, now: NOW })
      .filter((p) => p.isActive)
      .sort((a, b) => a.order - b.order)
      .map((p) => p.pageId);
    const inEditor = effectiveJourney(own, context, NOW).flatMap((row) => (row.kind === 'step' || !row.page.isActive ? [] : [row.page.pageId]));
    assert.deepEqual(inEditor, forUser);
  }
});

test('a default row says what it is; an own page is never marked as a default', () => {
  const rows = effectiveJourney([page('take-photo', 0)], ALL, NOW);
  const consent = rows.find((row) => row.kind === 'default' && row.page.pageId === DEFAULT_CONSENT_PAGE_ID);
  assert.ok(consent && consent.kind === 'default' && consent.reason.length > 20);
  assert.equal(rows.filter((row) => row.kind === 'own').length, 1);
});

test('without photo approval the user sees the share screen at once; with it the user waits', () => {
  const own = [page('take-photo', 0)];
  const waiting = sequence(effectiveJourney(own, { ...ALL, vettingRequired: true }, NOW)).filter((s) => s.startsWith('step:'));
  const sharing = sequence(effectiveJourney(own, { ...ALL, vettingRequired: false }, NOW)).filter((s) => s.startsWith('step:'));
  assert.deepEqual(waiting, ['step:waiting', 'step:emails', 'step:result']);
  assert.deepEqual(sharing, ['step:share', 'step:emails', 'step:result']);
});

test('an event with no take-photo page has everything before the photo, as the user page treats it; the steps come last', () => {
  assert.deepEqual(sequence(effectiveJourney([page('welcome', -1), page('cta', 1)], ALL, NOW)), [
    'own:welcome--1',
    `default:${DEFAULT_CONSENT_PAGE_ID}`,
    `default:${DEFAULT_IDENTITY_PAGE_ID}`,
    'own:cta-1',
    'step:waiting',
    'step:emails',
    'step:result',
  ]);
});

test('a page that is switched off stays reachable in the editor, marked as off, and is not part of what the user goes through', () => {
  const rows = effectiveJourney([page('take-photo', 0), page('cta', 1, false)], { vettingRequired: false, consentDefault: false, language: 'en' }, NOW);
  const cta = rows.find((row) => row.kind === 'own' && row.page.pageType === 'cta');
  assert.ok(cta && cta.kind === 'own' && cta.page.isActive === false);
});

test('Customise makes an own page with the default texts in the default place, and the journey does not change', () => {
  const stored = [page('welcome', -1), page('take-photo', 0)];
  const before = effectiveJourney(stored, ALL, NOW);
  const defaultConsent = before.find((row) => row.kind === 'default' && row.page.pageId === DEFAULT_CONSENT_PAGE_ID);
  assert.ok(defaultConsent && defaultConsent.kind === 'default');

  const own = customiseDefault(defaultConsent.page, () => 'own-consent-id', NOW);
  assert.equal(own.pageId, 'own-consent-id');
  assert.equal(own.order, defaultConsent.page.order);
  assert.deepEqual(own.config, defaultConsent.page.config, 'filled with the default texts');
  assert.notEqual(own.config, defaultConsent.page.config, 'its own copy');
  (own.config as { title: string }).title = 'changed';
  assert.notEqual((defaultConsent.page.config as { title: string }).title, 'changed');

  const after = effectiveJourney([...stored, { ...own, config: structuredClone(defaultConsent.page.config) }], ALL, NOW);
  assert.deepEqual(
    sequence(after).map((s) => s.replace('own-consent-id', DEFAULT_CONSENT_PAGE_ID).replace(/^own:default-consent$/, `default:${DEFAULT_CONSENT_PAGE_ID}`)),
    sequence(before),
    'the same steps in the same order; only the consent row is now an own page'
  );
  assert.equal(after.some((row) => row.kind === 'default' && row.page.pageId === DEFAULT_CONSENT_PAGE_ID), false, 'the own page wins');
});

test('deleting the own page brings the default back', () => {
  const stored = [page('take-photo', 0)];
  const defaultLogin = effectiveJourney(stored, ALL, NOW).find((row) => row.kind === 'default' && row.page.pageId === DEFAULT_IDENTITY_PAGE_ID);
  assert.ok(defaultLogin && defaultLogin.kind === 'default');
  const own = customiseDefault(defaultLogin.page, () => 'own-login-id', NOW);
  const withOwn = effectiveJourney([...stored, own], ALL, NOW);
  assert.equal(withOwn.some((row) => row.kind === 'default' && row.page.pageId === DEFAULT_IDENTITY_PAGE_ID), false);
  const afterDelete = effectiveJourney(stored, ALL, NOW);
  assert.equal(afterDelete.some((row) => row.kind === 'default' && row.page.pageId === DEFAULT_IDENTITY_PAGE_ID), true);
});

test('the stored pages are never changed by building the journey', () => {
  const stored = [page('welcome', -1), page('take-photo', 0)];
  const copy = structuredClone(stored);
  effectiveJourney(stored, ALL, NOW);
  assert.deepEqual(stored, copy);
});

test('the default welcome page is the first row, marked Default with its reason, when the event has the picture; Customise makes an own welcome page that keeps following the picture', () => {
  const stored = [page('take-photo', 0)];
  const rows = effectiveJourney(stored, { ...ALL, hasWelcomeScreen: true }, NOW);
  assert.equal(label(rows[0]), `default:${DEFAULT_WELCOME_PAGE_ID}`);
  const first = rows[0];
  assert.ok(first.kind === 'default' && /default slideshow/.test(first.reason));
  const own = customiseDefault(first.page, () => 'own-welcome-id', NOW);
  assert.equal((own.config as { screenImageUrl?: string }).screenImageUrl, undefined, 'no picture is copied into the own page');
  const withOwn = effectiveJourney([...stored, own], { ...ALL, hasWelcomeScreen: true }, NOW);
  assert.equal(withOwn.some((row) => row.kind === 'default' && row.page.pageId === DEFAULT_WELCOME_PAGE_ID), false, 'the own page wins');
  assert.equal(effectiveJourney(stored, ALL, NOW).some((row) => row.kind === 'default' && row.page.pageId === DEFAULT_WELCOME_PAGE_ID), false, 'no picture, no default welcome page');
});

const START = [page('welcome', -1), page('take-photo', 0), page('cta', 1)];
const rowsOf = (own: CustomPage[], defaultOrders?: Record<string, number>) => effectiveJourney(own, { ...ALL, defaultOrders }, NOW);
const at = (rows: JourneyRow[], id: string) => rows.findIndex((row) => row.kind !== 'step' && row.page.pageId === id);

test('a default page can move among the pages before the photo, but never across the take-photo page, and the built-in steps are not pages', () => {
  const rows = rowsOf(START);
  // welcome, default consent, default login, take-photo, 3 built-in steps, cta
  assert.equal(moveTarget(rows, at(rows, DEFAULT_CONSENT_PAGE_ID), 1), at(rows, DEFAULT_IDENTITY_PAGE_ID), 'consent down: swaps with the login');
  assert.equal(moveTarget(rows, at(rows, DEFAULT_IDENTITY_PAGE_ID), -1), at(rows, DEFAULT_CONSENT_PAGE_ID));
  assert.equal(moveTarget(rows, at(rows, DEFAULT_IDENTITY_PAGE_ID), 1), null, 'the login cannot go behind the photo: a photo that is checked needs an identity first');
  assert.equal(moveTarget(rows, at(rows, 'take-photo-0'), -1), null, 'and the take-photo page cannot move in front of a default page');
  assert.equal(moveTarget(rows, at(rows, 'cta-1'), -1), at(rows, 'take-photo-0'), 'an own page moves past the built-in steps to the next page row');
  assert.equal(moveTarget(rows, at(rows, 'cta-1'), 1), null, 'nothing below the last page');
  assert.equal(moveTarget(rows, rows.findIndex((row) => row.kind === 'step'), 1), null, 'a built-in step has no place of its own');
  assert.equal(moveTarget(rows, at(rows, DEFAULT_CONSENT_PAGE_ID), -1), at(rows, 'welcome--1'), 'consent up: above the welcome page');
});

test('moving a default page saves its place and the places of every page, and the editor and the user see the same journey afterwards', () => {
  const rows = rowsOf(START);
  const moved = moveJourneyRow(rows, at(rows, DEFAULT_CONSENT_PAGE_ID), 1)!;
  assert.deepEqual(moved.defaultOrders, { [DEFAULT_IDENTITY_PAGE_ID]: 1, [DEFAULT_CONSENT_PAGE_ID]: 2 });
  assert.deepEqual(moved.pages.map((p) => [p.pageId, p.order]), [['welcome--1', 0], ['take-photo-0', 3], ['cta-1', 4]]);
  const after = effectiveJourney(moved.pages, { ...ALL, defaultOrders: moved.defaultOrders }, NOW);
  assert.deepEqual(sequence(after), ['own:welcome--1', `default:${DEFAULT_IDENTITY_PAGE_ID}`, `default:${DEFAULT_CONSENT_PAGE_ID}`, 'own:take-photo-0', 'step:waiting', 'step:emails', 'step:result', 'own:cta-1']);
  // the user gets exactly these pages in this order (the same function with the same places)
  const forUser = withDefaultJourneyPages(moved.pages, { vettingRequired: true, consentDefault: true, language: 'en', now: NOW, defaultOrders: moved.defaultOrders }).sort((a, b) => a.order - b.order).map((p) => p.pageId);
  assert.deepEqual(forUser, ['welcome--1', DEFAULT_IDENTITY_PAGE_ID, DEFAULT_CONSENT_PAGE_ID, 'take-photo-0', 'cta-1']);
  assert.equal(moveJourneyRow(rows, at(rows, DEFAULT_IDENTITY_PAGE_ID), 1), null);
});

test('an own page that moves past a default page numbers the default pages too, so the order the editor shows is the order saved', () => {
  const rows = rowsOf([page('welcome', -1), page('cta', 1, true, 'own-cta'), page('take-photo', 5)]);
  // welcome, consent, login, own-cta, take-photo: the own cta moves above the login
  const moved = moveJourneyRow(rows, at(rows, 'own-cta'), -1)!;
  const after = effectiveJourney(moved.pages, { ...ALL, defaultOrders: moved.defaultOrders }, NOW);
  assert.deepEqual(sequence(after).filter((id) => !id.startsWith('step:')), ['own:welcome--1', `default:${DEFAULT_CONSENT_PAGE_ID}`, 'own:own-cta', `default:${DEFAULT_IDENTITY_PAGE_ID}`, 'own:take-photo-5']);
});

test('without default pages the move is the plain swap of the own pages that it always was', () => {
  const none: JourneyContext = { vettingRequired: false, consentDefault: false, language: 'en' };
  const rows = effectiveJourney([page('welcome', -1), page('cta', 1), page('take-photo', 0)], none, NOW);
  const moved = moveJourneyRow(rows, at(rows, 'cta-1'), -1)!;
  assert.deepEqual(moved.defaultOrders, {});
  assert.deepEqual(moved.pages.map((p) => [p.pageId, p.order]), [['welcome--1', 0], ['cta-1', 1], ['take-photo-0', 2]].sort((a, b) => (a[1] as number) - (b[1] as number)));
});

test('only the known default pages, with finite numbers, can be saved as places', () => {
  assert.deepEqual(sanitizeDefaultPageOrders({ [DEFAULT_CONSENT_PAGE_ID]: 2, [DEFAULT_IDENTITY_PAGE_ID]: 1 }), { [DEFAULT_CONSENT_PAGE_ID]: 2, [DEFAULT_IDENTITY_PAGE_ID]: 1 });
  assert.deepEqual(sanitizeDefaultPageOrders({}), {}, 'an empty object clears the places');
  for (const bad of [null, undefined, 'x', [], { other: 1 }, { [DEFAULT_CONSENT_PAGE_ID]: 'a' }, { [DEFAULT_CONSENT_PAGE_ID]: Infinity }, { [DEFAULT_CONSENT_PAGE_ID]: 1e9 }]) assert.equal(sanitizeDefaultPageOrders(bad), null);
});

const WITH_SUBMIT = [page('welcome', -1), page('take-photo', 0), page('who-are-you', 1, true, 'login-after'), page('submit', 2), page('cta', 3)];

test('with a Submit page the pages between the photo and the Submit page run before the save, and the built-in steps follow the Submit page (issue 535)', () => {
  const rows = rowsOf(WITH_SUBMIT);
  assert.deepEqual(sequence(rows).filter((id) => !id.startsWith('default:')), ['own:welcome--1', 'own:take-photo-0', 'own:login-after', 'own:submit-2', 'step:waiting', 'step:emails', 'step:result', 'own:cta-3']);
  const waiting = rows.find((row) => row.kind === 'step' && row.id === 'waiting');
  assert.match(waiting && waiting.kind === 'step' ? waiting.description : '', /the Submit step saves the photo/);
  const without = effectiveJourney([page('welcome', -1), page('take-photo', 0), page('cta', 1)], ALL, NOW).find((row) => row.kind === 'step' && row.id === 'waiting');
  assert.match(without && without.kind === 'step' ? without.description : '', /Continue saves the photo/, 'without it the text is the one it was');
});

test('a login between the photo and the Submit page counts as before the save, so no default login is added; without it the default is added as before', () => {
  const withLogin = withDefaultJourneyPages(WITH_SUBMIT, { vettingRequired: true, consentDefault: false, language: 'en', now: NOW }).map((p) => p.pageId);
  assert.equal(withLogin.includes(DEFAULT_IDENTITY_PAGE_ID), false);
  const noLogin = withDefaultJourneyPages([page('take-photo', 0), page('submit', 1)], { vettingRequired: true, consentDefault: false, language: 'en', now: NOW }).map((p) => p.pageId);
  assert.equal(noLogin.includes(DEFAULT_IDENTITY_PAGE_ID), true, 'a Submit page alone does not identify anybody');
  const consentBetween = withDefaultJourneyPages([page('take-photo', 0), page('accept', 1), page('submit', 2)], { vettingRequired: false, consentDefault: true, language: 'en', now: NOW }).map((p) => p.pageId);
  assert.equal(consentBetween.includes(DEFAULT_CONSENT_PAGE_ID), false, 'a consent page between the two counts');
});

test('the Submit page stays after the take-photo page, and a default page may move between them but never behind the Submit page (issue 535)', () => {
  const rows = rowsOf([page('welcome', -1), page('take-photo', 0), page('submit', 1)]);
  assert.equal(moveTarget(rows, at(rows, 'submit-1'), -1), null, 'the Submit page cannot go above the take-photo page');
  assert.equal(moveTarget(rows, at(rows, 'take-photo-0'), 1), null, 'and the take-photo page cannot go below it');
  assert.equal(moveTarget(rows, at(rows, DEFAULT_IDENTITY_PAGE_ID), 1), at(rows, 'take-photo-0'), 'with a Submit page the login may move behind the photo');
  const moved = moveJourneyRow(rows, at(rows, DEFAULT_IDENTITY_PAGE_ID), 1)!;
  const after = effectiveJourney(moved.pages, { ...ALL, defaultOrders: moved.defaultOrders }, NOW);
  const seq = sequence(after).filter((id) => !id.startsWith('step:'));
  assert.deepEqual(seq.slice(-3), ['own:take-photo-0', `default:${DEFAULT_IDENTITY_PAGE_ID}`, 'own:submit-1']);
  const next = rowsOf(moved.pages, moved.defaultOrders);
  assert.equal(moveTarget(next, at(next, DEFAULT_IDENTITY_PAGE_ID), 1), null, 'but never behind the Submit page');
  // without a Submit page the rule of step 1 holds
  const plain = rowsOf(START);
  assert.equal(moveTarget(plain, at(plain, DEFAULT_IDENTITY_PAGE_ID), 1), null);
});

test('unticking "Submit is part of this page" puts a Submit page right after the take-photo page; ticking it takes it out again (issue 535)', () => {
  const rows = rowsOf(START);
  assert.equal(hasSeparateSubmit(rows), false);
  const separate = setSubmitSeparate(rows, true, () => 'submit-new', NOW);
  const journey = effectiveJourney(separate.pages, { ...ALL, defaultOrders: separate.defaultOrders }, NOW);
  assert.deepEqual(sequence(journey).filter((id) => !id.startsWith('step:')), ['own:welcome--1', `default:${DEFAULT_CONSENT_PAGE_ID}`, `default:${DEFAULT_IDENTITY_PAGE_ID}`, 'own:take-photo-0', 'own:submit-new', 'own:cta-1']);
  assert.equal(hasSeparateSubmit(journey), true);
  const submit = separate.pages.find((p) => p.pageId === 'submit-new')!;
  assert.deepEqual([submit.pageType, submit.isActive, submit.config.title], ['submit', true, '[Submit]']);
  const back = setSubmitSeparate(journey, false);
  assert.equal(back.pages.some((p) => p.pageType === 'submit'), false);
  const again = effectiveJourney(back.pages, { ...ALL, defaultOrders: back.defaultOrders }, NOW);
  assert.deepEqual(sequence(again), sequence(rows), 'ticked again: the journey is the one it was');
  // without a Submit page twice
  assert.equal(setSubmitSeparate(rows, true, () => 'a', NOW).pages.filter((p) => p.pageType === 'submit').length, 1);
});

test('the journey the editor builds and the pages the user gets agree when the documents of the default consent page are set (issue 558): the same checkboxes, off ones missing, optional ones marked', () => {
  const documents = documentSettings(effectiveCheckboxes({ consentSettings: { terms: { shown: true, required: true }, cookies: { shown: false }, privacy: { shown: true, required: false } } }, null));
  const own = [page('take-photo', 0)];
  const context: JourneyContext = { ...ALL, vettingRequired: false, documents };
  const row = effectiveJourney(own, context, NOW).find((r) => r.kind === 'default' && r.page.pageId === DEFAULT_CONSENT_PAGE_ID);
  const forUser = withDefaultJourneyPages(own, { vettingRequired: false, consentDefault: true, language: 'en', now: NOW, documents }).find((p) => p.pageId === DEFAULT_CONSENT_PAGE_ID);
  assert.ok(row && row.kind === 'default' && forUser);
  assert.deepEqual(row.page.config, forUser.config);
  assert.deepEqual((row.page.config as { checkboxes: unknown[] }).checkboxes.length, 2);
  const standard = effectiveJourney(own, { ...ALL, vettingRequired: false }, NOW).find((r) => r.kind === 'default' && r.page.pageId === DEFAULT_CONSENT_PAGE_ID);
  assert.equal((standard?.kind === 'default' ? (standard.page.config as { checkboxes: unknown[] }).checkboxes.length : 0), 3);
});
