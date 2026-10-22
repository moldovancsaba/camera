'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button, Card, Stack, Text } from '@/components/gds/PublicPrimitives';
import type { FanmassEventPhoto, FanmassQueueStatus } from '@/lib/fanmass/photo-results';

const STATUS_LABEL: Record<FanmassQueueStatus, string> = {
  awaiting: 'Waiting for Fanmass',
  queued: 'Queued',
  leased: 'Starting',
  processing: 'In progress',
  retry: 'Retrying',
  completed: 'Fanmass analysed',
  result_missing: 'Completed, but the saved result is missing',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function labelFor(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (first) => first.toUpperCase());
}

function printable(value: unknown): string {
  if (value === null || value === undefined) return 'Not returned';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.trim() || 'Empty';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return String(value);
}

function StructuredValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (Array.isArray(value)) {
    if (!value.length) return <Text size="sm" c="dimmed">None returned</Text>;
    if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
      return <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{value.map(printable).join(', ')}</Text>;
    }
    return (
      <Stack gap="xs">
        {value.map((item, index) => (
          <div key={index} style={{ borderLeft: '2px solid var(--mantine-color-default-border)', paddingLeft: '0.75rem' }}>
            <Text fw={600} size="xs" c="dimmed">Item {index + 1}</Text>
            <StructuredValue value={item} depth={depth + 1} />
          </div>
        ))}
      </Stack>
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return <Text size="sm" c="dimmed">No values returned</Text>;
    return (
      <dl style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))', margin: 0 }}>
        {entries.map(([key, child]) => (
          <div key={key} style={{ minWidth: 0 }}>
            <dt style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem' }}>{labelFor(key)}</dt>
            <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
              {child && typeof child === 'object'
                ? <StructuredValue value={child} depth={depth + 1} />
                : <Text size="sm">{printable(child)}</Text>}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return <Text size="sm">{printable(value)}</Text>;
}

function ResultDetails({ title, value, open = false }: { title: string; value: unknown; open?: boolean }) {
  if (!value || typeof value !== 'object' || Array.isArray(value) && value.length === 0 || !Array.isArray(value) && Object.keys(value).length === 0) return null;
  return (
    <details open={open} style={{ borderTop: '1px solid var(--mantine-color-default-border)', paddingTop: '0.75rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{title}</summary>
      <div style={{ maxHeight: '32rem', overflow: 'auto', padding: '0.75rem 0 0.25rem' }}>
        <StructuredValue value={value} />
      </div>
    </details>
  );
}

function PercentBox({
  x,
  y,
  w,
  h,
  label,
  colour,
  interactive = false,
  onPointerDown,
  onResizePointerDown,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  colour: string;
  interactive?: boolean;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizePointerDown?: (event: React.PointerEvent<HTMLSpanElement>) => void;
}) {
  return (
    <div
      aria-label={label}
      onPointerDown={onPointerDown}
      style={{
        border: `2px solid ${colour}`,
        boxSizing: 'border-box',
        left: `${x * 100}%`,
        cursor: interactive ? 'move' : 'default',
        pointerEvents: interactive ? 'auto' : 'none',
        position: 'absolute',
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
      }}
    >
      <span style={{ background: colour, color: 'var(--mantine-color-dark-9)', fontSize: '0.75rem', fontWeight: 700, left: 0, lineHeight: 1.4, padding: '0 0.25rem', position: 'absolute', top: 0 }}>{label}</span>
      {interactive ? <span aria-label={`Resize ${label} box`} onPointerDown={onResizePointerDown} style={{ background: colour, border: '2px solid white', borderRadius: '50%', bottom: -6, cursor: 'nwse-resize', height: 10, pointerEvents: 'auto', position: 'absolute', right: -6, touchAction: 'none', width: 10 }} /> : null}
    </div>
  );
}

type EditableJson = null | boolean | number | string | EditableJson[] | { [key: string]: EditableJson };
type DetectionKind = 'people' | 'faces';
type NormalizedRect = { x: number; y: number; w: number; h: number };
type PhotoPointerAction = {
  pointerId: number;
  kind: 'draw' | 'move' | 'resize';
  detection: DetectionKind;
  start: { x: number; y: number };
  original?: NormalizedRect;
  index?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function defaultDetection(kind: DetectionKind, box: NormalizedRect): EditableJson {
  const id = `${kind === 'people' ? 'person' : 'face'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return kind === 'people'
    ? { id, box, gender: 'unknown', estimatedAge: null, emotion: 'unknown', subjectType: 'unknown', confidence: null, smiling: false, hasCap: false, hasGlasses: false }
    : { id, box, confidence: null, smiling: false };
}

function defaultArrayItem(label: string): EditableJson {
  if (label.toLowerCase() === 'people') {
    return { id: `person-${Date.now()}`, box: { x: 0, y: 0, w: 0.1, h: 0.1 }, gender: 'unknown', estimatedAge: null, emotion: 'unknown', subjectType: 'unknown', confidence: null, smiling: false, hasCap: false, hasGlasses: false };
  }
  if (label.toLowerCase() === 'faces') {
    return { id: `face-${Date.now()}`, box: { x: 0, y: 0, w: 0.1, h: 0.1 }, confidence: null, smiling: false };
  }
  return null;
}

function EditableValueField({
  label,
  value,
  onChange,
  onRemove,
  depth = 0,
}: {
  label: string;
  value: EditableJson;
  onChange: (value: EditableJson) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const [newKey, setNewKey] = useState('');
  const controlId = useId();
  const controlStyle = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.375rem', boxSizing: 'border-box' as const, font: 'inherit', maxWidth: '100%', padding: '0.375rem 0.5rem', width: '100%' };
  const removeButton = onRemove ? <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} style={{ border: 0, background: 'transparent', color: 'var(--mantine-color-red-7)', cursor: 'pointer', font: 'inherit' }}>Remove</button> : null;

  if (Array.isArray(value)) {
    return (
      <details open={depth < 2} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', marginTop: '0.5rem', padding: '0.5rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{label} ({value.length})</summary>
        {removeButton}
        <div style={{ display: 'grid', gap: '0.5rem', paddingTop: '0.5rem' }}>
          {value.map((item, index) => (
            <EditableValueField
              key={`${label}-${index}`}
              label={`${label.toLowerCase() === 'people' ? 'Person' : label.toLowerCase() === 'faces' ? 'Face' : 'Item'} ${index + 1}`}
              value={item}
              depth={depth + 1}
              onChange={(next) => onChange(value.map((current, itemIndex) => itemIndex === index ? next : current))}
              onRemove={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
            />
          ))}
          <button type="button" onClick={() => onChange([...value, defaultArrayItem(label)])} style={{ justifySelf: 'start' }}>Add {label.toLowerCase() === 'people' ? 'person' : label.toLowerCase() === 'faces' ? 'face' : 'item'}</button>
        </div>
      </details>
    );
  }

  if (value !== null && typeof value === 'object') {
    return (
      <details open={depth < 2 || /^(person|face) \d+$/i.test(label)} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', marginTop: '0.5rem', padding: '0.5rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{label}</summary>
        {removeButton}
        <div style={{ display: 'grid', gap: '0.5rem', paddingTop: '0.5rem' }}>
          {Object.entries(value).map(([key, child]) => (
            <EditableValueField
              key={key}
              label={key}
              value={child}
              depth={depth + 1}
              onChange={(next) => onChange({ ...value, [key]: next })}
              onRemove={() => {
                const next = { ...value };
                delete next[key];
                onChange(next);
              }}
            />
          ))}
          <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '28rem' }}>
            <input aria-label={`New field name in ${label}`} value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder="New field name" style={controlStyle} />
            <button type="button" disabled={!newKey.trim() || Object.prototype.hasOwnProperty.call(value, newKey.trim())} onClick={() => { const key = newKey.trim(); if (key) onChange({ ...value, [key]: null }); setNewKey(''); }}>Add field</button>
          </div>
        </div>
      </details>
    );
  }

  return (
    <div style={{ alignItems: 'center', display: 'grid', gap: '0.5rem', gridTemplateColumns: 'minmax(7rem, 0.35fr) minmax(0, 1fr) auto', marginTop: '0.375rem' }}>
      <label htmlFor={controlId} style={{ overflowWrap: 'anywhere' }}>{label}</label>
      {typeof value === 'boolean' ? (
        <input id={controlId} type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} style={{ height: '1.25rem', width: '1.25rem' }} />
      ) : typeof value === 'number' ? (
        <input id={controlId} type="number" step="any" value={value} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} style={controlStyle} />
      ) : value === null ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
          <input id={controlId} value="" placeholder="No value" onChange={(event) => onChange(event.target.value)} style={{ ...controlStyle, flex: '1 1 8rem' }} />
          <button type="button" onClick={() => onChange(null)} aria-label={`Set ${label} to null`}>Null</button>
          <button type="button" onClick={() => onChange(0)} aria-label={`Set ${label} to zero`}>0</button>
          <button type="button" onClick={() => onChange(false)} aria-label={`Set ${label} to false`}>False</button>
          <button type="button" onClick={() => onChange({})} aria-label={`Set ${label} to an object`}>{'{}'}</button>
          <button type="button" onClick={() => onChange([])} aria-label={`Set ${label} to an array`}>[]</button>
        </div>
      ) : (
        <input id={controlId} value={value} onChange={(event) => onChange(event.target.value)} style={controlStyle} />
      )}
      {removeButton}
    </div>
  );
}

export default function FanmassPhotoResultReview({
  eventId,
  item,
  previousId,
  nextId,
}: {
  eventId: string;
  item: FanmassEventPhoto;
  previousId: string | null;
  nextId: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [rawJsonMode, setRawJsonMode] = useState(false);
  const [draftJson, setDraftJson] = useState('');
  const [draftResult, setDraftResult] = useState<Record<string, EditableJson> | null>(null);
  const [drawMode, setDrawMode] = useState<DetectionKind | null>(null);
  const [previewBox, setPreviewBox] = useState<NormalizedRect | null>(null);
  const photoStageRef = useRef<HTMLDivElement>(null);
  const pointerActionRef = useRef<PhotoPointerAction | null>(null);
  const result = item.result;
  const correction = item.correction && item.correction.sourceRevision === result?.sourceRevision && item.correction.analysisGeneration === result?.analysisGeneration
    ? item.correction
    : null;
  const displayResult = result ? { ...result, ...(correction ?? {}) } : null;
  const people = displayResult?.boxes.people ?? [];
  const faces = displayResult?.boxes.faces ?? [];
  const draftBoxes = draftResult?.boxes && typeof draftResult.boxes === 'object' && !Array.isArray(draftResult.boxes)
    ? draftResult.boxes as { [key: string]: EditableJson }
    : {};
  const photoPeople = editing && !rawJsonMode && Array.isArray(draftBoxes.people) ? draftBoxes.people as unknown as typeof people : people;
  const photoFaces = editing && !rawJsonMode && Array.isArray(draftBoxes.faces) ? draftBoxes.faces as unknown as typeof faces : faces;
  const analysis = displayResult?.analysis ?? {};
  const detection = analysis.detection && typeof analysis.detection === 'object'
    ? analysis.detection as Record<string, unknown>
    : {};
  const objectDetection = detection.objects && typeof detection.objects === 'object'
    ? detection.objects as Record<string, unknown>
    : {};
  const personEstimate = displayResult?.summary.personCount ?? null;

  const updateDraftDetections = (kind: DetectionKind, change: EditableJson[] | ((detections: EditableJson[]) => EditableJson[])) => {
    setDraftResult((current) => {
      if (!current) return current;
      const currentBoxes = current.boxes && typeof current.boxes === 'object' && !Array.isArray(current.boxes)
        ? current.boxes as { [key: string]: EditableJson }
        : {};
      const currentDetections = Array.isArray(currentBoxes[kind]) ? currentBoxes[kind] as EditableJson[] : [];
      const detections = typeof change === 'function' ? change(currentDetections) : change;
      return { ...current, boxes: { ...currentBoxes, [kind]: detections } };
    });
  };

  const pointOnPhoto = (event: React.PointerEvent<HTMLElement>) => {
    const bounds = photoStageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    };
  };

  const beginBoxInteraction = (event: React.PointerEvent<HTMLDivElement | HTMLSpanElement>, detection: DetectionKind, index?: number, resize = false) => {
    if (!editing || rawJsonMode) return;
    const point = pointOnPhoto(event);
    if (!point) return;
    if (drawMode) {
      event.preventDefault();
      event.stopPropagation();
      pointerActionRef.current = { pointerId: event.pointerId, kind: 'draw', detection: drawMode, start: point };
      photoStageRef.current?.setPointerCapture(event.pointerId);
      setPreviewBox({ x: point.x, y: point.y, w: 0, h: 0 });
      return;
    }
    if (typeof index !== 'number') return;
    const currentBoxes = draftResult?.boxes && typeof draftResult.boxes === 'object' && !Array.isArray(draftResult.boxes)
      ? draftResult.boxes as { [key: string]: EditableJson }
      : {};
    const currentDetections = currentBoxes[detection];
    const item = Array.isArray(currentDetections) ? currentDetections[index] : null;
    const entry = item && typeof item === 'object' && !Array.isArray(item) ? item as { [key: string]: EditableJson } : null;
    const box = entry?.box && typeof entry.box === 'object' && !Array.isArray(entry.box) ? entry.box as { [key: string]: EditableJson } : null;
    if (!box || !['x', 'y', 'w', 'h'].every((key) => typeof box[key] === 'number')) return;
    const original = { x: box.x as number, y: box.y as number, w: box.w as number, h: box.h as number };
    event.preventDefault();
    event.stopPropagation();
    pointerActionRef.current = { pointerId: event.pointerId, kind: resize ? 'resize' : 'move', detection, index, start: point, original };
    photoStageRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePhotoPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || rawJsonMode || !drawMode) return;
    beginBoxInteraction(event, drawMode);
  };

  const handlePhotoPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const action = pointerActionRef.current;
    if (!action || action.pointerId !== event.pointerId) return;
    const point = pointOnPhoto(event);
    if (!point) return;
    if (action.kind === 'draw') {
      const left = Math.min(action.start.x, point.x);
      const top = Math.min(action.start.y, point.y);
      setPreviewBox({ x: left, y: top, w: Math.abs(point.x - action.start.x), h: Math.abs(point.y - action.start.y) });
      return;
    }
    if (typeof action.index !== 'number' || !action.original) return;
    const x = action.kind === 'resize' ? action.original.x : clamp(action.original.x + point.x - action.start.x, 0, 1 - action.original.w);
    const y = action.kind === 'resize' ? action.original.y : clamp(action.original.y + point.y - action.start.y, 0, 1 - action.original.h);
    const w = action.kind === 'resize' ? clamp(action.original.w + point.x - action.start.x, 0.012, 1 - action.original.x) : action.original.w;
    const h = action.kind === 'resize' ? clamp(action.original.h + point.y - action.start.y, 0.012, 1 - action.original.y) : action.original.h;
    updateDraftDetections(action.detection, (currentDetections) => currentDetections.map((item, index) => {
      if (index !== action.index || !item || typeof item !== 'object' || Array.isArray(item)) return item;
      return { ...item, box: { x, y, w, h } };
    }));
  };

  const finishPhotoPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const action = pointerActionRef.current;
    if (!action || action.pointerId !== event.pointerId) return;
    const point = pointOnPhoto(event);
    if (action.kind === 'draw' && point) {
      const x = Math.min(action.start.x, point.x);
      const y = Math.min(action.start.y, point.y);
      const w = Math.abs(point.x - action.start.x);
      const h = Math.abs(point.y - action.start.y);
      if (w >= 0.012 && h >= 0.012) {
        updateDraftDetections(action.detection, (currentDetections) => [...currentDetections, defaultDetection(action.detection, { x, y, w, h })]);
        setDrawMode(null);
      }
    }
    pointerActionRef.current = null;
    setPreviewBox(null);
    if (photoStageRef.current?.hasPointerCapture(event.pointerId)) photoStageRef.current.releasePointerCapture(event.pointerId);
  };

  const cancelPhotoPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerActionRef.current?.pointerId !== event.pointerId) return;
    pointerActionRef.current = null;
    setPreviewBox(null);
    if (photoStageRef.current?.hasPointerCapture(event.pointerId)) photoStageRef.current.releasePointerCapture(event.pointerId);
  };

  const beginEditing = () => {
    if (!displayResult) return;
    const initialDraft = { summary: displayResult.summary, analysis: displayResult.analysis, boxes: displayResult.boxes };
    setDraftResult(JSON.parse(JSON.stringify(initialDraft)) as Record<string, EditableJson>);
    setDraftJson(JSON.stringify(initialDraft, null, 2));
    setRawJsonMode(false);
    setDrawMode(null);
    setPreviewBox(null);
    setEditing(true);
    setError(null);
  };

  const saveCorrection = async () => {
    if (saving || !result) return;
    setSaving(true);
    setError(null);
    try {
      let editedResult: unknown = draftResult;
      if (rawJsonMode) {
        try {
          editedResult = JSON.parse(draftJson);
        } catch {
          throw new Error('The analysis JSON is invalid. Fix its syntax before saving.');
        }
      }
      if (!editedResult || typeof editedResult !== 'object' || Array.isArray(editedResult)) throw new Error('The edited result must be an object with summary, analysis, and boxes.');
      const response = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/analysis/fanmass/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_correction',
          sourceRevision: result.sourceRevision,
          analysisGeneration: result.analysisGeneration,
          result: editedResult,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? 'Could not save the analysis correction.');
      setEditing(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the analysis correction.');
    } finally {
      setSaving(false);
    }
  };

  const confirmResult = async () => {
    if (saving || !result) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/analysis/fanmass/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      const payload = await response.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? 'Could not save the confirmation.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the confirmation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="lg" data-fanmass-photo-review>
      <Card>
        <Stack gap="sm">
          <Text fw={700}>Fanmass status: {STATUS_LABEL[item.queueStatus]}</Text>
          <Text size="sm" c="dimmed">Photo reference: {item.submissionId}</Text>
          <Text size="sm" c="dimmed">Queue updated: {formatDateTime(item.queueUpdatedAt)}</Text>
          {result ? <Text size="sm" c="dimmed">Result revision {result.sourceRevision.slice(0, 12)} · generation {result.analysisGeneration}</Text> : null}
          {item.errorCode ? <Text c="red" size="sm">Processing issue: {item.errorCode}</Text> : null}
          {item.confirmed ? (
            <Text c="teal" fw={700} size="sm">Confirmed by {item.confirmedBy ?? 'an event reviewer'} · {formatDateTime(item.confirmedAt)}</Text>
          ) : result ? <Text c="orange" fw={700} size="sm">Human confirmation needed</Text> : null}
        </Stack>
      </Card>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', alignItems: 'start' }}>
        <section aria-label="Photo with Fanmass detections" style={{ minWidth: 0 }}>
          {editing && !rawJsonMode ? (
            <div aria-label="Draw photo detections" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Text fw={700} size="sm">Add a detection by drawing its box on the photo:</Text>
              <button
                type="button"
                aria-pressed={drawMode === 'people'}
                onClick={() => setDrawMode((current) => current === 'people' ? null : 'people')}
                style={{ border: '1px solid var(--mantine-color-yellow-6)', borderRadius: '0.375rem', background: drawMode === 'people' ? 'var(--mantine-color-yellow-5)' : 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit', fontWeight: 600, padding: '0.4rem 0.65rem' }}
              >{drawMode === 'people' ? 'Cancel person box' : 'Draw person box'}</button>
              <button
                type="button"
                aria-pressed={drawMode === 'faces'}
                onClick={() => setDrawMode((current) => current === 'faces' ? null : 'faces')}
                style={{ border: '1px solid var(--mantine-color-blue-6)', borderRadius: '0.375rem', background: drawMode === 'faces' ? 'var(--mantine-color-blue-5)' : 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit', fontWeight: 600, padding: '0.4rem 0.65rem' }}
              >{drawMode === 'faces' ? 'Cancel face box' : 'Draw face box'}</button>
              <Text size="xs" c="dimmed">Draw to add a person or face. Drag a box to move it; drag its corner handle to resize it. Edit attributes on the right.</Text>
            </div>
          ) : null}
          {item.photoUrl ? (
            <div
              ref={photoStageRef}
              onPointerDown={handlePhotoPointerDown}
              onPointerMove={handlePhotoPointerMove}
              onPointerUp={finishPhotoPointer}
              onPointerCancel={cancelPhotoPointer}
              style={{ display: 'inline-block', lineHeight: 0, maxWidth: '100%', position: 'relative', touchAction: editing && !rawJsonMode ? 'none' : 'auto', userSelect: 'none', cursor: editing && !rawJsonMode && drawMode ? 'crosshair' : 'default' }}
            >
              <Image draggable={false} src={item.photoUrl} alt="Original photo analysed by Fanmass" width={1600} height={1200} unoptimized priority style={{ display: 'block', height: 'auto', maxHeight: 'calc(100vh - 13rem)', maxWidth: '100%', width: 'auto' }} />
              {displayResult ? (
                <div aria-label={editing && !rawJsonMode ? 'Editable detection boxes' : 'Fanmass result boxes'} style={{ inset: 0, position: 'absolute' }}>
                  {photoPeople.map((person, index) => <PercentBox key={`person-${person.id}`} {...person.box} label={`Person ${index + 1}`} colour="var(--mantine-color-yellow-5)" interactive={editing && !rawJsonMode && !drawMode} onPointerDown={(event) => beginBoxInteraction(event, 'people', index)} onResizePointerDown={(event) => beginBoxInteraction(event, 'people', index, true)} />)}
                  {photoFaces.map((face, index) => <PercentBox key={`face-${face.id}`} {...face.box} label={`Face ${index + 1}`} colour="var(--mantine-color-blue-5)" interactive={editing && !rawJsonMode && !drawMode} onPointerDown={(event) => beginBoxInteraction(event, 'faces', index)} onResizePointerDown={(event) => beginBoxInteraction(event, 'faces', index, true)} />)}
                  {previewBox ? <PercentBox {...previewBox} label={drawMode === 'faces' ? 'New face' : 'New person'} colour={drawMode === 'faces' ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-yellow-5)'} /> : null}
                </div>
              ) : null}
            </div>
          ) : <Card><Text c="dimmed">The source photo is not available for display.</Text></Card>}
          {displayResult ? <Text size="xs" c="dimmed" mt="xs">Yellow: detected people · Blue: detected faces. Boxes reflect saved human corrections when present.</Text> : null}
        </section>

        <Card>
          {result && displayResult ? (
            <Stack gap="md">
              <section style={{ borderTop: '1px solid var(--mantine-color-default-border)', paddingTop: '0.75rem' }} aria-label="Edit Fanmass result">
                <Stack gap="sm">
                  <div>
                    <Text fw={700}>Edit analysis by hand</Text>
                    <Text size="sm" c="dimmed">Change the detected people, emotions, brands, safety results, counts, and any other returned field. Add/remove people and faces here, or draw and reposition their boxes directly on the photo.</Text>
                  </div>
                  {editing ? <>
                    {rawJsonMode ? <>
                      <label htmlFor="fanmass-result-json" style={{ fontWeight: 600 }}>Advanced result JSON</label>
                      <textarea
                        id="fanmass-result-json"
                        value={draftJson}
                        onChange={(event) => setDraftJson(event.target.value)}
                        spellCheck={false}
                        style={{ boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8125rem', minHeight: '24rem', padding: '0.75rem', resize: 'vertical', width: '100%' }}
                      />
                      <Button type="button" variant="default" disabled={saving} onClick={() => {
                        try {
                          const parsed = JSON.parse(draftJson) as unknown;
                          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The JSON root must be an object.');
                          setDraftResult(parsed as Record<string, EditableJson>);
                          setRawJsonMode(false);
                          setError(null);
                        } catch (cause) {
                          setError(cause instanceof Error ? cause.message : 'The analysis JSON is invalid.');
                        }
                      }}>Apply JSON to fields</Button>
                    </> : <>
                    {draftResult ? Object.entries(draftResult).map(([key, value]) => (
                      <EditableValueField
                        key={key}
                        label={key}
                        value={value}
                        onChange={(next) => setDraftResult((current) => current ? { ...current, [key]: next } : current)}
                      />
                    )) : null}
                    <Button type="button" variant="default" disabled={saving} onClick={() => {
                      if (draftResult) setDraftJson(JSON.stringify(draftResult, null, 2));
                      setRawJsonMode(true);
                    }}>Advanced: edit raw JSON</Button>
                    </>}
                    <Text size="xs" c="dimmed">Saving stores your corrected result in Camera for Fanmass revision {result.sourceRevision.slice(0, 12)}. It clears any earlier confirmation so the edited result can be checked again.</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <Button type="button" disabled={saving} onClick={saveCorrection}>{saving ? 'Saving correction…' : 'Save corrected analysis'}</Button>
                      <Button type="button" variant="default" disabled={saving} onClick={() => { setEditing(false); setError(null); }}>Cancel</Button>
                    </div>
                    {error ? <Text c="red" role="alert" size="sm">{error}</Text> : null}
                  </> : <Button type="button" disabled={saving} onClick={beginEditing}>{correction ? 'Edit saved correction' : 'Edit Fanmass result by hand'}</Button>}
                </Stack>
              </section>
              <Text fw={700}>{correction ? 'Fanmass result · human corrected' : 'Fanmass result'}</Text>
              {correction ? <Text size="sm" c="teal">Corrected by {correction.correctedBy} · {formatDateTime(correction.correctedAt)}. Camera shows these saved values; the original Fanmass output remains available below.</Text> : null}
              <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <div><Text size="sm" c="dimmed">People estimate · model</Text><Text fw={700}>{displayResult.summary.personCount}</Text></div>
                <div><Text size="sm" c="dimmed">Individual person boxes</Text><Text fw={700}>{people.length}</Text></div>
                <div><Text size="sm" c="dimmed">Face boxes</Text><Text fw={700}>{faces.length}</Text></div>
                <div><Text size="sm" c="dimmed">Pose detections</Text><Text fw={700}>{typeof analysis.poseCount === 'number' ? analysis.poseCount : 'Not returned'}</Text></div>
                <div><Text size="sm" c="dimmed">Object-model person detections</Text><Text fw={700}>{typeof objectDetection.personCount === 'number' ? objectDetection.personCount : 'Not returned'}</Text></div>
                <div><Text size="sm" c="dimmed">Crowd estimate</Text><Text fw={700}>{displayResult.summary.crowdEstimate}</Text></div>
              </div>
              <Text size="sm">Scene: {displayResult.summary.sceneType}</Text>
              {personEstimate !== null && (personEstimate !== people.length || personEstimate !== faces.length) ? (
                <Text size="sm" c="dimmed">These are separate model signals: the people estimate is not the number of individually boxed people or faces. Compare them separately; do not add them together.</Text>
              ) : null}
              <Text size="sm" c="dimmed">Analysis stage: {result.analysisStage} · analysed {formatDateTime(result.analyzedAt)}</Text>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <Text fw={700} size="sm">People detected ({people.length})</Text>
                {people.length === 0 ? <Text size="sm" c="dimmed">No individual people boxes were returned.</Text> : people.map((person, index) => (
                  <div key={person.id} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', padding: '0.5rem' }}>
                    <Text fw={700} size="sm">Person {index + 1}</Text>
                    <Text size="sm">{person.gender} · {person.estimatedAge == null ? 'age unknown' : `about ${person.estimatedAge}`} · {person.emotion}</Text>
                    <Text size="xs" c="dimmed">{person.subjectType} · confidence {person.confidence == null ? 'unknown' : `${Math.round(person.confidence * 100)}%`} · {person.smiling ? 'smiling' : 'not marked smiling'} · {person.hasCap ? 'cap' : 'no cap'} · {person.hasGlasses ? 'glasses' : 'no glasses'}</Text>
                  </div>
                ))}
              </div>
              <ResultDetails title="Photo summary values" value={displayResult.summary} />
              <ResultDetails title="Demographics and accessories" value={displayResult.summary.demographics} />
              <ResultDetails title="Content safety and prohibited categories" value={displayResult.summary.moderation} />
              <ResultDetails title="Sports, clubs, and merchandise" value={displayResult.summary.sportsMerchandise} />
              <ResultDetails title="Fashion brands and appearances" value={displayResult.summary.fashionBrands} />
              <ResultDetails title="People and display-media analysis" value={{ people: analysis.people, posterDetection: analysis.posterDetection }} />
              <ResultDetails title="Face, object, and visual detections" value={analysis.detection} />
              <ResultDetails title="Every Fanmass analysis property" value={displayResult.analysis} />
              <ResultDetails title="Saved image-relative boxes" value={displayResult.boxes} />
              {correction ? <details style={{ borderTop: '1px solid var(--mantine-color-default-border)', paddingTop: '0.75rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Original Fanmass output before human correction</summary>
                <pre style={{ fontSize: '0.8125rem', lineHeight: 1.5, maxHeight: '22rem', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {JSON.stringify({ summary: result.summary, analysis: result.analysis, boxes: result.boxes }, null, 2)}
                </pre>
              </details> : null}
              <details style={{ borderTop: '1px solid var(--mantine-color-default-border)', paddingTop: '0.75rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Raw analysis payload</summary>
                <pre style={{ fontSize: '0.8125rem', lineHeight: 1.5, maxHeight: '22rem', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {JSON.stringify({ summary: displayResult.summary, analysis: displayResult.analysis, boxes: displayResult.boxes }, null, 2)}
                </pre>
              </details>
              <Button type="button" disabled={saving || item.confirmed || editing} onClick={confirmResult}>
                {item.confirmed ? 'Confirmed' : saving ? 'Saving confirmation…' : 'Confirm Fanmass analysis'}
              </Button>
              <Text size="xs" c="dimmed">Human corrections and confirmation are stored in Camera against this exact Fanmass result revision. Editing clears any prior confirmation so the corrected result must be checked again.</Text>
            </Stack>
          ) : (
            <Stack gap="sm">
              <Text fw={700}>{STATUS_LABEL[item.queueStatus]}</Text>
              <Text size="sm" c="dimmed">There is no completed result to review yet. This photo stays in the Fanmass queue state shown above.</Text>
            </Stack>
          )}
        </Card>
      </div>

      <nav aria-label="Fanmass photo navigation" style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
        {previousId ? <a href={`/admin/events/${eventId}/analysis/fanmass/review?photo=${encodeURIComponent(previousId)}`}>← Previous Fanmass photo</a> : <span />}
        {nextId ? <a href={`/admin/events/${eventId}/analysis/fanmass/review?photo=${encodeURIComponent(nextId)}`}>Next Fanmass photo →</a> : <span />}
      </nav>
    </Stack>
  );
}
