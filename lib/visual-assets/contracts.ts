/**
 * Canonical contracts for Camera's Global → Partner → Event visual asset
 * hierarchy. Binary media stays in its existing collection and storage; these
 * references describe catalog policy without copying or changing the media.
 */

export const VISUAL_ASSET_KINDS = ['frames', 'logos', 'images'] as const;
export type VisualAssetKind = (typeof VISUAL_ASSET_KINDS)[number];

export interface VisualAssetRef {
  kind: VisualAssetKind;
  id: string;
}

/**
 * `shareToChildren` is owned by the asset's source level. New assets default to
 * false and require explicit sharing; a missing field remains true for legacy
 * assets so enabling the hierarchy does not silently remove existing access.
 */
export interface ShareableVisualAsset {
  scope?: 'global' | 'partner' | 'event' | null;
  partnerId?: string | null;
  eventId?: string | null;
  isActive?: boolean;
  shareToChildren?: boolean;
}

/** Policy stored on a child record, keyed by stable (kind,id) references. */
export interface VisualAssetLevelPolicy {
  /** Hide inherited assets at this level and all levels below it. */
  hidden?: VisualAssetRef[];
  /** Keep visible here, but stop the selected assets reaching children. */
  blockedForChildren?: VisualAssetRef[];
}

export type ExperienceTemplateLevel = 'global' | 'partner' | 'event';

/**
 * A deliberately allow-listed configuration snapshot. It must never contain
 * event/partner identity, submissions, consent receipts, analytics, or user
 * data. The data shape is narrowed further when saving a template.
 */
export interface ExperienceTemplate {
  templateId: string;
  level: ExperienceTemplateLevel;
  ownerId: string | null;
  name: string;
  config: Record<string, unknown>;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ExperienceTemplateSelection {
  /** Explicit local template disables inheritance only for this level. */
  mode: 'inherit' | 'template';
  templateId?: string | null;
  /** Per-field edits overlay the selected template and remain local. */
  overrides?: Record<string, unknown>;
}
