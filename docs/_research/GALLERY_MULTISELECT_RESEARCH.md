# Event gallery: selecting several photos at once (research, camera#488, owner report 207)

Date: 2026-10-09. Question from the owner: "select multiple images easily, like select the first and the last with Shift and select all in the interval, or select with the cursor like on desktop: make a research which one is feasible."

## Answer

**Both are feasible, in the browser, without a new dependency, and they work together.** Built and checked in a production build in a real browser:

1. **Click, then Shift+click** (range): the first click sets the anchor, a Shift+click on another photo selects everything between them in display order, in either direction. The range takes the state of the anchor (checked: the range is checked; unchecked: the range is taken out), as in a mail list. Ctrl/Cmd+click adds or takes one. It also works on the picture itself (not only on the small checkbox).
2. **Drag a box** (rubber band) like on a desktop: press on the space between the pictures, drag, and every photo the box touches is selected; Shift or Ctrl/Cmd keeps the earlier selection. A plain click on the empty space lets go of the selection.
3. **Select mode** (a button): a drag starts anywhere (on a picture too), a tap on a picture selects it instead of opening it, and `touch-action: none` lets a finger drag a box. It is the touch path (a laptop needs no mode).
4. **Keyboard:** Ctrl/Cmd+A selects every shown photo while the focus is in the gallery (the browser's own select-all is left alone elsewhere on the page), Esc clears and leaves Select mode, and a visually hidden live region says "N selected".

## Why this and not the alternatives

| Option | Feasible? | Verdict |
|---|---|---|
| Shift+click range on the checkboxes/pictures | Yes, ~40 lines of pure logic, unit-tested | **Built.** Works with mouse and keyboard, and is the single-pointer path WCAG 2.5.7 asks for next to any dragging |
| Rubber-band drag on a desktop | Yes: pointer events, the card rectangles read at each move (up to 100 cards, no measurable cost), a fixed box drawn over the page | **Built**, mouse and (in Select mode) touch |
| Long-press to start on touch, then drag | Possible, but a long press already means "open a menu" on phones and is hard for users with tremor or switch devices; and a long press is only a gesture, not a visible control | **Not built**; a visible **Select mode** button instead, per the guidance below |
| A library (`@air/react-drag-to-select`, `react-selecto`, `react-ds`, `use-selectify`) | Possible, but none is a clear fit | **Not used** (below) |
| Auto-scroll while dragging near the screen edge | Possible, a few more lines | **Not built** (100 cards fit about three screens; the owner can Shift+click across a scroll) |

**Libraries (checked October 2026, web):** `@air/react-drag-to-select` (last push reported June 2025, demo use only), `react-selecto` (registry metadata last modified December 2023; the popular one), `react-ds` (7 KB, needs an array of refs), `use-selectify` (hook, auto-scroll, zero dependencies), `react-dn-select` (archived June 2024). **None of the sources confirmed React 19 support** (this app is on React 19.2), so each would need a prototype and a peer-dependency check, and the rectangle logic they replace is about 60 lines (`lib/gallery/selection.ts`). Not worth a dependency here.

**Guidance used:** the W3C ARIA grid pattern (Shift+arrows extend a selection, Ctrl+A selects all, Esc clears; selection exposed to assistive technology); WCAG 2.5.7 Dragging Movements (a drag must have a single-pointer alternative: Shift+click and tap-to-toggle); WCAG 2.5.1 (click-and-hold is an accepted single-pointer gesture, but assistive devices often emulate only a click or tap, so entry must be a visible control, not long-press only); mail-list convention for range selection (anchor, and the range takes the anchor's state); the React Spectrum finding that the Shift state must be read at click time, not tracked through a window key listener (it fails when the window is not focused), which is what the component does (`event.shiftKey`).

## What was checked in a browser (production build, real mouse events)

Click the first photo, Shift+click the fourth: the first four selected, "4 selected" announced. A box dragged from the space between two photos over two photos: exactly those two selected and the box removed afterwards. Ctrl+A with the focus in the gallery: all 24 selected, default prevented; outside the gallery: untouched. Esc: cleared. Select mode on: `touch-action: none` on the grid, a click on a picture selected it and stayed on the page. **Not checked:** a real finger on a phone (no device here); the owner's phone check closes that part.

## Limits

- A page shows the 100 newest photos (Shift+click and the box work among those); older ones need paging (not built).
- The box is drawn over the page in screen coordinates and there is no auto-scroll.
- In Select mode a finger cannot scroll the grid (the mode is for selecting; switch it off to scroll).
