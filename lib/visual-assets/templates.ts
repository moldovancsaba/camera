import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { ExperienceTemplate, ExperienceTemplateSelection, ShareableVisualAsset, VisualAssetLevelPolicy } from './contracts';
import { LIBRARY_KINDS, KIND_META, type LibraryKind } from '@/lib/library/kinds';
import { partnerLibraryIds, loadEventLibrary } from '@/lib/library/db';
import { resolveAssetVisibility } from './resolve';

/** Event fields that are safe to reuse as an experience preset. Copy is
 * intentionally allow-listed: identity, consent receipts, photos, analytics,
 * and event-specific operational state never enter a template. */
export const TEMPLATE_CONFIG_FIELDS = [
  'customPages',
  'defaultPageOrders',
  'sharePage',
  'frameMessageSelectionDisplay',
] as const;

/** Fields that define a reusable journey. Branding and media stay event-owned. */
export const JOURNEY_FLOW_FIELDS = [
  'customPages',
  'defaultPageOrders',
  'sharePage',
  'frameMessageSelectionDisplay',
] as const;

export type ExperienceTemplateConfig = Partial<Record<(typeof JOURNEY_FLOW_FIELDS)[number], unknown>>;

const MAX_CONFIG_BYTES = 512 * 1024;
const MAX_DEPTH = 24;
const FORBIDDEN_KEYS = new Set([
  '_id', 'eventid', 'partnerid', 'submission', 'submissionid', 'userid', 'useremail',
  'consentaudit', 'consentreceipt', 'analytics', 'photodata', 'originalimageurl',
]);

const COLLECTION_BY_KIND: Record<LibraryKind, string> = {
  frames: COLLECTIONS.FRAMES,
  logos: COLLECTIONS.LOGOS,
  images: COLLECTIONS.IMAGES,
};

function visualAssetUrlField(field: string): boolean {
  return /^(image|thumbnail|background|screen|picture|src|logo|frame)|^url$/i.test(field)
    || /(image|thumbnail|picture|logo|frame|background|overlay)(url|src)?$/i.test(field);
}

function collectVisualAssetUrls(value: unknown, output: Set<string>, field = ''): void {
  if (typeof value === 'string') {
    if (visualAssetUrlField(field) && /^https:\/\//i.test(value)) output.add(value);
  } else if (Array.isArray(value)) {
    for (const child of value) collectVisualAssetUrls(child, output, field);
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) collectVisualAssetUrls(child, output, key);
  }
}

/**
 * A reusable preset must not capture a library picture that its target level
 * cannot use. Unknown/external URLs stay supported for legacy page artwork;
 * known Camera library assets are checked against the actual parent catalog.
 */
