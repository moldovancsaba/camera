/**
 * What a change of the defaults of a partner did to its events (decision 112: the defaults follow into every event that has not edited its own list), as the
 * sentence a partner library page shows after the change; null when no event changed. The count comes from `updateChildEventsFromPartner`.
 */

import type { LibraryKind } from './kinds';

export interface DefaultsCascade {
  framesUpdated?: number;
  logosUpdated?: number;
}

export function cascadeText(cascade: DefaultsCascade | null | undefined, kind: LibraryKind): string | null {
  const count = kind === 'frames' ? cascade?.framesUpdated : kind === 'logos' ? cascade?.logosUpdated : 0;
  if (!count) return null;
  return `The defaults changed on ${count} event${count === 1 ? '' : 's'} that follow${count === 1 ? 's' : ''} the defaults of this partner. An event that edited its own list does not follow them.`;
}
