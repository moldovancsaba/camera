/**
 * The English texts of the user journey (camera#352): one flat dictionary, the default of every text a user sees. Hungarian is in messages.hu.ts, which must
 * have every key of this file (the type checks it). A text an editor wrote for an event still wins over the dictionary. `{name}` marks a value filled in
 * when the text is used.
 */
export const en = {
  'event.loading': 'Loading event...',
  'event.notFound.title': 'Event Not Found',
  'event.notFound.text': 'This event could not be loaded.',
} as const;

export type MessageKey = keyof typeof en;
