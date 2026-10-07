'use client';

/**
 * The layers of a giant-screen design above the photos (camera#309): the overlay picture (transparent where the photos play), the QR code
 * and the texts. All of it is positioned in percentages of the stage, which is a size container, so it scales with the screen. The QR code
 * arrives drawn (an SVG made by the server).
 */

import type { CSSProperties } from 'react';
import { CAMERA_STAGE_BLACK, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { fontFaceCss, fontStack, googleFontHref } from '@/lib/theme/css';
import type { ResolvedScreenDesign } from '@/lib/slideshow/screen-design';

const HEX = /^#[0-9a-f]{3,8}$/i;

/** Where the photos play. */
export function screenWindowStyle(design: ResolvedScreenDesign): CSSProperties {
  const w = design.window;
  return { left: `${w.left}%`, top: `${w.top}%`, width: `${w.width}%`, height: `${w.height}%` };
}

/**
 * The font of the texts: the one set on the design itself (a Google font), else the event's own from its messmass report style, loaded the
 * way the guest pages load it (Google stylesheet, or the custom font file of the style as an @font-face).
 */
function textFont(design: ResolvedScreenDesign): { stack: string | undefined; href: string | null; fontFace: string | null } {
  if (design.fontFamily) {
    const font = { family: design.fontFamily, source: 'google' as const, url: null };
    return { stack: fontStack({ font: { ...font, file: null } }), href: googleFontHref(design.fontFamily), fontFace: null };
  }
  const font = design.font;
  if (!font || font.source === 'system') return { stack: undefined, href: null, fontFace: null };
  return {
    stack: fontStack({ font: { ...font, file: null } }),
    href: font.source === 'google' ? googleFontHref(font.family) : null,
    fontFace: font.source === 'custom' ? fontFaceCss(font.family, font.url) : null,
  };
}

export default function ScreenDesignLayers({ design }: { design: ResolvedScreenDesign }) {
  const { stack: font, href, fontFace } = textFont(design);
  return (
    <>
      {href ? (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={href} />
      ) : null}
      {fontFace ? <style>{fontFace}</style> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={design.overlayImageUrl} alt="" className="pointer-events-none absolute inset-0 z-[3] h-full w-full" data-screen-overlay />
      {design.qr && design.qrSvg ? (
        <div
          role="img"
          aria-label="QR code"
          data-screen-qr
          className="pointer-events-none absolute z-[4]"
          style={{ left: `${design.qr.x}%`, top: `${design.qr.y}%`, width: `${design.qr.size}%`, aspectRatio: '1 / 1', filter: `drop-shadow(0 0.4cqh 0.5cqh color-mix(in srgb, ${CAMERA_STAGE_BLACK} 30%, transparent))` }}
          dangerouslySetInnerHTML={{ __html: design.qrSvg }}
        />
      ) : null}
      {(design.texts ?? []).map((t, i) => (
        <div
          key={i}
          data-screen-text
          className="pointer-events-none absolute z-[4]"
          style={{
            left: `${t.x}%`,
            top: `${t.y}%`,
            width: `${t.width}%`,
            fontSize: `${t.size}cqh`,
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
            fontWeight: 700,
            textAlign: t.align,
            color: t.color && HEX.test(t.color) ? t.color : CAMERA_STAGE_WHITE,
            fontFamily: font,
            textShadow: `0 0.3cqh 0.8cqh color-mix(in srgb, ${CAMERA_STAGE_BLACK} 35%, transparent)`,
          }}
        >
          {t.text}
        </div>
      ))}
    </>
  );
}
