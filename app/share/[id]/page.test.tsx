import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ObjectId } from 'mongodb';

type PageModule = typeof import('./page');
const importPage = (caseId: string) => import('./page?case=' + caseId) as Promise<PageModule>;

const TOKEN = 'tok_abcdefghijklmnopqrst';
const EVENT_ID = new ObjectId();

interface Doc extends Record<string, unknown> {
  _id: ObjectId;
}

function photo(extra: Record<string, unknown> = {}): Doc {
  return {
    _id: new ObjectId(),
    eventId: 'event-uuid',
    eventIds: ['event-uuid'],
    submissionKind: 'original',
    imageUrl: 'https://store.test/submission-1.jpg',
    userName: 'Guest',
    userInfo: { name: 'Ann', email: 'ann@example.com' },
    createdAt: '2026-10-06T12:00:00.000Z',
    metadata: { finalWidth: 1920, finalHeight: 1080 },
    ...extra,
  };
}

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  if (Array.isArray(filter.$or)) return (filter.$or as Array<Record<string, unknown>>).some((clause) => matches(doc, clause));
  if ('_id' in filter) return String(filter._id) === String(doc._id);
  if ('shareToken' in filter) return doc.shareToken === filter.shareToken;
  return false;
}

function mockDb(t: TestContext, docs: Doc[], eventExtra: Record<string, unknown> = {}) {
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async (filter: Record<string, unknown>) => {
            if (name === 'events') return { _id: EVENT_ID, eventId: 'event-uuid', name: 'Derby', ...eventExtra };
            return docs.find((doc) => matches(doc, filter)) ?? null;
          },
          find: () => ({ sort: () => ({ toArray: async () => [] }), toArray: async () => [] }),
        }),
      }),
    },
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const isNotFound = (error: unknown) => /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(String((error as { digest?: unknown })?.digest ?? error));

type Element = { type: unknown; props: Record<string, unknown> };

/** The element the page renders, without the theme wrapper around it (camera#285). */
function inner(element: Element): Element {
  const child = element.props.children as Element | undefined;
  return element.props.theme !== undefined && child && typeof child === 'object' && 'props' in child ? child : element;
}

async function render(page: PageModule, id: string): Promise<{ element?: Element; whole?: Element; notFound: boolean }> {
  try {
    const whole = (await page.default(params(id))) as unknown as Element;
    return { element: inner(whole), whole, notFound: false };
  } catch (error) {
    if (isNotFound(error)) return { notFound: true };
    throw error;
  }
}

test('a waiting photo reached by its token shows the waiting notice, never the photo', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'pending_review' })]);
  const page = await importPage('waiting');
  const { element, notFound } = await render(page, TOKEN);
  assert.equal(notFound, false);
  assert.equal(element?.props.state, 'waiting');
  assert.equal(element?.props.eventName, 'Derby');
  assert.equal(JSON.stringify(element).includes('submission-1.jpg'), false, 'the picture URL is nowhere in the page');
});

test('a rejected photo reached by its token shows the not-approved notice with a way to take another photo', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'rejected' })]);
  const page = await importPage('rejected');
  const { element } = await render(page, TOKEN);
  assert.equal(element?.props.state, 'not_approved');
  assert.equal(element?.props.captureHref, `/capture/${EVENT_ID.toString()}`);
});

test('the same waiting photo reached by its database id is not found', async (t) => {
  const doc = photo({ shareToken: TOKEN, reviewStatus: 'pending_review' });
  mockDb(t, [doc]);
  const page = await importPage('by-id');
  assert.equal((await render(page, doc._id.toHexString())).notFound, true);
});

test('an approved photo shows as a photo, by id and by token', async (t) => {
  const doc = photo({ shareToken: TOKEN, reviewStatus: 'approved' });
  mockDb(t, [doc]);
  const page = await importPage('approved');
  for (const id of [doc._id.toHexString(), TOKEN]) {
    const { element, notFound } = await render(page, id);
    assert.equal(notFound, false);
    assert.notEqual(element?.props.state, 'waiting');
    assert.match(JSON.stringify(element), /submission-1\.jpg/, 'the picture is on the page');
  }
});

test('an unknown link is not found', async (t) => {
  mockDb(t, []);
  const page = await importPage('unknown');
  assert.equal((await render(page, 'nope')).notFound, true);
  assert.equal((await render(page, TOKEN)).notFound, true);
});

