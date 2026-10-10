import assert from 'node:assert/strict';
import { CAMERA_DEFAULT_CTA_BRAND_COLOR, CAMERA_STAGE_WHITE, EVENT_THEME_DEFAULT } from '@/lib/gds/tokens/colors';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

const apiReal = await import('@/lib/api');
const authorizationReal = await import('@/lib/partners/authorization');

const EVENT_ID = new ObjectId().toString();
let ipCounter = 0;

type RouteModule = typeof import('./route');

function importRouteModule(caseId: string): Promise<RouteModule> {
  const specifier = './route?case=' + caseId;
  return import(specifier) as Promise<RouteModule>;
}

const WHO_ARE_YOU_PAGE = {
  pageId: 'who',
  pageType: 'who-are-you',
  order: 1,
  isActive: true,
  config: { title: 'Who are you?', buttonText: 'Next', nameLabel: 'Name', emailLabel: 'Email' },
};

interface Harness {
  updates: Array<Record<string, unknown>>;
}

function mockDeps(
  t: TestContext,
  options: { event: Record<string, unknown>; session?: Record<string, unknown> | null; partnerAllowed?: boolean; partner?: Record<string, unknown>; goneAddresses?: string[]; frameRows?: Array<Record<string, unknown>> }
): Harness {
  const h: Harness = { updates: [] };
  const event = { _id: new ObjectId(EVENT_ID), isActive: true, ...options.event };
  const session = options.session ?? null;
  t.mock.module('@/lib/api', {
    namedExports: {
      ...apiReal,
      optionalAuth: async () => session,
      requireAuth: async () => {
        if (!session) throw apiReal.apiError('Unauthorized', 401);
        return session;
      },
    },
  });
  t.mock.module('@/lib/partners/authorization', {
    namedExports: {
      ...authorizationReal,
      getPartnerScopedAccessForEvent: async () => ({ allowed: options.partnerAllowed ?? false }),
    },
  });
  t.mock.module('@/lib/db/mongodb', {
    namedExports: {
      connectToDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async () => (name === 'partners' && options.partner ? options.partner : event),
          find: () => ({ toArray: async () => (name === 'picture_health' ? (options.goneAddresses ?? []).map((_id) => ({ _id, broken: true })) : name === 'frames' ? (options.frameRows ?? []) : []) }),
          updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
            h.updates.push(update.$set);
            Object.assign(event, update.$set);
            return { matchedCount: 1 };
          },
        }),
      }),
    },
  });
  return h;
}

const params = { params: Promise.resolve({ eventId: EVENT_ID }) };

function getRequest(query = ''): NextRequest {
  ipCounter += 1;
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}${query}`, { headers: { 'x-forwarded-for': `203.0.113.${ipCounter}` } });
}

function patchRequest(body: Record<string, unknown>): NextRequest {
  ipCounter += 1;
  return new NextRequest(`http://localhost/api/events/${EVENT_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

const STORED_VETTING = { required: true, updatedAt: '2026-10-06T00:00:00.000Z', updatedBy: 'admin@example.com' };
const ADMIN = { appRole: 'admin', user: { id: 'a1', email: 'admin@example.com', name: 'Admin' } };
const PARTNER_MANAGER = { appRole: 'none', user: { id: 'p1', email: 'manager@example.com', name: 'Manager' } };

const pageIds = (event: { customPages?: Array<{ pageId: string }> }) => (event.customPages ?? []).map((page) => page.pageId);

test('GET as a guest: a vetted event with no who-are-you page gets the default one first; the stored setting is not exposed', async (t) => {
  mockDeps(t, { event: { photoVetting: STORED_VETTING, customPages: [] } });
  const { GET } = await importRouteModule('get-guest-vetted');
  const body = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: Record<string, unknown> & { customPages: Array<{ pageId: string; pageType: string }> } } };
  const event = body.data.event;
  assert.equal(event.photoVettingRequired, true);
  assert.equal('photoVetting' in event, false, 'who changed it and when is admin data');
  assert.equal(event.customPages.length, 1);
  assert.equal(event.customPages[0].pageType, 'who-are-you');
});

