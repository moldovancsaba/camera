import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { contextHash, nativeFrameContext, type FrameDesign } from '@/lib/frame/context';
import { resolveFrameFont } from '@/lib/frame/fonts';

// Where the welcome page screen picture is asked to be drawn again (issue 327): after the frame images of an event are made, and when a new messmass style reaches the event. The other places (the
// event's colours, the sample selfies) are tested with their routes. The scheduler itself is tested in welcome-redraw.test.ts.

const NOW = '2026-10-11T12:00:00.000Z';
const redrawReal = await import('@/lib/screen/welcome-redraw');

function mockScheduler(t: TestContext) {
  const scheduled: Array<{ id: string; reason: string }> = [];
  t.mock.module('@/lib/screen/welcome-redraw', { namedExports: { ...redrawReal, scheduleWelcomeRedraw: (event: { _id?: unknown }, reason: string) => scheduled.push({ id: String(event._id), reason }) } });
  return scheduled;
}

// A module imported again under a name of its own, so that it picks up the mock of this test (the specifier is a variable, as in the route tests).
const fresh = <T>(specifier: string, caseId: string): Promise<T> => import(`${specifier}?case=${caseId}`) as Promise<T>;

function design(): FrameDesign {
  const base = nativeFrameContext({ eventName: 'El Clásico', partnerName: 'FC Barcelona', partnerLogoUrl: null }, NOW);
  const context = { ...base, style: { ...base.style, headingColor: `${CAMERA_STAGE_WHITE}FF`, heroBackground: `${CAMERA_STAGE_WHITE}FF` } };
  return { context: { ...context, inputHash: contextHash(context) }, messages: ['Go'], messagesOverridden: false, updatedAt: NOW };
}

test('after the frame images of an event are made, the redraw of its welcome page screen is asked for, once', async (t) => {
  const scheduled = mockScheduler(t);
  const { generateFrameVariants } = await fresh<typeof import('@/lib/frame/variants')>('@/lib/frame/variants', 'redraw');
  const db = { collection: () => ({ findOne: async () => null, updateOne: async () => ({ matchedCount: 1 }) }) } as unknown as Db;
  const event = { _id: new ObjectId(), eventId: 'evt-1', name: 'El Clásico', frameDesign: design(), welcomeScreen: { url: 'https://blob.example/w.png' } };
  await generateFrameVariants(db, event, {
    upload: async (pathname) => `https://blob.test/${pathname}`,
    fetchLogo: async () => null,
    fetchBaseImage: async () => null,
    resolveFont: (style) => resolveFrameFont(style),
    now: () => NOW,
  });
  assert.deepEqual(scheduled, [{ id: String(event._id), reason: 'frame' }]);
});

test('a failed upload throws before anything is stored, and asks for no redraw', async (t) => {
  const scheduled = mockScheduler(t);
  const { generateFrameVariants } = await fresh<typeof import('@/lib/frame/variants')>('@/lib/frame/variants', 'redraw-failed');
  const db = { collection: () => ({ findOne: async () => null, updateOne: async () => ({ matchedCount: 1 }) }) } as unknown as Db;
  const event = { _id: new ObjectId(), eventId: 'evt-1', name: 'El Clásico', frameDesign: design(), welcomeScreen: { url: 'https://blob.example/w.png' } };
  await assert.rejects(
    generateFrameVariants(db, event, {
      upload: async () => {
        throw new Error('blob is down');
      },
      fetchLogo: async () => null,
      fetchBaseImage: async () => null,
      resolveFont: (style) => resolveFrameFont(style),
      now: () => NOW,
    }),
    /blob is down/
  );
  assert.equal(scheduled.length, 0);
});

test('a new messmass style asks for the redraw; the same style, a failed refresh and an unreachable messmass do not', async (t) => {
  const scheduled = mockScheduler(t);
  const { refreshEventTheme } = await fresh<typeof import('@/lib/theme/refresh')>('@/lib/theme/refresh', 'redraw');
  const db = { collection: () => ({ updateOne: async () => ({ matchedCount: 1 }) }) } as unknown as Db;
  const event = () => ({ _id: new ObjectId(), messmassEventId: 'm1', eventId: 'e1', frameDesign: { context: {}, variants: [{}] }, welcomeScreen: { url: 'https://blob.example/w.png' } });
  const deps = (result: { changed: boolean; messmassUnavailable?: boolean }) => ({
    refresh: async () => ({ design: { context: {}, messages: [], messagesOverridden: false, updatedAt: 'x' } as never, changed: result.changed, messmassUnavailable: result.messmassUnavailable ?? false }),
    generate: async () => ({ design: {} as never, generated: 0, reused: 0 }),
    now: () => new Date(NOW),
  });
  assert.equal(await refreshEventTheme(db, event(), deps({ changed: false })), 'unchanged');
  assert.equal(await refreshEventTheme(db, event(), deps({ changed: false, messmassUnavailable: true })), 'unavailable');
  assert.equal(await refreshEventTheme(db, event(), { ...deps({ changed: true }), refresh: async () => { throw new Error('messmass'); } }), 'failed');
  assert.equal(scheduled.length, 0);
  const changed = event();
  assert.equal(await refreshEventTheme(db, changed, deps({ changed: true })), 'updated');
  assert.deepEqual(scheduled, [{ id: String(changed._id), reason: 'style' }]);
});