export async function validateTemplateAssetScope(
  db: Db,
  level: ExperienceTemplate['level'],
  config: ExperienceTemplateConfig,
  sourceEvent: Record<string, unknown>,
  partner: Record<string, unknown> | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const urls = new Set<string>();
  collectVisualAssetUrls(config, urls);
  if (!urls.size) return { ok: true };
  const requested = [...urls];
  const catalog = await Promise.all(LIBRARY_KINDS.map(async (kind) => {
    const collection = db.collection(COLLECTION_BY_KIND[kind]);
    const idField = KIND_META[kind].idField;
    const docs = await collection.find({ $or: [{ imageUrl: { $in: requested } }, { thumbnailUrl: { $in: requested } }] }).toArray();
    return docs.map((doc) => ({ kind, id: String(doc[idField] ?? ''), doc }));
  }));
  const knownByUrl = new Map<string, Array<{ kind: LibraryKind; id: string; doc: Document }>>();
  for (const item of catalog.flat()) {
    for (const key of ['imageUrl', 'thumbnailUrl']) {
      const url = item.doc[key];
      if (typeof url !== 'string' || !urls.has(url) || !item.id) continue;
      const matches = knownByUrl.get(url) ?? [];
      matches.push(item);
      knownByUrl.set(url, matches);
    }
  }

  const partnerId = typeof partner?.partnerId === 'string' ? partner.partnerId : '';
  const eventId = typeof sourceEvent.eventId === 'string' ? sourceEvent.eventId : '';
  const partnerCatalogs = new Map<LibraryKind, Set<string>>();
  if (level === 'partner' && partner) {
    await Promise.all(LIBRARY_KINDS.map(async (kind) => {
      partnerCatalogs.set(kind, await partnerLibraryIds(db, partner as Document, kind));
    }));
  }
  const eventCatalogs = new Map<LibraryKind, Set<string>>();
  if (level === 'event') {
    await Promise.all(LIBRARY_KINDS.map(async (kind) => {
      const library = await loadEventLibrary(db, sourceEvent as Document, kind);
      eventCatalogs.set(kind, new Set([...library.available, ...library.assigned].map((item) => item.id)));
    }));
  }

  const inheritanceEnabled = (partner?.visualAssetPolicy as { inheritanceVersion?: unknown } | undefined)?.inheritanceVersion === 2;
  const partnerPolicy = inheritanceEnabled ? partner?.visualAssetPolicy as VisualAssetLevelPolicy | undefined : undefined;
  const eventPolicy = inheritanceEnabled ? sourceEvent.visualAssetPolicy as VisualAssetLevelPolicy | undefined : undefined;

  for (const matches of knownByUrl.values()) {
    const eligible = matches.some(({ kind, id, doc }) => {
      if (doc.isActive === false) return false;
      const scope = doc.scope === 'partner' ? 'partner' : doc.scope === 'event' ? 'event' : 'global';
      if (level === 'global') return scope === 'global' && doc.shareToChildren !== false;
      const visibility = resolveAssetVisibility({
        asset: doc as ShareableVisualAsset,
        kind,
        id,
        targetLevel: level,
        partnerId,
        eventId,
        partnerPolicy,
        eventPolicy,
      });
      if (!visibility.available) return false;
      if (level === 'partner') {
        // A partner default is meant for that partner's future events. A
        // global asset blocked from forwarding or a private partner upload
        // would otherwise save successfully but disappear at event runtime.
        const forwarded = scope === 'global'
          ? !partnerPolicy?.blockedForChildren?.some((ref) => ref.kind === kind && ref.id === id)
          : doc.shareToChildren !== false;
        return scope !== 'event' && forwarded && Boolean(partnerCatalogs.get(kind)?.has(id));
      }
      return Boolean(eventCatalogs.get(kind)?.has(id));
    });
    if (!eligible) {
      return { ok: false, reason: `A Camera library image in this setup is inactive, private, or unavailable at the ${level} level.` };
    }
  }
  return { ok: true };
}

export type TemplateConfigResult = { ok: true; config: ExperienceTemplateConfig } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function copySafeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new Error('Experience configuration is nested too deeply.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Experience configuration contains an invalid number.');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => copySafeValue(item, depth + 1));
  if (!isRecord(value)) throw new Error('Experience configuration must contain JSON values only.');
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) throw new Error(`Experience configuration cannot contain ${key}.`);
    result[key] = copySafeValue(child, depth + 1);
  }
  return result;
}

/** Select the reusable fields from an event or validate a submitted template. */
export function parseExperienceTemplateConfig(input: unknown): TemplateConfigResult {
  if (!isRecord(input)) return { ok: false, reason: 'Template config must be an object.' };
  const keys = Object.keys(input);
  if (keys.some((key) => !(TEMPLATE_CONFIG_FIELDS as readonly string[]).includes(key))) {
    return { ok: false, reason: 'Template config contains an unsupported field.' };
  }
  try {
    const config = copySafeValue(input, 0) as ExperienceTemplateConfig;
    if (Buffer.byteLength(JSON.stringify(config), 'utf8') > MAX_CONFIG_BYTES) {
      return { ok: false, reason: 'Template config is larger than 512 KB.' };
    }
    return { ok: true, config };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Template config is invalid.' };
  }
}

/**
 * Stored templates from the first rollout may contain presentation fields.
 * Project them onto the current flow-only contract at every read boundary so
 * they remain usable without letting legacy branding leak into event output.
 */