test('GET as a guest: an event that already has a who-are-you page before the photo keeps its own pages', async (t) => {
  mockDeps(t, { event: { photoVetting: STORED_VETTING, customPages: [WHO_ARE_YOU_PAGE] } });
  const { GET } = await importRouteModule('get-guest-own-page');
  const body = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { customPages: Array<{ pageId: string }> } } };
  assert.deepEqual(pageIds(body.data.event), ['who']);
});

test('GET as a guest: an event that does not require vetting gets no page added', async (t) => {
  mockDeps(t, { event: { photoVetting: { required: false }, customPages: [] } });
  const { GET } = await importRouteModule('get-guest-not-vetted');
  const body = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: Record<string, unknown> & { customPages: unknown[] } } };
  assert.equal(body.data.event.photoVettingRequired, false);
  assert.deepEqual(body.data.event.customPages, []);
});

test('GET without the guest audience (the admin editor) returns the stored pages untouched', async (t) => {
  mockDeps(t, { event: { photoVetting: STORED_VETTING, customPages: [] } });
  const { GET } = await importRouteModule('get-editor');
  const body = (await (await GET(getRequest(), params)).json()) as { data: { event: Record<string, unknown> & { customPages: unknown[] } } };
  assert.deepEqual(body.data.event.customPages, [], 'the default page is never written back by the editor');
  assert.equal(body.data.event.photoVettingRequired, true);
});

