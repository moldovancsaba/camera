import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import FullScreenPage from './FullScreenPage';

// On iPhone Safari 26 fixed content is drawn only above the floating bottom bar: a box taller than the visible screen (100lvh) had the bottom layers of
// the design anchored below the bar and cut off (CLAUDE.md section 7). The box is the visible screen, nothing more.
test('the full-screen box is the visible screen and no taller, so what is anchored to its bottom stays above the bar', () => {
  const html = renderToStaticMarkup(<FullScreenPage marker={{ 'data-test-page': '' }}>content</FullScreenPage>);
  assert.match(html, /position:fixed;inset:0;/);
  assert.match(html, /container-type:size/, 'children can be sized in cqh, a percentage of the box (svh is too small on a phone held sideways)');
  assert.equal(/min-height|lvh|100vh|100dvh/.test(html), false);
  assert.match(html, /data-test-page/);
});
