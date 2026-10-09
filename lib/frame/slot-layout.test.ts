import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layerBoxes, layoutFrame, type Measure, type Rect } from './layout';
import { BAR_PICTURE_MAX, layoutSlots, slotLayerBoxes } from './slot-layout';
import { DEFAULT_SLOTS, type FrameSlots } from './slots';

// Every character is half a font size wide: simple, linear like real text, and independent of any font.
const measure: Measure = (text, size) => Array.from(text).length * size * 0.5;
const BLOB = 'https://abc123.public.blob.vercel-storage.com/frames';
const img = (key: string) => ({ key, imageUrl: `${BLOB}/${key}.png` });
const find = <T extends { id: string }>(items: T[], id: string) => items.find((item) => item.id === id);

const INPUTS = [
  { name: 'a pairing with both teams', input: { home: 'MTK Budapest', visitor: 'Vasas FC', eventName: 'MTK Budapest x Vasas FC', logo: { width: 400, height: 300 }, message: 'Go! Go! Go!' } },
  { name: 'long team names, a wide logo', input: { home: 'Casademont Zaragoza Basketball Club', visitor: 'Basket Landes Mont-de-Marsan', eventName: 'x', logo: { width: 1000, height: 200 }, message: 'Let’s Go, Casademont Zaragoza Basketball Club, together for victory today' } },
  { name: 'an event name that is no pairing, no logo, no message', input: { home: null, visitor: null, eventName: 'Brain Bar 2026 x AUDI F1 Experience Day with a very long title', logo: null, message: null } },
  { name: 'a pairing in the name only', input: { eventName: 'OTP Bank - PICK Szeged x Sporting Clube de Portugal', logo: { width: 300, height: 300 }, message: 'We are the Best!' } },
  { name: 'a smaller frame', input: { width: 1280, height: 720, home: 'A', visitor: 'B', eventName: 'A - B', logo: { width: 100, height: 400 }, message: 'Hajrá' } },
] as const;

for (const { name, input } of INPUTS) {
  test(`the default slots lay out exactly like the generated frame: ${name}`, () => {
    const old = layoutFrame({ ...input, measure });
    const next = layoutSlots({ ...input, slots: DEFAULT_SLOTS, measure });
    assert.deepEqual(find(next.pictures, 'logo')?.rect ?? null, old.logo);
    const bar = next.pictures.find((p) => p.kind === 'bar');
    assert.deepEqual(bar?.rect, old.bar);
    assert.deepEqual(bar?.line, old.barLine);
    const teams = find(next.texts, 'teams');
    assert.deepEqual(teams ? { lines: teams.lines, fontSize: teams.fontSize, lineHeight: teams.lineHeight, rect: teams.rect } : null, old.teams ? { lines: old.teams.lines, fontSize: old.teams.fontSize, lineHeight: old.teams.lineHeight, rect: old.teams.rect } : null);
    const message = find(next.texts, 'message');
    assert.deepEqual(message ? { text: message.lines[0], fontSize: message.fontSize, rect: message.rect } : null, old.message);
    // the dark area is the same boxes, by name
    const byId = (boxes: Array<{ id: string; rect: Rect }>) => Object.fromEntries(boxes.map((box) => [box.id, box.rect]));
    assert.deepEqual(byId(slotLayerBoxes(next)), byId(layerBoxes(old)));
    // the only note is the one about a text that the old drawing cut too
    const cutInOld = [old.teams].some((fitted) => fitted?.lines.some((line) => line.endsWith('…')));
    assert.equal(next.notes.length, cutInOld ? 1 : 0, next.notes.join(' | '));
  });
}