export function journeyConfigFromStoredTemplate(input: unknown): ExperienceTemplateConfig | null {
  if (!isRecord(input)) return null;
  const fields = Object.fromEntries(JOURNEY_FLOW_FIELDS
    .filter((field) => input[field] !== undefined)
    .map((field) => [field, input[field]]));
  const parsed = parseExperienceTemplateConfig(fields);
  return parsed.ok ? parsed.config : null;
}

/**
 * Consent and identity collection belong to the destination event. A Partner
 * Journey can define the surrounding flow, but must not carry another event's
 * consent wording, identity fields, or placement into its descendants.
 */
export function makePartnerJourneyConfig(input: ExperienceTemplateConfig): ExperienceTemplateConfig {
  const parsed = parseExperienceTemplateConfig(input);
  if (!parsed.ok) throw new Error(parsed.reason);
  const config = structuredClone(parsed.config) as Record<string, unknown>;
  if (Array.isArray(config.customPages)) {
    config.customPages = config.customPages.filter((page) =>
      !isRecord(page) || (page.pageType !== 'accept' && page.pageType !== 'who-are-you'),
    );
  }
  return config as ExperienceTemplateConfig;
}

/** Return an admin-safe template view, applying level-specific privacy rules. */
export function journeyTemplateForAdmin<T extends Record<string, unknown>>(template: T): (Omit<T, 'config'> & { config: ExperienceTemplateConfig }) | null {
  const storedConfig = journeyConfigFromStoredTemplate(template.config);
  if (!storedConfig) return null;
  let config: ExperienceTemplateConfig;
  try {
    config = template.level === 'global'
      ? makeGlobalJourneyConfig(storedConfig)
      : template.level === 'partner'
        ? makePartnerJourneyConfig(storedConfig)
        : storedConfig;
  } catch {
    return null;
  }
  return config ? { ...template, config } : null;
}

export function experienceConfigFromEvent(event: Record<string, unknown>): ExperienceTemplateConfig {
  const fields = Object.fromEntries(JOURNEY_FLOW_FIELDS
    .filter((field) => event[field] !== undefined)
    .map((field) => [field, event[field]]));
  const parsed = parseExperienceTemplateConfig(fields);
  return parsed.ok ? parsed.config : {};
}

/** Remove event-specific consent and identity steps from a parent journey. */
export function makeGlobalJourneyConfig(input: ExperienceTemplateConfig): ExperienceTemplateConfig {
  const parsed = parseExperienceTemplateConfig(input);
  if (!parsed.ok) throw new Error(parsed.reason);
  const config = structuredClone(parsed.config) as Record<string, unknown>;
  if (Array.isArray(config.customPages)) {
    config.customPages = config.customPages.filter((page) =>
      !isRecord(page) || (page.pageType !== 'accept' && page.pageType !== 'who-are-you'),
    );
  }
  return config as ExperienceTemplateConfig;
}

/** Convert an event setup into a generic global starting point. This runs only
 * at creation time; subsequent global edits retain their selected global
 * library artwork and copy rather than being scrubbed on every read. */
