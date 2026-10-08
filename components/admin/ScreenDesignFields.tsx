'use client';

/**
 * The "Screen design" part of the slideshow editor (camera#309): the picture drawn over the stage, where the photos play, the QR code and a
 * few short texts. Everything is a percentage of the stage. The form keeps strings; `designFromDraft` turns them into the design the API
 * checks (lib/slideshow/screen-design.ts).
 */

import { Field, NumberInput, Select, SimpleGrid, Text, TextInput } from '@/components/gds/PublicPrimitives';
import ImagePicker from '@/components/admin/library/ImagePicker';
import { OVERLAY_PICTURE_TYPES, OVERLAY_PICTURE_WORDS } from '@/lib/library/image-files';
import type { ScreenDesign } from '@/lib/slideshow/screen-design';

export interface ScreenDesignTextDraft { text: string; x: string; y: string; width: string; size: string; color: string }
export interface ScreenDesignDraft {
  overlayImageUrl: string;
  left: string; top: string; width: string; height: string;
  photoFit: 'cover' | 'contain';
  fontFamily: string;
  qrUrl: string; qrX: string; qrY: string; qrSize: string; qrColor: string;
  texts: ScreenDesignTextDraft[];
}

const TEXT_ROWS = 3;
const blankText = (): ScreenDesignTextDraft => ({ text: '', x: '', y: '', width: '', size: '', color: '' });

export const emptyDraft = (): ScreenDesignDraft => ({
  overlayImageUrl: '', left: '', top: '', width: '', height: '', photoFit: 'cover', fontFamily: '',
  qrUrl: '', qrX: '', qrY: '', qrSize: '', qrColor: '', texts: Array.from({ length: TEXT_ROWS }, blankText),
});

const s = (v: number | undefined) => (v === undefined ? '' : String(v));

export function draftFromDesign(d: ScreenDesign | null | undefined): ScreenDesignDraft {
  if (!d) return emptyDraft();
  const texts = (d.texts ?? []).map((t) => ({ text: t.text, x: s(t.x), y: s(t.y), width: s(t.width), size: s(t.size), color: t.color ?? '' }));
  while (texts.length < TEXT_ROWS) texts.push(blankText());
  return {
    overlayImageUrl: d.overlayImageUrl, left: s(d.window.left), top: s(d.window.top), width: s(d.window.width), height: s(d.window.height),
    photoFit: d.photoFit, fontFamily: d.fontFamily ?? '',
    qrUrl: d.qr?.url ?? '', qrX: s(d.qr?.x), qrY: s(d.qr?.y), qrSize: s(d.qr?.size), qrColor: d.qr?.color ?? '', texts,
  };
}

/** `null` removes the design (no picture); a value that is not a number is sent as NaN so the API names the problem. */
export function designFromDraft(draft: ScreenDesignDraft): ScreenDesign | null {
  if (!draft.overlayImageUrl.trim()) return null;
  const n = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));
  const out: ScreenDesign = {
    overlayImageUrl: draft.overlayImageUrl.trim(),
    window: { left: n(draft.left), top: n(draft.top), width: n(draft.width), height: n(draft.height) },
    photoFit: draft.photoFit,
  };
  if (draft.fontFamily.trim()) out.fontFamily = draft.fontFamily.trim();
  if (draft.qrUrl.trim()) out.qr = { url: draft.qrUrl.trim(), x: n(draft.qrX), y: n(draft.qrY), size: n(draft.qrSize), ...(draft.qrColor.trim() ? { color: draft.qrColor.trim() } : {}) };
  const texts = draft.texts.filter((t) => t.text.trim()).map((t) => ({ text: t.text, x: n(t.x), y: n(t.y), width: n(t.width), size: n(t.size), align: 'center' as const, ...(t.color.trim() ? { color: t.color.trim() } : {}) }));
  if (texts.length) out.texts = texts;
  return out;
}

