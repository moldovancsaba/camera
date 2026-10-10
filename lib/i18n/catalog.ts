/**
 * The list of default texts the editors show (issue 353, docs/BUILDING_BRICKS.md step 6): every key of the dictionary with its group and its English and Hungarian wording, in
 * the order of the files. The text editors of the three levels (the Dictionary, a partner's texts, an event's texts) are built from it. Pure; unit-tested (catalog.test.ts).
 */

import { en, type MessageKey } from './messages.en';
import { hu } from './messages.hu';

/** What the editor calls each group of keys (the key's first part). A key whose group is not listed is a mistake the test catches. */
export const TEXT_GROUPS: Record<string, string> = {
  welcome: 'Welcome page',
  consent: 'Consent page',
  accept: 'Accept page',
  login: 'Login page',
  social: 'Social login',
  flow: 'Capture flow',
  camera: 'Camera',
  reframe: 'Photo position',
  approval: 'Waiting for approval',
  cta: 'CTA page',
  share: 'Share screen',
  errorPage: 'Error page',
  sharePage: 'Public photo page',
  tryon: 'Try-on',
  profile: 'Profile across events (drafts, not shown yet)',
  email: 'E-mails',
  screen: 'Giant screen',
  tour: 'Guided tour',
  event: 'Event',
  meta: 'Page titles',
  common: 'Common',
  err: 'Error messages',
};

export interface CatalogEntry {
  key: MessageKey;
  group: string;
  groupLabel: string;
  en: string;
  hu: string;
}

export function textCatalog(): CatalogEntry[] {
  return (Object.keys(en) as MessageKey[]).map((key) => {
    const group = key.split('.')[0];
    return { key, group, groupLabel: TEXT_GROUPS[group] ?? group, en: en[key], hu: hu[key] ?? en[key] };
  });
}

/** The groups in the order of the editor, each with its entries. */
export function groupedCatalog(): Array<{ group: string; label: string; entries: CatalogEntry[] }> {
  const order = Object.keys(TEXT_GROUPS);
  const byGroup = new Map<string, CatalogEntry[]>();
  for (const entry of textCatalog()) byGroup.set(entry.group, [...(byGroup.get(entry.group) ?? []), entry]);
  return [...byGroup.entries()]
    .sort(([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
    .map(([group, entries]) => ({ group, label: TEXT_GROUPS[group] ?? group, entries }));
}
