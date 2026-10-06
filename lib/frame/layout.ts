/**
 * Layout of the generated default frame (docs/DEFAULT_FRAME_PLAN.md, camera#232): every box in pixels for
 * any frame size, from the percent rules the owner set, plus the text fitting. Pure: no canvas, no DOM and
 * no network, text is measured by an injected function, so the renderer (server) and the live-view
 * territories (browser) draw from the same numbers and the module is unit-tested.
 *
 * At the default 1920x1080: safety area x 96..1824 y 54..1026; logo box 288x162 at the top right of the
 * safety area; teams text x 192..576 from y 108; bar y 864..1080 with a 1% line just above it; message
 * 1728x54 at y 918..972.
 */

export const DEFAULT_FRAME_WIDTH = 1920;
export const DEFAULT_FRAME_HEIGHT = 1080;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Width in pixels of `text` drawn at `fontSize`. Provided by the renderer (canvas) or a test. */
export type Measure = (text: string, fontSize: number) => number;

export interface FittedText {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** The text block: the box width and the height of its lines, from the box top. */
  rect: Rect;
}

export interface FrameLayout {
  width: number;
  height: number;
  safety: Rect;
  /** Where the logo is drawn (aspect kept); null when the partner has no logo. */
  logo: Rect | null;
  /** The teams text, or the event name when there are no teams; null when there is nothing to show. */
  teams: FittedText | null;
  bar: Rect;
  /** The 1% line above the bar. */
  barLine: Rect;
  message: { text: string; fontSize: number; rect: Rect } | null;
}

export type LayerId = 'logo' | 'teams' | 'bar' | 'message';

const SAFETY_MARGIN = 0.05;
const LOGO_BOX = 0.15;
const TEAMS_LEFT = 0.1;
const TEAMS_TOP = 0.1;
const TEAMS_WIDTH = 0.2;
const TEAMS_MAX_FONT = 0.1;
const TEAMS_MIN_FONT = 0.03;
const EVENT_NAME_MAX_LINES = 4;
const BAR_HEIGHT = 0.2;
const BAR_LINE = 0.01;
const MESSAGE_HEIGHT = 0.05;
const MESSAGE_BOTTOM = 0.1;
const MESSAGE_FONT = 0.8;
const LINE_HEIGHT = 1.15;
/** Text width is linear in the font size, so one probe size gives the size that fits a width. */
const PROBE = 100;

const round = (value: number) => Math.round(value * 100) / 100;
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x: round(x),
  y: round(y),
  width: round(width),
  height: round(height),
});

export function safetyArea(width: number, height: number): Rect {
  return rect(width * SAFETY_MARGIN, height * SAFETY_MARGIN, width * (1 - 2 * SAFETY_MARGIN), height * (1 - 2 * SAFETY_MARGIN));
}

/** The logo fitted (aspect kept) into 15% of the width by 15% of the height, at the top right of the safety area. */
export function fitLogo(width: number, height: number, logo: { width: number; height: number } | null | undefined): Rect | null {
  if (!logo || !(logo.width > 0) || !(logo.height > 0)) return null;
  const scale = Math.min((width * LOGO_BOX) / logo.width, (height * LOGO_BOX) / logo.height);
  const safe = safetyArea(width, height);
  const logoWidth = logo.width * scale;
  return rect(safe.x + safe.width - logoWidth, safe.y, logoWidth, logo.height * scale);
}

export const barRect = (width: number, height: number): Rect => rect(0, height * (1 - BAR_HEIGHT), width, height * BAR_HEIGHT);

/** The 1% line sits outside the bar, above it, so the sides and the bottom of the frame clip it away. */
export const barLine = (width: number, height: number): Rect =>
  rect(0, height * (1 - BAR_HEIGHT) - height * BAR_LINE, width, height * BAR_LINE);

export const messageBox = (width: number, height: number): Rect =>
  rect(width * SAFETY_MARGIN, height * (1 - MESSAGE_BOTTOM - MESSAGE_HEIGHT), width * (1 - 2 * SAFETY_MARGIN), height * MESSAGE_HEIGHT);

function textBlock(lines: string[], fontSize: number, width: number, height: number): FittedText {
  const size = round(fontSize);
  const lineHeight = round(size * LINE_HEIGHT);
  return { lines, fontSize: size, lineHeight, rect: rect(width * TEAMS_LEFT, height * TEAMS_TOP, width * TEAMS_WIDTH, lineHeight * lines.length) };
}

