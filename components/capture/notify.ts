import { showGdsNotification } from '@sovereignsquad/gds-theme/client';
import { notifications } from '@mantine/notifications';

/**
 * In-page notices for the capture flow, replacing the browser's `alert()` (camera#222): a native
 * dialog blocks the page, shows the site's address as its title and looks like a web page, not an
 * app. Errors stay longer than confirmations so they can be read. Event-configured messages can
 * contain line breaks; a notice is one paragraph. Only one notice is shown at a time, so a retry never
 * sits under a stale error. During the camera steps they appear at the top (app/globals.css), clear of
 * the action buttons.
 */
export function clearCaptureNotices(): void {
  notifications.clean();
}

export function notifyCapture(tone: 'success' | 'warning' | 'error', message: string): void {
  clearCaptureNotices();
  showGdsNotification({
    message: message.replace(/\s*\n+\s*/g, ' ').trim(),
    tone,
    autoClose: tone === 'error' ? 10_000 : 5_000,
  });
}
