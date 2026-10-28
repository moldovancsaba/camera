/**
 * The editable elements on the event welcome screen. Coordinates use the same
 * nine-point alignment model as the capture experience; child elements are
 * placed beside their parent and inherit the root's alignment on the other axis.
 */

export type WelcomeAxisAlignment = 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right';
export type WelcomeVerticalAlignment = Extract<WelcomeAxisAlignment, 'top' | 'middle' | 'bottom'>;
export type WelcomeHorizontalAlignment = Extract<WelcomeAxisAlignment, 'left' | 'center' | 'right'>;
export type WelcomeAnchor = {
  vertical: WelcomeVerticalAlignment;
  horizontal: WelcomeHorizontalAlignment;
};
export type WelcomeParentRelation = 'parent-above' | 'parent-below' | 'parent-left' | 'parent-right';
export type WelcomeElementType = 'image' | 'text' | 'start-button';

export interface WelcomeElement {
  id: string;
  name: string;
  type: WelcomeElementType;
  /** Only root elements have an anchor. A child inherits its orthogonal axis from its root. */
  anchor?: WelcomeAnchor;
  /** When present, this element is placed beside its parent. */
  parentId?: string;
  /** Describes the parent's position relative to this child (parent-above => this child is below). */
  parentRelation?: WelcomeParentRelation;
  /** Width in percent of the preview/stage width; images and text use it, the start button ignores it. */
  widthPercent?: number;
  imageUrl?: string;
  /** Keep the event-generated welcome-screen picture live as the source is refreshed. */
  imageSource?: 'event-welcome-screen';
  alt?: string;
  text?: string;
  /** Font size as a percentage of the stage width (cqw), for responsive compositions. */
  fontSizePercent?: number;
  color?: string;
  fontWeight?: 'normal' | 'bold';
}

export const WELCOME_PARENT_RELATIONS: readonly WelcomeParentRelation[] = [
  'parent-above', 'parent-below', 'parent-left', 'parent-right',
];

export const DEFAULT_WELCOME_ANCHOR: WelcomeAnchor = { vertical: 'middle', horizontal: 'center' };
export const WELCOME_MAX_ELEMENTS = 32;
export const WELCOME_MAX_TEXT_LENGTH = 2000;

/**
 * Convert the fixed legacy welcome fields once, when its editor is first saved.
 * The old screen generated from the event slideshow stays dynamic via imageSource.
 */
