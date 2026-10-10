'use client';

/**
 * The toolbar editor of the words of an e-mail (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E4; owner answer 197): a text with buttons for bold, italic, title, small and large text, a
 * link, a picture (issue 376; only where the page gives it a library to choose from) and a menu of variables. It writes the markup of lib/email/rich.ts, so nothing but those marks can be in an e-mail; the preview (EmailPreview) shows the result next to it. A
 * subject is one line with the variable menu only. The page saves; this edits a draft.
 */

import { useRef, useState } from 'react';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import { Button, Group, Textarea, TextInput } from '@/components/gds/PublicPrimitives';
import ImagePicker from '@/components/admin/library/ImagePicker';
import { insertAt, linkAddressProblem, makeLink, makePicture, paragraphKindAt, pictureProblem, setParagraphKind, wrapSelection, type Edit } from '@/lib/email/editor-ops';
import { MENU_VARIABLES } from '@/lib/email/variables';
import type { PickerLevel } from '@/lib/library/picker';

export interface EmailTextEditorProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** `subject` is a single line; `body` and `legal` are texts with the toolbar. */
  kind: 'subject' | 'body' | 'legal';
  disabled?: boolean;
  description?: string;
  placeholder?: string;
  error?: string | null;
  /** The library a picture is chosen from (and uploaded to); without it the toolbar has no Picture button. A picture is for the message, not for the subject or the small print. */
  pictureLevel?: PickerLevel;
}

const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;

function VariableMenu({ disabled, onPick }: { disabled?: boolean; onPick: (name: string) => void }) {
  return (
    <select
      aria-label="Insert a variable"
      value=""
      disabled={disabled}
      onChange={(event) => {
        const name = event.currentTarget.value;
        if (name) onPick(name);
      }}
      // A native select is as wide as its longest option (a variable and its description), which made the whole page wider than a phone: a fixed width, and never wider than the toolbar.
      style={{ minHeight: 30, width: '12rem', maxWidth: '100%' }}
    >
      <option value="">Variable…</option>
      {MENU_VARIABLES.map((variable) => (
        <option key={variable.name} value={variable.name}>
          {`{${variable.name}}  ${variable.label}`}
        </option>
      ))}
    </select>
  );
}