export function makeGenericGlobalJourneyConfig(input: ExperienceTemplateConfig): ExperienceTemplateConfig {
  const parsed = parseExperienceTemplateConfig(input);
  if (!parsed.ok) throw new Error(parsed.reason);
  const config = structuredClone(parsed.config) as Record<string, unknown>;
  // The global layer defines the flow. Each partner/event supplies its own
  // welcome artwork, brand colors, frames and message selections. The accepted
  // journey hides frame choices but keeps the user's message choice, so that
  // behavior is part of the flow and must inherit too.
  for (const field of ['visualSettings', 'sharePage', 'frameSelection', 'frameSelectionTiles', 'welcomeScreenComposition']) {
    delete config[field];
  }
  config.frameMessageSelectionDisplay = 'messages-only';

  const stripClientArtwork = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripClientArtwork);
    if (!isRecord(value)) return value;
    const clean: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (/image|logo|frame|picture|background|thumbnail|asset|url|color/i.test(key)) continue;
      if (typeof child === 'string' && /^https?:\/\//i.test(child)) continue;
      clean[key] = stripClientArtwork(child);
    }
    return clean;
  };

  if (Array.isArray(config.customPages)) {
    const safePages = stripClientArtwork(config.customPages) as unknown[];
    config.customPages = safePages.flatMap((page) => {
      if (!isRecord(page) || !isRecord(page.config)) return [];
      // Consent and identity are generated from each event's own consent,
      // vetting and language settings; never copy the source client's values.
      if (page.pageType === 'accept' || page.pageType === 'who-are-you') return [];

      const pageConfig = { ...page.config };
      for (const key of ['title', 'description', 'buttonText']) {
        if (key in pageConfig) pageConfig[key] = '';
      }

      if (page.pageType === 'welcome') {
        // The artwork is deliberately resolved from the destination event's
        // own welcome screen at runtime.
        delete pageConfig.welcomeElements;
        pageConfig.title = '';
        pageConfig.buttonText = '';
        pageConfig.screenImageAlt = '';
      } else if (page.pageType === 'take-photo') {
        // Keep behavioral switches, but use translated product copy instead
        // of text authored for the source event.
        for (const key of [
          'captureButtonText', 'retryButtonText', 'shareNextButtonText', 'shareScreenTitle',
          'shareCopyLinkButtonText', 'shareViewPhotoButtonText', 'shareSuggestedMessageLabel',
          'shareSocialCaptionTemplate', 'successMessage', 'skipShareMessage', 'cameraPromptTitle',
          'cameraPromptDescription', 'errorFrameMessage', 'errorSaveMessage', 'linkCopiedMessage',
          'copyErrorMessage', 'saveFirstMessage', 'pendingTitle', 'pendingSavedMessage',
          'pendingPreviewNotice', 'pendingWaitingMessage',
        ]) {
          if (key in pageConfig) pageConfig[key] = '';
        }
      } else if (page.pageType === 'cta') {
        // CTA URLs and source copy are client-specific. Keep a generic,
        // translated completion step without the source webshop action.
        pageConfig.title = '';
        pageConfig.description = '';
        pageConfig.buttonText = '';
        pageConfig.checkboxText = '';
        pageConfig.visitButtonText = '';
        pageConfig.redirectingText = '';
        pageConfig.hasButton = true;
        pageConfig.hideButtons = false;
        pageConfig.hideVisitButton = true;
        pageConfig.pictureLink = false;
      } else if (page.pageType === 'restart') {
        pageConfig.title = '';
        pageConfig.description = '';
        pageConfig.buttonText = '';
        pageConfig.restartButtonText = '';
      }

      return [{ ...page, config: pageConfig }];
    });
  }

  // Only the product's stable generated-page order keys are meaningful at
  // global scope. Source event page IDs and local drag ordering stay local.
  if (isRecord(config.defaultPageOrders)) {
    const allowed = new Set(['default-welcome', 'default-consent', 'default-identity', 'default-frame-message-selection']);
    config.defaultPageOrders = Object.fromEntries(Object.entries(config.defaultPageOrders).filter(([key, value]) =>
      allowed.has(key) && typeof value === 'number' && Number.isFinite(value),
    ));
  }
  return config as ExperienceTemplateConfig;
}

/** Old events with stored pages and no valid template choice keep those pages
 * until an editor explicitly selects inheritance or converts them to a named
 * Event Journey. A malformed legacy selection is treated as no valid choice. */
export function hasLegacyLocalJourney(event: Record<string, unknown>): boolean {
  if (!Array.isArray(event.customPages) || event.customPages.length === 0) return false;
  const selection = event.experienceTemplate;
  if (selection === undefined || selection === null) return true;
  if (!isRecord(selection)) return true;
  if (selection.mode === 'inherit') return false;
  return selection.mode !== 'template' || typeof selection.templateId !== 'string' || selection.templateId.length === 0;
}

