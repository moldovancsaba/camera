import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CAMERA_STAGE_BLACK, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import LedScreen3D, { LED_SCREEN_CSS } from './LedScreen3D';

const SRC = 'https://images.example.test/screen.jpg';

test('the giant screen is a box of six faces with the picture on the front, and the picture is described for screen readers', () => {
  const html = renderToStaticMarkup(<LedScreen3D imageUrl={SRC} alt="The giant screen of the stadium" />);
  for (const face of ['front', 'back', 'left', 'right', 'top', 'bottom']) assert.match(html, new RegExp(`led3d-face led3d-${face}`), face);
  assert.match(html, /<img src="https:\/\/images\.example\.test\/screen\.jpg" alt="The giant screen of the stadium"/);
  assert.equal((html.match(/<img /g) ?? []).length, 1, 'one picture, nothing else is downloaded');
  assert.equal((html.match(/aria-hidden/g) ?? []).length >= 7, true, 'the box, the grid and the gloss are decoration');
});

test('it is sized by the screen it is on, drawn in 3D, holds still when asked, and draws only in the two stage colours', () => {
  assert.match(LED_SCREEN_CSS, /--led-w: max\(9rem, min\(88vw, 52rem, calc\(\(50svh - 3\.6rem - max\(0\.6rem, 3svh\)\) \* 1\.5\)\)\)/);
  assert.match(LED_SCREEN_CSS, /aspect-ratio: 16 \/ 9/);
  assert.match(LED_SCREEN_CSS, /transform-style: preserve-3d/);
  assert.match(LED_SCREEN_CSS, /@media \(prefers-reduced-motion: reduce\) \{\s*\.led3d-body \{ animation: none; \}/);
  const hexes = new Set((LED_SCREEN_CSS.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((h) => h.toLowerCase()));
  assert.deepEqual([...hexes].sort(), [CAMERA_STAGE_BLACK, CAMERA_STAGE_WHITE].map((h) => h.toLowerCase()).sort(), 'every colour is one of the two stage tokens, mixed with color-mix');
  assert.equal(/rgba?\(|hsla?\(/i.test(LED_SCREEN_CSS), false);
});