test('the link preview of a waiting or rejected photo carries no image and is not indexed', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'pending_review' })]);
  const page = await importPage('metadata');
  const meta = await page.generateMetadata(params(TOKEN));
  assert.deepEqual(meta.robots, { index: false, follow: false });
  assert.equal(meta.openGraph, undefined);
  assert.equal(JSON.stringify(meta).includes('submission-1.jpg'), false);
});

test('the link preview of an approved photo still carries its image', async (t) => {
  const doc = photo({ shareToken: TOKEN, reviewStatus: 'approved' });
  mockDb(t, [doc]);
  const page = await importPage('metadata-approved');
  const meta = await page.generateMetadata(params(doc._id.toHexString()));
  assert.match(JSON.stringify(meta), /submission-1\.jpg/);
});

test('the share page and its notices are drawn in the theme of the event', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'approved' })]);
  const page = await importPage('themed');
  const { whole } = await render(page, TOKEN);
  const theme = whole?.props.theme as { source: string; background: string } | undefined;
  assert.ok(theme && /^#[0-9a-f]{6}$/.test(theme.background), 'the wrapper carries the resolved theme of the event');
});

/** Every string the page renders, found by walking the element tree. */
function textsOf(node: unknown, found: string[] = []): string[] {
  if (typeof node === 'string') found.push(node);
  else if (Array.isArray(node)) node.forEach((child) => textsOf(child, found));
  else if (node && typeof node === 'object' && 'props' in node) textsOf((node as Element).props.children, found);
  return found;
}

test('the event\'s own texts reach the waiting notice and the photo page; without them the page keeps its fixed words', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'pending_review' })], { sharePage: { texts: { waitingTitle: 'Un attimo', downloadButton: 'Scarica' } } });
  const waiting = await render(await importPage('own-waiting'), TOKEN);
  assert.equal((waiting.element?.props.settings as { texts?: Record<string, string> } | undefined)?.texts?.waitingTitle, 'Un attimo');
});

test('an approved photo page shows the event\'s own download text instead of Download', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'approved', isShareVisible: true })], { sharePage: { texts: { downloadButton: 'Scarica' } } });
  const own = await render(await importPage('own-download'), TOKEN);
  const ownTexts = textsOf(own.element);
  assert.ok(ownTexts.includes('Scarica'), `texts: ${ownTexts.join('|')}`);
  assert.equal(ownTexts.includes('Download'), false);
});

/** Every element of the tree that has the prop, found by walking the children. */
function withProp(node: unknown, prop: string, found: Element[] = []): Element[] {
  if (Array.isArray(node)) node.forEach((child) => withProp(child, prop, found));
  else if (node && typeof node === 'object' && 'props' in node) {
    const element = node as Element;
    if (element.props[prop] !== undefined) found.push(element);
    withProp(element.props.children, prop, found);
  }
  return found;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' };
const CREATED_AT = '2026-10-06T12:00:00.000Z';

test('in English the photo page keeps its words, its alt text and its date exactly as before', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'approved' })], { sharePage: { showCreateYourOwnButton: true } });
  const { whole, element } = await render(await importPage('english-page'), TOKEN);
  assert.equal(whole?.props.language, 'en');
  const texts = textsOf(element);
  for (const word of ['Derby', 'Download', 'Create Your Own', new Date(CREATED_AT).toLocaleString(undefined, DATE_OPTIONS)]) assert.ok(texts.includes(word), `${word} in ${texts.join('|')}`);
  assert.deepEqual(withProp(element, 'alt').map((image) => image.props.alt), ['Photo with Camera frame']);
});

test('in Hungarian the photo page shows the Hungarian defaults, alt text and date, and no English word', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'approved' })], { uiLanguage: 'hu', sharePage: { showCreateYourOwnButton: true } });
  const { whole, element } = await render(await importPage('hungarian-page'), TOKEN);
  assert.equal(whole?.props.language, 'hu', 'the page is wrapped in the language of the event');
  const texts = textsOf(element);
  const date = new Date(CREATED_AT).toLocaleString('hu-HU', DATE_OPTIONS);
  assert.match(date, /okt\./);
  for (const word of ['Derby', 'Letöltés', 'Készítsd el a sajátodat', date]) assert.ok(texts.includes(word), `${word} in ${texts.join('|')}`);
  assert.deepEqual(withProp(element, 'alt').map((image) => image.props.alt), ['Fotó kerettel']);
  for (const english of ['Download', 'Create Your Own', 'Photo with Camera frame']) assert.equal(JSON.stringify(element).includes(english), false, english);
});

