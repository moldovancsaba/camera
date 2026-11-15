import { createHash } from 'node:crypto';
import { LIBRARY_KINDS, KIND_META, type LibraryKind, type LibraryScope } from '@/lib/library/kinds';
import { scopeOf } from '@/lib/library/rules';

type Row = Record<string, unknown>;

export interface LegacyInventoryAsset extends Row {
  id: string;
  kind: LibraryKind;
}

export interface LegacyInventoryInput {
  assets: LegacyInventoryAsset[];
  partners: Row[];
  events: Row[];
  templates: Row[];
  globalDefaultTemplateId: string | null;
  directPictureRefs?: Array<{ source: string; ownerId: string; field: string; address: string }>;
  nestedReferenceSources?: Array<{ source: string; ownerId: string; value: unknown }>;
}

export interface AssetNormalizationChange {
  kind: LibraryKind;
  id: string;
  from: { scope: unknown; isActive: unknown; shareToChildren: unknown };
  to: { scope: LibraryScope; isActive: boolean; shareToChildren: boolean };
}

export interface LegacyInventoryReport {
  schemaVersion: 1;
  generatedAt: string;
  sourceDigest: string;
  summary: {
    assets: number;
    partners: number;
    events: number;
    templates: number;
    changes: number;
    duplicateIds: number;
    duplicatePictureAddresses: number;
    unresolved: number;
  };
  assetsByKind: Record<LibraryKind, { total: number; explicitScope: number; active: number; shared: number; changes: number }>;
  partnerPolicies: { version2: number; legacy: number };
  eventPolicies: { version2: number; legacy: number };
  templatesByLevel: { global: number; partner: number; event: number; invalid: number };
  directPictureReferences: { total: number; matchedToCatalog: number; notInCatalog: number; duplicateAddresses: number };
  changes: AssetNormalizationChange[];
  duplicateIds: Array<{ kind: LibraryKind; id: string; count: number }>;
  duplicatePictureAddresses: Array<{ addressHash: string; count: number; kinds: LibraryKind[] }>;
  unresolved: Array<{ source: string; id: string; reason: string }>;
  outputComparison: {
    status: 'equivalent-by-contract' | 'blocked';
    explanation: string;
  };
  renderedEventOutputDiff: {
    status: 'not-run';
    eventsCompared: 0;
    explanation: string;
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function addressHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function safeDiagnosticValue(value: unknown): unknown {
  if (value === undefined) return '[missing]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return ['global', 'partner', 'event'].includes(value) ? value : '[invalid-string]';
  }
  return Array.isArray(value) ? '[array]' : '[object]';
}

function normalizeAsset(asset: LegacyInventoryAsset): AssetNormalizationChange | null {
  const sourceScope = scopeOf({ scope: asset.scope as LibraryScope | null | undefined });
  return asset.scope === sourceScope && typeof asset.isActive === 'boolean' && typeof asset.shareToChildren === 'boolean'
    ? null
    : {
      kind: asset.kind,
      id: asset.id,
      from: {
        scope: safeDiagnosticValue(asset.scope),
        isActive: safeDiagnosticValue(asset.isActive),
        shareToChildren: safeDiagnosticValue(asset.shareToChildren),
      },
      to: {
        scope: sourceScope,
        // Runtime treats every value except explicit false as enabled.
        isActive: asset.isActive !== false,
        shareToChildren: asset.shareToChildren !== false,
      },
    };
}

function validateVisualRef(
  source: string,
  ownerId: string,
  kind: unknown,
  id: unknown,
  assets: ReadonlySet<string>,
  unresolved: LegacyInventoryReport['unresolved'],
): void {
  if (!(LIBRARY_KINDS as readonly unknown[]).includes(kind) || typeof id !== 'string' || !id.trim()) {
    unresolved.push({ source, id: ownerId, reason: 'Malformed visual asset reference.' });
    return;
  }
  if (!assets.has(`${kind}:${id}`)) unresolved.push({ source, id: ownerId, reason: `Referenced ${String(kind)} asset is missing.` });
}

function addArrayRefs(
  source: string,
  ownerId: string,
  kind: LibraryKind,
  raw: unknown,
  assets: ReadonlySet<string>,
  unresolved: LegacyInventoryReport['unresolved'],
): void {
  if (!Array.isArray(raw)) return;
  for (const value of raw) {
    const id = typeof value === 'string' ? value : value && typeof value === 'object'
      ? (value as Row)[KIND_META[kind].idField]
      : null;
    validateVisualRef(source, ownerId, kind, id, assets, unresolved);
  }
}

function inspectPolicyRefs(
  source: string,
  ownerId: string,
  policy: unknown,
  assets: ReadonlySet<string>,
  unresolved: LegacyInventoryReport['unresolved'],
): void {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return;
  const value = policy as Row;
  for (const field of ['hidden', 'blockedForChildren']) {
    if (!Array.isArray(value[field])) continue;
    for (const ref of value[field] as unknown[]) {
      const row = ref && typeof ref === 'object' && !Array.isArray(ref) ? ref as Row : {};
      validateVisualRef(`${source}.${field}`, ownerId, row.kind, row.id, assets, unresolved);
    }
  }
}

function inspectSlotRefs(
  source: string,
  ownerId: string,
  slots: unknown,
  assets: ReadonlySet<string>,
  unresolved: LegacyInventoryReport['unresolved'],
): void {
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return;
  for (const [slotName, value] of Object.entries(slots as Row)) {
    const kind: LibraryKind | null = /logo/i.test(slotName) ? 'logos' : /frame/i.test(slotName) ? 'frames' : /image|picture/i.test(slotName) ? 'images' : null;
    if (!kind || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const items = (value as Row).items;
    if (Array.isArray(items)) addArrayRefs(`${source}.slots.${slotName}`, ownerId, kind, items, assets, unresolved);
  }
}

function inspectNestedRefs(
  source: string,
  ownerId: string,
  value: unknown,
  assets: ReadonlySet<string>,
  unresolved: LegacyInventoryReport['unresolved'],
  path = '',
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => inspectNestedRefs(source, ownerId, child, assets, unresolved, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Row)) {
    const childPath = path ? `${path}.${key}` : key;
    const match = /^(frame|logo|picture|image)Ids?$/i.exec(key);
    if (match) {
      const singular = match[1]?.toLowerCase();
      const kind: LibraryKind = singular === 'frame' ? 'frames' : singular === 'logo' ? 'logos' : 'images';
      const ids = Array.isArray(child) ? child : [child];
      for (const id of ids) validateVisualRef(`${source}.${childPath}`, ownerId, kind, id, assets, unresolved);
    } else if (/^(frame|logo|picture|image)AssetIds?$/i.test(key)) {
      // Keep matching explicit nested references separate from descriptive text.
      const kind: LibraryKind = /^frame/i.test(key) ? 'frames' : /^logo/i.test(key) ? 'logos' : 'images';
      for (const id of Array.isArray(child) ? child : [child]) validateVisualRef(`${source}.${childPath}`, ownerId, kind, id, assets, unresolved);
    }
    inspectNestedRefs(source, ownerId, child, assets, unresolved, childPath);
  }
}

function templateRefs(input: LegacyInventoryInput, unresolved: LegacyInventoryReport['unresolved']): { global: number; partner: number; event: number; invalid: number } {
  const configFields = new Set(['customPages', 'visualSettings', 'sharePage', 'frameSelection', 'frameSelectionTiles', 'welcomeScreenComposition', 'frameMessageSelectionDisplay']);
  const templates = new Map<string, Row[]>();
  for (const template of input.templates) {
    const id = nonEmptyString(template.templateId);
    if (!id) continue;
    templates.set(id, [...(templates.get(id) ?? []), template]);
  }
  let invalid = input.templates.filter((template) => !nonEmptyString(template.templateId) || !['global', 'partner', 'event'].includes(String(template.level))).length;
  const counts = { global: 0, partner: 0, event: 0, invalid };
  for (const template of input.templates) {
    const level = template.level;
    if (level === 'global' || level === 'partner' || level === 'event') counts[level] += 1;
    const ownerId = nonEmptyString(template.ownerId);
    if ((level === 'global' && ownerId) || (level !== 'global' && !ownerId)) {
      invalid += 1;
      unresolved.push({ source: 'experience_templates.owner', id: nonEmptyString(template.templateId) ?? 'missing-template-id', reason: 'Template level and owner fields do not form a valid owner relationship.' });
    }
    if (!template.config || typeof template.config !== 'object' || Array.isArray(template.config)
      || Object.keys(template.config as Row).some((key) => !configFields.has(key))) {
      invalid += 1;
      unresolved.push({ source: 'experience_templates.config', id: nonEmptyString(template.templateId) ?? 'missing-template-id', reason: 'Template configuration is malformed or contains an unsupported field.' });
    }
  }
  for (const [id, matches] of templates) {
    if (matches.length > 1) {
      invalid += 1;
      unresolved.push({ source: 'experience_templates.templateId', id, reason: 'Template ID is duplicated.' });
    }
  }

  const validate = (source: string, id: unknown, expectedLevel: string, expectedOwner: string | null) => {
    if (typeof id !== 'string' || !id) return;
    const matches = templates.get(id) ?? [];
    const target = matches.find((template) => template.level === expectedLevel && (template.ownerId ?? null) === expectedOwner);
    if (!target) {
      invalid += 1;
      unresolved.push({ source, id, reason: matches.length ? 'Template reference has the wrong level or owner.' : 'Template reference is missing.' });
    }
  };

  if (input.globalDefaultTemplateId) validate('admin_settings.default-experience-template', input.globalDefaultTemplateId, 'global', null);
  for (const partner of input.partners) {
    const ownerId = nonEmptyString(partner.partnerId) ?? 'unknown-partner';
    validate('partners.defaultExperienceTemplateId', partner.defaultExperienceTemplateId, 'partner', ownerId);
  }
  for (const event of input.events) {
    const ownerId = nonEmptyString(event.eventId) ?? 'unknown-event';
    const selection = event.experienceTemplate && typeof event.experienceTemplate === 'object'
      ? event.experienceTemplate as Row
      : null;
    if (selection?.mode === 'template') validate('events.experienceTemplate', selection.templateId, 'event', ownerId);
  }
  counts.invalid = invalid;
  return counts;
}

/** Create a PII-free dry-run report. It plans only explicit canonical defaults
 * whose effective runtime value is already identical; it never activates a
 * partner/event inheritance policy or changes a template or assignment. */
export function buildLegacyInventory(input: LegacyInventoryInput, generatedAt = new Date().toISOString()): LegacyInventoryReport {
  const unresolved: LegacyInventoryReport['unresolved'] = [];
  const byKind = Object.fromEntries(LIBRARY_KINDS.map((kind) => [kind, { total: 0, explicitScope: 0, active: 0, shared: 0, changes: 0 }])) as LegacyInventoryReport['assetsByKind'];
  const assetKeys = new Set<string>();
  const assetIdCounts = new Map<string, number>();
  const addressMatches = new Map<string, { count: number; kinds: Set<LibraryKind> }>();
  const partnerIds = new Set(input.partners.map((row) => nonEmptyString(row.partnerId)).filter((value): value is string => Boolean(value)));
  const eventsById = new Map(input.events.map((row) => [nonEmptyString(row.eventId) ?? '', row]));
  const changes: AssetNormalizationChange[] = [];
  const partnerIdCounts = new Map<string, number>();
  const eventIdCounts = new Map<string, number>();
  for (const partner of input.partners) {
    const id = nonEmptyString(partner.partnerId);
    if (id) partnerIdCounts.set(id, (partnerIdCounts.get(id) ?? 0) + 1);
  }
  for (const event of input.events) {
    const id = nonEmptyString(event.eventId);
    if (id) eventIdCounts.set(id, (eventIdCounts.get(id) ?? 0) + 1);
  }
  for (const [id, count] of partnerIdCounts) if (count > 1) unresolved.push({ source: 'partners.partnerId', id, reason: 'Partner business ID is duplicated.' });
  for (const [id, count] of eventIdCounts) if (count > 1) unresolved.push({ source: 'events.eventId', id, reason: 'Event business ID is duplicated.' });

  for (const asset of input.assets) {
    const id = nonEmptyString(asset.id);
    if (!id || !(LIBRARY_KINDS as readonly string[]).includes(asset.kind)) {
      unresolved.push({ source: 'asset', id: id ?? 'missing-id', reason: 'Asset has no stable collection ID or a known kind.' });
      continue;
    }
    const key = `${asset.kind}:${id}`;
    assetIdCounts.set(key, (assetIdCounts.get(key) ?? 0) + 1);
    assetKeys.add(key);
    const counts = byKind[asset.kind];
    counts.total += 1;
    if (asset.scope === 'global' || asset.scope === 'partner' || asset.scope === 'event') counts.explicitScope += 1;
    if (asset.isActive !== false) counts.active += 1;
    if (asset.shareToChildren !== false) counts.shared += 1;

    const effectiveScope = scopeOf({ scope: asset.scope as LibraryScope | null | undefined });
    const partnerId = nonEmptyString(asset.partnerId);
    const eventId = nonEmptyString(asset.eventId);
    const linkedEvent = eventId ? eventsById.get(eventId) : undefined;
    const invalidOwner = effectiveScope === 'global' && Boolean(partnerId || eventId)
      || effectiveScope === 'partner' && (!partnerId || Boolean(eventId) || !partnerIds.has(partnerId))
      || effectiveScope === 'event' && (!linkedEvent || Boolean(partnerId && nonEmptyString(linkedEvent.partnerId) !== partnerId));
    if (invalidOwner) {
      unresolved.push({ source: `${asset.kind}.ownership`, id, reason: 'Asset scope and owner fields do not form a valid canonical owner relationship.' });
    }

    const change = normalizeAsset(asset);
    if (change) {
      changes.push(change);
      counts.changes += 1;
    }
    const urlsForAsset = new Set([asset.imageUrl, asset.thumbnailUrl].filter((url): url is string => typeof url === 'string' && Boolean(url.trim())).map((url) => url.trim()));
    for (const url of urlsForAsset) {
      const hash = addressHash(url.trim());
      const match = addressMatches.get(hash) ?? { count: 0, kinds: new Set<LibraryKind>() };
      match.count += 1;
      match.kinds.add(asset.kind);
      addressMatches.set(hash, match);
    }
  }

  const duplicateIds = [...assetIdCounts.entries()].filter(([, count]) => count > 1).map(([key, count]) => {
    const [kind, id] = key.split(':', 2) as [LibraryKind, string];
    unresolved.push({ source: `${kind}.id`, id, reason: 'Stable asset ID is duplicated within its collection.' });
    return { kind, id, count };
  });
  const duplicatePictureAddresses = [...addressMatches.entries()].filter(([, value]) => value.count > 1).map(([hash, value]) => ({ addressHash: hash, count: value.count, kinds: [...value.kinds].sort() }));

  for (const partner of input.partners) {
    const ownerId = nonEmptyString(partner.partnerId) ?? 'unknown-partner';
    const library = partner.library && typeof partner.library === 'object' ? partner.library as Row : {};
    for (const kind of LIBRARY_KINDS) addArrayRefs(`partners.library.${kind}`, ownerId, kind, library[kind], assetKeys, unresolved);
    addArrayRefs('partners.defaultFrames', ownerId, 'frames', partner.defaultFrames, assetKeys, unresolved);
    addArrayRefs('partners.defaultLogos', ownerId, 'logos', partner.defaultLogos, assetKeys, unresolved);
    inspectPolicyRefs('partners.visualAssetPolicy', ownerId, partner.visualAssetPolicy, assetKeys, unresolved);
    inspectSlotRefs('partners', ownerId, partner.slots, assetKeys, unresolved);
  }
  for (const event of input.events) {
    const ownerId = nonEmptyString(event.eventId) ?? 'unknown-event';
    addArrayRefs('events.frames', ownerId, 'frames', event.frames, assetKeys, unresolved);
    addArrayRefs('events.logos', ownerId, 'logos', event.logos, assetKeys, unresolved);
    inspectPolicyRefs('events.visualAssetPolicy', ownerId, event.visualAssetPolicy, assetKeys, unresolved);
    inspectSlotRefs('events', ownerId, event.slots, assetKeys, unresolved);
    const frameMessages = (event.frameDesign as Row | undefined)?.messageFrames;
    if (frameMessages && typeof frameMessages === 'object' && !Array.isArray(frameMessages)) {
      for (const refs of Object.values(frameMessages as Row)) addArrayRefs('events.frameDesign.messageFrames', ownerId, 'frames', Array.isArray(refs) ? refs : [refs], assetKeys, unresolved);
    }
  }
  for (const reference of input.nestedReferenceSources ?? []) {
    inspectNestedRefs(reference.source, reference.ownerId, reference.value, assetKeys, unresolved);
  }

  const templatesByLevel = templateRefs(input, unresolved);
  const catalogAddresses = new Set(input.assets.flatMap((asset) => [asset.imageUrl, asset.thumbnailUrl]).filter((address): address is string => typeof address === 'string' && Boolean(address.trim())).map((address) => addressHash(address.trim())));
  const directRefs = input.directPictureRefs ?? [];
  const directHashes = new Map<string, number>();
  let matchedDirectRefs = 0;
  for (const ref of directRefs) {
    const hash = addressHash(ref.address.trim());
    directHashes.set(hash, (directHashes.get(hash) ?? 0) + 1);
    if (catalogAddresses.has(hash)) matchedDirectRefs += 1;
  }
  const directPictureReferences = {
    total: directRefs.length,
    matchedToCatalog: matchedDirectRefs,
    notInCatalog: directRefs.length - matchedDirectRefs,
    duplicateAddresses: [...directHashes.values()].filter((count) => count > 1).length,
  };
  const digestInput = {
    assets: input.assets.map(({ id, kind, scope, partnerId, eventId, isActive, shareToChildren, imageUrl, thumbnailUrl }) => ({ id, kind, scope, partnerId, eventId, isActive, shareToChildren, imageHash: typeof imageUrl === 'string' ? addressHash(imageUrl) : null, thumbnailHash: typeof thumbnailUrl === 'string' ? addressHash(thumbnailUrl) : null })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    partners: input.partners.map(({ partnerId, library, defaultFrames, defaultLogos, visualAssetPolicy, defaultExperienceTemplateId, slots, contentDefaults, pictures, logoUrl }) => ({ partnerId, library, defaultFrames, defaultLogos, visualAssetPolicy, defaultExperienceTemplateId, slots, contentDefaults, pictures, logoUrl })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    events: input.events.map(({ eventId, partnerId, frames, logos, visualAssetPolicy, experienceTemplate, slots, customPages, frameDesign, welcomeScreenComposition, frameSelection, frameSelectionTiles, logoUrl, emailFooterImageUrl }) => ({ eventId, partnerId, frames, logos, visualAssetPolicy, experienceTemplate, slots, customPages, frameDesign, welcomeScreenComposition, frameSelection, frameSelectionTiles, logoUrl, emailFooterImageUrl })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    templates: input.templates.map(({ templateId, level, ownerId, config }) => ({ templateId, level, ownerId, config })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    directPictureRefs: directRefs.map(({ source, ownerId, field, address }) => ({ source, ownerId, field, addressHash: addressHash(address.trim()) })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    nestedReferenceSources: (input.nestedReferenceSources ?? []).map(({ source, ownerId, value }) => ({ source, ownerId, value })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
    globalDefaultTemplateId: input.globalDefaultTemplateId,
  };

  return {
    schemaVersion: 1,
    generatedAt,
    sourceDigest: createHash('sha256').update(canonicalJson(digestInput)).digest('hex'),
    summary: {
      assets: input.assets.length,
      partners: input.partners.length,
      events: input.events.length,
      templates: input.templates.length,
      changes: changes.length,
      duplicateIds: duplicateIds.length,
      duplicatePictureAddresses: duplicatePictureAddresses.length,
      unresolved: unresolved.length,
    },
    assetsByKind: byKind,
    partnerPolicies: {
      version2: input.partners.filter((row) => (row.visualAssetPolicy as Row | undefined)?.inheritanceVersion === 2).length,
      legacy: input.partners.filter((row) => (row.visualAssetPolicy as Row | undefined)?.inheritanceVersion !== 2).length,
    },
    eventPolicies: {
      version2: input.events.filter((row) => (row.visualAssetPolicy as Row | undefined)?.inheritanceVersion === 2).length,
      legacy: input.events.filter((row) => (row.visualAssetPolicy as Row | undefined)?.inheritanceVersion !== 2).length,
    },
    templatesByLevel,
    directPictureReferences,
    changes,
    duplicateIds,
    duplicatePictureAddresses,
    unresolved,
    outputComparison: {
      status: unresolved.length ? 'blocked' : 'equivalent-by-contract',
      explanation: unresolved.length
        ? 'Unresolved ownership or references remain. No migration is safe to apply.'
        : 'The proposed asset field defaults preserve the current runtime interpretation. Partner/event policies, assignments, templates, picture URLs, and media objects are not changed; this is a contract proof, not a rendered production diff.',
    },
    renderedEventOutputDiff: {
      status: 'not-run',
      eventsCompared: 0,
      explanation: 'A representative before/after render diff requires an operator-selected non-production dataset and is a separate migration gate. This inventory cannot claim rendered output parity.',
    },
  };
}
