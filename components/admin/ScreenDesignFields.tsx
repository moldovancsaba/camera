'use client';

/**
 * The "Screen design" part of the slideshow editor (camera#309): optional overlay, QR and text layers around a photo window. Each layer can
 * be hidden without losing its settings. Everything is a percentage of the stage. The form keeps strings; `designFromDraft` turns them into the design the API
 * checks (lib/slideshow/screen-design.ts).
 */

import { Checkbox, Field, NumberInput, Select, SimpleGrid, Text, TextInput } from '@/components/gds/PublicPrimitives';
import ImagePicker from '@/components/admin/library/ImagePicker';
import { OVERLAY_PICTURE_TYPES, OVERLAY_PICTURE_WORDS } from '@/lib/library/image-files';
import type { ScreenDesign } from '@/lib/slideshow/screen-design';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminScreenDesignText } from '@/lib/i18n/admin-screen-design';

export interface ScreenDesignTextDraft { text: string; x: string; y: string; width: string; size: string; color: string; fit: boolean; visible: boolean }
export interface ScreenDesignDraft {
  overlayImageUrl: string; overlayVisible: boolean;
  left: string; top: string; width: string; height: string;
  photoFit: 'cover' | 'contain';
  fontFamily: string;
  qrUrl: string; qrVisible: boolean; qrX: string; qrY: string; qrSize: string; qrColor: string;
  texts: ScreenDesignTextDraft[];
}

const TEXT_ROWS = 3;
// A new text fills its box by default (owner, 2026-10-09): one line scaled to the box width.
const blankText = (): ScreenDesignTextDraft => ({ text: '', x: '', y: '', width: '', size: '', color: '', fit: true, visible: true });

/** Where a text typed into a row that has no place yet goes by default: under the photo window, as wide as the window, scaled to fill that width (`size` is then not used; it only has to be a number). */
export function placeUnderWindow(row: ScreenDesignTextDraft, window: { left: string; top: string; width: string; height: string }): ScreenDesignTextDraft {
  if (row.x || row.y || row.width || row.size) return row;
  const top = Number(window.top), height = Number(window.height);
  if (!window.left.trim() || !window.width.trim() || !window.top.trim() || !window.height.trim() || !Number.isFinite(top + height)) return row;
  return { ...row, x: window.left, width: window.width, y: String(Math.min(88, Math.round((top + height + 8.5) * 10) / 10)), size: '10' };
}

export const emptyDraft = (): ScreenDesignDraft => ({
  overlayImageUrl: '', overlayVisible: true, left: '', top: '', width: '', height: '', photoFit: 'cover', fontFamily: '',
  qrUrl: '', qrVisible: true, qrX: '', qrY: '', qrSize: '', qrColor: '', texts: Array.from({ length: TEXT_ROWS }, blankText),
});

const s = (v: number | undefined) => (v === undefined ? '' : String(v));

export function draftFromDesign(d: ScreenDesign | null | undefined): ScreenDesignDraft {
  if (!d) return emptyDraft();
  const texts = (d.texts ?? []).map((t) => ({ text: t.text, x: s(t.x), y: s(t.y), width: s(t.width), size: s(t.size), color: t.color ?? '', fit: t.fit === true, visible: t.visible !== false }));
  while (texts.length < TEXT_ROWS) texts.push(blankText());
  return {
    overlayImageUrl: d.overlayImageUrl ?? '', overlayVisible: d.overlayVisible !== false, left: s(d.window.left), top: s(d.window.top), width: s(d.window.width), height: s(d.window.height),
    photoFit: d.photoFit, fontFamily: d.fontFamily ?? '',
    qrUrl: d.qr?.url ?? '', qrVisible: d.qr?.visible !== false, qrX: s(d.qr?.x), qrY: s(d.qr?.y), qrSize: s(d.qr?.size), qrColor: d.qr?.color ?? '', texts,
  };
}

/** An address typed without its protocol (`go.messmass.com/mtk-vasas`) means https: the QR code only takes https, and nobody should have to type it. */
export function withHttps(value: string): string {
  const v = value.trim();
  return v && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? `https://${v.replace(/^\/+/, '')}` : v;
}

