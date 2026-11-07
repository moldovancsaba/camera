import { apiBadRequest, apiError } from '@/lib/api';
import { generateId, type ParentSlideshowTemplate, type PartnerDefaultSlideshow } from '@/lib/db/schemas';
import { cleanSlideshowDefault } from '@/lib/slideshow/content-defaults';

export interface ParentSlideshowTemplateState {
  revision: number;
  slideshow: PartnerDefaultSlideshow | null;
  slideshowTemplates: ParentSlideshowTemplate[];
  defaultSlideshowTemplateId: string | null;
}

export interface ResolvedParentSlideshowDefault {
  level: 'partner' | 'global';
  templateId: string;
  revision: number;
  slideshow: PartnerDefaultSlideshow;
}

/** Resolve the one active slideshow passed down to an event: partner selection first, then global. */
export function resolveParentSlideshowDefault(
  partnerValue: Record<string, unknown> | null | undefined,
  globalValue: Record<string, unknown> | null | undefined,
  partnerId: string,
): ResolvedParentSlideshowDefault | null {
  if (partnerId) {
    const partner = normalizeParentSlideshowTemplates(partnerValue, `legacy-partner-slideshow-${partnerId}`, false);
    const selected = partner.slideshowTemplates.find((item) => item.templateId === partner.defaultSlideshowTemplateId);
    if (selected && selected.isActive !== false) {
      return {
        level: 'partner',
        templateId: selected.templateId,
        revision: partner.revision,
        slideshow: Object.fromEntries(Object.entries(selected).filter(([key]) => key !== 'templateId')) as PartnerDefaultSlideshow,
      };
    }
  }

  const global = normalizeParentSlideshowTemplates(globalValue, 'legacy-global-slideshow', true);
  const selected = global.slideshowTemplates.find((item) => item.templateId === global.defaultSlideshowTemplateId);
  if (!selected || selected.isActive === false) return null;
  return {
    level: 'global',
    templateId: selected.templateId,
    revision: global.revision,
    slideshow: Object.fromEntries(Object.entries(selected).filter(([key]) => key !== 'templateId')) as PartnerDefaultSlideshow,
  };
}

/**
 * Read legacy single-default records as a named template without changing storage.
 * The next successful write persists this stable migration in the owner's record.
 */
export function normalizeParentSlideshowTemplates(
  value: Record<string, unknown> | null | undefined,
  legacyId: string,
  isGlobal: boolean,
): ParentSlideshowTemplateState {
  const stored: ParentSlideshowTemplate[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  if (Array.isArray(value?.slideshowTemplates)) {
    for (const item of value.slideshowTemplates) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const candidate = item as Record<string, unknown>;
      const templateId = typeof candidate.templateId === 'string' ? candidate.templateId.trim() : '';
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      const nameKey = name.toLowerCase();
      if (!templateId || templateId.length > 160 || !name || name.length > 120 || seenIds.has(templateId) || seenNames.has(nameKey)) continue;
      let clean: ReturnType<typeof cleanSlideshowDefault>;
      try {
        clean = cleanSlideshowDefault(candidate);
      } catch {
        // A malformed stored template must not take down the entire admin page.
        continue;
      }
      seenIds.add(templateId);
      seenNames.add(nameKey);
      stored.push({ ...clean, templateId, name });
    }
  }
  const hasValidLegacySlideshow = Boolean(value?.slideshow && typeof value.slideshow === 'object' && !Array.isArray(value.slideshow));
  const hasNamedTemplateState = stored.length > 0 || !hasValidLegacySlideshow;
  let legacyTemplate: ParentSlideshowTemplate | null = null;
  if (hasValidLegacySlideshow) {
    try {
      const legacy = cleanSlideshowDefault(value!.slideshow as Record<string, unknown>);
      legacyTemplate = { ...legacy, templateId: legacyId };
    } catch {
      // Keep a corrupt legacy document readable as an empty state so it can be repaired.
    }
  }
  const templates = hasNamedTemplateState
    ? stored
    : legacyTemplate ? [legacyTemplate] : [];
  const requested = typeof value?.defaultSlideshowTemplateId === 'string' ? value.defaultSlideshowTemplateId : null;
  const defaultSlideshowTemplateId = templates.some((template) => template.templateId === requested)
    ? requested
    : hasNamedTemplateState
      ? isGlobal ? templates[0]?.templateId ?? null : null
      : templates[0]?.templateId ?? null;
  const selected = templates.find((template) => template.templateId === defaultSlideshowTemplateId);
  const slideshow = selected
    ? Object.fromEntries(Object.entries(selected).filter(([key]) => key !== 'templateId')) as PartnerDefaultSlideshow
    : null;
  return {
    revision: Number.isSafeInteger(value?.revision) && Number(value?.revision) >= 0 ? Number(value?.revision) : 0,
    slideshow: selected ? slideshow : null,
    slideshowTemplates: templates,
    defaultSlideshowTemplateId,
  };
}

export function createParentSlideshowTemplate(
  value: PartnerDefaultSlideshow,
  name: string,
): ParentSlideshowTemplate {
  return { ...value, name, templateId: generateId() };
}

