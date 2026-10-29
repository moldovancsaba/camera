import type { ShareableVisualAsset, VisualAssetLevelPolicy, VisualAssetRef } from './contracts';

export type AssetLevel = 'global' | 'partner' | 'event';

export interface AssetVisibilityContext {
  asset: ShareableVisualAsset;
  kind: VisualAssetRef['kind'];
  id: string;
  targetLevel: AssetLevel;
  partnerId?: string | null;
  eventId?: string | null;
  partnerPolicy?: VisualAssetLevelPolicy | null;
  eventPolicy?: VisualAssetLevelPolicy | null;
}

export type AssetVisibility =
  | { available: true; source: AssetLevel }
  | { available: false; source: AssetLevel; reason: 'inactive' | 'not-shared' | 'hidden-at-partner' | 'blocked-by-partner' | 'hidden-at-event' | 'wrong-owner' };

const hasRef = (list: readonly VisualAssetRef[] | undefined, kind: VisualAssetRef['kind'], id: string): boolean =>
  list?.some((item) => item.kind === kind && item.id === id) ?? false;

/** Resolve whether an existing asset may be selected at a level. Does not decide
 * whether a page/template currently renders the asset; availability and usage
 * are intentionally separate concerns. */
export function resolveAssetVisibility(context: AssetVisibilityContext): AssetVisibility {
  const { asset, kind, id, targetLevel, partnerId, eventId, partnerPolicy, eventPolicy } = context;
  const source: AssetLevel = asset.scope === 'partner' ? 'partner' : asset.scope === 'event' ? 'event' : 'global';

  if (asset.isActive === false) return { available: false, source, reason: 'inactive' };
  if (source === 'partner' && asset.partnerId !== partnerId) return { available: false, source, reason: 'wrong-owner' };
  if (source === 'event' && asset.eventId !== eventId) return { available: false, source, reason: 'wrong-owner' };
  if (targetLevel === 'global') return source === 'global' ? { available: true, source } : { available: false, source, reason: 'wrong-owner' };
  if (source === 'event') return targetLevel === 'event' ? { available: true, source } : { available: false, source, reason: 'wrong-owner' };

  if (source === 'global') {
    // Global → Partner is its own sharing boundary. Missing preserves current
    // library behavior for documents that predate the explicit sharing field.
    if (asset.shareToChildren === false) return { available: false, source, reason: 'not-shared' };
    if (hasRef(partnerPolicy?.hidden, kind, id)) return { available: false, source, reason: 'hidden-at-partner' };
    if (targetLevel === 'partner') return { available: true, source };
    if (hasRef(partnerPolicy?.blockedForChildren, kind, id)) return { available: false, source, reason: 'blocked-by-partner' };
    if (hasRef(eventPolicy?.hidden, kind, id)) return { available: false, source, reason: 'hidden-at-event' };
    return { available: true, source };
  }

  if (targetLevel === 'partner') return { available: true, source };
  if (asset.shareToChildren === false) return { available: false, source, reason: 'not-shared' };
  if (hasRef(partnerPolicy?.blockedForChildren, kind, id)) return { available: false, source, reason: 'blocked-by-partner' };
  if (hasRef(eventPolicy?.hidden, kind, id)) return { available: false, source, reason: 'hidden-at-event' };
  return { available: true, source };
}

export interface TemplateLevel<T> {
  mode?: 'inherit' | 'template';
  value?: T | null;
  overrides?: Record<string, unknown> | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Merge template objects by field while treating arrays and scalar values as
 * whole replacements. This keeps one field override from erasing sibling
 * settings (for example, one button label from a set of button labels). */
function mergeTemplateValues(base: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(next)) {
    const existing = merged[key];
    merged[key] = isPlainRecord(existing) && isPlainRecord(value)
      ? mergeTemplateValues(existing, value)
      : value;
  }
  return merged;
}

/** Merge a level chain without copying parent values into child storage. A
 * `template` mode starts a new child template; `inherit` keeps the parent. */
export function resolveTemplateConfig<T extends Record<string, unknown>>(
  levels: readonly TemplateLevel<T>[],
): T {
  let resolved: Record<string, unknown> = {};
  for (const level of levels) {
    if (level.mode === 'template') resolved = mergeTemplateValues({}, level.value ?? {});
    else if (level.value) resolved = mergeTemplateValues(resolved, level.value);
    if (level.overrides) resolved = mergeTemplateValues(resolved, level.overrides as Record<string, unknown>);
  }
  return resolved as T;
}

export function refKey(ref: VisualAssetRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function uniqueRefs(refs: readonly VisualAssetRef[] | undefined): VisualAssetRef[] {
  const seen = new Set<string>();
  const result: VisualAssetRef[] = [];
  for (const ref of refs ?? []) {
    if (!ref || typeof ref.id !== 'string' || !ref.id.trim()) continue;
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ kind: ref.kind, id: ref.id });
  }
  return result;
}