/** `null` removes an empty design; values that are not numbers are sent as NaN so the API names the problem. */
export function designFromDraft(draft: ScreenDesignDraft): ScreenDesign | null {
  const overlayImageUrl = draft.overlayImageUrl.trim();
  const hasQr = Boolean(draft.qrUrl.trim());
  const hasText = draft.texts.some((text) => text.text.trim());
  const hasWindow = [draft.left, draft.top, draft.width, draft.height].every((value) => value.trim() !== '');
  // A photo window is useful on its own when the manager wants a plain slideshow with no dynamic graphic layers.
  if (!overlayImageUrl && !hasQr && !hasText && !hasWindow) return null;
  const n = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));
  const out: ScreenDesign = {
    window: { left: n(draft.left), top: n(draft.top), width: n(draft.width), height: n(draft.height) },
    photoFit: draft.photoFit,
  };
  if (overlayImageUrl) {
    out.overlayImageUrl = overlayImageUrl;
    if (!draft.overlayVisible) out.overlayVisible = false;
  }
  if (draft.fontFamily.trim()) out.fontFamily = draft.fontFamily.trim();
  if (hasQr) out.qr = { url: withHttps(draft.qrUrl), x: n(draft.qrX), y: n(draft.qrY), size: n(draft.qrSize), ...(draft.qrColor.trim() ? { color: draft.qrColor.trim() } : {}), ...(!draft.qrVisible ? { visible: false } : {}) };
  const texts = draft.texts.filter((t) => t.text.trim()).map((t) => ({ text: t.text, x: n(t.x), y: n(t.y), width: n(t.width), size: n(t.size), align: 'center' as const, ...(t.fit ? { fit: true as const } : {}), ...(t.color.trim() ? { color: t.color.trim() } : {}), ...(!t.visible ? { visible: false } : {}) }));
  if (texts.length) out.texts = texts;
  return out;
}

function Num({ label, value, onChange, helper, disabled }: { label: string; value: string; onChange: (v: string) => void; helper?: string; disabled?: boolean }) {
  return (
    <Field label={label} helper={helper}>
      <NumberInput value={value === '' ? '' : Number(value)} min={0} max={100} step={0.1} decimalScale={3} disabled={disabled} onChange={(v) => onChange(v === '' || v === undefined ? '' : String(v))} />
    </Field>
  );
}

