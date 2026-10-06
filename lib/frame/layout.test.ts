import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  barLine,
  splitMatchName,
  barRect,
  fitEventName,
  fitLogo,
  fitMessage,
  fitTeams,
  layerBoxes,
  layoutFrame,
  messageBox,
  safetyArea,
  type Measure,
  type Rect,
} from './layout';

// Every character is half a font size wide: simple, linear like real text, and independent of any font.
const measure: Measure = (text, size) => Array.from(text).length * size * 0.5;
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

test('the boxes at 1920x1080 are the ones in the plan table', () => {
  assert.deepEqual(safetyArea(1920, 1080), { x: 96, y: 54, width: 1728, height: 972 });
  assert.deepEqual(barRect(1920, 1080), { x: 0, y: 864, width: 1920, height: 216 });
  assert.deepEqual(barLine(1920, 1080), { x: 0, y: 853.2, width: 1920, height: 10.8 });
  assert.deepEqual(messageBox(1920, 1080), { x: 96, y: 864, width: 1728, height: 162 });
});

test('the message box runs from the top of the bar to the bottom safety margin', () => {
  const bar = barRect(1920, 1080);
  const message = messageBox(1920, 1080);
  const safety = safetyArea(1920, 1080);
  assert.equal(message.y, bar.y);
  assert.equal(message.y + message.height, safety.y + safety.height);
  assert.equal(message.height, 1080 * 0.15);
});

test('the bar line sits above the bar: only its top edge shows, never the sides or the bottom', () => {
  const bar = barRect(1920, 1080);
  const line = barLine(1920, 1080);
  assert.equal(line.y + line.height, bar.y);
  assert.equal(line.x, 0);
  assert.equal(line.width, 1920);
});

test('the logo is fitted into 15% x 15% at the top right of the safety area, aspect kept', () => {
  assert.deepEqual(fitLogo(1920, 1080, { width: 200, height: 200 }), { x: 1662, y: 54, width: 162, height: 162 });
  assert.deepEqual(fitLogo(1920, 1080, { width: 300, height: 100 }), { x: 1536, y: 54, width: 288, height: 96 });
  assert.deepEqual(fitLogo(1920, 1080, { width: 100, height: 300 }), { x: 1770, y: 54, width: 54, height: 162 });
});

test('a small logo is scaled up to the box, a large one down', () => {
  assert.equal(fitLogo(1920, 1080, { width: 40, height: 40 })?.width, 162);
  assert.equal(fitLogo(1920, 1080, { width: 4000, height: 4000 })?.width, 162);
});

test('no logo, or a logo without a size, means no logo layer', () => {
  assert.equal(fitLogo(1920, 1080, null), null);
  assert.equal(fitLogo(1920, 1080, undefined), null);
  assert.equal(fitLogo(1920, 1080, { width: 0, height: 100 }), null);
});

test('every size keeps the same proportions', () => {
  assert.deepEqual(safetyArea(1280, 720), { x: 64, y: 36, width: 1152, height: 648 });
  assert.deepEqual(barRect(1280, 720), { x: 0, y: 576, width: 1280, height: 144 });
  assert.deepEqual(messageBox(1280, 720), { x: 64, y: 576, width: 1152, height: 108 });
});

test('the teams text: the longer line fills the 384 px box, home above visitor at one size', () => {
  const teams = fitTeams('FC Barcelona', 'Real Madrid', measure, 1920, 1080);
  assert.deepEqual(teams.lines, ['FC Barcelona', 'Real Madrid']);
  assert.equal(teams.fontSize, 64);
  assert.deepEqual(teams.rect, { x: 192, y: 108, width: 384, height: 147.2 });
  assert.equal(teams.align, 'left');

  const longerVisitor = fitTeams('AS Roma', 'Brøndby IF Copenhagen', measure, 1920, 1080);
  assert.ok(measure('Brøndby IF Copenhagen', longerVisitor.fontSize) <= 384 + 0.01);
  assert.ok(longerVisitor.fontSize < 64);
});

test('very short names do not grow past 10% of the frame height', () => {
  assert.equal(fitTeams('FC', 'AC', measure, 1920, 1080).fontSize, 108);
});

