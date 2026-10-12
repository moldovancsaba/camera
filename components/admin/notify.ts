import { showGdsNotification } from '@sovereignsquad/gds-theme/client';

/**
 * Visible notices for the admin screens (issue 229). `useGdsToasts()` from `@sovereignsquad/gds-core/client` only writes into the
 * notification provider's state; the list that draws that state, `GdsNotificationCenter`, is mounted nowhere in this app, so a "Saved" or "Delete
 * failed" notice reached nobody (no pixel, and the hidden live region stays empty too). `showGdsNotification` draws through the Mantine
 * notification host that `GdsProvider` already mounts, exactly as the capture page does (`components/capture/notify.ts`), and its
 * notification carries `role="alert"`, so a screen reader announces it.
 *
 * The behaviour is the one the GDS toasts promised: a success closes by itself after about 4 s, an error stays until the user dismisses it
 * (a failed save must not vanish before it is read). Wording and meaning stay with the call site: `{ title, message }` as before, or a plain
 * string for a notice without a heading.
 */
export interface AdminNotice {
  title?: string;
  message: string;
}

/** Same as the GDS toast default for a success. */
export const ADMIN_SUCCESS_AUTO_CLOSE_MS = 4_000;

function show(tone: 'success' | 'error', notice: string | AdminNotice): void {
  const { title, message } = typeof notice === 'string' ? { title: undefined, message: notice } : notice;
  showGdsNotification({
    ...(title ? { title } : {}),
    message,
    tone,
    // An explicit value in both cases: the host's own default would also close an error.
    autoClose: tone === 'error' ? false : ADMIN_SUCCESS_AUTO_CLOSE_MS,
  });
}

export function notifyAdminSuccess(notice: string | AdminNotice): void {
  show('success', notice);
}

export function notifyAdminError(notice: string | AdminNotice): void {
  show('error', notice);
}
