/**
 * The geometry of the slots of a generated frame (docs/FRAME_SLOTS_PLAN.md, issue 502): where each picture and each text of a `FrameSlots` goes on a frame of any size, and the text
 * fitting. Pure like layout.ts (text is measured by an injected function), so the renderer and the live-view territories draw from the same numbers. The default slots give the same
 * numbers as `layoutFrame` for the same input (slot-layout.test.ts checks it), so a frame that starts from the default does not move.
 *
 * Positions (fractions of the frame, inside the 5 % safety margin): a corner picture fits a box of 15 % (or its own size) in the corner; a bar (a picture or the generated bar at a centre
 * position) is full width on its edge. A top text sits below a top bar and a bottom text above a bottom bar; a corner picture too. A centre text lies in the bar of its edge when there
 * is one. Pictures are drawn first, texts on top.
 */

import {
  BAR_HEIGHT,
  BAR_LINE,
  CORNER_TEXT_MAX_HEIGHT,
  LINE_HEIGHT,
  MESSAGE_FONT,
  PROBE,
  SAFETY_MARGIN,
  TEAMS_LEFT,
  TEAMS_MAX_FONT,
  TEAMS_MIN_FONT,
  TEAMS_TOP,
  TEAMS_WIDTH,
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_WIDTH,
  cutToFit,
  ellipsize,
  matchSides,
  rect,
  round,
  safetyArea,
  wrap,
  type LayerId,
  type Measure,
  type Rect,
} from './layout';
import { CORNER_PICTURE_SIZE, SLOT_POSITIONS, isCentre, isTop, type FrameSlots, type SlotPosition, type TextSource } from './slots';

/** A picture bar is at most this share of the frame height; a taller picture is shrunk with its shape kept. */
export const BAR_PICTURE_MAX = 0.3;
/** The space kept between a bar and what sits next to it, as a share of the frame height. */
const BAR_GAP = 0.02;

export interface SlotPictureDraw {
  id: LayerId;
  position: SlotPosition;
  kind: 'logo' | 'bar' | 'picture';
  /** Where it is drawn (aspect kept). */
  rect: Rect;
  /** The 1 % line of a generated bar, on the inner side of the bar. */
  line: Rect | null;
}

export interface SlotTextDraw {
  id: LayerId;
  position: SlotPosition;
  source: TextSource;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  /** The text block: the box width and the height of its lines. */
  rect: Rect;
  /** A colour of its own, or null for the heading colour of the style. */
  colour: string | null;
  /** True when the text did not fit even at the smallest size and was cut with an ellipsis, or is smaller than the smallest size of a title. */
  cut: boolean;
  /** Centre texts are one line, drawn in the middle of their box; corner texts are blocks of lines. */
  oneLine: boolean;
}

export interface SlotLayout {
  width: number;
  height: number;
  safety: Rect;
  pictures: SlotPictureDraw[];
  texts: SlotTextDraw[];
  /** What the editor should know, in words: a picture that could not be drawn, a text that is cut, slots that overlap. */
  notes: string[];
}

export interface SlotLayoutInput {
  width?: number;
  height?: number;
  slots: FrameSlots;
  /** Natural size of the partner logo (or the emoji drawn in its place); null when there is nothing to draw. */
  logo?: { width: number; height: number } | null;
  /** Natural size of the picture each `picture` slot draws (already chosen for the message). */
  pictures?: Partial<Record<SlotPosition, { width: number; height: number }>>;
  home?: string | null;
  visitor?: string | null;
  eventName: string;
  /** The message already picked and filled; null for none. */
  message?: string | null;
  measure: Measure;
}

const label = (position: SlotPosition) => position.replace('-', ' ');

function fitTwoLines(home: string, visitor: string, measure: Measure, box: Rect, height: number) {
  const widest = Math.max(measure(home, PROBE), measure(visitor, PROBE));
  const fit = widest > 0 ? (PROBE * box.width) / widest : Infinity;
  const size = Math.max(height * TEAMS_MIN_FONT, Math.min(height * TEAMS_MAX_FONT, fit, box.height / (2 * LINE_HEIGHT)));
  return { size, lines: [home, visitor].map((line) => ellipsize(line, measure, size, box.width)) };
}

function fitWrapped(text: string, measure: Measure, box: Rect, height: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const minSize = height * TEAMS_MIN_FONT;
  const longest = Math.max(...words.map((word) => measure(word, PROBE)));
  let size = Math.max(minSize, Math.min(height * TEAMS_MAX_FONT, longest > 0 ? (PROBE * box.width) / longest : Infinity));
  let lines = wrap(words, measure, size, box.width);
  while (lines.length * size * LINE_HEIGHT > box.height && size > minSize) {
    size = Math.max(minSize, size * 0.9);
    lines = wrap(words, measure, size, box.width);
  }
  const maxLines = Math.max(1, Math.floor(box.height / (size * LINE_HEIGHT)));
  if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), cutToFit(lines.slice(maxLines - 1).join(' '), measure, size, box.width)];
  return { size, lines };
}