test('the teams text never gets taller than 25% of the frame height', () => {
  for (const [home, visitor] of [['FC', 'AC'], ['FC Barcelona', 'Real Madrid'], ['A', 'Brøndby IF Copenhagen Supporters Club']]) {
    assert.ok(fitTeams(home, visitor, measure, 1920, 1080).rect.height <= 270, `${home} v ${visitor}`);
  }
});

test('very long names stop shrinking at 3% of the frame height and the end of the line is cut with an ellipsis', () => {
  const teams = fitTeams('Brøndby IF Copenhagen Supporters Club International', 'FC', measure, 1920, 1080);
  assert.equal(teams.fontSize, 32.4);
  assert.ok(teams.lines[0].endsWith('…'));
  assert.ok(measure(teams.lines[0], teams.fontSize) <= 384 + 0.01);
  assert.equal(teams.lines[1], 'FC');
});

test('the event name replaces the teams: several lines, every line inside the box, left aligned', () => {
  const name = fitEventName('Spring Festival', measure, 1920, 1080);
  assert.deepEqual(name?.lines, ['Spring', 'Festival']);
  assert.equal(name?.fontSize, 96);
  assert.equal(name?.align, 'left');

  const long = fitEventName('The Big Annual Spring Fan Festival Opening Night 2026 Edition', measure, 1920, 1080);
  assert.ok(long);
  assert.ok(long!.rect.height <= 270, 'the block stays inside the maximum box height');
  assert.ok(long!.fontSize >= 32.4 && long!.fontSize <= 108);
  for (const line of long!.lines) assert.ok(measure(line, long!.fontSize) <= 384 + 0.01, line);
});

test('a word wider than the box is broken instead of overflowing', () => {
  const name = fitEventName('Supercalifragilisticexpialidocious', measure, 1920, 1080);
  assert.ok(name && name.lines.length >= 2);
  for (const line of name?.lines ?? []) assert.ok(measure(line, name!.fontSize) <= 384 + 0.01, line);
  assert.equal(name?.lines.join(''), 'Supercalifragilisticexpialidocious');
});

test('a name too long for the box at the smallest size loses its last part and ends in an ellipsis that fits', () => {
  const words = Array.from({ length: 40 }, (_, i) => `Word${i}`).join(' ');
  const name = fitEventName(words, measure, 1920, 1080);
  assert.equal(name?.fontSize, 32.4);
  assert.equal(name?.lines.length, 7);
  assert.ok(name?.lines[6].endsWith('…'));
  assert.ok(name!.rect.height <= 270);
  for (const line of name?.lines ?? []) assert.ok(measure(line, name!.fontSize) <= 384 + 0.01, line);
});

test('an empty event name has no text', () => {
  assert.equal(fitEventName('   ', measure, 1920, 1080), null);
});

test('the message is one line: 80% of the 162 px box height, shrunk to fit the width', () => {
  assert.equal(fitMessage('Go! Go! Go!', measure, 1920, 1080).fontSize, 129.6);
  const long = fitMessage('x'.repeat(100), measure, 1920, 1080);
  assert.ok(long.fontSize < 129.6);
  assert.ok(measure(long.text, long.fontSize) <= 1728 + 0.01);
});

test('the frame with teams, logo and message: nothing overlaps and everything but the bar is inside the safety area', () => {
  const layout = layoutFrame({
    logo: { width: 200, height: 200 },
    home: 'FC Barcelona',
    visitor: 'Real Madrid',
    eventName: 'El Clásico',
    message: 'Let’s Go, FC Barcelona',
    measure,
  });
  const boxes = layerBoxes(layout);
  assert.deepEqual(boxes.map((box) => box.id), ['logo', 'teams', 'bar', 'message']);
  for (const box of boxes) {
    if (box.id !== 'bar') assert.ok(inside(box.rect, layout.safety), `${box.id} is inside the safety area`);
  }
  const rects = Object.fromEntries(boxes.map((box) => [box.id, box.rect]));
  assert.equal(overlaps(rects.logo, rects.teams), false);
  assert.equal(overlaps(rects.logo, rects.bar), false);
  assert.equal(overlaps(rects.teams, rects.bar), false);
  assert.ok(inside(rects.message, layout.bar), 'the message is over the bar');
});

test('the bar territory includes its line', () => {
  const layout = layoutFrame({ eventName: 'x', measure });
  const bar = layerBoxes(layout).find((box) => box.id === 'bar');
  assert.deepEqual(bar?.rect, { x: 0, y: 853.2, width: 1920, height: 226.8 });
});