export default function EmailTextEditor({ label, value, onChange, kind, disabled, description, placeholder, error, pictureLevel }: EmailTextEditorProps) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const line = useRef<HTMLInputElement | null>(null);
  const [link, setLink] = useState<{ start: number; end: number; address: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [picture, setPicture] = useState<{ cursor: number; src: string; description: string; link: string } | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  // Where the cursor is, to show which kind the paragraph under it is (refs are not read while drawing).
  const [cursor, setCursor] = useState(0);

  const field = (): HTMLTextAreaElement | HTMLInputElement | null => (kind === 'subject' ? line.current : area.current);

  /** Applies an edit and puts the selection where the edit says, once the new text is drawn. */
  const apply = (edit: Edit) => {
    onChange(edit.text);
    requestAnimationFrame(() => {
      const element = field();
      if (!element) return;
      element.focus();
      element.setSelectionRange(edit.start, edit.end);
    });
  };
  const selection = (): { start: number; end: number } => {
    const element = field();
    return { start: element?.selectionStart ?? value.length, end: element?.selectionEnd ?? value.length };
  };

  const keepSelection = (event: React.MouseEvent) => event.preventDefault();

  const toolbar =
    kind === 'subject' ? null : (
      <Group gap="xs" wrap="wrap" aria-label="Formatting">
        <Button type="button" variant="light" size="xs" disabled={disabled} onMouseDown={keepSelection} onClick={() => apply(wrapSelection(value, selection().start, selection().end, '**'))} aria-label="Bold">
          <strong>B</strong>
        </Button>
        <Button type="button" variant="light" size="xs" disabled={disabled} onMouseDown={keepSelection} onClick={() => apply(wrapSelection(value, selection().start, selection().end, '*'))} aria-label="Italic">
          <em>I</em>
        </Button>
        {(['title', 'large', 'small'] as const).map((blockKind) => (
          <Button
            key={blockKind}
            type="button"
            variant={paragraphKindAt(value, cursor) === blockKind ? 'filled' : 'light'}
            size="xs"
            disabled={disabled}
            onMouseDown={keepSelection}
            onClick={() => apply(setParagraphKind(value, selection().start, blockKind))}
            aria-label={blockKind === 'title' ? 'Make the paragraph a title' : blockKind === 'large' ? 'Make the paragraph large text' : 'Make the paragraph small text'}
          >
            {blockKind === 'title' ? 'Title' : blockKind === 'large' ? 'Large' : 'Small'}
          </Button>
        ))}
        <Button
          type="button"
          variant="light"
          size="xs"
          disabled={disabled}
          onMouseDown={keepSelection}
          onClick={() => {
            const { start, end } = selection();
            setLink({ start, end, address: '' });
            setLinkError(null);
          }}
          aria-label="Add a link"
        >
          Link
        </Button>
        {pictureLevel && kind === 'body' ? (
          <Button
            type="button"
            variant="light"
            size="xs"
            disabled={disabled}
            onMouseDown={keepSelection}
            onClick={() => {
              setPicture({ cursor: selection().start, src: '', description: '', link: '' });
              setPictureError(null);
            }}
            aria-label="Add a picture"
          >
            Picture
          </Button>
        ) : null}
        <VariableMenu disabled={disabled} onPick={(name) => apply(insertAt(value, selection().start, selection().end, `{${name}}`))} />
      </Group>
    );

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      {kind === 'subject' ? (
        <Group gap="xs" wrap="wrap" align="center">
          <TextInput
            ref={line}
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            disabled={disabled}
            maxLength={180}
            placeholder={placeholder}
            style={{ flex: '1 1 18rem' }}
            error={error ?? undefined}
          />
          <VariableMenu disabled={disabled} onPick={(name) => apply(insertAt(value, selection().start, selection().end, `{${name}}`))} />
        </Group>
      ) : (
        <>
          {toolbar}
          {link ? (
            <Group gap="xs" wrap="wrap" align="flex-start">
              <TextInput
                aria-label="The address the link goes to"
                placeholder="https://… or {link}"
                value={link.address}
                onChange={(event) => setLink({ ...link, address: event.currentTarget.value })}
                error={linkError ?? undefined}
                style={{ flex: '1 1 18rem' }}
              />
              <Button
                type="button"
                size="xs"
                onClick={() => {
                  const problem = linkAddressProblem(link.address);
                  if (problem) return setLinkError(problem);
                  apply(makeLink(value, link.start, link.end, link.address));
                  setLink(null);
                }}
              >
                Add the link
              </Button>
              <Button type="button" variant="light" size="xs" onClick={() => setLink(null)}>
                Cancel
              </Button>
            </Group>
          ) : null}
          {picture && pictureLevel ? (
            <div style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8, display: 'grid', gap: '0.5rem', padding: '0.75rem' }}>
              <ImagePicker
                label="Picture"
                helper="PNG or JPEG. It is added under the paragraph you are in, in its own paragraph, as wide as the e-mail."
                value={picture.src}
                onChange={(src) => setPicture({ ...picture, src })}
                level={pictureLevel}
                fileTypes={['image/png', 'image/jpeg']}
                fileTypeWords="PNG or JPEG"
              />
              <TextInput
                label="What the picture shows"
                description="Read out for people who cannot see it, and shown where an e-mail app does not load pictures."
                value={picture.description}
                onChange={(event) => setPicture({ ...picture, description: event.currentTarget.value })}
                maxLength={120}
              />
              <TextInput
                label="Where a tap on the picture goes (optional)"
                placeholder="https://… or {link}"
                value={picture.link}
                onChange={(event) => setPicture({ ...picture, link: event.currentTarget.value })}
              />
              {pictureError ? <InlineAlert title="The picture cannot be added" message={pictureError} severity="error" /> : null}
              <Group gap="xs" wrap="wrap">
                <Button
                  type="button"
                  size="xs"
                  onClick={() => {
                    const problem = pictureProblem(picture.src, picture.link);
                    if (problem) return setPictureError(problem);
                    apply(makePicture(value, picture.cursor, picture.src, picture.description, picture.link));
                    setPicture(null);
                  }}
                >
                  Add the picture
                </Button>
                <Button type="button" variant="light" size="xs" onClick={() => setPicture(null)}>
                  Cancel
                </Button>
              </Group>
            </div>
          ) : null}
          <Textarea
            ref={area}
            aria-label={label}
            value={value}
            onChange={(event) => {
              onChange(event.currentTarget.value);
              setCursor(event.currentTarget.selectionStart);
            }}
            onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
            disabled={disabled}
            autosize
            minRows={kind === 'legal' ? 4 : 8}
            maxRows={24}
            maxLength={kind === 'legal' ? 4000 : 5000}
            placeholder={placeholder}
            error={error ?? undefined}
          />
        </>
      )}
      {description ? <div style={muted}>{description}</div> : null}
    </div>
  );
}