test('a corner picture fits its box with its shape kept, in its own corner of the safety area', () => {
  const slots: FrameSlots = { text: {}, picture: { 'top-left': { source: 'picture', images: [img('a')] }, 'bottom-right': { source: 'picture', images: [img('b')], size: 25 } } };
  const out = layoutSlots({ slots, pictures: { 'top-left': { width: 300, height: 300 }, 'bottom-right': { width: 285, height: 315 } }, eventName: 'x', measure });
  const topLeft = find(out.pictures, 'picture-top-left')!.rect;
  assert.deepEqual(topLeft, { x: 96, y: 54, width: 162, height: 162 }, '15 % of the height is the limit of a square');
  const bottomRight = find(out.pictures, 'picture-bottom-right')!.rect;
  assert.equal(bottomRight.x + bottomRight.width, 1824);
  assert.equal(bottomRight.y + bottomRight.height, 1026);
  assert.ok(Math.abs(bottomRight.width / bottomRight.height - 285 / 315) < 0.01, 'the ribbon keeps its shape');
  assert.equal(bottomRight.height, 270, '25 % of the frame height');
});

test('a 1920 x 100 strip as a bar lands at its natural size on its edge, and what is next to it keeps clear', () => {
  const slots: FrameSlots = {
    text: { 'top-left': { source: 'teams' }, 'bottom-center': { source: 'message' }, 'bottom-left': { source: 'title' } },
    picture: { 'top-center': { source: 'picture', images: [img('top')] }, 'bottom-center': { source: 'picture', images: [img('bottom')] }, 'top-right': { source: 'partnerLogo' }, 'bottom-right': { source: 'picture', images: [img('r')] } },
  };
  const out = layoutSlots({ slots, logo: { width: 200, height: 200 }, pictures: { 'top-center': { width: 1920, height: 100 }, 'bottom-center': { width: 1920, height: 100 }, 'bottom-right': { width: 200, height: 200 } }, home: 'MTK', visitor: 'Vasas', eventName: 'MTK x Vasas', message: 'HAJRÁ, MTK!', measure });
  assert.deepEqual(find(out.pictures, 'picture-top-center')!.rect, { x: 0, y: 0, width: 1920, height: 100 });
  assert.deepEqual(find(out.pictures, 'picture-bottom-center')!.rect, { x: 0, y: 980, width: 1920, height: 100 });
  // the logo and the teams are below the top bar, the corner picture and the title above the bottom bar
  assert.ok(find(out.pictures, 'logo')!.rect.y >= 100);
  assert.ok(find(out.texts, 'teams')!.rect.y >= 100);
  const right = find(out.pictures, 'picture-bottom-right')!.rect;
  assert.ok(right.y + right.height <= 980);
  const title = find(out.texts, 'text-bottom-left')!;
  assert.ok(title.rect.y + title.rect.height <= 980);
  // the message is one line in the bottom bar
  const message = find(out.texts, 'message')!;
  assert.equal(message.oneLine, true);
  assert.ok(message.rect.y >= 980 && message.rect.y + message.rect.height <= 1080);
  assert.deepEqual(out.notes, []);
});

test('a bar picture taller than 30 % of the frame is shrunk with its shape kept and centred', () => {
  const slots: FrameSlots = { text: {}, picture: { 'bottom-center': { source: 'picture', images: [img('a')] } } };
  const out = layoutSlots({ slots, pictures: { 'bottom-center': { width: 1000, height: 1000 } }, eventName: 'x', measure });
  const bar = out.pictures[0].rect;
  assert.equal(bar.height, 1080 * BAR_PICTURE_MAX);
  assert.equal(bar.width, bar.height);
  assert.equal(bar.x, (1920 - bar.width) / 2);
  assert.equal(bar.y + bar.height, 1080);
});

test('the generated bar can be on the top edge too, with its line on the inner side', () => {
  const slots: FrameSlots = { text: { 'top-center': { source: 'message' } }, picture: { 'top-center': { source: 'bar' } } };
  const out = layoutSlots({ slots, eventName: 'x', message: 'Hajrá', measure });
  const bar = out.pictures[0];
  assert.deepEqual(bar.rect, { x: 0, y: 0, width: 1920, height: 216 });
  assert.deepEqual(bar.line, { x: 0, y: 216, width: 1920, height: 10.8 });
  const text = out.texts[0];
  assert.ok(text.rect.y >= 54 && text.rect.y + text.rect.height <= 216, 'inside the bar');
  assert.equal(text.id, 'message');
});