export function welcomeElementsFromLegacy(config: {
  bottomImageUrl?: string;
  cornerImageUrl?: string;
  screenImageUrl?: string;
  screenImageAlt?: string;
  buttonText?: string;
}, eventWelcomeScreenUrl?: string | null): WelcomeElement[] {
  const elements: WelcomeElement[] = [];
  const addImage = (id: string, name: string, imageUrl: string, anchor: WelcomeAnchor, widthPercent: number, alt = '') => {
    elements.push({ id, name, type: 'image', imageUrl, anchor, widthPercent, alt });
  };

  if (config.bottomImageUrl) addImage('legacy-bottom-image', 'Bottom-left image', config.bottomImageUrl, { vertical: 'bottom', horizontal: 'left' }, 48);
  if (config.cornerImageUrl) addImage('legacy-corner-image', 'Bottom-right image', config.cornerImageUrl, { vertical: 'bottom', horizontal: 'right' }, 48);

  const screenUrl = config.screenImageUrl || eventWelcomeScreenUrl;
  if (screenUrl) {
    elements.push({
      id: 'legacy-screen-image',
      name: 'Welcome screen image',
      type: 'image',
      ...(config.screenImageUrl ? { imageUrl: config.screenImageUrl } : { imageSource: 'event-welcome-screen' as const }),
      anchor: { vertical: 'top', horizontal: 'center' },
      widthPercent: 72,
      alt: config.screenImageAlt || '',
    });
    elements.push({
      id: 'welcome-start-button',
      name: 'Start button',
      type: 'start-button',
      parentId: 'legacy-screen-image',
      parentRelation: 'parent-above',
    });
  } else {
    elements.push({
      id: 'welcome-start-button',
      name: 'Start button',
      type: 'start-button',
      anchor: DEFAULT_WELCOME_ANCHOR,
    });
  }

  return elements;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAnchor(value: unknown): value is WelcomeAnchor {
  if (!isRecord(value)) return false;
  return ['top', 'middle', 'bottom'].includes(String(value.vertical))
    && ['left', 'center', 'right'].includes(String(value.horizontal));
}

function isSafeImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Validate saved data at the event API boundary and return a useful admin-facing error. */
export function validateWelcomeElements(value: unknown): string | null {
  if (!Array.isArray(value)) return 'welcomeElements must be a list';
  if (value.length === 0 || value.length > WELCOME_MAX_ELEMENTS) return `welcomeElements must contain 1–${WELCOME_MAX_ELEMENTS} elements`;

  const ids = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return `welcomeElements[${index}] must be an object`;
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)) return `welcomeElements[${index}].id is invalid`;
    if (ids.has(item.id)) return 'welcomeElements ids must be unique';
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120) return `welcomeElements[${index}].name is required and must be at most 120 characters`;
    if (!['image', 'text', 'start-button'].includes(String(item.type))) return `welcomeElements[${index}].type is invalid`;
    if (item.parentId !== undefined && (typeof item.parentId !== 'string' || item.parentId.length === 0)) return `welcomeElements[${index}].parentId is invalid`;
    const hasParent = typeof item.parentId === 'string';
    if (hasParent) {
      if (item.anchor !== undefined) return `welcomeElements[${index}] child elements inherit their alignment`;
      if (typeof item.parentId !== 'string' || item.parentId === item.id) return `welcomeElements[${index}].parentId is invalid`;
      if (!WELCOME_PARENT_RELATIONS.includes(item.parentRelation as WelcomeParentRelation)) return `welcomeElements[${index}].parentRelation is required`;
    } else if (!isAnchor(item.anchor)) {
      return `welcomeElements[${index}] root elements need a valid anchor`;
    } else if (item.parentRelation !== undefined) {
      return `welcomeElements[${index}] root elements cannot have a parent relation`;
    }

    if (item.type === 'image') {
      if (item.imageSource !== undefined && item.imageSource !== 'event-welcome-screen') return `welcomeElements[${index}].imageSource is invalid`;
      const dynamicSource = item.imageSource === 'event-welcome-screen';
      if (dynamicSource ? item.imageUrl !== undefined : !isSafeImageUrl(item.imageUrl)) return `welcomeElements[${index}] needs an HTTPS image URL or the event welcome-screen source`;
      if (item.alt !== undefined && (typeof item.alt !== 'string' || item.alt.length > 300)) return `welcomeElements[${index}].alt must be at most 300 characters`;
      if (item.widthPercent !== undefined && (typeof item.widthPercent !== 'number' || !Number.isFinite(item.widthPercent) || item.widthPercent < 2 || item.widthPercent > 100)) return `welcomeElements[${index}].widthPercent must be between 2 and 100`;
    }
    if (item.type === 'text') {
      if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > WELCOME_MAX_TEXT_LENGTH) return `welcomeElements[${index}].text is required and must be at most ${WELCOME_MAX_TEXT_LENGTH} characters`;
      if (item.widthPercent !== undefined && (typeof item.widthPercent !== 'number' || !Number.isFinite(item.widthPercent) || item.widthPercent < 2 || item.widthPercent > 100)) return `welcomeElements[${index}].widthPercent must be between 2 and 100`;
      if (item.fontSizePercent !== undefined && (typeof item.fontSizePercent !== 'number' || !Number.isFinite(item.fontSizePercent) || item.fontSizePercent < 1 || item.fontSizePercent > 16)) return `welcomeElements[${index}].fontSizePercent must be between 1 and 16`;
      if (item.color !== undefined && (typeof item.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(item.color))) return `welcomeElements[${index}].color must be a six-digit hex colour`;
      if (item.fontWeight !== undefined && !['normal', 'bold'].includes(String(item.fontWeight))) return `welcomeElements[${index}].fontWeight is invalid`;
    }
    if (item.type === 'start-button' && item.id !== 'welcome-start-button') return 'The start button must use the welcome-start-button id';
  }

  for (const item of value as Array<Record<string, unknown>>) {
    if (item.parentId && !ids.has(String(item.parentId))) return `welcomeElements parent ${String(item.parentId)} does not exist`;
  }

  const starts = (value as Array<Record<string, unknown>>).filter((item) => item.type === 'start-button');
  if (starts.length !== 1) return 'welcomeElements must contain exactly one start button';

  const byId = new Map((value as Array<Record<string, unknown>>).map((item) => [String(item.id), item]));
  for (const item of value as Array<Record<string, unknown>>) {
    const visited = new Set<string>([String(item.id)]);
    let parentId = item.parentId ? String(item.parentId) : '';
    while (parentId) {
      if (visited.has(parentId)) return 'welcomeElements cannot contain parent cycles';
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ? String(byId.get(parentId)?.parentId) : '';
    }
  }

  return null;
}