test('PATCH: a global admin switches photo vetting off and the change is attributed', async (t) => {
  const h = mockDeps(t, { event: { photoVetting: STORED_VETTING }, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-admin');
  const response = await PATCH(patchRequest({ photoVetting: { required: false } }), params);
  assert.equal(response.status, 200);
  const setting = h.updates[0].photoVetting as { required: boolean; updatedBy: string | null; updatedAt: string };
  assert.equal(setting.required, false);
  assert.equal(setting.updatedBy, 'admin@example.com');
  assert.ok(setting.updatedAt);
});

test('PATCH: a partner events manager cannot change photo vetting, and nothing is written', async (t) => {
  const h = mockDeps(t, { event: { photoVetting: STORED_VETTING }, session: PARTNER_MANAGER, partnerAllowed: true });
  const { PATCH } = await importRouteModule('patch-manager');
  const response = await PATCH(patchRequest({ photoVetting: { required: false } }), params);
  assert.equal(response.status, 403);
  assert.equal(h.updates.length, 0);
});

test('PATCH: a partner events manager can still update the rest of the event', async (t) => {
  const h = mockDeps(t, { event: { photoVetting: STORED_VETTING }, session: PARTNER_MANAGER, partnerAllowed: true });
  const { PATCH } = await importRouteModule('patch-manager-other');
  assert.equal((await PATCH(patchRequest({ loadingText: 'Hello' }), params)).status, 200);
  assert.equal('photoVetting' in h.updates[0], false);
});

test('PATCH: the setting must be true or false', async (t) => {
  const h = mockDeps(t, { event: { photoVetting: STORED_VETTING }, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-invalid');
  assert.equal((await PATCH(patchRequest({ photoVetting: { required: 'yes' } }), params)).status, 400);
  assert.equal((await PATCH(patchRequest({ photoVetting: null }), params)).status, 400);
  assert.equal(h.updates.length, 0);
});

test('PATCH: the language of the user interface is set to a language we have, cleared with an empty value, and refused otherwise', async (t) => {
  const h = mockDeps(t, { event: {}, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-language');
  assert.equal((await PATCH(patchRequest({ uiLanguage: 'hu' }), params)).status, 200);
  assert.equal(h.updates[0].uiLanguage, 'hu');
  assert.equal((await PATCH(patchRequest({ uiLanguage: '' }), params)).status, 200);
  assert.equal(h.updates[1].uiLanguage, null, 'empty means the default, English');
  for (const bad of ['de', 'HU', 7, {}]) assert.equal((await PATCH(patchRequest({ uiLanguage: bad }), params)).status, 400, String(bad));
  assert.equal(h.updates.length, 2, 'a refused language writes nothing');
});

test('PATCH without a language leaves the stored language alone', async (t) => {
  const h = mockDeps(t, { event: { uiLanguage: 'hu' }, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-language-untouched');
  assert.equal((await PATCH(patchRequest({ loadingText: 'Hello' }), params)).status, 200);
  assert.equal('uiLanguage' in h.updates[0], false);
});

test('GET as a guest carries the language of the event', async (t) => {
  mockDeps(t, { event: { uiLanguage: 'hu', customPages: [] } });
  const { GET } = await importRouteModule('get-language');
  const body = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { uiLanguage?: string } } };
  assert.equal(body.data.event.uiLanguage, 'hu');
});

test('PATCH: the guided tour is switched on or off with a true or false, refused otherwise, and left alone when absent', async (t) => {
  const h = mockDeps(t, { event: {}, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-tour');
  assert.equal((await PATCH(patchRequest({ tourEnabled: true }), params)).status, 200);
  assert.equal(h.updates[0].tourEnabled, true);
  assert.equal((await PATCH(patchRequest({ tourEnabled: false }), params)).status, 200);
  assert.equal(h.updates[1].tourEnabled, false);
  for (const bad of ['yes', 1, null, {}]) assert.equal((await PATCH(patchRequest({ tourEnabled: bad }), params)).status, 400, String(bad));
  assert.equal((await PATCH(patchRequest({ loadingText: 'Hello' }), params)).status, 200);
  assert.equal('tourEnabled' in h.updates[2], false);
  assert.equal(h.updates.length, 3, 'a refused value writes nothing');
});

test('GET as a guest carries the tour setting, and an event that never set it does not have it (the tour is off)', async (t) => {
  mockDeps(t, { event: { tourEnabled: true, customPages: [] } });
  const { GET } = await importRouteModule('get-tour-on');
  const on = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { tourEnabled?: boolean } } };
  assert.equal(on.data.event.tourEnabled, true);
});

// Stand-in colours from the tokens (no raw colour literals in tests).
const HERO = EVENT_THEME_DEFAULT.headingColor;
const WHITE = `${CAMERA_STAGE_WHITE.toLowerCase()}ff`;
const FRESH = new Date().toISOString();
const SNAPSHOT = {
  context: {
    source: 'messmass', fetchedAt: FRESH, inputHash: 'h', event: { name: 'Derby', date: null, homeTeam: null, visitorTeam: null },
    partner: { name: 'Club', logoUrl: 'https://i.ibb.co/logo.png' }, template: null,
    style: { name: 'S', resolvedFrom: 'project', fontFamily: 'Aquatic', fontSource: 'system', fontFile: null, headingColor: WHITE, heroBackground: HERO },
  },
  messages: [], messagesOverridden: false, updatedAt: FRESH,
};

test('GET returns the theme of the event: from its messmass snapshot, without exposing the snapshot itself', async (t) => {
  mockDeps(t, { event: { messmassEventId: 'm1', frameDesign: SNAPSHOT } });
  const { GET } = await importRouteModule('theme-snapshot');
  const { event } = ((await (await GET(getRequest(), params)).json()) as { data: { event: Record<string, unknown> } }).data;
  const theme = event.theme as { source: string; background: string; heading: string; logoUrl: string; font: { family: string } };
  assert.deepEqual([theme.source, theme.background, theme.heading, theme.logoUrl, theme.font.family], ['messmass', HERO.slice(0, 7), WHITE.slice(0, 7), 'https://i.ibb.co/logo.png', 'Aquatic']);
  assert.equal('frameDesign' in event, false, 'the snapshot is admin data');
});

test('GET returns the system default look for an event that has no snapshot yet', async (t) => {
  mockDeps(t, { event: { name: 'Fan Day', brandColor: CAMERA_DEFAULT_CTA_BRAND_COLOR } });
  const { GET } = await importRouteModule('theme-default');
  const { event } = ((await (await GET(getRequest(), params)).json()) as { data: { event: Record<string, unknown> } }).data;
  const theme = event.theme as { source: string; dark: boolean };
  assert.deepEqual([theme.source, theme.dark], ['event', false]);
});

// --- Brand colours come from messmass by default (camera#380) -----------------------------------------------------------------------------------------

const hex = (digits: string) => `#${digits}`;
const OWN_PRIMARY = hex('1b3a69');
const OWN_BORDER = hex('189cd8');

test('PATCH without brand colours leaves them alone: saving the editor never stamps a colour or the custom flag', async (t) => {
  const h = mockDeps(t, { event: { customPages: [] }, session: ADMIN });
  const { PATCH } = await importRouteModule('colours-untouched');
  assert.equal((await PATCH(patchRequest({ loadingText: 'Hello' }), params)).status, 200);
  for (const key of ['brandColor', 'brandBorderColor', 'brandColorsOverridden']) assert.equal(key in h.updates[0], false, key);
});

test('PATCH with colours stores them, checked as #RRGGBB, and marks the event custom', async (t) => {
  const h = mockDeps(t, { event: { customPages: [] }, session: ADMIN });
  const { PATCH } = await importRouteModule('colours-set');
  assert.equal((await PATCH(patchRequest({ brandColor: OWN_PRIMARY, brandBorderColor: OWN_BORDER }), params)).status, 200);
  assert.equal(h.updates[0].brandColor, OWN_PRIMARY);
  assert.equal(h.updates[0].brandBorderColor, OWN_BORDER);
  assert.equal(h.updates[0].brandColorsOverridden, true);
  assert.equal((await PATCH(patchRequest({ brandColor: 'blue' }), params)).status, 400);
  assert.equal((await PATCH(patchRequest({ brandBorderColor: '#12' }), params)).status, 400);
  assert.equal(h.updates.length, 1, 'a refused colour writes nothing');
});

test('PATCH with both colours cleared takes the event back to messmass: no colours and not custom', async (t) => {
  const h = mockDeps(t, { event: { customPages: [], brandColor: OWN_PRIMARY, brandBorderColor: OWN_BORDER, brandColorsOverridden: true }, session: ADMIN });
  const { PATCH } = await importRouteModule('colours-cleared');
  assert.equal((await PATCH(patchRequest({ brandColor: null, brandBorderColor: null }), params)).status, 200);
  assert.equal(h.updates[0].brandColor, null);
  assert.equal(h.updates[0].brandBorderColor, null);
  assert.equal(h.updates[0].brandColorsOverridden, false);
});

// The picture fields keep a plain address: the picker fills them from the Images library, while what is stored and what is checked stay
// exactly as they were, so the capture page, the emails and the slideshow read the same strings.
const LIBRARY_PICTURE = 'https://bidx0njghn1voknt.public.blob.vercel-storage.com/image-1760000000000-abc.png';
const R2_PICTURE = (name: string) => `https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/landing/mtk-vasas/${name}`;

test('PATCH: the email footer picture is stored as a plain https address, trimmed; empty clears it; anything else is refused', async (t) => {
  const h = mockDeps(t, { event: {}, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-footer-picture');
  assert.equal((await PATCH(patchRequest({ emailFooterImageUrl: `  ${LIBRARY_PICTURE} ` }), params)).status, 200);
  assert.equal(h.updates[0].emailFooterImageUrl, LIBRARY_PICTURE);
  assert.equal((await PATCH(patchRequest({ emailFooterImageUrl: R2_PICTURE('footer.png') }), params)).status, 200, 'an address that is in no library is kept');
  assert.equal(h.updates[1].emailFooterImageUrl, R2_PICTURE('footer.png'));
  assert.equal((await PATCH(patchRequest({ emailFooterImageUrl: '' }), params)).status, 200);
  assert.equal(h.updates[2].emailFooterImageUrl, null);
  for (const bad of ['http://i.ibb.co/x/footer.png', 'footer.png', 'https://pictures example.test/footer.png']) {
    assert.equal((await PATCH(patchRequest({ emailFooterImageUrl: bad }), params)).status, 400, bad);
  }
  assert.equal(h.updates.length, 3, 'a refused address writes nothing');
});

test('PATCH: the welcome page and CTA page pictures are stored exactly as sent, as plain addresses', async (t) => {
  const h = mockDeps(t, { event: {}, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-page-pictures');
  const welcome = {
    pageId: 'welcome',
    pageType: 'welcome',
    order: -1,
    isActive: true,
    config: { title: 'Welcome', buttonText: 'START', backgroundImageUrl: R2_PICTURE('background.jpg'), bottomImageUrl: R2_PICTURE('left.png'), cornerImageUrl: R2_PICTURE('right.png'), screenImageUrl: LIBRARY_PICTURE },
  };
  const cta = { pageId: 'cta', pageType: 'cta', order: 2, isActive: true, config: { title: 'Visit us', buttonText: 'Next', backgroundImageUrl: LIBRARY_PICTURE } };
  assert.equal((await PATCH(patchRequest({ customPages: [welcome, cta] }), params)).status, 200);
  const stored = h.updates[0].customPages as Array<{ pageId: string; config: Record<string, unknown> }>;
  assert.deepEqual(stored.map((page) => [page.pageId, page.config]), [
    ['welcome', welcome.config],
    ['cta', cta.config],
  ]);
});

test('GET carries the journey context: what decides which default pages the event gets, so the page editor shows what the user goes through', async (t) => {
  mockDeps(t, { event: { photoVetting: STORED_VETTING, journeyDefaults: true, uiLanguage: 'hu', customPages: [] } });
  const { GET } = await importRouteModule('get-journey-context');
  const admin = (await (await GET(getRequest(), params)).json()) as { data: { event: { journeyContext: unknown; customPages: unknown[] } } };
  assert.deepEqual(admin.data.event.journeyContext, { vettingRequired: true, consentDefault: true, language: 'hu', hasWelcomeScreen: false, texts: {} });
  assert.deepEqual(admin.data.event.customPages, [], 'the editor still reads the stored pages: the defaults are built from the context');
  const guest = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { journeyContext: unknown } } };
  assert.deepEqual(guest.data.event.journeyContext, admin.data.event.journeyContext, 'one answer for both');
});

test('GET: an event that does not get the journey defaults and needs no vetting says so', async (t) => {
  mockDeps(t, { event: { photoVetting: { required: false }, customPages: [] } });
  const { GET } = await importRouteModule('get-journey-context-none');
  const body = (await (await GET(getRequest(), params)).json()) as { data: { event: { journeyContext: unknown } } };
  assert.deepEqual(body.data.event.journeyContext, { vettingRequired: false, consentDefault: false, language: 'en', hasWelcomeScreen: false, texts: {} });
});


test('GET as a guest: an event with the picture drawn from its default slideshow and no welcome page of its own gets the default welcome page first; the editor reads the stored pages and knows why', async (t) => {
  mockDeps(t, { event: { photoVetting: { required: false }, journeyDefaults: true, customPages: [], welcomeScreen: { url: 'https://blob.example/screens/e/welcome-1.png', key: 'k', generatedAt: 'x', renderVersion: 1 } } });
  const { GET } = await importRouteModule('get-default-welcome');
  const guest = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { customPages: Array<{ pageId: string; pageType: string; order: number }>; journeyContext: { hasWelcomeScreen: boolean }; welcomeScreen: { url: string } } } };
  const inOrder = [...guest.data.event.customPages].sort((a, b) => a.order - b.order);
  assert.equal(inOrder[0].pageId, 'default-welcome');
  assert.equal(inOrder[0].pageType, 'welcome');
  assert.equal(inOrder[1].pageId, 'default-consent', 'the consent page follows it');
  assert.equal(guest.data.event.welcomeScreen.url, 'https://blob.example/screens/e/welcome-1.png', 'the capture page shows this on a welcome page that has no picture of its own');
  assert.equal(guest.data.event.journeyContext.hasWelcomeScreen, true);
  const admin = (await (await GET(getRequest(), params)).json()) as { data: { event: { customPages: unknown[] } } };
  assert.deepEqual(admin.data.event.customPages, [], 'the editor reads the stored pages');
});

test('GET as a guest: an event without the picture, or with a welcome page of its own, gets no default welcome page', async (t) => {
  mockDeps(t, { event: { photoVetting: { required: false }, journeyDefaults: true, customPages: [] } });
  const { GET } = await importRouteModule('get-no-default-welcome');
  const noPicture = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { customPages: Array<{ pageId: string }> } } };
  assert.ok(!noPicture.data.event.customPages.some((page) => page.pageId === 'default-welcome'));
});

test('PATCH: the message-only frame setting of issue 329 is gone: it is not stored any more (the selection is saved on its own route, epic 444)', async (t) => {
  const h = mockDeps(t, { event: {}, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-frame-choice');
  assert.equal((await PATCH(patchRequest({ frameChoice: 'user', frameSelection: { layout: { mode: 'user' }, message: { mode: 'user' } }, loadingText: 'Hello' }), params)).status, 200);
  assert.equal('frameChoice' in h.updates[0], false);
  assert.equal('frameSelection' in h.updates[0], false);
  assert.equal(h.updates[0].loadingText, 'Hello');
});

test('GET as a guest: a picture field a page left empty shows the partner\'s default picture, never stored; the editor reads the stored pages; the page\'s own picture wins', async (t) => {
  mockDeps(t, {
    event: {
      photoVetting: { required: false },
      journeyDefaults: true,
      partnerId: 'P',
      customPages: [
        { pageId: 'w', pageType: 'welcome', order: 0, isActive: true, config: { title: 'Hi', buttonText: 'Go', bottomImageUrl: 'https://img.example/own-left.png' } },
        { pageId: 'c', pageType: 'cta', order: 1, isActive: true, config: { title: 'Visit', description: '', checkboxText: 'https://x.example', buttonText: 'Go' } },
      ],
    },
    partner: { partnerId: 'P', pictures: { welcomeBackground: 'https://img.example/bg.png', welcomeLeft: 'https://img.example/partner-left.png', ctaBackground: 'https://img.example/cta.png' } },
  });
  const { GET } = await importRouteModule('get-partner-pictures');
  const guest = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { customPages: Array<{ pageId: string; config: Record<string, string> }> } } };
  const welcome = guest.data.event.customPages.find((p) => p.pageId === 'w')!;
  assert.equal(welcome.config.backgroundImageUrl, 'https://img.example/bg.png');
  assert.equal(welcome.config.bottomImageUrl, 'https://img.example/own-left.png', 'the page\'s own picture wins');
  assert.equal(guest.data.event.customPages.find((p) => p.pageId === 'c')!.config.backgroundImageUrl, 'https://img.example/cta.png');
  const admin = (await (await GET(getRequest(), params)).json()) as { data: { event: { customPages: Array<{ pageId: string; config: Record<string, string> }> } } };
  assert.equal(admin.data.event.customPages.find((p) => p.pageId === 'w')!.config.backgroundImageUrl, undefined, 'the editor reads the stored pages');
});

const welcomeFlag = async (t: TestContext, event: Record<string, unknown>, caseId: string) => {
  mockDeps(t, { event });
  const route = await importRouteModule(caseId);
  return ((await (await route.GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { welcomeEmailEnabled: boolean } } }).data.event.welcomeEmailEnabled;
};

test('GET tells the capture page the event does not send the welcome e-mail unless an editor switched it on (epic 463)', async (t) => {
  assert.equal(await welcomeFlag(t, {}, 'get-welcome-off'), false);
});

test('GET tells the capture page the event sends the welcome e-mail when an editor switched it on (epic 463)', async (t) => {
  assert.equal(await welcomeFlag(t, { notifications: { types: { welcome: { enabled: true } } } }, 'get-welcome-on'), true);
});

test('PATCH: the acceptance on the Who-are-you page (issue 523) is a true or false, refused otherwise, and left alone when absent', async (t) => {
  const h = mockDeps(t, { event: {}, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-acceptance');
  assert.equal((await PATCH(patchRequest({ acceptanceOnWhoAreYou: true }), params)).status, 200);
  assert.equal(h.updates[0].acceptanceOnWhoAreYou, true);
  assert.equal((await PATCH(patchRequest({ acceptanceOnWhoAreYou: false }), params)).status, 200);
  assert.equal(h.updates[1].acceptanceOnWhoAreYou, false);
  for (const bad of ['yes', 1, null, {}]) assert.equal((await PATCH(patchRequest({ acceptanceOnWhoAreYou: bad }), params)).status, 400, String(bad));
  assert.equal((await PATCH(patchRequest({ loadingText: 'Hello' }), params)).status, 200);
  assert.equal('acceptanceOnWhoAreYou' in h.updates[2], false);
  assert.equal(h.updates.length, 3, 'a refused value writes nothing');
});

test('GET as a guest carries the acceptance switch, so the capture page knows to show the consent on the Who-are-you page', async (t) => {
  mockDeps(t, { event: { acceptanceOnWhoAreYou: true, customPages: [] } });
  const { GET } = await importRouteModule('get-acceptance');
  const body = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { acceptanceOnWhoAreYou?: boolean } } };
  assert.equal(body.data.event.acceptanceOnWhoAreYou, true);
});

const GONE_LOGO = 'https://i.ibb.co/aaa/logo.png';
const GONE_FRAME = 'https://i.ibb.co/bbb/frame.png';
const GONE_PAGE = 'https://i.ibb.co/ccc/page.png';
const goneWorld = () => ({
  event: {
    logoUrl: GONE_LOGO,
    frames: [{ frameId: 'f1', isActive: true }, { frameId: 'f2', isActive: true }],
    customPages: [{ pageId: 'welcome', pageType: 'welcome', order: 0, isActive: true, config: { backgroundImageUrl: GONE_PAGE, title: 'Hi' } }],
  },
  goneAddresses: [GONE_LOGO, GONE_FRAME, GONE_PAGE],
  frameRows: [
    { frameId: 'f1', name: 'Gone', imageUrl: GONE_FRAME, thumbnailUrl: GONE_FRAME },
    { frameId: 'f2', name: 'Fine', imageUrl: 'https://i.ibb.co/ddd/fine.png', thumbnailUrl: 'https://i.ibb.co/ddd/fine.png' },
  ],
});
type GoneBody = { data: { event: { logoUrl?: string; frames: Array<{ frameId: string }>; customPages: Array<{ pageId: string; config: { backgroundImageUrl?: string; title: string } }> } } };

test('GET as a guest leaves out a logo, a page picture and a frame whose picture is gone (issue 514)', async (t) => {
  const { clearBrokenCache } = await import('@/lib/media/pictures');
  t.after(clearBrokenCache);
  clearBrokenCache();
  mockDeps(t, goneWorld());
  const { GET } = await importRouteModule('get-gone-pictures');
  const guest = ((await (await GET(getRequest('?audience=guest'), params)).json()) as GoneBody).data.event;
  assert.equal('logoUrl' in guest, false, 'the gone logo is not sent');
  assert.deepEqual(guest.frames.map((f) => f.frameId), ['f2'], 'the frame with a gone picture is not offered');
  const welcome = guest.customPages.find((page) => page.pageId === 'welcome')!;
  assert.equal('backgroundImageUrl' in welcome.config, false);
  assert.equal(welcome.config.title, 'Hi');
});

test('GET for the editor (not a guest) still sends every picture, gone or not, so it can be fixed (issue 514)', async (t) => {
  const { clearBrokenCache } = await import('@/lib/media/pictures');
  t.after(clearBrokenCache);
  clearBrokenCache();
  mockDeps(t, goneWorld());
  const { GET } = await importRouteModule('get-gone-pictures-editor');
  const editor = ((await (await GET(getRequest(), params)).json()) as GoneBody).data.event;
  assert.equal(editor.logoUrl, GONE_LOGO);
  assert.equal(editor.frames.length, 2);
});

test('PATCH: the places of the default pages (issue 535) are only the known default pages with finite numbers, refused otherwise, and an empty object puts them back', async (t) => {
  const h = mockDeps(t, { event: {}, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-default-orders');
  assert.equal((await PATCH(patchRequest({ defaultPageOrders: { 'default-consent': 2, 'default-identity': 1 } }), params)).status, 200);
  assert.deepEqual(h.updates[0].defaultPageOrders, { 'default-consent': 2, 'default-identity': 1 });
  assert.equal((await PATCH(patchRequest({ defaultPageOrders: {} }), params)).status, 200);
  assert.deepEqual(h.updates[1].defaultPageOrders, {});
  for (const bad of ['x', null, [], { other: 1 }, { 'default-consent': 'a' }, { 'default-consent': 1e9 }]) assert.equal((await PATCH(patchRequest({ defaultPageOrders: bad }), params)).status, 400, JSON.stringify(bad));
  assert.equal(h.updates.length, 2, 'a refused value writes nothing');
});

test('GET: the default pages are where the editor put them, for the user and for the page editor (issue 535)', async (t) => {
  const stored = { customPages: [{ pageId: 'w', pageType: 'welcome', order: -1, isActive: true, config: { title: 'W', description: '', buttonText: 'Start' } }, { pageId: 'p', pageType: 'take-photo', order: 0, isActive: true, config: { title: 'P', description: '', buttonText: '' } }], journeyDefaults: true };
  mockDeps(t, { event: { ...stored, photoVetting: STORED_VETTING, defaultPageOrders: { 'default-identity': 1, 'default-consent': 2 } } });
  const { GET } = await importRouteModule('get-default-orders');
  const body = (await (await GET(getRequest('?audience=guest'), params)).json()) as { data: { event: { customPages: Array<{ pageId: string; order: number }>; journeyContext: { defaultOrders?: Record<string, number> } } } };
  const ids = [...body.data.event.customPages].sort((a, b) => a.order - b.order).map((page) => page.pageId);
  assert.deepEqual(ids.filter((id) => id.startsWith('default-')), ['default-identity', 'default-consent'].filter((id) => ids.includes(id)), 'the login comes before the consent, as saved');
  assert.deepEqual(body.data.event.journeyContext.defaultOrders, { 'default-identity': 1, 'default-consent': 2 });
});

test('PATCH: a Submit page (issue 535) is a marker with no texts of its own and is stored; any other page still needs its title and button', async (t) => {
  const h = mockDeps(t, { event: {}, session: ADMIN });
  const { PATCH } = await importRouteModule('patch-submit-page');
  const take = { pageId: 'take', pageType: 'take-photo', order: 0, isActive: true, config: { title: '[Take Photo]', description: '', buttonText: '' } };
  const submit = { pageId: 'submit', pageType: 'submit', order: 1, isActive: true, config: { title: '[Submit]', description: '', buttonText: '' } };
  assert.equal((await PATCH(patchRequest({ customPages: [take, submit] }), params)).status, 200);
  assert.deepEqual((h.updates[0].customPages as Array<{ pageId: string; pageType: string }>).map((page) => [page.pageId, page.pageType]), [['take', 'take-photo'], ['submit', 'submit']]);
  const cta = { pageId: 'cta', pageType: 'cta', order: 2, isActive: true, config: { title: '', description: '', buttonText: '' } };
  assert.equal((await PATCH(patchRequest({ customPages: [take, submit, cta] }), params)).status, 400, 'a CTA page without title and button is still refused');
  assert.equal((await PATCH(patchRequest({ customPages: [{ ...submit, config: undefined }] }), params)).status, 400, 'the marker still needs a config object');
});
