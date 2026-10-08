'use client';

/**
 * Where a message is written on a frame (camera#366): a text-free frame that carries the messages of an event. The editor shows the frame with the
 * message box and the territories drawn on it, in the real proportions (the frame is drawn at 1920 x 1080), and saves the numbers. A frame with a message
 * area is not offered to users as a frame of their own: the messages of an event are written on it (each message chooses its frame, in the generated
 * frame panel of the event). Without one the frame is a complete frame, as before.
 */

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import { Button, Checkbox, ColorInput, Group, NumberInput, Stack, Text } from '@/components/gds/PublicPrimitives';
import { CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';
import { parseMessageArea, type MessageArea, type MessageBox } from '@/lib/frame/message-area';

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const DEFAULT_MESSAGE_BOX: MessageBox = { x: 96, y: 864, width: 1728, height: 162 };
const DEFAULT_HEADER: MessageBox = { x: 0, y: 0, width: FRAME_WIDTH, height: 100 };
const DEFAULT_FOOTER: MessageBox = { x: 0, y: FRAME_HEIGHT - 100, width: FRAME_WIDTH, height: 100 };

interface MessageAreaEditorProps {
  /** The frame's picture and name, for the preview. */
  pictureUrl: string | null;
  name: string;
  /** The message area the frame has now, or null for a complete frame. */
  value: MessageArea | null;
  disabled?: boolean;
  /** Saves the message area, or null to make it a complete frame again; throws with a plain message when it fails. */
  onSave: (area: MessageArea | null) => Promise<void>;
  onCancel?: () => void;
}

const BOX_FIELDS: Array<{ key: keyof MessageBox; label: string }> = [
  { key: 'x', label: 'Left (x)' },
  { key: 'y', label: 'Top (y)' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
];

function BoxFields({ label, box, disabled, onChange }: { label: string; box: MessageBox; disabled: boolean; onChange: (box: MessageBox) => void }) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {label}
      </Text>
      <Group gap="xs" wrap="wrap">
        {BOX_FIELDS.map(({ key, label: fieldLabel }) => (
          <NumberInput
            key={key}
            aria-label={`${label}: ${fieldLabel}`}
            label={fieldLabel}
            value={box[key]}
            min={0}
            max={key === 'x' || key === 'width' ? FRAME_WIDTH : FRAME_HEIGHT}
            hideControls
            disabled={disabled}
            onChange={(value) => onChange({ ...box, [key]: typeof value === 'number' ? value : 0 })}
            style={{ width: '7rem' }}
          />
        ))}
      </Group>
    </Stack>
  );
}

/** A rectangle of the frame as percentages of the preview. */
const rect = (box: MessageBox) => ({
  left: `${(box.x / FRAME_WIDTH) * 100}%`,
  top: `${(box.y / FRAME_HEIGHT) * 100}%`,
  width: `${(box.width / FRAME_WIDTH) * 100}%`,
  height: `${(box.height / FRAME_HEIGHT) * 100}%`,
});

export default function MessageAreaEditor({ pictureUrl, name, value, disabled = false, onSave, onCancel }: MessageAreaEditorProps) {
  const [carries, setCarries] = useState(value !== null);
  const [box, setBox] = useState<MessageBox>(value?.messageBox ?? DEFAULT_MESSAGE_BOX);
  const [colour, setColour] = useState(value?.messageColor ?? CAMERA_STAGE_WHITE);
  const [header, setHeader] = useState<MessageBox | null>(value?.layers?.find((layer) => layer.id === 'header') ?? null);
  const [footer, setFooter] = useState<MessageBox | null>(value?.layers?.find((layer) => layer.id === 'footer') ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const area = useMemo<MessageArea | null>(() => {
    if (!carries) return null;
    const layers = [...(header ? [{ id: 'header' as const, ...header }] : []), ...(footer ? [{ id: 'footer' as const, ...footer }] : [])];
    return { messageBox: box, messageColor: colour, ...(layers.length ? { layers } : {}) };
  }, [carries, box, colour, header, footer]);
  const usable = !carries || parseMessageArea(area) !== null;
  const unchanged = JSON.stringify(area) === JSON.stringify(value);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(area);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The message area could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const off = disabled || busy;
  return (
    <Stack gap="sm" style={{ borderTop: '1px solid var(--gds-color-border)', paddingTop: '0.75rem' }}>
      <Checkbox
        checked={carries}
        disabled={off}
        onChange={(event) => setCarries(event.currentTarget.checked)}
        label="This frame carries messages"
        description="Switch it on for a text-free frame: the messages of an event are written on it, in the box below. A frame that carries messages is not offered to users as a frame of their own."
      />
      {carries ? (
        <>
          {pictureUrl ? (
            <div
              role="img"
              aria-label={`${name} with the message box and the territories drawn on it`}
              style={{ aspectRatio: `${FRAME_WIDTH} / ${FRAME_HEIGHT}`, background: 'var(--mantine-color-gray-3)', borderRadius: 6, overflow: 'hidden', position: 'relative', width: '100%', maxWidth: 560 }}
            >
              <Image src={pictureUrl} alt="" fill unoptimized style={{ objectFit: 'fill' }} />
              {header ? <div style={{ ...rect(header), border: '2px dashed var(--mantine-color-red-6)', position: 'absolute' }} /> : null}
              {footer ? <div style={{ ...rect(footer), border: '2px dashed var(--mantine-color-red-6)', position: 'absolute' }} /> : null}
              <div style={{ ...rect(box), border: '2px solid var(--mantine-color-blue-6)', position: 'absolute' }} />
            </div>
          ) : null}
          <Text size="xs" c="dimmed">
            Numbers are pixels of the frame, which is drawn 1920 wide and 1080 high. The blue box is where the message is written, centred and made smaller to fit its width; the
            dashed boxes are the territories the live view darkens before the photo is taken.
          </Text>
          <BoxFields label="Message box" box={box} disabled={off} onChange={setBox} />
          <ColorInput label="Message colour" value={colour} onChange={setColour} disabled={off} style={{ maxWidth: '14rem' }} />
          <Checkbox checked={header !== null} disabled={off} onChange={(event) => setHeader(event.currentTarget.checked ? DEFAULT_HEADER : null)} label="A territory at the top" />
          {header ? <BoxFields label="Top territory" box={header} disabled={off} onChange={setHeader} /> : null}
          <Checkbox checked={footer !== null} disabled={off} onChange={(event) => setFooter(event.currentTarget.checked ? DEFAULT_FOOTER : null)} label="A territory at the bottom" />
          {footer ? <BoxFields label="Bottom territory" box={footer} disabled={off} onChange={setFooter} /> : null}
          {!usable ? <InlineAlert title="The boxes do not fit" message="Every box must sit inside the frame (1920 wide, 1080 high) and the colour must be a hex colour." severity="warning" /> : null}
        </>
      ) : null}
      {error ? <InlineAlert title="Not saved" message={error} severity="error" /> : null}
      <Group gap="xs">
        <Button type="button" size="xs" loading={busy} disabled={disabled || !usable || unchanged} onClick={() => void save()}>
          Save
        </Button>
        {onCancel ? (
          <Button type="button" size="xs" variant="light" disabled={off} onClick={onCancel}>
            Close
          </Button>
        ) : null}
      </Group>
      <Text size="xs" c="dimmed">
        Saving redraws the images of the events whose messages are written on this frame, which takes a few seconds.
      </Text>
    </Stack>
  );
}