test('in Hungarian an own text of the event wins, and a stored English default counts as not set', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'approved' })], { uiLanguage: 'hu', sharePage: { showCreateYourOwnButton: true, texts: { downloadButton: 'Mentsd el', createYourOwnButton: 'Create Your Own' } } });
  const texts = textsOf((await render(await importPage('hungarian-own'), TOKEN)).element);
  assert.ok(texts.includes('Mentsd el'), texts.join('|'));
  assert.ok(texts.includes('Készítsd el a sajátodat'), texts.join('|'));
  assert.equal(texts.includes('Create Your Own'), false);
});

test('in Hungarian the waiting notice gets the language and the event name', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'pending_review' })], { uiLanguage: 'hu' });
  const { whole, element } = await render(await importPage('hungarian-waiting'), TOKEN);
  assert.equal(whole?.props.language, 'hu');
  assert.equal(element?.props.state, 'waiting');
  assert.equal(element?.props.language, 'hu');
  assert.equal(element?.props.eventName, 'Derby');
});

test('the not-approved notice of an English event is English', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'rejected' })]);
  const { whole, element } = await render(await importPage('english-rejected'), TOKEN);
  assert.equal(whole?.props.language, 'en');
  assert.equal(element?.props.language, 'en');
});

test('the link preview of an English photo keeps its words exactly', async (t) => {
  const doc = photo({ shareToken: TOKEN, reviewStatus: 'approved' });
  mockDb(t, [doc]);
  const meta = await (await importPage('english-meta')).generateMetadata(params(TOKEN));
  assert.equal(meta.title, 'Photo of Ann — Derby');
  assert.equal(meta.description, 'Photo from Derby');
  assert.equal((meta.openGraph as { title?: string }).title, 'Photo of Ann');
  assert.equal((meta.openGraph as { description?: string }).description, 'From Derby');
  assert.equal((meta.openGraph as { images?: Array<{ alt?: string }> }).images?.[0]?.alt, 'Photo of Ann');
  assert.equal((meta.twitter as { title?: string }).title, 'Photo of Ann');
  assert.equal((meta.twitter as { description?: string }).description, 'From Derby');
});

test('the link preview of a Hungarian photo is Hungarian, with the guest word when the name is unknown', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'approved', userInfo: { email: 'ann@example.com' }, userName: 'Event Guest' })], { uiLanguage: 'hu' });
  const meta = await (await importPage('hungarian-meta')).generateMetadata(params(TOKEN));
  assert.equal(meta.title, 'Vendég fotója — Derby');
  assert.equal(meta.description, 'Fotó az eseményről: Derby');
  assert.equal((meta.openGraph as { title?: string }).title, 'Vendég fotója');
  assert.equal((meta.openGraph as { description?: string }).description, 'Esemény: Derby');
  assert.equal((meta.openGraph as { images?: Array<{ alt?: string }> }).images?.[0]?.alt, 'Vendég fotója');
  assert.equal((meta.twitter as { description?: string }).description, 'Esemény: Derby');
});

test('the tab title of a waiting photo is in the language of its event, and the page is still not indexed', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'pending_review' })], { uiLanguage: 'hu' });
  const hungarian = await (await importPage('hungarian-waiting-meta')).generateMetadata(params(TOKEN));
  assert.equal(hungarian.title, 'A fotód');
  assert.equal(hungarian.description, 'Készíts és ossz meg fotókat az eseményeken, egyedi keretekkel.');
  assert.deepEqual(hungarian.robots, { index: false, follow: false });
});

test('the tab title of an English waiting photo, and of a photo that is not found, stay English', async (t) => {
  mockDb(t, [photo({ shareToken: TOKEN, reviewStatus: 'pending_review' })]);
  const page = await importPage('english-waiting-meta');
  const waiting = await page.generateMetadata(params(TOKEN));
  assert.equal(waiting.title, 'Your photo');
  assert.equal(waiting.description, 'Capture and share photos at your events with branded frames and flows.', 'the description every page had from the root layout');
  assert.equal((await page.generateMetadata(params('nope'))).title, 'Photo Not Found');
});
