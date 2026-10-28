import 'server-only';
import { headers } from 'next/headers';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { loadCaptureEvent } from '@/lib/events/capture-event';
import { findShareSubmission } from '@/lib/submissions/share-lookup';
import { DEFAULT_UI_LANGUAGE, type UiLanguage } from '@/lib/i18n';
import { deviceUiLanguage, parseAcceptLanguage } from '@/lib/i18n/locale-negotiation';
import { loadEventTexts } from '@/lib/i18n/overrides';
import { initialUiLanguagesForPath, type InitialUiLanguages } from '@/lib/i18n/document-language';

function eventLookupClauses(values: unknown[]): Record<string, unknown>[] {
  return values.flatMap((value) => {
    if (typeof value !== 'string' && !(value instanceof ObjectId)) return [];
    const key = String(value).trim();
    if (!key) return [];
    return [{ eventId: key }, ...(ObjectId.isValid(key) ? [{ _id: new ObjectId(key) }] : [])];
  });
}

async function configuredLanguageForPath(pathname: string): Promise<UiLanguage | null> {
  const capture = /^\/capture\/([^/]+)/.exec(pathname);
  const share = /^\/share\/([^/]+)/.exec(pathname);
  if (!capture && !share) return null;

  const db = await connectToDatabase();
  let event: Record<string, unknown> | null = null;
  if (capture) {
    event = await loadCaptureEvent(capture[1]);
  } else if (share) {
    const submission = await findShareSubmission(db, share[1]);
    const document = submission?.doc;
    const eventIds = [
      ...(Array.isArray(document?.eventIds) ? document.eventIds : []),
      document?.eventId,
    ];
    const clauses = eventLookupClauses(eventIds);
    if (clauses.length) event = await db.collection(COLLECTIONS.EVENTS).findOne({ $or: clauses });
  }
  if (!event) return null;
  return (await loadEventTexts(db, event)).language;
}

/** Resolve the document language and client interface locale before the root layout renders. */
export async function initialUiLanguages(): Promise<InitialUiLanguages> {
  try {
    const requestHeaders = await headers();
    const pathname = requestHeaders.get('x-camera-pathname') ?? '';
    const preferences = parseAcceptLanguage(requestHeaders.get('accept-language'));
    const deviceLanguage = deviceUiLanguage(preferences);
    const configuredFallback = !deviceLanguage && /^\/(capture|share)\//.test(pathname)
      ? await configuredLanguageForPath(pathname)
      : null;
    return initialUiLanguagesForPath(pathname, deviceLanguage, configuredFallback);
  } catch {
    return { documentLanguage: DEFAULT_UI_LANGUAGE, interfaceLanguage: DEFAULT_UI_LANGUAGE };
  }
}

/** Compatibility helper for server metadata that needs the language of the whole document. */
export async function initialDocumentUiLanguage(): Promise<UiLanguage> {
  return (await initialUiLanguages()).documentLanguage;
}
