'use client';

import { useMemo, useState } from 'react';
import { AdminSelect, AdminTextInput, AdminTextarea } from '@sovereignsquad/gds-admin/client';
import { Field, NumberInput, Paper, SimpleGrid, Stack, Text } from '@/components/gds/PublicPrimitives';
import ImagePicker from '@/components/admin/library/ImagePicker';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import WelcomeCompositionCanvas from '@/components/capture/WelcomeCompositionCanvas';
import type { WelcomeAnchor, WelcomeElement, WelcomeHorizontalAlignment, WelcomeParentRelation, WelcomeVerticalAlignment } from '@/lib/events/welcome-composition';
import { WELCOME_MAX_ELEMENTS, WELCOME_PARENT_RELATIONS } from '@/lib/events/welcome-composition';

const VERTICAL: Array<{ value: string; label: string }> = [
  { value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' },
];
const HORIZONTAL: Array<{ value: string; label: string }> = [
  { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' },
];
const RELATIONS: Array<{ value: string; label: string }> = [
  { value: 'parent-above', label: 'Parent above (place this below)' },
  { value: 'parent-below', label: 'Parent below (place this above)' },
  { value: 'parent-left', label: 'Parent left (place this to the right)' },
  { value: 'parent-right', label: 'Parent right (place this to the left)' },
];
// The page editor is a custom modal at z-index 1000. Keep Select dropdowns in a portal above it,
// otherwise the options render behind the modal and look clickable without accepting a choice.
const EDITOR_SELECT_COMBOBOX_PROPS = { withinPortal: true, zIndex: 1010 } as const;

function makeId(): string {
  return `welcome-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}

function descendantsOf(elements: WelcomeElement[], id: string): Set<string> {
  const output = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of elements) {
      if (!item.parentId || (item.parentId !== id && !output.has(item.parentId)) || output.has(item.id)) continue;
      output.add(item.id);
      changed = true;
    }
  }
  return output;
}

function rootAnchor(element: WelcomeElement, byId: Map<string, WelcomeElement>): WelcomeAnchor {
  let current = element;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current.anchor ?? { vertical: 'middle', horizontal: 'center' };
}

export interface WelcomeCompositionEditorProps {
  eventId: string;
  elements: WelcomeElement[];
  onElementsChange: (elements: WelcomeElement[]) => void;
  buttonText: string;
  onButtonTextChange: (value: string) => void;
  backgroundImageUrl: string;
  onBackgroundImageChange: (value: string) => void;
  eventWelcomeScreenUrl?: string;
  stageBackgroundColor?: string;
  eventFontFamily?: string;
  buttonColors: { fill?: string; label?: string; ring?: string };
  onButtonColorsChange: (colors: { fill?: string; label?: string; ring?: string }) => void;
}

export default function WelcomeCompositionEditor({
  eventId,
  elements,
  onElementsChange,
  buttonText,
  onButtonTextChange,
  backgroundImageUrl,
  onBackgroundImageChange,
  eventWelcomeScreenUrl,
  stageBackgroundColor,
  eventFontFamily,
  buttonColors,
  onButtonColorsChange,
}: WelcomeCompositionEditorProps) {
  const [selectedId, setSelectedId] = useState(elements[0]?.id ?? 'welcome-start-button');
  const [previewSize, setPreviewSize] = useState<'mobile' | 'desktop'>('mobile');
  const selected = elements.find((element) => element.id === selectedId) ?? elements[0];
  const byId = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);
  const safeParents = selected ? descendantsOf(elements, selected.id) : new Set<string>();

  const update = (id: string, patch: Partial<WelcomeElement>) => {
    onElementsChange(elements.map((element) => element.id === id ? { ...element, ...patch } : element));
  };
  const add = (type: 'image' | 'text') => {
    const id = makeId();
    const next: WelcomeElement = type === 'image'
      ? { id, name: `Image ${elements.filter((item) => item.type === 'image').length + 1}`, type, anchor: { vertical: 'middle', horizontal: 'center' }, widthPercent: 28, alt: '' }
      : { id, name: `Text ${elements.filter((item) => item.type === 'text').length + 1}`, type, anchor: { vertical: 'middle', horizontal: 'center' }, widthPercent: 45, fontSizePercent: 4, fontWeight: 'bold', text: 'Your text' };
    onElementsChange([...elements, next]);
    setSelectedId(id);
  };
  const move = (id: string, direction: -1 | 1) => {
    const index = elements.findIndex((element) => element.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= elements.length) return;
    const reordered = [...elements];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    onElementsChange(reordered);
  };
  const remove = (element: WelcomeElement) => {
    const removed = new Set([element.id, ...descendantsOf(elements, element.id)]);
    const next = elements
      .filter((item) => !removed.has(item.id) || item.type === 'start-button')
      .map((item) => removed.has(item.id) && item.type === 'start-button'
        ? { ...item, parentId: undefined, parentRelation: undefined, anchor: { vertical: 'middle' as const, horizontal: 'center' as const } }
        : item);
    onElementsChange(next);
    if (removed.has(selectedId)) setSelectedId(next[0]?.id ?? 'welcome-start-button');
  };
  const chooseParent = (parentId: string | null) => {
    if (!selected) return;
    if (!parentId) {
      update(selected.id, { parentId: undefined, parentRelation: undefined, anchor: { vertical: 'middle', horizontal: 'center' } });
      return;
    }
    update(selected.id, { parentId, parentRelation: selected.parentRelation ?? 'parent-above', anchor: undefined });
  };

  return (
    <Stack gap="md" data-welcome-composition-editor>
      <div>
        <Text fw={700}>Welcome screen composition</Text>
        <Text size="sm" c="dimmed">Add up to {WELCOME_MAX_ELEMENTS} image and text objects, anchor each independent object to the 3×3 stage, then group related objects beside a parent. Earlier objects sit behind later objects when they overlap.</Text>
      </div>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" verticalSpacing="md">
        <Stack gap="xs">
          <div style={{ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
            <Text fw={600}>Live preview</Text>
            <AdminSelect
              name="welcome-preview-size"
              label="Preview size"
              value={previewSize}
              onChange={(value) => setPreviewSize(value === 'desktop' ? 'desktop' : 'mobile')}
              data={[{ value: 'mobile', label: 'Mobile' }, { value: 'desktop', label: 'Desktop' }]}
              comboboxProps={EDITOR_SELECT_COMBOBOX_PROPS}
              aria-label="Preview screen size"
            />
          </div>
          <Paper withBorder p="sm" style={{ alignItems: 'center', background: 'var(--mantine-color-default-hover)', display: 'flex', justifyContent: 'center', minHeight: 360, overflow: 'auto' }}>
            <div style={{ aspectRatio: previewSize === 'mobile' ? '9 / 16' : '16 / 9', height: previewSize === 'mobile' ? 'min(68vh, 560px)' : 'auto', maxWidth: previewSize === 'mobile' ? 320 : '100%', overflow: 'hidden', position: 'relative', width: previewSize === 'mobile' ? 'auto' : '100%' }}>
              <WelcomeCompositionCanvas
                elements={elements}
                buttonText={buttonText}
                backgroundImageUrl={backgroundImageUrl || undefined}
                eventWelcomeScreenUrl={eventWelcomeScreenUrl}
                stageBackgroundColor={stageBackgroundColor}
                fontFamily={eventFontFamily}
                buttonColors={buttonColors}
                preview
                style={{ borderRadius: '0.5rem', inset: 0, position: 'absolute' }}
              />
            </div>
          </Paper>
          <ImagePicker
            label="Stage background image"
            value={backgroundImageUrl}
            onChange={onBackgroundImageChange}
            level={{ scope: 'event', eventId }}
            helper="This image fills the stage behind the elements. Each object you add below can be independently positioned."
          />
        </Stack>

        <Stack gap="sm">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <SemanticButton action="welcome:add-image" type="button" disabled={elements.length >= WELCOME_MAX_ELEMENTS} onClick={() => add('image')}>Add image</SemanticButton>
            <SemanticButton action="welcome:add-text" type="button" variant="secondary" disabled={elements.length >= WELCOME_MAX_ELEMENTS} onClick={() => add('text')}>Add text</SemanticButton>
          </div>

          <Paper withBorder p="sm">
            <Stack gap="xs">
              <Text fw={600}>Layers (back to front)</Text>
              {elements.map((element, index) => (
                <div key={element.id} style={{ alignItems: 'center', border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', padding: '0.5rem' }}>
                  <SemanticButton action="welcome:select-layer" label={`${index + 1}. ${element.name || element.type}`} type="button" variant={selectedId === element.id ? 'primary' : 'secondary'} size="xs" onClick={() => setSelectedId(element.id)} />
                  <SemanticButton action="welcome:layer-back" label="←" type="button" variant="secondary" size="compact-xs" disabled={index === 0} title="Move backward" aria-label={`Move ${element.name} backward`} onClick={() => move(element.id, -1)} />
                  <SemanticButton action="welcome:layer-front" label="→" type="button" variant="secondary" size="compact-xs" disabled={index === elements.length - 1} title="Move forward" aria-label={`Move ${element.name} forward`} onClick={() => move(element.id, 1)} />
                  {element.type !== 'start-button' ? <SemanticButton action="welcome:remove-layer" type="button" variant="secondary" size="compact-xs" onClick={() => remove(element)}>Remove</SemanticButton> : <Text size="xs" c="dimmed">Required action</Text>}
                </div>
              ))}
            </Stack>
          </Paper>

          {selected ? (
            <Paper withBorder p="sm">
              <Stack gap="sm">
                <Text fw={600}>Selected: {selected.name}</Text>
                <AdminTextInput name={`welcome-element-name-${selected.id}`} label="Object name" value={selected.name} onChange={(value) => update(selected.id, { name: value })} maxLength={120} />

                {selected.type === 'start-button' ? (
                  <>
                    <AdminTextInput name="welcome-start-button-label" label="Start button text" value={buttonText} onChange={onButtonTextChange} required />
                    <SimpleGrid cols={{ base: 1, sm: 3 }}>
                      <AdminTextInput name="welcome-button-fill" label="Button colour" value={buttonColors.fill ?? ''} onChange={(fill) => onButtonColorsChange({ ...buttonColors, fill })} placeholder="#RRGGBB" />
                      <AdminTextInput name="welcome-button-label-color" label="Label colour" value={buttonColors.label ?? ''} onChange={(label) => onButtonColorsChange({ ...buttonColors, label })} placeholder="#RRGGBB" />
                      <AdminTextInput name="welcome-button-ring" label="Ring colour" value={buttonColors.ring ?? ''} onChange={(ring) => onButtonColorsChange({ ...buttonColors, ring })} placeholder="#RRGGBB" />
                    </SimpleGrid>
                  </>
                ) : selected.type === 'image' ? (
                  <>
                    <AdminSelect
                      name={`welcome-image-source-${selected.id}`}
                      label="Image source"
                      value={selected.imageSource === 'event-welcome-screen' ? 'event-welcome-screen' : 'library'}
                      onChange={(value) => update(selected.id, value === 'event-welcome-screen' ? { imageSource: 'event-welcome-screen', imageUrl: undefined } : { imageSource: undefined, imageUrl: selected.imageUrl || '' })}
                      data={[
                        { value: 'library', label: 'Images library' },
                        ...(eventWelcomeScreenUrl || selected.imageSource === 'event-welcome-screen' ? [{ value: 'event-welcome-screen', label: 'Event-generated image' }] : []),
                      ]}
                      comboboxProps={EDITOR_SELECT_COMBOBOX_PROPS}
                    />
                    {selected.imageSource === 'event-welcome-screen' ? (
                      <Text size="sm" c="dimmed">This element follows the event’s generated welcome screen and updates when that screen is regenerated.</Text>
                    ) : (
                      <ImagePicker label="Image" value={selected.imageUrl ?? ''} onChange={(imageUrl) => update(selected.id, { imageUrl, imageSource: undefined })} level={{ scope: 'event', eventId }} helper="Choose an event or partner image, upload a new image into this event’s Images library, or enter an HTTPS address." />
                    )}
                    <AdminTextInput name={`welcome-image-alt-${selected.id}`} label="Alternative text" description="Leave empty if this image is decorative. Describe it when it communicates information." value={selected.alt ?? ''} onChange={(alt) => update(selected.id, { alt })} maxLength={300} />
                    <Field label="Width (% of stage)">
                      <NumberInput min={2} max={100} step={1} value={selected.widthPercent ?? 28} onChange={(value) => update(selected.id, { widthPercent: Number(value) || 2 })} />
                    </Field>
                  </>
                ) : (
                  <>
                    <AdminTextarea name={`welcome-text-content-${selected.id}`} label="Text" value={selected.text ?? ''} onChange={(text) => update(selected.id, { text })} autosize minRows={2} maxRows={8} maxLength={2000} required />
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                      <Field label="Width (% of stage)"><NumberInput min={2} max={100} step={1} value={selected.widthPercent ?? 45} onChange={(value) => update(selected.id, { widthPercent: Number(value) || 2 })} /></Field>
                      <Field label="Font size (% of stage width)"><NumberInput min={1} max={16} step={0.5} value={selected.fontSizePercent ?? 4} onChange={(value) => update(selected.id, { fontSizePercent: Number(value) || 1 })} /></Field>
                    </SimpleGrid>
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                      <AdminTextInput name={`welcome-text-color-${selected.id}`} label="Text colour" value={selected.color ?? ''} onChange={(color) => update(selected.id, { color: color || undefined })} placeholder="6-digit hex colour" />
                      <AdminSelect name={`welcome-text-weight-${selected.id}`} label="Weight" value={selected.fontWeight ?? 'normal'} onChange={(value) => update(selected.id, { fontWeight: value === 'bold' ? 'bold' : 'normal' })} data={[{ value: 'normal', label: 'Regular' }, { value: 'bold', label: 'Bold' }]} comboboxProps={EDITOR_SELECT_COMBOBOX_PROPS} />
                    </SimpleGrid>
                  </>
                )}

                <AdminSelect
                  name={`welcome-element-parent-${selected.id}`}
                  label="Group with a parent (optional)"
                  value={selected.parentId ?? 'independent'}
                  onChange={(value) => chooseParent(value === 'independent' ? null : value)}
                  data={[
                    { value: 'independent', label: 'Independent object' },
                    ...elements.filter((item) => item.id !== selected.id && !safeParents.has(item.id)).map((item) => ({ value: item.id, label: item.name || item.type })),
                  ]}
                  comboboxProps={EDITOR_SELECT_COMBOBOX_PROPS}
                />
                {selected.parentId ? (
                  <>
                    <AdminSelect name={`welcome-element-relation-${selected.id}`} label="Where does the parent sit?" value={selected.parentRelation ?? 'parent-above'} onChange={(value) => update(selected.id, { parentRelation: (value as WelcomeParentRelation) ?? 'parent-above' })} data={RELATIONS} comboboxProps={EDITOR_SELECT_COMBOBOX_PROPS} />
                    <Text size="sm" c="dimmed">Alignment is inherited from the group root: {rootAnchor(selected, byId).vertical} / {rootAnchor(selected, byId).horizontal}. This object keeps a {WELCOME_PARENT_RELATIONS.includes(selected.parentRelation ?? 'parent-above') ? 'fixed gap' : 'group position'} from its parent.</Text>
                  </>
                ) : (
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <AdminSelect name={`welcome-element-vertical-${selected.id}`} label="Vertical alignment" value={selected.anchor?.vertical ?? 'middle'} onChange={(value) => update(selected.id, { anchor: { ...(selected.anchor ?? { vertical: 'middle', horizontal: 'center' }), vertical: (value as WelcomeVerticalAlignment) ?? 'middle' } })} data={VERTICAL} comboboxProps={EDITOR_SELECT_COMBOBOX_PROPS} />
                    <AdminSelect name={`welcome-element-horizontal-${selected.id}`} label="Horizontal alignment" value={selected.anchor?.horizontal ?? 'center'} onChange={(value) => update(selected.id, { anchor: { ...(selected.anchor ?? { vertical: 'middle', horizontal: 'center' }), horizontal: (value as WelcomeHorizontalAlignment) ?? 'center' } })} data={HORIZONTAL} comboboxProps={EDITOR_SELECT_COMBOBOX_PROPS} />
                  </SimpleGrid>
                )}
              </Stack>
            </Paper>
          ) : null}
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
