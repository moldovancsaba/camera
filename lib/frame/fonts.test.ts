import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { GlobalFonts } from '@napi-rs/canvas';
import { ensureEmojiFont, FRAME_FONT_DIR, fetchMessmassFont, resolveFrameFont } from './fonts';
import { nativeFrameContext } from './context';

const realEnv = process.env.MESSMASS_BASE_URL;
beforeEach(() => {
  process.env.MESSMASS_BASE_URL = 'https://messmass.example.test';
});
afterEach(() => {
  if (realEnv === undefined) delete process.env.MESSMASS_BASE_URL;
  else process.env.MESSMASS_BASE_URL = realEnv;
});

const base = nativeFrameContext({ eventName: 'x' }, 'now').style;
const style = (over: Partial<typeof base>) => ({ ...base, ...over });
const poppins = readFileSync(path.join(FRAME_FONT_DIR, 'Poppins-Bold.ttf'));

test('the four bundled Google fonts resolve by name, in any case', async () => {
  for (const name of ['Inter', 'Roboto', 'POPPINS', 'montserrat']) {
    const font = await resolveFrameFont(style({ fontFamily: name, fontSource: 'google' }));
    assert.equal(font.used, 'bundled', name);
    assert.equal(font.family, `frame-${name.toLowerCase()}`);
    assert.equal(font.note, null);
    assert.match(font.stack, /"frame-inter", "frame-emoji"$/);
  }
});

test('a custom font is fetched from messmass, registered once and used', async () => {
  const calls: string[] = [];
  const fetchFont = async (file: string) => (calls.push(file), poppins);
  const custom = style({ fontFamily: 'AS Roma', fontSource: 'custom', fontFile: '/fonts/ASRoma-Regular.woff' });

  const first = await resolveFrameFont(custom, { fetchFont });
  const second = await resolveFrameFont(custom, { fetchFont });
  assert.equal(first.used, 'custom');
  assert.match(first.family, /^frame-custom-[0-9a-f]{12}$/);
  assert.equal(second.family, first.family, 'the same file keeps its alias');
  assert.equal(GlobalFonts.has(first.family), true);
});

test('a custom font that cannot be had falls back to Inter and says why', async () => {
  const custom = style({ fontFamily: 'AS Roma', fontSource: 'custom', fontFile: '/fonts/ASRoma-Regular.woff' });

  const fetchFailed = await resolveFrameFont(custom, { fetchFont: async () => null });
  assert.equal(fetchFailed.used, 'fallback');
  assert.match(fetchFailed.note ?? '', /could not be fetched/);
  assert.equal(fetchFailed.retry, true, 'a failed fetch is worth retrying');
  assert.equal(fetchFailed.family, 'frame-inter');

  const garbage = await resolveFrameFont(custom, { fetchFont: async () => Buffer.from('not a font') });
  assert.equal(garbage.used, 'fallback');
  assert.match(garbage.note ?? '', /could not be registered/);

  const noFile = await resolveFrameFont(style({ fontFamily: 'AS Roma', fontSource: 'custom', fontFile: null }));
  assert.match(noFile.note ?? '', /has no file/);
  assert.equal(noFile.retry, false);
});

test('a font messmass names but camera does not have is Inter, without a retry', async () => {
  const font = await resolveFrameFont(style({ fontFamily: 'Comic Neue', fontSource: 'system' }));
  assert.equal(font.used, 'fallback');
  assert.match(font.note ?? '', /"Comic Neue" is not available/);
  assert.equal(font.retry, false);
});

test('the emoji font is registered only when some text contains an emoji', () => {
  ensureEmojiFont('Go! Go! Go!');
  const before = GlobalFonts.has('frame-emoji');
  ensureEmojiFont('🫶 Let’s Go 🫶');
  assert.equal(GlobalFonts.has('frame-emoji'), true);
  assert.equal(before === false || before === true, true);
});

test('fetchMessmassFont asks the messmass origin for a plain /fonts/ file and caps what it accepts', async () => {
  let url = '';
  const ok = await fetchMessmassFont('/fonts/Plain Font-1.woff', (async (input: unknown) => ((url = String(input)), new Response(poppins))) as typeof fetch);
  assert.deepEqual(ok, poppins);
  assert.equal(url, 'https://messmass.example.test/fonts/Plain%20Font-1.woff');

  let called = false;
  const spy = (async () => ((called = true), new Response(poppins))) as typeof fetch;
  for (const bad of ['/fonts/../etc/passwd', '/other/x.woff', '/fonts/x.exe', 'fonts/x.woff']) {
    assert.equal(await fetchMessmassFont(bad, spy), null, bad);
  }
  assert.equal(called, false);

  assert.equal(await fetchMessmassFont('/fonts/Refused.woff', (async () => new Response(null, { status: 404 })) as typeof fetch), null);
  assert.equal(await fetchMessmassFont('/fonts/Huge.woff', (async () => new Response(poppins, { headers: { 'content-length': String(4 * 1024 * 1024) } })) as typeof fetch), null);
  assert.equal(await fetchMessmassFont('/fonts/Empty.woff', (async () => new Response(new Uint8Array(0))) as typeof fetch), null);
  assert.equal(await fetchMessmassFont('/fonts/Down.woff', (async () => { throw new Error('network'); }) as typeof fetch), null);
});

test('without a messmass origin there is no custom font fetch', async () => {
  delete process.env.MESSMASS_BASE_URL;
  assert.equal(await fetchMessmassFont('/fonts/NoOrigin.woff', (async () => new Response(poppins)) as typeof fetch), null);
});
