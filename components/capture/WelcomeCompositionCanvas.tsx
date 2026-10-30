'use client';

import PillButton from '@/components/capture/PillButton';
import type { WelcomeAnchor, WelcomeElement, WelcomeHorizontalAlignment, WelcomeVerticalAlignment } from '@/lib/events/welcome-composition';
import type { CSSProperties, ReactNode } from 'react';

const HORIZONTAL_PERCENT: Record<WelcomeHorizontalAlignment, number> = { left: 0, center: 50, right: 100 };
const VERTICAL_PERCENT: Record<WelcomeVerticalAlignment, number> = { top: 0, middle: 50, bottom: 100 };

function anchorStyle(anchor: WelcomeAnchor): CSSProperties {
  const left = HORIZONTAL_PERCENT[anchor.horizontal];
  const top = VERTICAL_PERCENT[anchor.vertical];
  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(${left === 50 ? '-50%' : left === 100 ? '-100%' : '0'}, ${top === 50 ? '-50%' : top === 100 ? '-100%' : '0'})`,
  };
}

function inheritedAnchor(element: WelcomeElement, byId: Map<string, WelcomeElement>): WelcomeAnchor {
  let current = element;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current.anchor ?? { vertical: 'middle', horizontal: 'center' };
}

function groupStyle(relation: WelcomeElement['parentRelation'], align: WelcomeAnchor): CSSProperties {
  const style: CSSProperties = { display: 'flex', gap: '2cqw', pointerEvents: 'none', position: 'absolute' };
  if (relation === 'parent-above') {
    style.top = 'calc(100% + 2cqw)';
    style.left = `${HORIZONTAL_PERCENT[align.horizontal]}%`;
    style.transform = `translateX(${align.horizontal === 'center' ? '-50%' : align.horizontal === 'right' ? '-100%' : '0'})`;
    style.flexDirection = 'column';
    style.alignItems = align.horizontal === 'left' ? 'flex-start' : align.horizontal === 'right' ? 'flex-end' : 'center';
  } else if (relation === 'parent-below') {
    style.bottom = 'calc(100% + 2cqw)';
    style.left = `${HORIZONTAL_PERCENT[align.horizontal]}%`;
    style.transform = `translateX(${align.horizontal === 'center' ? '-50%' : align.horizontal === 'right' ? '-100%' : '0'})`;
    style.flexDirection = 'column-reverse';
    style.alignItems = align.horizontal === 'left' ? 'flex-start' : align.horizontal === 'right' ? 'flex-end' : 'center';
  } else if (relation === 'parent-left') {
    style.left = 'calc(100% + 2cqw)';
    style.top = `${VERTICAL_PERCENT[align.vertical]}%`;
    style.transform = `translateY(${align.vertical === 'middle' ? '-50%' : align.vertical === 'bottom' ? '-100%' : '0'})`;
    style.flexDirection = 'row';
    style.alignItems = align.vertical === 'top' ? 'flex-start' : align.vertical === 'bottom' ? 'flex-end' : 'center';
  } else {
    style.right = 'calc(100% + 2cqw)';
    style.top = `${VERTICAL_PERCENT[align.vertical]}%`;
    style.transform = `translateY(${align.vertical === 'middle' ? '-50%' : align.vertical === 'bottom' ? '-100%' : '0'})`;
    style.flexDirection = 'row-reverse';
    style.alignItems = align.vertical === 'top' ? 'flex-start' : align.vertical === 'bottom' ? 'flex-end' : 'center';
  }
  return style;
}

function WelcomeElementView({
  element,
  elements,
  byId,
  childrenById,
  eventWelcomeScreenUrl,
  buttonText,
  buttonColors,
  preview,
  onStart,
  flowPosition = false,
}: {
  element: WelcomeElement;
  elements: WelcomeElement[];
  byId: Map<string, WelcomeElement>;
  childrenById: Map<string, WelcomeElement[]>;
  eventWelcomeScreenUrl?: string;
  stageBackgroundColor?: string;
  fontFamily?: string;
  buttonText: string;
  buttonColors: { fill?: string; label?: string; ring?: string };
  preview: boolean;
  onStart?: () => void;
  flowPosition?: boolean;
}) {
  const source = element.imageSource === 'event-welcome-screen' ? eventWelcomeScreenUrl : element.imageUrl;
  const style: CSSProperties = {
    position: flowPosition ? 'relative' : 'absolute',
    ...(flowPosition ? { width: 'max-content' } : anchorStyle(element.anchor ?? { vertical: 'middle', horizontal: 'center' })),
    zIndex: elements.indexOf(element),
    boxSizing: 'border-box',
  };

  let content: ReactNode;
  if (element.type === 'image') {
    content = source ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={source} alt={element.alt ?? ''} draggable={false} style={{ display: 'block', width: `${element.widthPercent ?? 28}cqw`, maxWidth: '90cqw', height: 'auto', objectFit: 'contain' }} />
    ) : preview ? (
      <div aria-label={element.name} style={{ alignItems: 'center', background: 'color-mix(in srgb, white 80%, transparent)', border: '1px dashed currentColor', borderRadius: '0.5rem', display: 'flex', height: '16cqw', justifyContent: 'center', width: `${element.widthPercent ?? 28}cqw` }}>
        {element.name}
      </div>
    ) : null;
  } else if (element.type === 'text') {
    content = <div style={{ color: element.color || 'inherit', fontSize: `${element.fontSizePercent ?? 4}cqw`, fontWeight: element.fontWeight === 'bold' ? 700 : 400, lineHeight: 1.15, maxWidth: '90cqw', textAlign: 'center', whiteSpace: 'pre-wrap', width: `${element.widthPercent ?? 45}cqw`, overflowWrap: 'anywhere' }}>{element.text}</div>;
  } else {
    content = (
      <PillButton onClick={() => onStart?.()} fill={buttonColors.fill} label={buttonColors.label} ring={buttonColors.ring} style={{ flex: 'none', pointerEvents: preview ? 'none' : 'auto' }}>
        {buttonText}
      </PillButton>
    );
  }

  if (content === null) return null;
  return (
    <div data-welcome-element={element.id} data-welcome-element-type={element.type} style={{ ...style, pointerEvents: element.type === 'start-button' && !preview ? 'auto' : 'none' }}>
      {element.type === 'start-button' && preview ? (
        <div aria-hidden="true"><PillButton onClick={() => undefined} disabled fill={buttonColors.fill} label={buttonColors.label} ring={buttonColors.ring} style={{ flex: 'none', pointerEvents: 'none' }}>{buttonText}</PillButton></div>
      ) : content}
      {Array.from((childrenById.get(element.id) ?? []).reduce((groups, child) => {
        const relation = child.parentRelation ?? 'parent-above';
        const group = groups.get(relation) ?? [];
        group.push(child);
        groups.set(relation, group);
        return groups;
      }, new Map<NonNullable<WelcomeElement['parentRelation']>, WelcomeElement[]>()).entries()).map(([relation, children]) => (
        <div key={`${element.id}-${relation}`} style={groupStyle(relation, inheritedAnchor(element, byId))}>
          {children.map((child) => (
            <WelcomeElementView
              key={child.id}
              element={child}
              elements={elements}
              byId={byId}
              childrenById={childrenById}
              eventWelcomeScreenUrl={eventWelcomeScreenUrl}
              buttonText={buttonText}
              buttonColors={buttonColors}
              preview={preview}
              onStart={onStart}
              flowPosition
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface WelcomeCompositionCanvasProps {
  elements: WelcomeElement[];
  buttonText: string;
  backgroundImageUrl?: string;
  eventWelcomeScreenUrl?: string;
  stageBackgroundColor?: string;
  fontFamily?: string;
  buttonColors?: { fill?: string; label?: string; ring?: string };
  preview?: boolean;
  onStart?: () => void;
  style?: CSSProperties;
}

/** Shared live renderer so the editor preview and guest page use the same element layout. */
export default function WelcomeCompositionCanvas({
  elements,
  buttonText,
  backgroundImageUrl,
  eventWelcomeScreenUrl,
  stageBackgroundColor,
  fontFamily,
  buttonColors = {},
  preview = false,
  onStart,
  style,
}: WelcomeCompositionCanvasProps) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const childrenById = new Map<string, WelcomeElement[]>();
  for (const element of elements) {
    if (!element.parentId) continue;
    const list = childrenById.get(element.parentId) ?? [];
    list.push(element);
    childrenById.set(element.parentId, list);
  }

  return (
    <div
      data-welcome-composition-stage
      data-admin-guest-preview={preview ? '' : undefined}
      role={preview ? 'img' : undefined}
      aria-label={preview ? 'Welcome page composition preview' : undefined}
      style={{ backgroundColor: stageBackgroundColor ?? 'var(--event-bg, #071321)', containerType: 'size', fontFamily, height: '100%', overflow: 'hidden', position: 'relative', width: '100%', ...style }}
    >
      {backgroundImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backgroundImageUrl} alt="" aria-hidden="true" draggable={false} style={{ height: '100%', inset: 0, objectFit: 'cover', objectPosition: 'center', pointerEvents: 'none', position: 'absolute', width: '100%' }} />
      ) : null}
      {elements.filter((element) => !element.parentId).map((element) => (
        <WelcomeElementView
          key={element.id}
          element={element}
          elements={elements}
          byId={byId}
          childrenById={childrenById}
          eventWelcomeScreenUrl={eventWelcomeScreenUrl}
          buttonText={buttonText}
          buttonColors={buttonColors}
          preview={preview}
          onStart={onStart}
        />
      ))}
    </div>
  );
}
