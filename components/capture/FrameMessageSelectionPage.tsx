'use client';

import Image from 'next/image';
import { Button } from '@mantine/core';
import type { CaptureVariant } from '@/lib/frame/capture';
import CaptureStageShell from '@/components/capture/CaptureStageShell';
import type { EventButtonSize } from '@/lib/events/visual-settings';

export interface SelectableFrame {
  frameId: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  tileStyle?: { imageUrl?: string; color?: string };
}

export interface FrameMessageSelectionPageProps {
  frames: SelectableFrame[];
  asksFrame: boolean;
  asksLayout: boolean;
  asksMessage: boolean;
  selectedFrameId: string | null;
  selectedLayoutId: string | null;
  selectedMessageIndex: number | null;
  layoutChoices: CaptureVariant[];
  messageChoices: CaptureVariant[];
  tiles?: Record<string, { imageUrl?: string; color?: string }>;
  layoutName: (layoutId: string) => string;
  title: string;
  logoUrl?: string | null;
  brandColor?: string;
  frameHeading: string;
  layoutHeading: string;
  messageHeading: string;
  generatedLayoutName: string;
  chooseFrameFirst: string;
  continueText: string;
  continueDisabled: boolean;
  buttonSize?: EventButtonSize;
  onFrameSelect: (frame: SelectableFrame) => void;
  onLayoutSelect: (variant: CaptureVariant) => void;
  onMessageSelect: (variant: CaptureVariant) => void;
  onContinue: () => void;
  compact?: boolean;
}

/** The single guest page for any enabled frame and message choices. */
export default function FrameMessageSelectionPage({
  frames, asksFrame, asksLayout, asksMessage, selectedFrameId, selectedLayoutId, selectedMessageIndex,
  layoutChoices, messageChoices, tiles = {}, layoutName, title, logoUrl, brandColor, frameHeading, layoutHeading, messageHeading,
  generatedLayoutName, chooseFrameFirst, continueText, continueDisabled, onFrameSelect, onLayoutSelect,
  onMessageSelect, onContinue, buttonSize, compact = false,
}: FrameMessageSelectionPageProps) {
  return (
    <CaptureStageShell title={title} logoUrl={logoUrl}>
    <div className={`mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 ${compact ? 'p-4' : 'p-4 sm:p-6'}`}>
      {asksFrame ? (
        <section aria-labelledby="capture-frame-heading">
          <h3 id="capture-frame-heading" className="mb-3 text-center text-base font-semibold">{frameHeading}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-tour-id="capture-frame-grid">
            {frames.map((frame) => (
              <button
                key={frame.frameId}
                type="button"
                onClick={() => onFrameSelect(frame)}
                aria-pressed={selectedFrameId === frame.frameId}
                className="aspect-square overflow-hidden rounded-xl border-2 transition-all"
                style={{ backgroundColor: frame.tileStyle?.color || undefined, borderColor: selectedFrameId === frame.frameId ? `var(--event-button-bg, ${brandColor || 'var(--mantine-color-blue-6)'})` : undefined }}
                data-frame-choice
              >
                {frame.tileStyle?.imageUrl ? (
                  <Image src={frame.tileStyle.imageUrl} alt={frame.name} width={600} height={600} unoptimized className="h-full w-full object-cover" />
                ) : frame.tileStyle?.color ? (
                  <span className="flex h-full w-full items-center justify-center p-3 text-center font-semibold">{frame.name}</span>
                ) : (
                  <Image src={frame.imageUrl} alt={frame.name} width={600} height={600} unoptimized className="h-full w-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {asksLayout ? (
        <section aria-labelledby="capture-layout-heading">
          <h3 id="capture-layout-heading" className="mb-3 text-center text-base font-semibold">{layoutHeading}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-tour-id="capture-layout-grid">
            {layoutChoices.map((variant) => {
              const id = variant.frameId ?? 'generated';
              const tile = tiles[id];
              const name = id === 'generated' ? generatedLayoutName : layoutName(id);
              const shown = layoutChoices.find((other) => (other.frameId ?? 'generated') === id && other.index === selectedMessageIndex) ?? variant;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onLayoutSelect(variant)}
                  aria-pressed={selectedLayoutId === id}
                  aria-label={name}
                  className="aspect-square overflow-hidden rounded-xl border-2 transition-all"
                  style={{ backgroundColor: tile?.color || undefined, borderColor: selectedLayoutId === id ? `var(--event-button-bg, ${brandColor || 'var(--mantine-color-blue-6)'})` : undefined }}
                  data-layout-choice
                >
                  {tile?.imageUrl ? (
                    <Image src={tile.imageUrl} alt="" width={600} height={600} unoptimized className="h-full w-full object-cover" />
                  ) : tile?.color ? (
                    <span className="flex h-full w-full items-center justify-center p-3 text-center font-semibold">{name}</span>
                  ) : (
                    <Image src={shown.imageUrl} alt={name} width={600} height={600} unoptimized className="h-full w-full object-cover" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      {asksMessage ? (
        <section aria-labelledby="capture-message-heading">
          <h3 id="capture-message-heading" className="mb-3 text-center text-base font-semibold">{messageHeading}</h3>
          {messageChoices.length > 0 ? (
            <div className="grid w-full grid-cols-1 gap-3" data-tour-id="capture-message-grid">
              {messageChoices.map((variant) => (
                <Button
                  key={variant.index}
                  type="button"
                  onClick={() => onMessageSelect(variant)}
                  aria-pressed={selectedMessageIndex === variant.index}
                  variant={selectedMessageIndex === variant.index ? 'filled' : 'light'}
                  size={buttonSize}
                  radius="xl"
                  fullWidth
                  className="min-h-16 w-full whitespace-normal px-5 py-4 text-center leading-tight"
                  classNames={{ label: 'w-full whitespace-normal' }}
                  data-message-choice
                >
                  {variant.message}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm">{chooseFrameFirst}</p>
          )}
        </section>
      ) : null}
      <div className="flex justify-center pb-2">
        <Button type="button" onClick={onContinue} disabled={continueDisabled} size={buttonSize} color={brandColor}>
          {continueText}
        </Button>
      </div>
    </div>
    </CaptureStageShell>
  );
}