/** Home above visitor at one size: the longer of the two fills the box width, capped at 10% of the height. */
export function fitTeams(home: string, visitor: string, measure: Measure, width: number, height: number): FittedText {
  const widest = Math.max(measure(home, PROBE), measure(visitor, PROBE));
  const fit = widest > 0 ? (PROBE * width * TEAMS_WIDTH) / widest : height * TEAMS_MAX_FONT;
  return textBlock([home, visitor], Math.min(height * TEAMS_MAX_FONT, fit), width, height);
}

/** Greedy word wrap at one size; a word wider than the box is broken by characters. */
function wrap(words: string[], measure: Measure, size: number, boxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    let rest = word;
    while (measure(rest, size) > boxWidth && Array.from(rest).length > 1) {
      let cut = Array.from(rest).length - 1;
      while (cut > 1 && measure(Array.from(rest).slice(0, cut).join(''), size) > boxWidth) cut -= 1;
      if (line) lines.push(line);
      line = '';
      lines.push(Array.from(rest).slice(0, cut).join(''));
      rest = Array.from(rest).slice(cut).join('');
    }
    const candidate = line ? `${line} ${rest}` : rest;
    if (!line || measure(candidate, size) <= boxWidth) line = candidate;
    else {
      lines.push(line);
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The event name in the teams box when there are no teams: several lines at the largest size (at most the cap) that keeps every word inside the box. */
export function fitEventName(name: string, measure: Measure, width: number, height: number): FittedText | null {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const boxWidth = width * TEAMS_WIDTH;
  const longest = Math.max(...words.map((word) => measure(word, PROBE)));
  const minSize = height * TEAMS_MIN_FONT;
  let size = Math.max(minSize, Math.min(height * TEAMS_MAX_FONT, longest > 0 ? (PROBE * boxWidth) / longest : height * TEAMS_MAX_FONT));
  let lines = wrap(words, measure, size, boxWidth);
  while (lines.length > EVENT_NAME_MAX_LINES && size > minSize) {
    size = Math.max(minSize, size * 0.9);
    lines = wrap(words, measure, size, boxWidth);
  }
  if (lines.length > EVENT_NAME_MAX_LINES) {
    let last = `${lines.slice(EVENT_NAME_MAX_LINES - 1).join(' ')}`;
    while (last && measure(`${last}…`, size) > boxWidth) last = Array.from(last).slice(0, -1).join('');
    lines = [...lines.slice(0, EVENT_NAME_MAX_LINES - 1), `${last}…`];
  }
  return textBlock(lines, size, width, height);
}

/** One line in the message box: 80% of the box height, shrunk until it fits the width. */
export function fitMessage(text: string, measure: Measure, width: number, height: number): { text: string; fontSize: number; rect: Rect } {
  const box = messageBox(width, height);
  const size = box.height * MESSAGE_FONT;
  const natural = measure(text, size);
  return { text, fontSize: round(natural > box.width ? (size * box.width) / natural : size), rect: box };
}

export interface FrameLayoutInput {
  width?: number;
  height?: number;
  /** Natural size of the logo image; null or undefined when the partner has none. */
  logo?: { width: number; height: number } | null;
  home?: string | null;
  visitor?: string | null;
  eventName: string;
  /** The message already picked and filled (lib/frame/messages.ts); null for no message layer. */
  message?: string | null;
  measure: Measure;
}

export function layoutFrame(input: FrameLayoutInput): FrameLayout {
  const width = input.width ?? DEFAULT_FRAME_WIDTH;
  const height = input.height ?? DEFAULT_FRAME_HEIGHT;
  const home = input.home?.trim();
  const visitor = input.visitor?.trim();
  const message = input.message?.trim();
  return {
    width,
    height,
    safety: safetyArea(width, height),
    logo: fitLogo(width, height, input.logo),
    // Teams only when both are known; with one or none the event name says more than a lone team.
    teams: home && visitor ? fitTeams(home, visitor, input.measure, width, height) : fitEventName(input.eventName, input.measure, width, height),
    bar: barRect(width, height),
    barLine: barLine(width, height),
    message: message ? fitMessage(message, input.measure, width, height) : null,
  };
}

/** The boxes the live view shows as 50% black territories, in drawing order; the bar territory includes its line. */
export function layerBoxes(layout: FrameLayout): Array<{ id: LayerId; rect: Rect }> {
  const boxes: Array<{ id: LayerId; rect: Rect }> = [];
  if (layout.logo) boxes.push({ id: 'logo', rect: layout.logo });
  if (layout.teams) boxes.push({ id: 'teams', rect: layout.teams.rect });
  boxes.push({ id: 'bar', rect: rect(0, layout.barLine.y, layout.width, layout.height - layout.barLine.y) });
  if (layout.message) boxes.push({ id: 'message', rect: layout.message.rect });
  return boxes;
}