test('every text source and position: corners wrap to their box and align to their side, the centre is one line', () => {
  const slots: FrameSlots = {
    text: {
      'top-left': { source: 'title' },
      'top-center': { source: 'custom', text: '#pinkmonth' },
      'top-right': { source: 'team1' },
      'bottom-left': { source: 'team2' },
      'bottom-right': { source: 'teams' },
    },
    picture: {},
  };
  const out = layoutSlots({ slots, home: 'MTK', visitor: 'Vasas', eventName: 'MTK Budapest x Vasas FC', measure });
  const at = (position: string) => out.texts.find((t) => t.position === position)!;
  assert.equal(at('top-left').align, 'left');
  assert.equal(at('top-right').align, 'right');
  assert.equal(at('bottom-right').align, 'right');
  assert.deepEqual(at('top-right').lines, ['MTK']);
  assert.deepEqual(at('bottom-left').lines, ['Vasas']);
  assert.deepEqual(at('bottom-right').lines, ['MTK', 'Vasas'], 'teams: team 1 over team 2');
  assert.equal(at('top-center').oneLine, true);
  assert.equal(at('top-center').id, 'text-top-center');
  // bottom texts sit at the bottom of the safety area, top texts at the top
  assert.equal(at('bottom-left').rect.y + at('bottom-left').rect.height, 1080 * 0.9);
  assert.equal(at('top-left').rect.y, 108);
  assert.equal(at('top-right').rect.x, 1344);
  assert.deepEqual(out.notes, []);
});

test('a text that does not fit is cut and the editor is told; a source with nothing to say draws nothing', () => {
  const slots: FrameSlots = { text: { 'top-left': { source: 'custom', text: 'A'.repeat(400) }, 'top-right': { source: 'message' }, 'bottom-left': { source: 'team1' } }, picture: {} };
  const out = layoutSlots({ slots, eventName: 'Event', message: null, measure });
  const cut = out.texts.find((t) => t.position === 'top-left')!;
  assert.equal(cut.cut, true);
  assert.ok(cut.lines.at(-1)!.endsWith('…'));
  assert.ok(out.notes.some((note) => /top left text does not fit/.test(note)));
  assert.equal(out.texts.some((t) => t.source === 'message'), false, 'no message, no text');
  assert.equal(out.texts.some((t) => t.source === 'team1'), false, 'no team, no text');
});

test('slots at different positions that overlap are reported; a text on its own position\'s picture is by design', () => {
  const slots: FrameSlots = { text: { 'top-right': { source: 'custom', text: 'Hi' }, 'top-center': { source: 'custom', text: 'Centre' } }, picture: { 'top-right': { source: 'partnerLogo' }, 'bottom-center': { source: 'bar' }, 'bottom-left': { source: 'picture', images: [img('a')], size: 40 } } };
  const out = layoutSlots({ slots, logo: { width: 100, height: 100 }, pictures: { 'bottom-left': { width: 100, height: 100 } }, eventName: 'x', measure });
  assert.equal(out.notes.some((note) => /top right/.test(note) && /overlap/.test(note)), false, 'the top right text on the top right logo is not reported');
  assert.equal(out.notes.length, 0, out.notes.join(' | '));
  // a text laid over another position's picture: the left text of the bottom row is above the bar, so nothing; put a centre text over a corner picture instead
  const clash = layoutSlots({
    slots: { text: { 'top-center': { source: 'custom', text: 'Centre' } }, picture: { 'top-left': { source: 'picture', images: [img('a')], size: 40 } } },
    pictures: { 'top-left': { width: 400, height: 100 } },
    eventName: 'x',
    measure,
  });
  assert.ok(clash.notes.some((note) => /overlap/.test(note)), clash.notes.join(' | '));
});

test('a picture that cannot be drawn is reported; a missing partner logo is not a fault', () => {
  const slots: FrameSlots = { text: {}, picture: { 'top-left': { source: 'picture', images: [img('a')] }, 'top-right': { source: 'partnerLogo' }, 'bottom-center': { source: 'picture', images: [img('b')] } } };
  const out = layoutSlots({ slots, logo: null, pictures: {}, eventName: 'x', measure });
  assert.equal(out.pictures.length, 0);
  assert.deepEqual(out.notes, ['The bottom center picture could not be drawn.', 'The top left picture could not be drawn.']);
});
