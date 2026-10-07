'use client';

/**
 * The big round button of the club-designed journey pages (welcome step, CTA page with a picture): a real button with a ring, uppercase label,
 * in the colours from the page's settings (hex only; anything else falls back). Plain markup on purpose: the event theme restyles Mantine
 * buttons, and these colours are the club's own.
 */

import type { CSSProperties, ReactNode } from 'react';
import { CAMERA_DEFAULT_BRAND_COLOR, CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';

/** A colour from the page's settings is used only when it is a hex colour; anything else could reach the stylesheet as it is. */
export function safeColour(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : fallback;
}

export interface PillButtonProps {
  children: ReactNode;
  onClick: () => void;
  fill?: string;
  label?: string;
  ring?: string;
  /** `outline` is a quieter button for a second action: no fill, a smaller size. */
  variant?: 'solid' | 'outline';
  disabled?: boolean;
  ariaLabel?: string;
  style?: CSSProperties;
}

export default function PillButton({ children, onClick, fill, label, ring, variant = 'solid', disabled, ariaLabel, style }: PillButtonProps) {
  const background = safeColour(fill, CAMERA_DEFAULT_BRAND_COLOR);
  const outline = variant === 'outline';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white"
      style={{
        minWidth: 'min(80vw, 18rem)',
        minHeight: outline ? '3rem' : '4.25rem',
        padding: '0 2.5rem',
        border: `4px solid ${safeColour(ring, CAMERA_STAGE_WHITE)}`,
        borderRadius: '999px',
        background: outline ? 'transparent' : background,
        color: safeColour(label, CAMERA_STAGE_WHITE),
        fontFamily: 'inherit', // a button does not inherit the page's font by itself: the label is written in the event's font
        fontSize: outline ? '1rem' : '1.5rem',
        fontWeight: 800,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        boxShadow: outline ? 'none' : `0 0.75rem 2rem color-mix(in srgb, ${background} 55%, transparent)`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
