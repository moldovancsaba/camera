import 'server-only';

export const DEFAULT_MODERATION_BASE_URL = 'https://chatbotapi.haho.ai/v1';

export interface ModerationConfiguration {
  baseUrl: string;
  apiKey: string;
}

/** Read only server-side configuration; callers may expose the boolean, never this object. */
export function moderationConfiguration(env: Record<string, string | undefined> = process.env): ModerationConfiguration | null {
  const apiKey = env.CAMERA_MODERATION_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (env.CAMERA_MODERATION_BASE_URL?.trim() || DEFAULT_MODERATION_BASE_URL).replace(/\/+$/, '');
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'chatbotapi.haho.ai' || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/v1') return null;
  } catch {
    return null;
  }
  return { baseUrl, apiKey };
}
