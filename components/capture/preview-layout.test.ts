import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PREVIEW_PANEL_CLASS, PREVIEW_PICTURE_CLASS, PREVIEW_ROW_CLASS } from './preview-layout';

// What phones and tablets had before issue 619 (owner feedback 2026-10-12: the photo was small on a big screen). These strings are frozen: the guest capture path does not change for them.
const PHONE_AND_TABLET = {
  row: 'mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col items-center gap-3 landscape:flex-row landscape:gap-4',
  picture: 'relative min-h-[20dvh] w-full flex-1 landscape:h-full landscape:min-h-0 landscape:min-w-0',
  panel: 'flex w-full max-w-md min-h-0 shrink flex-col gap-2 overflow-y-auto px-3 [&>:first-child]:my-auto landscape:h-full landscape:w-[22rem] landscape:max-w-[45%] landscape:shrink-0',
};
const BIG = 'min-[1280px]:landscape:';

const split = (classes: string) => {
  const tokens = classes.split(/\s+/).filter(Boolean);
  return { base: tokens.filter((token) => !token.startsWith(BIG)), big: tokens.filter((token) => token.startsWith(BIG)) };
};

for (const [name, classes, frozen] of [
  ['row', PREVIEW_ROW_CLASS, PHONE_AND_TABLET.row],
  ['picture box', PREVIEW_PICTURE_CLASS, PHONE_AND_TABLET.picture],
  ['card panel', PREVIEW_PANEL_CLASS, PHONE_AND_TABLET.panel],
] as const) {
  test(`preview ${name}: the classes of phones and tablets are exactly the old ones, everything new is for a landscape window of 1280 px and up`, () => {
    const { base, big } = split(classes);
    assert.equal(base.join(' '), frozen);
    assert.ok(big.length > 0, 'there is a large-window rule');
    // a rule with any other prefix would reach smaller windows
    assert.ok(base.every((token) => !/^(sm|md|lg|xl|2xl|min-\[\d+px\]|max-\[\d+px\]):/.test(token)), 'no other breakpoint');
  });
}

test('the large-window rules lift the 896 px cap, shape the photo box like the photo and widen the card with the window', () => {
  assert.match(PREVIEW_ROW_CLASS, /min-\[1280px\]:landscape:max-w-none/);
  assert.match(PREVIEW_ROW_CLASS, /min-\[1280px\]:landscape:justify-center/);
  assert.match(PREVIEW_PICTURE_CLASS, /min-\[1280px\]:landscape:aspect-\(--preview-aspect\)/);
  assert.match(PREVIEW_PICTURE_CLASS, /min-\[1280px\]:landscape:w-auto/);
  assert.match(PREVIEW_PANEL_CLASS, /min-\[1280px\]:landscape:w-\[clamp\(26rem,24vw,36rem\)\]/);
});

test('the capture page uses these classes for the row, the photo box (with the photo\'s shape) and every card of the preview step, and keeps no copy of its own', () => {
  const page = readFileSync('app/capture/[eventId]/page.tsx', 'utf8');
  assert.match(page, /<div className=\{PREVIEW_ROW_CLASS\}>/);
  assert.match(page, /className=\{PREVIEW_PICTURE_CLASS\} style=\{\{ '--preview-aspect': String\(previewAspect\) \}/);
  assert.equal((page.match(/className=\{PREVIEW_PANEL_CLASS\}/g) ?? []).length, 3, 'waiting, share and saved cards');
  assert.doesNotMatch(page, /max-w-4xl|landscape:w-\[22rem\]/);
});