export function parseExperienceTemplateSelection(input: unknown): { ok: true; value: ExperienceTemplateSelection } | { ok: false; reason: string } {
  if (!isRecord(input) || (input.mode !== 'inherit' && input.mode !== 'template')) {
    return { ok: false, reason: 'Experience selection mode must be inherit or template.' };
  }
  if (Object.keys(input).some((key) => key !== 'mode' && key !== 'templateId')) {
    return { ok: false, reason: 'A journey selection can contain only one mode and one selected template. Field overrides are not supported.' };
  }
  if (input.mode === 'inherit') {
    if (input.templateId !== undefined && input.templateId !== null) return { ok: false, reason: 'An inherited selection cannot name a template.' };
  } else if (typeof input.templateId !== 'string' || input.templateId.length < 1 || input.templateId.length > 100) {
    return { ok: false, reason: 'A template selection needs a valid template id. Use inherit to follow the parent journey.' };
  }
  return {
    ok: true,
    value: {
      mode: input.mode,
      ...(input.mode === 'template' ? { templateId: input.templateId as string } : {}),
    },
  };
}

type TemplateDocument = ExperienceTemplate & Document;

async function findTemplate(db: Db, templateId: string, level: ExperienceTemplate['level'], ownerId: string | null): Promise<TemplateDocument | null> {
  const template = await db.collection<TemplateDocument>(COLLECTIONS.EXPERIENCE_TEMPLATES).findOne({ templateId, level, ownerId }) as TemplateDocument | null;
  if (!template) return null;
  const safe = journeyTemplateForAdmin(template as Record<string, unknown>);
  return safe ? { ...template, config: safe.config } : null;
}

async function globalDefaultId(db: Db): Promise<string | null> {
  const setting = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: 'default-experience-template' });
  return typeof setting?.templateId === 'string' ? setting.templateId : null;
}

/** Resolve exactly one selected journey without copying parent state into child
 * documents. An event selection wins; otherwise the partner selection wins;
 * otherwise the global default wins. Parent journeys never stack. */
export async function resolveEventExperienceConfig(
  db: Db,
  event: Record<string, unknown>,
  partner: Record<string, unknown> | null,
): Promise<{ config: ExperienceTemplateConfig; templateId: string | null } | null> {
  const eventId = typeof event.eventId === 'string' ? event.eventId : '';
  const partnerId = typeof partner?.partnerId === 'string' ? partner.partnerId : '';
  const storedSelection = event.experienceTemplate as ExperienceTemplateSelection | null | undefined;
  const legacyJourney = hasLegacyLocalJourney(event);
  // Preserve pre-template event content until an editor converts it to a
  // named Event Journey or explicitly selects inheritance. New events already
  // store inherit mode and immediately follow the selected parent version.
  if (legacyJourney) return null;

  const selection = storedSelection ?? { mode: 'inherit' as const };
  let selected: TemplateDocument | null = null;
  if (selection.mode === 'template') {
    if (typeof selection.templateId === 'string') selected = await findTemplate(db, selection.templateId, 'event', eventId);
  }
  // If a stale selection cannot resolve to an owned template, fail safely to
  // the nearest valid parent default instead of blanking the public journey.
  if (!selected && typeof partner?.defaultExperienceTemplateId === 'string') {
    selected = await findTemplate(db, partner.defaultExperienceTemplateId, 'partner', partnerId);
  }
  if (!selected) {
    const defaultId = await globalDefaultId(db);
    if (defaultId) selected = await findTemplate(db, defaultId, 'global', null);
  }

  if (!selected) return null;
  const config = Object.fromEntries(JOURNEY_FLOW_FIELDS
    .filter((field) => selected.config[field] !== undefined)
    .map((field) => [field, selected.config[field]])) as ExperienceTemplateConfig;
  return { config, templateId: selected.templateId };
}

export function applyExperienceConfig<T extends Record<string, unknown>>(
  event: T,
  resolved: { config: ExperienceTemplateConfig; templateId: string | null } | null,
): T & { effectiveExperienceTemplateId?: string | null } {
  if (!resolved) return event;
  // A selected journey is the single source for the guest flow. Branding,
  // frame selection and welcome artwork remain event-owned settings.
  const result = { ...event };
  for (const field of JOURNEY_FLOW_FIELDS) delete result[field];
  const journey = Object.fromEntries(JOURNEY_FLOW_FIELDS
    .filter((field) => resolved.config[field] !== undefined)
    .map((field) => [field, resolved.config[field]]));
  return { ...result, ...journey, effectiveExperienceTemplateId: resolved.templateId };
}