function assertUniqueTemplateName(templates: ParentSlideshowTemplate[], name: string, exceptTemplateId?: string): void {
  const normalized = name.trim().toLowerCase();
  if (templates.some((template) => template.templateId !== exceptTemplateId && template.name.trim().toLowerCase() === normalized)) {
    throw apiBadRequest('A slideshow with this name already exists at this level.');
  }
}

export interface ParentSlideshowMutation {
  kind?: unknown;
  action?: unknown;
  revision?: unknown;
  templateId?: unknown;
  value?: unknown;
  name?: unknown;
  makeDefault?: unknown;
}

/** Apply one validated CRUD/selection operation shared by the global and partner editors. */
export function mutateParentSlideshowTemplates(
  state: ParentSlideshowTemplateState,
  body: ParentSlideshowMutation,
  isGlobal: boolean,
  legacyId: string,
): ParentSlideshowTemplateState {
  if (!Number.isInteger(body.revision) || Number(body.revision) !== state.revision) {
    throw apiError('These slideshow settings changed elsewhere. Reload and try again.', 409);
  }
  const templates = [...state.slideshowTemplates];
  let defaultSlideshowTemplateId = state.defaultSlideshowTemplateId;

  if (body.kind === 'slideshow') {
    // Compatibility with older clients while the new list-first editor rolls out.
    if (body.value === null) {
      if (isGlobal && templates.length > 0) throw apiError('Select another global default before removing this slideshow.', 409);
      defaultSlideshowTemplateId = null;
    } else {
      if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) throw apiBadRequest('value must be an object or null.');
      const cleaned = cleanSlideshowDefault(body.value as Record<string, unknown>);
      const selectedIndex = templates.findIndex((item) => item.templateId === defaultSlideshowTemplateId);
      if (selectedIndex >= 0) templates[selectedIndex] = { ...cleaned, templateId: defaultSlideshowTemplateId! };
      else {
        const created = createParentSlideshowTemplate(cleaned, cleaned.name || legacyId);
        templates.push(created);
        defaultSlideshowTemplateId = created.templateId;
      }
    }
  } else {
    if (!['create', 'update', 'rename', 'delete', 'select'].includes(String(body.action))) throw apiBadRequest('Unsupported slideshow template action.');
    const templateId = typeof body.templateId === 'string' && body.templateId.trim() ? body.templateId : null;
    const index = templateId ? templates.findIndex((item) => item.templateId === templateId) : -1;

    if (body.action === 'create') {
      if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) throw apiBadRequest('A slideshow configuration is required.');
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 120) throw apiBadRequest('Enter a slideshow name of 1 to 120 characters.');
      assertUniqueTemplateName(templates, name);
      const created = createParentSlideshowTemplate(cleanSlideshowDefault({ ...(body.value as Record<string, unknown>), name }), name);
      templates.push(created);
      if (isGlobal && (body.makeDefault === true || !defaultSlideshowTemplateId)) defaultSlideshowTemplateId = created.templateId;
    } else if (body.action === 'select') {
      if (templateId === null) {
        if (isGlobal && templates.length > 0) throw apiBadRequest('A global default must be selected while global slideshow versions exist.');
        defaultSlideshowTemplateId = null;
      } else {
        if (index < 0) throw apiBadRequest('Choose an available slideshow version.');
        defaultSlideshowTemplateId = templateId;
      }
    } else {
      if (index < 0) throw apiBadRequest('The slideshow version no longer exists. Reload the list.');
      if (body.action === 'update') {
        if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) throw apiBadRequest('A slideshow configuration is required.');
        const name = (body.value as Record<string, unknown>).name;
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) throw apiBadRequest('Enter a slideshow name of 1 to 120 characters.');
        assertUniqueTemplateName(templates, name.trim(), templateId!);
        templates[index] = { ...cleanSlideshowDefault(body.value as Record<string, unknown>), templateId: templateId! };
      } else if (body.action === 'rename') {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 120) throw apiBadRequest('Enter a slideshow name of 1 to 120 characters.');
        assertUniqueTemplateName(templates, name, templateId!);
        templates[index] = { ...templates[index], name };
      } else if (body.action === 'delete') {
        if (defaultSlideshowTemplateId === templateId) throw apiError('Select another default or inherited slideshow before deleting this version.', 409);
        templates.splice(index, 1);
      }
    }
  }

  // A global default is mandatory whenever global versions exist. Partners may
  // deliberately inherit by leaving this selection empty.
  if (isGlobal && templates.length > 0 && !templates.some((item) => item.templateId === defaultSlideshowTemplateId)) {
    defaultSlideshowTemplateId = templates[0].templateId;
  }
  const selected = templates.find((item) => item.templateId === defaultSlideshowTemplateId);
  const slideshow = selected
    ? Object.fromEntries(Object.entries(selected).filter(([key]) => key !== 'templateId')) as PartnerDefaultSlideshow
    : null;
  return {
    revision: state.revision + 1,
    slideshowTemplates: templates,
    defaultSlideshowTemplateId,
    slideshow,
  };
}