/** `eventMongoId` is the event of the slideshow: the overlay is chosen from that event's images library (camera#368). */
export default function ScreenDesignFields({ draft, onChange, eventMongoId, partnerId }: { draft: ScreenDesignDraft; onChange: (next: ScreenDesignDraft) => void; eventMongoId?: string; partnerId?: string }) {
  const language = useUiLanguage();
  const translate = (source: string) => adminScreenDesignText(source, language);
  const overlayHelper = [
    translate('A 16:9 picture (1920×1080), transparent where photos play.'),
    translate(partnerId ? "Upload to the partner's Images library." : "Upload to the event's Images library."),
    translate('Choose from available Images libraries or paste an HTTPS address.'),
    translate('PNG, WebP or SVG can be transparent; JPEG cannot.'),
    translate('Leave empty to skip the overlay image. QR and text layers can still show.'),
  ].join(' ');
  const set = <K extends keyof ScreenDesignDraft>(key: K, value: ScreenDesignDraft[K]) => onChange({ ...draft, [key]: value });
  const setText = (i: number, patch: Partial<ScreenDesignTextDraft>) => onChange({ ...draft, texts: draft.texts.map((t, j) => (j === i ? (patch.text !== undefined ? placeUnderWindow({ ...t, ...patch }, draft) : { ...t, ...patch }) : t)) });

  return (
    <>
      <ImagePicker
        label="Overlay picture"
        helper={overlayHelper}
        value={draft.overlayImageUrl}
        onChange={(url) => set('overlayImageUrl', url)}
        level={partnerId ? { scope: 'partner', partnerId } : { scope: 'event', eventId: eventMongoId ?? '' }}
        fileTypes={OVERLAY_PICTURE_TYPES}
        fileTypeWords={OVERLAY_PICTURE_WORDS}
      />
      <Checkbox label={translate('Show overlay picture')} checked={draft.overlayVisible} disabled={!draft.overlayImageUrl.trim()} onChange={(e) => set('overlayVisible', e.currentTarget.checked)} />

      <Text size="sm" fw={600}>Where the photos play (% of the stage)</Text>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Num label="Left" value={draft.left} onChange={(v) => set('left', v)} />
        <Num label="Top" value={draft.top} onChange={(v) => set('top', v)} />
        <Num label="Width" value={draft.width} onChange={(v) => set('width', v)} />
        <Num label="Height" value={draft.height} onChange={(v) => set('height', v)} />
      </SimpleGrid>
      <Field label="Photos fill the window">
        <Select value={draft.photoFit} onChange={(v) => set('photoFit', v === 'contain' ? 'contain' : 'cover')} data={[{ value: 'cover', label: 'Cover (crop to fill)' }, { value: 'contain', label: 'Contain (whole photo)' }]} localizeOptionLabels />
      </Field>

      <Field label="QR code address" helper="Use an active QR-kind tracked link for this event so scans are counted as QR visits. The event’s own short URL is counted as a regular link. https:// is added when omitted.">
        <TextInput value={draft.qrUrl} onChange={(e) => set('qrUrl', e.target.value)} placeholder="https://go.messmass.com/…" />
      </Field>
      <Checkbox label={translate('Show QR code')} checked={draft.qrVisible} disabled={!draft.qrUrl.trim()} onChange={(e) => set('qrVisible', e.currentTarget.checked)} />
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Num label="QR left (%)" value={draft.qrX} onChange={(v) => set('qrX', v)} />
        <Num label="QR top (%)" value={draft.qrY} onChange={(v) => set('qrY', v)} />
        <Num label="QR side (% of width)" value={draft.qrSize} onChange={(v) => set('qrSize', v)} />
        <Field label="QR colour"><TextInput value={draft.qrColor} onChange={(e) => set('qrColor', e.target.value)} placeholder="#RRGGBB (white if empty)" /></Field>
      </SimpleGrid>

      <Field label="Font" helper="A Google font name, e.g. Roboto."><TextInput value={draft.fontFamily} onChange={(e) => set('fontFamily', e.target.value)} placeholder="Roboto" /></Field>
      <Text size="sm" fw={600}>Texts (one line, centred in a box; % of the stage, size is % of its height)</Text>
      {draft.texts.map((textDraft, i) => {
        const showTextLabel = translate('Show text');
        return (
          <div key={i}>
            <SimpleGrid cols={{ base: 2, sm: 7 }}>
              <Field label={`Text ${i + 1}`}><TextInput value={textDraft.text} onChange={(e) => setText(i, { text: e.target.value })} /></Field>
              <Num label="Left (%)" value={textDraft.x} onChange={(v) => setText(i, { x: v })} />
              <Num label="Top (%)" value={textDraft.y} onChange={(v) => setText(i, { y: v })} />
              <Num label="Box width (%)" value={textDraft.width} onChange={(v) => setText(i, { width: v })} />
              <Num label="Size (%)" value={textDraft.size} onChange={(v) => setText(i, { size: v })} disabled={textDraft.fit} helper={textDraft.fit ? 'Set by the box width' : undefined} />
              <Field label="Fill the box" helper="Scale the line to the box width."><Checkbox checked={textDraft.fit} onChange={(e) => setText(i, { fit: e.currentTarget.checked })} aria-label={`Text ${i + 1} fills the box width`} /></Field>
              <Field label="Colour"><TextInput value={textDraft.color} onChange={(e) => setText(i, { color: e.target.value })} placeholder="#RRGGBB" /></Field>
            </SimpleGrid>
            <Checkbox label={showTextLabel} aria-label={`${showTextLabel} ${i + 1}`} checked={textDraft.visible} disabled={!textDraft.text.trim()} onChange={(e) => setText(i, { visible: e.currentTarget.checked })} />
          </div>
        );
      })}
    </>
  );
}
