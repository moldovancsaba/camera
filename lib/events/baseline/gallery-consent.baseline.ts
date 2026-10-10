/*
 * FROZEN COPY of the logic as it was before the checkbox settings (issue 558), kept only so that tests can run the same inputs through the old and the new code
 * (lib/events/consent-settings.baseline.test.ts). Do not change it and do not import it from application code.
 */
/**
 * Permission to show a photo in the public event gallery (issue 554, owner answer 283: "this is service and market specific, make it an option in the settings and add it to the consent page settings").
 *
 * Some services and markets need the user's own, separate permission before a photo can be shown on a public wall or gallery (the pledge wall, savetheworld's galleries); for others the terms the user accepts
 * are enough, as they always were. So it is a setting, chosen where the brick model puts every choice: the **partner** has a default (ask or not), an **event** follows it or chooses for itself, nothing is copied
 * down, and the standard is **not to ask** (the terms cover it), so no event changes until somebody chooses.
 *
 * When an event asks, the capture page shows one optional checkbox, not ticked, on the step where the photo is saved (the words are the Dictionary texts `share.publicGalleryConsent` and
 * `share.publicGalleryConsentHelp`, editable at every level). Only a ticked box makes the photo eligible for the wall (`shareOptIn`), and the ticked box is kept as versioned evidence
 * (`Submission.publicGalleryConsent = { version, grantedAt }`). The server decides from the event's own setting, never from what the page says it asked, so an old page that does not know the setting cannot put
 * a photo of an asking event on the wall. Pure; unit-tested (gallery-consent.test.ts).
 */

export const GALLERY_CONSENT_VERSION = 1 as const;

export interface GalleryConsentEvidence {
  version: typeof GALLERY_CONSENT_VERSION;
  grantedAt: string;
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** Whether an event asks for the permission: its own setting, else its partner's, else not (the terms cover it). */
export function effectiveGalleryConsent(event: { galleryConsent?: unknown } | null | undefined, partner?: { galleryConsent?: unknown } | null): boolean {
  if (isBoolean(event?.galleryConsent)) return event.galleryConsent;
  if (isBoolean(partner?.galleryConsent)) return partner.galleryConsent;
  return false;
}

export type ParsedGalleryConsent = { ok: true; value: boolean | null } | { ok: false; error: string };

/** A request value: true or false, or an empty value / null for "no choice at this level" (an event then follows its partner); anything else is refused. */
export function parseGalleryConsent(input: unknown): ParsedGalleryConsent {
  if (input === null || input === '') return { ok: true, value: null };
  if (isBoolean(input)) return { ok: true, value: input };
  return { ok: false, error: 'galleryConsent must be true or false' };
}

/**
 * What a saved photo gets from the request (`shareOptIn`, `publicGalleryConsentVersion`) and the event's setting. A ticked box (`shareOptIn === true` with the version of the sentence) leaves evidence.
 * When the event asks, only a ticked box makes the photo eligible; when it does not, `shareOptIn` is what the page sent, as it always was.
 */
export function galleryChoice(
  asked: boolean,
  request: { shareOptIn?: unknown; publicGalleryConsentVersion?: unknown },
  now: string,
): { shareOptIn: boolean; consent: GalleryConsentEvidence | null } {
  const ticked = request.shareOptIn === true && request.publicGalleryConsentVersion === GALLERY_CONSENT_VERSION;
  const consent = ticked ? { version: GALLERY_CONSENT_VERSION, grantedAt: now } : null;
  return { shareOptIn: asked ? ticked : request.shareOptIn === true, consent };
}