/** One line in a box: 80 % of the box height, shrunk until it fits the width (the message of the default frame). */
function fitOneLine(text: string, measure: Measure, box: Rect) {
  const size = box.height * MESSAGE_FONT;
  const natural = measure(text, size);
  return round(natural > box.width ? (size * box.width) / natural : size);
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function layoutSlots(input: SlotLayoutInput): SlotLayout {
  const width = input.width ?? DEFAULT_FRAME_WIDTH;
  const height = input.height ?? DEFAULT_FRAME_HEIGHT;
  const safety = safetyArea(width, height);
  const { slots, measure } = input;
  const notes: string[] = [];
  const pictures: SlotPictureDraw[] = [];
  const gap = height * BAR_GAP;

  // 1. The bars: they take their edge, and everything else keeps clear of it.
  // `rect` is the bar itself (a text in it uses this); `edge` is where the free space begins, past the 1 % line of a generated bar.
  const bars: { top: { rect: Rect; edge: number } | null; bottom: { rect: Rect; edge: number } | null } = { top: null, bottom: null };
  for (const position of ['top-center', 'bottom-center'] as const) {
    const slot = slots.picture[position];
    if (!slot) continue;
    const top = isTop(position);
    if (slot.source === 'bar') {
      const barHeight = height * BAR_HEIGHT;
      const bar = rect(0, top ? 0 : height - barHeight, width, barHeight);
      const line = rect(0, top ? barHeight : height - barHeight - height * BAR_LINE, width, height * BAR_LINE);
      pictures.push({ id: 'bar', position, kind: 'bar', rect: bar, line });
      bars[top ? 'top' : 'bottom'] = { rect: bar, edge: top ? line.y + line.height : line.y };
    } else {
      const size = input.pictures?.[position];
      if (!size || !(size.width > 0) || !(size.height > 0)) {
        notes.push(`The ${label(position)} picture could not be drawn.`);
        continue;
      }
      const natural = (width * size.height) / size.width;
      const barHeight = Math.min(natural, height * BAR_PICTURE_MAX);
      const barWidth = barHeight < natural ? (barHeight * size.width) / size.height : width;
      const bar = rect((width - barWidth) / 2, top ? 0 : height - barHeight, barWidth, barHeight);
      pictures.push({ id: `picture-${position}`, position, kind: 'picture', rect: bar, line: null });
      bars[top ? 'top' : 'bottom'] = { rect: bar, edge: top ? bar.y + bar.height : bar.y };
    }
  }
  const topEdge = bars.top?.edge ?? null;
  const bottomEdge = bars.bottom?.edge ?? null;

  // 2. The corner pictures, in their corner of the safety area, clear of a bar on their edge.
  for (const position of SLOT_POSITIONS) {
    const slot = slots.picture[position];
    if (!slot || isCentre(position)) continue;
    const natural = slot.source === 'partnerLogo' ? input.logo : input.pictures?.[position];
    if (!natural || !(natural.width > 0) || !(natural.height > 0)) {
      // No partner logo (and no emoji to put in its place) is not a fault of the slot; a picture that cannot be drawn is.
      if (slot.source === 'picture') notes.push(`The ${label(position)} picture could not be drawn.`);
      continue;
    }
    // 15 % by default, the same box the logo of the default frame has (LOGO_BOX).
    const box = (slot.size ?? CORNER_PICTURE_SIZE) / 100;
    const scale = Math.min((width * box) / natural.width, (height * box) / natural.height);
    const w = natural.width * scale;
    const h = natural.height * scale;
    const x = position.endsWith('left') ? safety.x : safety.x + safety.width - w;
    const y = isTop(position) ? Math.max(safety.y, topEdge === null ? 0 : topEdge + gap) : Math.min(safety.y + safety.height, bottomEdge === null ? Infinity : bottomEdge - gap) - h;
    pictures.push({ id: slot.source === 'partnerLogo' ? 'logo' : `picture-${position}`, position, kind: slot.source === 'partnerLogo' ? 'logo' : 'picture', rect: rect(x, y, w, h), line: null });
  }

  // 3. The texts, on top.
  const sides = matchSides({ home: input.home, visitor: input.visitor, eventName: input.eventName });
  const texts: SlotTextDraw[] = [];
  for (const position of SLOT_POSITIONS) {
    const slot = slots.text[position];
    if (!slot) continue;
    const id: LayerId = slot.source === 'teams' || slot.source === 'message' ? slot.source : `text-${position}`;
    const colour = slot.colour ?? null;
    const single = {
      team1: sides?.[0] ?? input.home?.trim() ?? null,
      team2: sides?.[1] ?? input.visitor?.trim() ?? null,
      title: input.eventName.trim() || null,
      message: input.message?.trim() || null,
      custom: slot.text?.trim() || null,
    } as const;

    if (isCentre(position)) {
      // One line, in the bar of its edge, or in the zone a centre text has when there is no bar.
      const top = isTop(position);
      const bar = bars[top ? 'top' : 'bottom']?.rect ?? null;
      const barMargin = bar ? Math.min(height * SAFETY_MARGIN, bar.height * 0.25) : 0;
      const box = bar
        ? top
          ? rect(safety.x, bar.y + barMargin, safety.width, bar.height - barMargin)
          : rect(safety.x, bar.y, safety.width, bar.height - barMargin)
        : top
          ? rect(width * 0.35, height * TEAMS_TOP, width * 0.3, height * 0.15)
          : rect(width * SAFETY_MARGIN, height * (1 - BAR_HEIGHT), width * (1 - 2 * SAFETY_MARGIN), height * (BAR_HEIGHT - SAFETY_MARGIN));
      const text = slot.source === 'teams' ? (sides ? `${sides[0]} – ${sides[1]}` : input.eventName.trim() || null) : single[slot.source as keyof typeof single];
      if (!text) continue;
      const fontSize = fitOneLine(text, measure, box);
      const cut = fontSize < height * TEAMS_MIN_FONT;
      if (cut) notes.push(`The ${label(position)} text is very small: shorten it.`);
      texts.push({ id, position, source: slot.source, lines: [text], fontSize, lineHeight: round(fontSize * LINE_HEIGHT), align: 'center', rect: box, colour, cut, oneLine: true });
      continue;
    }

    const boxHeight = height * CORNER_TEXT_MAX_HEIGHT;
    const boxX = position.endsWith('left') ? width * TEAMS_LEFT : width * (1 - TEAMS_LEFT - TEAMS_WIDTH);
    const boxY = isTop(position)
      ? Math.max(height * TEAMS_TOP, topEdge === null ? 0 : topEdge + gap)
      : Math.min(height * (1 - TEAMS_TOP), bottomEdge === null ? Infinity : bottomEdge - gap) - boxHeight;
    const box = rect(boxX, boxY, width * TEAMS_WIDTH, boxHeight);
    const fitted =
      slot.source === 'teams' && sides ? fitTwoLines(sides[0], sides[1], measure, box, height) : fitWrapped(slot.source === 'teams' ? input.eventName : (single[slot.source as keyof typeof single] ?? ''), measure, box, height);
    if (!fitted) continue;
    const size = round(fitted.size);
    const lineHeight = round(size * LINE_HEIGHT);
    const blockHeight = lineHeight * fitted.lines.length;
    const cut = fitted.lines.some((line) => line.endsWith('…')) && !(slot.text ?? input.eventName).includes('…');
    if (cut) notes.push(`The ${label(position)} text does not fit and is cut: shorten it.`);
    texts.push({
      id,
      position,
      source: slot.source,
      lines: fitted.lines,
      fontSize: size,
      lineHeight,
      align: position.endsWith('left') ? 'left' : 'right',
      rect: rect(box.x, isTop(position) ? box.y : box.y + box.height - blockHeight, box.width, blockHeight),
      colour,
      cut,
      oneLine: false,
    });
  }

  // 4. Overlaps between different positions are allowed (a hashtag on a bar can be meant) but the editor is told.
  const items = [
    ...pictures.map((p) => ({ name: `${label(p.position)} picture`, position: p.position, rect: p.kind === 'bar' && p.line ? union(p.rect, p.line) : p.rect })),
    ...texts.map((t) => ({ name: `${label(t.position)} text`, position: t.position, rect: t.rect })),
  ];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].position !== items[j].position && intersects(items[i].rect, items[j].rect)) notes.push(`The ${items[i].name} and the ${items[j].name} overlap.`);
    }
  }

  return { width, height, safety, pictures, texts, notes };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return rect(x, y, Math.max(a.x + a.width, b.x + b.width) - x, Math.max(a.y + a.height, b.y + b.height) - y);
}

/** The boxes the live view shows as 50 % black territories, in drawing order; a generated bar's territory includes its line. */
export function slotLayerBoxes(layout: SlotLayout): Array<{ id: LayerId; rect: Rect }> {
  return [
    ...layout.pictures.map((p) => ({ id: p.id, rect: p.kind === 'bar' && p.line ? union(p.rect, p.line) : p.rect })),
    ...layout.texts.map((t) => ({ id: t.id, rect: t.rect })),
  ];
}