test('no logo, no teams and no message leave only the event name and the bar', () => {
  const layout = layoutFrame({ eventName: 'Fan Day', logo: null, home: null, visitor: null, message: null, measure });
  assert.equal(layout.logo, null);
  assert.deepEqual(layout.teams?.lines, ['Fan Day']);
  assert.equal(layout.message, null);
  assert.deepEqual(layerBoxes(layout).map((box) => box.id), ['teams', 'bar']);
});

test('one team alone is not a match: the event name is shown', () => {
  const layout = layoutFrame({ eventName: 'Fan Day', home: 'FC Barcelona', visitor: '  ', measure });
  assert.deepEqual(layout.teams?.lines, ['Fan Day']);
});

test('an event name that is a pairing splits at its separator, without the separator', () => {
  assert.deepEqual(splitMatchName('Casademont Zaragoza - Basket Landes'), ['Casademont Zaragoza', 'Basket Landes']);
  assert.deepEqual(splitMatchName('Valencia Basket Club  - Fenerbahce Tarfin'), ['Valencia Basket Club', 'Fenerbahce Tarfin']);
  assert.deepEqual(splitMatchName('Roma x Lazio'), ['Roma', 'Lazio']);
  assert.deepEqual(splitMatchName('Roma X Lazio'), ['Roma', 'Lazio']);
  assert.deepEqual(splitMatchName('Roma × Lazio'), ['Roma', 'Lazio']);
  assert.deepEqual(splitMatchName('Roma vs Lazio'), ['Roma', 'Lazio']);
  assert.deepEqual(splitMatchName('Roma vs. Lazio'), ['Roma', 'Lazio']);
  assert.deepEqual(splitMatchName('Roma v Lazio'), ['Roma', 'Lazio']);
  assert.deepEqual(splitMatchName('Roma – Lazio'), ['Roma', 'Lazio']);
  assert.deepEqual(splitMatchName('Roma — Lazio'), ['Roma', 'Lazio']);
});

test('the stronger separator wins, so a hyphen inside a team name stays', () => {
  assert.deepEqual(splitMatchName('OTP Bank - PICK Szeged x Sporting Clube de Portugal'), ['OTP Bank - PICK Szeged', 'Sporting Clube de Portugal']);
});

test('an ambiguous name, a name with an empty side, and a name without a separator are not split', () => {
  assert.equal(splitMatchName('A - B - C'), null);
  assert.equal(splitMatchName('A x B x C'), null);
  assert.equal(splitMatchName('Roma -'), null);
  assert.equal(splitMatchName('- Lazio'), null);
  assert.equal(splitMatchName('Fan Day'), null);
  assert.equal(splitMatchName('Max Xavier'), null, 'a letter x inside a word is not a separator');
  assert.equal(splitMatchName('Pre-season friendly'), null, 'a hyphen without spaces is not a separator');
  assert.equal(splitMatchName(''), null);
});

test('without teams a pairing in the event name is shown like the teams: two lines, no separator, left aligned', () => {
  const layout = layoutFrame({ eventName: 'Casademont Zaragoza - Basket Landes', home: null, visitor: null, measure });
  assert.deepEqual(layout.teams?.lines, ['Casademont Zaragoza', 'Basket Landes']);
  assert.equal(layout.teams?.align, 'left');
  assert.ok(layout.teams!.lines.every((line) => !line.includes(' - ')));
  assert.ok(measure('Casademont Zaragoza', layout.teams!.fontSize) <= 384 + 0.01);
  assert.deepEqual(layout.teams, fitTeams('Casademont Zaragoza', 'Basket Landes', measure, 1920, 1080));
});

test('one team alone does not stop the split, and real teams still win over the name', () => {
  const alone = layoutFrame({ eventName: 'Roma x Lazio', home: 'AS Roma', visitor: null, measure });
  assert.deepEqual(alone.teams?.lines, ['Roma', 'Lazio']);
  const both = layoutFrame({ eventName: 'Roma x Lazio', home: 'FC Barcelona', visitor: 'Real Madrid', measure });
  assert.deepEqual(both.teams?.lines, ['FC Barcelona', 'Real Madrid']);
});

test('a name that does not split still wraps as an event name', () => {
  const layout = layoutFrame({ eventName: 'Spring Festival', measure });
  assert.deepEqual(layout.teams?.lines, ['Spring', 'Festival']);
});