function Num({ label, value, onChange, helper }: { label: string; value: string; onChange: (v: string) => void; helper?: string }) {
  return (
    <Field label={label} helper={helper}>
      <NumberInput value={value === '' ? '' : Number(value)} min={0} max={100} step={0.1} decimalScale={3} onChange={(v) => onChange(v === '' || v === undefined ? '' : String(v))} />
    </Field>
  );
}

/** `eventMongoId` is the event of the slideshow: the overlay is chosen from that event's images library (camera#368). */
export default function ScreenDesignFields({ draft, onChange, eventMongoId }: { draft: ScreenDesignDraft; onChange: (next: ScreenDesignDraft) => void; eventMongoId: string }) {
  const set = <K extends keyof ScreenDesignDraft>(key: K, value: ScreenDesignDraft[K]) => onChange({ ...draft, [key]: value });
  const setText = (i: number, patch: Partial<ScreenDesignTextDraft>) => onChange({ ...draft, texts: draft.texts.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <>
      <ImagePicker
        label="Overlay picture"
        helper="A 16:9 picture (1920×1080) drawn over the stage, transparent where the photos play: PNG, WebP or SVG, an https address. Leave empty for a plain slideshow."
        value={draft.overlayImageUrl}
        onChange={(url) => set('overlayImageUrl', url)}
        level={{ scope: 'event', eventId: eventMongoId }}
        fileTypes={OVERLAY_PICTURE_TYPES}
        fileTypeWords={OVERLAY_PICTURE_WORDS}
      />

      <Text size="sm" fw={600}>Where the photos play (% of the stage)</Text>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Num label="Left" value={draft.left} onChange={(v) => set('left', v)} />
        <Num label="Top" value={draft.top} onChange={(v) => set('top', v)} />
        <Num label="Width" value={draft.width} onChange={(v) => set('width', v)} />
        <Num label="Height" value={draft.height} onChange={(v) => set('height', v)} />
      </SimpleGrid>
      <Field label="Photos fill the window">
        <Select value={draft.photoFit} onChange={(v) => set('photoFit', v === 'contain' ? 'contain' : 'cover')} data={[{ value: 'cover', label: 'Cover (crop to fill)' }, { value: 'contain', label: 'Contain (whole photo)' }]} />
      </Field>

      <Field label="QR code address" helper="Camera draws the QR code. Where it points: https only.">
        <TextInput value={draft.qrUrl} onChange={(e) => set('qrUrl', e.target.value)} placeholder="https://go.messmass.com/…" />
      </Field>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Num label="QR left (%)" value={draft.qrX} onChange={(v) => set('qrX', v)} />
        <Num label="QR top (%)" value={draft.qrY} onChange={(v) => set('qrY', v)} />
        <Num label="QR side (% of width)" value={draft.qrSize} onChange={(v) => set('qrSize', v)} />
        <Field label="QR colour"><TextInput value={draft.qrColor} onChange={(e) => set('qrColor', e.target.value)} placeholder="#RRGGBB (white if empty)" /></Field>
      </SimpleGrid>

      <Field label="Font" helper="A Google font name, e.g. Roboto."><TextInput value={draft.fontFamily} onChange={(e) => set('fontFamily', e.target.value)} placeholder="Roboto" /></Field>
      <Text size="sm" fw={600}>Texts (centred in a box; % of the stage, size is % of its height)</Text>
      {draft.texts.map((t, i) => (
        <SimpleGrid key={i} cols={{ base: 2, sm: 6 }}>
          <Field label={`Text ${i + 1}`}><TextInput value={t.text} onChange={(e) => setText(i, { text: e.target.value })} /></Field>
          <Num label="Left (%)" value={t.x} onChange={(v) => setText(i, { x: v })} />
          <Num label="Top (%)" value={t.y} onChange={(v) => setText(i, { y: v })} />
          <Num label="Box width (%)" value={t.width} onChange={(v) => setText(i, { width: v })} />
          <Num label="Size (%)" value={t.size} onChange={(v) => setText(i, { size: v })} />
          <Field label="Colour"><TextInput value={t.color} onChange={(e) => setText(i, { color: e.target.value })} placeholder="#RRGGBB" /></Field>
        </SimpleGrid>
      ))}
    </>
  );
}
