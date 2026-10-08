/**
 * Logos in the libraries (camera#367, docs/LIBRARIES.md): the four scenarios a logo is assigned to on an event, the defaults a partner gives its
 * new events (`Partner.defaultLogos`: a logo of its library with a scenario and an order), and the logo a guest sees in a scenario. Pure and free of
 * server code, so the pages use it too; the scenario ids are the values of `LogoScenario` (lib/db/schemas.ts), and logos.test.ts keeps them equal.
 */

export const LOGO_SCENARIOS = [
  { id: 'slideshow-transition', name: 'Slideshow Transition', description: 'Logo shown during slide transitions with fade in/out. No screen shows it yet.', shownToGuests: false },
  { id: 'onboarding-thankyou', name: 'Onboarding/Thank You Pages', description: 'Logo displayed at top center on custom pages', shownToGuests: true },
  { id: 'loading-slideshow', name: 'Loading Slideshow', description: 'Logo shown while slideshow is loading', shownToGuests: true },
  { id: 'loading-capture', name: 'Loading Capture App', description: 'Logo shown while capture app is loading', shownToGuests: true },
] as const;

export type LogoScenarioId = (typeof LOGO_SCENARIOS)[number]['id'];

const SCENARIO_IDS: readonly string[] = LOGO_SCENARIOS.map((scenario) => scenario.id);

export function isLogoScenario(value: unknown): value is LogoScenarioId {
  return typeof value === 'string' && SCENARIO_IDS.includes(value);
}

/** The scenario a logo uploaded on an event page goes to when the editor does not choose one: the logo on top of the guest pages. */
export const DEFAULT_UPLOAD_SCENARIO: LogoScenarioId = 'onboarding-thankyou';

/** A default of a partner: a logo of its library that every new event gets, in this scenario, with this order. */
export interface LogoDefault {
  logoId: string;
  scenario: LogoScenarioId;
  order: number;
}

const MAX_DEFAULTS = 200;

/** The defaults a partner has (`Partner.defaultLogos`), as stored; a row without a logo id or a known scenario is left out. */
export function logoDefaultsOf(partner: unknown): LogoDefault[] {
  const rows = (partner as { defaultLogos?: unknown } | null | undefined)?.defaultLogos;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row, index) => {
    const value = row as { logoId?: unknown; scenario?: unknown; order?: unknown } | null;
    if (!value || typeof value.logoId !== 'string' || !value.logoId || !isLogoScenario(value.scenario)) return [];
    return [{ logoId: value.logoId, scenario: value.scenario, order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : index }];
  });
}

/**
 * The defaults sent by a page: `[{ logoId, scenario, order? }]`. A missing order is the row's place in the list; the same logo twice in one scenario
 * counts once. Anything else is refused with a plain reason.
 */
export function parseLogoDefaults(value: unknown): { ok: true; rows: LogoDefault[] } | { ok: false; reason: string } {
  if (!Array.isArray(value) || value.length > MAX_DEFAULTS) return { ok: false, reason: `defaultLogos must be a list (at most ${MAX_DEFAULTS}) of { logoId, scenario, order }` };
  const rows: LogoDefault[] = [];
  const seen = new Set<string>();
  for (const [index, row] of value.entries()) {
    const item = row as { logoId?: unknown; scenario?: unknown; order?: unknown } | null;
    if (!item || typeof item !== 'object' || typeof item.logoId !== 'string' || !item.logoId || item.logoId.length > 80) {
      return { ok: false, reason: 'Every default logo needs a logoId' };
    }
    if (!isLogoScenario(item.scenario)) return { ok: false, reason: `scenario must be one of: ${SCENARIO_IDS.join(', ')}` };
    if (item.order !== undefined && !(typeof item.order === 'number' && Number.isInteger(item.order) && item.order >= 0)) {
      return { ok: false, reason: 'order must be a whole number from 0' };
    }
    const key = `${item.logoId} ${item.scenario}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ logoId: item.logoId, scenario: item.scenario, order: item.order ?? index });
  }
  return { ok: true, rows };
}

export function sameLogoDefaults(a: readonly LogoDefault[], b: readonly LogoDefault[]): boolean {
  return a.length === b.length && a.every((row, i) => row.logoId === b[i].logoId && row.scenario === b[i].scenario && row.order === b[i].order);
}

/**
 * The rows of one scenario in the order the guest pages use: by `order`, the event's own order for equal ones (`GET /api/events/<id>/logos` sorts
 * them so). The logo a guest sees is the first active one (`shownLogo`): the capture page and the slideshow take that one, there is no random pick.
 */
export function inGuestOrder<T extends { order?: unknown }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const difference = Number(a.order) - Number(b.order);
    return Number.isNaN(difference) ? 0 : difference;
  });
}

export function shownLogo<T extends { order?: unknown; isActive?: unknown }>(rows: readonly T[]): T | null {
  return inGuestOrder(rows).find((row) => Boolean(row.isActive)) ?? null;
}
