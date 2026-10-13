import { NextResponse } from 'next/server';
import { parseCapturePopupId } from './capture-return';

/** A popup sends a one-time signal to the exact capture attempt after its session cookie has been set. */
export function capturePopupResponse(popupId: unknown, status: 'completed' | 'failed'): NextResponse {
  const id = parseCapturePopupId(popupId);
  if (!id) return new NextResponse('Invalid capture login', { status: 400 });

  const title = status === 'completed' ? 'Sign-in complete' : 'Sign-in could not be completed';
  const channel = JSON.stringify(`camera-social-login:${id}`).replace(/</g, '\\u003c');
  const payload = JSON.stringify({ type: 'camera-social-login', popupId: id, status }).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body><p id="status">${title}. ${status === 'completed' ? 'Return to the selfie tab; it will continue automatically.' : 'Return to the selfie tab and try again.'}</p><script>const channel=new BroadcastChannel(${channel});channel.postMessage(${payload});channel.close()</script></body></html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
